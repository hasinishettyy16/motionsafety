"""
survey_engine.py - Core Reusable Survey Engine for Stage 6.

Key Capabilities:
1. Strict 6x4 Grid Mapping (A1-F4) with metric centers & obstacle exclusion.
2. Manual Position Confirmation (Explicit operator confirmation; immutable during batch).
3. Batch Lifecycle Management (Unique survey_id, batch_id, NO_OBSTACLE vs FOIL_OBSTACLE).
4. Packet Recording Interface (reusable record_packet with duplicate sequence rejection,
   validation, and strict non-zero preservation of missing RF metrics).
5. Append-Safe 21-Column CSV Storage.
6. Cell RF Statistical Summaries (Packet count, Median RSSI/SNR, Missing count, PDR, Status).
7. Strict separation of NO_OBSTACLE and FOIL_OBSTACLE datasets.
"""

import os
import csv
import uuid
import datetime
import statistics
from typing import Dict, List, Set, Optional, Any, Tuple

from grid_mapping import (
    ARENA_COLS,
    ARENA_ROWS,
    cell_id_to_coords,
    coords_to_cell_id,
    is_valid_cell_id,
    is_obstacle,
    get_all_cells
)

# Valid Survey Conditions
CONDITION_NO_OBSTACLE: str = "NO_OBSTACLE"
CONDITION_FOIL_OBSTACLE: str = "FOIL_OBSTACLE"
VALID_CONDITIONS: frozenset = frozenset({CONDITION_NO_OBSTACLE, CONDITION_FOIL_OBSTACLE})

# Data Sources
DATA_SOURCE_LIVE: str = "LIVE"
DATA_SOURCE_FIXTURE: str = "TEST_FIXTURE"
VALID_DATA_SOURCES: frozenset = frozenset({DATA_SOURCE_LIVE, DATA_SOURCE_FIXTURE})

# Position Methods
POSITION_METHOD_MANUAL: str = "MANUAL_CONFIRMED"
POSITION_METHOD_UNKNOWN: str = "UNKNOWN"

# Cell Operational Statuses
STATUS_UNMEASURED: str = "UNMEASURED"
STATUS_MEASURED: str = "MEASURED"
STATUS_BLOCKED: str = "BLOCKED"
STATUS_NO_RECEPTION: str = "NO_RECEPTION"
STATUS_INCOMPLETE: str = "INCOMPLETE"

# Exact 21 Required CSV Headers
CSV_HEADERS: List[str] = [
    "survey_id",
    "batch_id",
    "cell_id",
    "x",
    "y",
    "obstacle_condition",
    "antenna_configuration",
    "sequence_number",
    "received_at",
    "rssi_dbm",
    "snr_db",
    "left_encoder_rate",
    "right_encoder_rate",
    "ax",
    "ay",
    "az",
    "gz",
    "left_pwm",
    "right_pwm",
    "position_method",
    "data_source"
]


def _get_utc_timestamp_iso() -> str:
    """Return current timestamp in ISO-8601 with millisecond precision."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class SurveyBatch:
    """Represents a discrete radio survey batch conducted at a single confirmed cell."""

    def __init__(
        self,
        survey_id: str,
        batch_id: str,
        cell_id: str,
        obstacle_condition: str,
        data_source: str = DATA_SOURCE_FIXTURE,
        antenna_configuration: str = "DEFAULT"
    ):
        if not survey_id or not isinstance(survey_id, str):
            raise ValueError("survey_id must be a non-empty string")
        if not batch_id or not isinstance(batch_id, str):
            raise ValueError("batch_id must be a non-empty string")
        if not is_valid_cell_id(cell_id):
            raise ValueError(f"Invalid cell_id: '{cell_id}'")
        if is_obstacle(cell_id):
            raise ValueError(f"Cannot create batch for obstacle cell '{cell_id}'")
        if obstacle_condition not in VALID_CONDITIONS:
            raise ValueError(f"Invalid obstacle_condition '{obstacle_condition}'. Must be {VALID_CONDITIONS}")
        if data_source not in VALID_DATA_SOURCES:
            raise ValueError(f"Invalid data_source '{data_source}'. Must be {VALID_DATA_SOURCES}")

        self.survey_id: str = survey_id
        self.batch_id: str = batch_id
        # Cell is immutable once batch is constructed
        self._cell_id: str = cell_id.strip().upper()
        self._coords: Tuple[int, int] = cell_id_to_coords(self._cell_id)
        self.obstacle_condition: str = obstacle_condition
        self.data_source: str = data_source
        self.antenna_configuration: str = antenna_configuration
        self.position_method: str = POSITION_METHOD_MANUAL

        self.is_active: bool = True
        self.start_time: str = _get_utc_timestamp_iso()
        self.end_time: Optional[str] = None

        self.start_sequence_number: Optional[int] = None
        self.end_sequence_number: Optional[int] = None

        self.packets: List[Dict[str, Any]] = []
        self.sequence_numbers: Set[int] = set()

    @property
    def cell_id(self) -> str:
        """The cell ID is locked for the duration of this batch."""
        return self._cell_id

    @property
    def coords(self) -> Tuple[int, int]:
        return self._coords

    def close(self, end_sequence: Optional[int] = None) -> None:
        """Finalize the batch."""
        self.is_active = False
        self.end_time = _get_utc_timestamp_iso()
        if end_sequence is not None:
            self.end_sequence_number = end_sequence
        elif self.packets:
            self.end_sequence_number = max(p["sequence_number"] for p in self.packets)


class SurveyEngine:
    """
    Core Survey Engine managing operator localization, survey batches,
    packet recording, CSV persistence, and statistical RF summaries.
    """

    def __init__(self, default_csv_path: Optional[str] = None):
        # Operator position tracker
        self._selected_cell_id: Optional[str] = None
        self._confirmed_cell_id: Optional[str] = None

        # Active state
        self._active_batch: Optional[SurveyBatch] = None
        self._batches: Dict[str, SurveyBatch] = {}

        # Sequences recorded per survey: survey_id -> set of sequence numbers
        self._recorded_sequences_by_survey: Dict[str, Set[int]] = {}

        # In-memory storage of all recorded records: survey_id -> condition -> cell_id -> list of records
        self._records: Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]] = {}

        self.default_csv_path: Optional[str] = default_csv_path

    # --- 1. Operator Manual Position Tracking ---

    @property
    def selected_cell_id(self) -> Optional[str]:
        return self._selected_cell_id

    @property
    def confirmed_cell_id(self) -> Optional[str]:
        return self._confirmed_cell_id

    @property
    def position_method(self) -> str:
        return POSITION_METHOD_MANUAL if self._confirmed_cell_id else POSITION_METHOD_UNKNOWN

    def select_cell(self, cell_id: str) -> None:
        """
        Operator selects a cell candidate.
        Position remains UNCONFIRMED until explicitly confirmed.
        Does not change any active batch's cell.
        """
        if not is_valid_cell_id(cell_id):
            raise ValueError(f"Cannot select invalid cell ID: '{cell_id}'")
        self._selected_cell_id = cell_id.strip().upper()

    def confirm_cell_position(self) -> str:
        """
        Explicitly confirm the selected cell as the robot's current manual position.
        Position is UNKNOWN until this method is called.
        """
        if not self._selected_cell_id:
            raise ValueError("No cell has been selected to confirm.")
        if is_obstacle(self._selected_cell_id):
            raise ValueError(f"Cannot confirm position at obstacle cell '{self._selected_cell_id}'.")
        
        self._confirmed_cell_id = self._selected_cell_id
        return self._confirmed_cell_id

    def clear_confirmed_position(self) -> None:
        """Clear confirmed position. Prohibited while a batch is active."""
        if self._active_batch and self._active_batch.is_active:
            raise RuntimeError("Cannot clear confirmed position while a survey batch is active.")
        self._confirmed_cell_id = None

    # --- 2. Batch Lifecycle ---

    @property
    def active_batch(self) -> Optional[SurveyBatch]:
        return self._active_batch

    def start_batch(
        self,
        survey_id: str,
        obstacle_condition: str,
        data_source: str = DATA_SOURCE_FIXTURE,
        batch_id: Optional[str] = None,
        antenna_configuration: str = "DEFAULT",
        expected_start_sequence: Optional[int] = None
    ) -> SurveyBatch:
        """
        Start a new survey batch.
        Locks the current confirmed cell.
        Selecting another cell while a batch is running will not affect the batch's cell.
        """
        if self._active_batch and self._active_batch.is_active:
            raise RuntimeError(
                f"Batch '{self._active_batch.batch_id}' is already active. Stop it before starting a new batch."
            )
        if not self._confirmed_cell_id:
            raise ValueError("Cannot start batch: operator position is UNCONFIRMED. Call confirm_cell_position() first.")
        
        final_batch_id = batch_id or f"batch_{uuid.uuid4().hex[:8]}"
        
        batch = SurveyBatch(
            survey_id=survey_id,
            batch_id=final_batch_id,
            cell_id=self._confirmed_cell_id,
            obstacle_condition=obstacle_condition,
            data_source=data_source,
            antenna_configuration=antenna_configuration
        )
        if expected_start_sequence is not None:
            batch.start_sequence_number = expected_start_sequence

        self._active_batch = batch
        self._batches[final_batch_id] = batch
        
        # Initialize survey sequence registry if needed
        if survey_id not in self._recorded_sequences_by_survey:
            self._recorded_sequences_by_survey[survey_id] = set()

        return batch

    def stop_batch(self, batch_id: Optional[str] = None, expected_end_sequence: Optional[int] = None) -> SurveyBatch:
        """Stop the currently active batch."""
        if not self._active_batch or not self._active_batch.is_active:
            raise RuntimeError("No active batch to stop.")
        
        if batch_id and batch_id != self._active_batch.batch_id:
            raise ValueError(f"Requested stop for '{batch_id}' but active batch is '{self._active_batch.batch_id}'.")
        
        batch = self._active_batch
        batch.close(end_sequence=expected_end_sequence)
        self._active_batch = None
        return batch

    # --- 3. Packet Recording Interface ---

    def record_packet(
        self,
        packet: Dict[str, Any],
        survey_id: str,
        batch_id: str,
        cell_id: str,
        obstacle_condition: str,
        received_at: Optional[str] = None,
        csv_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Core reusable packet recording function.
        
        Validates packet, rejects duplicates, strictly preserves missing RSSI/SNR as None,
        enforces active batch and cell immutability, and appends to storage.
        """
        # 1. Active batch checks
        if not self._active_batch or not self._active_batch.is_active:
            raise RuntimeError("Packets can only be recorded while a batch is active.")
        
        if self._active_batch.batch_id != batch_id:
            raise ValueError(f"Mismatched batch_id: expected active '{self._active_batch.batch_id}', got '{batch_id}'")
        
        if self._active_batch.survey_id != survey_id:
            raise ValueError(f"Mismatched survey_id: active batch belongs to '{self._active_batch.survey_id}', got '{survey_id}'")

        # 2. Immutable cell check (batch cell cannot be modified)
        normalized_cell = cell_id.strip().upper()
        if self._active_batch.cell_id != normalized_cell:
            raise ValueError(
                f"Batch cell mismatch: active batch is locked to '{self._active_batch.cell_id}', packet specified '{cell_id}'"
            )

        # 3. Obstacle condition match
        if self._active_batch.obstacle_condition != obstacle_condition:
            raise ValueError(
                f"Obstacle condition mismatch: batch is '{self._active_batch.obstacle_condition}', packet specified '{obstacle_condition}'"
            )

        # 4. Sequence number validation & duplicate rejection within the survey
        if not isinstance(packet, dict):
            raise ValueError(f"Packet must be a dict, got {type(packet).__name__}")
        
        raw_seq = packet.get("sequence_number")
        if raw_seq is None or not isinstance(raw_seq, int) or raw_seq < 0:
            raise ValueError(f"Invalid sequence_number '{raw_seq}'. Must be a non-negative integer.")

        seen_set = self._recorded_sequences_by_survey[survey_id]
        if raw_seq in seen_set:
            raise ValueError(f"Duplicate sequence_number {raw_seq} rejected for survey '{survey_id}'.")
        
        # 5. Safe handling of RF metrics: NEVER replace missing RSSI or SNR with 0
        raw_rssi = packet.get("rssi_dbm")
        if raw_rssi is not None and str(raw_rssi).strip() != "":
            try:
                rssi_dbm: Optional[float] = float(raw_rssi)
            except (ValueError, TypeError):
                raise ValueError(f"Invalid non-numeric rssi_dbm: '{raw_rssi}'")
        else:
            rssi_dbm = None  # Strictly None, never 0

        raw_snr = packet.get("snr_db")
        if raw_snr is not None and str(raw_snr).strip() != "":
            try:
                snr_db: Optional[float] = float(raw_snr)
            except (ValueError, TypeError):
                raise ValueError(f"Invalid non-numeric snr_db: '{raw_snr}'")
        else:
            snr_db = None  # Strictly None, never 0

        # 6. Optional telemetry fields
        def _parse_opt_float(val: Any) -> Optional[float]:
            if val is None or str(val).strip() == "":
                return None
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        def _parse_opt_int(val: Any) -> Optional[int]:
            if val is None or str(val).strip() == "":
                return None
            try:
                return int(val)
            except (ValueError, TypeError):
                return None

        x, y = self._active_batch.coords
        rec_time = received_at or _get_utc_timestamp_iso()

        record: Dict[str, Any] = {
            "survey_id": survey_id,
            "batch_id": batch_id,
            "cell_id": self._active_batch.cell_id,
            "x": x,
            "y": y,
            "obstacle_condition": obstacle_condition,
            "antenna_configuration": packet.get("antenna_configuration") or self._active_batch.antenna_configuration,
            "sequence_number": raw_seq,
            "received_at": rec_time,
            "rssi_dbm": rssi_dbm,
            "snr_db": snr_db,
            "left_encoder_rate": _parse_opt_float(packet.get("left_encoder_rate")),
            "right_encoder_rate": _parse_opt_float(packet.get("right_encoder_rate")),
            "ax": _parse_opt_float(packet.get("ax")),
            "ay": _parse_opt_float(packet.get("ay")),
            "az": _parse_opt_float(packet.get("az")),
            "gz": _parse_opt_float(packet.get("gz")),
            "left_pwm": _parse_opt_int(packet.get("left_pwm")),
            "right_pwm": _parse_opt_int(packet.get("right_pwm")),
            "position_method": POSITION_METHOD_MANUAL,
            "data_source": self._active_batch.data_source
        }

        # Update tracking
        seen_set.add(raw_seq)
        self._active_batch.packets.append(record)
        self._active_batch.sequence_numbers.add(raw_seq)

        if self._active_batch.start_sequence_number is None or raw_seq < self._active_batch.start_sequence_number:
            self._active_batch.start_sequence_number = raw_seq
        if self._active_batch.end_sequence_number is None or raw_seq > self._active_batch.end_sequence_number:
            self._active_batch.end_sequence_number = raw_seq

        # Store in organized memory cache
        cond_map = self._records.setdefault(survey_id, {}).setdefault(obstacle_condition, {})
        cond_map.setdefault(self._active_batch.cell_id, []).append(record)

        # Append to CSV if target provided
        target_csv = csv_path or self.default_csv_path
        if target_csv:
            self.append_record_to_csv(record, target_csv)

        return record

    # --- 4. Append-Safe CSV Persistence ---

    @staticmethod
    def append_record_to_csv(record: Dict[str, Any], filepath: str) -> None:
        """
        Safely append a single survey record to CSV.
        Writes header if file does not exist or is empty.
        Ensures missing fields are formatted as empty strings, never '0'.
        """
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        file_exists = os.path.exists(filepath) and os.path.getsize(filepath) > 0

        with open(filepath, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_HEADERS, extrasaction="ignore")
            if not file_exists:
                writer.writeheader()
            
            # Format row: None -> ""
            row = {}
            for col in CSV_HEADERS:
                val = record.get(col)
                row[col] = "" if val is None else val
            
            writer.writerow(row)
            f.flush()

    @staticmethod
    def load_records_from_csv(filepath: str) -> List[Dict[str, Any]]:
        """
        Read survey records from CSV.
        Properly casts types and ensures empty cells are parsed as None (never 0).
        """
        if not os.path.exists(filepath):
            return []
        
        records = []
        with open(filepath, mode="r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                def _to_float(v: str) -> Optional[float]:
                    return float(v) if v and v.strip() != "" else None

                def _to_int(v: str) -> Optional[int]:
                    return int(v) if v and v.strip() != "" else None

                parsed = {
                    "survey_id": row.get("survey_id", ""),
                    "batch_id": row.get("batch_id", ""),
                    "cell_id": row.get("cell_id", ""),
                    "x": int(row["x"]) if row.get("x") else 0,
                    "y": int(row["y"]) if row.get("y") else 0,
                    "obstacle_condition": row.get("obstacle_condition", ""),
                    "antenna_configuration": row.get("antenna_configuration", ""),
                    "sequence_number": int(row["sequence_number"]) if row.get("sequence_number") else 0,
                    "received_at": row.get("received_at", ""),
                    "rssi_dbm": _to_float(row.get("rssi_dbm")),
                    "snr_db": _to_float(row.get("snr_db")),
                    "left_encoder_rate": _to_float(row.get("left_encoder_rate")),
                    "right_encoder_rate": _to_float(row.get("right_encoder_rate")),
                    "ax": _to_float(row.get("ax")),
                    "ay": _to_float(row.get("ay")),
                    "az": _to_float(row.get("az")),
                    "gz": _to_float(row.get("gz")),
                    "left_pwm": _to_int(row.get("left_pwm")),
                    "right_pwm": _to_int(row.get("right_pwm")),
                    "position_method": row.get("position_method", ""),
                    "data_source": row.get("data_source", "")
                }
                records.append(parsed)
        return records

    # --- 5. Cell Statistics and Quality Summaries ---

    def get_cell_records(self, survey_id: str, obstacle_condition: str, cell_id: str) -> List[Dict[str, Any]]:
        """Retrieve all recorded packets for a specific cell and condition."""
        norm_cell = cell_id.strip().upper()
        return self._records.get(survey_id, {}).get(obstacle_condition, {}).get(norm_cell, [])

    def calculate_cell_summary(
        self,
        survey_id: str,
        obstacle_condition: str,
        cell_id: str,
        expected_total_packets: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Calculate metrics for a grid cell:
        - Packet count
        - Median RSSI
        - Median SNR
        - Missing packet count (only if boundaries are reliable)
        - PDR (only if valid denominator)
        - Status: UNMEASURED, MEASURED, BLOCKED, NO_RECEPTION, INCOMPLETE
        """
        norm_cell = cell_id.strip().upper()
        x, y = cell_id_to_coords(norm_cell)
        is_wall = is_obstacle(norm_cell)

        if is_wall:
            return {
                "cell_id": norm_cell,
                "x": x,
                "y": y,
                "obstacle_condition": obstacle_condition,
                "packet_count": 0,
                "median_rssi_dbm": None,
                "median_snr_db": None,
                "expected_packets": 0,
                "missing_packets": 0,
                "pdr_percent": None,
                "status": STATUS_BLOCKED
            }

        records = self.get_cell_records(survey_id, obstacle_condition, norm_cell)
        packet_count = len(records)

        # Extract non-null RF values
        valid_rssi = [r["rssi_dbm"] for r in records if r["rssi_dbm"] is not None]
        valid_snr = [r["snr_db"] for r in records if r["snr_db"] is not None]

        median_rssi = round(statistics.median(valid_rssi), 2) if valid_rssi else None
        median_snr = round(statistics.median(valid_snr), 2) if valid_snr else None

        # Determine expected packets from reliable sequence boundaries or explicit parameter
        expected_count: Optional[int] = None
        if expected_total_packets is not None and expected_total_packets > 0:
            expected_count = expected_total_packets
        elif records:
            seqs = [r["sequence_number"] for r in records]
            if len(seqs) >= 1:
                # Continuous sequence span
                expected_count = max(seqs) - min(seqs) + 1

        missing_count: Optional[int] = None
        pdr_percent: Optional[float] = None

        if expected_count is not None and expected_count > 0:
            missing_count = max(0, expected_count - packet_count)
            pdr_percent = round((packet_count / expected_count) * 100.0, 1)

        # Compute Operational Status
        if packet_count == 0:
            if expected_count is not None and expected_count > 0:
                status = STATUS_NO_RECEPTION
            else:
                status = STATUS_UNMEASURED
        else:
            if pdr_percent is not None and pdr_percent < 80.0:
                status = STATUS_INCOMPLETE
            else:
                status = STATUS_MEASURED

        return {
            "cell_id": norm_cell,
            "x": x,
            "y": y,
            "obstacle_condition": obstacle_condition,
            "packet_count": packet_count,
            "median_rssi_dbm": median_rssi,
            "median_snr_db": median_snr,
            "expected_packets": expected_count,
            "missing_packets": missing_count,
            "pdr_percent": pdr_percent,
            "status": status
        }

    def get_survey_grid_summary(self, survey_id: str, obstacle_condition: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate complete 24-cell summary map for a single condition.
        Strictly preserves separation of NO_OBSTACLE and FOIL_OBSTACLE datasets.
        """
        if obstacle_condition not in VALID_CONDITIONS:
            raise ValueError(f"Invalid condition '{obstacle_condition}'")
        
        summary_grid = {}
        for cell_meta in get_all_cells():
            cid = cell_meta["cell_id"]
            summary_grid[cid] = self.calculate_cell_summary(survey_id, obstacle_condition, cid)
        return summary_grid
