/**
 * rings.js – Ring definition and management for the Astra Ring Sound Machine.
 *
 * Each ring has:
 *   - a name / label
 *   - a base note (for single-note mode)
 *   - a chord (array of note names, for chord mode)
 *   - a pattern (array of note names, for pattern mode)
 *   - a colour accent
 */

const RING_DEFS = [
  { id: 0, name: 'Ring 1', baseNote: 'C4',
    chord:   ['C4','E4','G4'],
    pattern: ['C4','D4','E4','G4'],
    color: '#7b2ff7' },

  { id: 1, name: 'Ring 2', baseNote: 'D4',
    chord:   ['D4','F#4','A4'],
    pattern: ['D4','F#4','A4','D5'],
    color: '#00d4ff' },

  { id: 2, name: 'Ring 3', baseNote: 'E4',
    chord:   ['E4','G#4','B4'],
    pattern: ['E4','G#4','B4','E5'],
    color: '#ff4466' },

  { id: 3, name: 'Ring 4', baseNote: 'F4',
    chord:   ['F4','A4','C5'],
    pattern: ['F4','A4','C5','F5'],
    color: '#22dd88' },

  { id: 4, name: 'Ring 5', baseNote: 'G4',
    chord:   ['G4','B4','D5'],
    pattern: ['G4','A4','B4','D5'],
    color: '#ffaa22' },

  { id: 5, name: 'Ring 6', baseNote: 'A4',
    chord:   ['A4','C#5','E5'],
    pattern: ['A4','B4','C#5','E5'],
    color: '#ff77cc' },

  { id: 6, name: 'Ring 7', baseNote: 'B4',
    chord:   ['B4','D#5','F#5'],
    pattern: ['B4','D5','D#5','F#5'],
    color: '#aaffcc' },

  { id: 7, name: 'Ring 8', baseNote: 'C5',
    chord:   ['C5','E5','G5'],
    pattern: ['C5','D5','E5','G5'],
    color: '#5588ff' },
];

/** Mutable ring state (custom patterns edited by user) */
const ringState = RING_DEFS.map(def => ({
  ...def,
  looping:  false,
  loopTimer: null,
}));

/**
 * Parse a space-separated note string into an array of note names.
 * Returns null on invalid input.
 */
function parseNotes(str) {
  const notes = str.trim().split(/\s+/).filter(Boolean);
  for (const n of notes) {
    if (!AudioEngine.noteToFreq(n)) return null;
  }
  return notes.length ? notes : null;
}

/**
 * Update the custom pattern for a ring.
 * @param {number} ringId
 * @param {string[]} notes
 */
function setRingPattern(ringId, notes) {
  ringState[ringId].pattern = notes;
}

/** Return notes to play for a ring given the current mode. */
function getRingNotes(ringId, mode) {
  const r = ringState[ringId];
  switch (mode) {
    case 'chord':   return r.chord;
    case 'pattern': return r.pattern;
    default:        return [r.baseNote];
  }
}
