"""
test_survey_engine.py - Comprehensive Automated Test Suite for Stage 6 Survey Engine.

MARKER: TEST_FIXTURE
All tests utilize synthetic fixture packets. No real hardware data is used or claimed.
"""

import os
import shutil
import tempfile
import unittest

from grid_mapping import (
    ARENA_COLS,
    ARENA_ROWS,
    cell_id_to_coords,
    coords_to_cell_id,
    cell_center_cm,
    cell_id_center_cm,
    is_valid_cell_id,
    is_obstacle,
    get_all_cells
)

from survey_engine import (
    SurveyEngine,
    SurveyBatch,
    CONDITION_NO_OBSTACLE,
    CONDITION_FOIL_OBSTACLE,
    DATA_SOURCE_FIXTURE,
    POSITION_METHOD_MANUAL,
    POSITION_METHOD_UNKNOWN,
    STATUS_UNMEASURED,
    STATUS_MEASURED,
    STATUS_BLOCKED,
    STATUS_INCOMPLETE,
    CSV_HEADERS
)

from test_fixtures import create_synthetic_packet, generate_packet_burst


class TestGridMapping(unittest.TestCase):
    """Test Requirement 1: Grid mapping and boundary conversions."""

    def test_01_a1_and_f4_coordinate_conversions(self):
        """Test A1 and F4 coordinate conversions and physical centimeter centers."""
        # A1 = (0, 0)
        coords_a1 = cell_id_to_coords("A1")
        self.assertEqual(coords_a1, (0, 0), "A1 must map to (0, 0)")
        self.assertEqual(coords_to_cell_id(0, 0), "A1")
        cx_a1, cy_a1 = cell_center_cm(0, 0)
        # center_x = (0 + 0.5) * 20 = 10.0 cm, center_y = 10.0 cm
        self.assertEqual((cx_a1, cy_a1), (10.0, 10.0), "A1 center must be (10.0cm, 10.0cm)")
        self.assertEqual(cell_id_center_cm("A1"), (10.0, 10.0))

        # F4 = (5, 3)
        coords_f4 = cell_id_to_coords("F4")
        self.assertEqual(coords_f4, (5, 3), "F4 must map to (5, 3)")
        self.assertEqual(coords_to_cell_id(5, 3), "F4")
        cx_f4, cy_f4 = cell_center_cm(5, 3)
        # center_x = (5 + 0.5) * 20 = 110.0 cm, center_y = (3 + 0.5) * 20 = 70.0 cm
        self.assertEqual((cx_f4, cy_f4), (110.0, 70.0), "F4 center must be (110.0cm, 70.0cm)")
        self.assertEqual(cell_id_center_cm("F4"), (110.0, 70.0))

    def test_02_all_24_valid_cell_ids(self):
        """Verify all 24 valid cell IDs from A1 to F4 map correctly in round-trip."""
        all_cells = get_all_cells()
        self.assertEqual(len(all_cells), 24, "Arena must contain exactly 24 cells")

        col_letters = ["A", "B", "C", "D", "E", "F"]
        row_numbers = ["1", "2", "3", "4"]

        expected_ids = set()
        for c in col_letters:
            for r in row_numbers:
                expected_ids.add(f"{c}{r}")

        found_ids = set()
        for cell in all_cells:
            cid = cell["cell_id"]
            found_ids.add(cid)
            x, y = cell["x"], cell["y"]
            # Round-trip verification
            self.assertEqual(cell_id_to_coords(cid), (x, y))
            self.assertEqual(coords_to_cell_id(x, y), cid)
            # Physical boundaries check
            self.assertTrue(0 <= x < ARENA_COLS)
            self.assertTrue(0 <= y < ARENA_ROWS)
            self.assertEqual(cell["center_x_cm"], round((x + 0.5) * 20.0, 2))
            self.assertEqual(cell["center_y_cm"], round((y + 0.5) * 20.0, 2))

        self.assertEqual(found_ids, expected_ids, "All 24 cell IDs must match A1..F4 grid")

        # Explicit Row-Major Visual & Physical Alignment Verification:
        # Row 1: A1 | B1 | C1 | D1 | E1 | F1
        # Row 2: A2 | B2 | C2 | D2 | E2 | F2
        # Row 3: A3 | B3 | C3 | D3 | E3 | F3
        # Row 4: A4 | B4 | C4 | D4 | E4 | F4
        expected_row_major_ids = [
            "A1", "B1", "C1", "D1", "E1", "F1",
            "A2", "B2", "C2", "D2", "E2", "F2",
            "A3", "B3", "C3", "D3", "E3", "F3",
            "A4", "B4", "C4", "D4", "E4", "F4"
        ]
        actual_ids = [c["cell_id"] for c in all_cells]
        self.assertEqual(actual_ids, expected_row_major_ids, "Cells must be ordered row-major for physical visual grid alignment")

        # Verify Row 1: y=0, x=0..5
        row_1 = [c for c in all_cells if c["y"] == 0]
        self.assertEqual([c["cell_id"] for c in row_1], ["A1", "B1", "C1", "D1", "E1", "F1"])

        # Verify Row 2: y=1, x=0..5
        row_2 = [c for c in all_cells if c["y"] == 1]
        self.assertEqual([c["cell_id"] for c in row_2], ["A2", "B2", "C2", "D2", "E2", "F2"])

        # Verify Row 3: y=2, x=0..5
        row_3 = [c for c in all_cells if c["y"] == 2]
        self.assertEqual([c["cell_id"] for c in row_3], ["A3", "B3", "C3", "D3", "E3", "F3"])

        # Verify Row 4: y=3, x=0..5
        row_4 = [c for c in all_cells if c["y"] == 3]
        self.assertEqual([c["cell_id"] for c in row_4], ["A4", "B4", "C4", "D4", "E4", "F4"])

        # Verify C2 and C3 are vertically adjacent in column C (x=2)
        c2 = [c for c in all_cells if c["cell_id"] == "C2"][0]
        c3 = [c for c in all_cells if c["cell_id"] == "C3"][0]
        self.assertEqual(c2["x"], 2)
        self.assertEqual(c2["y"], 1)
        self.assertEqual(c3["x"], 2)
        self.assertEqual(c3["y"], 2)
        self.assertTrue(c2["is_obstacle"])
        self.assertTrue(c3["is_obstacle"])

    def test_03_invalid_cell_rejection(self):
        """Invalid cell IDs must be rejected with ValueError."""
        invalid_ids = [
            "A0", "A5", "G1", "Z9", "1A", "B0", "C5", "F0", "F5",
            "", " ", "A11", "AA1", None, 123, ("A", 1)
        ]
        for bad_id in invalid_ids:
            with self.subTest(bad_id=bad_id):
                self.assertFalse(is_valid_cell_id(bad_id))
                with self.assertRaises(ValueError):
                    cell_id_to_coords(bad_id)

    def test_04_obstacle_metadata(self):
        """Obstacles C2 (2,1) and C3 (2,2) must be correctly identified and flagged."""
        self.assertTrue(is_obstacle("C2"), "C2 must be an obstacle")
        self.assertTrue(is_obstacle("C3"), "C3 must be an obstacle")
        self.assertTrue(is_obstacle((2, 1)), "(2,1) must be an obstacle")
        self.assertTrue(is_obstacle((2, 2)), "(2,2) must be an obstacle")

        # Verify C2 and C3 map to exact expected coordinates
        self.assertEqual(cell_id_to_coords("C2"), (2, 1))
        self.assertEqual(cell_id_to_coords("C3"), (2, 2))

        # Non-obstacles must return False
        self.assertFalse(is_obstacle("A1"))
        self.assertFalse(is_obstacle("C1"))
        self.assertFalse(is_obstacle("C4"))
        self.assertFalse(is_obstacle("F4"))
        self.assertFalse(is_obstacle((0, 0)))


class TestManualLocalizationAndBatch(unittest.TestCase):
    """Test Requirements 2, 3: Manual position confirmation and batch lifecycle."""

    def setUp(self):
        self.engine = SurveyEngine()

    def test_05_position_unknown_until_confirmed(self):
        """Operator position must be UNKNOWN until explicitly confirmed."""
        self.assertIsNone(self.engine.confirmed_cell_id)
        self.assertEqual(self.engine.position_method, POSITION_METHOD_UNKNOWN)

        # Selecting a cell candidate does NOT confirm position
        self.engine.select_cell("A1")
        self.assertEqual(self.engine.selected_cell_id, "A1")
        self.assertIsNone(self.engine.confirmed_cell_id)
        self.assertEqual(self.engine.position_method, POSITION_METHOD_UNKNOWN)

        # Explicit confirmation
        confirmed = self.engine.confirm_cell_position()
        self.assertEqual(confirmed, "A1")
        self.assertEqual(self.engine.confirmed_cell_id, "A1")
        self.assertEqual(self.engine.position_method, POSITION_METHOD_MANUAL)

    def test_06_cannot_confirm_obstacle_cell(self):
        """Operator cannot confirm robot position inside an obstacle cell."""
        self.engine.select_cell("C2")
        with self.assertRaises(ValueError):
            self.engine.confirm_cell_position()

        self.engine.select_cell("C3")
        with self.assertRaises(ValueError):
            self.engine.confirm_cell_position()

    def test_07_batch_cell_locking(self):
        """
        Confirmed cell remains fixed for the current batch.
        Selecting another cell while a batch is active must NOT silently change the batch cell.
        """
        self.engine.select_cell("A1")
        self.engine.confirm_cell_position()

        batch = self.engine.start_batch(
            survey_id="SURVEY_TEST_01",
            obstacle_condition=CONDITION_NO_OBSTACLE,
            data_source=DATA_SOURCE_FIXTURE
        )
        self.assertEqual(batch.cell_id, "A1")

        # Operator now selects another cell (e.g., browsing the grid)
        self.engine.select_cell("B2")
        self.assertEqual(self.engine.selected_cell_id, "B2")

        # The active batch MUST remain locked to A1
        self.assertEqual(self.engine.active_batch.cell_id, "A1")
        self.assertEqual(batch.cell_id, "A1")

        # Confirming while batch is active still does not change the already active batch
        self.engine.confirm_cell_position()
        self.assertEqual(self.engine.active_batch.cell_id, "A1")


class TestPacketRecordingAndStorage(unittest.TestCase):
    """Test Requirements 4, 5: Packet recording interface and CSV persistence."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.csv_path = os.path.join(self.temp_dir, "survey_data.csv")
        self.engine = SurveyEngine(default_csv_path=self.csv_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_08_five_packets_correctly_tagged_to_a1(self):
        """Record five synthetic packets in cell A1 and verify all metadata fields."""
        self.engine.select_cell("A1")
        self.engine.confirm_cell_position()

        batch = self.engine.start_batch(
            survey_id="SURVEY_001",
            obstacle_condition=CONDITION_NO_OBSTACLE,
            data_source=DATA_SOURCE_FIXTURE,
            batch_id="BATCH_A1_01"
        )

        for seq in range(1, 6):
            pkt = create_synthetic_packet(sequence_number=seq, rssi_dbm=-62.0 - seq, snr_db=10.0 - seq * 0.2)
            rec = self.engine.record_packet(
                packet=pkt,
                survey_id="SURVEY_001",
                batch_id=batch.batch_id,
                cell_id="A1",
                obstacle_condition=CONDITION_NO_OBSTACLE
            )

            # Assert exact tagging
            self.assertEqual(rec["survey_id"], "SURVEY_001")
            self.assertEqual(rec["batch_id"], "BATCH_A1_01")
            self.assertEqual(rec["cell_id"], "A1")
            self.assertEqual(rec["x"], 0)
            self.assertEqual(rec["y"], 0)
            self.assertEqual(rec["obstacle_condition"], CONDITION_NO_OBSTACLE)
            self.assertEqual(rec["sequence_number"], seq)
            self.assertEqual(rec["position_method"], POSITION_METHOD_MANUAL)
            self.assertEqual(rec["data_source"], DATA_SOURCE_FIXTURE)
            self.assertIsNotNone(rec["received_at"])

        self.assertEqual(len(batch.packets), 5)
        self.engine.stop_batch()

    def test_09_new_b1_batch_not_inheriting_a1(self):
        """Starting a new batch at B1 must cleanly record to B1 (1,0) without inheriting A1."""
        # Batch 1: A1
        self.engine.select_cell("A1")
        self.engine.confirm_cell_position()
        b1 = self.engine.start_batch(survey_id="SURVEY_002", obstacle_condition=CONDITION_NO_OBSTACLE)
        pkt1 = create_synthetic_packet(sequence_number=1, rssi_dbm=-60.0)
        self.engine.record_packet(pkt1, "SURVEY_002", b1.batch_id, "A1", CONDITION_NO_OBSTACLE)
        self.engine.stop_batch()

        # Batch 2: B1
        self.engine.select_cell("B1")
        self.engine.confirm_cell_position()
        b2 = self.engine.start_batch(survey_id="SURVEY_002", obstacle_condition=CONDITION_NO_OBSTACLE)
        pkt2 = create_synthetic_packet(sequence_number=2, rssi_dbm=-65.0)
        rec2 = self.engine.record_packet(pkt2, "SURVEY_002", b2.batch_id, "B1", CONDITION_NO_OBSTACLE)
        self.engine.stop_batch()

        # Verify B1 packet tagging
        self.assertEqual(rec2["cell_id"], "B1")
        self.assertEqual(rec2["x"], 1)
        self.assertEqual(rec2["y"], 0)
        self.assertNotEqual(rec2["cell_id"], "A1")

        # Verify independent storage in engine
        records_a1 = self.engine.get_cell_records("SURVEY_002", CONDITION_NO_OBSTACLE, "A1")
        records_b1 = self.engine.get_cell_records("SURVEY_002", CONDITION_NO_OBSTACLE, "B1")
        self.assertEqual(len(records_a1), 1)
        self.assertEqual(len(records_b1), 1)
        self.assertEqual(records_a1[0]["cell_id"], "A1")
        self.assertEqual(records_b1[0]["cell_id"], "B1")

    def test_10_duplicate_sequence_rejection(self):
        """Duplicate sequence numbers within the same survey must be rejected."""
        self.engine.select_cell("A1")
        self.engine.confirm_cell_position()
        batch = self.engine.start_batch(survey_id="SURVEY_DUP", obstacle_condition=CONDITION_NO_OBSTACLE)

        pkt = create_synthetic_packet(sequence_number=42, rssi_dbm=-65.0)
        self.engine.record_packet(pkt, "SURVEY_DUP", batch.batch_id, "A1", CONDITION_NO_OBSTACLE)

        # Attempt to record the same sequence number again
        with self.assertRaises(ValueError) as ctx:
            self.engine.record_packet(pkt, "SURVEY_DUP", batch.batch_id, "A1", CONDITION_NO_OBSTACLE)
        self.assertIn("Duplicate sequence_number 42", str(ctx.exception))

        self.engine.stop_batch()

    def test_11_missing_rssi_snr_handling(self):
        """Missing RSSI or SNR must remain None and NEVER be coerced to 0."""
        self.engine.select_cell("A2")
        self.engine.confirm_cell_position()
        batch = self.engine.start_batch(survey_id="SURVEY_RF_NULL", obstacle_condition=CONDITION_NO_OBSTACLE)

        # Packet with None for RSSI and SNR
        pkt_null = create_synthetic_packet(sequence_number=101, rssi_dbm=None, snr_db=None)
        rec_null = self.engine.record_packet(pkt_null, "SURVEY_RF_NULL", batch.batch_id, "A2", CONDITION_NO_OBSTACLE)

        self.assertIsNone(rec_null["rssi_dbm"], "Missing RSSI must be None, NOT 0")
        self.assertIsNone(rec_null["snr_db"], "Missing SNR must be None, NOT 0")
        self.assertNotEqual(rec_null["rssi_dbm"], 0.0)
        self.assertNotEqual(rec_null["snr_db"], 0.0)

        # Packet with valid values
        pkt_valid = create_synthetic_packet(sequence_number=102, rssi_dbm=-75.0, snr_db=8.0)
        self.engine.record_packet(pkt_valid, "SURVEY_RF_NULL", batch.batch_id, "A2", CONDITION_NO_OBSTACLE)

        # Verify summary handles missing metrics correctly without skewing medians with 0
        summary = self.engine.calculate_cell_summary("SURVEY_RF_NULL", CONDITION_NO_OBSTACLE, "A2")
        self.assertEqual(summary["packet_count"], 2)
        # Median of [-75.0] is -75.0 (ignoring None). If None were 0, median of [0, -75] would be -37.5!
        self.assertEqual(summary["median_rssi_dbm"], -75.0)
        self.assertEqual(summary["median_snr_db"], 8.0)

        self.engine.stop_batch()

    def test_12_csv_writing_and_reopening(self):
        """Append records to CSV, reopen and parse file, verify all 21 columns and values."""
        self.engine.select_cell("D3")
        self.engine.confirm_cell_position()
        batch = self.engine.start_batch(survey_id="SURVEY_CSV", obstacle_condition=CONDITION_NO_OBSTACLE)

        pkt = create_synthetic_packet(
            sequence_number=501,
            rssi_dbm=-68.5,
            snr_db=11.2,
            left_encoder_rate=14.0,
            right_encoder_rate=14.1,
            ax=0.01,
            ay=0.02,
            az=0.99,
            gz=-0.05,
            left_pwm=120,
            right_pwm=120,
            antenna_configuration="DIPOLE_V"
        )
        self.engine.record_packet(pkt, "SURVEY_CSV", batch.batch_id, "D3", CONDITION_NO_OBSTACLE)
        self.engine.stop_batch()

        # Reopen CSV and parse
        self.assertTrue(os.path.exists(self.csv_path))
        records = SurveyEngine.load_records_from_csv(self.csv_path)
        self.assertEqual(len(records), 1)

        r = records[0]
        self.assertEqual(r["survey_id"], "SURVEY_CSV")
        self.assertEqual(r["cell_id"], "D3")
        self.assertEqual(r["x"], 3)
        self.assertEqual(r["y"], 2)
        self.assertEqual(r["sequence_number"], 501)
        self.assertEqual(r["rssi_dbm"], -68.5)
        self.assertEqual(r["snr_db"], 11.2)
        self.assertEqual(r["left_encoder_rate"], 14.0)
        self.assertEqual(r["left_pwm"], 120)
        self.assertEqual(r["antenna_configuration"], "DIPOLE_V")
        self.assertEqual(r["position_method"], POSITION_METHOD_MANUAL)
        self.assertEqual(r["data_source"], DATA_SOURCE_FIXTURE)

        # Check raw CSV header has all 21 fields
        with open(self.csv_path, "r", encoding="utf-8") as f:
            header_line = f.readline().strip().split(",")
            self.assertEqual(header_line, CSV_HEADERS)
            self.assertEqual(len(header_line), 21)


class TestCellSummaryAndConditions(unittest.TestCase):
    """Test Requirement 6: Cell summaries and separation of obstacle conditions."""

    def setUp(self):
        self.engine = SurveyEngine()

    def test_13_separate_obstacle_conditions(self):
        """NO_OBSTACLE and FOIL_OBSTACLE datasets must remain completely isolated."""
        # 1. Record in cell B2 under NO_OBSTACLE
        self.engine.select_cell("B2")
        self.engine.confirm_cell_position()
        b_clean = self.engine.start_batch(survey_id="SURVEY_EXP", obstacle_condition=CONDITION_NO_OBSTACLE)
        self.engine.record_packet(
            create_synthetic_packet(sequence_number=1, rssi_dbm=-60.0),
            "SURVEY_EXP", b_clean.batch_id, "B2", CONDITION_NO_OBSTACLE
        )
        self.engine.stop_batch()

        # 2. Record in same cell B2 under FOIL_OBSTACLE
        b_foil = self.engine.start_batch(survey_id="SURVEY_EXP", obstacle_condition=CONDITION_FOIL_OBSTACLE)
        self.engine.record_packet(
            create_synthetic_packet(sequence_number=2, rssi_dbm=-88.0),
            "SURVEY_EXP", b_foil.batch_id, "B2", CONDITION_FOIL_OBSTACLE
        )
        self.engine.stop_batch()

        # Check clean condition
        summary_clean = self.engine.calculate_cell_summary("SURVEY_EXP", CONDITION_NO_OBSTACLE, "B2")
        self.assertEqual(summary_clean["packet_count"], 1)
        self.assertEqual(summary_clean["median_rssi_dbm"], -60.0)

        # Check foil condition
        summary_foil = self.engine.calculate_cell_summary("SURVEY_EXP", CONDITION_FOIL_OBSTACLE, "B2")
        self.assertEqual(summary_foil["packet_count"], 1)
        self.assertEqual(summary_foil["median_rssi_dbm"], -88.0)

        # Both conditions must maintain their distinct values
        self.assertNotEqual(summary_clean["median_rssi_dbm"], summary_foil["median_rssi_dbm"])

    def test_14_cell_summary_pdr_and_status(self):
        """Verify cell summary calculates PDR, missing packets, and proper status codes."""
        self.engine.select_cell("E2")
        self.engine.confirm_cell_position()
        batch = self.engine.start_batch(
            survey_id="SURVEY_PDR",
            obstacle_condition=CONDITION_NO_OBSTACLE,
            expected_start_sequence=1
        )

        # Send packets 1, 2, 4, 5 (packet 3 dropped) -> 4 received out of 5 expected
        for seq in [1, 2, 4, 5]:
            pkt = create_synthetic_packet(sequence_number=seq, rssi_dbm=-70.0, snr_db=9.0)
            self.engine.record_packet(pkt, "SURVEY_PDR", batch.batch_id, "E2", CONDITION_NO_OBSTACLE)
        self.engine.stop_batch(expected_end_sequence=5)

        summary = self.engine.calculate_cell_summary("SURVEY_PDR", CONDITION_NO_OBSTACLE, "E2", expected_total_packets=5)
        self.assertEqual(summary["packet_count"], 4)
        self.assertEqual(summary["expected_packets"], 5)
        self.assertEqual(summary["missing_packets"], 1)
        # PDR = (4 / 5) * 100 = 80.0%
        self.assertEqual(summary["pdr_percent"], 80.0)
        self.assertEqual(summary["status"], STATUS_MEASURED)

        # Obstacle cell C2 must report STATUS_BLOCKED
        summary_c2 = self.engine.calculate_cell_summary("SURVEY_PDR", CONDITION_NO_OBSTACLE, "C2")
        self.assertEqual(summary_c2["status"], STATUS_BLOCKED)

        # Unsurveyed cell F1 must report STATUS_UNMEASURED
        summary_f1 = self.engine.calculate_cell_summary("SURVEY_PDR", CONDITION_NO_OBSTACLE, "F1")
        self.assertEqual(summary_f1["status"], STATUS_UNMEASURED)
        self.assertEqual(summary_f1["packet_count"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
