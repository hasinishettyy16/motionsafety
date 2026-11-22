// app.js - Main Application Controller
import { CONFIG } from './config.js';
import { TelemetryManager } from './telemetry.js';
import { PathFinder } from './pathfinding.js';
import { ArenaGrid } from './grid.js';
import { MotionController } from './controls.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Engines
  const telemetry = new TelemetryManager();
  const pathFinder = new PathFinder();
  const gridContainer = document.getElementById('arena-grid-container');

  const grid = new ArenaGrid(gridContainer, {
    onTargetChange: (target) => {
      updatePathPlan();
      updateGridReadout();
    },
    onObstaclesChange: (obstacles) => {
      updatePathPlan();
      updateGridReadout();
    },
    onCellClick: ({ col, row, mode }) => {
      if (mode === 'destination') showCellProfile(col, row);
    }
  });

  const controls = new MotionController(telemetry, pathFinder, grid);

  // 2. DOM Elements Cache
  const elStatusBadge = document.getElementById('status-badge');
  const elWatchdogStatus = document.getElementById('watchdog-status');
  const elCommLossBanner = document.getElementById('comm-loss-banner');
  const elCommLossMsg = document.getElementById('comm-loss-message');
  const elEStopBanner = document.getElementById('estop-banner');
  const elBtnResumeEstop = document.getElementById('btn-resume-estop');

  const elMetricRssi = document.getElementById('metric-rssi');
  const elRssiBar = document.getElementById('rssi-progress-bar');
  const elMetricSnr = document.getElementById('metric-snr');
  const elMetricPdr = document.getElementById('metric-pdr');
  const elPdrBar = document.getElementById('pdr-progress-bar');
  const elMetricState = document.getElementById('metric-state');
  const elMetricSeq = document.getElementById('metric-seq');

  const elRoverCoord = document.getElementById('rover-coord');
  const elTargetCoord = document.getElementById('target-coord');
  const elRouteSteps = document.getElementById('route-steps');

  const elLogTableBody = document.getElementById('telemetry-tbody');
  const elLogCountBadge = document.getElementById('log-count-badge');

  // Simulation controls
  const elSliderRssi = document.getElementById('sim-slider-rssi');
  const elValRssi = document.getElementById('sim-val-rssi');
  const elSliderLoss = document.getElementById('sim-slider-loss');
  const elValLoss = document.getElementById('sim-val-loss');
  const elSliderSpeed = document.getElementById('sim-slider-speed');
  const elValSpeed = document.getElementById('sim-val-speed');

  const elBtnSimTimeout = document.getElementById('btn-sim-timeout');
  const elBtnSimRestore = document.getElementById('btn-sim-restore');
  const elBtnSimResetRover = document.getElementById('btn-sim-reset-rover');
  const elBtnPresetObstacle = document.getElementById('btn-preset-obstacle');
  const elBtnClearObstacles = document.getElementById('btn-clear-obstacles');
  const elBtnClearTarget = document.getElementById('btn-clear-target');

  const elBtnExportCsv = document.getElementById('btn-export-csv');
  const elBtnClearLogs = document.getElementById('btn-clear-logs');

  const elToggleHeatmap = document.getElementById('toggle-heatmap');
  const elModeTarget = document.getElementById('tool-mode-target');
  const elModeObstacle = document.getElementById('tool-mode-obstacle');

  // 3. Path Planning Helper
  function getCellRssi(col, row) { return telemetry.getCellSimulatedRssi(col, row); }

  function showCellProfile(col, row) {
    const panel = document.getElementById('cell-profile-readout');
    const profile = telemetry.getCellProfile(col, row);
    if (!panel) return;
    if (!profile) {
      panel.innerHTML = `<strong>Cell (${col}, ${row})</strong><span class="profile-obstacle">PHYSICAL OBSTACLE — no cell fingerprint</span>`;
      return;
    }
    const time = new Date(profile.timestamp).toLocaleTimeString();
    panel.innerHTML = `<div class="profile-coordinate">CELL (${col}, ${row}) <span class="profile-status">${profile.status}</span></div>
      <div class="profile-metrics"><span><small>RSSI</small><b>${profile.rssi} dBm</b></span><span><small>SNR</small><b>${profile.snr} dB</b></span><span><small>PDR</small><b>${profile.pdr}%</b></span><span><small>Samples</small><b>${profile.samples}</b></span></div><small class="profile-time">Updated ${time} · simulated fingerprint</small>`;
  }

  function updatePathPlan() {
    if (grid.targetCell) {
      const start = { col: telemetry.rover.col, row: telemetry.rover.row };
      const shortest = pathFinder.findShortestPath(start, grid.targetCell, grid.obstacles);
      const commAware = pathFinder.findCommAwarePath(start, grid.targetCell, grid.obstacles, getCellRssi);
      grid.setRoutes({ shortest, commAware });
      const shortestEval = pathFinder.evaluateRoute(shortest, getCellRssi);
      const commEval = pathFinder.evaluateRoute(commAware, getCellRssi);
      if (shortestEval) {
        const distanceCm = shortestEval.steps * CONFIG.ARENA.CELL_SIZE_CM;
        elRouteSteps.textContent = `${shortestEval.steps} steps (${distanceCm} cm)`;
      } else {
        elRouteSteps.textContent = 'No valid path';
      }
      updateRouteComparison(shortestEval, commEval);
    } else {
      grid.setRoutes({ shortest: [], commAware: [] });
      elRouteSteps.textContent = 'None (Set goal)';
      updateRouteComparison(null, null);
    }
    grid.update(telemetry.rover, telemetry);
  }


  function updateRouteComparison(shortEval, commEval) {
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText('compare-short-steps', shortEval ? `${shortEval.steps} steps` : 'No route');
    setText('compare-short-rssi', shortEval ? `Avg RSSI: ${shortEval.avgRssi} dBm` : 'Avg RSSI: —');
    setText('compare-short-weak', shortEval ? `Weak cells: ${shortEval.weakCount}` : 'Weak cells: —');
    setText('compare-comm-steps', commEval ? `${commEval.steps} steps` : 'No route');
    setText('compare-comm-rssi', commEval ? `Avg RSSI: ${commEval.avgRssi} dBm` : 'Avg RSSI: —');
    setText('compare-comm-weak', commEval ? `Weak cells: ${commEval.weakCount}` : 'Weak cells: —');
    setText('compare-comm-cost', commEval ? `${commEval.weightedCost} units` : '—');
    const explain = document.getElementById('route-decision-explanation');
    if (!explain) return;
    if (!shortEval || !commEval) { explain.textContent = 'No valid route is available with the current goal and obstacles.'; return; }
    const extra = commEval.steps - shortEval.steps;
    const weakAvoided = shortEval.weakCount - commEval.weakCount;
    if (commEval.weightedCost < shortEval.weightedCost) {
      const weakDetail = weakAvoided > 0 ? `it avoids ${weakAvoided} weak-signal cell(s)` : (weakAvoided === 0 ? 'weak-cell exposure is unchanged' : `it encounters ${Math.abs(weakAvoided)} more weak-signal cell(s)`);
      explain.textContent = `The GREEN communication-aware route is preferred because its calculated cost is lower (${commEval.weightedCost} vs ${shortEval.weightedCost}); ${weakDetail}. It uses ${commEval.steps} step(s) compared with ${shortEval.steps} for BLUE.`;
    } else if (commEval.weightedCost === shortEval.weightedCost) {
      explain.textContent = `The route costs tie at ${commEval.weightedCost} weighted units. The GREEN route is also ${commEval.steps} step(s); radio penalties do not give either route a lower cost for this goal.`;
    } else if (extra > 0 && weakAvoided > 0) {
      explain.textContent = `The GREEN route accepts ${extra} extra step(s) and avoids ${weakAvoided} weak-signal cell(s). Its calculated cost is ${commEval.weightedCost} versus ${shortEval.weightedCost} for the shortest route.`;
    } else {
      explain.textContent = `Both planners evaluated the current RSSI map. GREEN communication-aware route: ${commEval.steps} steps, cost ${commEval.weightedCost}; BLUE shortest route: ${shortEval.steps} steps, cost ${shortEval.weightedCost}.`;
    }
  }

  function updateGridReadout() {
    elRoverCoord.textContent = `(${telemetry.rover.col}, ${telemetry.rover.row}) @ ${telemetry.rover.heading}°`;
    if (grid.targetCell) {
      elTargetCoord.textContent = `(${grid.targetCell.col}, ${grid.targetCell.row})`;
    } else {
      elTargetCoord.textContent = 'Not set';
    }
  }

  // 4. Telemetry Event Subscriptions
  telemetry.subscribe('onTelemetryUpdate', ({ metrics, rover }) => {
    // Update live metrics cards
    elMetricRssi.textContent = `${metrics.rssi} dBm`;
    elMetricSnr.textContent = `${metrics.snr} dB`;
    elMetricPdr.textContent = `${metrics.pdr}%`;
    elMetricSeq.textContent = `#${metrics.packetSeq}`;
    elMetricState.textContent = rover.state;

    // RSSI Bar calculation (range -110 dBm [0%] to -50 dBm [100%])
    const rssiPercent = Math.max(0, Math.min(100, Math.round(((metrics.rssi + 110) / 60) * 100)));
    elRssiBar.style.width = `${rssiPercent}%`;
    if (metrics.rssi > CONFIG.LINK.RSSI_STRONG_DBM) {
      elRssiBar.style.backgroundColor = 'var(--color-success)';
    } else if (metrics.rssi > CONFIG.LINK.RSSI_WEAK_DBM) {
      elRssiBar.style.backgroundColor = 'var(--color-warning)';
    } else {
      elRssiBar.style.backgroundColor = 'var(--color-danger)';
    }

    // PDR Bar
    elPdrBar.style.width = `${metrics.pdr}%`;
    if (metrics.pdr >= 80) {
      elPdrBar.style.backgroundColor = 'var(--color-success)';
    } else if (metrics.pdr >= 50) {
      elPdrBar.style.backgroundColor = 'var(--color-warning)';
    } else {
      elPdrBar.style.backgroundColor = 'var(--color-danger)';
    }

    // State Badge class
    elMetricState.className = `metric-state-badge state-${rover.state.toLowerCase()}`;

    // Status Badge & Comm Loss Banner
    updateLinkStatusBadge(metrics.linkStatus);

    const elapsed = metrics.packetAgeMs ?? (Date.now() - metrics.lastPacketTimestamp);
    elWatchdogStatus.textContent = `Packet age: ${elapsed}ms`;

    // Redraw Grid
    updatePathPlan();
    updateGridReadout();
  });

  // Watchdog timeout event
  telemetry.subscribe('onWatchdogTimeout', ({ elapsed, message }) => {
    elWatchdogStatus.textContent = `Packet age: ${elapsed}ms`;
    elMetricPdr.textContent = `${telemetry.metrics.pdr}%`;
    elPdrBar.style.width = `${telemetry.metrics.pdr}%`;
    elCommLossBanner.classList.remove('hidden');
    elCommLossMsg.textContent = message;
    updateLinkStatusBadge('DISCONNECTED');
    updatePathPlan();
  });

  telemetry.subscribe('onLinkStatusChange', ({ status }) => {
    updateLinkStatusBadge(status);
  });

  // Log record event
  telemetry.subscribe('onLogEntry', (record) => {
    addLogRow(record);
  });

  function updateLinkStatusBadge(status) {
    elStatusBadge.className = `status-badge status-${status.toLowerCase()}`;
    if (status === 'CONNECTED') {
      elStatusBadge.innerHTML = `<span class="status-dot"></span> CONNECTED`;
      elCommLossBanner.classList.add('hidden');
    } else if (status === 'WEAK') {
      elStatusBadge.innerHTML = `<span class="status-dot"></span> WEAK SIGNAL`;
      elCommLossBanner.classList.add('hidden');
    } else {
      elStatusBadge.innerHTML = `<span class="status-dot"></span> DISCONNECTED`;
      elCommLossBanner.classList.remove('hidden');
    }
  }

  // Add Row to Telemetry Table
  function addLogRow(rec) {
    const tr = document.createElement('tr');
    tr.className = `log-row state-${rec.state.toLowerCase()}`;
    tr.innerHTML = `
      <td>${rec.id}</td>
      <td>${rec.time}</td>
      <td>(${rec.col}, ${rec.row})</td>
      <td>${rec.heading}°</td>
      <td class="${rec.rssi > -75 ? 'text-good' : (rec.rssi > -85 ? 'text-fair' : 'text-poor')}">${rec.rssi} dBm</td>
      <td>${rec.snr} dB</td>
      <td class="${rec.pdr >= 80 ? 'text-good' : 'text-poor'}">${rec.pdr}%</td>
      <td><span class="badge-mini status-${rec.linkStatus.toLowerCase()}">${rec.linkStatus}</span></td>
      <td><span class="badge-mini state-${rec.state.toLowerCase()}">${rec.state}</span></td>
    `;

    elLogTableBody.prepend(tr);
    while (elLogTableBody.children.length > 100) {
      elLogTableBody.removeChild(elLogTableBody.lastChild);
    }
    elLogCountBadge.textContent = `${telemetry.logs.length} records`;
  }

  // 5. Emergency Stop Event Wiring
  controls.on('onEmergencyTriggered', ({ message }) => {
    elEStopBanner.classList.remove('hidden');
    document.querySelectorAll('.btn-estop').forEach(btn => btn.classList.add('is-active'));
  });

  elBtnResumeEstop.addEventListener('click', () => {
    controls.resumeEmergencyStop();
    elEStopBanner.classList.add('hidden');
    document.querySelectorAll('.btn-estop').forEach(btn => btn.classList.remove('is-active'));
  });

  document.querySelectorAll('.btn-estop').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.triggerEmergencyStop();
    });
  });

  // 6. Navigation Tabs & Mode Wiring
  const tabManual = document.getElementById('tab-manual');
  const tabAuto = document.getElementById('tab-auto');
  const panelManual = document.getElementById('panel-manual');
  const panelAuto = document.getElementById('panel-auto');

  tabManual.addEventListener('click', () => {
    tabManual.classList.add('active');
    tabAuto.classList.remove('active');
    panelManual.classList.remove('hidden');
    panelAuto.classList.add('hidden');
    controls.setMode('manual');
  });

  tabAuto.addEventListener('click', () => {
    tabAuto.classList.add('active');
    tabManual.classList.remove('active');
    panelAuto.classList.remove('hidden');
    panelManual.classList.add('hidden');
    controls.setMode('auto');
  });

  // D-Pad Click Handlers
  document.getElementById('btn-up').addEventListener('click', () => controls.manualMove(0, -1, CONFIG.DIRECTIONS.NORTH));
  document.getElementById('btn-down').addEventListener('click', () => controls.manualMove(0, 1, CONFIG.DIRECTIONS.SOUTH));
  document.getElementById('btn-left').addEventListener('click', () => controls.manualMove(-1, 0, CONFIG.DIRECTIONS.WEST));
  document.getElementById('btn-right').addEventListener('click', () => controls.manualMove(1, 0, CONFIG.DIRECTIONS.EAST));
  document.getElementById('btn-stop').addEventListener('click', () => controls.manualStop());

  // Auto Nav Buttons
  const btnStartMission = document.getElementById('btn-start-mission');
  const btnPauseMission = document.getElementById('btn-pause-mission');
  const elAutoNavStatusMsg = document.getElementById('auto-nav-status-msg');

  btnStartMission.addEventListener('click', () => {
    controls.startAutoNav();
  });

  btnPauseMission.addEventListener('click', () => {
    controls.pauseAutoNav();
  });

  controls.on('onAutoNavStatus', ({ running, arrived, message }) => {
    elAutoNavStatusMsg.textContent = message;
    if (running) {
      btnStartMission.classList.add('hidden');
      btnPauseMission.classList.remove('hidden');
    } else {
      btnStartMission.classList.remove('hidden');
      btnPauseMission.classList.add('hidden');
    }
  });

  // 7. Grid Tools Wiring
  elModeTarget.addEventListener('click', () => {
    grid.setToolMode('destination');
    elModeTarget.classList.add('active');
    elModeObstacle.classList.remove('active');
  });

  elModeObstacle.addEventListener('click', () => {
    grid.setToolMode('obstacle');
    elModeObstacle.classList.add('active');
    elModeTarget.classList.remove('active');
  });

  elBtnClearTarget.addEventListener('click', () => {
    grid.setTarget(null, null);
  });

  elBtnPresetObstacle.addEventListener('click', () => {
    grid.setPresetObstacle();
  });

  elBtnClearObstacles.addEventListener('click', () => {
    grid.clearObstacles();
  });

  elToggleHeatmap.addEventListener('change', (e) => {
    grid.toggleHeatmap(e.target.checked);
    grid.update(telemetry.rover, telemetry);
  });

  // 8. Simulation Sliders & Buttons Wiring
  elSliderRssi.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    telemetry.simParams.baseRssi = val;
    elValRssi.textContent = `${val} dBm`;
    updatePathPlan();
  });


  elSliderLoss.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    telemetry.simParams.packetLossRate = val;
    elValLoss.textContent = `${val}%`;
  });

  elSliderSpeed.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    controls.navStepDelay = val;
    elValSpeed.textContent = `${val} ms`;
  });

  elBtnSimTimeout.addEventListener('click', () => {
    controls.pauseAutoNav();
    telemetry.severLink();
    elCommLossMsg.textContent = 'SIMULATED: link lost. Navigation paused and simulated safe state engaged.';
    elBtnSimTimeout.classList.add('hidden');
    elBtnSimRestore.classList.remove('hidden');
  });

  elBtnSimRestore.addEventListener('click', () => {
    telemetry.restoreLink();
    elBtnSimTimeout.classList.remove('hidden');
    elBtnSimRestore.classList.add('hidden');
    elCommLossBanner.classList.add('hidden');
    elAutoNavStatusMsg.textContent = 'Link recovered in simulation. Navigation remains paused; press Start to resume.';
  });

  elBtnSimResetRover.addEventListener('click', () => {
    controls.pauseAutoNav();
    controls.resumeEmergencyStop();
    elEStopBanner.classList.add('hidden');
    document.querySelectorAll('.btn-estop').forEach(btn => btn.classList.remove('is-active'));
    telemetry.setRoverPosition(0, 0, CONFIG.DIRECTIONS.EAST);
    telemetry.setRoverState(CONFIG.ROBOT_STATES.IDLE);
    updatePathPlan();
  });

  // Guided demonstration sequence (simulation only)
  const demoStart = document.getElementById('btn-demo-start');
  const demoStop = document.getElementById('btn-demo-stop');
  const demoCaption = document.getElementById('demo-caption');
  const demoTitle = document.getElementById('demo-stage-title');
  const demoText = document.getElementById('demo-stage-text');
  let demoTimer = null;
  let demoStage = 0;
  const demoStages = [
    ['Arena and fixed obstacles', '6×4 arena: each cell is 20 cm. Physical obstacles are fixed at (2,1) and (2,2).'],
    ['Start and selected goal', 'Start is (0,0). Demo selects goal (5,3), and both planners recalculate.'],
    ['Simulated radio heatmap', 'Turn on the heatmap. All free-cell RSSI values are synthetic, not measured.'],
    ['Shortest route comparison', 'The BLUE route is BFS shortest path, constrained to four-direction movement.'],
    ['Communication-aware route', 'The GREEN route is Dijkstra weighted by movement cost and cell radio penalty.'],
    ['Simulated robot movement', 'Robot movement is software-only. It follows the shortest route in this demonstration.'],
    ['Communication degradation', 'Packets are interrupted. Link changes to LOST and the simulation enters a safe pause state.'],
    ['Safe pause state', 'Motion remains paused while the simulated communication link is unavailable.'],
    ['Simulated recovery', 'Restore the simulated link. The robot remains stopped until Start is pressed to resume.']
  ];
  function stopDemo() {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
    controls.pauseAutoNav();
    demoStart.classList.remove('hidden'); demoStop.classList.add('hidden');
    demoCaption.classList.add('hidden');
  }
  function showDemoStage(index) {
    demoStage = index;
    if (index >= demoStages.length) { stopDemo(); return; }
    demoTitle.textContent = `DEMO ${index + 1}/${demoStages.length} · ${demoStages[index][0]}`;
    demoText.textContent = demoStages[index][1];
    demoCaption.classList.remove('hidden');
    if (index === 1) grid.setTarget(5, 3);
    if (index === 2) { elToggleHeatmap.checked = true; grid.toggleHeatmap(true); }
    if (index === 5) { controls.pauseAutoNav(); telemetry.restoreLink(); controls.startAutoNav(); }
    if (index === 6) { controls.pauseAutoNav(); telemetry.severLink(); elCommLossMsg.textContent = 'DEMO: simulated communication loss. Motion paused in simulated safe state.'; elBtnSimTimeout.classList.add('hidden'); elBtnSimRestore.classList.remove('hidden'); }
    if (index === 8) { telemetry.restoreLink(); elCommLossBanner.classList.add('hidden'); elBtnSimTimeout.classList.remove('hidden'); elBtnSimRestore.classList.add('hidden'); controls.pauseAutoNav(); elAutoNavStatusMsg.textContent = 'Recovered. Press Start to resume motion simulation.'; }
  }
  demoStart.addEventListener('click', () => {
    stopDemo();
    telemetry.restoreLink();
    elCommLossBanner.classList.add('hidden');
    elBtnSimTimeout.classList.remove('hidden');
    elBtnSimRestore.classList.add('hidden');
    grid.setPresetObstacle();
    telemetry.setRoverPosition(0, 0, CONFIG.DIRECTIONS.EAST);
    telemetry.setRoverState(CONFIG.ROBOT_STATES.IDLE);
    grid.setTarget(5, 3);
    elModeTarget.classList.add('active'); elModeObstacle.classList.remove('active');
    showDemoStage(0);
    demoStart.classList.add('hidden'); demoStop.classList.remove('hidden');
    demoTimer = setInterval(() => showDemoStage(demoStage + 1), 4000);
  });
  demoStop.addEventListener('click', () => { controls.pauseAutoNav(); stopDemo(); });

  // 9. CSV Export & Clear Logs
  elBtnExportCsv.addEventListener('click', () => {
    telemetry.exportCsv();
  });

  elBtnClearLogs.addEventListener('click', () => {
    if (confirm('Clear all recorded telemetry log entries?')) {
      telemetry.clearLogs();
      elLogTableBody.innerHTML = '';
      elLogCountBadge.textContent = '0 records';
    }
  });

  // Initial render
  grid.setPresetObstacle(); // Set default physical obstacle between cells
  updatePathPlan();
  updateGridReadout();
});
