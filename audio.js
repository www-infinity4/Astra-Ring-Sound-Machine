/**
 * audio.js – Web Audio API helpers for the Astra Ring Sound Machine.
 *
 * Provides:
 *  - noteToFreq(note)            – convert note name (e.g. "C4") to Hz
 *  - playNote(freq, duration)    – play a single sine-bell tone
 *  - playChord(notes, duration)  – play multiple notes simultaneously
 *  - playPattern(notes, bpm)     – play notes sequentially at a given BPM
 *  - stopAll()                   – immediately cut all scheduled audio
 */

const AudioEngine = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- Note → Frequency ----------
  const NOTE_MAP = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5,
                     'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };

  function noteToFreq(note) {
    const m = note.trim().match(/^([A-Ga-g][#b]?)(\d)$/);
    if (!m) return null;
    const semitone = NOTE_MAP[m[1].toUpperCase()] ?? NOTE_MAP[m[1]];
    if (semitone === undefined) return null;
    const octave = parseInt(m[2], 10);
    return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
  }

  // ---------- Core tone builder ----------
  function makeTone(freq, startTime, duration, gainValue = 0.25) {
    const ac = getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.01);
    gain.gain.setValueAtTime(gainValue, startTime + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);

    return { osc, gain };
  }

  // Active nodes for stopAll()
  const active = new Set();

  function track(node) {
    active.add(node);
    node.osc.onended = () => active.delete(node);
  }

  // ---------- Public API ----------

  /**
   * Play a single note.
   * @param {string|number} noteOrFreq  - Note name ("C4") or raw Hz
   * @param {number}        duration    - Seconds
   * @param {number}        bendSemitones - pitch bend offset in semitones
   */
  function playNote(noteOrFreq, duration = 0.6, bendSemitones = 0) {
    const ac = getCtx();
    let freq = typeof noteOrFreq === 'number' ? noteOrFreq : noteToFreq(noteOrFreq);
    if (!freq) return;
    if (bendSemitones) freq *= Math.pow(2, bendSemitones / 12);
    track(makeTone(freq, ac.currentTime, duration));
  }

  /**
   * Play multiple notes as a chord.
   * @param {string[]} notes
   * @param {number}   duration
   * @param {number}   bendSemitones
   */
  function playChord(notes, duration = 0.8, bendSemitones = 0) {
    const ac = getCtx();
    notes.forEach(n => {
      let freq = noteToFreq(n);
      if (!freq) return;
      if (bendSemitones) freq *= Math.pow(2, bendSemitones / 12);
      track(makeTone(freq, ac.currentTime, duration, 0.18));
    });
  }

  /**
   * Play notes as a melodic pattern (sequentially).
   * @param {string[]} notes
   * @param {number}   bpm
   * @param {number}   bendSemitones
   * @returns {number} total duration in seconds
   */
  function playPattern(notes, bpm = 120, bendSemitones = 0) {
    const ac = getCtx();
    const noteDur = 60 / bpm;
    notes.forEach((n, i) => {
      let freq = noteToFreq(n);
      if (!freq) return;
      if (bendSemitones) freq *= Math.pow(2, bendSemitones / 12);
      const start = ac.currentTime + i * noteDur;
      track(makeTone(freq, start, noteDur * 0.85, 0.22));
    });
    return notes.length * noteDur;
  }

  /** Stop all currently playing sounds immediately. */
  function stopAll() {
    active.forEach(({ osc, gain }) => {
      try {
        const ac = getCtx();
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.02);
        osc.stop(ac.currentTime + 0.03);
      } catch (err) {
        if (!(err instanceof DOMException)) {
          console.warn('AudioEngine stopAll: unexpected error:', err);
        }
        /* already stopped */ }
    });
    active.clear();
  }

  return { noteToFreq, playNote, playChord, playPattern, stopAll, getCtx };
})();
