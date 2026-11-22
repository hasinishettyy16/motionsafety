Read AGENTS.md carefully. Execute Stage 1 ONLY: build the laptop dashboard inside a `/dashboard` folder using simulated mock telemetry data. Do NOT write any ESP32 firmware yet.

Tech Stack:
- Build a clean, modern single-page web app (React + Vite or plain HTML/CSS/JavaScript) so it runs easily in Chrome/Edge and can later use the Web Serial API without needing complex Python backend setups.

Required Dashboard Features (all 12):
1. Live robot connection status badge (Connected / Weak Signal / Disconnected).
2. Interactive 6 columns × 4 rows arena grid (labeled Col 0–5, Row 0–3, representing 20 cm × 20 cm cells).
3. Visual markers for Current Rover Cell (with heading arrow) and Target Destination Cell (clickable to set destination).
4. Obstacle marking (allow clicking between/on grid cells to toggle an obstacle barrier).
5. Live signal metrics panel displaying RSSI (dBm), SNR (dB), and Packet Delivery Rate (%).
6. Communication-quality heatmap toggle that color-codes each visited grid cell based on recorded signal strength.
7. Planned route display (highlight the grid path from the rover to the destination while avoiding marked obstacles).
8. Manual control mode (on-screen D-pad / virtual joystick + keyboard WASD/Arrow support).
9. Automatic navigation mode toggle (with Start / Pause mission buttons).
10. Prominent red EMERGENCY STOP button (keyboard Spacebar shortcut) that halts simulated movement immediately.
11. Communication-loss warning banner that triggers automatically when mock packets drop or time out.
12. Per-cell data logging table + "Export CSV" button recording Cell (X,Y), Timestamp, RSSI, SNR, PDR, and Robot State.

Include a "Simulation Control Panel" at the bottom or side with sliders/buttons to simulate:
- Rover moving along the grid
- Signal degradation / packet loss
- Sudden communication timeout

After building `/dashboard`, launch the local server, verify the UI visually, and give me a beginner-friendly explanation of every file created and how to test each of the 12 features.
