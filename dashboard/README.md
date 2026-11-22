# Communication-Aware Motion Safety Dashboard (Stage 1)

Welcome to the **Motion Safety Dashboard**! This application is the mission control center for your 2WD ESP32 LoRa Robot. It monitors live wireless communication quality (RSSI, SNR, Packet Delivery Rate) across a 120 cm × 80 cm grid arena, plans obstacle-avoiding paths, and strictly enforces motion safety rules.

---

## 📁 File Structure & Beginner-Friendly Explanations

Here is a breakdown of every file inside `/dashboard` and what role it plays:

```
dashboard/
├── index.html        # Main visual structure of the dashboard
├── server.py         # Lightweight local Python server (no npm install needed)
├── README.md         # This beginner-friendly guide and testing manual
├── css/
│   └── styles.css    # Modern cyber-telemetry dark theme, animations & grid styling
└── js/
    ├── config.js     # Central settings: arena dimensions, safety thresholds & colors
    ├── pathfinding.js# BFS/A* algorithm that plans the shortest route around obstacles
    ├── telemetry.js  # RF link simulator, 500ms safety watchdog timer & CSV logger
    ├── grid.js       # Renders the 6x4 arena grid, rover avatar, target, & RF heatmap
    ├── controls.js   # Manual D-Pad, keyboard listener (WASD), E-STOP & Auto-Nav runner
    └── app.js        # Main coordinator that wires up user interactions and UI updates
```

### Detailed File Roles:
1. **`index.html`**:
   - The user interface skeleton. It organizes the screen into three key sections:
     - **Header**: Live connection status badge, watchdog packet age, and the prominent red Emergency Stop button.
     - **Left Column**: The 6×4 arena grid (120×80 cm), grid toolbar, coordinate rulers, and RF heatmap legend.
     - **Right Column**: Live telemetry metric cards (RSSI, SNR, PDR, Robot State), manual/auto drive controls, and the simulation test rig.
     - **Bottom**: The per-cell telemetry data table with CSV export.

2. **`css/styles.css`**:
   - High-contrast, clean dark theme with color-coded safety indicators (green = safe, amber = weak, red = emergency/comm loss).
   - Handles the directional rotation of the rover arrow, pulsing target beacon, and hazard stripes for obstacles.

3. **`js/config.js`**:
   - Single source of truth for all arena dimensions (6 cols, 4 rows, 20 cm per cell = 120×80 cm).
   - Defines the **500 ms communication watchdog threshold** required by the safety rules, plus RF signal quality thresholds.

4. **`js/pathfinding.js`**:
   - Grid pathfinding logic using Breadth-First Search (BFS).
   - Calculates the shortest route from the Rover's current cell to any target cell, automatically steering around any cells marked as obstacles.

5. **`js/telemetry.js`**:
   - Models realistic RF propagation: as the rover moves further from the base station at `(0, 0)`, the RSSI and SNR naturally degrade.
   - **500 ms Watchdog**: Continuously checks if packets stop arriving. If more than 500 ms elapses without a valid packet, it automatically trips the safety alarm, transitions to `COMM_TIMEOUT`, and halts all motion.
   - Manages the sliding window for Packet Delivery Rate (PDR) and formats logged data for CSV download.

6. **`js/grid.js`**:
   - Manages rendering and clicks on the 24 arena grid cells.
   - Updates the Rover's heading arrow in real-time, displays planned route step numbers, and tints cells with the signal quality heatmap.

7. **`js/controls.js`**:
   - Listens for keyboard inputs (`W`, `A`, `S`, `D` or Arrow keys) and on-screen D-Pad clicks.
   - Listens for the **Spacebar** key to immediately activate the Emergency Stop.
   - Houses the autonomous mission runner which steps the rover along the planned path cell-by-cell.

8. **`js/app.js`**:
   - Connects all the modular pieces together when the page opens.
   - Synchronizes slider adjustments with the telemetry engine and populates the live data logger table.

9. **`server.py`**:
   - Runs a zero-dependency local web server using Python's standard library so that ES module imports work smoothly in your browser.

---

## 🚀 How to Run the Dashboard

1. Open PowerShell or a terminal in the project directory:
   ```powershell
   cd "c:\Users\Hasini KV\OneDrive\Desktop\motionsafety\dashboard"
   python server.py
   ```
2. Open your web browser (Chrome or Edge) and navigate to:
   ```
   http://localhost:8000
   ```

---

## 🧪 Step-by-Step Testing Guide: All 12 Features

Here is how you can verify each of the 12 required features in under 5 minutes:

### Feature 1: Live Robot Connection Status Badge
- Look at the top center header. You will see a glowing green pill: `CONNECTED` with a pulsing dot.
- Move the **Simulated Packet Loss** slider in the simulation panel to `90%`: the badge changes to yellow `WEAK SIGNAL`.
- Click the red **"Simulate Sudden Comm Loss"** button: the badge immediately turns red `DISCONNECTED`.

### Feature 2: Interactive 6×4 Arena Grid
- Observe the arena board: it has **6 columns (Col 0 to 5)** and **4 rows (Row 0 to 3)** representing 20 cm × 20 cm cells (120 cm × 80 cm total).
- The top and left rulers show both the cell indices and metric centimeter coordinates.

### Feature 3: Visual Markers for Rover and Destination
- Notice the cyan marker at `(0, 0)` with a directional arrow `▲` and label `ROVER`.
- Ensure the click mode is set to **"🎯 Set Target"** (the blue button in the toolbar).
- Click on cell `(5, 3)`: a glowing violet target pin 🎯 appears, and the coordinates display updates to `(5, 3)`.

### Feature 4: Obstacle Marking
- Click **"🧱 Toggle Obstacle"** in the toolbar.
- Click on cell `(3, 1)`: it immediately turns into a red hazard-striped barrier with a brick icon and `OBSTACLE` tag.
- Click it again: the obstacle is removed.
- Click the **"Preset Obstacle"** button: it loads the default physical obstacle barrier between grid cells `(2, 1)` and `(2, 2)`.

### Feature 5: Live Signal Metrics Panel
- Look at the **Live RF & Telemetry Metrics** card in the right sidebar.
- Observe:
  - **RSSI (dBm)**: e.g. `-62 dBm` with an animated signal strength bar.
  - **SNR (dB)**: e.g. `10.5 dB` representing the signal-to-noise ratio.
  - **Packet Delivery Rate (PDR)**: e.g. `100.0%` with a health progress bar.
  - **Robot Safety State**: displays `IDLE`, `MANUAL`, `AUTO_NAV`, or `EMERGENCY_STOP`.

### Feature 6: Communication-Quality Heatmap Toggle
- Drive the rover across several cells using manual or auto mode.
- Turn on the **"RF Signal Heatmap"** switch in the top-right of the arena panel.
- Visited cells now show a colored tint reflecting signal strength (green = strong > -70 dBm, lime = good, amber = fair, red = poor) along with the recorded dBm value!

### Feature 7: Planned Route Display
- Set a destination at `(5, 2)` by clicking the cell in "Set Target" mode.
- Cyan dashed borders with numbered circle badges (1, 2, 3...) show the planned route from the rover to the destination.
- In "Toggle Obstacle" mode, place an obstacle on cell `(3, 0)` or along the path: notice the pathfinder immediately recalculates an alternate route around the barrier!

### Feature 8: Manual Control Mode (D-Pad & Keyboard)
- Select the **"Manual Drive"** tab in the sidebar.
- Click the on-screen D-Pad arrow buttons:
  - **Up (W)**: moves the rover North and rotates the heading arrow up (0°).
  - **Right (D)**: moves East and rotates the heading arrow right (90°).
  - **Down (S)**: moves South and points down (180°).
  - **Left (A)**: moves West and points left (270°).
- Try using your physical keyboard keys `W`, `A`, `S`, `D` or the arrow keys—the rover moves and the D-pad buttons highlight on keypress.

### Feature 9: Automatic Navigation Mode
- Switch to the **"Autonomous Navigation"** tab.
- Click any grid cell (e.g. `(4, 3)`) to set a target destination.
- Click **"▶ Start Autonomous Mission"**.
- Watch the rover autonomously turn and step forward along the planned path cell-by-cell until it reaches the target, where it announces arrival and halts!
- Click **"⏸ Pause Mission"** at any time to temporarily stop autonomous driving.

### Feature 10: Prominent Red Emergency Stop (E-STOP) Button
- During manual driving or while an autonomous mission is running, press the **Spacebar** on your keyboard OR click the big red **"EMERGENCY STOP"** button in the top header.
- Instantly:
  - All simulated movement stops dead in its tracks.
  - A flashing red emergency banner drops down: *"EMERGENCY STOP ACTIVE!"*.
  - The rover status updates to `EMERGENCY_STOP`.
- Click **"Resume Motion Safety"** on the banner to clear the stop.

### Feature 11: Communication-Loss Warning Banner (Watchdog)
- In the Simulation Control Panel, click **"⚡ Simulate Sudden Comm Loss"**.
- Within 500 ms (the strict safety watchdog limit), mock telemetry packets stop arriving.
- An alert banner immediately slides down: *"⚠️ COMMUNICATION TIMEOUT ALERT (>500ms): No telemetry packets received within safety threshold. Motors inhibited!"*.
- Notice that keyboard driving and autonomous navigation are completely blocked while disconnected.
- Click **"🔄 Restore Communication Link"**: packets resume, the watchdog resets, and the warning banner disappears.

### Feature 12: Per-Cell Data Logging Table & CSV Export
- Scroll down to the **Per-Cell Telemetry Data Logger** at the bottom.
- Notice new rows appending in real-time recording:
  - Record ID
  - Timestamp (to the millisecond)
  - Cell Coordinates `(X, Y)`
  - Heading Angle
  - RSSI (dBm)
  - SNR (dB)
  - PDR (%)
  - Link Status (`CONNECTED` / `WEAK` / `DISCONNECTED`)
  - Robot State (`IDLE` / `MANUAL` / `AUTO_NAV` / `EMERGENCY_STOP`)
- Click the blue **"📥 Export CSV"** button: a clean `.csv` file will download to your computer, ready to open in Excel or Google Sheets.


## Added simulation enhancements (November 2026)

- **Cell radio fingerprints:** Click any free cell in Goal mode to inspect simulated RSSI, SNR, PDR, sample count, status, and timestamp. Profiles are explicitly marked SIMULATED. `TelemetryManager.updateCellProfile()` is an adapter point for future real-data integration; no hardware connection is enabled.
- **Route comparison:** Goal changes and obstacle changes recalculate BFS shortest and Dijkstra communication-aware routes. The comparison panel displays steps, average RSSI, weak-cell count, weighted cost, and an explanation derived from route metrics.
- **Communication loss/recovery:** The sudden loss control immediately pauses simulated navigation and marks the link disconnected. Recovery resets the simulated packet window and returns the robot to idle; movement is not automatically resumed.
- **Guided Demo:** The Guided Demo button runs a staged demonstration of the arena, goal, heatmap, route comparison, simulated movement, communication loss, safe pause, and recovery. Use Stop Demo to end it.

All values and events remain simulation-only. The dashboard does not command hardware.


## Beginner test guide for the new features

1. Run the local server using `python server.py` from the `dashboard` folder, then open `http://localhost:8000`.
2. Click any free cell while **Set Goal** mode is active. The Cell Radio Fingerprint panel should show RSSI, SNR, PDR, sample count, status, and update time. All fingerprints are simulated. Clicking an obstacle shows that it has no free-cell fingerprint.
3. Select a goal such as **(5,3)**. The route comparison panel should populate both BFS shortest-route and Dijkstra communication-aware metrics. Blue = shortest, green = communication-aware, purple = shared cells.
4. Toggle RF Signal Heatmap on/off. The RSSI overlay should appear/disappear. The fixed wall cells remain visibly marked as obstacles and are not heatmap cells.
5. In Toggle Obstacle mode, click free cells to add/remove extra obstacles, then return to Set Goal. The two fixed obstacle cells cannot be removed. Both routes recalculate after layout changes.
6. Click **Guided Demo** and watch its captioned stages. Stop it with **Stop Demo**. Demo motion and radio events are software-only.
7. Click **Simulate Sudden Comm Loss** while navigation is running: it should pause movement and show disconnected/safe-pause messaging. Click **Restore Communication Link**: it returns to idle; press Start Autonomous Mission if you want to resume the simulation.
8. Test several destinations, including (5,3), and try a goal that becomes blocked by extra obstacles. A no-route message should appear rather than a crash.

### Weighted route cost
The Dijkstra communication-aware route assigns each move a base cost of 10 plus a cell-entry RSSI penalty: 0 for RSSI above −70 dBm, 4 for −70 through −80, 14 for −80 through −90, and 35 below −90 dBm. The displayed total is the sum of those costs for all route edges (the starting cell has no entry cost).

### Simulation-only limitations
- No ESP32, LoRa, or motor hardware is connected.
- Cell radio fingerprints are generated synthetic values; no RF attenuation behavior is claimed for the foil/wall obstacle.
- The communication-aware route penalty thresholds are fixed in the code (not yet user-adjustable).
- This guided demo is a presentation simulation and is not a verified real-robot safety system.
