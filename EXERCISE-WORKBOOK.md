# Attic — Acceptance Test Workbook

> Phase 1 project validation document. Each section describes an exercise to be
> performed manually in the application. Check [ ] when validated.
>
> **Prerequisites**: run `npm run dev:electron` (or `npm run dev` + browser).
> Verify that `tsc` 0 errors · 26 tests · build OK before starting.

---

## 1. Startup and interface

### 1.1 Launch
- [ ] The application starts with no errors in the console
- [ ] The palette is displayed on the left, collapsed at the universe level
- [ ] The canvas occupies the center, the inspector is on the right
- [ ] The toolbar displays the title "Attic" + number of plugins
- [ ] The Run button (green) is visible and not covered by Group/Ungroup

### 1.2 Palette navigation
- [ ] Clicking a universe expands it (e.g.: "Inputs")
- [ ] Clicking a family expands it (e.g.: "Audio")
- [ ] Nodes are sorted alphabetically within each family
- [ ] Search filters nodes (e.g.: type "delay")
- [ ] Search results auto-expand everything

### 1.3 FR/EN bilingual toggle
- [ ] Click the FR/EN toggle (top right)
- [ ] Universes are translated (Inputs, Processing…)
- [ ] Families are translated (Effects, Monitoring…)
- [ ] Node names are translated
- [ ] Notices ("learn more") are translated
- [ ] Parameter docs ("?") are translated
- [ ] Switch back to French

---

## 2. Basic audio workflow

### 2.1 Simple chain
- [ ] Drag an "Audio input" node onto the canvas
- [ ] Load an audio file (WAV or MP3) via the node button
- [ ] The file name is displayed, an audio player appears
- [ ] Drag an "Audio output" node
- [ ] Connect the output of the Audio input to the input of the Audio output (drag)
- [ ] The edge is green (audio type)
- [ ] Click ▶ on the Audio input node → status "Completed"
- [ ] The Audio output player plays the sound
- [ ] Spacebar = run the entire graph

### 2.2 Chained effects
- [ ] Insert a "Filter" between the Input and the Output
- [ ] Set the cutoff frequency to 500 Hz (low-pass)
- [ ] Run → the sound is attenuated in the highs
- [ ] Insert a "Compressor" after the filter
- [ ] Set threshold to −20 dB, ratio 4:1
- [ ] Run → the sound is compressed (denser)

### 2.3 Inspector
- [ ] Select a node → the inspector displays its parameters
- [ ] Change a parameter → the node updates
- [ ] The "learn more" notice expands/collapses
- [ ] Parameter "?" tooltips are displayed
- [ ] The ↺ button resets the node (status → waiting, result cleared)

---

## 3. Copy/paste and deletion

### 3.1 Copy/paste
- [ ] Select a configured node (e.g.: Filter with cutoff set)
- [ ] Ctrl+C → nothing visible but the node is copied
- [ ] Ctrl+V → a new node appears, offset, with the same parameters
- [ ] The copied node has identical name and ports
- [ ] Modifying the copy does not affect the original

### 3.2 Deletion
- [ ] Select a node, click × on the node → the node disappears
- [ ] The inspector empties (does not stay stuck on the old node)
- [ ] Edges connected to the deleted node also disappear
- [ ] Select a node, press Delete → same behavior
- [ ] Delete via the inspector (× button) → the inspector empties

---

## 4. Meta-components

### 4.1 Group
- [ ] Select 2 nodes (ctrl+click or selection rectangle)
- [ ] Click "Group" → a meta-node replaces the 2 nodes
- [ ] The meta appears in the palette (universe "Meta-components")
- [ ] Double-click the meta → opens the inside + breadcrumb
- [ ] Boundary nodes (exposed input/output) are visible
- [ ] Click "Workshop" in the breadcrumb → return to root graph

### 4.2 Ungroup
- [ ] Select the meta-node
- [ ] Click "Ungroup" → the 2 original nodes reappear
- [ ] The meta disappears from the palette

### 4.3 Persistence
- [ ] Create a meta, quit the app, relaunch → the meta is still in the palette
- [ ] Delete a meta via × in the palette → it disappears + its instances in the graph

---

## 5. Audio effects

### 5.1 Convolution reverb (IR)
- [ ] Connect audio to the "Convolution reverb (IR)" node
- [ ] Set Type = Hall, Decay = 3s, Mix = 50%
- [ ] Run → the sound has reverb
- [ ] Change Type = Spring → the sound changes (spring characteristic)
- [ ] Load an external IR file (WAV) via the button → synthesis parameters are ignored
- [ ] The external IR works

### 5.2 Bitcrusher
- [ ] Connect audio
- [ ] Set Bits = 4, Frequency = 8000 Hz, Mix = 100%
- [ ] Run → the sound is very crunchy/aliased (8-bit style)
- [ ] Bits = 16, Frequency = 44100 → the sound is almost unchanged

### 5.3 Gate/Expander
- [ ] Connect audio with silences (e.g.: voice with background noise)
- [ ] Gate mode, Threshold = −40 dB, Attenuation = 40 dB
- [ ] Run → the background noise is cut during silences
- [ ] Expander mode, Ratio = 4 → softer attenuation

### 5.4 De-esser
- [ ] Connect a voice with sibilance (s, ch, sh)
- [ ] Frequency = 7000 Hz, Threshold = −20 dB, Ratio = 3
- [ ] Run → sibilance is attenuated

### 5.5 Ring modulator
- [ ] Connect a continuous sound (e.g.: Frequency generator 440 Hz)
- [ ] Carrier frequency = 200 Hz, Mix = 100%
- [ ] Run → the sound produces sidebands (metallic/alien)

---

## 6. Generators

### 6.1 Frequency generator
- [ ] Frequency mode, 440 Hz, Sine, 2s → a pure A
- [ ] Note mode, "A4", Sine → same result
- [ ] Note mode, "C#5", Square → rich 8-bit sound
- [ ] Verify the anti-click fade (no click at start/end)

### 6.2 Metronome
- [ ] Tempo = 120 BPM, 4/4, Duration = 10s, Timbre = Click
- [ ] Run → regular clicks, first beat accented
- [ ] Change to 3/4 → 3-beat pattern
- [ ] Change to Woodblock → different sound

### 6.3 Noise generator
- [ ] Type = White, 2s → flat spectrum (verify with Spectrum analyzer)
- [ ] Type = Pink → −3 dB/octave
- [ ] Type = Brownian → −6 dB/octave, bass sound

### 6.4 Drum sequencer
- [ ] Click cells in the grid → the pattern updates
- [ ] Tempo = 120, 16 steps → regular kicks
- [ ] Change to 32 steps → grid expands
- [ ] Swing = 50% → ternary groove

### 6.5 Melodic sequencer
- [ ] Click cells in the piano-roll → notes activated
- [ ] Change the scale (e.g.: pentatonic) → rows change
- [ ] The root note is highlighted in yellow
- [ ] Change the timbre (Square) → different sound
- [ ] Run → the melody plays

---

## 7. Neural reservoirs

### 7.1 Audio reservoir
- [ ] Run the node → an emergent melody plays
- [ ] Change Neurons = 5 → shorter/repetitive pattern
- [ ] Change Neurons = 40 → more complex pattern
- [ ] Spectrum = 150% → chaotic sound (divergent)
- [ ] Seed = 12345 → reproducible (same melody on each run)
- [ ] Seed = 0 → new melody on each run

### 7.2 MIDI reservoir
- [ ] Run → a MIDI file is generated (orange port output)
- [ ] Connect to "MIDI output" → the melody plays via FM/SoundFont
- [ ] Connect to "Transposer/Quantizer" then "MIDI output" → transformed melody

### 7.3 Multi-reservoirs
- [ ] Run → a polyphonic piece (melody + bass + harmony + rhythm)
- [ ] Influence = 0% → the 4 voices are independent
- [ ] Influence = 100% → voices only play on rhythmic steps

### 7.4 Reservoir evolution
- [ ] Run → individual 1/6 of generation 1
- [ ] Listen, click ♥ (like) or ✗ (dislike)
- [ ] Navigate ◀/▶ between individuals
- [ ] Click ↻ Evolve → generation 2 (new individuals)
- [ ] After 3-4 generations, melodies improve (adapted to taste)

---

## 8. Generative AI (Transformers.js)

### 8.1 MusicGen
- [ ] Enter a prompt: "A happy upbeat pop song with electric guitars"
- [ ] Duration = 10s, Guidance = 3
- [ ] Run (first run = long: ~300 MB download)
- [ ] The generated music plays
- [ ] Re-run → faster (model cached)

### 8.2 SpeechT5 TTS
- [ ] Connect a "Text source" (min 35 characters) to the input
- [ ] Choose voice BDL (American male)
- [ ] Run → speech is synthesized in English
- [ ] Change voice SLT (female) → different voice

### 8.3 MMS-TTS Multilingual
- [ ] Connect a Text source
- [ ] Language = French
- [ ] Run → speech is in French

### 8.4 Whisper (English)
- [ ] Connect an English voice recording
- [ ] Run → transcribed text is displayed + on the text output
- [ ] Verify transcription quality

### 8.5 Whisper (Multilingual)
- [ ] Connect a French voice recording
- [ ] Language = Auto, Translate = No
- [ ] Run → text transcribed in French
- [ ] Translate = Yes → text translated to English

---

## 9. Data collections

### 9.1 Instrument names
- [ ] Family = Strings → the list contains only strings
- [ ] Format = Line break → names on separate lines
- [ ] Run → text is emitted on the output (blue port)
- [ ] Switch to EN → names are in English

### 9.2 Musical styles
- [ ] Category = Rock → list of rock styles
- [ ] Category = All → all styles mixed
- [ ] Switch to EN → styles are in English

### 9.3 Emotions
- [ ] Category = Joy/Happiness → list of positive emotions
- [ ] Format = Bullets → list with "•"

### 9.4 Voice ranges
- [ ] Group = Men → male ranges with note ranges
- [ ] Group = Women → female ranges

---

## 10. AI tools (script + colors)

### 10.1 AI script generator
- [ ] Connect the 4 sources (Instruments, Styles, Emotions, Voice ranges) to the 4 inputs
- [ ] Run → a structured script is generated (style, instruments, emotions, voice, prompt, tags)
- [ ] Change the seed → a new random draw

### 10.2 Color combination
- [ ] Color 1 = Blue → script with melancholy/blues
- [ ] Color 2 = Red → profile fusion (blue + red)
- [ ] The script is in English (ready for Suno)
- [ ] Switch to EN → color names are translated in the interface

### 10.3 Translation
- [ ] Text source (French) → OPUS-MT Translation, pair = French → English
- [ ] Run → text translated to English on the output
- [ ] Text source → Whisper Translation → English text

---

## 11. Text to Speech / Speech to Text

### 11.1 Text source
- [ ] The node has an editable text area (textarea)
- [ ] The counter displays the number of characters (min 35)
- [ ] The outline is red if < 35 characters
- [ ] The node is resizable (corners/edges)
- [ ] Spaces can be typed

### 11.2 TTS → Whisper chain
- [ ] Text source → SpeechT5 TTS → audio
- [ ] Audio → Whisper (English) → text
- [ ] The transcribed text (approximately) matches the source text

---

## 12. AI separation

### 12.1 Demucs 6s (requires Electron)
- [ ] Connect an audio mix to "AI Separator"
- [ ] Model = Demucs 6s (default)
- [ ] Run → 6 tracks (drums, bass, other, vocals, guitar, piano)
- [ ] Each output produces a distinct sound
- [ ] Model = Demucs (HT) → 4 tracks (guitar/piano = null)

### 12.2 MDX-Net
- [ ] Model = MDX-Net
- [ ] Run → vocals + instrumental (2 tracks)

---

## 13. MIDI

### 13.1 MIDI player → MIDI output
- [ ] Load a MIDI file into "MIDI player"
- [ ] The MIDI output (orange port) is available
- [ ] Connect to "MIDI output" → MIDI is synthesized to audio

### 13.2 Transposer/Quantizer
- [ ] MIDI player → Transposer (Transposition = +5)
- [ ] → MIDI output → the sound is higher
- [ ] Quantization = 1/16 → notes are aligned to the grid

### 13.3 Arpeggiator
- [ ] MIDI player → Arpeggiator (Direction = Up, Speed = 1/16)
- [ ] → MIDI output → chords are arpeggiated
- [ ] Change Direction = UpDown → back-and-forth
- [ ] Octaves = 2 → the arpeggio spans 2 octaves

### 13.4 Chord detector
- [ ] Connect a harmonic audio file
- [ ] Run → the chord progression is displayed in the node (with timestamps)
- [ ] Set the analysis window to 0.2s → finer detection

---

## 14. Visualization

### 14.1 Spectrum analyzer
- [ ] Connect a sound → the spectrum is displayed (frequency bars)
- [ ] A 440 Hz sine → sharp peak at 440 Hz
- [ ] Log/linear toggle → the axis changes

### 14.2 Spectrogram
- [ ] Connect a sound → 2D spectrogram (time × frequency × color)
- [ ] A harmonic sound → horizontal lines (harmonics)

### 14.3 Educational oscillator
- [ ] Run → the waveform + harmonics are displayed
- [ ] Sine → 1 line; Square → odd harmonics; Saw → all

### 14.4 Filter response
- [ ] Set Type = Low-pass, Cutoff = 1000 Hz, Q = 1
- [ ] The gain curve is drawn instantly (without execution)

### 14.5 VU-meter / LUFS
- [ ] Connect a sound → 4 bargraphs (RMS, Peak, True Peak, LUFS)
- [ ] Values in dB are displayed under each bar
- [ ] Crest factor and LRA are displayed

### 14.6 ColorSynth
- [ ] Connect a sound → palette of 6 colors (Sub → Air)
- [ ] A bass sound → dominant warm colors
- [ ] A treble sound → dominant cold colors
- [ ] Luminous outline at the energy level of each band

---

## 15. Track aligner

### 15.1 Track too short
- [ ] Reference = 10s, Track = 5s
- [ ] Position = After → track at the beginning, 5s of silence at the end
- [ ] Position = Before → 5s of silence at the beginning, track at the end
- [ ] The output is indeed 10s

### 15.2 Track too long
- [ ] Reference = 5s, Track = 10s
- [ ] Position = Before → keeps the beginning, fade out at the end
- [ ] Position = After → fade in at the beginning, keeps the end
- [ ] The output is indeed 5s

### 15.3 Tracks of same length
- [ ] Reference = 5s, Track = 5s
- [ ] No modification — exact copy, no fade

---

## 16. Prompt → graph

### 16.1 Generation
- [ ] Enter: "stereo delay with feedback on a hall reverb then compressor and output"
- [ ] Run → nodes appear on the canvas, connected in a chain
- [ ] The chain contains: Audio input → Delay → Reverb → Compressor → Audio output
- [ ] Nodes have their default parameters

### 16.2 Minimal prompt
- [ ] Enter: "noise then output"
- [ ] Run → Noise → Audio output (2 connected nodes)

---

## 17. Embedded graph

### 17.1 Export with graph
- [ ] Create a simple graph (Input → Filter → Output)
- [ ] Add a "WAV → MP3" or "MP3 → WAV" node
- [ ] Run → the exported file contains the graph in its metadata

### 17.2 Import with recovery
- [ ] Load the exported file into an "Audio input" node
- [ ] Run → message "Embedded graph detected! N nodes · M connections"
- [ ] The original graph nodes appear on the canvas

---

## 18. Cover generator

### 18.1 Generation
- [ ] Prompt = "dark ambient night", Title = "Nocturne", Style = bauhaus
- [ ] The cover is displayed in the node (512×512 canvas)
- [ ] The title and artist are inserted in the image
- [ ] Click ⬇ PNG → downloads the image

### 18.2 Variations
- [ ] Change Style = concentric → the cover changes
- [ ] Change Prompt = "fire rock energy" → warm colors (red/orange)
- [ ] Change Seed = 42 → same cover every time
- [ ] Seed = 0 → new cover on each run

---

## 19. Persistence (export/import)

### 19.1 Export
- [ ] Create a graph with 3-4 nodes
- [ ] Click Export (or Ctrl+S) → a JSON file is downloaded

### 19.2 Import
- [ ] Click Import (or Ctrl+O) → select the JSON
- [ ] The graph is restored (nodes, edges, parameters)
- [ ] Meta-components are restored

---

## 20. Theme

### 20.1 Light/dark toggle
- [ ] Click the theme icon → toggles between light and dark
- [ ] Node, palette, inspector colors adapt
- [ ] Relaunch → the theme is preserved

---

## 21. Copying text from a node

### 21.1 Copy button
- [ ] Run an "Analysis reader" or "Chord detector"
- [ ] The ⧉ button appears at the top right of the message
- [ ] Click ⧉ → the text is copied to the clipboard
- [ ] Paste (Ctrl+V) in an external editor → the text is there

---

## 22. Tabs

### 22.1 Multi-tabs
- [ ] Click + → a new empty tab appears
- [ ] Create a graph in tab 1, another in tab 2
- [ ] Switch between tabs → each graph is preserved
- [ ] Close a tab → the graph is lost (normal, no auto-save)

---

## Summary

| Category | Exercises | Validated |
|---|---|---|
| Startup & UI | 11 | ___ / 11 |
| Audio workflow | 14 | ___ / 14 |
| Copy/paste | 7 | ___ / 7 |
| Meta-components | 8 | ___ / 8 |
| Effects | 14 | ___ / 14 |
| Generators | 17 | ___ / 17 |
| Reservoirs | 15 | ___ / 15 |
| Generative AI | 12 | ___ / 12 |
| Collections | 10 | ___ / 10 |
| AI tools | 7 | ___ / 7 |
| TTS / STT | 7 | ___ / 7 |
| AI separation | 6 | ___ / 6 |
| MIDI | 12 | ___ / 12 |
| Visualization | 16 | ___ / 16 |
| Aligner | 6 | ___ / 6 |
| Prompt → graph | 4 | ___ / 4 |
| Embedded graph | 4 | ___ / 4 |
| Cover | 6 | ___ / 6 |
| Persistence | 4 | ___ / 4 |
| Theme | 2 | ___ / 2 |
| Text copy | 2 | ___ / 2 |
| Tabs | 2 | ___ / 2 |
| **Total** | **~176** | ___ / 176 |
