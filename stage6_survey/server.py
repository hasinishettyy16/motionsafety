"""
server.py - Standalone Survey Server & REST API for Stage 6 Manual Radio Survey.

Zero external dependencies - uses Python standard library only.
Serves static UI files and handles survey API requests via survey_engine.py.
Default Port: 8006
"""

import http.server
import socketserver
import os
import sys
import json
import urllib.parse
from typing import Dict, Any, Tuple, Optional

from survey_engine import (
    SurveyEngine,
    CONDITION_NO_OBSTACLE,
    CONDITION_FOIL_OBSTACLE,
    DATA_SOURCE_LIVE,
    DATA_SOURCE_FIXTURE,
    POSITION_METHOD_MANUAL,
    CSV_HEADERS
)
from grid_mapping import is_valid_cell_id, is_obstacle, get_all_cells

DEFAULT_PORT = 8006
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEFAULT_CSV_PATH = os.path.join(DATA_DIR, "survey_records.csv")

# Global SurveyEngine instance for this process
engine = SurveyEngine(default_csv_path=DEFAULT_CSV_PATH)
current_survey_id = "SURVEY_001"
current_condition = CONDITION_NO_OBSTACLE
current_data_source = DATA_SOURCE_LIVE


def parse_raw_esp32_json(data_str: str) -> Dict[str, Any]:
    """
    Parse raw ESP32 JSON telemetry string.
    Example supported format:
    {"telemetry":[1184,0.0,0.0,0.00,0.00,0.00,0.00,0,0],"rssi":-103,"snr":1.50,"receivedCount":904}
    """
    parsed = json.loads(data_str.strip())
    result: Dict[str, Any] = {}

    # Handle telemetry array: [seq, left_enc, right_enc, ax, ay, az, gz, left_pwm, right_pwm]
    if "telemetry" in parsed and isinstance(parsed["telemetry"], (list, tuple)):
        telem = parsed["telemetry"]
        if len(telem) > 0 and telem[0] is not None:
            result["sequence_number"] = int(telem[0])
        if len(telem) > 1 and telem[1] is not None:
            result["left_encoder_rate"] = float(telem[1])
        if len(telem) > 2 and telem[2] is not None:
            result["right_encoder_rate"] = float(telem[2])
        if len(telem) > 3 and telem[3] is not None:
            result["ax"] = float(telem[3])
        if len(telem) > 4 and telem[4] is not None:
            result["ay"] = float(telem[4])
        if len(telem) > 5 and telem[5] is not None:
            result["az"] = float(telem[5])
        if len(telem) > 6 and telem[6] is not None:
            result["gz"] = float(telem[6])
        if len(telem) > 7 and telem[7] is not None:
            result["left_pwm"] = int(telem[7])
        if len(telem) > 8 and telem[8] is not None:
            result["right_pwm"] = int(telem[8])

    # Direct top-level keys
    if "sequence_number" in parsed and parsed["sequence_number"] is not None:
        result["sequence_number"] = int(parsed["sequence_number"])
    elif "seq" in parsed and parsed["seq"] is not None:
        result["sequence_number"] = int(parsed["seq"])

    # RSSI
    if "rssi" in parsed and parsed["rssi"] is not None:
        result["rssi_dbm"] = float(parsed["rssi"])
    elif "rssi_dbm" in parsed and parsed["rssi_dbm"] is not None:
        result["rssi_dbm"] = float(parsed["rssi_dbm"])

    # SNR
    if "snr" in parsed and parsed["snr"] is not None:
        result["snr_db"] = float(parsed["snr"])
    elif "snr_db" in parsed and parsed["snr_db"] is not None:
        result["snr_db"] = float(parsed["snr_db"])

    # Optional antenna
    if "antenna_configuration" in parsed:
        result["antenna_configuration"] = str(parsed["antenna_configuration"])

    return result


def dispatch_api(method: str, path: str, query: Dict[str, Any], body: Dict[str, Any]) -> Tuple[int, Any, str]:
    """
    Central API router for Stage 6.
    Returns: (http_status, payload, content_type)
    Can be called directly by unit/smoke tests or over HTTP via SurveyHandler.
    """
    global current_survey_id, current_condition, current_data_source

    method = method.upper()

    if method == "GET":
        if path == "/api/state":
            active_b = engine.active_batch
            batch_info = None
            if active_b and active_b.is_active:
                batch_info = {
                    "batch_id": active_b.batch_id,
                    "survey_id": active_b.survey_id,
                    "cell_id": active_b.cell_id,
                    "coords": active_b.coords,
                    "obstacle_condition": active_b.obstacle_condition,
                    "data_source": active_b.data_source,
                    "is_active": active_b.is_active,
                    "start_time": active_b.start_time,
                    "packet_count": len(active_b.packets)
                }

            return 200, {
                "selected_cell_id": engine.selected_cell_id,
                "confirmed_cell_id": engine.confirmed_cell_id,
                "position_method": engine.position_method,
                "active_batch": batch_info,
                "current_survey_id": current_survey_id,
                "current_condition": current_condition,
                "current_data_source": current_data_source,
                "cells": get_all_cells()
            }, "application/json"

        if path == "/api/summary":
            survey_id = query.get("survey_id", [current_survey_id])[0]
            condition = query.get("condition", [current_condition])[0]
            try:
                summary_map = engine.get_survey_grid_summary(survey_id, condition)
                return 200, {
                    "survey_id": survey_id,
                    "obstacle_condition": condition,
                    "summary": summary_map
                }, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/records":
            survey_id = query.get("survey_id", [current_survey_id])[0]
            condition = query.get("condition", [current_condition])[0]
            cell_id = query.get("cell_id", [None])[0]
            if cell_id:
                records = engine.get_cell_records(survey_id, condition, cell_id)
            else:
                records = []
                cond_map = engine._records.get(survey_id, {}).get(condition, {})
                for cid, recs in cond_map.items():
                    records.extend(recs)
                records.sort(key=lambda r: r.get("received_at", ""), reverse=True)
            return 200, {"records": records}, "application/json"

        if path == "/api/export_csv":
            csv_path = engine.default_csv_path or DEFAULT_CSV_PATH
            if os.path.exists(csv_path):
                with open(csv_path, "r", encoding="utf-8") as f:
                    csv_data = f.read()
            else:
                csv_data = ",".join(CSV_HEADERS) + "\n"
            return 200, csv_data, "text/csv"

    elif method == "POST":
        if path == "/api/select_cell":
            try:
                cell_id = body.get("cell_id", "")
                engine.select_cell(cell_id)
                return 200, {"success": True, "selected_cell_id": engine.selected_cell_id}, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/confirm_position":
            try:
                confirmed = engine.confirm_cell_position()
                return 200, {"success": True, "confirmed_cell_id": confirmed}, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/set_config":
            try:
                if "survey_id" in body and body["survey_id"].strip():
                    current_survey_id = body["survey_id"].strip()
                if "obstacle_condition" in body and body["obstacle_condition"] in (CONDITION_NO_OBSTACLE, CONDITION_FOIL_OBSTACLE):
                    current_condition = body["obstacle_condition"]
                if "data_source" in body and body["data_source"] in (DATA_SOURCE_LIVE, DATA_SOURCE_FIXTURE):
                    current_data_source = body["data_source"]

                return 200, {
                    "success": True,
                    "current_survey_id": current_survey_id,
                    "current_condition": current_condition,
                    "current_data_source": current_data_source
                }, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/start_batch":
            try:
                survey_id = body.get("survey_id") or current_survey_id
                condition = body.get("obstacle_condition") or current_condition
                source = body.get("data_source") or current_data_source
                batch_id = body.get("batch_id")

                batch = engine.start_batch(
                    survey_id=survey_id,
                    obstacle_condition=condition,
                    data_source=source,
                    batch_id=batch_id
                )
                return 200, {
                    "success": True,
                    "batch_id": batch.batch_id,
                    "cell_id": batch.cell_id,
                    "obstacle_condition": batch.obstacle_condition,
                    "data_source": batch.data_source,
                    "start_time": batch.start_time
                }, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/stop_batch":
            try:
                batch = engine.stop_batch(batch_id=body.get("batch_id"))
                return 200, {
                    "success": True,
                    "batch_id": batch.batch_id,
                    "cell_id": batch.cell_id,
                    "packet_count": len(batch.packets),
                    "start_time": batch.start_time,
                    "end_time": batch.end_time
                }, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

        if path == "/api/parse_json":
            try:
                raw_text = body.get("raw_json", "")
                parsed_packet = parse_raw_esp32_json(raw_text)
                return 200, {"success": True, "packet": parsed_packet}, "application/json"
            except Exception as e:
                return 400, {"error": f"Failed to parse JSON: {str(e)}"}, "application/json"

        if path == "/api/record_packet":
            try:
                packet = body.get("packet", {})
                survey_id = body.get("survey_id") or (engine.active_batch.survey_id if engine.active_batch else current_survey_id)
                batch_id = body.get("batch_id") or (engine.active_batch.batch_id if engine.active_batch else "")
                cell_id = body.get("cell_id") or (engine.active_batch.cell_id if engine.active_batch else "")
                condition = body.get("obstacle_condition") or (engine.active_batch.obstacle_condition if engine.active_batch else current_condition)
                received_at = body.get("received_at")

                record = engine.record_packet(
                    packet=packet,
                    survey_id=survey_id,
                    batch_id=batch_id,
                    cell_id=cell_id,
                    obstacle_condition=condition,
                    received_at=received_at
                )
                return 200, {"success": True, "record": record}, "application/json"
            except Exception as e:
                return 400, {"error": str(e)}, "application/json"

    return 404, {"error": f"Unknown endpoint: {method} {path}"}, "application/json"


class SurveyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_response_payload(self, status: int, data: Any, content_type: str):
        if content_type == "application/json":
            body = json.dumps(data, indent=2).encode("utf-8")
        else:
            body = data.encode("utf-8") if isinstance(data, str) else data

        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        if content_type == "text/csv":
            self.send_header("Content-Disposition", 'attachment; filename="survey_records.csv"')
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path.startswith("/api/"):
            status, data, ctype = dispatch_api("GET", path, query, {})
            self._send_response_payload(status, data, ctype)
            return

        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith("/api/"):
            try:
                body = self._read_json_body()
            except Exception as e:
                self._send_response_payload(400, {"error": f"Invalid JSON body: {str(e)}"}, "application/json")
                return

            status, data, ctype = dispatch_api("POST", path, {}, body)
            self._send_response_payload(status, data, ctype)
            return

        self._send_response_payload(404, {"error": f"Unknown path: {path}"}, "application/json")


def run_survey_server(port=DEFAULT_PORT):
    os.makedirs(DATA_DIR, exist_ok=True)
    for p in range(port, port + 10):
        try:
            with socketserver.TCPServer(("", p), SurveyHandler) as httpd:
                print("============================================================")
                print(f"🛰️ Stage 6 Survey Module running at: http://localhost:{p}")
                print(f"📂 Storage Directory: {DATA_DIR}")
                print(f"📄 CSV Destination: {DEFAULT_CSV_PATH}")
                print("⏹️  Press Ctrl+C to stop the survey server")
                print("============================================================")
                httpd.serve_forever()
                break
        except OSError as e:
            if "Address already in use" in str(e) or e.errno == 10048:
                continue
            raise e


if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    run_survey_server(port_arg)
