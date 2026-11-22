// controls.js - Manual D-Pad & Keyboard Controls, Emergency Stop, and Autonomous Mission Runner
import { CONFIG } from './config.js';

export class MotionController {
  constructor(telemetryManager, pathFinder, grid) {
    this.telemetry = telemetryManager;
    this.pathFinder = pathFinder;
    this.grid = grid;

    this.mode = 'manual'; // 'manual' | 'auto'
    this.isAutoNavRunning = false;
    this.autoNavTimer = null;
    this.navStepDelay = 700; // ms per cell in auto navigation

    this.listeners = {
      onModeChange: [],
      onAutoNavStatus: [],
      onEmergencyTriggered: []
    };

    this.initKeyboardListeners();
  }

  on(event, cb) {
    if (this.listeners[event]) {
      this.listeners[event].push(cb);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'manual' && this.isAutoNavRunning) {
      this.pauseAutoNav();
    }
    this.emit('onModeChange', { mode });
  }

  // --- Keyboard & Emergency Stop Listeners ---
  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // Spacebar = IMMEDIATE EMERGENCY STOP OVERRIDE (Rule 4)
      if (e.code === 'Space') {
        e.preventDefault();
        this.triggerEmergencyStop();
        return;
      }

      // If emergency stopped or link disconnected, ignore movement keys
      if (
        this.telemetry.rover.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
        this.telemetry.rover.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT
      ) {
        return;
      }

      if (this.mode !== 'manual') return;

      switch (e.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          e.preventDefault();
          this.manualMove(0, -1, CONFIG.DIRECTIONS.NORTH);
          this.highlightDpadButton('btn-up');
          break;

        case 's':
        case 'S':
        case 'ArrowDown':
          e.preventDefault();
          this.manualMove(0, 1, CONFIG.DIRECTIONS.SOUTH);
          this.highlightDpadButton('btn-down');
          break;

        case 'a':
        case 'A':
        case 'ArrowLeft':
          e.preventDefault();
          this.manualMove(-1, 0, CONFIG.DIRECTIONS.WEST);
          this.highlightDpadButton('btn-left');
          break;

        case 'd':
        case 'D':
        case 'ArrowRight':
          e.preventDefault();
          this.manualMove(1, 0, CONFIG.DIRECTIONS.EAST);
          this.highlightDpadButton('btn-right');
          break;

        case 'x':
        case 'X':
          e.preventDefault();
          this.manualStop();
          this.highlightDpadButton('btn-stop');
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.clearDpadHighlights();
    });
  }

  highlightDpadButton(btnId) {
    const el = document.getElementById(btnId);
    if (el) el.classList.add('active');
  }

  clearDpadHighlights() {
    document.querySelectorAll('.dpad-btn').forEach(btn => btn.classList.remove('active'));
  }

  // --- Manual Movement Execution ---
  manualMove(dCol, dRow, heading) {
    // Safety check: is link alive and robot in safe operational state?
    if (
      this.telemetry.metrics.linkStatus === 'DISCONNECTED' ||
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT
    ) {
      return;
    }

    const current = this.telemetry.rover;
    const targetCol = current.col + dCol;
    const targetRow = current.row + dRow;

    // Bounds check
    if (
      targetCol < 0 || targetCol >= CONFIG.ARENA.COLS ||
      targetRow < 0 || targetRow >= CONFIG.ARENA.ROWS
    ) {
      return; // Wall hit
    }

    // Obstacle collision check
    if (this.grid.obstacles.has(`${targetCol},${targetRow}`)) {
      return; // Blocked by obstacle
    }

    this.telemetry.setRoverState(CONFIG.ROBOT_STATES.MANUAL);
    this.telemetry.setRoverPosition(targetCol, targetRow, heading);
  }

  manualStop() {
    if (this.telemetry.rover.state !== CONFIG.ROBOT_STATES.EMERGENCY_STOP &&
        this.telemetry.rover.state !== CONFIG.ROBOT_STATES.COMM_TIMEOUT) {
      this.telemetry.setRoverState(CONFIG.ROBOT_STATES.IDLE);
    }
  }

  // --- Emergency Stop (E-STOP) ---
  triggerEmergencyStop() {
    this.pauseAutoNav();
    this.telemetry.emergencyStop();
    this.emit('onEmergencyTriggered', {
      timestamp: Date.now(),
      message: 'EMERGENCY STOP ENGAGED! All motion halted immediately.'
    });
  }

  resumeEmergencyStop() {
    this.telemetry.resumeFromEmergency();
  }

  // --- Autonomous Navigation (Mission) ---
  startAutoNav() {
    if (!this.grid.targetCell) {
      alert('Please set a target destination cell on the arena grid first!');
      return;
    }

    if (
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT ||
      this.telemetry.metrics.linkStatus === 'DISCONNECTED'
    ) {
      alert('Cannot start navigation while in Emergency Stop or Communication Loss!');
      return;
    }

    this.isAutoNavRunning = true;
    this.telemetry.setRoverState(CONFIG.ROBOT_STATES.AUTO_NAV);
    this.emit('onAutoNavStatus', { running: true, message: 'Autonomous mission running...' });

    this.stepAutoNav();
  }

  pauseAutoNav() {
    this.isAutoNavRunning = false;
    if (this.autoNavTimer) {
      clearTimeout(this.autoNavTimer);
      this.autoNavTimer = null;
    }
    if (this.telemetry.rover.state === CONFIG.ROBOT_STATES.AUTO_NAV) {
      this.telemetry.setRoverState(CONFIG.ROBOT_STATES.IDLE);
    }
    this.emit('onAutoNavStatus', { running: false, message: 'Mission paused.' });
  }

  stepAutoNav() {
    if (!this.isAutoNavRunning) return;

    // Safety checks
    if (
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
      this.telemetry.rover.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT ||
      this.telemetry.metrics.linkStatus === 'DISCONNECTED'
    ) {
      this.pauseAutoNav();
      return;
    }

    const rover = this.telemetry.rover;
    const target = this.grid.targetCell;

    if (!target) {
      this.pauseAutoNav();
      return;
    }

    // Check if destination arrived
    if (rover.col === target.col && rover.row === target.row) {
      this.pauseAutoNav();
      this.telemetry.setRoverState(CONFIG.ROBOT_STATES.IDLE);
      this.emit('onAutoNavStatus', { running: false, arrived: true, message: 'Target destination reached safely!' });
      return;
    }

    // Plan next step using pathfinder
    const currentPos = { col: rover.col, row: rover.row };
    const path = this.pathFinder.findPath(currentPos, target, this.grid.obstacles);

    if (!path || path.length < 2) {
      this.pauseAutoNav();
      alert('Target is unreachable due to obstacles! Mission aborted.');
      return;
    }

    // Update visualized path
    this.grid.updatePath(path);

    // Next step is path[1]
    const nextCell = path[1];
    const newHeading = this.pathFinder.getHeadingBetween(currentPos, nextCell);

    // Advance rover to next step
    this.telemetry.setRoverPosition(nextCell.col, nextCell.row, newHeading);

    // Recompute path from new position
    const remainingPath = this.pathFinder.findPath(nextCell, target, this.grid.obstacles);
    this.grid.updatePath(remainingPath);

    // Schedule next move
    this.autoNavTimer = setTimeout(() => {
      this.stepAutoNav();
    }, this.navStepDelay);
  }
}
