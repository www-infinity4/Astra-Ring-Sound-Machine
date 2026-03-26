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
  { id: 0,  name: 'Ring 1',  baseNote: 'C4',
    chord:   ['C4','E4','G4'],
    pattern: ['C4','D4','E4','G4'],
    color: '#7b2ff7' },

  { id: 1,  name: 'Ring 2',  baseNote: 'D4',
    chord:   ['D4','F#4','A4'],
    pattern: ['D4','F#4','A4','D5'],
    color: '#00d4ff' },

  { id: 2,  name: 'Ring 3',  baseNote: 'E4',
    chord:   ['E4','G#4','B4'],
    pattern: ['E4','G#4','B4','E5'],
    color: '#ff4466' },

  { id: 3,  name: 'Ring 4',  baseNote: 'F4',
    chord:   ['F4','A4','C5'],
    pattern: ['F4','A4','C5','F5'],
    color: '#22dd88' },

  { id: 4,  name: 'Ring 5',  baseNote: 'G4',
    chord:   ['G4','B4','D5'],
    pattern: ['G4','A4','B4','D5'],
    color: '#ffaa22' },

  { id: 5,  name: 'Ring 6',  baseNote: 'A4',
    chord:   ['A4','C#5','E5'],
    pattern: ['A4','B4','C#5','E5'],
    color: '#ff77cc' },

  { id: 6,  name: 'Ring 7',  baseNote: 'B4',
    chord:   ['B4','D#5','F#5'],
    pattern: ['B4','D5','D#5','F#5'],
    color: '#aaffcc' },

  { id: 7,  name: 'Ring 8',  baseNote: 'C5',
    chord:   ['C5','E5','G5'],
    pattern: ['C5','D5','E5','G5'],
    color: '#5588ff' },

  { id: 8,  name: 'Ring 9',  baseNote: 'D5',
    chord:   ['D5','F#5','A5'],
    pattern: ['D5','E5','F#5','A5'],
    color: '#ff6633' },

  { id: 9,  name: 'Ring 10', baseNote: 'E5',
    chord:   ['E5','G#5','B5'],
    pattern: ['E5','F#5','G#5','B5'],
    color: '#33ff99' },

  { id: 10, name: 'Ring 11', baseNote: 'A3',
    chord:   ['A3','C4','E4'],
    pattern: ['A3','C4','E4','A4'],
    color: '#ffcc33' },

  { id: 11, name: 'Ring 12', baseNote: 'Bb4',
    chord:   ['Bb4','D5','F5'],
    pattern: ['Bb4','C5','D5','F5'],
    color: '#3388ff' },

  { id: 12, name: 'Ring 13', baseNote: 'F#4',
    chord:   ['F#4','A#4','C#5'],
    pattern: ['F#4','G#4','A#4','C#5'],
    color: '#ff44cc' },

  { id: 13, name: 'Ring 14', baseNote: 'G3',
    chord:   ['G3','B3','D4'],
    pattern: ['G3','A3','B3','D4'],
    color: '#44ffcc' },

  { id: 14, name: 'Ring 15', baseNote: 'Eb4',
    chord:   ['Eb4','G4','Bb4'],
    pattern: ['Eb4','F4','G4','Bb4'],
    color: '#ff8844' },

  { id: 15, name: 'Ring 16', baseNote: 'C3',
    chord:   ['C3','E3','G3'],
    pattern: ['C3','E3','G3','C4'],
    color: '#44ff88' },
];

/** Mutable ring state (custom patterns edited by user) */
const ringState = RING_DEFS.map(def => ({
  ...def,
  looping:       false,
  loopTimer:     null,
  semitoneOffset: 0,
}));

/**
 * Named pattern presets defined as semitone intervals from the root.
 * Apply with transposePattern(baseNote, preset.intervals).
 */
const PATTERN_PRESETS = [
  { name: 'Major Triad',  intervals: [0, 4, 7] },
  { name: 'Minor Triad',  intervals: [0, 3, 7] },
  { name: 'Sus4',         intervals: [0, 5, 7] },
  { name: 'Pentatonic',   intervals: [0, 2, 4, 7, 9] },
  { name: 'Blues',        intervals: [0, 3, 5, 6, 7, 10] },
  { name: 'Major Scale',  intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Minor Scale',  intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Arp Up',       intervals: [0, 4, 7, 12] },
  { name: 'Arp Down',     intervals: [12, 7, 4, 0] },
  { name: 'Power',        intervals: [0, 7, 12] },
  { name: 'Whole Tone',   intervals: [0, 2, 4, 6, 8, 10] },
  { name: 'Chromatic',    intervals: [0, 1, 2, 3, 4, 5] },
];

/**
 * Build a pattern by transposing a set of semitone intervals relative to a base note.
 * @param {string}   baseNote  - e.g. "C4"
 * @param {number[]} intervals - semitone offsets from root
 * @returns {string[]} note names
 */
function transposePattern(baseNote, intervals) {
  const baseMidi = AudioEngine.noteToMidi(baseNote);
  if (baseMidi === null) return [baseNote];
  return intervals.map(i => AudioEngine.midiToNote(baseMidi + i)).filter(Boolean);
}

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
