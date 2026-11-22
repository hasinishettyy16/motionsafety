// config.js - Global constants and configuration for Arena and Safety System

export const CONFIG = {
  // Arena Geometry (Rule: 120 cm x 80 cm divided into 6 cols x 4 rows, each cell ~20 cm x 20 cm)
  ARENA: {
    COLS: 6,             // Col 0 to Col 5
    ROWS: 4,             // Row 0 to Row 3
    CELL_SIZE_CM: 20,    // 20 cm per grid cell
    TOTAL_WIDTH_CM: 120, // 120 cm
    TOTAL_HEIGHT_CM: 80  // 80 cm
  },

  // Motion Safety Constraints (from AGENTS.md Rule 4)
  SAFETY: {
    WATCHDOG_TIMEOUT_MS: 500, // Stop motors immediately if no valid packet arrives within 500 ms
    PACKET_INTERVAL_MS: 100,  // Mock telemetry packet broadcast interval (10 Hz)
    HEADING_STEP_DEG: 90      // Cardinal heading step for 90-degree turns
  },

  // Communication Link Thresholds
  LINK: {
    RSSI_STRONG_DBM: -70,     // Strong signal: > -70 dBm (Green)
    RSSI_WEAK_DBM: -85,       // Weak signal: -70 to -85 dBm (Yellow)
    RSSI_CRITICAL_DBM: -100,  // Disconnected / Critical: < -85 dBm (Red)
    SNR_GOOD_DB: 5,           // Acceptable SNR above 5 dB
    SNR_POOR_DB: 0            // SNR below 0 dB indicates high noise
  },

  // Robot States
  ROBOT_STATES: {
    IDLE: 'IDLE',
    MANUAL: 'MANUAL',
    AUTO_NAV: 'AUTO_NAV',
    EMERGENCY_STOP: 'EMERGENCY_STOP',
    COMM_TIMEOUT: 'COMM_TIMEOUT'
  },

  // Heatmap Thresholds (per prompt specifications)
  HEATMAP: {
    STRONG_MIN_DBM: -70,     // Above -70 dBm: Green (strong)
    GOOD_MIN_DBM: -80,       // -70 to -80 dBm: Yellow (good)
    FAIR_MIN_DBM: -90,       // -80 to -90 dBm: Orange (fair)
    // Below -90 dBm: Red (weak)
    // Unknown/unmeasured: Grey
  },

  // Fixed Physical Obstacles (Arena requirement: between cells 2,1 and 2,2)
  FIXED_OBSTACLES: ['2,1', '2,2'],

  // Pre-simulated unique RSSI values for each free cell (UI Demonstration Model)
  // Distance-based with RF shadow variation, giving a unique value to every single cell
  SIMULATED_CELL_RSSI: {
    // Col 0
    '0,0': -54, // Green (> -70 dBm, Strong)
    '0,1': -64, // Green (> -70 dBm, Strong)
    '0,2': -73, // Yellow (-70 to -80 dBm, Good)
    '0,3': -81, // Orange (-80 to -90 dBm, Fair)

    // Col 1
    '1,0': -61, // Green (> -70 dBm, Strong)
    '1,1': -68, // Green (> -70 dBm, Strong)
    '1,2': -76, // Yellow (-70 to -80 dBm, Good)
    '1,3': -86, // Orange (-80 to -90 dBm, Fair)

    // Col 2
    '2,0': -71, // Yellow (-70 to -80 dBm, Good)
    // '2,1': Physical Wall / Obstacle
    // '2,2': Physical Wall / Obstacle
    '2,3': -83, // Orange (-80 to -90 dBm, Fair)

    // Col 3
    '3,0': -79, // Yellow (-70 to -80 dBm, Good)
    '3,1': -88, // Orange (-80 to -90 dBm, Fair)
    '3,2': -93, // Red (< -90 dBm, Weak)
    '3,3': -87, // Orange (-80 to -90 dBm, Fair)

    // Col 4
    '4,0': -84, // Orange (-80 to -90 dBm, Fair)
    '4,1': -91, // Red (< -90 dBm, Weak)
    '4,2': -95, // Red (< -90 dBm, Weak)
    '4,3': -98, // Red (< -90 dBm, Weak)

    // Col 5
    '5,0': -90, // Orange (-80 to -90 dBm, Fair)
    '5,1': -100,// Red (< -90 dBm, Weak)
    '5,2': -103,// Red (< -90 dBm, Weak)
    '5,3': -107 // Red (< -90 dBm, Weak)
  },

  // Cardinal Directions
  DIRECTIONS: {
    NORTH: 0,    // Facing Row 0 (Up)
    EAST: 90,    // Facing Col +1 (Right)
    SOUTH: 180,  // Facing Row +1 (Down)
    WEST: 270    // Facing Col -1 (Left)
  }
};
