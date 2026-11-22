# Stage 6: Standalone Manual Radio Survey Module

Welcome to the **Stage 6 Manual Radio Survey Module**! This tool is completely standalone and designed specifically for Laptop 2 (or any operator computer) to record physical radio link quality measurements across the 120×80 cm arena without requiring automated hardware movement or serial bridge integration.

---

## 🚀 Quick Start (Running on Laptop 2)

### 1. Launch the Server
Open a terminal (PowerShell, Command Prompt, or bash) in this folder:
```powershell
cd "motionsafety\stage6_survey"
python server.py
```
*Note: Uses Python standard library only (zero `pip install` required).*

### 2. Open in Browser
Open Chrome, Edge, or Firefox and navigate to:
```
http://localhost:8006
```

---

## 📋 Operator Field Survey Instructions (Step-by-Step)

### Step 1: Setup Survey Metadata
1. Enter your **Survey ID** (e.g. `SURVEY_BASELINE_01` or `SURVEY_FOIL_01`).
2. Select the **Obstacle Condition**:
   - `🟢 NO_OBSTACLE`: for baseline arena measurements without foil.
   - `🧱 FOIL_OBSTACLE`: for measurements with the aluminum foil barrier.
3. Verify the Data Source tag is set to `🔴 LIVE`.

### Step 2: Confirm Physical Robot Position
1. Physically place the robot into the target grid cell (e.g. **A1**).
2. Click on the corresponding cell on the arena grid (**A1**).
3. Click the blue **📍 Confirm Position at A1** button.
   - *The Position Method chip will update to `MANUAL_CONFIRMED` and the cell will show a `ROBOT` pin.*

### Step 3: Start the Batch
1. Click **▶ Start Survey Batch**.
   - *The status badge changes to glowing green `RECORDING ACTIVE`.*
   - *The active cell is now locked for this batch. Selecting other cells on the grid will not alter the active batch.*

### Step 4: Record Packets
When a telemetry packet appears on the Base Station serial monitor:
* **Option A: Quick Paste JSON (Recommended)**:
  1. Copy the raw JSON line from your serial monitor, e.g.:
     ```json
     {"telemetry":[1184,0.0,0.0,0.00,0.00,0.00,0.00,0,0],"rssi":-103,"snr":1.50,"receivedCount":904}
     ```
  2. Paste it into the **Quick Paste ESP32 JSON** box and click **🔍 Parse Packet JSON**.
  3. Review the parsed Sequence, RSSI, and SNR fields.
  4. Click **💾 Save Packet to Active Batch**.
* **Option B: Manual Input**:
  1. Enter the Sequence Number, RSSI (dBm), and SNR (dB) directly into the form.
  2. Click **💾 Save Packet to Active Batch**.

### Step 5: Complete Cell Measurements & Transition
1. After recording the desired number of samples (e.g. 5–10 packets) in this cell, click **⏹ End Batch**.
2. Physically move the robot to the next cell (e.g. **B1**).
3. On the grid, click **B1** and click **📍 Confirm Position at B1**.
4. Click **▶ Start Survey Batch** and repeat the packet recording steps.

### Step 6: Export Survey Dataset
* At any time or after completing all 22 traversable cells, click **📥 Export CSV (21 Columns)** in the footer.
* The downloaded `survey_records.csv` file adheres to the exact 21-column schema:
  `survey_id, batch_id, cell_id, x, y, obstacle_condition, antenna_configuration, sequence_number, received_at, rssi_dbm, snr_db, left_encoder_rate, right_encoder_rate, ax, ay, az, gz, left_pwm, right_pwm, position_method, data_source`
* Records are also persistently stored in `data/survey_records.csv`.

---

## 🧪 Automated Verification & Smoke Testing

To re-run the automated tests:
```powershell
# Run the 14 core engine unit tests
python -m unittest -v test_survey_engine.py

# Run the 7 UI & API smoke tests
python -m unittest -v test_ui_smoke.py
```

---

## 🛡️ Safety & Integrity Rules Enforced by the System
* **No COM Port Interference**: Does not open serial ports or interfere with Stage 1/Laptop 1.
* **No Accidental Moves**: No motor commands or autonomous navigation are present.
* **No Zero Substitution**: Missing RSSI or SNR values are recorded as `None` (empty CSV cells), NEVER coerced to `0 dBm`.
* **Duplicate Protection**: Duplicate sequence numbers within the same survey are automatically rejected.
* **Physical Wall Protection**: Fixed obstacle cells `C2` and `C3` cannot be selected as survey cells.
* **Condition Isolation**: `NO_OBSTACLE` and `FOIL_OBSTACLE` records and summaries are kept strictly separate.
