# 🪐 Astra Ring Sound Machine

The Astra Ring Sound Machine is an AI-crafted, browser-based musical instrument. Eight interactive rings let you play single notes, chords, or melodic patterns, with real-time pitch bending and loop/record capabilities — no installation required.

---

## Features

| Feature | How to use |
|---|---|
| **Three play modes** | Click **Single Note**, **Chord**, or **Pattern** at the top to switch modes. |
| **Tap a ring** | Tap a ring once to play it in the current mode. Tap again to toggle continuous looping. |
| **Pitch bending** | Click-hold a ring and drag **up** to bend the pitch higher, **down** to bend lower (±12 semitones). Release to reset. |
| **Sustain** | Press the **Sustain** button (toggles on/off) to make notes ring out longer. |
| **Repeat mode** | Press the **Repeat** button to enable pattern-repeat mode — tapping a ring will loop it continuously until you tap again. |
| **Custom patterns** | Press the **＋ Pattern** button (or right-click any ring) to open the pattern editor for that ring. Enter space-separated notes like `C4 E4 G4 C5` and save. |
| **Recording** | Press **⏺ Record** to start capturing your playing. Press **⏹ Stop Rec** to finish. You'll be prompted to name the clip, which is saved as a **token** in your browser. |
| **Tokens** | Saved clips appear in the **My Tokens** panel. Press ▶ **Play** to replay a clip, or 🗑 **Delete** to remove it. Tokens persist in local storage across sessions. |
| **Stop All** | Press **⏹ Stop All** to immediately silence all sounds and loops. |

---

## Getting Started

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. No build step or server required.

---

## Project Structure

```
index.html   – Main page and UI layout
style.css    – Dark-theme styles
audio.js     – Web Audio API engine (notes, chords, patterns, bending)
rings.js     – Ring definitions (notes, chords, patterns per ring)
tokens.js    – Token (saved-clip) storage via localStorage
app.js       – Main application logic, event handling
```

---

## Browser Compatibility

Requires Web Audio API support (all modern browsers). The AudioContext is created on first user interaction to comply with autoplay policies.
