/**
 * app.js – Main application logic for the Astra Ring Sound Machine.
 *
 * Handles:
 *  - Rendering rings (with drag-to-reorder grip handles and ♭/♯ semitone buttons)
 *  - Mode switching (single / chord / pattern)
 *  - Tap-to-loop per ring
 *  - Pointer-drag note bending (drag up = pitch up, drag down = pitch down)
 *  - Per-ring semitone offset via ♭/♯ buttons
 *  - Pulse animation toggle (off by default)
 *  - Sustain hold button
 *  - Repeat-pattern hold button
 *  - Pattern editor modal with preset buttons + custom input
 *  - Recording events → saving as tokens
 *  - Playback of saved tokens
 */

(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let currentMode       = 'single';
  let sustainActive     = false;
  let repeatActive      = false;
  let pulseActive       = false;
  let isRecording       = false;
  let recordStart       = 0;
  let recordEvents      = [];
  let patternTargetRing = null;  // ring id being edited in modal

  // Bend state per-pointer
  const bendState = {};   // pointerId → { startY, ringId, hasDragged }
  let globalBendSemitones = 0;

  // Repeat-loop handles per ring
  const loopHandles = {};

  // Drag-to-reorder state
  let dragId     = null;   // ring id being dragged
  let dragOverId = null;   // ring id currently hovered during drag
  let dragGripEl = null;   // the grip element that captured the pointer

  const BPM                 = 120;
  const SUSTAIN_DUR         = 2.0;   // seconds when sustain is active
  const BASE_DUR            = 0.6;
  const PIXELS_PER_SEMITONE = 8;     // pointer drag pixels required to shift 1 semitone
  const NOTE_LOOP_MS        = 700;   // single-note loop interval (ms)
  const CHORD_LOOP_MS       = 900;   // chord loop interval (ms)

  // ── DOM refs ──────────────────────────────────────────────────────────
  const ringStage        = document.getElementById('ringStage');
  const bendIndicator    = document.getElementById('bendIndicator');
  const btnSustain       = document.getElementById('btnSustain');
  const btnRepeat        = document.getElementById('btnRepeat');
  const btnPulse         = document.getElementById('btnPulse');
  const btnAdd           = document.getElementById('btnAdd');
  const btnRecord        = document.getElementById('btnRecord');
  const btnStopAll       = document.getElementById('btnStopAll');
  const patternModal     = document.getElementById('patternModal');
  const patternRingLabel = document.getElementById('patternRingLabel');
  const patternInput     = document.getElementById('patternInput');
  const patternSave      = document.getElementById('patternSave');
  const patternCancel    = document.getElementById('patternCancel');
  const presetGrid       = document.getElementById('presetGrid');
  const tokenList        = document.getElementById('tokenList');

  // ── Ring Rendering ────────────────────────────────────────────────────
  function buildRings() {
    ringStage.innerHTML = '';
    ringState.forEach(r => {
      const wrapper = document.createElement('div');
      wrapper.className = 'ring-wrapper';
      wrapper.dataset.ringId = r.id;

      // Grip handle for drag-to-reorder
      const grip = document.createElement('div');
      grip.className = 'ring-move-handle';
      grip.title = 'Drag to reorder';
      grip.textContent = '⠿';
      grip.addEventListener('pointerdown', onGripPointerDown);

      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.id = `ring-${r.id}`;
      ring.dataset.ringId = r.id;
      ring.style.borderColor = r.color;

      const noteName = document.createElement('span');
      noteName.className = 'ring-note-name';
      noteName.id = `ring-note-${r.id}`;
      noteName.textContent = r.baseNote;

      ring.appendChild(noteName);

      const label = document.createElement('div');
      label.className = 'ring-label';
      label.textContent = r.name;

      // ♭ / offset-display / ♯ controls
      const bendControls = document.createElement('div');
      bendControls.className = 'ring-bend-controls';

      const flatBtn = document.createElement('button');
      flatBtn.className = 'semitone-btn flat-btn';
      flatBtn.textContent = '♭';
      flatBtn.title = 'Flatten pitch by 1 semitone';
      flatBtn.dataset.ringId = r.id;
      flatBtn.addEventListener('click', onFlatBtn);

      const offsetDisplay = document.createElement('span');
      offsetDisplay.className = 'semitone-offset';
      offsetDisplay.id = `offset-${r.id}`;
      offsetDisplay.textContent = '0';

      const sharpBtn = document.createElement('button');
      sharpBtn.className = 'semitone-btn sharp-btn';
      sharpBtn.textContent = '♯';
      sharpBtn.title = 'Sharpen pitch by 1 semitone';
      sharpBtn.dataset.ringId = r.id;
      sharpBtn.addEventListener('click', onSharpBtn);

      bendControls.appendChild(flatBtn);
      bendControls.appendChild(offsetDisplay);
      bendControls.appendChild(sharpBtn);

      wrapper.appendChild(grip);
      wrapper.appendChild(ring);
      wrapper.appendChild(label);
      wrapper.appendChild(bendControls);
      ringStage.appendChild(wrapper);

      // Ring sound / bend events
      ring.addEventListener('pointerdown',   onRingPointerDown);
      ring.addEventListener('pointermove',   onRingPointerMove);
      ring.addEventListener('pointerup',     onRingPointerUp);
      ring.addEventListener('pointercancel', onRingPointerUp);
    });
  }

  function updateRingNoteDisplay(ringId) {
    const notes = getRingNotes(ringId, currentMode);
    const el    = document.getElementById(`ring-note-${ringId}`);
    if (!el) return;
    el.textContent = notes.length === 1 ? notes[0] : notes.join(' ');
  }

  function updateAllNoteDisplays() {
    ringState.forEach(r => updateRingNoteDisplay(r.id));
  }

  function updateOffsetDisplay(ringId) {
    const el = document.getElementById(`offset-${ringId}`);
    if (!el) return;
    const offset = ringState[ringId].semitoneOffset;
    el.textContent = offset > 0 ? `+${offset}` : `${offset}`;
    el.style.color = offset !== 0 ? 'var(--accent2)' : 'var(--muted)';
  }

  // ── Mode Switching ────────────────────────────────────────────────────
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      updateAllNoteDisplays();
    });
  });

  // ── Play Helpers ──────────────────────────────────────────────────────
  function playRing(ringId, bend = globalBendSemitones) {
    const notes     = getRingNotes(ringId, currentMode);
    const dur       = sustainActive ? SUSTAIN_DUR : BASE_DUR;
    const totalBend = bend + (ringState[ringId].semitoneOffset || 0);

    if (currentMode === 'single') {
      AudioEngine.playNote(notes[0], dur, totalBend);
    } else if (currentMode === 'chord') {
      AudioEngine.playChord(notes, dur, totalBend);
    } else {
      AudioEngine.playPattern(notes, BPM, totalBend);
    }

    if (isRecording) {
      recordEvents.push({
        type: 'play',
        ringId,
        mode: currentMode,
        bendSemitones: totalBend,
        t: performance.now() - recordStart,
      });
    }
  }

  // ── Ring Pointer Interactions (sound + bend) ──────────────────────────
  function onRingPointerDown(e) {
    e.preventDefault();
    const ring   = e.currentTarget;
    const ringId = parseInt(ring.dataset.ringId, 10);

    ring.setPointerCapture(e.pointerId);
    ring.classList.add('active');

    bendState[e.pointerId] = { startY: e.clientY, ringId, hasDragged: false };
    playRing(ringId);
  }

  function onRingPointerMove(e) {
    const state = bendState[e.pointerId];
    if (!state) return;

    const deltaY    = state.startY - e.clientY;   // up = positive = pitch up
    const semitones = Math.round(deltaY / PIXELS_PER_SEMITONE);
    const clamped   = Math.max(-12, Math.min(12, semitones));

    if (Math.abs(clamped) >= 1) state.hasDragged = true;

    globalBendSemitones = clamped;
    bendIndicator.textContent = `Bend: ${globalBendSemitones > 0 ? '+' : ''}${globalBendSemitones} st`;
  }

  function onRingPointerUp(e) {
    const ring   = e.currentTarget;
    const ringId = parseInt(ring.dataset.ringId, 10);
    const state  = bendState[e.pointerId];

    ring.classList.remove('active');
    delete bendState[e.pointerId];

    globalBendSemitones = 0;
    bendIndicator.textContent = 'Bend: 0 st';

    if (!state?.hasDragged) {
      toggleLoop(ringId);
    }
  }

  // ── Per-ring semitone offset (♭/♯ buttons) ────────────────────────────
  function onFlatBtn(e) {
    e.stopPropagation();
    const ringId = parseInt(e.currentTarget.dataset.ringId, 10);
    ringState[ringId].semitoneOffset = Math.max(-12, (ringState[ringId].semitoneOffset || 0) - 1);
    updateOffsetDisplay(ringId);
  }

  function onSharpBtn(e) {
    e.stopPropagation();
    const ringId = parseInt(e.currentTarget.dataset.ringId, 10);
    ringState[ringId].semitoneOffset = Math.min(12, (ringState[ringId].semitoneOffset || 0) + 1);
    updateOffsetDisplay(ringId);
  }

  // ── Drag-to-reorder (grip handle) ─────────────────────────────────────
  function onGripPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const wrapper = e.currentTarget.closest('.ring-wrapper');
    dragId    = parseInt(wrapper.dataset.ringId, 10);
    dragGripEl = e.currentTarget;
    wrapper.classList.add('dragging');
    dragGripEl.setPointerCapture(e.pointerId);
    dragGripEl.addEventListener('pointermove',   onGripPointerMove);
    dragGripEl.addEventListener('pointerup',     onGripPointerUp);
    dragGripEl.addEventListener('pointercancel', onGripPointerUp);
  }

  function onGripPointerMove(e) {
    if (dragId === null) return;
    const wrappers = [...ringStage.querySelectorAll('.ring-wrapper:not(.dragging)')];
    let closest = null;
    let closestDist = Infinity;
    wrappers.forEach(w => {
      const rect = w.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - (rect.left + rect.width / 2),
                              e.clientY - (rect.top  + rect.height / 2));
      if (dist < closestDist) { closestDist = dist; closest = w; }
    });
    ringStage.querySelectorAll('.ring-wrapper').forEach(w => w.classList.remove('drag-over'));
    if (closest && closestDist < 120) {
      closest.classList.add('drag-over');
      dragOverId = parseInt(closest.dataset.ringId, 10);
    } else {
      dragOverId = null;
    }
  }

  function onGripPointerUp(e) {
    if (dragId === null) return;
    const draggingWrapper = ringStage.querySelector(`.ring-wrapper[data-ring-id="${dragId}"]`);
    if (draggingWrapper) draggingWrapper.classList.remove('dragging');
    ringStage.querySelectorAll('.ring-wrapper').forEach(w => w.classList.remove('drag-over'));
    if (dragGripEl) {
      dragGripEl.removeEventListener('pointermove',   onGripPointerMove);
      dragGripEl.removeEventListener('pointerup',     onGripPointerUp);
      dragGripEl.removeEventListener('pointercancel', onGripPointerUp);
    }
    if (dragOverId !== null && dragOverId !== dragId) {
      const srcIdx = ringState.findIndex(r => r.id === dragId);
      const dstIdx = ringState.findIndex(r => r.id === dragOverId);
      if (srcIdx !== -1 && dstIdx !== -1) {
        const [item] = ringState.splice(srcIdx, 1);
        ringState.splice(dstIdx, 0, item);
      }
      buildRings();
      updateAllNoteDisplays();
      ringState.forEach(r => updateOffsetDisplay(r.id));
    }
    dragId = null; dragOverId = null; dragGripEl = null;
  }

  // ── Looping ───────────────────────────────────────────────────────────
  function toggleLoop(ringId) {
    if (ringState[ringId].looping) {
      stopLoop(ringId);
    } else {
      startLoop(ringId);
    }
  }

  function startLoop(ringId) {
    if (loopHandles[ringId]) return;
    ringState[ringId].looping = true;
    const ringEl = document.getElementById(`ring-${ringId}`);
    if (ringEl) {
      ringEl.classList.add('looping');
      if (pulseActive) ringEl.classList.add('pulsing');
    }

    function getLoopMs() {
      if (currentMode === 'pattern') {
        return (getRingNotes(ringId, currentMode).length * 60 / BPM) * 1000;
      }
      return currentMode === 'chord' ? CHORD_LOOP_MS : NOTE_LOOP_MS;
    }

    function tick() {
      playRing(ringId, 0);
      loopHandles[ringId] = setTimeout(tick, getLoopMs());
    }
    loopHandles[ringId] = setTimeout(tick, getLoopMs());
  }

  function stopLoop(ringId) {
    ringState[ringId].looping = false;
    const ringEl = document.getElementById(`ring-${ringId}`);
    if (ringEl) ringEl.classList.remove('looping', 'pulsing');
    if (loopHandles[ringId]) {
      clearTimeout(loopHandles[ringId]);
      delete loopHandles[ringId];
    }
  }

  function stopAllLoops() {
    ringState.forEach(r => stopLoop(r.id));
  }

  // ── Transport Buttons ─────────────────────────────────────────────────

  btnSustain.addEventListener('click', () => {
    sustainActive = !sustainActive;
    btnSustain.classList.toggle('active', sustainActive);
  });

  btnRepeat.addEventListener('click', () => {
    repeatActive = !repeatActive;
    btnRepeat.classList.toggle('active', repeatActive);
    if (!repeatActive) stopAllLoops();
  });

  btnPulse.addEventListener('click', () => {
    pulseActive = !pulseActive;
    btnPulse.classList.toggle('active', pulseActive);
    // Apply / remove pulse glow on all currently looping rings
    document.querySelectorAll('.ring.looping').forEach(el => {
      el.classList.toggle('pulsing', pulseActive);
    });
  });

  btnAdd.addEventListener('click', () => {
    openPatternModal(patternTargetRing ?? 0);
  });

  // Right-click a ring → open its pattern editor
  ringStage.addEventListener('contextmenu', e => {
    const ring = e.target.closest('.ring');
    if (!ring) return;
    e.preventDefault();
    openPatternModal(parseInt(ring.dataset.ringId, 10));
  });

  // Track last-touched ring for + button
  ringStage.addEventListener('pointerdown', e => {
    const ring = e.target.closest('.ring');
    if (ring) patternTargetRing = parseInt(ring.dataset.ringId, 10);
  });

  btnRecord.addEventListener('click', () => {
    if (isRecording) stopRecording(); else startRecording();
  });

  btnStopAll.addEventListener('click', () => {
    AudioEngine.stopAll();
    stopAllLoops();
  });

  // ── Recording ─────────────────────────────────────────────────────────
  function startRecording() {
    isRecording   = true;
    recordStart   = performance.now();
    recordEvents  = [];
    btnRecord.classList.add('recording');
    btnRecord.textContent = '⏹ Stop Rec';
  }

  function stopRecording() {
    isRecording = false;
    btnRecord.classList.remove('recording');
    btnRecord.textContent = '⏺ Record';
    if (recordEvents.length === 0) return;
    const name = prompt('Save clip as token — enter a name:', `Clip ${TokenStore.getAll().length + 1}`);
    if (name === null) return;
    TokenStore.saveToken(name, recordEvents);
    renderTokens();
  }

  // ── Pattern Modal ─────────────────────────────────────────────────────
  function openPatternModal(ringId) {
    patternTargetRing = ringId;
    patternRingLabel.textContent = ringState[ringId].name;
    patternInput.value = ringState[ringId].pattern.join(' ');

    // Populate preset buttons (each transposed to this ring's root note)
    presetGrid.innerHTML = '';
    PATTERN_PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = preset.name;
      btn.title = `Apply "${preset.name}" transposed to ${ringState[ringId].baseNote}`;
      btn.addEventListener('click', () => {
        const notes = transposePattern(ringState[ringId].baseNote, preset.intervals);
        if (notes.length) {
          setRingPattern(ringId, notes);
          updateRingNoteDisplay(ringId);
        }
        closePatternModal();
      });
      presetGrid.appendChild(btn);
    });

    patternModal.classList.remove('hidden');
    patternInput.focus();
  }

  function closePatternModal() {
    patternModal.classList.add('hidden');
  }

  patternSave.addEventListener('click', () => {
    const notes = parseNotes(patternInput.value);
    if (!notes) {
      alert('Invalid notes. Use format: C4 E4 G4 C5');
      return;
    }
    setRingPattern(patternTargetRing, notes);
    updateRingNoteDisplay(patternTargetRing);
    closePatternModal();
  });

  patternCancel.addEventListener('click', closePatternModal);

  patternModal.addEventListener('click', e => {
    if (e.target === patternModal) closePatternModal();
  });

  patternInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') patternSave.click();
    if (e.key === 'Escape') closePatternModal();
  });

  // ── Token Rendering & Playback ────────────────────────────────────────
  function renderTokens() {
    const tokens = TokenStore.getAll();
    if (tokens.length === 0) {
      tokenList.innerHTML = '<p class="empty-tokens">No tokens yet. Record a clip to create one!</p>';
      return;
    }
    tokenList.innerHTML = '';
    tokens.forEach(token => {
      const card = document.createElement('div');
      card.className = 'token-card';
      card.innerHTML = `
        <div class="token-info">
          <div class="token-name">${escapeHtml(token.name)}</div>
          <div class="token-meta">${new Date(token.createdAt).toLocaleString()} · ${token.events.length} event(s)</div>
        </div>
        <div class="token-actions">
          <button class="btn-play"   data-id="${token.id}">▶ Play</button>
          <button class="btn-delete" data-id="${token.id}">🗑 Delete</button>
        </div>
      `;
      tokenList.appendChild(card);
    });
    tokenList.querySelectorAll('.btn-play').forEach(btn => {
      btn.addEventListener('click', () => playToken(btn.dataset.id));
    });
    tokenList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        TokenStore.deleteToken(btn.dataset.id);
        renderTokens();
      });
    });
  }

  function playToken(tokenId) {
    const token = TokenStore.getToken(tokenId);
    if (!token || token.events.length === 0) return;
    token.events.forEach(ev => {
      setTimeout(() => {
        const notes = getRingNotes(ev.ringId, ev.mode);
        const dur   = BASE_DUR;
        if (ev.mode === 'single') {
          AudioEngine.playNote(notes[0], dur, ev.bendSemitones);
        } else if (ev.mode === 'chord') {
          AudioEngine.playChord(notes, dur, ev.bendSemitones);
        } else {
          AudioEngine.playPattern(notes, BPM, ev.bendSemitones);
        }
      }, ev.t);
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Init ──────────────────────────────────────────────────────────────
  buildRings();
  updateAllNoteDisplays();
  renderTokens();
})();
