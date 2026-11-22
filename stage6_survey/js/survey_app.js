/**
 * survey_app.js - Frontend Client Controller for Stage 6 Manual Radio Survey.
 * Connects UI interactions to the Stage 6 Survey Server & SurveyEngine.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements Cache ---
  const elGridContainer = document.getElementById('arena-grid-container');
  const elReadoutSelected = document.getElementById('readout-selected-cell');
  const elReadoutConfirmed = document.getElementById('readout-confirmed-cell');
  const elBtnConfirmPos = document.getElementById('btn-confirm-position');
  const elBtnConfirmTarget = document.getElementById('btn-confirm-target');
  const elLockedWarning = document.getElementById('locked-cell-warning');
  const elLockedCellName = document.getElementById('locked-cell-name');

  const elBatchStatusBadge = document.getElementById('batch-status-badge');
  const elBatchStatusText = document.getElementById('batch-status-text');
  const elPosMethodChip = document.getElementById('pos-method-chip');
  const elHeaderDataSource = document.getElementById('header-data-source');
  const elBatchIdTag = document.getElementById('batch-id-tag');

  const elInputSurveyId = document.getElementById('input-survey-id');
  const elBtnStartBatch = document.getElementById('btn-start-batch');
  const elBtnStopBatch = document.getElementById('btn-stop-batch');
  const elActiveBatchBox = document.getElementById('active-batch-info-box');
  const elAbCell = document.getElementById('ab-cell');
  const elAbCondition = document.getElementById('ab-condition');
  const elAbPacketCount = document.getElementById('ab-packet-count');
  const elAbId = document.getElementById('ab-id');

  const elRawJsonInput = document.getElementById('raw-json-input');
  const elBtnParseJson = document.getElementById('btn-parse-json');
  const elBtnSampleJson = document.getElementById('btn-sample-json');
  const elJsonParseStatus = document.getElementById('json-parse-status');

  const elForm = document.getElementById('packet-entry-form');
  const elFSeq = document.getElementById('f-seq');
  const elFRssi = document.getElementById('f-rssi');
  const elFSnr = document.getElementById('f-snr');
  const elFEncLeft = document.getElementById('f-enc-left');
  const elFEncRight = document.getElementById('f-enc-right');
  const elFAx = document.getElementById('f-ax');
  const elFAy = document.getElementById('f-ay');
  const elFAz = document.getElementById('f-az');
  const elFGz = document.getElementById('f-gz');
  const elFPwmLeft = document.getElementById('f-pwm-left');
  const elFPwmRight = document.getElementById('f-pwm-right');
  const elBtnSavePacket = document.getElementById('btn-save-packet');
  const elBtnClearForm = document.getElementById('btn-clear-form');

  const elNotifBanner = document.getElementById('notification-banner');
  const elNotifMessage = document.getElementById('notif-message');
  const elBtnCloseNotif = document.getElementById('btn-close-notif');

  const elTabPackets = document.getElementById('tab-packets');
  const elTabSummary = document.getElementById('tab-summary');
  const elPanelPackets = document.getElementById('panel-packets');
  const elPanelSummary = document.getElementById('panel-summary');
  const elPacketsTbody = document.getElementById('packets-tbody');
  const elSummaryTbody = document.getElementById('summary-tbody');
  const elTotalPacketCount = document.getElementById('total-packet-count');
  const elMeasuredCellCount = document.getElementById('measured-cell-count');

  // Radio pills
  const pillCondClean = document.getElementById('label-cond-clean');
  const pillCondFoil = document.getElementById('label-cond-foil');
  const pillSourceLive = document.getElementById('label-source-live');
  const pillSourceTest = document.getElementById('label-source-test');

  // State
  let state = {
    selected_cell_id: null,
    confirmed_cell_id: null,
    active_batch: null,
    current_survey_id: 'SURVEY_001',
    current_condition: 'NO_OBSTACLE',
    current_data_source: 'LIVE',
    cells: [],
    cellSummaries: {}
  };

  // --- API Helpers ---
  async function apiFetch(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  function showNotification(msg, type = 'info') {
    elNotifBanner.className = `alert-banner banner-${type}`;
    elNotifMessage.textContent = msg;
    elNotifBanner.classList.remove('hidden');
  }

  elBtnCloseNotif.addEventListener('click', () => {
    elNotifBanner.classList.add('hidden');
  });

  // --- 1. Grid Rendering ---
  function renderGrid(cells) {
    elGridContainer.innerHTML = '';
    cells.forEach(cell => {
      const div = document.createElement('div');
      div.className = 'survey-cell';
      div.dataset.cellId = cell.cell_id;
      div.dataset.x = cell.x;
      div.dataset.y = cell.y;
      // Explicit CSS Grid row/column positioning (x: 0..5 -> col 1..6, y: 0..3 -> row 1..4)
      div.style.gridColumn = String(cell.x + 1);
      div.style.gridRow = String(cell.y + 1);

      if (cell.is_obstacle) {
        div.classList.add('is-obstacle');
        div.innerHTML = `
          <div class="cell-top">
            <span class="cell-name">${cell.cell_id}</span>
            <span class="cell-coords">(${cell.x},${cell.y})</span>
          </div>
          <div class="cell-obstacle-badge">🧱 WALL</div>
          <div class="cell-center-info">${cell.center_x_cm},${cell.center_y_cm}cm</div>
        `;
      } else {
        div.innerHTML = `
          <div class="cell-top">
            <span class="cell-name">${cell.cell_id}</span>
            <span class="cell-coords">(${cell.x},${cell.y})</span>
          </div>
          <div class="cell-rf-info" id="rf-info-${cell.cell_id}">--</div>
          <div class="cell-center-info">${cell.center_x_cm},${cell.center_y_cm}cm</div>
        `;
      }

      div.addEventListener('click', () => handleCellClick(cell));
      elGridContainer.appendChild(div);
    });
  }

  function updateGridStyles() {
    const isBatchActive = state.active_batch && state.active_batch.is_active;

    document.querySelectorAll('.survey-cell').forEach(cellEl => {
      const cid = cellEl.dataset.cellId;
      cellEl.classList.remove('is-selected', 'is-confirmed', 'is-measured');

      // Remove any leftover pins
      const pin = cellEl.querySelector('.cell-pin-badge');
      if (pin) pin.remove();

      if (cid === state.selected_cell_id) {
        cellEl.classList.add('is-selected');
      }

      if (cid === state.confirmed_cell_id) {
        cellEl.classList.add('is-confirmed');
        const pinBadge = document.createElement('span');
        pinBadge.className = 'cell-pin-badge';
        pinBadge.textContent = 'ROBOT';
        cellEl.appendChild(pinBadge);
      }

      // Check summary for measured status
      const summary = state.cellSummaries[cid];
      const rfEl = document.getElementById(`rf-info-${cid}`);
      if (summary && summary.packet_count > 0 && rfEl) {
        cellEl.classList.add('is-measured');
        rfEl.innerHTML = `<span class="cell-measured-badge">${summary.median_rssi_dbm} dBm (${summary.packet_count})</span>`;
      } else if (rfEl && !cellEl.classList.contains('is-obstacle')) {
        rfEl.textContent = '--';
      }
    });

    // Update active batch locked banner
    if (isBatchActive) {
      elLockedWarning.classList.remove('hidden');
      elLockedCellName.textContent = state.active_batch.cell_id;
    } else {
      elLockedWarning.classList.add('hidden');
    }
  }

  async function handleCellClick(cell) {
    if (cell.is_obstacle) {
      showNotification(`Cell ${cell.cell_id} is a physical wall barrier. Measurements cannot be recorded here.`, 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/select_cell', {
        method: 'POST',
        body: JSON.stringify({ cell_id: cell.cell_id })
      });
      state.selected_cell_id = res.selected_cell_id;
      elReadoutSelected.textContent = res.selected_cell_id;
      elBtnConfirmTarget.textContent = res.selected_cell_id;
      elBtnConfirmPos.disabled = false;
      updateGridStyles();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  }

  // --- 2. Position Confirmation ---
  elBtnConfirmPos.addEventListener('click', async () => {
    if (!state.selected_cell_id) return;
    try {
      const res = await apiFetch('/api/confirm_position', { method: 'POST' });
      state.confirmed_cell_id = res.confirmed_cell_id;
      elReadoutConfirmed.textContent = `${res.confirmed_cell_id} (MANUAL_CONFIRMED)`;
      elPosMethodChip.textContent = 'MANUAL_CONFIRMED';
      elBtnConfirmPos.disabled = true;

      // Enable start batch if not already active
      if (!state.active_batch || !state.active_batch.is_active) {
        elBtnStartBatch.disabled = false;
      }
      showNotification(`Position confirmed at cell ${res.confirmed_cell_id}. Ready to start survey batch.`, 'success');
      updateGridStyles();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  });

  // --- 3. Condition & Source Selection ---
  function getSelectedCondition() {
    const radio = document.querySelector('input[name="obstacle_condition"]:checked');
    return radio ? radio.value : 'NO_OBSTACLE';
  }

  function getSelectedSource() {
    const radio = document.querySelector('input[name="data_source"]:checked');
    return radio ? radio.value : 'LIVE';
  }

  pillCondClean.addEventListener('click', () => {
    pillCondClean.classList.add('active');
    pillCondFoil.classList.remove('active');
    pillCondClean.querySelector('input').checked = true;
    syncConfig();
  });

  pillCondFoil.addEventListener('click', () => {
    pillCondFoil.classList.add('active');
    pillCondClean.classList.remove('active');
    pillCondFoil.querySelector('input').checked = true;
    syncConfig();
  });

  pillSourceLive.addEventListener('click', () => {
    pillSourceLive.classList.add('active');
    pillSourceTest.classList.remove('active');
    pillSourceLive.querySelector('input').checked = true;
    elHeaderDataSource.textContent = 'LIVE';
    elHeaderDataSource.className = 'badge-live';
    syncConfig();
  });

  pillSourceTest.addEventListener('click', () => {
    pillSourceTest.classList.add('active');
    pillSourceLive.classList.remove('active');
    pillSourceTest.querySelector('input').checked = true;
    elHeaderDataSource.textContent = 'TEST_FIXTURE';
    elHeaderDataSource.className = 'badge-fixture';
    syncConfig();
  });

  async function syncConfig() {
    const survey_id = elInputSurveyId.value.trim() || 'SURVEY_001';
    const obstacle_condition = getSelectedCondition();
    const data_source = getSelectedSource();

    try {
      const res = await apiFetch('/api/set_config', {
        method: 'POST',
        body: JSON.stringify({ survey_id, obstacle_condition, data_source })
      });
      state.current_survey_id = res.current_survey_id;
      state.current_condition = res.current_condition;
      state.current_data_source = res.current_data_source;
      refreshSummaries();
      refreshRecordsTable();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  }

  elInputSurveyId.addEventListener('change', syncConfig);

  // --- 4. Batch Lifecycle ---
  elBtnStartBatch.addEventListener('click', async () => {
    const survey_id = elInputSurveyId.value.trim() || 'SURVEY_001';
    const obstacle_condition = getSelectedCondition();
    const data_source = getSelectedSource();

    try {
      const res = await apiFetch('/api/start_batch', {
        method: 'POST',
        body: JSON.stringify({ survey_id, obstacle_condition, data_source })
      });
      state.active_batch = { ...res, is_active: true, packet_count: 0 };
      updateBatchUI();
      showNotification(`Batch started for Cell ${res.cell_id} (${res.obstacle_condition}). You may now record packets.`, 'success');
      updateGridStyles();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  });

  elBtnStopBatch.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/stop_batch', { method: 'POST' });
      showNotification(`Batch ${res.batch_id} ended. Recorded ${res.packet_count} packet(s) at ${res.cell_id}.`, 'info');
      state.active_batch = null;
      updateBatchUI();
      updateGridStyles();
      refreshSummaries();
      refreshRecordsTable();
    } catch (err) {
      showNotification(err.message, 'error');
    }
  });

  function updateBatchUI() {
    const isBatchActive = state.active_batch && state.active_batch.is_active;

    if (isBatchActive) {
      elBatchStatusBadge.className = 'status-badge status-active';
      elBatchStatusText.textContent = 'RECORDING ACTIVE';
      elBatchIdTag.textContent = state.active_batch.batch_id;

      elBtnStartBatch.classList.add('hidden');
      elBtnStopBatch.classList.remove('hidden');
      elBtnSavePacket.disabled = false;

      elActiveBatchBox.classList.remove('hidden');
      elAbCell.textContent = state.active_batch.cell_id;
      elAbCondition.textContent = state.active_batch.obstacle_condition;
      elAbPacketCount.textContent = state.active_batch.packet_count;
      elAbId.textContent = state.active_batch.batch_id;

      // Lock batch inputs while active
      elInputSurveyId.disabled = true;
      pillCondClean.style.pointerEvents = 'none';
      pillCondFoil.style.pointerEvents = 'none';
    } else {
      elBatchStatusBadge.className = 'status-badge status-idle';
      elBatchStatusText.textContent = 'IDLE / WAITING';
      elBatchIdTag.textContent = 'NO BATCH';

      elBtnStartBatch.classList.remove('hidden');
      elBtnStopBatch.classList.add('hidden');
      elBtnSavePacket.disabled = true;

      elActiveBatchBox.classList.add('hidden');
      elBtnStartBatch.disabled = !state.confirmed_cell_id;

      elInputSurveyId.disabled = false;
      pillCondClean.style.pointerEvents = 'auto';
      pillCondFoil.style.pointerEvents = 'auto';
    }
  }

  // --- 5. JSON Parsing ---
  elBtnSampleJson.addEventListener('click', () => {
    const sample = {
      telemetry: [1184, 0.0, 0.0, 0.00, 0.00, 0.00, 0.00, 0, 0],
      rssi: -103,
      snr: 1.50,
      receivedCount: 904
    };
    elRawJsonInput.value = JSON.stringify(sample);
  });

  elBtnParseJson.addEventListener('click', async () => {
    const raw = elRawJsonInput.value.trim();
    if (!raw) {
      setParseStatus('Paste or enter raw ESP32 JSON telemetry string first.', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/parse_json', {
        method: 'POST',
        body: JSON.stringify({ raw_json: raw })
      });
      const p = res.packet;

      // Populate form
      if (p.sequence_number !== undefined) elFSeq.value = p.sequence_number;
      if (p.rssi_dbm !== undefined) elFRssi.value = p.rssi_dbm;
      if (p.snr_db !== undefined) elFSnr.value = p.snr_db;
      if (p.left_encoder_rate !== undefined) elFEncLeft.value = p.left_encoder_rate;
      if (p.right_encoder_rate !== undefined) elFEncRight.value = p.right_encoder_rate;
      if (p.ax !== undefined) elFAx.value = p.ax;
      if (p.ay !== undefined) elFAy.value = p.ay;
      if (p.az !== undefined) elFAz.value = p.az;
      if (p.gz !== undefined) elFGz.value = p.gz;
      if (p.left_pwm !== undefined) elFPwmLeft.value = p.left_pwm;
      if (p.right_pwm !== undefined) elFPwmRight.value = p.right_pwm;

      setParseStatus(
        `✓ Parsed! Sequence: ${p.sequence_number}, RSSI: ${p.rssi_dbm} dBm, SNR: ${p.snr_db} dB. Review fields below and click "Save Packet".`,
        'success'
      );
    } catch (err) {
      setParseStatus(`Parse Error: ${err.message}`, 'error');
    }
  });

  function setParseStatus(msg, type) {
    elJsonParseStatus.className = `parse-status-box ${type}`;
    elJsonParseStatus.textContent = msg;
    elJsonParseStatus.classList.remove('hidden');
  }

  elBtnClearForm.addEventListener('click', () => {
    elForm.reset();
    elJsonParseStatus.classList.add('hidden');
  });

  // --- 6. Packet Recording ---
  elBtnSavePacket.addEventListener('click', async () => {
    if (!state.active_batch || !state.active_batch.is_active) {
      showNotification('Cannot record packet: No batch is active. Start a batch first!', 'error');
      return;
    }

    const seqVal = elFSeq.value.trim();
    if (seqVal === '' || isNaN(parseInt(seqVal, 10))) {
      showNotification('Sequence number is required and must be an integer.', 'error');
      elFSeq.focus();
      return;
    }

    const rssiVal = elFRssi.value.trim();
    const snrVal = elFSnr.value.trim();

    const packet = {
      sequence_number: parseInt(seqVal, 10),
      rssi_dbm: rssiVal !== '' ? parseFloat(rssiVal) : null,
      snr_db: snrVal !== '' ? parseFloat(snrVal) : null,
      left_encoder_rate: elFEncLeft.value !== '' ? parseFloat(elFEncLeft.value) : null,
      right_encoder_rate: elFEncRight.value !== '' ? parseFloat(elFEncRight.value) : null,
      ax: elFAx.value !== '' ? parseFloat(elFAx.value) : null,
      ay: elFAy.value !== '' ? parseFloat(elFAy.value) : null,
      az: elFAz.value !== '' ? parseFloat(elFAz.value) : null,
      gz: elFGz.value !== '' ? parseFloat(elFGz.value) : null,
      left_pwm: elFPwmLeft.value !== '' ? parseInt(elFPwmLeft.value, 10) : null,
      right_pwm: elFPwmRight.value !== '' ? parseInt(elFPwmRight.value, 10) : null
    };

    try {
      const res = await apiFetch('/api/record_packet', {
        method: 'POST',
        body: JSON.stringify({ packet })
      });

      const rec = res.record;
      state.active_batch.packet_count += 1;
      elAbPacketCount.textContent = state.active_batch.packet_count;

      showNotification(`Saved packet #${rec.sequence_number} at cell ${rec.cell_id} (RSSI: ${rec.rssi_dbm} dBm, SNR: ${rec.snr_db} dB)`, 'success');

      // Auto-increment sequence number for quick next manual packet
      elFSeq.value = rec.sequence_number + 1;

      refreshSummaries();
      refreshRecordsTable();
    } catch (err) {
      showNotification(`Record Rejected: ${err.message}`, 'error');
    }
  });

  // --- 7. Table and Summary Refresh ---
  async function refreshRecordsTable() {
    try {
      const survey_id = state.current_survey_id;
      const condition = state.current_condition;
      const res = await apiFetch(`/api/records?survey_id=${encodeURIComponent(survey_id)}&condition=${encodeURIComponent(condition)}`);

      const records = res.records || [];
      elTotalPacketCount.textContent = records.length;

      if (records.length === 0) {
        elPacketsTbody.innerHTML = `<tr class="empty-row"><td colspan="10">No packets recorded yet for ${condition}.</td></tr>`;
        return;
      }

      elPacketsTbody.innerHTML = records.map(r => `
        <tr>
          <td><strong>#${r.sequence_number}</strong></td>
          <td><span class="text-cyan font-bold">${r.cell_id}</span> (${r.x},${r.y})</td>
          <td><span class="text-emerald">${r.obstacle_condition}</span></td>
          <td><span class="${r.data_source === 'LIVE' ? 'text-rose' : 'text-amber'}">${r.data_source}</span></td>
          <td>${r.rssi_dbm !== null ? `${r.rssi_dbm} dBm` : '<span class="text-dim">null</span>'}</td>
          <td>${r.snr_db !== null ? `${r.snr_db} dB` : '<span class="text-dim">null</span>'}</td>
          <td>${r.left_encoder_rate ?? '--'} / ${r.right_encoder_rate ?? '--'}</td>
          <td>${r.ax ?? '--'}, ${r.ay ?? '--'}, ${r.az ?? '--'}</td>
          <td>${r.left_pwm ?? '--'} / ${r.right_pwm ?? '--'}</td>
          <td><small>${formatTime(r.received_at)}</small></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to refresh records:', err);
    }
  }

  async function refreshSummaries() {
    try {
      const survey_id = state.current_survey_id;
      const condition = state.current_condition;
      const res = await apiFetch(`/api/summary?survey_id=${encodeURIComponent(survey_id)}&condition=${encodeURIComponent(condition)}`);

      state.cellSummaries = res.summary || {};

      let measuredCount = 0;
      const rows = [];

      for (const [cid, s] of Object.entries(state.cellSummaries)) {
        if (s.packet_count > 0 && !s.is_obstacle) measuredCount++;

        let statusClass = 'text-dim';
        if (s.status === 'MEASURED') statusClass = 'text-emerald';
        if (s.status === 'BLOCKED') statusClass = 'text-rose';
        if (s.status === 'INCOMPLETE') statusClass = 'text-amber';

        rows.push(`
          <tr>
            <td><strong>${cid}</strong></td>
            <td>(${s.x}, ${s.y})</td>
            <td>${s.obstacle_condition}</td>
            <td><span class="${statusClass} font-bold">${s.status}</span></td>
            <td>${s.packet_count}</td>
            <td>${s.median_rssi_dbm !== null ? `${s.median_rssi_dbm} dBm` : '--'}</td>
            <td>${s.median_snr_db !== null ? `${s.median_snr_db} dB` : '--'}</td>
            <td>${s.missing_packets ?? '--'}</td>
            <td>${s.pdr_percent !== null ? `${s.pdr_percent}%` : '--'}</td>
          </tr>
        `);
      }

      elMeasuredCellCount.textContent = `${measuredCount}/22`;
      elSummaryTbody.innerHTML = rows.join('');
      updateGridStyles();
    } catch (err) {
      console.error('Failed to refresh summary:', err);
    }
  }

  function formatTime(isoStr) {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch (e) {
      return isoStr;
    }
  }

  // --- 8. Tabs ---
  elTabPackets.addEventListener('click', () => {
    elTabPackets.classList.add('active');
    elTabSummary.classList.remove('active');
    elPanelPackets.classList.remove('hidden');
    elPanelSummary.classList.add('hidden');
  });

  elTabSummary.addEventListener('click', () => {
    elTabSummary.classList.add('active');
    elTabPackets.classList.remove('active');
    elPanelSummary.classList.remove('hidden');
    elPanelPackets.classList.add('hidden');
  });

  // --- Initial Bootstrap ---
  async function init() {
    try {
      const s = await apiFetch('/api/state');
      state.cells = s.cells || [];
      state.selected_cell_id = s.selected_cell_id;
      state.confirmed_cell_id = s.confirmed_cell_id;
      state.active_batch = s.active_batch;
      state.current_survey_id = s.current_survey_id || 'SURVEY_001';
      state.current_condition = s.current_condition || 'NO_OBSTACLE';
      state.current_data_source = s.current_data_source || 'LIVE';

      elInputSurveyId.value = state.current_survey_id;
      renderGrid(state.cells);
      updateBatchUI();
      updateGridStyles();
      refreshSummaries();
      refreshRecordsTable();
    } catch (err) {
      showNotification(`Initial connection error: ${err.message}. Is server.py running?`, 'error');
    }
  }

  init();
});
