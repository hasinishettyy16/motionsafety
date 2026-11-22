"""
test_ui_smoke.py - Automated End-to-End Smoke Test for Stage 6 Survey Server & REST API.

Tests API dispatching, JSON telemetry parsing, error handling,
obstacle protection, batch lifecycle, duplicate sequence rejection,
and CSV exports without relying on sandbox network sockets.
"""

import unittest
import os
import shutil
import tempfile
import json

from server import dispatch_api, parse_raw_esp32_json, engine, BASE_DIR
from survey_engine import CSV_HEADERS


class TestSurveyUISmoke(unittest.TestCase):
    def setUp(self):
        # Create temporary data directory for test CSV isolation
        self.temp_dir = tempfile.mkdtemp()
        self.test_csv = os.path.join(self.temp_dir, "smoke_survey.csv")
        engine.default_csv_path = self.test_csv
        # Reset engine state between tests if needed
        engine._confirmed_cell_id = None
        engine._selected_cell_id = None
        engine._active_batch = None
        engine._batches.clear()
        engine._recorded_sequences_by_survey.clear()
        engine._records.clear()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_static_index_html_exists(self):
        """Verify static index.html exists and contains essential UI components."""
        html_path = os.path.join(BASE_DIR, "index.html")
        self.assertTrue(os.path.exists(html_path), "index.html must exist")
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("STAGE 6: RADIO SURVEY MODULE", content)
        self.assertIn("arena-grid-container", content)
        self.assertIn("raw-json-input", content)
        self.assertIn("btn-parse-json", content)
        self.assertIn("btn-save-packet", content)

    def test_02_api_initial_state(self):
        """Verify initial API state returns 24 arena cells in row-major order and UNKNOWN position."""
        status, data, ctype = dispatch_api("GET", "/api/state", {}, {})
        self.assertEqual(status, 200)
        self.assertEqual(ctype, "application/json")
        self.assertEqual(len(data["cells"]), 24)
        self.assertEqual(data["position_method"], "UNKNOWN")
        self.assertIsNone(data["confirmed_cell_id"])

        # Verify Row-Major Grid Layout:
        # Row 1: A1..F1, Row 2: A2..F2, Row 3: A3..F3, Row 4: A4..F4
        expected_ids = [
            "A1", "B1", "C1", "D1", "E1", "F1",
            "A2", "B2", "C2", "D2", "E2", "F2",
            "A3", "B3", "C3", "D3", "E3", "F3",
            "A4", "B4", "C4", "D4", "E4", "F4"
        ]
        actual_ids = [c["cell_id"] for c in data["cells"]]
        self.assertEqual(actual_ids, expected_ids, "API cells must be in row-major order")

        # Verify C2 and C3 are vertically adjacent in column C
        c2 = next(c for c in data["cells"] if c["cell_id"] == "C2")
        c3 = next(c for c in data["cells"] if c["cell_id"] == "C3")
        self.assertEqual((c2["x"], c2["y"]), (2, 1))
        self.assertEqual((c3["x"], c3["y"]), (2, 2))
        self.assertTrue(c2["is_obstacle"])
        self.assertTrue(c3["is_obstacle"])

    def test_03_select_and_confirm_cell(self):
        """Verify selecting A1, B1, C1, F1, A2, C2, C3, and F4 behaves accurately."""
        # Test valid cell selections
        test_cells = ["A1", "B1", "C1", "F1", "A2", "F4"]
        for cid in test_cells:
            status, res, _ = dispatch_api("POST", "/api/select_cell", {}, {"cell_id": cid})
            self.assertEqual(status, 200)
            self.assertEqual(res["selected_cell_id"], cid)

            # Confirm and verify
            status, res, _ = dispatch_api("POST", "/api/confirm_position", {}, {})
            self.assertEqual(status, 200)
            self.assertEqual(res["confirmed_cell_id"], cid)

        # Obstacles C2 and C3 must allow selection for inspection but REJECT position confirmation
        for obs_id in ["C2", "C3"]:
            status, res, _ = dispatch_api("POST", "/api/select_cell", {}, {"cell_id": obs_id})
            self.assertEqual(status, 200)
            status_conf, res_conf, _ = dispatch_api("POST", "/api/confirm_position", {}, {})
            self.assertEqual(status_conf, 400)
            self.assertIn("obstacle", res_conf["error"].lower())

    def test_04_parse_esp32_raw_json(self):
        """Parse raw ESP32 telemetry JSON format with telemetry array."""
        raw_esp32 = '{"telemetry":[1184,0.0,0.0,0.00,0.00,0.00,0.00,0,0],"rssi":-103,"snr":1.50,"receivedCount":904}'
        status, res, _ = dispatch_api("POST", "/api/parse_json", {}, {"raw_json": raw_esp32})
        self.assertEqual(status, 200)
        pkt = res["packet"]
        self.assertEqual(pkt["sequence_number"], 1184)
        self.assertEqual(pkt["rssi_dbm"], -103.0)
        self.assertEqual(pkt["snr_db"], 1.50)
        self.assertEqual(pkt["left_encoder_rate"], 0.0)
        self.assertEqual(pkt["right_encoder_rate"], 0.0)

    def test_05_batch_lifecycle_and_live_record(self):
        """Start batch, record parsed LIVE packet, reject duplicate, and export CSV."""
        # Select and confirm B1
        dispatch_api("POST", "/api/select_cell", {}, {"cell_id": "B1"})
        dispatch_api("POST", "/api/confirm_position", {}, {})

        # Start batch for B1
        status, res, _ = dispatch_api("POST", "/api/start_batch", {}, {
            "survey_id": "SMOKE_SURVEY_01",
            "obstacle_condition": "NO_OBSTACLE",
            "data_source": "LIVE"
        })
        self.assertEqual(status, 200)
        batch_id = res["batch_id"]
        self.assertEqual(res["cell_id"], "B1")

        # Record packet seq 1184
        pkt = {
            "sequence_number": 1184,
            "rssi_dbm": -103.0,
            "snr_db": 1.50,
            "left_encoder_rate": 0.0,
            "right_encoder_rate": 0.0
        }
        status, res, _ = dispatch_api("POST", "/api/record_packet", {}, {"packet": pkt})
        self.assertEqual(status, 200)
        rec = res["record"]
        self.assertEqual(rec["cell_id"], "B1")
        self.assertEqual(rec["x"], 1)
        self.assertEqual(rec["y"], 0)
        self.assertEqual(rec["sequence_number"], 1184)
        self.assertEqual(rec["data_source"], "LIVE")
        self.assertEqual(rec["position_method"], "MANUAL_CONFIRMED")

        # Duplicate sequence number must be rejected with 400
        status_dup, res_dup, _ = dispatch_api("POST", "/api/record_packet", {}, {"packet": pkt})
        self.assertEqual(status_dup, 400)
        self.assertIn("Duplicate sequence_number 1184", res_dup["error"])

        # Stop batch
        status, res_stop, _ = dispatch_api("POST", "/api/stop_batch", {}, {})
        self.assertEqual(status, 200)
        self.assertEqual(res_stop["packet_count"], 1)

    def test_06_summary_and_csv_export(self):
        """Verify summary reports B1 as MEASURED and export_csv returns valid 21 headers."""
        # Select, confirm, start batch, record packet
        dispatch_api("POST", "/api/select_cell", {}, {"cell_id": "B1"})
        dispatch_api("POST", "/api/confirm_position", {}, {})
        dispatch_api("POST", "/api/start_batch", {}, {
            "survey_id": "SMOKE_SURVEY_01",
            "obstacle_condition": "NO_OBSTACLE",
            "data_source": "LIVE"
        })
        pkt = {"sequence_number": 1184, "rssi_dbm": -103.0, "snr_db": 1.50}
        dispatch_api("POST", "/api/record_packet", {}, {"packet": pkt})
        dispatch_api("POST", "/api/stop_batch", {}, {})

        # Check summary endpoint
        status, data, _ = dispatch_api("GET", "/api/summary", {"survey_id": ["SMOKE_SURVEY_01"], "condition": ["NO_OBSTACLE"]}, {})
        self.assertEqual(status, 200)
        summary_b1 = data["summary"]["B1"]
        self.assertEqual(summary_b1["status"], "MEASURED")
        self.assertEqual(summary_b1["packet_count"], 1)
        self.assertEqual(summary_b1["median_rssi_dbm"], -103.0)

        # Check export CSV endpoint
        status_csv, csv_text, ctype = dispatch_api("GET", "/api/export_csv", {}, {})
        self.assertEqual(status_csv, 200)
        self.assertEqual(ctype, "text/csv")
        lines = csv_text.strip().split("\n")
        self.assertGreaterEqual(len(lines), 2)
        headers = lines[0].split(",")
        self.assertEqual(headers, CSV_HEADERS)
        self.assertEqual(len(headers), 21)
        self.assertIn("B1", lines[1])
        self.assertIn("-103.0", lines[1])

    def test_07_obstacle_protection(self):
        """Verify selecting/confirming obstacle cell C2 or C3 fails gracefully."""
        status, res, _ = dispatch_api("POST", "/api/select_cell", {}, {"cell_id": "C2"})
        self.assertEqual(status, 200)

        # Confirming C2 must fail with 400
        status, res, _ = dispatch_api("POST", "/api/confirm_position", {}, {})
        self.assertEqual(status, 400)
        self.assertIn("obstacle", res["error"].lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
