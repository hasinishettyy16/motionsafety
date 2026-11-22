// grid.js - Interactive 6x4 Arena Grid UI, Rover avatar, Obstacles, Path overlay, and Heatmap
import { CONFIG } from './config.js';

export class ArenaGrid {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.cols = CONFIG.ARENA.COLS;
    this.rows = CONFIG.ARENA.ROWS;

    // Active tool mode: 'destination' | 'obstacle'
    this.toolMode = 'destination';

    // State
    this.targetCell = null; // { col, row }
    this.obstacles = new Set(); // Set of "col,row" strings
    this.currentPath = []; // Array of { col, row }
    this.shortestPath = []; // Array of { col, row } in BLUE
    this.commAwarePath = []; // Array of { col, row } in GREEN
    this.heatmapEnabled = false;

    // Callbacks
    this.onCellClick = options.onCellClick || (() => { });
    this.onTargetChange = options.onTargetChange || (() => { });
    this.onObstaclesChange = options.onObstaclesChange || (() => { });

    // Element cache
    this.cellElements = new Map(); // "col,row" => HTMLElement

    this.render();
  }

  setToolMode(mode) {
    this.toolMode = mode;
  }

  toggleHeatmap(enabled) {
    this.heatmapEnabled = enabled;
  }

  render() {
    this.container.innerHTML = '';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const key = `${c},${r}`;
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.col = c;
        cell.dataset.row = r;

        // Label with coordinates & metric distance
        const xCm = c * CONFIG.ARENA.CELL_SIZE_CM;
        const yCm = r * CONFIG.ARENA.CELL_SIZE_CM;

        cell.innerHTML = `
          <div class="cell-header">
            <span class="cell-coords">(${c}, ${r})</span>
            <span class="cell-cm">${xCm},${yCm}cm</span>
          </div>
          <div class="cell-content" id="content-${key}"></div>
          <div class="cell-heatmap-val" id="heatmap-val-${key}"></div>
        `;

        cell.addEventListener('click', () => this.handleCellClick(c, r));
        this.cellElements.set(key, cell);
        this.container.appendChild(cell);
      }
    }
  }

  handleCellClick(col, row) {
    const key = `${col},${row}`;
    const fixed = (CONFIG.FIXED_OBSTACLES || ['2,1', '2,2']).includes(key);
    if (fixed) {
      // Permanent wall cells cannot be selected as goals or toggled off.
      this.onCellClick({ col, row, mode: this.toolMode, fixed: true });
      return;
    }

    if (this.toolMode === 'obstacle') {
      // Cannot place obstacle on the robot's current position
      if (this.currentRover && this.currentRover.col === col && this.currentRover.row === row) {
        return;
      }

      // Toggle user-added obstacles only.
      if (this.obstacles.has(key)) {
        this.obstacles.delete(key);
      } else {
        // Can't place obstacle on destination
        if (this.targetCell && this.targetCell.col === col && this.targetCell.row === row) {
          this.targetCell = null;
        }
        this.obstacles.add(key);
      }
      this.onObstaclesChange(new Set(this.obstacles));
    } else {
      // 'destination' mode
      if (this.obstacles.has(key)) {
        // Remove obstacle first if user sets it as target
        this.obstacles.delete(key);
        this.onObstaclesChange(new Set(this.obstacles));
      }

      if (this.targetCell && this.targetCell.col === col && this.targetCell.row === row) {
        this.targetCell = null; // Unset if clicked again
      } else {
        this.targetCell = { col, row };
      }
      this.onTargetChange(this.targetCell);
    }

    this.onCellClick({ col, row, mode: this.toolMode });
  }

  setTarget(col, row) {
    if (col === null || row === null) {
      this.targetCell = null;
    } else {
      this.targetCell = { col, row };
    }
    this.onTargetChange(this.targetCell);
  }

  clearObstacles() {
    // Preserve the project's fixed physical obstacles when clearing user-added obstacles.
    this.obstacles.clear();
    (CONFIG.FIXED_OBSTACLES || ['2,1', '2,2']).forEach(key => this.obstacles.add(key));
    this.onObstaclesChange(new Set(this.obstacles));
  }

  setPresetObstacle() {
    // Project rule: Arena has fixed physical obstacle placed between grid cells (2,1) and (2,2)
    this.obstacles.clear();
    const fixedObs = CONFIG.FIXED_OBSTACLES || ['2,1', '2,2'];
    fixedObs.forEach(key => this.obstacles.add(key));
    this.onObstaclesChange(new Set(this.obstacles));
  }

  updatePath(path) {
    this.currentPath = path || [];
    this.shortestPath = path || [];
  }

  setRoutes({ shortest, commAware }) {
    this.shortestPath = shortest || [];
    this.commAwarePath = commAware || [];
    this.currentPath = commAware || shortest || [];
  }

  // --- Main Redraw / Update Function ---
  update(roverState, telemetrySource) {
    this.currentRover = roverState ? { col: roverState.col, row: roverState.row } : null;
    const roverKey = `${roverState.col},${roverState.row}`;
    const targetKey = this.targetCell ? `${this.targetCell.col},${this.targetCell.row}` : null;

    // Build lookup maps for both routes: "col,row" => stepNumber
    const shortestKeys = new Map();
    if (this.shortestPath && this.shortestPath.length > 0) {
      this.shortestPath.forEach((pt, idx) => {
        shortestKeys.set(`${pt.col},${pt.row}`, idx);
      });
    }

    const commKeys = new Map();
    if (this.commAwarePath && this.commAwarePath.length > 0) {
      this.commAwarePath.forEach((pt, idx) => {
        commKeys.set(`${pt.col},${pt.row}`, idx);
      });
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const key = `${c},${r}`;
        const cell = this.cellElements.get(key);
        const content = cell.querySelector('.cell-content');
        const heatmapVal = cell.querySelector('.cell-heatmap-val');

        if (!cell || !content) continue;

        // Reset dynamic classes & styles
        cell.className = 'grid-cell';
        content.innerHTML = '';
        heatmapVal.innerHTML = '';
        cell.style.backgroundColor = '';

        const isRover = (key === roverKey);
        const isTarget = (key === targetKey);
        const isObstacle = this.obstacles.has(key);
        const isStart = (c === 0 && r === 0);

        const stepS = shortestKeys.get(key);
        const stepC = commKeys.get(key);
        const onShortest = (stepS !== undefined);
        const onComm = (stepC !== undefined);

        if (isStart) {
          cell.classList.add('is-start-cell');
        }

        // 1. Physical Obstacle check (Requirement 4: clearly marked as WALL/OBSTACLE, never confused with weak signal)
        if (isObstacle) {
          cell.classList.add('is-obstacle');
          content.innerHTML = `<div class="obstacle-marker"><span class="obs-icon">🧱</span><span class="obs-tag">WALL / OBSTACLE</span></div>`;
          continue; // Physical obstacle: no routes pass through, no heatmap coloring, no RSSI display
        }

        // 2. Heatmap layer on free cells (Requirements 1, 2, 3, 5)
        if (this.heatmapEnabled) {
          // Get unique simulated RSSI value for this free cell
          let rssi = null;
          if (telemetrySource && typeof telemetrySource.getCellSimulatedRssi === 'function') {
            rssi = telemetrySource.getCellSimulatedRssi(c, r);
          } else if (CONFIG.SIMULATED_CELL_RSSI && CONFIG.SIMULATED_CELL_RSSI[key] !== undefined) {
            rssi = CONFIG.SIMULATED_CELL_RSSI[key];
          }

          cell.style.backgroundColor = this.getRssiColor(rssi);
          if (rssi !== null && rssi !== undefined) {
            heatmapVal.innerHTML = `<span class="heatmap-badge">${rssi} dBm</span>`;
          } else {
            heatmapVal.innerHTML = `<span class="heatmap-badge badge-unknown">-- dBm</span>`;
          }
        }

        // 3. Dual Route Visualization layer (Shortest in BLUE, Comm-Aware in GREEN, Shared in DUAL)
        if (!isRover && !isTarget) {
          if (onShortest && onComm) {
            // SHARED WAYPOINT (Cell is utilized by BOTH routes)
            cell.classList.add('is-route-shared');
            content.innerHTML = `
              <div class="route-badge-shared">
                <span class="badge-pill-blue" title="Shortest Route Step ${stepS}">S${stepS}</span>
                <span class="badge-pill-green" title="Comm-Aware Route Step ${stepC}">C${stepC}</span>
              </div>
            `;
          } else if (onShortest) {
            // SHORTEST ROUTE ONLY (Blue)
            cell.classList.add('is-route-shortest');
            content.innerHTML = `<div class="route-badge badge-blue" title="Shortest Route Step ${stepS}">S${stepS}</div>`;
          } else if (onComm) {
            // COMM-AWARE ROUTE ONLY (Green)
            cell.classList.add('is-route-comm');
            content.innerHTML = `<div class="route-badge badge-green" title="Comm-Aware Route Step ${stepC}">C${stepC}</div>`;
          }
        }

        // 4. Start marker (when not occupied by robot or obstacle)
        if (isStart && !isRover && !isObstacle && !isTarget) {
          content.innerHTML = `
            <div class="start-marker">
              <span class="start-icon">🚩</span>
              <span class="start-tag">START</span>
            </div>
          `;
        }

        // 5. Goal Destination layer (GOAL marker)
        if (isTarget) {
          cell.classList.add('is-target');
          let dualTag = '';
          if (onShortest && onComm) {
            dualTag = `<div class="target-route-tag"><span class="tag-s">S${stepS}</span><span class="tag-c">C${stepC}</span></div>`;
          } else if (onShortest) {
            dualTag = `<div class="target-route-tag"><span class="tag-s">S${stepS}</span></div>`;
          } else if (onComm) {
            dualTag = `<div class="target-route-tag"><span class="tag-c">C${stepC}</span></div>`;
          }

          content.innerHTML = `
            <div class="target-marker">
              <div class="target-pulse"></div>
              <span class="target-flag">🎯</span>
              <span class="target-tag">GOAL</span>
              ${dualTag}
            </div>
          `;
        }

        // 6. Robot layer (ROBOT marker, drawn on top)
        if (isRover) {
          cell.classList.add('is-rover');
          const isEmergency = roverState.state === CONFIG.ROBOT_STATES.EMERGENCY_STOP ||
                              roverState.state === CONFIG.ROBOT_STATES.COMM_TIMEOUT;

          content.innerHTML = `
            ${isStart ? '<span class="start-badge-corner">START</span>' : ''}
            <div class="rover-marker ${isEmergency ? 'is-halted' : ''}" style="--heading-deg: ${roverState.heading}deg">
              <div class="rover-body">
                <div class="rover-arrow" style="transform: rotate(${roverState.heading}deg)">▲</div>
                <div class="rover-label">ROBOT</div>
              </div>
            </div>
          `;
        }
      }
    }
  }

  /**
   * Heatmap Color Mapper (Requirement 3):
   * - Above -70 dBm: green (strong)
   * - -70 to -80 dBm: yellow (good)
   * - -80 to -90 dBm: orange (fair)
   * - Below -90 dBm: red (weak)
   * - Unknown/unmeasured: grey
   */
  getRssiColor(rssi) {
    if (rssi === null || rssi === undefined || isNaN(rssi)) {
      return 'rgba(100, 116, 139, 0.45)'; // Grey (Unknown/unmeasured)
    }
    if (rssi > -70) {
      return 'rgba(16, 185, 129, 0.45)'; // Green (Strong: Above -70 dBm)
    } else if (rssi >= -80) {
      return 'rgba(234, 179, 8, 0.50)';  // Yellow (Good: -70 to -80 dBm)
    } else if (rssi >= -90) {
      return 'rgba(249, 115, 22, 0.55)'; // Orange (Fair: -80 to -90 dBm)
    } else {
      return 'rgba(239, 68, 68, 0.60)';  // Red (Weak: Below -90 dBm)
    }
  }
}
