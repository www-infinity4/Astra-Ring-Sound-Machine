/**
 * app.js – Main application logic for the Astra Ring Sound Machine.
 *
 * Handles:
 *  - Rendering rings
 *  - Mode switching (single / chord / pattern)
 *  - Tap-to-loop per ring
 *  - Pointer-drag note bending (drag up = pitch up, drag down = pitch down)
 *  - Sustain hold button
 *  - Repeat-pattern hold button
 *  - Pattern editor modal (+ button)
 *  - Recording events → saving as tokens
 *  - Playback of saved tokens
 */

(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let currentMode       = 'single';
  let sustainActive     = false;
  let repeatActive      = false;
  let isRecording       = false;
  let recordStart       = 0;
  let recordEvents      = [];
  let patternTargetRing = null;  // ring id being edited in modal

  // Bend state per-pointer
  const bendState = {};   // pointerId → { startY, ringId }
  let globalBendSemitones = 0;

  // Repeat-loop handles per ring
  const loopHandles = {};

  const BPM                 = 120;
  const SUSTAIN_DUR         = 2.0;   // seconds when sustain is active
  const BASE_DUR            = 0.6;
  const PIXELS_PER_SEMITONE = 8;     // pointer drag pixels required to shift 1 semitone
  const NOTE_LOOP_MS        = 700;   // single-note loop interval (ms)
  const CHORD_LOOP_MS       = 900;   // chord loop interval (ms)

  // ── DOM refs ──────────────────────────────────────────────────────────
  const ringStage      = document.getElementById('ringStage');
  const bendIndicator  = document.getElementById('bendIndicator');
  const btnSustain     = document.getElementById('btnSustain');
  const btnRepeat      = document.getElementById('btnRepeat');
  const btnAdd         = document.getElementById('btnAdd');
  const btnRecord      = document.getElementById('btnRecord');
  const btnStopAll     = document.getElementById('btnStopAll');
  const patternModal   = document.getElementById('patternModal');
  const patternRingLabel = document.getElementById('patternRingLabel');
  const patternInput   = document.getElementById('patternInput');
  const patternSave    = document.getElementById('patternSave');
  const patternCancel  = document.getElementById('patternCancel');
  const tokenList      = document.getElementById('tokenList');

  // ── Ring Rendering ────────────────────────────────────────────────────
  function buildRings() {
    ringStage.innerHTML = '';
    ringState.forEach(r => {
      const wrapper = document.createElement('div');
      wrapper.className = 'ring-wrapper';

      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.id = `ring-${r.id}`;
      ring.dataset.ringId = r.id;
      ring.style.borderColor = r.color;
      ring.style.setProperty('--ring-accent', r.color);

      const noteName = document.createElement('span');
      noteName.className = 'ring-note-name';
      noteName.id = `ring-note-${r.id}`;
      noteName.textContent = r.baseNote;

      ring.appendChild(noteName);

      const label = document.createElement('div');
      label.className = 'ring-label';
      label.textContent = r.name;

      wrapper.appendChild(ring);
      wrapper.appendChild(label);
      ringStage.appendChild(wrapper);

      // Events
      ring.addEventListener('pointerdown',  onRingPointerDown);
      ring.addEventListener('pointermove',  onRingPointerMove);
      ring.addEventListener('pointerup',    onRingPointerUp);
      ring.addEventListener('pointercancel',onRingPointerUp);
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
    const notes = getRingNotes(ringId, currentMode);
    const dur   = sustainActive ? SUSTAIN_DUR : BASE_DUR;

    if (currentMode === 'single') {
      AudioEngine.playNote(notes[0], dur, bend);
    } else if (currentMode === 'chord') {
      AudioEngine.playChord(notes, dur, bend);
    } else {
      AudioEngine.playPattern(notes, BPM, bend);
    }

    // Record event
    if (isRecording) {
      recordEvents.push({
        type: 'play',
        ringId,
        mode: currentMode,
        bendSemitones: bend,
        t: performance.now() - recordStart,
      });
    }
  }

  // ── Ring Pointer Interactions ─────────────────────────────────────────
  function onRingPointerDown(e) {
    e.preventDefault();
    const ring   = e.currentTarget;
    const ringId = parseInt(ring.dataset.ringId, 10);

    ring.setPointerCapture(e.pointerId);
    ring.classList.add('active');

    // Track drag start for bending; hasDragged is set when user moves > 1 semitone
    bendState[e.pointerId] = { startY: e.clientY, ringId, hasDragged: false };

    // Play the ring on press
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

    // Reset bend display
    globalBendSemitones = 0;
    bendIndicator.textContent = 'Bend: 0 st';

    // Quick tap (no drag) → toggle continuous loop for this ring
    if (!state?.hasDragged) {
      toggleLoop(ringId);
    }
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
    document.getElementById(`ring-${ringId}`).classList.add('looping');

    function getLoopMs() {
      if (currentMode === 'pattern') {
        return (getRingNotes(ringId, currentMode).length * 60 / BPM) * 1000;
      }
      if (currentMode === 'chord') return CHORD_LOOP_MS;
      return NOTE_LOOP_MS;
    }

    // Delay the first repeat so it doesn't double-play immediately after
    // the initial press that triggered the loop start.
    function tick() {
      playRing(ringId, 0);
      loopHandles[ringId] = setTimeout(tick, getLoopMs());
    }
    loopHandles[ringId] = setTimeout(tick, getLoopMs());
  }

  function stopLoop(ringId) {
    ringState[ringId].looping = false;
    document.getElementById(`ring-${ringId}`)?.classList.remove('looping');
    if (loopHandles[ringId]) {
      clearTimeout(loopHandles[ringId]);
      delete loopHandles[ringId];
    }
  }

  function stopAllLoops() {
    ringState.forEach(r => stopLoop(r.id));
  }

  // ── Transport Buttons ─────────────────────────────────────────────────

  // Sustain – toggle
  btnSustain.addEventListener('click', () => {
    sustainActive = !sustainActive;
    btnSustain.classList.toggle('active', sustainActive);
  });

  // Repeat – toggle; when active, tapping a ring starts its loop
  btnRepeat.addEventListener('click', () => {
    repeatActive = !repeatActive;
    btnRepeat.classList.toggle('active', repeatActive);
    if (!repeatActive) stopAllLoops();
  });

  // Pattern Editor (+ button) – opens modal for the currently active ring
  // Without a specific ring context (no ring selected), default to ring 0
  btnAdd.addEventListener('click', () => {
    openPatternModal(patternTargetRing ?? 0);
  });

  // Allow right-clicking a ring to jump directly to its pattern editor
  ringStage.addEventListener('contextmenu', e => {
    const ring = e.target.closest('.ring');
    if (!ring) return;
    e.preventDefault();
    openPatternModal(parseInt(ring.dataset.ringId, 10));
  });

  // Update patternTargetRing on ring press so + button knows which ring
  ringStage.addEventListener('pointerdown', e => {
    const ring = e.target.closest('.ring');
    if (ring) patternTargetRing = parseInt(ring.dataset.ringId, 10);
  });

  // Record
  btnRecord.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  // Stop All
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

    // Prompt for clip name
    const name = prompt('Save clip as token — enter a name:', `Clip ${TokenStore.getAll().length + 1}`);
    if (name === null) return;   // user cancelled

    TokenStore.saveToken(name, recordEvents);
    renderTokens();
  }

  // ── Pattern Modal ─────────────────────────────────────────────────────
  function openPatternModal(ringId) {
    patternTargetRing = ringId;
    patternRingLabel.textContent = ringState[ringId].name;
    patternInput.value = ringState[ringId].pattern.join(' ');
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
