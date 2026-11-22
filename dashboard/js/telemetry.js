// telemetry.js - Telemetry state, mock RF link physics, 500ms watchdog timer, and CSV logging
import { CONFIG } from './config.js';

export class TelemetryManager {
  constructor() {
    // Current live state
    this.rover = {
      col: 0,
      row: 0,
      heading: CONFIG.DIRECTIONS.EAST,
      state: CONFIG.ROBOT_STATES.IDLE
    };

    // Telemetry link metrics
    this.metrics = {
      rssi: -54,
      snr: 10.5,
      pdr: 100.0,
      packetSeq: 0,
      packetsExpected: 0,
      packetsReceived: 0,
      lastPacketTimestamp: Date.now(),
      linkStatus: 'CONNECTED' // 'CONNECTED' | 'WEAK' | 'DISCONNECTED'
    };

    // Sliding window for accurate Packet Delivery Rate (PDR)
    this.packetWindowSize = 50;
    this.packetHistory = []; // array of 1 (received) or 0 (lost)

    // Simulation parameters
    this.simParams = {
      baseRssi: -60,        // Slider: -50 dBm (strong) to -105 dBm (faint)
      packetLossRate: 0,    // Slider: 0% to 100% loss
      isLinkSevered: false, // Simulated sudden comm kill switch
      speedMs: 600          // Auto-step movement interval in ms
    };

    // Data logging records
    this.logs = [];
    this.logCounter = 0;

    // Per-cell telemetry aggregation for heatmap
    // Map: "col,row" => { rssiSum: number, count: number, avgRssi: number, lastRssi: number }
    this.cellTelemetryMap = new Map();
    this.cellProfiles = new Map();
    // Synthetic fingerprint for every traversable cell. This interface can later accept real telemetry.
    for (let row = 0; row < CONFIG.ARENA.ROWS; row++) {
      for (let col = 0; col < CONFIG.ARENA.COLS; col++) {
        const key = `${col},${row}`;
        if ((CONFIG.FIXED_OBSTACLES || []).includes(key)) continue;
        const rssi = CONFIG.SIMULATED_CELL_RSSI[key] ?? -85;
        const snr = Number(Math.max(-12, Math.min(14, (rssi + 110) * 0.32 - 8)).toFixed(1));
        const pdr = Math.max(12, Math.min(99, Math.round(100 - Math.max(0, -rssi - 65) * 2.3)));
        this.cellProfiles.set(key, { col, row, rssi, snr, pdr, samples: 25 + ((col * 13 + row * 7) % 75), status: 'SIMULATED', timestamp: Date.now() });
      }
    }

    // Event listeners
    this.listeners = {
      onTelemetryUpdate: [],
      onWatchdogTimeout: [],
      onLinkStatusChange: [],
      onLogEntry: []
    };

    // Start simulation loops
    this.telemetryIntervalId = null;
    this.watchdogIntervalId = null;
    this.startTelemetryLoop();
    this.startWatchdog();
  }

  // --- Subscriptions ---
  subscribe(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  // --- Watchdog Implementation (Strict Safety Rule: <= 500ms) ---
  startWatchdog() {
    this.watchdogIntervalId = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.metrics.lastPacketTimestamp;
      if (this.simParams.isLinkSevered) {
        this.emit('onTelemetryUpdate', { metrics: { ...this.metrics, packetAgeMs: elapsed }, rover: { ...this.rover } });
      }

      // If no packet received within 500 ms -> TIMEOUT TRIGGERED
      if (elapsed > CONFIG.SAFETY.WATCHDOG_TIMEOUT_MS) {
        if (this.metrics.linkStatus !== 'DISCONNECTED') {
          this.metrics.linkStatus = 'DISCONNECTED';
          this.emit('onLinkStatusChange', { status: 'DISCONNECTED', elapsed });
        }

        // Inhibit rover motion if not already emergency stopped
        if (this.rover.state !== CONFIG.ROBOT_STATES.EMERGENCY_STOP &&
            this.rover.state !== CONFIG.ROBOT_STATES.COMM_TIMEOUT) {
          this.rover.state = CONFIG.ROBOT_STATES.COMM_TIMEOUT;
          this.emit('onWatchdogTimeout', {
            elapsed,
            message: `CRITICAL: No telemetry for ${elapsed} ms (> ${CONFIG.SAFETY.WATCHDOG_TIMEOUT_MS} ms limit). Motors halted!`
          });
        }
      }
    }, 50); // Check every 50ms for low latency
  }

  // --- Mock Telemetry Broadcast Loop (10 Hz = 100ms) ---
  startTelemetryLoop() {
    this.telemetryIntervalId = setInterval(() => {
      this.stepMockTelemetry();
    }, CONFIG.SAFETY.PACKET_INTERVAL_MS);
  }

  stepMockTelemetry() {
    this.metrics.packetsExpected++;

    // If link is severed by user test button, drop packet completely
    if (this.simParams.isLinkSevered) {
      this.recordPacketHistory(0);
      this.updatePdr();
      return;
    }

    // Check packet loss simulation rate
    const dropRoll = Math.random() * 100;
    if (dropRoll < this.simParams.packetLossRate) {
      // Packet dropped over the air
      this.recordPacketHistory(0);
      this.updatePdr();
      return;
    }

    // Packet successfully received!
    this.recordPacketHistory(1);
    this.metrics.packetsReceived++;
    this.metrics.packetSeq++;
    this.metrics.lastPacketTimestamp = Date.now();

    // Use simulated cell RSSI baseline plus subtle RF thermal noise (±1.5 dB)
    const cellBase = this.getCellSimulatedRssi(this.rover.col, this.rover.row);
    const baseVal = (cellBase !== null) ? cellBase : this.simParams.baseRssi;
    const rfNoise = (Math.random() - 0.5) * 2.5;
    const computedRssi = Math.round(baseVal + rfNoise);
    // Clamp to realistic 433 MHz LoRa ranges (-40 dBm to -125 dBm)
    this.metrics.rssi = Math.max(-125, Math.min(-40, computedRssi));

    // Calculate SNR based on RSSI: strong signal -> ~11 dB, weak signal -> negative dB
    const normalizedSignal = Math.max(0, Math.min(1, (this.metrics.rssi + 110) / 60));
    const baseSnr = -8 + (normalizedSignal * 19) + ((Math.random() - 0.5) * 1.5);
    this.metrics.snr = parseFloat(Math.max(-15, Math.min(15, baseSnr)).toFixed(1));

    this.updatePdr();
    this.updateLinkStatus();

    // Record cell data for heatmap
    this.recordCellTelemetry(this.rover.col, this.rover.row, this.metrics.rssi);

    // Add entry to logging history
    this.logTelemetryRecord();

    // Notify listeners
    this.emit('onTelemetryUpdate', {
      metrics: { ...this.metrics },
      rover: { ...this.rover }
    });
  }

  /**
   * Get the simulated RSSI value for any free cell (col, row).
   * Includes dynamic adjustment from the Base Signal Strength slider.
   * Returns null for physical obstacle cells.
   */
  getCellProfile(col, row) {
    const key = `${col},${row}`;
    const profile = this.cellProfiles.get(key);
    if (!profile) return null;
    const currentRssi = this.getCellSimulatedRssi(col, row) ?? profile.rssi;
    const snr = Number(Math.max(-12, Math.min(14, (currentRssi + 110) * 0.32 - 8)).toFixed(1));
    const pdr = Math.max(12, Math.min(99, Math.round(100 - Math.max(0, -currentRssi - 65) * 2.3)));
    return { ...profile, rssi: currentRssi, snr, pdr, status: 'SIMULATED' };
  }

  // Adapter entry point for future ESP32/LoRa measurements. Not connected to hardware in this demo.
  updateCellProfile(col, row, data) {
    const key = `${col},${row}`;
    if ((CONFIG.FIXED_OBSTACLES || []).includes(key)) return;
    this.cellProfiles.set(key, { col, row, ...data, status: data.status || 'MEASURED', timestamp: data.timestamp || Date.now() });
  }

  getCellSimulatedRssi(col, row) {
    const key = `${col},${row}`;
    const baseVal = CONFIG.SIMULATED_CELL_RSSI[key];
    if (baseVal === undefined) return null; // e.g. obstacle or outside grid

    // Dynamic slider adjustment relative to default (-60 dBm)
    const sliderOffset = (this.simParams.baseRssi - (-60));
    return Math.max(-125, Math.min(-40, Math.round(baseVal + sliderOffset)));
  }

  recordPacketHistory(status) {
    this.packetHistory.push(status);
    if (this.packetHistory.length > this.packetWindowSize) {
      this.packetHistory.shift();
    }
  }

  updatePdr() {
    if (this.packetHistory.length === 0) {
      this.metrics.pdr = 100.0;
      return;
    }
    const receivedCount = this.packetHistory.reduce((acc, val) => acc + val, 0);
    this.metrics.pdr = parseFloat(((receivedCount / this.packetHistory.length) * 100).toFixed(1));
  }

  updateLinkStatus() {
    if (this.metrics.pdr < 30 || this.metrics.rssi <= CONFIG.LINK.RSSI_CRITICAL_DBM) {
      this.metrics.linkStatus = 'DISCONNECTED';
    } else if (this.metrics.pdr < 80 || this.metrics.rssi <= CONFIG.LINK.RSSI_WEAK_DBM) {
      this.metrics.linkStatus = 'WEAK';
    } else {
      this.metrics.linkStatus = 'CONNECTED';
    }
  }

  recordCellTelemetry(col, row, rssi) {
    const key = `${col},${row}`;
    const existing = this.cellTelemetryMap.get(key) || { rssiSum: 0, count: 0, avgRssi: 0, lastRssi: 0 };
    existing.rssiSum += rssi;
    existing.count += 1;
    existing.avgRssi = Math.round(existing.rssiSum / existing.count);
    existing.lastRssi = rssi;
    this.cellTelemetryMap.set(key, existing);
  }

  logTelemetryRecord() {
    // Only log periodically (e.g. every 300ms or when rover moves/state changes) to keep table responsive
    const now = Date.now();
    if (this.lastLoggedAt && (now - this.lastLoggedAt) < 300) {
      return;
    }
    this.lastLoggedAt = now;

    this.logCounter++;
    const record = {
      id: this.logCounter,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now % 1000).padStart(3, '0'),
      col: this.rover.col,
      row: this.rover.row,
      heading: this.rover.heading,
      rssi: this.metrics.rssi,
      snr: this.metrics.snr,
      pdr: this.metrics.pdr,
      linkStatus: this.metrics.linkStatus,
      state: this.rover.state
    };

    this.logs.unshift(record); // newest first
    if (this.logs.length > 500) {
      this.logs.pop(); // keep last 500
    }

    this.emit('onLogEntry', record);
  }

  // --- Rover Position & State Controls ---
  setRoverPosition(col, row, heading = this.rover.heading) {
    this.rover.col = col;
    this.rover.row = row;
    this.rover.heading = heading;
    this.logTelemetryRecord();
  }

  setRoverState(state) {
    this.rover.state = state;
    this.logTelemetryRecord();
  }

  emergencyStop() {
    this.rover.state = CONFIG.ROBOT_STATES.EMERGENCY_STOP;
    this.logTelemetryRecord();
  }

  resumeFromEmergency() {
    if (this.rover.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
        this.rover.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT) {
      this.rover.state = CONFIG.ROBOT_STATES.IDLE;
      this.logTelemetryRecord();
    }
  }

  // --- Simulation Triggers ---
  severLink() {
    this.simParams.isLinkSevered = true;
    this.metrics.linkStatus = 'DISCONNECTED';
    this.metrics.pdr = 0;
    this.rover.state = CONFIG.ROBOT_STATES.COMM_TIMEOUT;
    this.emit('onLinkStatusChange', { status: 'DISCONNECTED' });
    this.emit('onWatchdogTimeout', { elapsed: 0, message: 'SIMULATED COMMUNICATION LOSS: Packet stream interrupted. Motion paused and simulated safe state engaged.' });
    this.emit('onTelemetryUpdate', { metrics: { ...this.metrics }, rover: { ...this.rover } });
  }

  restoreLink() {
    // Recovery is a simulated reset of the packet window; motion does not restart automatically.
    this.simParams.isLinkSevered = false;
    this.packetHistory = [];
    this.metrics.pdr = 100;
    this.metrics.lastPacketTimestamp = Date.now();
    this.metrics.linkStatus = 'CONNECTED';
    this.metrics.rssi = this.getCellSimulatedRssi(this.rover.col, this.rover.row) ?? -60;
    this.metrics.snr = 8;
    this.resumeFromEmergency();
    this.emit('onLinkStatusChange', { status: 'CONNECTED' });
    this.emit('onTelemetryUpdate', { metrics: { ...this.metrics }, rover: { ...this.rover } });
  }


  clearLogs() {
    this.logs = [];
    this.logCounter = 0;
    this.lastLoggedAt = 0;
  }

  // --- CSV Export Helper (Feature 12) ---
  exportCsv() {
    if (this.logs.length === 0) {
      alert("No telemetry records to export yet.");
      return;
    }

    const headers = [
      "Record_ID",
      "Timestamp",
      "Cell_Col_X",
      "Cell_Row_Y",
      "Heading_Deg",
      "RSSI_dBm",
      "SNR_dB",
      "PDR_Percent",
      "Link_Status",
      "Robot_State"
    ];

    const rows = this.logs.slice().reverse().map(entry => [
      entry.id,
      `"${entry.time}"`,
      entry.col,
      entry.row,
      entry.heading,
      entry.rssi,
      entry.snr,
      entry.pdr,
      `"${entry.linkStatus}"`,
      `"${entry.state}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const filename = `robot_telemetry_arena_${new Date().toISOString().slice(0,19).replace(/[:T]/g, "_")}.csv`;
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
