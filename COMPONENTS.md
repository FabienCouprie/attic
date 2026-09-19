# Attic Component Catalog

> Generated from the live node registry by `src/docs/catalogue-markdown.ts` — do not edit by hand.  
> Regenerate with `npm run docs:components`.

Attic ships **308 components** in **7 categories** and **29 families**. Every name, summary, description and parameter note below is the English text the application itself displays.

## Contents

| Category | Components | Families |
|---|---:|---|
| [Inputs](#inputs) | 60 | [Audio](#audio) (6) · [Generation](#generation) (44) · [Image](#image) (3) · [Text](#text) (1) · [Text to Speech](#text-to-speech) (6) |
| [Processing](#processing) | 144 | [Conversion](#conversion) (4) · [Editing](#editing) (17) · [Effects](#effects) (119) · [Generation](#generation-1) (1) · [Image](#image-1) (2) · [Text](#text-1) (1) |
| [Visualization](#visualization) | 32 | [Analysis](#analysis) (24) · [Image](#image-2) (1) · [Notation](#notation) (7) |
| [Outputs](#outputs) | 8 | [Export](#export) (2) · [Monitoring](#monitoring) (6) |
| [Collections](#collections) | 9 | [Analysis](#analysis-1) (2) · [Conversion](#conversion-1) (3) · [Export](#export-1) (3) · [Playback](#playback) (1) |
| [Meta-components](#meta-components) | 2 | [Boundary](#boundary) (2) |
| [Others](#others) | 53 | [Csound wrapper](#csound-wrapper) (5) · [Generation](#generation-2) (11) · [Installation](#installation) (1) · [Magenta](#magenta) (7) · [Speech to Text](#speech-to-text) (2) · [Test zone](#test-zone) (5) · [Text](#text-2) (16) · [Theory](#theory) (6) |

## How to read this catalog

Components are grouped as in the application's palette: a **category**, then a **family**. Each family opens with a one-line index; each component then gives its summary, its full description, its ports and its parameters.

**Port types** — what flows along a connection:

| Type | Carries |
|---|---|
| audio | a decoded audio signal, mono or stereo |
| MIDI | a MIDI file |
| text | plain text: lyrics, prompts, ABC scores, reports, analysis results |
| image | an image |
| control | a numeric control value |
| file | a file of another kind |

An input marked **required** must be connected for the component to run. **Parameter types**: *number* and *slider* take a value within the given range; *choice* one of the listed options; *text* free text; *folder* a directory path; *SoundFont preset* an instrument of the loaded SoundFont, or *follow MIDI* to keep the instruments written in the MIDI file. Internal parameters that the application sets by itself — such as the path of a file picked from the inspector — are not listed.

## Inputs

### Audio

| Component | Summary |
|---|---|
| [Audio input](#audio-input) | Loads an audio file and passes it to its output. |
| [MIDI Capture](#midi-capture) | Records a performance played on a connected MIDI keyboard or controller. |
| [MIDI Player](#midi-player) | Loads a MIDI file from the inspector, synthesizes it and passes the MIDI along. |
| [Music explorer](#music-explorer) | Loads an audio file from the explorer. |
| [Recorder](#recorder) | Passes a microphone recording as audio source. |
| [System Audio Capture](#system-audio-capture) | Captures system audio (other app, browser, etc.). |

#### Audio input

`entree-audio` · Inputs → Audio

*Loads an audio file and passes it to its output.*

Loads an audio file (WAV, MP3, FLAC, OGG…) from the inspector and decodes it into a signal usable by other blocks.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |

*No parameters.*

#### MIDI Capture

`capture-midi` · Inputs → Audio

*Records a performance played on a connected MIDI keyboard or controller.*

Records a performance played on a USB-connected MIDI keyboard or controller. Pick the device, click Record, play, then Stop: the played notes become a MIDI file, synthesized to audio and passed through as-is on the MIDI output (chainable to a Transposer, Quantizer or Arpeggiator). Requires the browser/system MIDI permission on first use.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### MIDI Player

`lecteur-midi` · Inputs → Audio

*Loads a MIDI file from the inspector, synthesizes it and passes the MIDI along.*

Loads a MIDI file from the inspector and synthesizes it to audio (FM or SoundFont). The MIDI file is also passed on the MIDI output, allowing it to be connected to a Transposer/Quantizer, an Arpeggiator or a MIDI Output.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Music explorer

`explorateur-musique` · Inputs → Audio

*Loads an audio file from the explorer.*

Browses a project music folder and loads the chosen file as an audio source (Electron).

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Path | text | `music collection` |  | Directory to scan, relative to project folder. |

#### Recorder

`enregistreur-audio` · Inputs → Audio

*Passes a microphone recording as audio source.*

Records from the microphone or line input. Pick the device, start then stop recording: the captured sound becomes the block's audio source.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |

*No parameters.*

#### System Audio Capture

`capture-systeme-audio` · Inputs → Audio

*Captures system audio (other app, browser, etc.).*

Captures system audio (what comes out of the speakers). On start, Windows opens a screen share dialog: select the screen or window, and make sure « Share audio » is checked. Audio from any application (browser, player, game) is then captured. Click Stop to finish.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |

*No parameters.*

### Generation

| Component | Summary |
|---|---|
| [ABC → MIDI](#abc--midi) | Reads a score in ABC notation — melody, chord symbols, repeats, several voices — and renders it to MIDI and audio. |
| [ABC Cover](#abc-cover) | Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass — ballad, pop, waltz, march, bossa nova. |
| [Advanced Drum Sequencer](#advanced-drum-sequencer) | Programs an 8-track drum pattern with per-step velocity (synthesized). |
| [Cantor Rhythm](#cantor-rhythm) | Generates a self-similar rhythmic groove by recursively removing beats from a grid. |
| [Cellular automaton](#cellular-automaton) | Generates a musical sequence from a 1D or 2D cellular automaton. |
| [Chord Generator](#chord-generator) | Generates a chord progression. |
| [Chord Sequencer](#chord-sequencer) | Programs a chord progression on a step grid. |
| [Curve](#curve) | Builds a modulation curve: oscillator, ramp, logistic sequence or random walk. |
| [Custom Sampler](#custom-sampler) | Plays an audio sample as a melodic instrument. |
| [Drum Machine](#drum-machine) | Generates a drum pattern. |
| [Drum Sequencer](#drum-sequencer) | Programs a drum pattern on a step grid (synthesized). |
| [Euclidean Rhythm](#euclidean-rhythm) | Spreads N onsets as evenly as possible over M steps (Bjorklund's algorithm). |
| [FM / AM Synth](#fm--am-synth) | Generates a note with frequency modulation (FM) or amplitude modulation (AM). |
| [Fractal Music](#fractal-music) | Generates a fractal melody from a repeated motif and scale. |
| [Fractal Spectrogram](#fractal-spectrogram) | Generates a fractal spectrogram and its associated audio. |
| [Frequency Generator](#frequency-generator) | Generates a pure tone at a given frequency (Hz) or note. |
| [GENDYN (Xenakis)](#gendyn-xenakis) | Stochastic synthesis: the waveform itself is a bounded random walk. |
| [Groove Box](#groove-box) | Generates a groove loop: deterministic chord progression + reservoir melody + drums. |
| [Infinity Series (Nørgård)](#infinity-series-nørgård) | Generates Per Nørgård's self-similar sequence, and its slower voices which form an exact canon. |
| [Koch Snowflake Arpeggiator](#koch-snowflake-arpeggiator) | Generates a polyrhythmic arpeggio from the Koch snowflake. |
| [L-system](#l-system) | Generates a melody from a self-rewriting grammar (Lindenmayer). |
| [Mandelbrot Mapper](#mandelbrot-mapper) | Generates a melody from the Mandelbrot set. |
| [Mathematical Audio Generator](#mathematical-audio-generator) | Generates an audio signal from a mathematical expression. |
| [Melodic Sequencer](#melodic-sequencer) | Programs a melody on a step-by-step piano-roll grid (synthesized). |
| [Melody Keyboard](#melody-keyboard) | Plays a keyboard-recorded sequence and also exports a MIDI file. |
| [Membrane Synth](#membrane-synth) | Generates a synthetic kick drum with Tone.js. |
| [Metal Synth](#metal-synth) | Generates a metallic sound (hi-hat, bell, cymbal) with Tone.js. |
| [Metronome](#metronome) | Generates a steady metronome click at a given tempo. |
| [Multi-reservoir](#multi-reservoir) | Multiple neural reservoirs in network (melody, bass, harmony, rhythm) — polyphonic emergence. |
| [Music Generator](#music-generator) | Generates a multi-track composition from a descriptive script. Audio output + three MIDI outputs (one per instrument). |
| [MusicGen](#musicgen) | Generates music from a text prompt using Xenova/musicgen-small, an ONNX-converted version of Meta's MusicGen Small text-to-audio model, optimized to run locally in JavaScript environments via Transformers.js. |
| [Neural Reservoir](#neural-reservoir) | Generates emergent melody via random neural networks (inspired by Allendia/EVY). Audio output + MIDI output. |
| [Noise Generator](#noise-generator) | Generates white, pink or brownian noise. |
| [Oscillator](#oscillator) | Generates a pure waveform; the view shows the wave and its harmonics. |
| [Pluck Synth](#pluck-synth) | Generates a plucked string note using Karplus-Strong synthesis. |
| [Poly Synth](#poly-synth) | Generates a polyphonic chord with an ADSR envelope. |
| [Pulsar Synthesis](#pulsar-synthesis) | Fundamental and formant set independently, from short repeated bursts. |
| [Pure Data](#pure-data) | Generates audio by running a Pure Data patch (.pd). |
| [Random Melody](#random-melody) | Generates a random melody. |
| [Risset Bell](#risset-bell) | Synthesises a bell by adding inharmonic partials. |
| [Sieve (Xenakis)](#sieve-xenakis) | Builds a scale and a rhythm from modular arithmetic. |
| [Stable Audio 3](#stable-audio-3) | Generates stereo music from a text prompt using Stable Audio 3 (ONNX). |
| [Text → MIDI](#text--midi) | Converts a text notation (one note/chord per line) into MIDI + audio. |
| [Tiling Canon](#tiling-canon) | Builds a rhythmic canon where each pulse is struck by one voice and one only. |

#### ABC → MIDI

`abc-vers-midi` · Inputs → Generation

*Reads a score in ABC notation — melody, chord symbols, repeats, several voices — and renders it to MIDI and audio.*

Reads a score in ABC notation and renders it to MIDI and audio. ABC is a standardised text music notation (ABC 2.1): thousands of traditional tunes circulate in this form, language models know it, and it is the language of YuE2's scores. Unlike the « Text → MIDI » format, it carries the meter (M:), key and modes (K:), unit length (L:), tempo (Q:), bars, repeats and alternate endings, chord symbols and several voices (V:). The MIDI produced keeps everything that can be written there: one track per voice on its own channel, an accompaniment track for chord symbols on another, the meter, key signature and leading rest. The Key output (« G major », « A dorian ») connects to the harmony nodes. Placed after « LLM Ollama », the node renders what the model composes: code blocks and the introductory sentence are ignored. What is not read is named in the message rather than silently dropped: grace notes, mid-tune tempo changes, %%MIDI directives, multiple alternate endings, unknown chord symbols.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Key | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| ABC | text | `X:1 T:Speed the Plough M:4/4 L:1/8 Q:1/4=120 K:G \|:"G"GAB…` |  | ABC score, used when no text input is connected. Accepts a whole file with several tunes (X: field), free text before an X:, and a language model's code blocks. |
| Tune | number | 1 | 1 – 200, step 1 | Which tune to play when the text holds several, in file order. |
| Chord symbols | choice | Play | Play / Ignore | Play chord symbols (« Am », « G7 », « C/E ») on an accompaniment track, each held until the next. They go out on their own MIDI channel. |
| Tempo | number | 120 BPM | 30 – 300 BPM, step 1 | Tempo in quarter notes per minute, used only when the score has no Q: field. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | SoundFont preset for the score's voices. |
| Chord instrument | SoundFont preset | program 24 |  | SoundFont preset for the chord-symbol accompaniment. A nylon guitar by default, so it stands apart from the melody. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesized audio volume. |

#### ABC Cover

`reprise-abc` · Inputs → Generation

*Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass — ballad, pop, waltz, march, bossa nova.*

Covers an ABC score in another style: melody and chord symbols stay those of the score, and the node adds an accompaniment voice and a bass line that follow the harmony with a pattern — held chords, ballad arpeggios, pop chords on the beats, waltz bass–chord–chord, march bass–chord, bossa nova. It outputs the audio, a three-track MIDI (one instrument each) and the arranged ABC. This is a cover in YuE2's sense, symbolically: same melody, different arrangement. No language model is involved: the patterns are deterministic, because the measurement made for « ABC Editing by LLM » showed that local models go wrong as soon as they write durations — and an accompaniment is made of nothing but durations. To change the harmony TOO, first place « ABC Editing by LLM » in reharmonization. The original melody is copied as is and verified intact at the end, as by « ABC Constraints ». Each hit stops at the next chord change: a chord never spills over the next one. A score without chord symbols is refused, with an indication of what to do; so is a style that does not fit the meter — no bossa nova in 3/4, no march on an odd number of beats. Tunes starting with a pickup are not handled.

| Port | Name | Type | |
|---|---|---|---|
| input | ABC | text | required |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | ABC | text |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Style | choice | Ballad (arpeggios) | Blocks (held chords) / Ballad (arpeggios) / Pop (chords on the beats) / Waltz (bass – chord – chord) / March (bass – chord) / Bossa nova | The accompaniment's style. Blocks: held chords and bass. Ballad: eighth-note arpeggio over a held bass. Pop: a chord on every beat, bass in eighths. Waltz: bass on beat one, chords on the others. March: root then fifth in the bass on odd beats, chords on even beats — bars with an even number of beats. Bossa nova: dotted-quarter-and-eighth bass, syncopated chords — 4/4 only. A style that does not fit the meter is refused, and the message says so. |
| Tempo | number | 0 BPM | 0 – 300 BPM, step 1 | Tempo of the cover in quarter notes per minute. 0: the score's own. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Melody instrument | SoundFont preset | program 73 |  | SoundFont preset for the melody. Flute by default. |
| Accompaniment instrument | SoundFont preset | program 0 |  | SoundFont preset for the accompaniment. Piano by default. |
| Bass instrument | SoundFont preset | program 33 |  | SoundFont preset for the bass. Fingered bass by default. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesized audio volume. |

#### Advanced Drum Sequencer

`sequenceur-batterie-avance` · Inputs → Generation

*Programs an 8-track drum pattern with per-step velocity (synthesized).*

Programs an advanced drum pattern on 8 tracks (kick, snare, closed hi-hat, open hi-hat, clap, crash, low tom, high tom). Click a cell to turn it on or off, as in the other sequencers; nuance is on the modifiers — Shift+click raises velocity one step (0 to 9), Alt+click lowers it. A cell turned back on recovers the velocity it had before being cleared, or 6 if it never had one. Higher velocity makes the cell brighter and the sound louder. Sounds are synthesized (drum-machine style), no SoundFont. Set tempo, number of steps (16 or 32), swing and bars; the audio output loops the pattern.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Steps | choice | 16 | 16 / 32 | Steps per bar. |
| Swing | number | 0 % | 0 – 60 % | Delays off-beats for a shuffle groove. |
| Bars | number | 2 | 1 – 8, step 1 | Number of pattern repetitions. |
| Volume | number | 90 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Pattern | text | `9000000090000000\|0000900000009000\|9090909090909090\|000000…` |  | Encoded pattern (edited via the grid): 8 step rows separated by « \| », each step 0 (off) or 1–9 (velocity). |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the noise bursts (snare, hi-hat). The default is FIXED: the same pattern must render the same file on every run. |

#### Cantor Rhythm

`rythme-cantor` · Inputs → Generation

*Generates a self-similar rhythmic groove by recursively removing beats from a grid.*

Generates a self-similar rhythmic groove by Cantor recursion on a 64-step grid per bar. At each depth level, the central (or left/right/random) part of each remaining interval is removed. Surviving steps trigger drums: in 'All' mode, kick = levels 0, 3, 6…, snare = levels 1, 4…, hi-hat = levels 2, 5…, creating a fractal rhythmic texture.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Groove speed in beats per minute. |
| Depth | number | 3 | 1 – 6, step 1 | Number of recursion levels of beat removal (higher = more fractal). |
| Subdivision | choice | 3 | 3 / 5 / 7 | Number of segments each interval is divided into at each recursion. |
| Removed part | choice | Center | Center / Left / Right / Random | Part of the interval removed at each recursion level. |
| Instrument | choice | All | Kick / Snare / Hi-hat / All | Drum(s) played by the surviving steps. |
| Bars | number | 2 | 1 – 8, step 1 | Number of bars generated. |
| Swing | number | 0 % | 0 – 100 % | Offset of odd beats for a swing/shuffle feel. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the groove. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the removed-part choice and the noise bursts. No effect on the grid outside the « Random » mode, but it always fixes the noise. 0 = drawn at random on every run, and shown in the message. |

#### Cellular automaton

`automate-cellulaire` · Inputs → Generation

*Generates a musical sequence from a 1D or 2D cellular automaton.*

Generates a musical sequence from a 1D cellular automaton (Wolfram rules 30, 90, 110, 126, 150). Each cell generation becomes a time step. Active cells are mapped to a chosen scale and key to form chords (Polyphony mode) or a melody (Melody mode). Audio + MIDI output. Rules 90 and 150 produce fractal structures; rules 30 and 110 yield more chaotic patterns.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Topology | choice | 1D | 1D / 2D Conway / 2D Highlife | 1D: elementary rules 0-255. 2D Conway/Highlife: Game of Life and variants. |
| Rule | choice | 90 | Custom / 18 / 22 / 26 / 30 / 45 / 54 / 60 / 62 / 73 / 90 / 102 / 105 / 110 / 122 / 126 / 150 / 160 / 184 / 204 / 225 / 232 / 240 / 250 | Classic 1D rule. Choose Custom to use the numeric value below. |
| Custom rule | number | 90 | 0 – 255, step 1 | 1D rule number used when Rule = Custom. Ignored in 2D mode. |
| Voice mode | choice | Polyphony | Polyphony / Melody / Arpeggio | Polyphony plays all active cells. Melody picks one per step. Arpeggio plays them in order. |
| Mapping | choice | Pitch | Pitch / Velocity / Duration / Pitch + velocity | What the position of active cells represents. Pitch + velocity combines both. |
| Width | number | 16 cells | 4 – 64 cells, step 1 | Number of cells per row. |
| Height | number | 16 cells | 4 – 64 cells, step 1 | Grid height in 2D mode. In 1D, use Generations. |
| Generations | number | 32 steps | 4 – 256 steps, step 1 | Number of steps / generations of the automaton (1D) or grid iterations (2D). |
| Seed | number | 0 | 0 – 9999, step 1 | 0 = simple centered seed. Otherwise random initialization. |
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Key of the scale used to map cells to notes. |
| Scale | choice | Major pentatonic | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to convert cell positions into note pitches. |
| Octave | number | 4 | 1 – 6, step 1 | Base octave of the generated MIDI notes. |
| Note duration | number | 0.2 s | 0.05 – 2 s, step 0.05 | Base duration of each step in seconds. |
| Velocity | number | 100 | 1 – 127, step 1 | Base MIDI velocity of the generated notes (1-127). |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level, from 0 (silence) to 100%. |
| Max density | number | 4 | 1 – 16, step 1 | Maximum number of simultaneous notes in polyphony mode. |
| Mutation probability | number | 0 | 0 – 0.5, step 0.01 | Probability of randomly flipping a cell at each generation. |
| Synthesis | choice | FM/Oscillators | FM/Oscillators / SoundFont | Audio engine for rendering: built-in FM/oscillators or loaded global SoundFont. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Chord Generator

`generateur-accords` · Inputs → Generation

*Generates a chord progression.*

Generates a chord progression from the key, scale and genre. Each chord is arpeggiated across three octaves.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic | Scale used to build the chords (7 modes + 2 pentatonic scales). |
| Genre | choice | Pop | Pop / Rock / Jazz / Blues / Classical / Electronic / Hip-hop / Reggae / Ambient / Custom | Style determines the chord progression. Choose « Custom » to enter your own progression below. |
| Progression | text | `I-IV-V-I` |  | Custom progression in Roman numerals. I=tonic, IV=subdominant, V=dominant. Ex: I-IV-V-I, ii-V-I, I-V-vi-IV. Used only when Genre = Custom. |
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Chord duration | number | 2 beats | 1 – 8 beats, step 1 | Duration per chord in beats. |
| Chord count | number | 8 | 2 – 32, step 1 | Total number of chords. |
| Extension | choice | None | None / 7th / 6th | Adds a diatonic 7th or 6th (per the chosen scale) to each chord. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Chord Sequencer

`sequenceur-accords` · Inputs → Generation

*Programs a chord progression on a step grid.*

Programs a chord progression on a step grid: 21 rows = 7 degrees × 3 rows (triad, 7th, 6th). Labels are chord names in the chosen key (e.g. C, Cmaj7, C6, Dm, Dm7, Dm6…). Each column activates only one chord at a time. Click a cell to select the chord played at that step. Choose Harmony mode (block chord) or Arpeggio (notes slightly staggered), plus the key, scale, octave, tempo, swing, number of bars and synthesis mode (FM or SoundFont). The audio output loops the pattern; the MIDI output reproduces the same pattern for chaining to other MIDI nodes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute. |
| Steps | choice | 16 | 8 / 16 / 32 | Steps per bar (rhythmic resolution). |
| Swing | number | 0 % | 0 – 60 % | Slightly delays off-beats for a shuffle groove. |
| Bars | number | 2 | 1 – 8, step 1 | Number of pattern repetitions. |
| Volume | number | 85 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Blues / Chromatic | Diatonic scale used to build chords on the 7 degrees. |
| Octave | number | 3 | 2 – 6, step 1 | Octave of the chord roots. |
| Mode | choice | Harmony | Harmony / Arpeggio | Harmony = chord played as a block ; Arpeggio = notes quickly staggered. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Pattern | text | `1000000000000000\|0000000000000000\|0000000000000000\|000000…` |  | Encoded pattern (edited via the node grid): 21 rows (7 degrees × triad/7th/6th) of steps separated by « \| ». Click a cell to choose the chord (e.g. C, Cmaj7, C6) at that step. |

#### Curve

`generateur-courbe` · Inputs → Generation

*Builds a modulation curve: oscillator, ramp, logistic sequence or random walk.*

Builds a modulation curve to plug into an effect's Modulation input. A curve carries values between zero and one; the effect decides what zero and one mean at its end. The LOGISTIC SEQUENCE deserves an explanation, because it is this node's reason for being as much as the other shapes: seven Attic nodes each reimplemented it on their own — logistic echo, logistic tremolo, logistic vibrato, logistic auto-pan, logistic chopper, logistic Paulstretch, logistic mixer. Seven implementations of the same sequence, and for seven effects only. A single source plugged into any effect does the same work, and for every effect that accepts a modulation. The sequence itself is x next = r x (1 - x): below 3 it settles on one value, around 3.45 it alternates between two then four, and beyond 3.57 it turns chaotic and never repeats — that is where the Chaos setting gets interesting. The periodic shapes give the ordinary tremolo, vibrato and sweep; the ramp gives the « progressive » effects; the random walk gives a gentle drift that never comes back to the same place.

| Port | Name | Type | |
|---|---|---|---|
| output | Curve | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Shape | choice | Sine | Sine / Triangle / Square / Ramp / Logistic / Random | The shape of the modulation. The LOGISTIC SEQUENCE is here for a precise reason: seven Attic nodes each reimplemented it on their own — logistic echo, logistic tremolo, and five others. A single source plugged into any effect does the same work, and on all of them rather than on seven. |
| Duration | slider | 10 s | 0.5 – 120 s, step 0.5 | Length of the curve. It need not match the sound's: the effect stretches it to cover it, so a ramp stays a ramp whatever the sound's length. |
| Frequency | slider | 0.5 Hz | 0.01 – 20 Hz, step 0.01 | Cycles per second for the periodic shapes; for the logistic and random ones, steps per second. |
| Chaos | slider | 3.9 | 2.5 – 4, step 0.01 | The logistic sequence's r. Below 3 it settles; around 3.45 it alternates between two values, then four; beyond 3.57 it turns chaotic and never repeats. |
| Seed | number | 1 | 1 – 999999, step 1 | Seed of the random walk. |

#### Custom Sampler

`sampler-personnalise` · Inputs → Generation

*Plays an audio sample as a melodic instrument.*

Uses an audio sample as a melodic instrument: the sample is pitched to play a melody in the chosen scale.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to pick notes (major, minor, pentatonic…). |
| Tempo | number | 100 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Duration | number | 4 s | 1 – 60 s | Generated duration, in seconds. |
| Reference note | number | 60 | 21 – 108 | MIDI note for the original pitch of the sample. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the melody. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same melody. |

#### Drum Machine

`boite-rythmes` · Inputs → Generation

*Generates a drum pattern.*

Generates a drum track from a pattern (Rock, Funk, House…), with per-drum volume control.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Pattern | choice | Rock | Rock / Four-on-the-floor / Funk / Hip-hop / Jazz / Reggae / Samba / House / Techno / Drum & Bass / Trap / Disco / Ska / Bossa Nova / Tango / Calypso / Military march / Pop ballad / Pop dance / Pop latin / Pop folk / Pop R&B / Pop punk / Waltz / Bolero / Afrobeat / Rumba / Flamenco / Merengue / Breakbeat / Electro / Detroit techno / Minimal / Dubstep / Moombahton / Dembow / Reggaeton / Cumbia / Bachata / Blues shuffle / Gospel / Metal / Punk / Grunge / Trance / Hardstyle / Lo-fi hip hop / Boom bap / Drill / Trip hop / Amapiano / Salsa / Highlife / Baile funk / Tech house | Preset rhythmic pattern. |
| Bars | number | 2 | 1 – 8, step 1 | Number of bars to generate. |
| Kick | number | 80 % | 0 – 100 % | Kick drum volume, from 0 to 100%. |
| Snare | number | 70 % | 0 – 100 % | Snare volume, from 0 to 100%. |
| Hi-hat | number | 60 % | 0 – 100 % | Hi-hat volume, from 0 to 100%. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the noise bursts (snare, hi-hat). The default is FIXED: the same pattern must render the same file on every run. |

#### Drum Sequencer

`sequenceur-batterie` · Inputs → Generation

*Programs a drum pattern on a step grid (synthesized).*

Programs a drum pattern on a step grid: click cells to trigger each instrument (kick, snare, hi-hats, clap) on each step. Sounds are synthesized (drum-machine style), no SoundFont. Set tempo, number of steps, swing and bars; the audio output loops the pattern.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Steps | choice | 16 | 8 / 16 / 32 | Steps per bar (rhythmic resolution). |
| Swing | number | 0 % | 0 – 60 % | Slightly delays off-beats for a shuffle groove. |
| Bars | number | 2 | 1 – 8, step 1 | Number of pattern repetitions. |
| Volume | number | 90 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Pattern | text | `1000000010000000\|0000100000001000\|1010101010101010\|000000…` |  | Encoded pattern (edited via the node grid): 5 step rows separated by « \| », each step 1 (on) or 0. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the noise bursts (snare, hi-hat). The default is FIXED: the same pattern must render the same file on every run. |

#### Euclidean Rhythm

`rythme-euclidien` · Inputs → Generation

*Spreads N onsets as evenly as possible over M steps (Bjorklund's algorithm).*

Spreads N onsets as evenly as possible over M steps, using Bjorklund's algorithm — the one that spaces pulses in a particle accelerator. Godfried Toussaint showed in 2005 that these patterns are those of attested traditional rhythms: E(3,8) is the Cuban tresillo, E(5,8) the cinquillo, E(2,5) the Persian khafif-e-ramal, E(7,12) the West African bembé, E(5,16) the bossa-nova. The message shows the resulting pattern and, when the pair is a known one, its usual name. « Rotation » shifts the cycle's start without touching the intervals: the tresillo rotated by three steps gives the figure that starts off-beat. One node plays a single drum: for a polyrhythm, stack several — kick on E(3,8), hi-hat on E(5,8) — and mix their audio outputs, or merge their MIDI outputs. Audio is rendered with the internal synthesized drums, without a SoundFont; the MIDI output carries the notes on channel 10 (percussion), ready for another node.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Steps | number | 8 | 1 – 32, step 1 | Cycle length, in steps. The « M » of E(N, M). |
| Onsets | number | 3 | 0 – 32, step 1 | Number of onsets to spread over the cycle. The « N » of E(N, M). Three onsets over eight steps give the Cuban tresillo, five over eight the cinquillo, seven over twelve the bembé. |
| Rotation | number | 0 | 0 – 31, step 1 | Shifts the cycle's start without changing the intervals. The same pattern heard from another step: the tresillo rotated by 3 gives the figure that starts off-beat. |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Speed, in beats per minute. |
| Step length | choice | Eighth | Quarter / Eighth / Sixteenth / Eighth triplet | Rhythmic value of one step of the cycle. |
| Repeats | number | 4 | 1 – 32, step 1 | How many times the cycle is played. |
| Drum | choice | Kick | Kick / Snare / Closed hi-hat / Open hi-hat / Clave / Cowbell / Low tom / High tom | Drum note played (channel 9). Stack several nodes on different drums to build a polyrhythm. |
| Velocity | number | 90 | 1 – 127, step 1 | Strength of the onsets. |
| Accent | number | 20 | 0 – 40, step 1 | Extra velocity on the first step of each cycle, so the cycle's start can be heard. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### FM / AM Synth

`fm-synth` · Inputs → Generation

*Generates a note with frequency modulation (FM) or amplitude modulation (AM).*

Generates a note using frequency modulation (FM) or amplitude modulation (AM) via Tone.js. Choose the mode, note, duration, harmonicity, modulation index and ADSR envelope. The sound is rendered offline.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | FM | FM / AM | Modulation type: FM (frequency) or AM (amplitude). |
| Note | text | `C4` |  | Note to play (e.g. C4, G5). |
| Duration | number | 1.5 s | 0.1 – 5 s, step 0.1 | Total duration of the generated buffer. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the sound. |
| Harmonicity | number | 3 | 0.1 – 10, step 0.1 | Frequency ratio between carrier and modulator. |
| Modulation index | number | 10 | 0 – 100, step 1 | Modulation depth (FM only). |
| Attack | number | 0.01 s | 0 – 1 s, step 0.001 | Envelope attack time (0 = instantaneous). |
| Decay | number | 0.1 s | 0 – 2 s, step 0.01 | Envelope decay time to the sustain level. |
| Sustain | number | 0.3 level | 0 – 1 level, step 0.01 | Envelope sustain level (0 = silence, 1 = maximum). |
| Release | number | 0.5 s | 0 – 3 s, step 0.01 | Envelope release time after the note ends. |

#### Fractal Music

`generateur-fractal` · Inputs → Generation

*Generates a fractal melody from a repeated motif and scale.*

Builds a piece by recursively applying an interval motif over several depth levels, producing a self-similar structure. Audio output + MIDI output for chaining to other MIDI nodes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Motif | choice | Major triad | Major triad / Minor triad / 7th arpeggio / Cantus firmus / Custom | Base interval motif repeated recursively. |
| Intervals | text | `0.3.7.10` |  | Intervals of the custom motif, in semitones separated by commas (e.g. 0,3,7,10). |
| Depth | number | 3 | 1 – 6, step 1 | Number of recursion levels (higher = denser structure). |
| Duration | number | 8 s | 2 – 60 s | Generated duration, in seconds. |
| Tempo | number | 80 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to pick notes (major, minor, pentatonic…). |
| Timbre | choice | Soft | Soft / Bright / Percussive | Tone color of the synthesis (soft, bright, percussive). |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Fractal Spectrogram

`spectrogramme-fractal` · Inputs → Generation

*Generates a fractal spectrogram and its associated audio.*

Generates a spectrogram whose pattern is fractal noise (sum of octaves of pseudo-random noise). The image represents time horizontally and frequency vertically; the intensity at each point determines the spectral amplitude. The sound is resynthesized by short-term inverse Fourier transform with overlap-add and a Hann window. Image output + audio output.

| Port | Name | Type | |
|---|---|---|---|
| output | Image | image |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | number | 4 s | 0.5 – 30 s, step 0.5 | Total duration of the generated sound and image. |
| FFT | choice | 2048 | 512 / 1024 / 2048 / 4096 | FFT window size: larger = finer frequency resolution, coarser time resolution. |
| Octaves | number | 4 | 1 – 8, step 1 | Number of fractal noise octaves. |
| Roughness | number | 0.5 | 0 – 1, step 0.05 | Influence of high-frequency noise (0 = smooth, 1 = rough). |
| Scale | choice | Logarithmic | Logarithmic / Linear | Vertical distribution of frequencies in the image. |
| Seed | number | 42 | 0 – 999999, step 1 | Seed to reproduce the same fractal texture. |
| Format | choice | PNG | PNG / JPEG | Output image format. |

#### Frequency Generator

`generateur-frequence` · Inputs → Generation

*Generates a pure tone at a given frequency (Hz) or note.*

Generates a pure tone at a precise frequency. Two input modes: in Hertz (20-20000 Hz) or as a musical note (format A4, C#5, Bb3). Four waveforms: sine (single frequency, pure), square (odd harmonics, rich), sawtooth (all harmonics, bright) and triangle (soft odd harmonics). A 10 ms fade in/out avoids clicks. Ideal for ear training, testing filters, tuning an instrument or as a reference. Connect it to the Oscillator or Spectrum Analyzer to visualize the waveform and spectrum.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Input | choice | Frequency (Hz) | Frequency (Hz) / Note | Input mode: in Hz (e.g. 440) or as a musical note (e.g. A4, C#5). |
| Frequency | number | 440 Hz | 20 – 20000 Hz, step 1 | Frequency in Hertz (used when « Input » = Frequency). 440 = reference A4. |
| Note | text | `A4` |  | Musical note (used when « Input » = Note). Format: letter + accidental + octave, e.g. A4, C#5, Bb3. |
| Waveform | choice | Sine | Sine / Square / Saw / Triangle | Waveform. Sine = pure (single frequency); Square = odd harmonics; Saw = all harmonics; Triangle = soft odd harmonics. |
| Duration | number | 2 s | 0.1 – 30 s, step 0.1 | Duration of the generated signal. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### GENDYN (Xenakis)

`gendyn-xenakis` · Inputs → Generation

*Stochastic synthesis: the waveform itself is a bounded random walk.*

After Iannis Xenakis's dynamic stochastic synthesis (GENDY3, 1991). Xenakis attacks the problem from the other end: rather than starting from an acoustic model — partials, a filter, an envelope — he works directly on the waveform, seen as a polygon joining a few points, and lets those points MOVE. At each period, every vertex takes a random step in both time and amplitude. There is therefore no pitch, timbre or envelope here in the usual sense: those are no longer parameters but consequences. Pitch emerges from the sum of the segment durations, timbre from the shape of the polygon, and both drift by themselves since the points never stop moving. You do not set the sound, you set the LAW that makes it evolve. Everything rests on reflecting barriers: without them a random walk always escapes — amplitudes clip, durations turn absurd, the sound dies. Reflected, values stay bounded forever while still wandering. Set both step sizes to zero and the polygon freezes into a periodic waveform, a useful starting point for hearing what the walk contributes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | number | 10 s | 0.5 – 120 s, step 0.5 | Length of the produced sound. |
| Points | number | 8 | 2 – 40, step 1 | Number of vertices in the polygon. Few points = simple sound, close to a basic waveform; many = rich, unstable timbre. |
| Min segment | number | 0.5 ms | 0.05 – 20 ms, step 0.05 | Minimum segment duration: the HIGH bound of the drift. The shorter it is, the higher the sound can go. |
| Max segment | number | 4 ms | 0.1 – 50 ms, step 0.1 | Maximum segment duration: the LOW bound. The gap between the two bounds sets how far the pitch can wander. |
| Time step | slider | 10 % | 0 – 100 %, step 1 | Liveliness of the walk on durations, hence on pitch. At 0% the pitch stops moving. |
| Amplitude step | slider | 10 % | 0 – 100 %, step 1 | Liveliness of the walk on amplitudes, hence on timbre. Both steps at 0% freeze the waveform entirely. |
| Seed | number | 1 | 1 – 9999, step 1 | Random seed. Same seed, same sound — essential to recover a result you liked. |

#### Groove Box

`boite-groove` · Inputs → Generation

*Generates a groove loop: deterministic chord progression + reservoir melody + drums.*

Generates a complete loop: deterministic chord progression (style or custom Roman numeral progression) + emergent melody from a neural reservoir + drums. The reservoir melody is snapped to the current chord tones to stay consonant. Stereo audio output + four separate MIDI outputs (drums, chords, bass, melody). In FM mode, drums are synthesized by the internal drum synth; in SoundFont mode, the melodic parts are rendered with the loaded SoundFont. Same seed = same random melody.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |
| output | MIDI drums | MIDI |  |
| output | MIDI chords | MIDI |  |
| output | MIDI bass | MIDI |  |
| output | MIDI melody | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the harmonic grid. |
| Scale | choice | major | major / minor / dorian / phrygian / lydian / mixolydian / locrian / major pentatonic / minor pentatonic | Scale used to build chords (7 modes + 2 pentatonic scales). |
| Genre | choice | Pop | Pop / Rock / Jazz / Blues / Classical / Electronic / Hip-hop / Reggae / Ambient / Custom | Style that determines the chord progression. Choose « Custom » to enter the progression. |
| Progression | text | `I-V-vi-IV` |  | Custom progression in Roman numerals (e.g. I-V-vi-IV, ii-V-I). Used only when Genre = Custom. |
| Tempo | number | 110 BPM | 40 – 240 BPM, step 1 | Speed in beats per minute. |
| Chord duration | number | 2 beats | 1 – 8 beats, step 1 | Duration of each chord in beats (4 beats = 1 4/4 bar). |
| Chord count | number | 8 | 2 – 32, step 1 | Total number of chords / loop length. |
| Extension | choice | None | None / Idiomatic | Adds a diatonic seventh where the genre puts it, rather than on every chord: on the dominant only for pop, rock, classical and reggae; on every chord for jazz and blues, whose idiom it is; on the tonic and subdominant for ambient. The added note also applies to the melodic reservoir when it snaps to the chord. The former « 7th » and « 6th » settings, which coloured every chord, are read as « Idiomatic ». |
| Rhythm style | choice | Pop dance | Rock / Four-on-the-floor / Funk / Hip-hop / Jazz / Reggae / Samba / House / Techno / Drum & Bass / Trap / Disco / Ska / Bossa Nova / Tango / Calypso / Military march / Pop ballad / Pop dance / Pop latin / Pop folk / Pop R&B / Pop punk / Afrobeat / Rumba / Flamenco / Merengue / Breakbeat / Electro / Detroit techno / Minimal / Dubstep / Moombahton / Dembow / Reggaeton / Cumbia / Bachata / Blues shuffle / Gospel / Metal / Punk / Grunge / Trance / Hardstyle / Lo-fi hip hop / Boom bap / Drill / Trip hop / Amapiano / Salsa / Highlife / Baile funk / Tech house | Drum pattern applied to the loop, chosen among the Drum Machine's patterns that play in 4/4. |
| Neurons | number | 15 | 5 – 50, step 1 | Number of neurons in the melodic reservoir. Few = short patterns; many = complex patterns. |
| Connectivity | number | 30 % | 0 – 100 %, step 1 | Probability of connection between neurons. |
| Memory | number | 30 % | 0 – 100 %, step 1 | Leaking rate. High = long memory. |
| Spectral radius | number | 90 % | 50 – 150 %, step 1 | Network spectral radius. &lt;100% = stable, >100% = chaotic. |
| Octave | number | 4 | 2 – 6, step 1 | Starting octave of the reservoir melody. |
| Density | number | 70 % | 0 – 100 %, step 1 | Probability of producing a melodic note at each step. |
| Repetition | number | 25 % | 0 – 100 %, step 1 | Tendency to repeat the previous melodic note. |
| Silence | number | 10 % | 0 – 50 %, step 1 | Probability of melodic silence at each step. |
| Seed | number | 0 | 0 – 99999, step 1 | Reservoir seed (0 = random each run). Same seed = same melody. |
| Volume | number | 80 % | 0 – 100 %, step 1 | General volume for melodic and harmonic parts. |
| Drum volume | number | 100 % | 0 – 200 %, step 1 | Drum volume, relative to the melodic parts. The two buses are levelled separately before being summed: the melodic parts to a 0.80 peak, the drums to 0.50 at 100%. The melody's level therefore no longer depends on the drums — the whole mix used to be scaled down to the drum hits' peak, and the melodic parts came out 9 dB lower with drums at 100 than at 0. Above 100 the drums dominate; at 0 they are gone. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. Drums always use the internal drum synth. |
| Chord instrument | SoundFont preset | follow MIDI |  | SoundFont preset for the chord part, or « Follow MIDI » to keep the one the node assigns (piano). The choice is also written into the « MIDI chords » output, so whichever node renders it next will use it. |
| Bass instrument | SoundFont preset | follow MIDI |  | SoundFont preset for the bass, or « Follow MIDI » to keep the one the node assigns (fingered bass). The choice is also written into the « MIDI bass » output, so whichever node renders it next will use it. |
| Melody instrument | SoundFont preset | follow MIDI |  | SoundFont preset for the melody, or « Follow MIDI » to keep the one the node assigns (square lead). The choice is also written into the « MIDI melody » output, so whichever node renders it next will use it. |
| Drum kit | SoundFont preset | follow MIDI |  | A fourth slot, for the fourth output. « Follow MIDI » keeps the internal drum synth — synthesized percussion, always audible even with no SoundFont loaded, and the default. Picking a preset renders the drums with that SoundFont kit instead; choose one from bank 128. Either way the « MIDI drums » output carries the chosen kit, so whichever node renders it next will use it. |

#### Infinity Series (Nørgård)

`serie-infinie` · Inputs → Generation

*Generates Per Nørgård's self-similar sequence, and its slower voices which form an exact canon.*

Generates Per Nørgård's infinity series, discovered in 1959 and the entire material of his Second Symphony (1970). Its definition fits in three lines: s(0) = 0, s(2n) = −s(n), s(2n+1) = s(n) + 1. The first terms are 0, 1, −1, 2, 1, 0, −2, 3, −1, 2, 0, 1, 2, −1, −3, 4… and the sequence never repeats. It is nevertheless SELF-SIMILAR, and exactly rather than approximately: every second note gives back the inverted series, every fourth note gives back the series itself, identically. One can therefore layer the melody over its own four-times-slower version and obtain a perfectly coherent counterpoint — which is exactly what Nørgård does, and why his symphony can be a single melody from beginning to end without ever sounding repetitive. The « Voices » setting does precisely that, and is therefore not a layering effect: the slow voice IS the same melody. Two readings are offered, which change the whole character without touching the structure: in semitones the sequence unfolds chromatically and leaves any key behind, which is Nørgård's reading; in degrees each integer counts a scale step and the result stays tonal. The sequence is unbounded but rises slowly — a thousand terms fit within some twenty degrees — and pitches that would leave the keyboard are folded by octaves. It is catalogued as A004718 in the encyclopedia of integer sequences, which allows its first terms to be checked elsewhere than here.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Sequence | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | number | 64 | 4 – 1000, step 1 | Number of terms generated. |
| Voices | number | 1 | 1 – 3, step 1 | Superimposes the sequence taken every term, every two and every four. This is not an effect: at stride 4 the sequence comes back IDENTICAL to itself, so the slow voice is the same melody and the counterpoint holds by itself. It is the procedure of the Second Symphony. |
| Tonic | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | The note the sequence starts from, its first term always being zero. |
| Octave | number | 4 | 2 – 6, step 1 | Octave of the tonic. |
| Reading | choice | Semitones | Semitones / Scale degrees | In semitones the sequence unfolds chromatically and leaves any key behind: that is Nørgård's reading. In degrees each integer counts a scale step and the result stays tonal — same structure, quite another character. |
| Scale | choice | Major | Major / Minor / Pentatonic / Chromatic | The scale used when reading by degrees. |
| Note length | number | 0.25 s | 0.05 – 2 s, step 0.05 | Length of each note of the fast voice. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Koch Snowflake Arpeggiator

`arpege-koch` · Inputs → Generation

*Generates a polyrhythmic arpeggio from the Koch snowflake.*

Generates a polyrhythmic arpeggio from the Koch snowflake. The three sides of the base triangle (root, third, fifth) are interpreted as three independent voices. Each voice is recursively subdivided according to the Koch rule: an interval is replaced by four segments, the middle segment forming a peak of adjustable height. The notes are spread over the total duration, creating a self-similar texture. Audio output + MIDI output.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Reference note (tonic) of the base chord. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to quantize the arpeggio notes. |
| Octave | number | 4 | 1 – 6, step 1 | Base octave of the chord. |
| Chord | choice | Major | Major / Minor / Augmented / Diminished / Sus4 | Triad type forming the base triangle of the snowflake. |
| Depth | number | 3 | 1 – 6, step 1 | Number of recursive subdivisions of the Koch snowflake. |
| Direction | choice | alternating | alternating / outward / inward | Direction of the Koch peaks on each voice. |
| Height | number | 3 semitones | 1 – 12 semitones, step 1 | Height of the Koch bump in semitones. |
| Tempo | number | 100 BPM | 40 – 240 BPM | Tempo of the arpeggio in beats per minute. |
| Bars | number | 2 bars | 1 – 8 bars, step 1 | Number of bars over which the arpeggio is spread. |
| Note duration | number | 0.25 s | 0.05 – 1 s, step 0.05 | Maximum duration of each note. |
| Timbre | choice | Soft | Soft / Bright / Percussive | Waveform for FM synthesis. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the audio. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### L-system

`l-systeme` · Inputs → Generation

*Generates a melody from a self-rewriting grammar (Lindenmayer).*

Generates a melody from a self-rewriting grammar. Aristid Lindenmayer, a biologist, proposed this system in 1968 to describe plant growth: a starting word, and rules replacing each letter with a group of letters, applied to EVERY letter at once. Repeated, the rewriting produces self-similar structures — hence the ferns and trees drawn from it, and here phrases whose motifs repeat at several scales without ever repeating identically. The reading is a turtle's: each symbol is a gesture. A letter plays a note and moves on; + and − move up and down one scale DEGREE, never a semitone, so the result never leaves the key; brackets open and close an ornament, which returns exactly where it started and plays more softly than the line; > and &lt; double and halve the step; a dot is a rest. Five classic grammars are provided — Lindenmayer's algae, whose lengths follow the Fibonacci sequence, the Koch snowflake, the dragon curve, a plant and Cantor dust. Pick « Hand-written » to use your own. The word grows fast: a rule that doubles its length reaches a thousand in ten passes, and the rewriting stops by itself before exploding. The text output gives the resulting word, so you can see what you hear. Nothing is random here: the same grammar always gives the same music.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Word | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Example | choice | Lindenmayer's algae | Hand-written / Lindenmayer's algae / Koch snowflake / Dragon curve / Plant / Cantor dust | Loads a known grammar instead of the axiom and rules typed below. Pick « Hand-written » to use your own. |
| Axiom | text | `A` |  | The starting word, rewritten on every pass. |
| Rules | text | `A=AB, B=A` |  | The replacements, written « A=AB », separated by commas or line breaks. A letter without a rule rewrites to itself. The signs + and − move up and down one scale degree, brackets open and close an ornament, > and &lt; lengthen and shorten the step, a dot is a rest. |
| Iterations | number | 5 | 0 – 12, step 1 | Number of rewrites. The word grows fast: a rule that doubles its length reaches a thousand in ten passes. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Tonic of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | The degrees that + and − walk through: the word never leaves the scale. |
| Octave | number | 4 | 1 – 7, step 1 | Octave of the starting note. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Speed: one step is an eighth note. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Mandelbrot Mapper

`mappeur-mandelbrot` · Inputs → Generation

*Generates a melody from the Mandelbrot set.*

Generates a melody by sampling points from the Mandelbrot set. For each point, the algorithm iterates z = z² + c and counts iterations before divergence. The iteration count is mapped to degrees of the chosen scale. Escape time mode = faster divergence yields higher, louder notes. Dwell mode = points close to the set (slow divergence) are loudest. Octave mode = vertical position selects the octave. Audio output + MIDI output.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Center X | number | -0.5 | -2.5 – 1, step 0.01 | Real X coordinate of the view center in the Mandelbrot plane. |
| Center Y | number | 0 | -1.5 – 1.5, step 0.01 | Imaginary Y coordinate of the view center in the Mandelbrot plane. |
| Zoom | number | 1 | 0.1 – 100, step 0.1 | Zoom factor on the selected region (higher = closer). |
| Max iterations | number | 200 | 50 – 2000, step 10 | Maximum number of z = z² + c iterations before considering the point in the set. |
| Mode | choice | Escape time | Escape time / Dwell / Octave | Escape time = fast divergence → higher/louder notes. Dwell = close to the set → louder. Octave = Y position selects the octave. |
| Notes | number | 32 notes | 8 – 256 notes, step 1 | Number of points sampled in the plane, hence notes generated. |
| Note duration | number | 0.5 | 0.05 – 2, step 0.05 | Duration of each note expressed as a fraction of a beat (1 = one beat/quarter note, 0.5 = eighth note, 0.25 = sixteenth note). Tempo (BPM) determines the actual duration. |
| Tempo | number | 100 BPM | 40 – 240 BPM | Tempo of the melody in beats per minute. |
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Reference note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to quantize note pitches. |
| Octave | number | 4 | 1 – 6, step 1 | Base octave of the generated MIDI notes. |
| Sensitivity | number | 1 | 0.1 – 5, step 0.1 | Multiplier applied to the iteration count to select the scale degree. |
| Timbre | choice | Soft | Soft / Bright / Percussive | Waveform used for FM synthesis. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the audio. |
| Seed | number | 42 | 0 – 999999, step 1 | Seed for the pseudo-random distribution of sampling points. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Mathematical Audio Generator

`generateur-audio-mathematique` · Inputs → Generation

*Generates an audio signal from a mathematical expression.*

Generates an audio signal from scratch using a mathematical expression. Variables: t (time in s), i (sample index), c (channel), ch (channel count), sr (sample rate). For example, sin(t * 2 * pi * 440) generates a 440 Hz sine. The output is clamped to [-1, 1] to avoid out-of-range signals, then scaled by the Volume parameter. Be careful with your system volume before listening to high-intensity results.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Formula | text | `sin(t * 2 * pi * 440)` |  | Mathematical expression giving the sample value. Available variables: t (time in s), i (index), c (channel), ch (channel count), sr (sample rate). |
| Duration | number | 2 s | 0.1 – 30 s, step 0.1 | Duration of the generated signal. |
| Channels | choice | Stereo | Mono / Stereo | Number of output channels. |
| Volume | number | 30 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Melodic Sequencer

`sequenceur-melodique` · Inputs → Generation

*Programs a melody on a step-by-step piano-roll grid (synthesized).*

Programs a melody on a step-by-step piano-roll grid: each row is a scale note (high at top, low at bottom), each column is a step. Click cells to activate notes. Notes are synthesized with a choice of triangle, square, sawtooth or sine waveform, or with a loaded global SoundFont. Choose the key, scale (major, minor, pentatonic, blues), starting octave, tempo, swing and number of bars; the audio output loops the pattern. In SoundFont mode, an Instrument parameter lets you pick the preset (default program 0). The MIDI output reproduces the same pattern for chaining to other MIDI nodes. The root note is highlighted in yellow in the labels.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute. |
| Steps | choice | 16 | 8 / 16 / 32 | Steps per bar (rhythmic resolution). |
| Swing | number | 0 % | 0 – 60 % | Slightly delays off-beats for a shuffle groove. |
| Bars | number | 2 | 1 – 8, step 1 | Number of pattern repetitions. |
| Volume | number | 85 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | major | major / minor / major pentatonic / minor pentatonic / blues | Scale used for the available notes in the grid. |
| Octave | number | 3 | 2 – 6, step 1 | Starting octave (rows span about 2 octaves above). |
| Timbre | choice | Triangle | Triangle / Square / Saw / Sine | Synthesis waveform. Triangle = soft ; Square = 8-bit/retro ; Saw = rich/harmonic ; Sine = pure. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Pattern | text | `0000000000000000\|0000000000000000\|0000000000000000\|000000…` |  | Encoded pattern (edited via the node grid): 13 rows (low to high pitch) of steps separated by « \| ». |

#### Melody Keyboard

`clavier-melodie` · Inputs → Generation

*Plays a keyboard-recorded sequence and also exports a MIDI file.*

Replays a sequence of notes recorded on the block's virtual keyboard and synthesizes it to audio. The keyboard has 88 keys, from A0 to C8, and scrolls; black keys play from their upper part, white keys below. You can also play from the computer keyboard — the zxcvbnm row for white keys, sdghj for black ones — and change octave with the up and down arrows.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Tempo | slider | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Membrane Synth

`membrane-synth` · Inputs → Generation

*Generates a synthetic kick drum with Tone.js.*

Generates a synthetic kick drum using Tone.js MembraneSynth. The sound is rendered offline to directly produce an audio buffer. Adjust the note (pitch), duration, volume, pitch decay, octave range, decay and release.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | text | `C2` |  | Base note of the kick (e.g. C2, A1). Lower notes produce a bigger kick. |
| Duration | number | 1.5 s | 0.1 – 5 s, step 0.1 | Total duration of the generated buffer. The sound is extended if the envelope exceeds this value. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the sound. |
| Pitch decay | number | 0.05 s | 0.001 – 1 s, step 0.001 | Pitch envelope decay time. |
| Octaves | number | 4 oct | 0 – 10 oct, step 0.1 | Pitch drop range in octaves. |
| Decay | number | 0.4 s | 0.01 – 2 s, step 0.01 | Amplitude envelope decay time. |
| Release | number | 1.4 s | 0.01 – 3 s, step 0.01 | Amplitude envelope release time. |

#### Metal Synth

`metal-synth` · Inputs → Generation

*Generates a metallic sound (hi-hat, bell, cymbal) with Tone.js.*

Generates an inharmonic metallic sound (hi-hat, bell, cymbal) using Tone.js MetalSynth. The sound is rendered offline to directly produce an audio buffer. Adjust the note (pitch), duration, volume, harmonicity, modulation index, resonance, filter octaves and envelope.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | text | `C5` |  | Base note (e.g. C5, G5). A high note sounds like a hi-hat; a lower note sounds like a bell. |
| Duration | number | 2 s | 0.1 – 5 s, step 0.1 | Total duration of the generated buffer. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the sound. |
| Harmonicity | number | 5.1 | 0.1 – 10, step 0.1 | Frequency ratio between modulator and carrier. |
| Modulation index | number | 32 | 1 – 100, step 1 | Intensity of frequency modulation. |
| Resonance | number | 4000 Hz | 100 – 7000 Hz, step 10 | Base cutoff frequency of the highpass filter. |
| Octaves | number | 1.5 oct | 0 – 8 oct, step 0.1 | Filter sweep range during the envelope. |
| Attack | number | 0.001 s | 0.001 – 0.5 s, step 0.001 | Envelope attack time (0 = instantaneous). |
| Decay | number | 1.4 s | 0.01 – 3 s, step 0.01 | Envelope decay time to the sustain level. |
| Release | number | 0.2 s | 0.01 – 3 s, step 0.01 | Envelope release time after the note ends. |

#### Metronome

`metronome` · Inputs → Generation

*Generates a steady metronome click at a given tempo.*

Generates a metronome audio signal: a steady click at a given tempo (40-240 BPM), with time signature (4/4, 3/4, 2/4, 6/8, 5/4, 7/8). The first beat of each bar is accented (louder and higher). Three timbres: Click (short transient, noise), Woodblock (woody resonance) and Beep (brief sine). Useful for practice, setting a reference tempo or generating a click track for recording.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Speed in beats per minute. |
| Time signature | choice | 4/4 | 4/4 / 3/4 / 2/4 / 6/8 / 5/4 / 7/8 | Time signature. The first beat of each bar is accented. |
| Duration | number | 10 s | 1 – 60 s, step 1 | Total duration of the metronome. |
| Timbre | choice | Click | Click / Woodblock / Beep | Click sound. Click = short transient; Woodblock = woody resonance; Beep = brief sine. |
| Volume | number | 90 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Multi-reservoir

`multi-reservoirs` · Inputs → Generation

*Multiple neural reservoirs in network (melody, bass, harmony, rhythm) — polyphonic emergence.*

Four neural reservoirs in network, each with a distinct musical role: melody (lead voice, octave 4), bass (low octave, long memory), harmony (held notes, sparse) and rhythm (determines when others play). The reservoirs influence each other via the « Influence » parameter: rhythm filters the active steps of other voices, creating emergent polyphonic coherence. The node outputs a stereo audio mix + four independent MIDI files (melody, bass, harmony, rhythm) to drive other synthesizers or drum machines. The rhythm MIDI track uses standard GM drum notes (kick, snare, hi-hat, etc.) and the « Drum kit » parameter selects the SoundFont preset for it. Each reservoir has its own parameters (neurons, connectivity) + global parameters (key, scale, tempo, timbre, seed). No training — emergence arises from interaction between random networks. Inspired by Allendia/EVY, pushed towards polyphony. Each MIDI output carries its own instrument, written into the file so a node rendering it downstream follows it, and each part has its own channel — melody 0, bass 1, harmony 2, rhythm 9. « Follow MIDI » writes nothing. With the SoundFont — « Auto » picks it as soon as an SF2 is loaded — these instruments are also what you hear: the four parts are merged and played as a single MIDI. With the built-in synthesis, the node keeps its oscillator timbres and the choices only apply to the MIDI files.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | Melody MIDI | MIDI |  |
| output | Bass MIDI | MIDI |  |
| output | Harmony MIDI | MIDI |  |
| output | Rhythm MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | major | major / minor / major pentatonic / minor pentatonic / blues | Scale used to map activations to notes. |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Speed in beats per minute. |
| Resolution | choice | 1/8 | 1/4 / 1/8 / 1/16 | Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth. |
| Bars | number | 4 | 1 – 64, step 1 | Number of bars to generate. |
| Timbre | choice | Triangle | Sine / Square / Saw / Triangle | Synthesis waveform. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new network each run). |
| Mel. neurons | number | 15 | 5 – 40, step 1 | Melody reservoir neurons. |
| Mel. connectivity | number | 30 % | 0 – 100 %, step 1 | Melody reservoir connectivity. |
| Mel. memory | number | 30 % | 0 – 100 %, step 1 | Melody reservoir memory. |
| Bass neurons | number | 10 | 5 – 30, step 1 | Bass reservoir neurons. |
| Bass connectivity | number | 25 % | 0 – 100 %, step 1 | Bass reservoir connectivity. |
| Bass octave | number | 2 | 1 – 4, step 1 | Bass octave. |
| Harm. neurons | number | 8 | 5 – 30, step 1 | Harmony reservoir neurons (held notes). |
| Harm. connectivity | number | 20 % | 0 – 100 %, step 1 | Harmony reservoir connectivity. |
| Rhythm neurons | number | 12 | 5 – 30, step 1 | Rhythm reservoir neurons (determines when others play). |
| Rhythm density | number | 50 % | 10 – 100 %, step 1 | Rhythm pattern density. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, otherwise the built-in synthesis. The SoundFont plays the instruments chosen below; the built-in synthesis keeps its oscillator timbres and ignores those choices. |
| Melody instrument | SoundFont preset | follow MIDI |  | Preset of the global SoundFont written into the « Melody MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres. |
| Bass instrument | SoundFont preset | follow MIDI |  | Preset of the global SoundFont written into the « Bass MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres. |
| Harmony instrument | SoundFont preset | follow MIDI |  | Preset of the global SoundFont written into the « Harmony MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres. |
| Drum kit | SoundFont preset | bank 128, program 0 |  | Preset of the loaded global SoundFont to use for the rhythm MIDI track. Select a percussion kit (bank 128). |
| Drum transpose | number | 0 semitones | -36 – 36 semitones, step 1 | Transpose the drum MIDI notes if the SoundFont drum kit is not mapped to General MIDI notes. |
| Influence | number | 50 % | 0 – 100 %, step 1 | Cross-influence of rhythm on other voices. 0 = independent, 100% = others only play on rhythmic steps. |

#### Music Generator

`generateur-musical` · Inputs → Generation

*Generates a multi-track composition from a descriptive script. Audio output + three MIDI outputs (one per instrument).*

Script: genre=pop, tempo=120, cle=C, gamme=majeur, duree=30

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |
| output | MIDI 1 | MIDI |  |
| output | MIDI 2 | MIDI |  |
| output | MIDI 3 | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Genre | choice | pop | pop / rock / jazz / blues / classic / electro / hip hop / reggae / ambient | Musical style, which guides the harmonic and rhythmic choices. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / Minor | Scale used to pick notes (major, minor, pentatonic…). |
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Duration | number | 30 s | 4 – 120 s | Generated duration, in seconds. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Instrument 1 | choice | Piano | Piano / Electric piano / Acoustic guitar / Electric guitar / Organ / Harpsichord / Vibraphone / Marimba / Cords / Pad | Layer 1 — chords. |
| Instrument 2 | choice | Fretless bass | Fretless bass / Acoustic bass / Electric bass / Synth bass / Double bass / Slap bass | Layer 2 — bass. |
| Instrument 3 | choice | Marimba | Marimba / Flute / Trumpet / Sax alto / Nylon guitar / Violin / Lead synth / Music box / Xylophone / Cords | Layer 3 — melody. |

#### MusicGen

`musicgen` · Inputs → Generation

*Generates music from a text prompt using Xenova/musicgen-small, an ONNX-converted version of Meta's MusicGen Small text-to-audio model, optimized to run locally in JavaScript environments via Transformers.js.*

Generates music from a text prompt using MusicGen-small (facebook/musicgen-small, 300M parameters), run in ONNX via Transformers.js. The model auto-downloads from HuggingFace on first use (~300 MB, cached by the browser). Generation is auto-regressive (sequential) and runs in a Web Worker to avoid blocking the UI. Write a descriptive prompt in English (e.g. « A happy upbeat pop song with electric guitars »), set the duration (3-30 s) and guidance (conditioning strength). First run is slower (download + model loading). Ideally connected to an « Audio Output » node to listen to the result.

| Port | Name | Type | |
|---|---|---|---|
| input | Prompt | text |  |
| output | Audio | audio (mono) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `A happy upbeat pop song with electric guitars` |  | Text description of the music to generate (English for best results). |
| Duration | slider | 10 s | 3 – 30 s, step 1 | Duration of the generated audio (3 to 30 seconds). Longer durations mean slower generation. |
| Guidance scale | slider | 3 | 0 – 10, step 0.5 | Strength of adherence to the text prompt. Higher values = more faithful but less varied. |

#### Neural Reservoir

`reservoir-musical` · Inputs → Generation

*Generates emergent melody via random neural networks (inspired by Allendia/EVY). Audio output + MIDI output.*

Generates emergent melody via random neural networks (Reservoir Computing), inspired by Allendia's EVY plugin (Inria startup). A "reservoir" of a few neurons with fixed random weights (untrained) circulates a rhythmic impulse. Activations are mapped to a scale to produce melodic patterns. No training, no dataset, no copyright — patterns emerge from the random network structure, like a kaleidoscope. The node now has an audio output (rendered locally with the chosen timbre and volume) and a MIDI output (a MIDI file that can be connected to a Transposer/Quantizer, Arpeggiator or MIDI Output). Parameters: neuron count (5-50, few = catchy patterns, many = complex), connectivity, memory (leaking), spectral radius (&lt;100% = stable, >100% = chaotic), scale, key, octave, tempo, resolution, note density, repetition, silence, seed, timbre, volume and instrument. Non-zero seed = same network = same melody. Seed 0 = new random network each run.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Neurons | number | 15 | 5 – 50, step 1 | Number of neurons in the reservoir. Few = short repetitive patterns; many = complex chaotic patterns. |
| Connectivity | number | 30 % | 0 – 100 %, step 1 | Probability of connection between neurons. Low = simple patterns; high = dense patterns. |
| Memory | number | 30 % | 0 – 100 %, step 1 | Leaking rate. High = long memory, slowly evolving patterns; low = brief reactions. |
| Spectral radius | number | 90 % | 50 – 150 %, step 1 | Network spectral radius. &lt;100% = stable (converges); >100% = chaotic (diverges). 90% = melodic sweet spot. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note (tonic) of the scale. |
| Scale | choice | major | major / minor / major pentatonic / minor pentatonic / blues / chromatic | Scale used to map network activations to notes. |
| Octave | number | 4 | 2 – 6, step 1 | Starting octave (notes can span 2 octaves above). |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Speed in beats per minute. |
| Resolution | choice | 1/8 | 1/4 / 1/8 / 1/16 | Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth. |
| Bars | number | 4 | 1 – 64, step 1 | Number of bars to generate. |
| Timbre | choice | Triangle | Sine / Square / Saw / Triangle | Synthesis waveform. |
| Density | number | 70 % | 0 – 100 %, step 1 | Probability of producing a note at each step. High = dense melody; low = sparse melody. |
| Repetition | number | 25 % | 0 – 100 %, step 1 | Tendency to repeat the previous note. High = catchy patterns; low = continuous variation. |
| Silence | number | 10 % | 0 – 50 %, step 1 | Probability of silence at each step. Creates breathing room in the melody. |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new random network each run). Same seed = same network = same melody. |
| Volume | number | 85 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Noise Generator

`generateur-bruit` · Inputs → Generation

*Generates white, pink or brownian noise.*

Generates noise — a random signal handy for testing filters and envelopes, or as raw sound material. White: all frequencies at equal level (flat, hissy spectrum). Pink: −3 dB per octave, perceptually balanced (rain-like). Brownian: −6 dB per octave, dark and muffled. Connect it to the Spectrum Analyzer or Spectrogram to visualize the coloration.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Type | choice | White | White / Pink / Brownian | White = all frequencies at equal level (flat spectrum). Pink = −3 dB/octave (perceptually balanced). Brownian = −6 dB/octave (dark, muffled). Connect to the Spectrum Analyzer to see the difference. |
| Duration | number | 2 s | 0.2 – 10 s, step 0.1 | Generated duration, in seconds. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the noise. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same noise, sample for sample. |

#### Oscillator

`oscillateur` · Inputs → Generation

*Generates a pure waveform; the view shows the wave and its harmonics.*

Generates a pure waveform by additive synthesis (sum of harmonics, alias-free). The view shows a few periods of the wave on top and its harmonics below: a sine = a single bar; square/triangle = odd harmonics; sawtooth = all of them. Illustrates the timbre ↔ harmonics link.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Waveform | choice | Sine | Sine / Square / Sawtooth / Triangle | Waveform. Sine = a single frequency. Square/Triangle = odd harmonics. Sawtooth = all harmonics. |
| Frequency | number | 220 Hz | 20 – 4000 Hz, step 1 | Pitch (fundamental), in hertz. |
| Duration | number | 1.5 s | 0.2 – 5 s, step 0.1 | Duration of the generated tone. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Pluck Synth

`pluck-synth` · Inputs → Generation

*Generates a plucked string note using Karplus-Strong synthesis.*

Generates a plucked string note using Karplus-Strong synthesis with Tone.js PluckSynth. Adjust the note, attack noise, dampening, resonance and release. The sound is rendered offline.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | text | `C4` |  | Plucked string note (e.g. C4, G3). |
| Duration | number | 2 s | 0.1 – 5 s, step 0.1 | Total duration of the generated buffer. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the sound. |
| Attack noise | number | 1 | 0.1 – 20, step 0.1 | Amount of noise at the attack. |
| Dampening | number | 4000 Hz | 100 – 7000 Hz, step 10 | Cutoff frequency of the comb filter's lowpass. |
| Resonance | number | 0.7 | 0 – 1, step 0.01 | Resonance / sustain duration. |
| Release | number | 1 s | 0 – 3 s, step 0.01 | Time for the resonance to ramp down to zero. |

#### Poly Synth

`poly-synth` · Inputs → Generation

*Generates a polyphonic chord with an ADSR envelope.*

Generates a polyphonic chord using Tone.js PolySynth. Each voice uses a simple oscillator (sine, square, sawtooth, triangle) with a full ADSR envelope. Enter notes separated by commas. The sound is rendered offline to directly produce an audio buffer.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | text | `C4,E4,G4` |  | Chord notes, comma-separated (e.g. C4,E4,G4). |
| Note duration | number | 0.5 s | 0.05 – 5 s, step 0.05 | Duration each note is held before release. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the sound. |
| Waveform | choice | triangle | sine / square / sawtooth / triangle | Oscillator waveform. |
| Attack | number | 0.01 s | 0 – 1 s, step 0.001 | Envelope attack time (0 = instantaneous). |
| Decay | number | 0.1 s | 0 – 2 s, step 0.01 | Envelope decay time to the sustain level. |
| Sustain | number | 0.3 level | 0 – 1 level, step 0.01 | Envelope sustain level (0 = silence, 1 = maximum). |
| Release | number | 1 s | 0 – 3 s, step 0.01 | Envelope release time after the note ends. |

#### Pulsar Synthesis

`pulsars-roads` · Inputs → Generation

*Fundamental and formant set independently, from short repeated bursts.*

After Curtis Roads's pulsar synthesis ("Microsound", 2001). A pulsar is a brief waveform — the pulsaret — followed by silence, the whole thing repeated. Two durations describe it, and therein lies its interest: the repetition PERIOD, whose inverse gives the fundamental you hear, and the PULSARET DURATION, whose inverse gives the formant position, that is, the region of the spectrum where energy concentrates. The two are independent: you can drop the note an octave without moving the formant, or move the formant without changing the note. No acoustic instrument allows this, and neither does classic granulation, whose time grid and grain content stay tied together. The silence between pulsars is not incidental: it is what makes the decoupling possible. When the pulsaret duration reaches the period — that is, when the formant drops to the fundamental — pulsars touch and the process dissolves into a continuous waveform; the node caps there, which is a constraint of the model rather than a limitation of the implementation.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fundamental | number | 110 Hz | 20 – 2000 Hz, step 1 | Number of pulsars per second, hence the note you hear. It is set without touching the formant. |
| Formant | number | 1100 Hz | 50 – 8000 Hz, step 10 | Region of the spectrum where energy concentrates, equal to the inverse of the pulsaret duration. It is set without touching the note. Brought down to the fundamental it saturates: pulsars touch and the sound becomes continuous again. |
| Shape | choice | Sine | Sine / Square / Sawtooth | Waveform of the pulsaret. Sine gives a clean formant; square and sawtooth add higher replicas of it. |
| Duration | number | 5 s | 0.2 – 120 s, step 0.1 | Length of the produced sound. |
| Amplitude | slider | 80 % | 0 – 100 %, step 1 | Output level. |

#### Pure Data

`pure-data` · Inputs → Generation

*Generates audio by running a Pure Data patch (.pd).*

Generates audio by running a Pure Data patch (.pd). The patch is interpreted by libpd in a WebAssembly AudioWorklet. Load the .pd file from the node button. The patch runs on an empty buffer of the chosen duration and the output is captured from [dac~] objects. Use patches without [adc~]: this node does not receive input audio. Choose the object library (vanilla, cyclone, else, full) depending on the objects used by the patch. GUI objects (buttons, sliders, arrays…) can be ignored with the corresponding option.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Libraries | choice | vanilla | vanilla / cyclone / else / full | Set of Pd objects available to the patch. vanilla = core objects, cyclone/else = common externals, full = everything. |
| Duration | slider | 1 s | 0.1 – 10 s, step 0.1 | Duration of the audio generated by the patch. The patch runs on an empty buffer of this duration. |
| Output channels | slider | 2 ch | 1 – 8 ch, step 1 | Number of channels of the audio output. The patch must write to the matching dac~ channels. |
| Bang on start | choice | yes | yes / no | Send a bang to the [loadbang] object when audio starts. |
| Ignore GUI objects | choice | no | yes / no | Removes graphical objects (buttons, sliders, faders, arrays…) from the patch before execution. Some desktop patches use these for the UI but they are not supported by libpd in headless mode. |
| Patch | text | — |  | Identifier of the loaded patch (updated automatically by the file picker). Used to invalidate the cache when the file changes. |

#### Random Melody

`melodie-aleatoire` · Inputs → Generation

*Generates a random melody.*

Composes a random melody in the chosen key and scale, over the given number of bars. Audio output + MIDI output for chaining to other MIDI nodes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Root note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to pick notes (major, minor, pentatonic…). |
| Time signature | choice | 4/4 | 4/4 / 3/4 / 6/8 | Time signature (4/4, 3/4, 6/8…). |
| Tempo | number | 100 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Bars | number | 4 | 1 – 32, step 1 | Number of bars to generate. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the melody. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same melody. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Risset Bell

`cloche-risset` · Inputs → Generation

*Synthesises a bell by adding inharmonic partials.*

The timbre from Jean-Claude Risset's "Introductory Catalogue of Computer Synthesized Sounds" (Bell Labs, 1969), influential for a precise reason: it showed that timbre is not a fixed spectrum but an EVOLUTION. A bell sounds like a bell not because it contains particular frequencies, but because its eleven partials die away at DIFFERENT rates — the highest in a tenth of the time the lowest take. A second lesson, which the "Inharmonicity" parameter lets you hear: no partial is an integer multiple of the base frequency, which is why a bell has no definite pitch. Set it to 0% and the same partials, snapped onto the harmonics, instantly stop sounding like a bell. Finally, two partials are doubled 1 Hz and 1.7 Hz apart: that tiny detuning makes them beat slowly, and this beating is what gives the bell its life — the "Beating" parameter lets you switch it off and hear it vanish. The stated frequency is NOT the perceived pitch, since no partial sits on it.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Frequency | number | 400 Hz | 40 – 2000 Hz, step 1 | Reference frequency from which the eleven partials are derived. Not the perceived pitch: no partial sits on it. |
| Duration | number | 8 s | 0.2 – 30 s, step 0.1 | Length of the note, i.e. of the longest-lasting partial. The others fade sooner, in fixed proportion. |
| Partials | number | 11 | 1 – 11, step 1 | Number of partials kept, from lowest to highest. Reducing thins the timbre — useful to hear what each one contributes. |
| Inharmonicity | slider | 100 % | 0 – 100 %, step 1 | 100% = Risset's inharmonic ratios. 0% = each partial snapped onto the nearest integer harmonic: the bell vanishes, leaving an organ-like tone. The most direct demonstration of what makes a bell. |
| Beating | slider | 100 % | 0 – 400 %, step 5 | Scale of the 1 Hz and 1.7 Hz detunings applied to the doubled partials. 0% = no beating, a static tone; above 100% the beating speeds up until it turns into roughness. |

#### Sieve (Xenakis)

`crible-xenakis` · Inputs → Generation

*Builds a scale and a rhythm from modular arithmetic.*

After Iannis Xenakis's sieve theory ("Sieves", 1990; the technique appears as early as "Nomos alpha", 1966). Xenakis was looking for a way to build scales and rhythms that are neither regular nor random — both bore the ear, one through predictability, the other through shapelessness. His answer lies in modular arithmetic: a sieve keeps the integers n such that n ≡ i (mod m), written m@i. Taken alone a sieve is just a grid: 3@0 gives 0, 3, 6, 9… Combined, two sieves produce a sequence whose intervals only repeat after the LCM of the moduli — long enough that periodicity is no longer heard, structured enough that it is not heard as chance. That in-between is exactly what Xenakis aimed at, and why he chose coprime moduli: 5, 7 and 11 give a period of 385, beyond the ear's reach. The node reads the same structure along two axes — the kept degrees become pitches, or onsets, or both — which Xenakis claimed explicitly: pitch and rhythm are for him the same thing seen from two sides.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Sieve | text | `5@0 7@2 11@3` |  | Residual classes as "modulus@residue", separated by spaces. Coprime moduli give the longest period: 5@0 7@2 11@3 only repeats after 385 degrees. Malformed fragments are ignored rather than emptying the sieve. |
| Operation | choice | Union | Union / Intersection / Difference | "Union" keeps what at least one class holds — the operation that creates irregularity. "Intersection" keeps only what all of them hold, hence very little. "Difference" keeps what the FIRST class holds and no other does: the only way to punch holes in a regular grid. |
| Reading | choice | Pitches and rhythm | Pitches / Rhythm / Pitches and rhythm | Which axis to read the sieve along. "Pitches" plays the kept degrees as evenly spaced notes; "Rhythm" plays a single note at the kept onsets; "Pitches and rhythm" does both — the duality Xenakis claimed. |
| Span | number | 96 | 8 – 512, step 1 | Number of degrees examined. To hear a long-period sieve you need at least its period — otherwise you only hear a fragment. |
| Base note | number | 48 | 24 – 96, step 1 | MIDI pitch of degree 0. Each kept degree is one semitone above. |
| Subdivision | number | 120 ms | 20 – 1000 ms, step 10 | Duration of one degree on the time axis. Short, the sieve is heard as a texture; long, as a melody. |
| Note length | slider | 60 % | 10 – 100 %, step 5 | Share of the subdivision actually sounding. Low, notes stand apart; high, they run together. |

#### Stable Audio 3

`stable-audio-3` · Inputs → Generation

*Generates stereo music from a text prompt using Stable Audio 3 (ONNX).*

Generates stereo music at 44.1 kHz from a text prompt using Stable Audio 3 small-music. The ONNX model (~640 MB) runs in the main process. Generation is slow (several minutes). Use an English prompt and the small-music model (music only).

| Port | Name | Type | |
|---|---|---|---|
| input | Prompt | text |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `A rhythmic electronic loop with deep bass and crisp drums` |  | Text description of the music to generate (English for best results). |
| Duration | slider | 10 s | 3 – 30 s, step 1 | Duration of the generated audio (seconds). The model adds 6 s of internal headroom. |
| Steps | slider | 8 | 1 – 20, step 1 | Number of ping-pong sampler steps. 8 = quality/speed sweet spot. |
| Seed | slider | -1 | -1 – 999999, step 1 | Random seed. -1 = random. |
| Model path | folder | — |  | Absolute or relative path of the Stable Audio 3 bundle (empty = bundled public/oonx/stable-audio-3-small-music). |

#### Text → MIDI

`texte-vers-midi` · Inputs → Generation

*Converts a text notation (one note/chord per line) into MIDI + audio.*

Renders a simple text notation into a MIDI file and synthesized audio. One line = « note octave duration [velocity] », e.g. « C4 0.5 » or « C4+E4+G4 1 » (chord), « rest 0.5 » for a rest, « TEMPO 120 » at the top. Text comes from the input (blue port) or the parameter. Ideal after an AI node (Ollama, GPT-2) prompted to output this format.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notation | text | `TEMPO 120 C4 0.5 E4 0.5 G4 0.5 C5 1 rest 0.5 A4+C5+E5 1` |  | Notation to convert, used when no text input is connected. One note/chord per line. |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Default tempo (beats → seconds). A « TEMPO n » line in the text overrides it. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesized audio volume. |

#### Tiling Canon

`canon-pavage` · Inputs → Generation

*Builds a rhythmic canon where each pulse is struck by one voice and one only.*

Builds a rhythmic tiling canon. An ordinary canon layers a melody over itself, offset. A tiling canon adds a constraint of arithmetical severity: at each pulse of the cycle, one voice and one only must strike — never two together, never none. The motif and the voice entries therefore interlock exactly, like tiles covering a floor with no gap and no overlap. The question goes back to the 1950s in mathematics (Hajós, de Bruijn); Dan Tudor Vuza restated it musically in 1991, and Moreno Andreatta and Emmanuel Amiot implemented it at IRCAM in OpenMusic. The entries are found by exact cover: take the smallest still-free pulse — someone has to strike it — try every way of placing a voice there, and repeat; no branch is missed. The most sought-after case is the one where NEITHER the motif NOR the entries are periodic: a Vuza canon. Those exist only from a cycle of 72 pulses upwards, every shorter tiling having a hidden regularity — the node checks this and says so in its report. Giving each voice a different pitch is not an ornament: on a single pitch one would hear only a steady pulse, which is exactly what every tiling canon is, without hearing that it is shared.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Grid | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pulses | number | 12 | 2 – 48, step 1 | Cycle length. The motif and the entries must tile it exactly: their product therefore always equals this number. |
| Motif | text | `0 1 2` |  | The positions struck by one voice, as pulse numbers. Leave empty for the node to search for a tiling motif itself. |
| Searched size | number | 3 | 2 – 12, step 1 | Number of onsets per voice, when the motif is left empty. It must divide the number of pulses. |
| Step length | number | 0.2 s | 0.05 – 1 s, step 0.05 | Length of one pulse. |
| Repeats | number | 4 | 1 – 16, step 1 | Number of cycles played. |
| Pitches | text | `60 64 67 72` |  | One MIDI pitch per voice. This is what makes the tiling audible: on a single pitch one would hear only a steady pulse — which is exactly what every tiling canon is — without hearing that it is shared. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

### Image

| Component | Summary |
|---|---|
| [Image input](#image-input) | Loads an image file and passes it to its output. |
| [SVG Reader](#svg-reader) | Loads an SVG file and rasterizes it to a PNG image. |
| [Text to image](#text-to-image) | Generates a 512×512 image from a text prompt using SDXS-512 (ONNX, 1 step, local). |

#### Image input

`entree-image` · Inputs → Image

*Loads an image file and passes it to its output.*

Loads an image file (PNG, JPEG…) from the inspector and passes it on its 'Image' output. Connect it to an Image Renderer to preview, to a Pixeltone to sonify, or to an Image Export to save.

| Port | Name | Type | |
|---|---|---|---|
| output | Image | image |  |

*No parameters.*

#### SVG Reader

`lecteur-svg` · Inputs → Image

*Loads an SVG file and rasterizes it to a PNG image.*

Loads an SVG file from the inspector and rasterizes it to a PNG image at the chosen dimensions. The 'Image' output can be connected to an Image Renderer, a Pixeltone, or an Image Export.

| Port | Name | Type | |
|---|---|---|---|
| output | Image | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Width | number | 512 px | 1 – 4096 px, step 1 | Width of the output PNG image. |
| Height | number | 512 px | 1 – 4096 px, step 1 | Height of the output PNG image. |

#### Text to image

`texte-image` · Inputs → Image

*Generates a 512×512 image from a text prompt using SDXS-512 (ONNX, 1 step, local).*

Generates a 512×512 image from a text prompt using SDXS-512 (1-step distilled UNet + TAESD decoder, int8-quantized, ~680 MB). Runs in the main process, CPU only, ~10 s/image. The model is bundled with the app. You can also use your own bundle via the “Model path” parameter. Use an English prompt.

| Port | Name | Type | |
|---|---|---|---|
| input | Prompt | text |  |
| output | Image | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `a red apple on a wooden table, photo` |  | Text description of the image to generate (English for best results). |
| Seed | slider | -1 | -1 – 999999, step 1 | Random seed. -1 = random. |
| Model path | folder | — |  | Folder of the SDXS-512 bundle (empty = bundled model in resources/oonx/sdxs-512-texte-image). |

### Text

| Component | Summary |
|---|---|
| [PDF input](#pdf-input) | Loads a PDF file and passes it to its output. |

#### PDF input

`entree-pdf` · Inputs → Text

*Loads a PDF file and passes it to its output.*

Loads a PDF file from the inspector and passes it to its « File » output — connect to PDF Extraction.

| Port | Name | Type | |
|---|---|---|---|
| output | File | file |  |

*No parameters.*

### Text to Speech

| Component | Summary |
|---|---|
| [French TTS](#french-tts) | French text-to-speech using Kokoro-82M (Siwis voice). |
| [Kokoro TTS](#kokoro-tts) | Local English text-to-speech with Kokoro-82M (ONNX). |
| [MMS-TTS Multilingual](#mms-tts-multilingual) | Multilingual text-to-speech (Meta MMS, 10+ languages). |
| [Piper TTS](#piper-tts) | Local multilingual text-to-speech via Piper TTS (ONNX). |
| [SpeechT5 TTS](#speecht5-tts) | High-quality text-to-speech (Microsoft SpeechT5, English). |
| [Text Input](#text-input) | Outputs user-entered text on its text output. |

#### French TTS

`tts-francais` · Inputs → Text to Speech

*French text-to-speech using Kokoro-82M (Siwis voice).*

French text-to-speech using Kokoro-82M (ONNX, Transformers.js) with the Siwis voice. French phonemization is handled by ephone (eSpeak-NG WASM). Connect a « Text Source » node to the text input (blue port). Adjust the speed. The model downloads from HuggingFace on first use (~80 MB in q8, cached). Runs in a Web Worker.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio (mono) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Speed | slider | 1 | 0.5 – 2, step 0.1 | Speaking speed (1 = normal speed). |

#### Kokoro TTS

`tts-kokoro` · Inputs → Text to Speech

*Local English text-to-speech with Kokoro-82M (ONNX).*

Local English text-to-speech using Kokoro-82M (ONNX, Transformers.js). Connect a « Text Source » node to the text input (blue port). Pick a voice (US or British English) and adjust the speed. The model downloads from HuggingFace on first use (~80 MB in q8, cached). Runs in a Web Worker.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio (mono) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Voice | choice | af_heart | af_heart / af_alloy / af_aoede / af_bella / af_jessica / af_kore / af_nicole / af_nova / af_river / af_sarah / af_sky / am_adam / am_echo / am_eric / am_fenrir / am_liam / am_michael / am_onyx / am_puck / am_santa / bf_alice / bf_emma / bf_isabella / bf_lily / bm_daniel / bm_fable / bm_george / bm_lewis | Kokoro voice to use. The model (~82 M parameters) and voice are downloaded from HuggingFace on first use. |
| Speed | slider | 1 | 0.5 – 2, step 0.1 | Speaking speed (1 = normal speed). |

#### MMS-TTS Multilingual

`tts-mms` · Inputs → Text to Speech

*Multilingual text-to-speech (Meta MMS, 10+ languages).*

Multilingual text-to-speech using Meta MMS (Massively Multilingual Speech). Connect a « Text Source » node to the text input (blue port). Choose from 10+ languages (English, French, Spanish, German, Italian, Portuguese, Dutch, Romanian, Polish, Russian). Each language uses a dedicated MMS model that downloads on first use (~60 MB each, cached). Runs in a Web Worker.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Language | choice | English | English / French / Spanish / German / Italian / Portuguese / Dutch / Romanian / Polish / Russian | Language of the text to synthesize. Determines which MMS model is used. |

#### Piper TTS

`tts-piper` · Inputs → Text to Speech

*Local multilingual text-to-speech via Piper TTS (ONNX).*

Local multilingual text-to-speech using Piper TTS (ONNX). Connect a « Text Source » node to the text input (blue port). Choose a voice (Russian, English, French, German, Spanish). The ONNX voice model is downloaded from HuggingFace the first time, then cached.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Voice | choice | RU-irina-medium | RU-irina-medium / RU-ruslan-medium / EN-libritts_r-medium / FR-siwis-medium / DE-thorsten-medium / ES-davefx-medium | Piper voice to use. Russian voices are recommended for Russian. The ONNX voice model is downloaded from HuggingFace on first use, then cached. |

#### SpeechT5 TTS

`tts-speecht5` · Inputs → Text to Speech

*High-quality text-to-speech (Microsoft SpeechT5, English).*

High-quality text-to-speech using Microsoft SpeechT5. Connect a « Text Source » node to the text input (blue port). The model generates English speech with a natural voice. Choose from 7 preset voices (CMU Arctic embeddings): 2 US females (SLT, CLB), 2 US males (BDL, RMS), 1 Canadian male (JMK), 1 Scottish male (AWB) and 1 Indian male (KSP). The model downloads from HuggingFace on first use (~150 MB, cached). Runs in a Web Worker.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Voice | choice | US male (BDL) | US male (BDL) / US female (SLT) / US female (CLB) / US male (RMS) / Canadian male (JMK) / Scottish male (AWB) / Indian male (KSP) | Preset voice (CMU Arctic embeddings). BDL/RMS = US males; SLT/CLB = US females; JMK = Canadian male; AWB = Scottish male; KSP = Indian male. |

#### Text Input

`source-texte` · Inputs → Text to Speech

*Outputs user-entered text on its text output.*

Outputs user-entered text on its text output (blue port). Connect it to a text-to-speech node (SpeechT5, MMS-TTS), an AI script generator or any node accepting a text input.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Text | text | `Hello, this is a test text.` |  | Text to output. Will be sent on the text output (blue port). |

## Processing

### Conversion

| Component | Summary |
|---|---|
| [Chords → MIDI Notation](#chords--midi-notation) | Converts Harmonic Analysis output into the notation expected by Text → MIDI. |
| [MIDI Transcriber](#midi-transcriber) | Transcribes an audio signal into MIDI notes. |
| [MP3 → WAV](#mp3--wav) | Converts an audio stream to downloadable WAV. |
| [WAV → MP3](#wav--mp3) | Converts an audio stream to downloadable MP3. |

#### Chords → MIDI Notation

`accords-vers-notation` · Processing → Conversion

*Converts Harmonic Analysis output into the notation expected by Text → MIDI.*

Translates Harmonic Analysis output into notation playable by Text → MIDI. « Detected chords » source: transcribes the actual harmony, converting the measured durations (seconds) into beats via Tempo. « Progression » source: expands the suggested roman numerals, which also requires the Key input.

| Port | Name | Type | |
|---|---|---|---|
| input | Key | text |  |
| input | Progression | text |  |
| input | Detected chords | text |  |
| output | Notation | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Source | choice | Detected chords | Detected chords / Progression | « Detected chords » transcribes the actual harmony with its measured durations. « Progression » expands the suggested roman numerals, which requires the Key input. |
| Scale | choice | major | major / minor | Scale the degrees are read in, when the Key input names no mode. « Harmonic Analysis » writes « A minor (90%) »: that mode wins, and this setting only applies to a hand-typed tonic. In minor, III, VI and VII drop a semitone. |
| Octave | number | 3 | 1 – 6, step 1 | Octave of the root note of the generated chords. |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Tempo written at the top of the notation. Also used to convert the analysis durations from seconds into beats. |
| Duration per chord | number | 1 beats | 0.25 – 8 beats, step 0.25 | Duration given to each chord when the source provides none (Progression case). |

#### MIDI Transcriber

`transcripteur-midi` · Processing → Conversion

*Transcribes an audio signal into MIDI notes.*

Transcribes audio into MIDI notes, via monophonic pitch detection (FFT) or polyphonic (Basic Pitch ONNX).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Method | choice | Monophonic (FFT) | Monophonic (FFT) / Polyphonic (Basic Pitch ONNX) | Transcription algorithm. |
| Onset threshold | number | 10 % | 1 – 50 % | Note attack detection sensitivity. |
| Min note | number | 36 | 21 – 120 | Lowest MIDI note to detect. |
| Max note | number | 96 | 21 – 127 | Highest MIDI note to detect. |
| MIDI tempo | number | 120 BPM | 40 – 240 BPM | Tempo of the generated MIDI file. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### MP3 → WAV

`convertisseur-mp3-wav` · Processing → Conversion

*Converts an audio stream to downloadable WAV.*

Makes the signal available as a downloadable WAV, while passing it through on the audio output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Duration | control |  |

*No parameters.*

#### WAV → MP3

`convertisseur-audio` · Processing → Conversion

*Converts an audio stream to downloadable MP3.*

Encodes the signal into a downloadable MP3 at the chosen quality, while passing it through on the audio output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Duration | control |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Quality | number | 192 kbps | 64 – 320 kbps | MP3 encoding bitrate, in kbps (higher = better quality, larger file). |

### Editing

| Component | Summary |
|---|---|
| [Add Silence](#add-silence) | Adds silence at the beginning and/or end of the track. |
| [Audio Join](#audio-join) | Places two tracks one after the other with a crossfade. |
| [Extract duration](#extract-duration) | Measures track duration and passes it along. |
| [Extract Zone](#extract-zone) | Extracts a portion with fade and returns the Zone object. |
| [Extract Zones (Selector)](#extract-zones-selector) | Cuts and concatenates the zones chosen in the multi-zone selector. |
| [Logistic Mixer](#logistic-mixer) | Mixes two tracks with a logistic transition: the first fades out while the second fades in. |
| [Loop](#loop) | Repeats the whole signal a given number of times. |
| [Loop End](#loop-end) | Closes a graph loop and puts every pass's result end to end. |
| [Loop Start](#loop-start) | Marks the start of a graph loop: what follows is replayed N times, each pass starting from the previous result. |
| [MIDI Join](#midi-join) | Places two MIDI files one after another with an overlap. |
| [MIDI Loop](#midi-loop) | Repeats a MIDI file a given number of times. |
| [Mixer](#mixer) | Sums several tracks into one. Each track's level is set on the node that produces it. |
| [Multi-Zone Selector](#multi-zone-selector) | Selects multiple audio zones and passes them as a list. |
| [Place sound on zones](#place-sound-on-zones) | Inserts a copy of a sound at the center of each zone onto a target track, or onto a silent track of the given duration. |
| [Reinsert Zone](#reinsert-zone) | Reinserts a treated zone into the original track. |
| [Track Aligner](#track-aligner) | Aligns a track to a reference length (silence or fade). |
| [Zone Mask](#zone-mask) | Depending on the option, mutes the selected zones or keeps only them. |

#### Add Silence

`ajouter-silence` · Processing → Editing

*Adds silence at the beginning and/or end of the track.*

Adds silence at the beginning and/or end of the audio track. Independently set the silence durations before and after (in seconds, 0 to 60s). Useful for fitting a track in a mix, creating a silent intro/outro, or syncing with a reference.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Before | number | 1 s | 0 – 240 s, step 0.1 | Silence added at the beginning of the track (in seconds). |
| After | number | 1 s | 0 – 240 s, step 0.1 | Silence added at the end of the track (in seconds). |

#### Audio Join

`jointure-audio` · Processing → Editing

*Places two tracks one after the other with a crossfade.*

Puts two tracks end to end. The first fades out while the second fades in over an adjustable overlap. Zero overlap gives a plain concatenation.

| Port | Name | Type | |
|---|---|---|---|
| input | Track 1 | audio |  |
| input | Track 2 | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Overlap | number | 2 s | 0 – 30 s, step 0.1 | Crossfade duration between the end of track 1 and the start of track 2. |

#### Extract duration

`extraire-duree` · Processing → Editing

*Measures track duration and passes it along.*

Produces a start=0 / duration=length position usable by nodes that accept a control input.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Duration | control |  |

*No parameters.*

#### Extract Zone

`extraire-zone` · Processing → Editing

*Extracts a portion with fade and returns the Zone object.*

Cuts out a portion of the track from a start and a duration, with a slight fade at the edges to avoid clicks. Produces the cut audio and a « Zone » object (start + duration) usable by « Reinsert Zone ».

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |
| output | Zone | control |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Start | number | 0 s | 0 – 600 s, step 0.1 | Start of the extracted zone. |
| Duration | number | 5 s | 0.1 – 600 s, step 0.1 | Duration of the extracted zone. |
| Fade | number | 5 ms | 0 – 100 ms, step 1 | Crossfade duration at edges. |

#### Extract Zones (Selector)

`extraire-zones-selecteur` · Processing → Editing

*Cuts and concatenates the zones chosen in the multi-zone selector.*

Cuts and joins the zones chosen in the « Multi-Zone Selector ». Connect the selector's « Zones » output to this node's « Zones » input, and the selector's « Audio » output to the « Audio » input. Default mode keeps the selected zones and concatenates them (unselected parts disappear). Invert mode keeps only the parts between the selected zones. A fade at the edges of each extracted zone prevents clicks. « Audio » output = the joined clip; « Zones » output = the list of kept segments with their position in the new audio.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Zones | control |  |
| output | Audio | audio |  |
| output | Zones | control |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Selected zones | Selected zones / Unselected zones | Keep the selected zones, or conversely the parts between them. |
| Fade | number | 5 ms | 0 – 100 ms | Fade at the edges of each extracted zone to avoid clicks. |

#### Logistic Mixer

`melangeur-logistique` · Processing → Editing

*Mixes two tracks with a logistic transition: the first fades out while the second fades in.*

Connect two audio tracks. The first track's weight decreases along a logistic curve while the second's increases. Center sets the 50/50 mix point, Steepness controls the transition sharpness (low = very smooth fade, high = abrupt switch).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio 1 | audio |  |
| input | Audio 2 | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Center | number | 50 % | 0 – 100 %, step 1 | 50/50 mix position (0 = start, 100 = end). |
| Steepness | number | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve. Higher value = faster transition. |
| Volume | number | 100 % | 0 – 100 %, step 1 | Output volume. |

#### Loop

`simple-boucle` · Processing → Editing

*Repeats the whole signal a given number of times.*

Replays the whole input « Repeats » times in a row. The Fade parameter can smooth each join; at 0 ms the join is hard.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Repeats | number | 4 | 1 – 32, step 1 | Number of times the input is replayed in a row. |
| Fade | number | 0 ms | 0 – 100 ms | Crossfade at each join between two repetitions. 0 = no crossfade (hard join). |

#### Loop End

`boucle-graphe-fin` · Processing → Editing

*Closes a graph loop and puts every pass's result end to end.*

Closes a graph loop opened by « Loop Start », and puts every pass's result end to end: the output holds the N successive states, in the order they were produced. « Fade » smooths the join between two passes; at 0 ms they follow each other exactly. If this node has no « Loop Start » upstream, nothing is unrolled: it then behaves as a plain join of whatever it receives.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fade | number | 0 ms | 0 – 500 ms, step 5 | Crossfade between two passes. 0 = hard join, the passes follow each other exactly. |

#### Loop Start

`boucle-graphe-debut` · Processing → Editing

*Marks the start of a graph loop: what follows is replayed N times, each pass starting from the previous result.*

Opens a graph loop. Everything wired between this node and « Loop End » is played « Passes » times, and EACH PASS STARTS FROM THE PREVIOUS RESULT: if the chain transposes by a semitone, the second pass transposes an already transposed signal, so by two semitones in total, the third by three, and so on. « Loop End » then puts the passes end to end: the output contains the N successive states, in order. Attic's engine only runs acyclic graphs: the loop is therefore UNROLLED before execution — the inner chain is copied as many times as there are passes, and each copy is wired to the previous one. It shows in the computation time, which is that of N passes, not one. Anything entering the loop from outside through another port — a setting, a second source — feeds every pass identically. Anything leaving it other than through « Loop End » leaves only once, on the last pass. Limits: a loop cannot contain another loop, and a loop end can only have one start upstream. In those cases nothing is unrolled and the node says so instead of producing nonsense.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Passes | number | 3 | 1 – 32, step 1 | How many times the chain between this node and « Loop End » is played. Effects accumulate: if the chain transposes by a semitone, the second pass starts from an already transposed signal and therefore rises by two semitones. |

#### MIDI Join

`jointure-midi` · Processing → Editing

*Places two MIDI files one after another with an overlap.*

Concatenates two MIDI files end-to-end. The second file starts at the end of the first (overlap = 0) or before (overlap > 0), superimposing the notes. Events from each file are preserved, including program/instrument changes. The joined file is output on the MIDI port.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI 1 | MIDI |  |
| input | MIDI 2 | MIDI |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Overlap | number | 0 s | 0 – 30 s, step 0.1 | Duration for which the second MIDI starts before the first ends. 0 = simple concatenation. |

#### MIDI Loop

`boucle-midi` · Processing → Editing

*Repeats a MIDI file a given number of times.*

Repeats a MIDI file several times in a row. The Fade parameter sets the overlap between two repetitions (in ms): 0 = hard join, repetitions follow each other without overlap; a positive value starts the next repetition before the previous one ends, creating an overlapping effect. The resulting loop is output on the MIDI port.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Repeats | number | 4 | 1 – 32, step 1 | Number of times the MIDI file is replayed in a row. |
| Fade | number | 0 ms | 0 – 1000 ms, step 1 | Overlap between two repetitions. 0 = no overlap (hard join). |

#### Mixer

`melangeur` · Processing → Editing

*Sums several tracks into one. Each track's level is set on the node that produces it.*

Sums several tracks into a single output. Add as many inputs as needed. There is no per-track level and no limiter: tracks are summed as they come, and the sum can exceed the ceiling — three tracks at 0.8 come out at 2.4, which clips on playback and on export. Set the Volume on the node producing each track, both to balance them and to keep headroom.

| Port | Name | Type | |
|---|---|---|---|
| input | Track | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Multi-Zone Selector

`selecteur-multi-zones` · Processing → Editing

*Selects multiple audio zones and passes them as a list.*

Displays the waveform and lets you select several zones (drag then « Add »). The list of zones is passed on the « Zones » output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Zones | control |  |
| output | Duration | control |  |

*No parameters.*

#### Place sound on zones

`placer-sons-zones` · Processing → Editing

*Inserts a copy of a sound at the center of each zone onto a target track, or onto a silent track of the given duration.*

Inserts a copy of the sound received on the « Sound » input at the center of each zone in the list. If a track is connected to the « Track » input, the sound is added onto that track. Otherwise, a silent track of the given duration is created. Connect the « Zones » and « Duration » outputs of the « Multi-Zone Selector » to get the zones and duration.

| Port | Name | Type | |
|---|---|---|---|
| input | Sound | audio |  |
| input | Track | audio |  |
| input | Zones | control |  |
| input | Duration | control |  |
| output | Audio | audio |  |

*No parameters.*

#### Reinsert Zone

`reinserer-zone` · Processing → Editing

*Reinserts a treated zone into the original track.*

Puts a processed zone back at its original position in the full track, with a crossfade at the joins. Connect the treated extract to the « Processed zone » input, the full track to « Track », and the zone object {start, duration} (for instance from the « Zones » output of the « Multi-Zone Selector » when a single zone is selected) to the « Zone » input.

| Port | Name | Type | |
|---|---|---|---|
| input | Track | audio |  |
| input | Processed zone | audio |  |
| input | Zone | control |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fade | number | 15 ms | 0 – 100 ms | Crossfade duration at joins, to avoid an audible click. |

#### Track Aligner

`aligneur-piste` · Processing → Editing

*Aligns a track to a reference length (silence or fade).*

Aligns a track's length to a reference. Input 1 (top) = reference (passed through unchanged). Input 2 (bottom) = track to align. If the track is too short: silence is added — at the start (« Before ») or end (« After »). If too long: a fade is applied — fade in (« Before », keeps the start) or fade out (« After », keeps the end). Output 1 = reference unchanged, output 2 = aligned track (same length as reference). Useful for synchronizing tracks of different durations before merging or comparing them.

| Port | Name | Type | |
|---|---|---|---|
| input | Reference | audio |  |
| input | Track | audio |  |
| output | Reference | audio |  |
| output | Aligned track | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Position | choice | After | Before / After | Where to adjust the difference. If the track is too short: adds silence at the start (« Before ») or end (« After »). If too long: fade in (« Before », keeps the start) or fade out (« After », keeps the end). |

#### Zone Mask

`masque-zones` · Processing → Editing

*Depending on the option, mutes the selected zones or keeps only them.*

Applies the zone list (from the « Multi-Zone Selector ») as a mask on the audio. « Mute zones » option: sound is cut inside the zones, the rest is kept. « Keep zones » option: only the zones are kept, the rest is cut. The track keeps its duration; an edge fade avoids clicks.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Zones | control |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Action | choice | Mute zones | Mute zones / Keep zones | « Mute » silences the zones and keeps the rest; « Keep » keeps only the zones and silences the rest. The two are complementary. |
| Fade | number | 10 ms | 0 – 100 ms | Fade applied at zone edges to avoid clicks. |

### Effects

| Component | Summary |
|---|---|
| [ADSR Envelope](#adsr-envelope) | Shapes the sound's volume over time (attack, decay, sustain, release). |
| [AI Denoise](#ai-denoise) | Denoises speech with the GTCRN model, with no noise profile to provide. |
| [AI Separator](#ai-separator) | Separates audio sources via AI (Demucs 4/6 stems, MDX-Net). |
| [Amplifier](#amplifier) | Amplification/ attenuation of the signal. |
| [Audio Inverter](#audio-inverter) | Inverts the signal. |
| [Auto-pan](#auto-pan) | Automatic left/right sweep (animated panning). |
| [Beat Repeat / Stutter](#beat-repeat--stutter) | Captures and repeats a short segment at rhythmic intervals (stutter effect). |
| [Bitcrusher](#bitcrusher) | Bit quantization + downsampling (lo-fi). |
| [Braid](#braid) | Splits the sound into bands that cross over and under in space, returning to their places after a countable number of patterns. |
| [Cantor Dust](#cantor-dust) | Hollows the sound by removing the middle third of each piece, level after level: a fractal silence. |
| [Center/Side Extract](#centerside-extract) | Separates stereo center from sides. |
| [Channel Splitter](#channel-splitter) | Splits a stereo signal into two mono outputs (left and right). |
| [Chopper](#chopper) | Rhythmic gate that chops the sound periodically (stutter/DJ effect). |
| [Chorus](#chorus) | Modulated stereo doubling. |
| [Click Removal](#click-removal) | Click detection and removal. |
| [Compressor](#compressor) | Feed-forward compressor. |
| [Convolution Reverb (IR)](#convolution-reverb-ir) | Convolution reverb with synthetic IR (adjustable) or external IR file. |
| [Corpus Mosaicing](#corpus-mosaicing) | Rebuilds one sound from another's grains: the target's shape, the corpus's material. |
| [DDSP Tone Transfer](#ddsp-tone-transfer) | Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet). |
| [De-esser](#de-esser) | Dynamic sibilance compression. |
| [Dereverb](#dereverb) | Reverb attenuation. |
| [Dirac Belt](#dirac-belt) | Spins the sound around the listener: after one lap it comes back inverted and cancels, after two it is intact. |
| [Distortion](#distortion) | Saturation / overdrive. |
| [Drum Synth](#drum-synth) | Receives MIDI and plays it with percussion synthesizers (no SoundFont). |
| [Echo](#echo) | Ping-pong delay/echo with feedback. |
| [Equalizer](#equalizer) | 9-band equalizer. |
| [Exciter / Aural Enhancer](#exciter--aural-enhancer) | Adds presence via harmonic distortion in the high mids. |
| [Fade](#fade) | Fade in/out. |
| [Feature Follower](#feature-follower) | Extracts a feature from a sound — energy, brightness, flatness, flux — to drive an effect with it. |
| [Filter + Response](#filter--response) | Filters the signal AND displays the frequency response curve. |
| [Flanger](#flanger) | Variable delay modulation. |
| [Formant Shift](#formant-shift) | Formant shifting via LPC — change pitch and timbre independently (voice conversion). |
| [Fractal Reverb](#fractal-reverb) | Convolution reverb whose impulse response is generated by a fractal pattern. |
| [Frequency Shifter](#frequency-shifter) | Adds the same number of hertz to every frequency: the sound stops being harmonic and turns bell-like. |
| [Gate/Expander](#gateexpander) | Dynamic gate or expander (cuts or attenuates signal below a threshold). |
| [Granular Freeze](#granular-freeze) | Loops a grain with size and pitch control. |
| [Griffin-Lim](#griffin-lim) | Iterative reconstruction from the magnitude spectrogram. Changes phase to create spectral textures. |
| [Hard panner](#hard-panner) | Switches the sound fully to the left, center, or right. |
| [Harmonic/Percussive Separation](#harmonicpercussive-separation) | Separates what sustains from what strikes, by median filtering the spectrogram (Fitzgerald, DAFx-10). |
| [Harmonizer / Octaver](#harmonizer--octaver) | Adds pitch-shifted voices (octave, fifth…) under the original. |
| [Impose Rhythm](#impose-rhythm) | Applies one MIDI file's rhythmic grid to another's pitches. |
| [Inversion Mirror](#inversion-mirror) | Flips the spectrum around a pivot frequency: lows become highs and highs become lows. |
| [Inversions and Voicings](#inversions-and-voicings) | Inverts, spreads and chains a MIDI file's chords while moving as few voices as possible. |
| [Klein Bottle](#klein-bottle) | Endless glissando whose voices come back on the other side every lap: it takes two laps for everything to return. |
| [Limiter](#limiter) | Peak limiter for mastering. |
| [Logistic auto-pan](#logistic-auto-pan) | Left-to-right sweep following a logistic curve. |
| [Logistic chopper](#logistic-chopper) | Rhythmic gate whose depth grows following a logistic curve. |
| [Logistic echo](#logistic-echo) | Echo whose feedback grows following a logistic curve. |
| [Logistic Paulstretch](#logistic-paulstretch) | Extreme time-stretch that grows in progressively. |
| [Logistic tremolo](#logistic-tremolo) | Tremolo whose depth grows following a logistic curve. |
| [Logistic vibrato](#logistic-vibrato) | Vibrato whose depth grows following a logistic curve. |
| [Lucier Room](#lucier-room) | Feeds the sound back into the same room until only its resonances remain. |
| [Markov Chain](#markov-chain) | Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight. |
| [MIDI Arpeggiator](#midi-arpeggiator) | Arpeggiates chords from a MIDI file according to a pattern and direction. |
| [MIDI Sampler](#midi-sampler) | Plays incoming MIDI notes with an audio sample loaded from the inspector. |
| [MIDI Speed](#midi-speed) | Plays a MIDI file slower or faster, without touching the pitches. |
| [MIDI Transposer/Quantizer](#midi-transposerquantizer) | Transposes and/or quantizes a MIDI file. |
| [Möbius Strip](#möbius-strip) | Sends the sound around a Möbius strip: one lap takes it to the other side, two laps bring it back. |
| [Modal Bar](#modal-bar) | Marimba, vibraphone, glockenspiel, tubular bell or bowl, by modal synthesis on published ratios. |
| [Multiband Compressor](#multiband-compressor) | 3-band compressor with independent thresholds/ratios. |
| [Negative Harmony](#negative-harmony) | Reflects pitches around the tonic-dominant axis: C major becomes C minor, G7 becomes F minor 6. |
| [Noise Profile](#noise-profile) | Captures the spectral profile of a noise. |
| [Noise Reduction](#noise-reduction) | Spectral noise subtraction. |
| [Normalizer](#normalizer) | Level normalization. |
| [Note Echo](#note-echo) | Layers time-shifted copies of a pattern, with decreasing velocity. |
| [Octaver](#octaver) | Adds an upper and/or lower octave. |
| [Paulstretch](#paulstretch) | Extreme phase-randomization time-stretch (stereo). |
| [Phase Vocoder Pitch](#phase-vocoder-pitch) | Transposes pitch via phase vocoder (frequency-domain), without changing duration. |
| [Phase Vocoder Tempo](#phase-vocoder-tempo) | Changes tempo via phase vocoder (frequency-domain), with transient detection. |
| [Phaser](#phaser) | All-pass filter cascade modulated by LFO (sweeping effect). |
| [Ping-Pong Echo](#ping-pong-echo) | Stereo ping-pong echo. |
| [Pitch ↔ Rhythm Continuum](#pitch--rhythm-continuum) | Slows a sound until its pitch turns into a pulse. |
| [Pitch Glissando](#pitch-glissando) | Pitch glissando from one pitch to another. |
| [Pitch Shift](#pitch-shift) | Pitch shift. |
| [Ply and Rotate](#ply-and-rotate) | Repeats each note within its own duration, and shifts the pitches along the grid. |
| [Progressive Pitch](#progressive-pitch) | Repeats the sound, shifting it one step further each time, with silences in between. |
| [Progressive Reverb](#progressive-reverb) | Progressive reverb (dry→wet). |
| [Quadrafuzz](#quadrafuzz) | Four-band distortion: each register saturates independently. |
| [Random Slice](#random-slice) | Slices a track into equal parts and rearranges them (random, original or reverse order). |
| [Reich Phasing](#reich-phasing) | Lets several copies of a pattern drift apart from one another. |
| [Resonance Audio](#resonance-audio) | Binaural 3D spatialization of a sound using Resonance Audio (HRTF + room model). |
| [Retrograde and Palindrome](#retrograde-and-palindrome) | Plays a pattern backwards, or there and back. |
| [Reverb](#reverb) | Convolution reverb. |
| [Reverse Echo](#reverse-echo) | Reverse echo: attenuated repetitions build up before the main sound. |
| [Ring Modulator](#ring-modulator) | Ring modulation (carrier multiplication). |
| [Risset Glissando](#risset-glissando) | Turns a sound into a pitch that falls (or rises) endlessly. |
| [Risset Rhythm](#risset-rhythm) | Turns a loop into a pulse that speeds up (or slows down) endlessly. |
| [Sample Formula](#sample-formula) | Applies a mathematical expression to each sample of the signal. |
| [Scanned Synthesis](#scanned-synthesis) | Reads the shape of a slowly moving mechanical object as a wavetable: the timbre evolves endlessly while the note stays in tune. |
| [Serial Operations](#serial-operations) | Plays a row's four forms — original, retrograde, inversion, retrograde inversion — and writes its matrix. |
| [Shakers](#shakers) | Shaken percussion — maracas, cabasa, tambourine, sleigh bells — from a stochastic particle model. |
| [Sinusoids + Noise (SMS)](#sinusoids--noise-sms) | Tracks a sound's partials and sets the rest aside: transpose the harmony without touching the breath. |
| [Slide Stretch](#slide-stretch) | Time-stretch with a factor that gradually changes from start to end. |
| [SoundTouch Pitch](#soundtouch-pitch) | Changes pitch while preserving duration (quality pitch-shift). |
| [SoundTouch Rate](#soundtouch-rate) | Changes playback rate (tempo + pitch together), like a tape player. |
| [SoundTouch Tempo](#soundtouch-tempo) | Changes tempo while preserving pitch (quality time-stretch). |
| [Spectral Formula](#spectral-formula) | Modifies the signal spectrum by mathematical expressions on magnitude and phase. |
| [Statistical Texture](#statistical-texture) | Generates a new texture with the statistics of a given sound — rain, fire, crowd — without copying a single sample of it. |
| [Stereo Delay](#stereo-delay) | Independent left/right delay. |
| [Stereo Spatialization](#stereo-spatialization) | Positions the sound in stereo space (left/right). |
| [Stereo Width / MS](#stereo-width--ms) | Adjusts stereo width and Mid level. |
| [Sung Vowel (FOF)](#sung-vowel-fof) | Synthesises a vowel from its formants, after Peterson and Barney's table: pitch and timbre never touch. |
| [Swap Channels](#swap-channels) | Swaps left/right channels. |
| [Temperament](#temperament) | Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament. |
| [Tempo Canon (Nancarrow)](#tempo-canon-nancarrow) | Layers a pattern against itself at a fixed tempo ratio. |
| [Tempo Change](#tempo-change) | Time-stretch via phase vocoder. |
| [Thin Out](#thin-out) | Removes a share of the notes at random, reproducibly. |
| [Tonnetz](#tonnetz) | Chains chords through the three neo-Riemannian transformations P, L and R, each moving a single voice. |
| [Torus](#torus) | Rotates the sound's position and level at two speeds: they only meet again at lap q, or never. |
| [Transient Shaper](#transient-shaper) | Independent attack and sustain control. |
| [Tremolo](#tremolo) | Amplitude modulation (periodic volume variations). |
| [Velvet Reverb](#velvet-reverb) | Reverb with a free-form tail: exponential like a room, linear, swelling, or two-sloped. |
| [Vibrato](#vibrato) | Pitch modulation by LFO (note oscillation). |
| [Vocoder](#vocoder) | Filterbank vocoder: modulator + carrier → robot voice effect. |
| [Voice Changer](#voice-changer) | Transforms a voice with preset effects: chipmunk, monster, robot, phone, alien, helium, ghost. |
| [Wah-wah](#wah-wah) | Modulated bandpass filter (wah pedal effect). |
| [Wave Terrain](#wave-terrain) | Travels a surface z = f(x, y) along an orbit: the orbit makes the pitch, the relief makes the timbre. |
| [Wavesets (Wishart)](#wavesets-wishart) | Cuts the sound at zero crossings and replays the segments differently. |
| [Wind Instrument](#wind-instrument) | Clarinet, flute or brass by waveguide: a bore, a reed, and the timbre that follows. |

#### ADSR Envelope

`enveloppe-adsr` · Processing → Effects

*Shapes the sound's volume over time (attack, decay, sustain, release).*

Shapes the sound's volume over time with four controls: Attack (rise time to peak), Decay (fall to the sustain level), Sustain (held level, not a duration) and Release (return to silence at the end). Short attack = percussive; long = swelling. The curve updates live.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Attack | number | 10 ms | 0 – 2000 ms, step 1 | Rise time from silence to peak. Short = percussive; long = swelling sound. |
| Decay | number | 100 ms | 0 – 2000 ms, step 1 | Fall time from peak to the sustain level. |
| Sustain | number | 70 % | 0 – 100 %, step 1 | Level (not a duration!) held through the body of the sound. |
| Release | number | 200 ms | 0 – 3000 ms, step 1 | Time to return to silence at the end (the sound's « tail »). |

#### AI Denoise

`debruitage-ia` · Processing → Effects

*Denoises speech with the GTCRN model, with no noise profile to provide.*

Denoises speech with GTCRN, a 344 kB learned model (Xiaobin-Rong/gtcrn, MIT licence). Unlike the « Noise Reduction » node it needs NO profile: nothing to capture on a silent passage, and it follows noise that changes. Two limits worth knowing, both from the model rather than its integration. It works at 16 kHz: the result is resampled back to the input rate so it stays connectable, but nothing above 8 kHz is restored. And it was trained on SPEECH: on music it also removes what is not a voice. The Strength parameter blends with the original — below 100%, some hiss and reverb come back, which often sounds more natural than complete silence between words. The message reports the level removed, so you can see at once whether the model acted: on an already clean recording it barely does, which is the right behaviour.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Strength | number | 100 % | 0 – 100 %, step 1 | Blend between the denoised signal and the original. 100% = model output only. Going lower lets some hiss and reverb back in, which often sounds more natural on speech than total silence between words. |
| Output | choice | Original rate | Original rate / Model 16 kHz | The model works at 16 kHz. « Original rate » resamples the result back to the input rate so it stays connectable to the rest of the graph — without restoring anything above 8 kHz, which the model never saw. « Model 16 kHz » returns the signal as it comes out, with no second resampling. |

#### AI Separator

`separateur-ia` · Processing → Effects

*Separates audio sources via AI (Demucs 4/6 stems, MDX-Net).*

Splits a track into stems. Demucs (HT) = 4 stems (drums, bass, vocals, other). Demucs 6s = 6 stems (drums, bass, vocals, other, guitar, piano). MDX-Net = vocals + instrumental. Default models are bundled (public/oonx/) and loaded automatically. You may also load your own .onnx via the node button or provide a URL.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Drums | audio |  |
| output | Bass | audio |  |
| output | Vocals | audio |  |
| output | Other | audio |  |
| output | Guitar | audio |  |
| output | Piano | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Model | choice | Demucs 6s | Demucs 6s / Demucs (HT) / MDX-Net | Separation architecture. Demucs (HT) = 4 stems, Demucs 6s = 6 stems (+ guitar + piano), MDX-Net = vocals/instrumental. |
| Model URL | text | — |  | URL of an .onnx model. Empty = default model from public/oonx/. |

#### Amplifier

`amplificateur` · Processing → Effects

*Amplification/ attenuation of the signal.*

Applies a constant gain in decibels to amplify or attenuate the whole signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Gain | number | 0 dB | -60 – 60 dB | Gain applied when no curve is connected to the Modulation input. |
| Modulation min | number | -24 dB | -60 – 60 dB | What the curve's zero means. With no curve connected, this setting does nothing. |
| Modulation max | number | 0 dB | -60 – 60 dB | What the curve's one means. |

#### Audio Inverter

`inverseur-audio` · Processing → Effects

*Inverts the signal.*

Reverses the signal in time: the track plays from end to start.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Auto-pan

`auto-pan` · Processing → Effects

*Automatic left/right sweep (animated panning).*

Automatic stereo sweep: the sound moves periodically between left and right. Adjust the rate (sweep speed, 0.1 to 20 Hz) and depth (amplitude, 0 to 100%). At low frequencies, creates a floating effect; at high frequencies, approaches a Leslie/vibrato stereo effect.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 2 Hz | 0.1 – 20 Hz, step 0.1 | Sweep speed (round trips per second). |
| Depth | slider | 80 % | 0 – 100 %, step 1 | Sweep depth (0% = static, 100% = extreme left to extreme right). |

#### Beat Repeat / Stutter

`beat-repeat` · Processing → Effects

*Captures and repeats a short segment at rhythmic intervals (stutter effect).*

Beat Repeat / Stutter: captures a short audio segment at rhythmic intervals synchronized to the tempo and repeats it several times with decay. Creates stutter, glitch and rhythmic repeat effects typical of electronic productions. Parameters: Tempo, Capture interval, Segment size, Repeats, Feedback and Mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | slider | 120 BPM | 40 – 240 BPM, step 1 | Tempo used to synchronize intervals and segments. |
| Interval | choice | 1/4 | 1/1 / 1/2 / 1/4 / 1/8 / 1/16 / 1/32 | Interval between two captures. 1/4 = one capture per beat, 1/8 = one per half beat, etc. |
| Size | choice | 1/16 | 1/32 / 1/16 / 1/8 / 1/4 / 1/2 | Length of the captured and repeated segment. |
| Repeats | slider | 4 | 1 – 8, step 1 | Number of times the captured segment is repeated at each interval. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Attenuation of each repeat (0% = constant volume, 95% = fast decay). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Bitcrusher

`bitcrusher` · Processing → Effects

*Bit quantization + downsampling (lo-fi).*

Simulates the low resolution of old D/A converters by reducing the bit depth (quantization) and sample rate (downsampling). At 8 bits, you get the 8-bit console sound; at 4 bits, the sound becomes very crunchy and aliased. Reducing the sample rate adds characteristic aliasing (spectral folding). Ideal for a retro, lo-fi or destructive effect. The mix controls the dry/wet balance.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Bits | number | 8 | 1 – 16, step 1 | Bit resolution (1-16). 8 = retro 8-bit sound; 4 = very crunchy. |
| Rate | number | 22050 Hz | 1000 – 44100 Hz, step 100 | Simulated sample rate. Lower = more broken/aliased sound. |
| Mix | number | 100 % |  | Dry/wet balance. 100% = effect only. |

#### Braid

`tresse` · Processing → Effects

*Splits the sound into bands that cross over and under in space, returning to their places after a countable number of patterns.*

Splits the sound into 3 or 4 frequency bands — low, mid, high — and makes them the strands of a braid. Each band occupies a place in the stereo field, the lowest on the left, the highest on the right. The Word describes the pattern: « 1 » makes the strand in place 1 go OVER the one in place 2, « -1 » under, « 2 » concerns places 2 and 3. At each crossing, two bands glide towards each other's place; the one going over rises 3 dB mid-crossing, the one going under drops 6 dB. Repeated, a pattern brings each band back to its place after a number of repeats set by the permutation it produces — 3 for the classic plait « 1 -2 », 2 for « 1 », 4 for « 1 2 3 » on four strands. The message says whether the strands came back. Bands are cut by masks summing exactly to 1: without crossings, they give back the original sound. Each strand being a point, a stereo input is mixed down to mono. The braid is spread over the sound's length, which is not looped.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Strands | choice | 3 (low · mid · high) | 3 (low · mid · high) / 4 | Number of bands. Three: cutoffs at 250 Hz and 2.5 kHz. Four: at 180 Hz, 900 Hz and 4.5 kHz. At first, the lowest band is on the left and the highest on the right. |
| Word | text | `1 -2` |  | The braid's pattern, as crossings separated by spaces. « 1 »: the strand in place 1 goes OVER the one in place 2; « -1 »: it goes under; « 2 » concerns places 2 and 3. « 1 -2 » is the classic three-strand plait. Places are counted from left to right. |
| Repeats | number | 3 | 1 – 12, step 1 | Number of times the pattern is played, spread over the sound's length. Strands return to their places after a number of patterns set by the word — 3 for the plait: the message tells you. |
| Relief | number | 100 % | 0 – 100 %, step 1 | Contrast between the strand going over (+3 dB mid-crossing at 100%) and the one going under (−6 dB). At 0%, bands swap places without it being heard which one passes in front. |
| Width | number | 90 % | 0 – 100 %, step 1 | Distance of the outermost places from the centre. |

#### Cantor Dust

`poussiere-cantor` · Processing → Effects

*Hollows the sound by removing the middle third of each piece, level after level: a fractal silence.*

Remove the middle third of a segment, then the middle third of each of the two remaining pieces, and so on. At level n there remain 2ⁿ fragments of 1/3ⁿ of the length, i.e. (2/3)ⁿ of the sound: infinitely many fragments for a length tending to zero. And the set is self-similar: its first third is the whole set, shrunk three times. Here the sound is kept on the fragments and silenced elsewhere. A single level sounds like a stutter; the property is heard by comparing levels, hence the Construction mode, which plays levels 0, 1, 2… one after the other: each fragment repeats the previous level's gesture in miniature. Removed parts are exactly silent; the Fade is placed inside the kept fragments and capped at half of them, since at deep levels a fragment lasts only a few milliseconds. The message gives the number of fragments, their length and the share of the sound kept. Works on any sound, and is especially readable on a spoken phrase or a continuous loop.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Levels | number | 4 | 1 – 7, step 1 | Depth of the cut. At level n there remain 2ⁿ fragments, each 1/3ⁿ of the length, i.e. (2/3)ⁿ of the sound: 4 levels keep 16 fragments and 20% of the sound, 7 levels 128 fragments and 6%. |
| Mode | choice | Construction (level by level) | Construction (level by level) / Last level only | Construction: levels 0, 1, 2… are played one after the other, and each fragment is heard repeating the previous level's gesture in miniature — that is where the property is heard. Last level only: a fractal stutter, over the sound's length. |
| Fade | number | 3 ms | 0 – 50 ms, step 0.5 | Fade placed inside each fragment, so the edges do not click. Removed parts stay exactly silent. Capped at half a fragment: at deep levels a fragment lasts only a few milliseconds. |

#### Center/Side Extract

`extraction-centre-cote` · Processing → Effects

*Separates stereo center from sides.*

Separates the center component (mono, common to both channels) from the side components, with independent balance.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Center | number | 50 % |  | Center channel level. |
| Side | number | 50 % |  | Side channel level. |

#### Channel Splitter

`separateur-canaux` · Processing → Effects

*Splits a stereo signal into two mono outputs (left and right).*

Splits a stereo signal into two distinct mono outputs: the 'Left' output contains only the left channel (L), the 'Right' output only the right channel (R). If the input is already mono, both outputs receive the same signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Left | audio (mono) |  |
| output | Right | audio (mono) |  |

*No parameters.*

#### Chopper

`chopper` · Processing → Effects

*Rhythmic gate that chops the sound periodically (stutter/DJ effect).*

Rhythmic gate that chops the sound periodically — stutter/DJ effect. Adjust the rate (cuts per second, 0.5 to 20 Hz), ON segment length (1% = very short, 50% = square, 99% = near continuous) and type (Hard = abrupt, Soft = smooth). Ideal for pumping effects, rhythmic gating or extreme tremolo.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 4 Hz | 0.5 – 20 Hz, step 0.5 | Chop speed (cuts per second). |
| Length | slider | 50 % | 1 – 99 %, step 1 | ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous). |
| Type | choice | Hard | Hard / Soft | Hard = abrupt cut, Soft = smooth transition. |

#### Chorus

`chorus` · Processing → Effects

*Modulated stereo doubling.*

Layers slightly detuned, modulated copies of the signal to thicken and widen it in stereo.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mix | number | 40 % |  | Dry/wet balance. |
| Speed | number | 0.8 Hz |  | LFO modulation speed. |
| Depth | number | 5 ms |  | Detuning depth in ms. |

#### Click Removal

`suppression-clics` · Processing → Effects

*Click detection and removal.*

Detects brief clicks and crackles and replaces them with an interpolation of the neighbouring signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | number | 5 × | 1 – 50 ×, step 1 | Detection sensitivity (multiple of median derivative). Higher = less sensitive (only big clicks). Lower = more sensitive. |
| Window | number | 5 ms |  | Replacement window width. |

#### Compressor

`compresseur` · Processing → Effects

*Feed-forward compressor.*

Reduces dynamics by attenuating passages above the threshold, according to the chosen ratio, attack and release.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | number | -20 dB | -60 – 0 dB, step 1 | Level above which compression engages. |
| Ratio | number | 4 ∶1 | 1 – 20 ∶1, step 0.5 | Compression ratio. |
| Attack | number | 5 ms | 0 – 200 ms, step 1 | Compressor attack time. |
| Release | number | 100 ms | 5 – 1000 ms, step 5 | Compressor release time. |
| Gain | number | 0 dB | -12 – 24 dB, step 1 | Output makeup gain. |

#### Convolution Reverb (IR)

`reverbe-convolution` · Processing → Effects

*Convolution reverb with synthetic IR (adjustable) or external IR file.*

Convolution reverb: generates a synthetic impulse response (IR) from your settings (room type, size, decay, pre-delay, damping) and convolves it with the signal. The IR is the « acoustic signature » of a space: the convolver superimposes it onto the signal to recreate its acoustics. You can also load an external IR file (WAV) via the node button — in that case the synthesis parameters are ignored. Adjust the mix to balance dry and wet signals.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Type | choice | Hall | Room / Hall / Plate / Spring / Cathedral | Room = small room (short, dense). Hall = large space (long tail). Plate = metallic reverb (dense, linear). Spring = spring reverb (characteristic, oscillating). Cathedral = very long, spectral. |
| Size | number | 50 % | 0 – 100 %, step 1 | Size of the simulated space. Affects reflection duration and density. |
| Decay | number | 2 s | 0.1 – 10 s, step 0.1 | Reverb tail decay time (approximate RT60). |
| Pre-delay | number | 20 ms | 0 – 200 ms, step 1 | Delay before the first reflection. Separates dry signal from reverb (sense of space). |
| Damping | number | 30 % | 0 – 100 %, step 1 | High-frequency absorption. High = darker/muffled sound. Low = bright sound. |
| Mix | number | 50 % | 0 – 100 %, step 1 | Dry/wet balance. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the diffuse tail. Unlike nodes where randomness is the point, the default is fixed: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions. |

#### Corpus Mosaicing

`mosaiquage` · Processing → Effects

*Rebuilds one sound from another's grains: the target's shape, the corpus's material.*

Audio mosaicing, or corpus-based concatenative synthesis. The principle is a mosaic's: a CORPUS — any sound, a sample collection, a whole record — is cut into small grains, each described by a few numbers, the grains of a TARGET sound are described the same way, and each target grain is replaced by the corpus grain that most resembles it. The result has the target's shape and the corpus's material: a spoken phrase played with piano strings, a drum track rebuilt from door noises. This is the method Diemo Schwarz formalised at IRCAM (CataRT, 2006). Attic already had all the pieces without the assembly — descriptors, an audio similarity, samplers: this node does the matching, which is what was missing. Three descriptors are used, deliberately legible so that one can say why a grain was chosen: loudness, the spectral centre of gravity, and the zero-crossing rate that tells a noisy sound from a steady one. They are NORMALISED before comparison, without which the distance would see only the centre of gravity, counted in thousands where the others are below one. « Avoid repeats » deals with the method's most audible defect: too poor a corpus returns the same grain a hundred times, which sounds like a drone — and the output report says so plainly when it happens. « Grain size » is the main trade-off: short grains follow the target closely but lose the corpus's character; long ones make the corpus recognisable but the target barely shows. The joining uses windows overlapping by half, whose sum is exactly one: a corpus identical to the target therefore rebuilds it to better than 2 %, which the node verifies in test.

| Port | Name | Type | |
|---|---|---|---|
| input | Target | audio |  |
| input | Corpus | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Grain size | number | 40 ms | 5 – 200 ms, step 1 | Length of a grain. Short, they follow the target closely but lose the corpus's character; long, the corpus is recognisable but the target barely shows. Between 30 and 60 ms, both are heard. |
| Loudness weight | number | 100 % | 0 – 100 %, step 1 | Weight given to loudness when searching for the nearest grain. |
| Brightness weight | number | 100 % | 0 – 100 %, step 1 | Weight given to the spectral centre of gravity. It is the descriptor one hears most: raising it follows the target's colours. |
| Noisiness weight | number | 100 % | 0 – 100 %, step 1 | Weight given to the zero-crossing rate, which tells a noisy sound from a steady one. |
| Avoid repeats | number | 20 % | 0 – 100 %, step 1 | Penalises the grain just used. Without it, a poor corpus returns the same grain a hundred times over, which sounds like a drone — the most audible defect of the method. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### DDSP Tone Transfer

`ddsp-tone-transfer` · Processing → Effects

*Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet).*

Transfers the timbre of an audio clip to another instrument via DDSP (Differentiable Digital Signal Processing). The SPICE model extracts pitch and loudness from the input audio, then a pretrained DDSP model resynthesizes the signal with the chosen timbre (violin, flute, tenor saxophone, trumpet). Requires an Internet connection to download SPICE and the instrument model (~3-4 MB). Output is mono at 48 kHz.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Violin | Violin / Flute / Tenor saxophone / Trumpet | Target instrument for the timbre transfer. The model downloads on first use (~3-4 MB). |
| Model URL | text | — |  | Custom URL of a DDSP checkpoint. If set, it overrides the selected instrument. |

#### De-esser

`de-esser` · Processing → Effects

*Dynamic sibilance compression.*

Dynamically attenuates sibilants (s, ch, sh, t, z) that stand out too much in a vocal recording. Works like a compressor targeted at a narrow frequency band (typically 5-9 kHz): a bandpass filter extracts the target band's energy, and when it exceeds the threshold, a reducing gain is applied to the full signal. Set the center frequency and band width, threshold (activation level), ratio (reduction strength), attack and release. Short attack = precise reaction to transients; medium release = natural transition.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Frequency | number | 7000 Hz | 2000 – 12000 Hz, step 100 | Center frequency of the target band (sibilances: 5-9 kHz). |
| Width | number | 2000 Hz | 200 – 6000 Hz, step 100 | Width of the target band (Q = frequency/width). |
| Threshold | number | -20 dB | -60 – 0 dB, step 1 | Band level above which attenuation engages. |
| Ratio | number | 3 ∶1 | 1 – 10 ∶1, step 0.5 | Sibilance reduction ratio. |
| Attack | number | 1 ms | 0.1 – 50 ms, step 0.1 | Reaction time (short = precise, long = smooth). |
| Release | number | 50 ms | 5 – 500 ms, step 1 | Recovery time to normal gain. |

#### Dereverb

`dereverberation` · Processing → Effects

*Reverb attenuation.*

Attenuates the reverberation of a recording via spectral processing, tightening an overly reverberant sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Reduction | number | 60 % |  | Reverb reduction strength. |

#### Dirac Belt

`ceinture-dirac` · Processing → Effects

*Spins the sound around the listener: after one lap it comes back inverted and cancels, after two it is intact.*

Hold an object attached to a belt and turn it one revolution: it is back in place, but the belt stays twisted. A second revolution is needed to untwist it. That is the property of rotations in space carried by spinors: 360° flips their sign, 720° restores it. Here the sound circles the listener — front, right, back, left — while its phase turns half as fast. After one lap it is back in front, but inverted; after two, intact. An inverted signal cannot be told from the original by ear: the node therefore places a FIXED copy of the sound in front of the listener, the Witness. When the circling sound comes back to the front after one lap, it cancels out completely against it: silence falls at the exact moment it « has come back ». On the second lap, the two add up. Without a witness you hear the circling but not the belt. Stereo limitation: two speakers cannot place a sound behind you; the rear is simulated by a quieter (Rear) and duller (Cutoff) sound. Without head-related transfer functions, this is an approximation. A stereo input is mixed down to mono.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Laps | number | 2 | 1 – 8, step 1 | Number of laps around the listener; one lap lasts the whole sound. Two laps untie the belt. |
| Witness | number | 100 % | 0 – 100 %, step 1 | Level of the FIXED copy placed in front of the listener. Without it, the sound's sign change is inaudible. At 100%, the sound coming back to the front after one lap cancels out completely against it; after the second lap, the two add up. |
| Rear | number | 6 dB | 0 – 24 dB, step 1 | Attenuation of the sound when it passes behind. Stereo cannot place a sound behind you: the rear is simulated by a quieter, duller sound. |
| Cutoff | number | 1500 Hz | 300 – 8000 Hz, step 50 | Frequency above which the sound is dulled when it is behind. |
| Crossfade | number | 30 ms | 0 – 500 ms, step 5 | Crossfade at each seam between two laps. Capped at a quarter of the sound's length. |

#### Distortion

`distorsion` · Processing → Effects

*Saturation / overdrive.*

Saturates the signal to add harmonics and grit, from light overdrive to full distortion.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Gain | number | 50 % |  | Amount of saturation drive. |

#### Drum Synth

`drum-synth` · Processing → Effects

*Receives MIDI and plays it with percussion synthesizers (no SoundFont).*

Receives a MIDI file as input and renders it to audio with drum synthesizers (MembraneSynth, MetalSynth, NoiseSynth). General MIDI notes are mapped: kick (36), snare (38), hi-hat (42/46), crash (49), toms (45/47/48/50). Audio output + identical MIDI output for chaining. Ideal for avoiding dependency on a drum SoundFont.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| MIDI channel | number | 10 | 1 – 16, step 1 | MIDI channel containing the drum notes (10 = GM drum channel). |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output level of the drum kit. |

#### Echo

`echo` · Processing → Effects

*Ping-pong delay/echo with feedback.*

Ping-pong delay/echo with feedback. Time sets the interval between repetitions, feedback controls how many repetitions occur, and spread controls the stereo sweep. Dry and wet signals are mixed at the output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | slider | 350 ms | 50 – 2000 ms, step 10 | Delay time between repetitions. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Amount of signal fed back into the delay (more = more repetitions). |
| Spread | slider | 50 % | 0 – 100 %, step 1 | Stereo width of the echo (0% = mono, 100% = maximum left/right sweep). |

#### Equalizer

`equaliseur` · Processing → Effects

*9-band equalizer.*

Nine-band equalizer: independently adjusts the gain of the 32 Hz, 64 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz and 8 kHz bands. Ideal for finely sculpting a track's timbre.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| 32 Hz | number | 0 dB | -24 – 24 dB, step 1 | 32 Hz band gain. |
| 64 Hz | number | 0 dB | -24 – 24 dB, step 1 | 64 Hz band gain. |
| 125 Hz | number | 0 dB | -24 – 24 dB, step 1 | 125 Hz band gain. |
| 250 Hz | number | 0 dB | -24 – 24 dB, step 1 | 250 Hz band gain. |
| 500 Hz | number | 0 dB | -24 – 24 dB, step 1 | 500 Hz band gain. |
| 1 kHz | number | 0 dB | -24 – 24 dB, step 1 | 1 kHz band gain. |
| 2 kHz | number | 0 dB | -24 – 24 dB, step 1 | 2 kHz band gain. |
| 4 kHz | number | 0 dB | -24 – 24 dB, step 1 | 4 kHz band gain. |
| 8 kHz | number | 0 dB | -24 – 24 dB, step 1 | 8 kHz band gain. |

#### Exciter / Aural Enhancer

`exciter` · Processing → Effects

*Adds presence via harmonic distortion in the high mids.*

Adds presence and brightness via asymmetrical harmonic distortion in the high frequencies. Useful for bringing out a vocal, guitar or a master lacking definition. Amount controls saturation intensity, Frequency sets the high-pass cutoff, and Mix controls the dry/wet balance.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Amount | number | 50 % | 0 – 100 %, step 1 | Intensity of the asymmetrical distortion. |
| Frequency | number | 3000 Hz | 500 – 10000 Hz, step 100 | High-pass cutoff after distortion. |
| Mix | number | 30 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Fade

`fondu` · Processing → Effects

*Fade in/out.*

Applies a fade-in at the start and a fade-out at the end of the track, with adjustable durations.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| In | number | 0.5 s |  | Fade-in duration. |
| Out | number | 0.5 s |  | Fade-out duration. |

#### Feature Follower

`suiveur-caracteristique` · Processing → Effects

*Extracts a feature from a sound — energy, brightness, flatness, flux — to drive an effect with it.*

Extracts a feature from a sound to drive an effect with it. After Vincent Verfaille, Udo Zolzer and Daniel Arfib, « Adaptive Digital Audio Effects (A-DAFx): A New Class of Sound Transformations », IEEE Transactions on Audio, Speech and Language Processing 14(5), 2006, and « Implementation Strategies for Adaptive Digital Audio Effects », DAFx-02. Their idea is that an effect becomes something else when its setting stops being a fixed number and becomes a feature of the sound ITSELF: brightness opening its own filter, energy lengthening its own delay. No Attic node could do this. The four features say different things and do not replace one another. ENERGY follows the player's gesture, and is the most immediate. BRIGHTNESS — the spectrum's centre of gravity — follows timbre: it rises as the sound gets harsh, even at constant volume. FLATNESS tells a note from a noise, zero for a sine and one for white noise: it serves to treat breath and notes differently. FLUX marks attacks and falls back during sustains. INERTIA deserves a word: without it, an energy curve makes the parameter jump at every attack and the result chatters. The smoothing runs FORWARDS THEN BACKWARDS, never one way only — a one-way smoothing would delay the curve relative to the sound that produced it, and the filter would open after the note instead of with it. The node also passes the audio through unchanged, so it slots into a chain without cutting it. A curve always carries values between zero and one: the consumer decides what zero and one mean at its end, through its « Modulation min » and « Modulation max » settings.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Curve | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Feature | choice | Energy | Energy / Brightness / Flatness / Flux | What is followed, and the four say different things. ENERGY follows the player's gesture. BRIGHTNESS — the spectrum's centre of gravity — follows timbre and rises as the sound gets harsh. FLATNESS tells a note from a noise: zero for a sine, one for white noise. FLUX marks attacks and falls back during sustains. |
| Inertia | slider | 70 % | 0 – 99 %, step 1 | Smoothing of the curve. Without it, an energy curve makes the parameter jump at every attack. The smoothing runs forwards then backwards so that it does not DELAY the curve: without that care, the filter would open after the note instead of with it. |
| Rate | slider | 200 /s | 20 – 1000 /s, step 10 | Values per second. High, the curve follows every twitch; low, it keeps only the overall gesture. The rate need not match the sound's: the effect interpolates. |

#### Filter + Response

`reponse-filtre` · Processing → Effects

*Filters the signal AND displays the frequency response curve.*

Filters the signal by the chosen type (lowpass, highpass, bandpass, notch) with adjustable cutoff frequency and resonance (Q). The view displays the filter's frequency response curve (gain in dB per frequency) in real time — useful to visually understand what the filter does to the spectrum. The curve updates instantly as you change parameters, even before execution.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Type | choice | Lowpass | Lowpass / Highpass / Bandpass / Notch | Filter type. Lowpass passes lows, highpass passes highs, bandpass keeps a band, notch removes a band. |
| Cutoff | number | 1000 Hz | 20 – 20000 Hz, step 1 | Filter hinge frequency (cutoff or band center). |
| Resonance | number | 0.7 Q | 0.5 – 12 Q, step 0.1 | Quality factor Q: higher = a sharper peak at the cutoff. |
| Modulation min | number | 200 Hz | 20 – 20000 Hz, step 1 | Cutoff that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | number | 6000 Hz | 20 – 20000 Hz, step 1 | Cutoff that the curve's one means. Feeding the sound's own BRIGHTNESS into this input gives the paper's adaptive effect: the filter opens as the sound gets harsh. |

#### Flanger

`flanger` · Processing → Effects

*Variable delay modulation.*

Modulates a short variable delay to produce the characteristic jet-plane sweep.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mix | number | 50 % |  | Dry/wet balance. |
| Speed | number | 0.5 Hz |  | LFO modulation speed. |
| Depth | number | 3 ms |  | Modulation depth in ms. |

#### Formant Shift

`shift-formants` · Processing → Effects

*Formant shifting via LPC — change pitch and timbre independently (voice conversion).*

Formant shifting via LPC analysis. Separates voice into glottal source (pitch) and vocal tract filter (formants). Change pitch and formants independently — no helium effect. For male→female: Pitch +12, Formants 120%. For female→male: Pitch −12, Formants 80%.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch | number | 0 st | -12 – 12 st, step 1 | Pitch transposition in semitones. +12 = 1 octave higher. Applied to the glottal source without changing formants. |
| Formants | number | 100 % | 50 – 200 %, step 1 | Formant shift (vocal tract filter) in %. 100% = no change. >100% = higher formants (brighter/higher voice). &lt;100% = lower formants (darker/lower voice). For male→female: Pitch +12, Formants 120%. For female→male: Pitch −12, Formants 80%. |

#### Fractal Reverb

`reverb-fractale` · Processing → Effects

*Convolution reverb whose impulse response is generated by a fractal pattern.*

Convolution reverb whose impulse response is built from a Cantor dust. Reflections are placed recursively: at each level, the time interval is divided into three and reflections are kept only on the outer thirds. Density controls the recursion depth, attenuation sets the amplitude decay per level, and diffusion spreads reflections in stereo. Adjust the mix to balance dry and wet signals.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Decay | number | 3 s |  | Total duration of the impulse response. |
| Pre-delay | number | 20 ms |  | Delay before the first reflections arrive. |
| Density | number | 5 | 1 – 8, step 1 | Fractal recursion depth (1-8). Higher = more reflections. |
| Decay gain | number | 70 % | 10 – 95 %, step 5 | Amplitude attenuation at each recursion level. |
| Diffusion | number | 60 % |  | Stereo spread of reflections. |
| Damping | number | 30 % |  | High-frequency absorption. |
| Mix | number | 40 % |  | Dry/wet balance. |

#### Frequency Shifter

`decaleur-frequence` · Processing → Effects

*Adds the same number of hertz to every frequency: the sound stops being harmonic and turns bell-like.*

Adds the same number of hertz to EVERY frequency. After Scott Wardle, « A Hilbert-Transformer Frequency Shifter for Audio », DAFx-98; the original is analogue, described by Harald Bode and Robert Moog in « A High-Accuracy Frequency Shifter for Professional Audio Applications », Journal of the Audio Engineering Society, 1972. Attic already had a ring modulator and a pitch shifter, and this node is neither — it is the brick that was missing between them. The PITCH SHIFTER multiplies frequencies: 200-400-600 raised an octave gives 400-800-1200, the ratios are kept, the sound stays harmonic and one hears a higher note. The RING MODULATOR returns both sidebands at once, sum and difference. The SHIFTER ADDS, and a single sideband: 200-400-600 shifted by 50 gives 250-450-650. The ratios are no longer whole numbers, harmonicity is destroyed, and that is why a note becomes a bell, a metal bar, an unheard-of thing — while keeping its envelope and its rhythm intact. A few hertz are enough to make a sound beat without disfiguring it; beyond a hundred, the original pitch is frankly left behind. Technically, the analytic signal is formed — the signal and its Hilbert transform, which is the same signal shifted ninety degrees at every frequency — then rotated in the complex plane at the wanted speed. A negative shift gives the other sideband without having to ask for it. ONE INHERENT FLAW, better known than suffered: downwards, partials that would pass below zero hertz FOLD around zero and come back up. Lowering a 200 Hz partial by 300 Hz does not give minus 100 but 100, on the other side. This is not a bug, it is what a single sideband does, and it is part of its character — but it explains why a large downward shift on a bass gives something other than a lower bass. The stereo offset, finally, shifts the right channel by a few tenths of a hertz more: the two channels drift slowly apart and the sound widens, without the destructive phasing of a delay.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Shift | slider | 100 Hz | -1000 – 1000 Hz, step 1 | Hertz added to EVERY frequency. 200-400-600 shifted by 50 gives 250-450-650: the ratios are no longer whole numbers, which is why a note turns into a bell. A few hertz are enough to make a sound beat without disfiguring it; beyond a hundred, the original pitch is frankly left behind. |
| Stereo offset | slider | 0 Hz | 0 – 20 Hz, step 0.5 | Hertz added to the right channel on top of the shift. A few tenths are enough: the two channels then drift apart and the sound widens slowly, with no destructive phasing. No effect on a mono sound. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Share of the shifted sound in the output. At 50 %, the original and its shift beat together — that is how one gets gently metallic timbres rather than a complete displacement. |

#### Gate/Expander

`gate-expandeur` · Processing → Effects

*Dynamic gate or expander (cuts or attenuates signal below a threshold).*

Two dynamic effects in one node. Gate: cuts the signal when it drops below a threshold (useful for removing background noise between phrases, hiss, reverb tails). Expander: gradually attenuates signal below threshold by a ratio (reverse compressor — gentler than a gate). Set the threshold (in dB), attack and release (transition times), maximum floor attenuation (cut level in Gate mode, limit in Expander mode) and ratio (Expander mode only). Ideal for cleaning up a vocal or instrumental recording.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Gate | Gate / Expander | Gate = cuts signal below threshold (fixed attenuation to floor). Expander = gradually attenuates signal below threshold by ratio (reverse compressor). |
| Threshold | number | -40 dB | -80 – 0 dB, step 1 | Level below which the gate/expander engages. |
| Ratio | number | 4 ∶1 | 1 – 20 ∶1, step 0.5 | Expander only: expansion ratio below threshold. Ignored in Gate mode. |
| Attack | number | 1 ms | 0.1 – 100 ms, step 0.1 | Reaction time when signal drops below threshold. |
| Release | number | 100 ms | 1 – 1000 ms, step 1 | Recovery time when signal rises above threshold. |
| Attenuation | number | 40 dB | 0 – 80 dB, step 1 | Maximum floor attenuation. Gate = cut level; Expander = attenuation limit. |

#### Granular Freeze

`granular-freeze` · Processing → Effects

*Loops a grain with size and pitch control.*

Extracts a small grain at the chosen position and loops it across the whole duration. Control grain size, pitch transposition and mix. Useful for creating drone textures, freeze effects or abstract granular sounds.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Grain size | number | 50 ms | 5 – 500 ms, step 1 | Size of the looped grain. |
| Pitch | number | 0 st | -24 – 24 st, step 1 | Grain pitch shift in semitones. |
| Position | number | 0 % | 0 – 100 %, step 1 | Position in the file where the grain is extracted. |
| Mix | number | 50 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Griffin-Lim

`griffin-lim` · Processing → Effects

*Iterative reconstruction from the magnitude spectrogram. Changes phase to create spectral textures.*

Iterative audio signal reconstruction from its magnitude spectrogram using the Griffin-Lim algorithm. The node keeps the input magnitude and reinvents the phase, producing creative sound textures (drones, spectral fog) or allowing resynthesis of audio from a model that predicts only magnitude. Parameters: Iterations (more iterations = more coherent phase), Initial phase (Random, Zero or Original), FFT size, Overlap and Dry/wet mix. Output is normalized to the original signal peak to preserve level.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Iterations | number | 60 | 1 – 300, step 1 | Number of Griffin-Lim iterations. Higher values produce more coherent phase and cleaner output. |
| Initial phase | choice | Random | Random / Zero / Original | Starting phase for reconstruction. Random = creative texture; Zero = initial pulse; Original = reconstruct the original signal. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the initial phases; no effect outside the « Random » mode. The default is FIXED: a reconstruction that changes on every run would be a defect. |
| FFT | number | 2048 samples | 64 – 8192 samples, step 64 | FFT size (rounded up to next power of 2). |
| Overlap | choice | 75 % | 50 % / 75 % | Overlap between frames. 75% gives a smoother result. |
| Mix | number | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Hard panner

`hard-panner` · Processing → Effects

*Switches the sound fully to the left, center, or right.*

Switches the sound fully to the left, center, or right. Useful for testing a mono chain, forcing an extreme position, or fixing a wiring mistake. Input can be stereo or mono; output is always stereo.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Position | choice | Center | Left / Center / Right | Pan position: hard left, center, or hard right. |

#### Harmonic/Percussive Separation

`separation-harmonique-percussive` · Processing → Effects

*Separates what sustains from what strikes, by median filtering the spectrogram (Fitzgerald, DAFx-10).*

Splits a sound in two: what SUSTAINS and what STRIKES. After Derry Fitzgerald, « Harmonic/Percussive Separation using Median Filtering », 13th International Conference on Digital Audio Effects (DAFx-10), Graz, 2010 — arrow.tudublin.ie/argcon/67. The idea fits in two sentences, and that is what makes it beautiful. On a spectrogram, a sustained note is a HORIZONTAL LINE — same frequency band, many frames — and a percussive hit a VERTICAL LINE — same instant, every frequency at once. A median filter along time therefore erases what is brief and keeps what lasts; the same filter along frequency does exactly the opposite. Two passes, two masks, two sounds. This is NOT the AI Separator, and the two serve different purposes: that one looks for INSTRUMENTS — voice, drums, bass — with a model of several tens of megabytes; this one looks for nothing, has no model, runs in seconds and works on any material, including material no network has ever seen. It serves where the other has nothing to say: reverberating sustains without drowning attacks, compressing attacks without pumping on sustains, replacing a drum part while keeping the harmony, or simply looking at what a sound is made of — the message states the percussive share. The property that matters: the two masks are COMPLEMENTARY, their sum is one at every point. The two outputs added back together therefore give the original sound, sample for sample — nothing is lost and nothing is invented between them, which a mask allows and a resynthesis would not. It is checked by a test, and it is what licenses saying that one has separated rather than transformed. The three settings read together: the window decides what can be distinguished, the two filter lengths what counts as « lasting » and « wide », and the split how firm the verdict is on ambiguous material.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Harmonic | audio |  |
| output | Percussive | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | choice | 2048 | 1024 / 2048 / 4096 | Transform size. Large separates sustained notes better but smears attacks; small does the opposite. 2048 is the paper's compromise. |
| Time filter | slider | 17  frames | 3 – 51  frames, step 2 | Length of the median filter along time, which erases what does not last. Long, only very stable sustains survive; short, a brief note also passes for harmonic. |
| Frequency filter | slider | 17  bins | 3 – 51  bins, step 2 | Length of the median filter along frequency, which erases what is narrow — a partial — and keeps what is wide, the noise of an attack. |
| Split | choice | Soft | Soft / Hard | Soft shares ambiguous energy between the two outputs, Wiener-fashion. Hard sends each point entirely to one side: cleaner-cut, at the cost of artefacts on material that is frankly neither. In both cases the two outputs, added back together, give back the original sound. |

#### Harmonizer / Octaver

`harmonizer` · Processing → Effects

*Adds pitch-shifted voices (octave, fifth…) under the original.*

Adds up to two pitch-shifted voices under the original signal. Set each voice's interval in semitones (12 = octave up, -12 = octave down, 7 = fifth) and its mix level. Perfect for thickening a guitar or creating simple harmonies.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Voice 1 | number | 12 st | -24 – 24 st, step 1 | Interval of first voice in semitones. 12 = octave up, -12 = octave down, 7 = fifth. |
| Mix 1 | number | 30 % | 0 – 100 %, step 1 | Level of first voice. |
| Voice 2 | number | -12 st | -24 – 24 st, step 1 | Interval of second voice in semitones. |
| Mix 2 | number | 30 % | 0 – 100 %, step 1 | Level of second voice. |

#### Impose Rhythm

`motif-imposer-rythme` · Processing → Effects

*Applies one MIDI file's rhythmic grid to another's pitches.*

Separates pitch from rhythm, then marries them again. The first input supplies a sequence of pitches — a melody, a chord progression — the second a grid of onsets, and each onset takes the next pitch from the sequence, which cycles when the grid is longer. This is the operation TidalCycles calls « struct », and it is what makes « Euclidean Rhythm » composable: a Cuban tresillo becomes the grid for a chord sequence, without writing a single onset by hand. What comes from which side is explicit: PITCHES contribute pitches only, the GRID contributes onsets, durations and velocities — hence the accentuation. A chord on the Pitches input is struck whole on one onset, not spelled out. The grid governs the length of the result: it never repeats by itself, whereas the pitches replay from the start as many times as needed. The output channel is the pitches' one, so the grid can be taken from a drum track without the result coming out as percussion.

| Port | Name | Type | |
|---|---|---|---|
| input | Pitches | MIDI |  |
| input | Rhythm | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Inversion Mirror

`miroir-inversion` · Processing → Effects

*Flips the spectrum around a pivot frequency: lows become highs and highs become lows.*

Geometric inversion swaps the inside and outside of a circle; the circle stays put, and applied twice it returns every point to its place. Here the circle is a Pivot frequency, and a component at f goes to pivot²/f: on a logarithmic scale, an exact mirror. At 632 Hz the audible band maps onto itself — 100 Hz ↔ 4 kHz, 440 Hz ↔ 908 Hz — and a voice becomes a whistle with its lows on top. The processing is a phase vocoder that moves each partial according to its measured instantaneous frequency, keeping partials sharp instead of snapping them to a grid. What the mirror costs: a component below pivot²/Nyquist is sent beyond the band and disappears — below 18 Hz at the default pivot at 44.1 kHz, below 17 Hz at 48 kHz — and the message states the energy lost; the level is brought back to that of the energy kept. Unlike the Möbius strip, there is no continuous path between the original and its mirror: sliding from one to the other would crush the whole spectrum onto the pivot. Hence the Laps, which alternate mirror and original with a crossfade. Each channel is processed separately.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pivot | number | 632 Hz | 100 – 4000 Hz, step 1 | Frequency that stays put; a component at f goes to pivot²/f. At 632 Hz, the geometric mean of 20 Hz and 20 kHz, the audible band maps onto itself: 100 Hz ↔ 4 kHz, 440 Hz ↔ 908 Hz. Lower, the whole sound goes up; higher, it goes down. |
| Laps | number | 1 | 1 – 8, step 1 | 1: the mirror alone. Above that, mirror and original alternate, one lap each: applied twice, inversion gives the sound back, and you hear it moving from one to the other. |
| Crossfade | number | 60 ms | 0 – 500 ms, step 5 | Crossfade between mirror and original when Laps is above 1. |

#### Inversions and Voicings

`voicings-accords` · Processing → Effects

*Inverts, spreads and chains a MIDI file's chords while moving as few voices as possible.*

Inverts, spreads and chains a MIDI file's chords. Attic has always built chords the same way: root, third, fifth, seventh, bottom to top, packed inside one octave — the heaviest position there is, the one no pianist plays and no arranger writes. This node does what one does by hand. « Inversion » moves the bottom notes above, one at a time, without changing the chord — only who carries it; pushed as far as the note count, it leaves the chord unchanged rather than driving the music ever upwards. « Voicing » spreads the voices: « Open » raises every other note by an octave, and the « drop » voicings lower the second or third voice FROM THE TOP by an octave, which hollows the chord in the middle and gives it the sound of jazz guitar and four-part brass — it needs at least four notes, and without them the chord comes out unchanged. « Voice leading » is the setting one hears most. Between C major and F major there is a version that moves all three voices by several tones and one that moves a single voice by a semitone; the latter sounds like a harmony moving forward, the former like two unrelated chords. So the node looks, for each chord, for the register that moves the fewest voices from the previous one — by whole octaves only, so that the voicing chosen above is kept exactly. The first chord is never moved: it is the one that sets the register. The search is greedy, with no going back on past choices: a global search would sometimes do better by a semitone, at exponential cost and for a result one would not hear.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Inversion | number | 0 | 0 – 5, step 1 | How many bottom notes move up an octave. 0 = root position. An inversion equal to the chord's note count leaves it unchanged, rather than pushing it upwards. |
| Voicing | choice | Close | Close / Open / Drop 2 / Drop 3 / Drop 2 and 4 | How the voices are spread. « Open » raises every other note by an octave. The « drop » voicings lower the second or third voice from the top by an octave: this is the writing of jazz guitar and four-part brass, and it needs at least four notes. |
| Voice leading | choice | Yes | No / Yes | Finds, for each chord, the register that moves the fewest voices from the previous one. The voicing chosen above is kept as is: the leading only shifts chords by whole octaves. |
| Lowest note | number | 40 | 21 – 60, step 1 | Lowest note the voice leading allows itself. |
| Highest note | number | 88 | 60 – 108, step 1 | Highest note the voice leading allows itself. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Klein Bottle

`bouteille-klein` · Processing → Effects

*Endless glissando whose voices come back on the other side every lap: it takes two laps for everything to return.*

A Klein bottle is built like a torus — a base circle, and above each point a « fibre » circle — with one difference: going around the base, the fibre comes back flipped as in a mirror, and it takes two laps to come back the right way. Here the base is the range of a Risset glissando, whose top is glued to its bottom: a voice leaving through the high end is reborn in the low end. The fibre is the left/right position, and each glued voice is reborn on the OTHER side. The mirror not being continuous, it is hidden where Risset already hides the octave jump: in silence, the voice being mute at the moment it is glued. All voices start on the same side; the glissando rises endlessly, and the sound migrates from one side to the other voice by voice, through the register, before coming back. The full return requires every voice to have gone around the range twice: 2 × octaves × cycle, and the message says whether the chosen length lets you hear it. Why a mirror and not a rotation: a rotation can be undone, and the object would only be a torus. Each voice being a point, a stereo input is mixed down to mono. As with the Risset glissando, a rich, loosely rhythmic source works best.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Rising | Rising / Falling | Direction of the glissando. Rising, voices leave through the top and are reborn at the bottom, mirrored; falling, the reverse. |
| Duration | number | 30 s | 1 – 300 s, step 1 | Length of the produced sound. To hear the full return, allow at least two laps of the range: 2 × octaves × cycle. |
| Cycle | number | 3 s | 0.5 – 30 s, step 0.5 | Time for one voice to travel one octave. One lap of the range lasts octaves × cycle. |
| Octaves | number | 4 | 3 – 8, step 1 | Range of the glissando, and number of voices. The more there are, the more gradual the migration from one side to the other — and the longer the full return. |
| Spread | number | 70 ° | 0 – 90 °, step 1 | Angle of the voices from the centre. 90°: fully right at first, fully left when mirrored. 0°: all centred, and the mirror is no longer heard. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied to make the source loop without a click. |

#### Limiter

`limiteur` · Processing → Effects

*Peak limiter for mastering.*

Peak limiter for mastering: instant attack, adjustable release and output ceiling. Reduces peaks above the threshold with an infinite ratio, then applies makeup gain so the ceiling reaches the target value. Ideal for gaining loudness without clipping.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | number | -3 dB | -40 – 0 dB, step 1 | Level above which limiting engages. |
| Release | number | 50 ms | 1 – 1000 ms, step 1 | Time to return to normal gain after a peak. |
| Ceiling | number | -1 dB | -40 – 0 dB, step 0.5 | Maximum output level. |

#### Logistic auto-pan

`auto-pan-logistique` · Processing → Effects

*Left-to-right sweep following a logistic curve.*

Progressive automatic stereo sweep: the panning moves from left to right following a logistic curve. The Center (0-100%) sets the moment of the fastest transition, Steepness (0.1-50) controls the curve's sharpness (higher = more abrupt), and Mix sets the dry/wet balance. Useful for panning movements that appear slowly then accelerate, or vice versa.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Center | slider | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition (0% = start, 100% = end). |
| Steepness | slider | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve (higher = very fast transition). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Logistic chopper

`chopper-logistique` · Processing → Effects

*Rhythmic gate whose depth grows following a logistic curve.*

Rhythmic gate whose chopping depth rises along a logistic curve: the effect is inaudible at the start, then the gate becomes more and more pronounced up to its maximum depth. Adjust the rate (cuts per second, 0.5 to 20 Hz), ON segment length, type (Hard/Soft), maximum depth (0 to 100%), center (midpoint of the transition), steepness and mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 4 Hz | 0.5 – 20 Hz, step 0.5 | Chop speed (cuts per second). |
| Length | slider | 50 % | 1 – 99 %, step 1 | ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous). |
| Type | choice | Hard | Hard / Soft | Hard = abrupt cut, Soft = smooth transition. |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Maximum gate depth reached at the end of the transition (0% = no effect, 100% = full gate). |
| Center | slider | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition (0% = start, 100% = end). |
| Steepness | slider | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve (higher = very fast transition). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Logistic echo

`echo-logistique` · Processing → Effects

*Echo whose feedback grows following a logistic curve.*

Echo whose feedback rises along a logistic curve: the effect is inaudible at the start, then repetitions become more and more present up to the maximum feedback. Adjust the delay between repetitions (50 to 2000 ms), the maximum feedback (0 to 95%), the center (midpoint of the transition), the steepness and the mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | slider | 350 ms | 50 – 2000 ms, step 10 | Delay time between repetitions. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Maximum feedback reached at the end of the transition (0% = single repeat, 95% = long tail). |
| Center | slider | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition (0% = start, 100% = end). |
| Steepness | slider | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve (higher = very fast transition). |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Logistic Paulstretch

`paulstretch-logistique` · Processing → Effects

*Extreme time-stretch that grows in progressively.*

Logistic Paulstretch: extreme time-stretch grows in progressively following a logistic curve. At the start the signal is intact, then it gradually transforms into a stretched texture up to the maximum factor. Parameters: max Stretch, Window, Center, Steepness and Mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Stretch | number | 8 × | 1 – 100 ×, step 1 | Maximum stretch factor reached at the end of the transition. |
| Window | number | 0.25 s | 0.01 – 1 s, step 0.01 | STFT window size in seconds. |
| Center | number | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition. |
| Steepness | number | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve. |
| Mix | number | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the phase randomization. The default is FIXED: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character. |

#### Logistic tremolo

`tremolo-logistique` · Processing → Effects

*Tremolo whose depth grows following a logistic curve.*

Tremolo whose modulation depth rises along a logistic curve: the effect is inaudible at the start, then grows to its maximum depth. Adjust the rate (speed, 0.1 to 20 Hz), the maximum depth (0 to 100%), the center (midpoint of the transition), the steepness and the mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation rate (vibrations per second). |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Maximum modulation depth (0% = no effect, 100% = volume fully cut). |
| Center | slider | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition (0% = start, 100% = end). |
| Steepness | slider | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve (higher = very fast transition). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Logistic vibrato

`vibrato-logistique` · Processing → Effects

*Vibrato whose depth grows following a logistic curve.*

Vibrato whose modulation depth rises along a logistic curve: the vibrato is inaudible at the start, then grows to its maximum depth. Adjust the rate (speed, 0.1 to 20 Hz), the maximum depth (0 to ±2 semitones), the center (midpoint of the transition), the steepness and the mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation speed (oscillations per second). |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Maximum pitch modulation depth (0% = none, 100% = ±2 semitones). |
| Center | slider | 50 % | 0 – 100 %, step 1 | Midpoint of the logistic transition (0% = start, 100% = end). |
| Steepness | slider | 10 | 0.1 – 50, step 0.1 | Steepness of the logistic curve (higher = very fast transition). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Lucier Room

`piece-lucier` · Processing → Effects

*Feeds the sound back into the same room until only its resonances remain.*

After Alvin Lucier's "I Am Sitting in a Room" (1969), whose principle fits in one sentence: record a voice in a room, play the recording back into that same room, re-record, and repeat. With each pass the frequencies the room favours are reinforced and those it absorbs fade further; after a few dozen passes no speech is left, only the room's resonant modes turned into a sustained chord. This is NOT a very wet reverb: a space is a filter, and applying it many times does not give "more of the same" — it turns the filter into the sound. The decisive parameter is therefore the iteration count: below 5 you hear colouring, around 15-20 the source becomes unrecognisable, past 30 only the room remains. The other settings describe the space, exactly as on the convolution reverb node. Note: the pre-delay accumulates from pass to pass and progressively pushes the sound later; that is expected behaviour, not a fault.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Iterations | number | 20 | 1 – 60, step 1 | Number of passes through the room. The only parameter of the piece, and the one that decides everything: colouring below 5, unrecognisable source around 15-20, nothing but the room past 30. |
| Type | choice | Cathedral | Room / Hall / Plate / Spring / Cathedral | Type of space. The more resonant it is, the faster its modes take over — a cathedral shows itself in a few passes where a small room needs many. |
| Size | number | 70 % | 0 – 100 %, step 1 | Size of the space. |
| Decay | number | 3 s | 0.1 – 10 s, step 0.1 | Length of the reverb tail. |
| Pre-delay | number | 10 ms | 0 – 200 ms, step 1 | Delay before the first reflections. It ACCUMULATES from pass to pass: a high value combined with many iterations pushes the sound later, possibly out of the frame. |
| Damping | number | 30 % | 0 – 100 %, step 1 | Absorption of highs by air and materials. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the room. It deserves to be fixed here more than anywhere else: the room is the subject of the piece, and twenty passes through a different room each time would never give the same result twice. Changing it means recording in another room. |

#### Markov Chain

`markov-midi` · Processing → Effects

*Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight.*

Learns a MIDI file's note transitions, then generates new ones. Attic can already continue a melody with a neural network (Magenta); it lacked the simple procedure, the one you can READ: count how many times each note follows another, then replay by drawing at random according to those counts. The text output gives the table, context by context, in note names and percentages. « Order » is the setting that matters: it is how many notes are looked back on. At 1, the piece comes out in its key but without phrasing; at 2 or 3, its turns of phrase reappear; beyond that, the chain has no choice left and copies the source. The share of contexts with « no choice », shown at the head of the report, measures exactly that overfitting: above 80%, lower the order. Two simplifications, stated rather than hidden: the source's DURATIONS are not learned — the node imitates pitches only and plays them as eighth notes — and a chord is read from the bottom up, hence as an arpeggio. When the chain meets a transition never seen, it restarts from a known context instead of stopping. With a fixed seed, the same sequence is replayed identically.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Table | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Order | number | 2 | 1 – 4, step 1 | How many notes are looked back on. At 1, the piece comes out in its key but without phrasing; at 2 or 3, its turns of phrase reappear; beyond that, the chain has no choice left and copies the source. The text output gives the share of contexts with no choice, which measures that overfitting. |
| Notes | number | 64 | 4 – 2000, step 1 | Number of notes generated. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Speed of the produced MIDI. The source's durations are not learned: the node imitates pitches only, and plays them as eighth notes. |
| Seed | number | 0 | 0 – 999999, step 1 | 0 = drawn at random on every run, and shown in the message. Any other value replays the exact same sequence. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### MIDI Arpeggiator

`arpegiateur-midi` · Processing → Effects

*Arpeggiates chords from a MIDI file according to a pattern and direction.*

Turns chords from a MIDI file into arpeggios. Detects simultaneous notes (chords) and arpeggiates them according to a direction (up, down, up-down, random), an intra-chord repetition pattern (1232, 1321…), a speed (1/8, 1/16, 1/32, triplets) and an octave span (1-4, each octave adds +12 semitones). Note length is adjustable (staccato to legato). The transformed file is output on the MIDI port — connect it to a « MIDI Output » node to listen.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Up | Up / Down / UpDown / DownUp / Random | Order in which chord notes are played. Up = low to high ; Down = high to low ; UpDown = back and forth ; Random = random order. |
| Pattern | choice | Straight | Straight / 1232 / 12321 / 1321 / 1213 | Intra-chord repetition pattern (1=low note, 2=mid, 3=high). « Straight » = plays notes in the direction order. |
| Speed | choice | 1/16 | 1/8 / 1/16 / 1/32 / 1/8 triplet / 1/16 triplet | Arpeggio speed (time division). |
| Octaves | number | 1 | 1 – 4, step 1 | Number of octaves the arpeggio spans (each octave adds +12 semitones). |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the note order; no effect outside the « Random » mode. 0 = drawn at random on every run, and shown in the message so it can be copied back here. |
| Note length | number | 50 % | 10 – 100 %, step 5 | Length of each arpeggiated note as a percentage of the step time. 100% = legato, 50% = staccato. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### MIDI Sampler

`sampler-midi` · Processing → Effects

*Plays incoming MIDI notes with an audio sample loaded from the inspector.*

Receives MIDI notes at the input and plays them with an audio sample loaded from the inspector. Each MIDI note is transposed from the « Reference note » (the original pitch of the sample). The audio output contains the melody played with the sample's timbre. The MIDI output passes notes through unchanged, allowing chaining to other MIDI nodes. Connect a MIDI Player, a sequencer or a MIDI reservoir to the input, then load a short audio file (percussion, voice, instrument) in the inspector.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |
| Reference note | number | 60 | 21 – 108, step 1 | MIDI note matching the original pitch of the sample (60 = middle C). |

#### MIDI Speed

`vitesse-midi` · Processing → Effects

*Plays a MIDI file slower or faster, without touching the pitches.*

Plays a MIDI file slower or faster. Attic has stretched time for a long while, but on audio only — phase vocoder, SoundTouch; of the twenty-six nodes that take a MIDI file and return one, none touched the speed, although it is the most ordinary gesture there is: slowing a passage down to learn it, matching two pieces to the same tempo. And on MIDI it is EXACT where audio can only approximate: nothing is resampled, pitches do not move by a hundredth of a tone, and no artefact appears at four times slower. Three ways of saying the same thing, because one does not think in the same unit depending on the task: a FACTOR when you know what you want — 0.5 plays twice as slow, 2 twice as fast —, a PERCENTAGE when feeling your way, a TARGET TEMPO when matching one piece to another, the node then reading the file's tempo and doing the division itself. Two points are worth knowing. The MIDI output is NOT re-encoded: only its tempo is rewritten, which leaves the tick positions untouched, so channels, program changes, controllers, pedal and track names go through without a scratch — re-encoding from pitches alone would have flattened a two-handed piano part onto a single channel. That is also what keeps the NOTATION right: a quarter note stays a quarter note and the tempo changes, where a naive stretch would double every note value and make the score unreadable. Then, a duration cannot be divided indefinitely: at eight times faster a sixteenth note falls below five milliseconds and is no longer a note but a click. An adjustable floor prevents it, and the number of notes concerned is announced; it only applies to the audio rendered here, the MIDI output keeping its exact durations. A file with a variable tempo keeps its relief, every change being stretched; the node says so, because the tempo it announces is then only the first.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Factor | Factor / Percentage / Target tempo | How to state the speed. « Factor » when you know what you want, « Percentage » when you are feeling your way, « Target tempo » when matching one piece to another — the node then reads the file's tempo and does the division itself. |
| Factor | slider | 1 × | 0.1 – 8 ×, step 0.05 | Playback speed: 0.5 plays twice as slow, 2 twice as fast. This is a SPEED and not a stretch — durations are divided by it. |
| Percentage | slider | 100 % | 10 – 800 %, step 5 | The same thing as a percentage of the original speed: 75 % for a quarter slower, 200 % for twice as fast. |
| Target tempo | number | 120 BPM | 20 – 300 BPM, step 1 | The tempo to play the file at. The factor follows: a file at 120 played at 90 is slowed to 0.75. The tempo read from the file is recalled in the message. |
| Minimum duration | slider | 20 ms | 0 – 200 ms, step 5 | Duration floor for a sped-up note. At eight times faster, a sixteenth note falls below five milliseconds: that is no longer a note, it is a click. This floor only affects the audio rendered here — the MIDI output keeps its exact durations. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### MIDI Transposer/Quantizer

`transposeur-quantiseur-midi` · Processing → Effects

*Transposes and/or quantizes a MIDI file.*

Takes a MIDI file and transforms it: transposition (±24 semitones) and/or rhythmic quantization (snapping note onsets to a grid: 1/4, 1/8, 1/16, 1/32, triplets). Option to also quantize note ends. The transformed file is output on the MIDI port — connect it to a « MIDI Output » node to listen. Useful for correcting imprecise human recordings or adapting a melody to another key.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Transpose | number | 0 st | -24 – 24 st, step 1 | Transposition in semitones (−24 to +24). 0 = no transposition. |
| Quantization | choice | 1/16 | None / 1/4 / 1/8 / 1/16 / 1/32 / 1/8 triplet / 1/16 triplet | Quantization grid for note onsets. Snaps notes to the chosen rhythmic grid. |
| Quantize ends | choice | No | No / Yes | If « Yes », note ends are also snapped to the grid (may shorten/lengthen notes). |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Möbius Strip

`anneau-moebius` · Processing → Effects

*Sends the sound around a Möbius strip: one lap takes it to the other side, two laps bring it back.*

Sends the sound around a Möbius strip. One lap lasts the whole sound; as it moves, the strip turns half a revolution, so after one lap the sound is back where it started… on the other side. A second lap is needed to find it unchanged: that is the strip's property, and the node makes it audible. Stereo side: the strip's width is the stereo width; the image turns continuously and left and right are swapped after one lap. It does NOT collapse to mono halfway: the component that leaves the left/right plane is carried by a 90° phase shift, which keeps the width intact — at the centre, both channels have the same energy without being the same signal. A mono sound, or a stereo one with identical channels, has no width to turn: it is placed on the strip's edge, starts left, moves right during the first lap and returns during the second. Best heard on headphones. Phase side: the other side is the inverted signal. Rotating its phase at a constant speed amounts to shifting it in frequency by half a hertz divided by the sound's length — 0.05 Hz for a 10 s sound. On its own it is barely audible. With Mix at 50%, the two sides cancel: the whole sound fades out after one lap and returns after two. This is not a phaser's sweep of notches, because the original goes through the same phase shifter: the phase difference is the same at every frequency. Two laps close the strip; an odd number ends on the other side. Since the sound is not a loop, each seam is sewn with a crossfade. The phase shift is accurate to ±0.7° from 20 Hz to 20 kHz; below 20 Hz it degrades. Output is limited to 20 minutes.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Side | choice | Stereo (left ↔ right) | Stereo (left ↔ right) / Phase (front ↔ back) | What « the other side » of the strip becomes. Stereo: the strip's width is the stereo width, and the image turns half a revolution per lap — left and right swapped after one lap, without collapsing to mono halfway. A mono sound is placed on the strip's edge and travels from left to right. Phase: the other side is the inverted signal; on its own it is barely audible. With Mix at 50%, the two sides cancel: the whole sound fades out after one lap and returns after two. |
| Laps | number | 2 | 1 – 8, step 1 | Number of laps around the strip; one lap lasts the whole sound. Two laps close the strip and end where they began. An odd number ends on the other side. |
| Crossfade | number | 30 ms | 0 – 500 ms, step 5 | Crossfade at each seam between two laps. A sound does not loop by itself: without a crossfade the seam clicks. Capped at a quarter of the sound's length. |
| Mix | number | 100 % | 0 – 100 %, step 1 | 100%: the twist alone. Below that, the original sound mixes back with the other side. At 50%, the two sides cancel after one lap: on the Phase side the sound fades out completely, on the Stereo side left and right meet in the centre. |

#### Modal Bar

`barre-modale` · Processing → Effects

*Marimba, vibraphone, glockenspiel, tubular bell or bowl, by modal synthesis on published ratios.*

Definite-pitched percussion by modal synthesis. A bar does not vibrate like a string. A string has integer partials — 1, 2, 3, 4 — because it vibrates in one dimension under tension; a free bar vibrates in FLEXION, and its natural modes land on 1, then 2.756, then 5.404, then 8.933. Those non-integer ratios are a published acoustics result, and they are what give the glockenspiel its metallic colour. Instrument makers correct them deliberately: carving an arch under a marimba bar lowers its second mode to FOUR times the first and its third towards ten, so the bar becomes harmonic, hence musical. The tubular bell goes further — its partials sit around 2, 3, 4.16 and 5.43, so the note one hears does NOT exist in the sound: it is a missing fundamental the ear reconstructs, and the node's spectrum indeed carries no trace of it. The Tibetan bowl owes its voice to two nearly coincident modes, at 1 and 1.02, whose spacing produces a slow beating. « Mallet hardness » is the setting that changes the timbre most, and for a physical reason: a hard mallet gives a short impulse, hence rich in highs, which wakes the upper modes, whereas a soft one wakes only the first. A mode whose frequency would exceed half the sampling rate is simply dropped rather than folded down into the bass where it would sound wrong. A MIDI file on the input turns each note into a mallet stroke, and the strokes overlap — which is what gives a vibraphone its halo.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Marimba | Glockenspiel (free bar) / Marimba / Vibraphone / Tubular bell / Tibetan bowl / Wood block | The instrument, that is, its modal ratios. A free bar vibrates on 1 / 2.756 / 5.404 / 8.933 — non-integer ratios, hence its metallic colour. Carving an arch under a marimba bar brings its second mode to 4 and its third to 10: it becomes harmonic, hence musical. The tubular bell rings on 2 / 3 / 4.16 / 5.43, so the note one hears is not in the sound at all. |
| Note | text | `C4` |  | Note struck when no MIDI is connected. A MIDI file wins, and each note becomes a mallet stroke whose velocity sets the hardness. |
| Mallet hardness | number | 50 % | 0 – 100 %, step 1 | A hard mallet gives a short impulse, hence rich in highs, and wakes the upper modes; a soft one wakes only the first. It is the setting that changes the timbre most, and for a physical reason rather than by a tuning curve. |
| Damping | number | 0 % | 0 – 100 %, step 1 | A hand laid on the bar: shortens every resonance at once. |
| Tremolo | number | 0 % | 0 – 100 %, step 1 | The vibraphone's tremolo, which comes from the discs spinning in its resonator tubes. No effect on the other instruments, but nothing stops you trying. |
| Tremolo rate | number | 5 Hz | 0.5 – 12 Hz, step 0.1 | Tremolo speed. |
| Duration | number | 3 s | 0.1 – 15 s, step 0.1 | Length of the stroke, when no MIDI is connected. The Tibetan bowl needs several seconds for its beating to be heard. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Multiband Compressor

`compresseur-multibande` · Processing → Effects

*3-band compressor with independent thresholds/ratios.*

Compressor split into three bands (low, mid, high). Each band is isolated by a crossover and compressed with its own threshold and ratio. Ideal for controlling lows without affecting highs, or adding punch to the mids without squashing the bass.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Low threshold | number | -20 dB | -60 – 0 dB, step 1 | Compressor threshold for the low band. |
| Low ratio | number | 4 ∶1 | 1 – 20 ∶1, step 0.5 | Compressor ratio for the low band. |
| Mid threshold | number | -20 dB | -60 – 0 dB, step 1 | Compressor threshold for the mid band. |
| Mid ratio | number | 4 ∶1 | 1 – 20 ∶1, step 0.5 | Compressor ratio for the mid band. |
| High threshold | number | -20 dB | -60 – 0 dB, step 1 | Compressor threshold for the high band. |
| High ratio | number | 4 ∶1 | 1 – 20 ∶1, step 0.5 | Compressor ratio for the high band. |
| Attack | number | 5 ms | 0 – 200 ms, step 1 | Common attack time for all bands. |
| Release | number | 100 ms | 5 – 1000 ms, step 5 | Common release time for all bands. |
| Low freq | number | 250 Hz | 40 – 1000 Hz, step 10 | Crossover between low and mid bands. |
| High freq | number | 4000 Hz | 1000 – 12000 Hz, step 100 | Crossover between mid and high bands. |

#### Negative Harmony

`harmonie-negative` · Processing → Effects

*Reflects pitches around the tonic-dominant axis: C major becomes C minor, G7 becomes F minor 6.*

Reflects pitches around the tonic-dominant axis. The idea comes from Hugo Riemann's dualist harmony, taken up by Ernst Levy in « A Theory of Harmony » (1985), and put back into circulation in recent years under the name negative harmony. It fits in one sentence: reflect the twelve pitches around the axis lying halfway between the tonic and its dominant, and every tonal function turns into its image, giving a harmony that fills the same role by the opposite path. In C, the axis falls between E flat and E — it falls on no note of the keyboard, and therefore has no fixed point: the twelve classes swap in six pairs. The tonic becomes the dominant, E flat and E swap, and C major comes out as C minor. The famous result is G7, which becomes an F minor 6: two chords that nothing relates on paper, and which both call for resolution onto C. The text output gives the six pairs, so one sees what the reflection does before hearing it. « Reflection » offers the procedure's two honest readings. « Classes, register kept » reflects each note within its octave: the harmony changes, the line keeps its contour, and that is what one wants to substitute a chord inside a progression. « True mirror » reflects everything around a single absolute axis, placed in the middle of the piece: intervals change direction, so the melody turns over — which is the real mirror, but rarely what one is after on a melodic line. This node is a generator, not a rule: it offers a substitution, it does not say the substitution is good.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Table | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tonic | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | The key whose axis is taken. It is the only setting that matters: the axis lies halfway between this note and its fifth, and everything else follows. |
| Reflection | choice | Classes, register kept | Classes, register kept / True mirror | « Classes » reflects each note within its octave: the harmony changes, the line keeps its contour — this is what one wants to substitute a chord. « True mirror » reflects everything around a single axis: intervals change direction and the melody turns over. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Noise Profile

`profil-bruit` · Processing → Effects

*Captures the spectral profile of a noise.*

Analyses a noise-only passage and produces a spectral profile, to feed into « Noise Reduction ».

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Profile | control |  |

*No parameters.*

#### Noise Reduction

`reduction-bruit` · Processing → Effects

*Spectral noise subtraction.*

Subtracts background noise from the signal using a noise profile captured on a silent passage (« Noise Profile » block).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Profile | control |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Spectral | Spectral / Notches | Spectral = standard power subtraction. Notches = dynamic notch filters on the strongest profile frequencies (useful for hum/buzz). |
| Reduction | number | 100 % | 0 – 100 %, step 1 | (Spectral mode) Percentage of the noise power subtracted from the signal. 100% = full subtraction, 0% = no effect. |
| Floor | number | 1 % | 0 – 100 %, step 1 | (Spectral mode) Minimum residual power level (percentage of the noisy signal power). 0% = maximum denoising, may create musical artifacts. |
| Notches | number | 50 | 1 – 100, step 1 | (Notches mode) Maximum number of notch filters applied. Increase if the hum has many harmonics. |
| Q | number | 10 | 1 – 50, step 1 | (Notches mode) Notch filter selectivity. Higher Q = narrower removed band. For close harmonics, leave Q = 10. |

#### Normalizer

`normaliseur` · Processing → Effects

*Level normalization.*

Adjusts overall gain to bring the signal peak to the target level, without changing dynamics.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Level | number | -3 dB | -40 – 0 dB, step 0.5 | Target peak level in dB. |

#### Note Echo

`motif-echo-notes` · Processing → Effects

*Layers time-shifted copies of a pattern, with decreasing velocity.*

Layers time-shifted copies of the pattern, each weaker than the last. The difference from an audio delay is total: these are not repetitions of a signal, they are NOTES, written into the MIDI file, and they can be transposed, quantized, replayed with another instrument, read in a score. A delay is mixed in; this one composes. « Feedback » is multiplicative: at 60 %, a note at 100 gives 60, then 36, then 22. The series stops by itself as soon as a copy would fall below velocity 1, rather than writing silent notes into the file. « Transpose » accumulates from copy to copy: at +7, the echo climbs fifth by fifth, and the series stops dead when it would leave the MIDI range instead of folding notes back anywhere. Every note of a chord is echoed, hence the whole chord. At a short offset — a twentieth of a second — the effect is no longer an echo but a flam; at a long offset with no transposition, it is a canon with oneself.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Repeats | number | 3 | 0 – 16, step 1 | Number of copies added after each note. Copies that would fall below velocity 1 are not written. |
| Offset | number | 0.25 s | 0.01 – 4 s, step 0.01 | Gap between two successive copies. |
| Feedback | number | 60 % | 0 – 100 %, step 1 | Share of the velocity each copy keeps from the previous one. 100 % = copies as loud as the original. |
| Transpose | number | 0 st | -12 – 12 st, step 1 | Transposition accumulated at each copy: +7 sends the echo up fifth by fifth. A copy that would leave the MIDI range ends the series. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Octaver

`octaver` · Processing → Effects

*Adds an upper and/or lower octave.*

Generates up to TWO extra voices — hence the two sliders: "Octave up" sets the volume of the voice one octave above, "Octave down" the voice one octave below. Set either to 0 to add a single voice. "Mix" then balances the original against the added voices. Monophonic technique (analog pedal style): works best on single-note sources (voice, bass, lead).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Octave up | slider | 50 % | 0 – 100 %, step 1 | Volume of the added voice one octave ABOVE (frequency doubled by rectification). |
| Octave down | slider | 50 % | 0 – 100 %, step 1 | Volume of the added voice one octave BELOW (period doubled by polarity flipping). |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Dry / added-voices balance. 0% = dry only, 100% = octaves only. |

#### Paulstretch

`paulstretch` · Processing → Effects

*Extreme phase-randomization time-stretch (stereo).*

Paulstretch: extreme time-stretch by randomizing the phases of the STFT. The signal is sliced into large windows, phases are randomized in each window, then the pieces are overlap-added. This produces a smooth, floating sound texture, ideal for drones or ambient textures. Each channel is processed independently: a stereo input stays stereo. Parameters: Stretch (stretch factor, 1 to 100×) and Window (STFT window size in seconds, 0.01 to 1 s).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Stretch | number | 8 × | 1 – 100 ×, step 1 | Stretch factor. 1 = no effect, 8 = 8× longer. |
| Window | number | 0.25 s | 0.01 – 1 s, step 0.01 | STFT window size in seconds. Large = smooth texture, small = more transients. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the phase randomization. The default is FIXED: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character. |

#### Phase Vocoder Pitch

`phase-vocoder-tonalite` · Processing → Effects

*Transposes pitch via phase vocoder (frequency-domain), without changing duration.*

Transposes pitch via phase vocoder (FFT frequency-domain processing), without changing the track duration. The algorithm stretches the signal in time then resamples it back to the original length. Alternative to native pitch-shift for creative effects.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch | number | 0 st | -12 – 12 st, step 0.5 | Pitch shift in semitones. 0 = original, +12 = one octave up, -12 = one octave down. |

#### Phase Vocoder Tempo

`phase-vocoder-tempo` · Processing → Effects

*Changes tempo via phase vocoder (frequency-domain), with transient detection.*

Changes tempo via phase vocoder (FFT frequency-domain processing). The « transients » option enables transient detection to preserve drum/pluck attacks. Alternative to native time-stretch and SoundTouch for smoother results at extreme ratios.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 1 x | 0.25 – 4 x, step 0.01 | Tempo factor. 1 = original, 2 = 2x faster, 0.5 = 2x slower. |

#### Phaser

`phaser` · Processing → Effects

*All-pass filter cascade modulated by LFO (sweeping effect).*

All-pass filter cascade with a LFO-modulated cutoff frequency. Creates moving peaks and notches in the spectrum — the "sweeping" effect characteristic of analog synths and guitars (Van Halen, Pink Floyd). Adjust rate, depth, number of stages (2 to 8, more = stronger) and mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 0.5 Hz | 0.05 – 10 Hz, step 0.05 | Modulation speed (sweeps per second). |
| Depth | slider | 80 % | 0 – 100 %, step 1 | Frequency sweep range. |
| Stages | slider | 4 | 2 – 8, step 1 | Number of all-pass stages (more = stronger effect). |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Mix between dry and wet signal. |

#### Ping-Pong Echo

`echo-ping-pong` · Processing → Effects

*Stereo ping-pong echo.*

Echo whose repeats bounce alternately between the left and right channels.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | number | 250 ms |  | Delay between repeats. |
| Feedback | number | 35 % |  | Amount fed back. |
| Pan | number | 80 % |  | Left/right balance. |

#### Pitch ↔ Rhythm Continuum

`continuum-stockhausen` · Processing → Effects

*Slows a sound until its pitch turns into a pulse.*

After the discovery Karlheinz Stockhausen formulated while composing "Kontakte" (1960): pitch, timbre and rhythm are not three distinct phenomena but ONE, observed at three time scales. A pulse repeated 200 times a second is heard as a 200 Hz note; slowed a thousandfold, the same pulse is heard as one beat every five seconds. Nothing changes in the signal but the scale, and yet the ear flips from one category to the other somewhere around 20 Hz. This node is therefore not one more effect but a demonstration: it carries your sound across that boundary, continuously, and you hear the exact point where pitch decomposes into rhythm. Feed it a PERIODIC, clearly articulated source — a pulse train, a sustained note, a short percussive pattern: its periodicity is what becomes the rhythm. On material without clear periodicity, nothing audible happens beyond a slow-down. Mechanically this is variable-speed playback, like the "Tape" mode of the Risset glissando; what changes everything is the span of the sweep — some ten octaves, a factor of a thousand, where a glissando covers a few.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Toward rhythm | Toward rhythm / Toward pitch | "Toward rhythm" slows down: the note decomposes into a pulse. "Toward pitch" speeds up: the pulse condenses into a note. The first is the more telling, since it starts from what the ear identifies best. |
| Duration | number | 30 s | 2 – 300 s, step 1 | Length of the crossing. Long, it gives time to hear the flip; short, it produces a falling effect. |
| Octaves | number | 10 | 2 – 16, step 1 | Span of the sweep. Ten octaves is a factor of a thousand: a 200 Hz source ends at 0.2 Hz, one beat every five seconds. Below 5 you stay in the pitch domain and the demonstration does not work. |
| Loop crossfade | number | 20 ms | 0 – 500 ms, step 5 | Crossfade so the source loops without a click. Slowed a thousandfold it would otherwise supply a fraction of a millisecond of material. |

#### Pitch Glissando

`glissando-tonalite` · Processing → Effects

*Pitch glissando from one pitch to another.*

Pitch glissando: the transposition continuously evolves between the start and end values (in semitones), while keeping the total duration. The effect is produced by a variable-speed playback whose rate is normalized across the track length. If both pitches are equal, the node behaves like a static pitch shift.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Start | number | 0 st | -24 – 24 st, step 0.5 | Start pitch in semitones. |
| End | number | 12 st | -24 – 24 st, step 0.5 | End pitch in semitones. |

#### Pitch Shift

`changement-tonalite` · Processing → Effects

*Pitch shift.*

Transposes the pitch by a given number of semitones, without changing the track duration.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Semitones | number | 2 | -24 – 24, step 1 | Transposition in semitones. |

#### Ply and Rotate

`motif-repeter-tourner` · Processing → Effects

*Repeats each note within its own duration, and shifts the pitches along the grid.*

Two operations on one pattern, which do not touch the same thing. REPEAT subdivides each event's duration into equal parts and replays the same pitch in each — live-coding's « ply »: the rhythmic grid does not move, it fills up. A quarter note repeated four times becomes four sixteenths on the same pitch, and the other notes' onsets stay exactly where they were. ROTATE shifts the pitch sequence along the grid without touching the onsets: the rhythm stays put, the melody slides. A rotation of 1 on C-D-E gives D-E-C at the same instants. This is « iter », and on a loop it makes the same material heard from another starting point. The two apply in that order, which means the rotation acts on the ALREADY densified pattern: two notes repeated twice make four steps, so rotating by one step shifts by half a step of the original pattern. A negative rotation turns the other way, and a rotation larger than the pattern wraps. Chords are repeated whole.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Repeats | number | 2 | 1 – 16, step 1 | How many times each event is played inside its original duration. The grid does not move: it fills up. 1 = no repetition. |
| Rotation | number | 0 | -32 – 32, step 1 | Shifts the pitch sequence along the rhythmic grid without touching the onsets: the rhythm stays, the melody slides. The rotation applies AFTER the repeats, hence on the densified pattern. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Progressive Pitch

`pitch-progressif` · Processing → Effects

*Repeats the sound, shifting it one step further each time, with silences in between.*

Repeats the sound n+1 times, shifting it one step further each time, with silences in between. With 3 loops, a 10 s gap and -5 semitones: the original, then -5, then -10, then -15 st. The output lasts 4 times the source + 30 s, since SoundTouch's pitch-shift preserves each pass's duration. There is NO silence after the last pass: 3 loops give three gaps, not four. Each repeat is computed FROM THE ORIGINAL using k times the step, never by re-applying the shift to the previous result: both give the same pitch, but a pitch-shift is lossy, and chaining it would accumulate artefacts until the last repeat sounded markedly worse than the first with nothing in the settings to explain it. Step 0 does not go through the shifter at all, which would degrade the signal for a zero shift. Note: past 12 cumulative semitones down the timbre hollows out considerably — the point of a progressive fall, less so for a plain transposition, where the SoundTouch Pitch node is a better fit.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Loops | number | 3 | 1 – 12, step 1 | Number of repeats AFTER the original. 3 gives four passes in total: the original, then three transpositions. |
| Gap | number | 10 s | 0 – 60 s, step 0.5 | Silence between passes. None after the last one: with 3 loops the output holds three gaps, not four. |
| Step | number | -5 st | -12 – 12 st, step 0.5 | Pitch added at EACH repeat, in semitones. −5 goes 5, then 10, then 15 semitones below the original. Negative descends, positive rises. |

#### Progressive Reverb

`reverb-progressive` · Processing → Effects

*Progressive reverb (dry→wet).*

Reverb whose mix gradually evolves from dry to wet over an adjustable fade duration.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Size | number | 50 |  | Simulated room size. |
| Start | number | 0 |  | Wet mix at start (0=dry only). |
| End | number | 50 |  | Wet mix after fade completes. |
| Fade | number | 8 s |  | Duration of the progressive fade. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the impulse-response noise. The default is FIXED: a reverb that moves to a different room on every run would be a defect. |

#### Quadrafuzz

`quadrafuzz` · Processing → Effects

*Four-band distortion: each register saturates independently.*

Four-band distortion. An ordinary distortion crushes the whole spectrum together: the low end, which carries the most energy, saturates first and smothers the rest — which is why a bass through a fuzz turns to mush. Here the signal is split into four registers by three adjustable crossover frequencies, each is saturated separately, then everything is summed. So you can bite into the mids while leaving the bass clean, or give grit to the low end without making the cymbals harsh. Measured: saturating the highs fully moves an 80 Hz tone by six thousandths, while saturating the lows multiplies its third harmonic by seventy. That independence is the whole point of the node. « High » is deliberately low by default: it is the band that makes a fuzz shrill. « Output » sits at -6 dB, because saturation raises the level and it has to be brought back. At « Mix » 0%, the original signal comes out untouched. A note on the split: it uses real filters — one lowpass, two bandpass, one highpass — so the sum of the four bands does not exactly reproduce the input, even with no saturation. A subtractive split would reconstruct perfectly but separate poorly, and separation is what one comes for.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Low | number | 60 % | 0 – 100 %, step 1 | Saturation of the low band, below the first crossover. |
| Low mids | number | 40 % | 0 – 100 %, step 1 | Saturation between the first and second crossovers. |
| High mids | number | 40 % | 0 – 100 %, step 1 | Saturation between the second and third crossovers. |
| High | number | 20 % | 0 – 100 %, step 1 | Saturation of the high band, above the third crossover. Keep it low: this is what makes a fuzz shrill. |
| Crossover 1 | number | 160 Hz | 40 – 800 Hz, step 10 | Boundary between low and low mids. |
| Crossover 2 | number | 1000 Hz | 200 – 4000 Hz, step 50 | Boundary between low mids and high mids. |
| Crossover 3 | number | 4000 Hz | 1000 – 12000 Hz, step 100 | Boundary between high mids and high. |
| Mix | number | 100 % | 0 – 100 %, step 1 | Dry/wet balance. 0% returns the original signal untouched. |
| Output | number | -6 dB | -24 – 12 dB, step 0.5 | Output gain. Saturation raises the level: this brings it back. |

#### Random Slice

`decoupe-aleatoire` · Processing → Effects

*Slices a track into equal parts and rearranges them (random, original or reverse order).*

Slices an audio track into equal parts and rearranges the slices in a chosen order. Random mode = random order, Original = original order, Reverse = reversed order. The Parts parameter sets the number of slices (2 to 64), Crossfade adds a short fade at the joints to avoid clicks, and Seed lets you reproduce the same random order (0 = new order on each run). Useful for creating rhythmic variations, glitch or remix effects.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Parts | slider | 8 | 2 – 64, step 1 | Number of equal slices the track is cut into. |
| Crossfade | slider | 5 ms | 0 – 100 ms, step 1 | Crossfade duration between slices to avoid clicks. |
| Mode | choice | Random | Random / Original / Reverse | Rearrangement order: random, original or reversed. |
| Seed | slider | 0 | 0 – 9999, step 1 | Random seed (0 = new order each run). Same seed = same slice order. |

#### Reich Phasing

`dephasage-reich` · Processing → Effects

*Lets several copies of a pattern drift apart from one another.*

Steve Reich stumbled on the process in 1965: two copies of the same tape running on two machines whose motors are not quite in step. Starting in unison, they drift slowly apart — and that drift produces patterns nobody composed. He later moved the process to instruments with "Piano Phase" (1967). What makes it fascinating is how little it costs: no note is added, no processing applied. The composite patterns, the shifting accents, the pseudo-polyrhythm are merely the consequence of a minute speed difference — the music is already entirely in the material; it just has to be offset against itself. The control is the CYCLE duration: the time after which the offset has travelled a whole loop and the voices meet again in unison. Feed it a short, clearly articulated loop — a piano figure, a rhythmic cell — and a long cycle: slowness is what makes the process hypnotic. Voices are spread across the stereo image, without which you hear mush rather than distinct voices.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | number | 60 s | 1 – 600 s, step 1 | Length of the produced sound. To hear the process complete, allow at least one full cycle. |
| Cycle | number | 60 s | 2 – 600 s, step 1 | Time after which the voices meet again in unison, the offset having travelled a whole loop. Long = imperceptible, hypnotic drift; short = a flanger-like effect, far less interesting. |
| Voices | number | 2 | 2 – 6, step 1 | Number of copies. Two is enough for the process — Reich's own version; beyond that the texture thickens and the patterns get harder to follow. |
| Stereo spread | slider | 80 % | 0 – 100 %, step 1 | Spread of the voices across the image. At 0% they pile up in the centre and you mostly hear comb filtering; at 100% each has its own place and the phasing becomes clear. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied so the source loops without a click. It SHORTENS the loop by that much, which the cycle computation accounts for. |

#### Resonance Audio

`resonance-audio` · Processing → Effects

*Binaural 3D spatialization of a sound using Resonance Audio (HRTF + room model).*

Spatializes a sound in 3D using the Resonance Audio SDK (Google). The input is mixed to mono, positioned in a 3D space with a configurable room model, and rendered as binaural stereo (HRTF). Parameters: source X/Y/Z position, room dimensions, wall material.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Source X | slider | 2 | -10 – 10, step 0.1 | Left/right position of the source (meters). |
| Source Y | slider | 0 | -10 – 10, step 0.1 | Up/down position of the source (meters). |
| Source Z | slider | 0 | -10 – 10, step 0.1 | Front/back position of the source (meters). |
| Width | slider | 20 | 1 – 100, step 0.5 | Room width (meters). |
| Height | slider | 10 | 1 – 100, step 0.5 | Room height (meters). |
| Depth | slider | 20 | 1 – 100, step 0.5 | Room depth (meters). |
| Material | choice | plaster-smooth | transparent / acoustic-ceiling-tiles / brick-bare / brick-painted / concrete-block-coarse / concrete-block-painted / curtain-heavy / fiber-glass-insulation / glass-thin / glass-thick / grass / linoleum-on-concrete / marble / metal / plywood / plaster-smooth / wood-panel | Material applied to the six room surfaces. |

#### Retrograde and Palindrome

`motif-retrograde` · Processing → Effects

*Plays a pattern backwards, or there and back.*

Plays the pattern backwards, or there and back. The retrograde is a counterpoint operation as old as the canon, and its definition is precise: the ORDER of the notes is reversed, not the notes themselves. Durations are therefore kept exactly, and the consequence is audible — a figure that ended on a long held note now opens with it. Time is turned around the pattern's own span, so the pattern does not move. « There and back » puts the pattern then its retrograde one after the other: that is the palindrome, the figure Machaut was already writing and that live-coding calls `palindrome`. « Back and there » starts with the retrograde, which makes the original pattern sound like a resolution rather than a departure. « Repeat the hinge » decides what becomes of the turning event, and the choice is offered because both stand up: C-D-E followed by its retrograde gives C-D-E-E-D-C, where the E is played twice and marks the pivot clearly; the palindrome one writes in music is C-D-E-D-C, with a single E at the top, and it flows. With the hinge dropped, the join is exact: no gap and no overlap. Chords stay struck whole on either side, and a single note is returned as is, being its own palindrome.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | There and back | Retrograde / There and back / Back and there | « Retrograde » outputs the reversed pattern only. « There and back » puts the pattern then its retrograde one after the other, giving a palindrome. « Back and there » starts with the retrograde, which makes the original pattern sound like a resolution. |
| Repeat the hinge | choice | No | No / Yes | What becomes of the turning event. C-D-E followed by its retrograde gives C-D-E-E-D-C, where the E is played twice; the palindrome one writes in music is C-D-E-D-C, with a single E at the top. Repeating marks the turn, dropping it makes it flow. No effect in « Retrograde » mode. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Reverb

`reverberation` · Processing → Effects

*Convolution reverb.*

Simulates room acoustics via convolution. Size and decay set the extent and length of the reverb tail.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Size | number | 50 % |  | Simulated room size. |
| Decay | number | 2 s |  | Reverb decay time. |
| Mix | number | 50 % |  | Dry/wet balance. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the impulse-response noise. The default is FIXED: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions. |

#### Reverse Echo

`echo-inverse` · Processing → Effects

*Reverse echo: attenuated repetitions build up before the main sound.*

Reverse echo: attenuated repetitions build up BEFORE the main sound. Principle: reverse the signal, apply a normal echo, then reverse the result. This produces a build-up of pre-echos that grow louder until the main sound hits. Adjust the time between repetitions and the feedback (number and decay of repetitions).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | slider | 350 ms | 50 – 2000 ms, step 10 | Delay time between repetitions. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Amount of signal fed back (more = more repetitions and longer build-up). |

#### Ring Modulator

`ring-modulator` · Processing → Effects

*Ring modulation (carrier multiplication).*

Multiplies the signal by a sine wave (carrier), producing sidebands — the sum and difference frequencies between the signal and the carrier. At a given carrier frequency (e.g. 200 Hz), a 440 Hz note produces components at 240 and 640 Hz. Characteristic effect of telephone rings, metallic/robotic voices and alien textures. Set the carrier frequency (1-8000 Hz) and mix (100% = effect only).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Frequency | number | 200 Hz | 1 – 8000 Hz, step 1 | Carrier frequency. Produces sum and difference frequencies (sidebands). |
| Mix | number | 100 % |  | Dry/wet balance. |

#### Risset Glissando

`glissando-risset` · Processing → Effects

*Turns a sound into a pitch that falls (or rises) endlessly.*

Auditory illusion described by Jean-Claude Risset, the continuous version of Shepard's stepped tone — the sonic equivalent of Escher's endless staircase. The node layers several copies of the input, spaced one octave apart, all gliding together; a copy reaching the top of the range has already faded out, and the one reappearing at the bottom is still inaudible, so the jump is never heard. Each copy is replayed at a varying speed, like tape: pitch and tempo change together, and the sound is looped to feed the glissando for as long as requested. Works best on rich, loosely rhythmic material — a pad, a sustained voice, coloured noise; on a strongly patterned loop you mostly hear the loop.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Falling | Falling / Rising | Perceived direction of motion. "Falling" is the classic version: the pitch seems to drop forever. |
| Mode | choice | Tape (pitch + tempo) | Tape (pitch + tempo) / Pitch only (tempo kept) | "Tape" replays the sound faster or slower, like tape: pitch and tempo glide together. This is the historical version, and the cleanest — no artefacts, since it only reads. "Pitch only" transposes with overlapping grains while leaving the tempo intact: essential on rhythmic material, at the cost of granular artefacts, the more audible the wider the transposition. |
| Duration | number | 20 s | 1 – 300 s, step 1 | Length of the produced sound. The glissando being endless, it does not depend on the source: you decide when to cut. |
| Cycle | number | 8 s | 0.5 – 60 s, step 0.5 | Time for one voice to travel one octave. Short = fast, dizzying glissando; long = slow drift, more convincing illusion. |
| Octaves | number | 6 | 3 – 10, step 1 | Range of the glissando, hence the number of layered copies (one per octave). Few octaves = thinner sound but tighter illusion; many = dense pad, heavier to compute. |
| Grain size | number | 60 ms | 10 – 200 ms, step 5 | No effect in "Tape" mode. In "Pitch only" mode, length of the transposition grains: short = snappier but choppier, long = smoother but smeary, blurring attacks. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied to make the source loop without a click. Raise it if the source has abrupt ends, lower it if the source is very short. |

#### Risset Rhythm

`rythme-risset` · Processing → Effects

*Turns a loop into a pulse that speeds up (or slows down) endlessly.*

The rhythmic twin of "Risset Glissando": the very same illusion, moved from the pitch axis to the time axis. The node layers several copies of the sound whose tempos are in a 2:1 ratio, all speeding up; a layer that has become too fast has already faded out, the one reappearing slow is still inaudible, so the jump is never heard and the acceleration seems endless. PITCH, however, does not move at all — that is what separates this from the glissando: grains are used whose anchor alone accelerates, while reading inside each grain stays at normal speed. Feed it a clear rhythmic loop (drums, a percussive pattern, an arpeggio): the illusion needs an identifiable pulse. On a continuous pad, next to nothing happens.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Speeding up | Speeding up / Slowing down | Perceived direction. "Speeding up" is the more striking version: the pulse seems to rush forward forever. |
| Duration | number | 20 s | 1 – 300 s, step 1 | Length of the produced sound. The acceleration being endless, you decide when to cut. |
| Cycle | number | 10 s | 1 – 60 s, step 0.5 | Time for one layer to DOUBLE its tempo. Short = dizzying rush; long = slow drift, more convincing illusion. |
| Layers | number | 5 | 3 – 8, step 1 | Number of layered copies, hence the tempo range (each layer runs twice as fast as the previous one). Few layers = clearer rhythm; many = dense texture, heavier to compute. |
| Grain size | number | 60 ms | 10 – 200 ms, step 5 | Grain length. Short = attacks better preserved but choppier; long = smoother but attacks get smeared — worth watching on percussive material. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied to make the source loop without a click. Raise it if the source has abrupt ends. |

#### Sample Formula

`formule-echantillons` · Processing → Effects

*Applies a mathematical expression to each sample of the signal.*

Applies a mathematical expression to each sample of the signal. Variables: x (current value), t (time in s), i (index), c (channel), ch (channel count), sr (sample rate). For example, y = x * 0.5 halves the volume; y = sin(t * 2 * pi * 440) + x adds a 440 Hz sine. The output is clamped to [-1, 1] to avoid out-of-range signals, then scaled by the Volume parameter. Be careful with your system volume before listening to high-intensity results.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Formula | text | `sin(t * 2 * pi * 440) + x` |  | Mathematical expression giving the output value of each sample. Variables: x (current value), t (time in seconds), i (sample index), c (channel), ch (channel count), sr (sample rate). |
| Volume | number | 30 % | 0 – 100 % | Output gain. |

#### Scanned Synthesis

`synthese-scanning` · Processing → Effects

*Reads the shape of a slowly moving mechanical object as a wavetable: the timbre evolves endlessly while the note stays in tune.*

Scanned synthesis, after Bill Verplank, Max Mathews and Rob Shaw (CCRMA, 2000). The idea is strange and fits in two sentences. A mechanical object is simulated — here a chain of masses joined by springs, closed into a ring — at a SLOW rate, a few hundred steps per second, so that its motion is on the scale of a gesture: a few hertz, like a string filmed in slow motion. Then the SHAPE of that object is read, mass by mass, as a wavetable, at whatever audio frequency one wants to hear. The consequence is the whole point: pitch and timbre are entirely separate. The pitch depends only on the scanning speed, the waveform only on the mechanics, and it therefore evolves continuously, never repeating, while the note stays in tune. No ordinary wavetable oscillator does this, since its table is frozen — and one can check that here by setting the tension to zero: the chain freezes and an ordinary oscillator is exactly what comes back. Max Mathews, who wrote the first synthesis program in 1957, saw scanning as the culmination of his search for a living timbre without samples. Nothing sustains the motion: it is therefore the initial EXCITATION that decides the whole sound, like the way a string is plucked, and « Plucked » gives displacement without velocity where « Struck » gives velocity without displacement. One implementation detail that was audible: the table is interpolated in time between two mechanical steps, without which it changed all at once and rang at the simulation rate — measured, an A 110 was dominated by a 1 kHz component that was nothing but that artefact.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | text | `A2` |  | Note read when no MIDI is connected. The pitch depends only on the scanning speed, never on the mechanics. |
| Masses | number | 64 | 4 – 256, step 1 | Number of masses in the chain, hence of points in the wavetable. Few masses give an angular shape and a rich sound; many give a smooth one. |
| Rate | number | 800 /s | 20 – 4000 /s, step 10 | Speed of the mechanical simulation. It does not change the note: it changes how fast the timbre evolves. |
| Tension | number | 50 % | 0 – 100 %, step 1 | Stiffness of the springs between neighbours: it makes the waves travel along the chain, hence the speed of the shape changes. At zero the shape is frozen and one gets an ordinary wavetable oscillator. |
| Centering | number | 30 % | 0 – 100 %, step 1 | Force pulling each mass back to rest. It gives the chain a slow natural frequency, hence a cycle to the timbre. |
| Damping | number | 10 % | 0 – 100 %, step 1 | At zero the motion never stops and the timbre evolves forever. At maximum the chain freezes almost at once and the sound becomes stable. |
| Excitation | choice | Plucked | Plucked / Struck / Noise / Two humps | The shape given to the chain at the start. Nothing sustains it afterwards: it therefore decides the whole sound, like the way a string is plucked. « Struck » gives velocity without displacement, « Plucked » displacement without velocity. |
| Force | number | 100 % | 1 – 100 %, step 1 | Excitation amplitude. |
| Duration | number | 4 s | 0.2 – 20 s, step 0.1 | Duration produced, when no MIDI is connected. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Serial Operations

`serie-dodecaphonique` · Processing → Effects

*Plays a row's four forms — original, retrograde, inversion, retrograde inversion — and writes its matrix.*

Plays a row's four forms and writes its matrix. Twelve-tone writing is a calculating technique before it is an aesthetic: a row of the twelve pitches, and four transformations — original, retrograde, inversion, retrograde inversion — each transposable onto twelve levels, so forty-eight forms drawn from a single material. Schoenberg, Webern and Berg wrote them out by hand in a twelve-by-twelve grid; that grid is what the text output gives, labelled P and I, with the retrogrades read backwards. It can be checked at a glance the way it was taught: the first row is the series, the first column its inversion, and the diagonal never changes. None of this is reserved for serialism — retrograding and inverting a motif are counterpoint operations as old as the canon, and the node accepts a sequence of any length. It merely states, in passing, whether what it was given is a REAL row: twelve distinct classes. « Register » decides how the resulting classes are played: « Closest » takes for each note the octave nearest the previous one, and one hears a line — which is how a row is actually played, the octaves being free; « One octave » stacks everything above the starting note, and one hears the order of the classes. The default row is that of Berg's Violin Concerto, built from alternating thirds that make it almost tonal.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Matrix | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Row | text | `G Bb D F# A C E G# B C# D# F` |  | The row, as note names or numbers from 0 to 11, separated by spaces. The default is the row of Berg's Violin Concerto. A MIDI file on the input wins: its pitches are read in order. |
| Form | choice | Original | Original / Retrograde / Inversion / Retrograde inversion / All four in turn | The transformation played. « All four in turn » chains the four forms, which makes audible at once what the matrix shows. |
| Transposition | number | 0 | 0 – 11, step 1 | Transposition level of the played form, in semitones. With the forty-eight combinations of form and level, one has everything a row allows. |
| Register | choice | Closest | Closest / One octave | « Closest » picks, for each note, the octave nearest the previous one, which makes a line audible; « One octave » stacks everything above the starting note, which makes the order of the classes audible. |
| Starting note | number | 60 | 24 – 96, step 1 | MIDI pitch the row is placed around. |
| Note length | number | 0.3 s | 0.05 – 2 s, step 0.05 | Length of each note of the row. |
| Velocity | number | 90 | 1 – 127, step 1 | Note strength. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Shakers

`secoueurs` · Processing → Effects

*Shaken percussion — maracas, cabasa, tambourine, sleigh bells — from a stochastic particle model.*

Shaken percussion from a stochastic particle model. Perry Cook posed the problem the opposite way round to ordinary synthesis: for a maraca one could solve the motion of every seed in the gourd — and he did — but the result is too heavy and, above all, useless, because the ear does not hear trajectories, it hears a STATISTIC. So from his simulations he kept only two numbers: the probability that a collision occurs at a given instant, and the rate at which the system's energy falls. That is PhISEM (« Physically Informed Stochastic Event Modeling », 1996-97), and it fits in fifteen lines. The model has three stages: energy rises with each shake and falls back, a collision occurs with a probability proportional to that energy and to the number of particles, and the burst of noise it deposits passes through resonators, which are the only thing that really tells one instrument from another. « Energy » therefore does not set the volume: the greater it is, the likelier the collisions, hence the denser the grain — it is a physical parameter, not a gain. « Particles » is the setting that turns a countable rattle into a continuous hiss: measured, the cabasa produces more than five times a maraca's collisions at equal energy, and that is all that separates them. A MIDI file on the input turns each note into a shake whose velocity becomes the energy. With a fixed seed the sound replays identically, which no real tambourine does and which a graph you re-run needs.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Maracas | Maracas / Cabasa / Shekere / Tambourine / Sleigh bells / Water drops | The instrument. What really tells them apart is the number of particles — a few seeds in a maraca, hundreds of beads on a cabasa — and the resonances: the maraca rings around 3 kHz, sleigh bells add metallic modes around 5 and 6 kHz. |
| Shakes | number | 4 /s | 0.5 – 16 /s, step 0.5 | Shakes per second, when no MIDI is connected. A MIDI file wins: each note becomes a shake, and its velocity sets the energy. |
| Energy | number | 50 % | 0 – 100 %, step 1 | Strength of each shake. It does not only set the volume: the more energy, the likelier the collisions, hence the denser the grain. |
| Particles | number | 0 | 0 – 512, step 1 | Overrides the instrument's particle count. 0 = the instrument's own. This is the setting that turns a countable rattle into a continuous hiss. |
| Duration | number | 4 s | 0.2 – 30 s, step 0.1 | Duration produced, when no MIDI is connected. |
| Seed | number | 0 | 0 – 999999, step 1 | 0 = drawn at random on every run, and shown in the message. Any other value replays the exact same sound — which no real tambourine does, and which is needed here. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Sinusoids + Noise (SMS)

`sms-sinusoides-bruit` · Processing → Effects

*Tracks a sound's partials and sets the rest aside: transpose the harmony without touching the breath.*

Tracks a sound's partials, and sets all the rest aside. After Xavier Serra and Julius O. Smith III, « Spectral Modeling Synthesis: A Sound Analysis/Synthesis System Based on a Deterministic plus Stochastic Decomposition », Computer Music Journal 14(4), 1990; the partial tracking and additive resynthesis follow Robert McAulay and Thomas Quatieri, IEEE Transactions on Acoustics, Speech and Signal Processing 34(4), 1986. The idea: a sound consists of a DETERMINISTIC part — partials, each with its own evolving frequency and amplitude — and a STOCHASTIC part, the rest: a flute's breath, a violin's bow, a piano's attack noise. Separating them allows transforming them SEPARATELY, and that is the whole point: transposing the partials without touching the breath, making an instrument breathier without detuning it by a hundredth of a tone, removing the noise without dulling the harmony. No phase vocoder allows this, because it does not know what a partial is — it only knows bins. Attic transposed and stretched blindly, reconstructed lost phase, separated what lasts from what strikes; none of those nodes TRACKED a partial through time. Three things are worth knowing. EACH PEAK'S FREQUENCY is refined by parabolic interpolation between bins: without it the resolution would be twenty-one hertz at 2048 points, and an A 440 would read as 431 or 452 — the transposition would be wrong. PROMINENCE is what separates a partial from a noise bump, and such a criterion is needed: persistence does not suffice, since neighbouring frames share three quarters of their samples, so a noise bump « persists » too — measured before this criterion, 55 % of white noise passed for deterministic. Finally, TWO RESYNTHESIS PATHS coexist and do not serve the same purpose: without transposition the partials are CUT OUT of the sound itself by complementary masks, so that partials plus residual give back the original sample for sample — this is tested; as soon as one transposes, they are REBUILT by adding oscillators whose phase is integrated rather than restarted, and rescaled onto the energy of those they replace. The residual is never rebuilt: it is kept as it is.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Partials | audio |  |
| output | Residual | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Transpose | slider | 0  st | -24 – 24  st, step 1 | Transposes the PARTIALS only. The residual — breath, bow, attack noise — knows nothing of it and stays where it is: that is what no pitch shifter can do, and it is the whole point of the model. As soon as it is non-zero, the partials are rebuilt by adding oscillators rather than cut out of the original sound. |
| Partials gain | slider | 100 % | 0 – 200 %, step 5 | Level of the deterministic part. At zero, only the breath remains — an instrument without a note. |
| Residual gain | slider | 100 % | 0 – 200 %, step 5 | Level of the stochastic part. At zero, the sound becomes pure additive synthesis, smooth and grainless; beyond a hundred, the instrument gets breathier without detuning by a hundredth of a tone. |
| Threshold | slider | 60  dB | 20 – 90  dB, step 5 | Decibels below each frame's strongest peak under which a maximum is not considered. Low, only dominant partials are tracked; high, weaker ones too, at the risk of taking noise for a partial. |
| Prominence | slider | 12  dB | 0 – 30  dB, step 1 | Minimum height of a peak above the median of its neighbourhood. This is what separates a partial from a noise bump, and one is needed: persistence does not suffice, since neighbouring frames share three quarters of their samples. At zero, white noise passes for half harmonic. |
| Max partials | slider | 60 | 10 – 120, step 5 | Number of peaks kept per frame, strongest first. |
| Window | choice | 2048 | 1024 / 2048 / 4096 | Transform size. Large separates neighbouring partials better but smears attacks; small does the opposite. |

#### Slide Stretch

`etirement-glissant` · Processing → Effects

*Time-stretch with a factor that gradually changes from start to end.*

Time-stretch with a factor that gradually changes from start to end. Creates a continuous acceleration or deceleration effect ("slide"). Set the start and end factors (0.25x to 4x): e.g. start=1 (normal) and end=4 (slow) creates a gradual slowdown. The algorithm slices the signal into segments, applies a phase vocoder with an interpolated factor, and rejoins segments with a crossfade.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Start | slider | 1 x | 0.25 – 4 x, step 0.05 | Stretch factor at the start (0.25 = 4x faster, 1 = normal, 4 = 4x slower). |
| End | slider | 2 x | 0.25 – 4 x, step 0.05 | Stretch factor at the end. |

#### SoundTouch Pitch

`soundtouch-tonalite` · Processing → Effects

*Changes pitch while preserving duration (quality pitch-shift).*

Transposes audio pitch while preserving duration, using the SoundTouch algorithm (advanced phase vocoder). Higher-quality alternative to the native « Pitch Change » node, especially on voice.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch | number | 0 st | -12 – 12 st, step 0.5 | Pitch shift in semitones. 0 = original, +12 = one octave up, -12 = one octave down. |

#### SoundTouch Rate

`soundtouch-rate` · Processing → Effects

*Changes playback rate (tempo + pitch together), like a tape player.*

Changes audio playback rate (tempo + pitch together), like a tape player or sampler. Uses the SoundTouch algorithm. At 2×, the track lasts half as long and sounds one octave higher.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | number | 1 x | 0.25 – 4 x, step 0.01 | Overall playback rate. 1 = original, 2 = 2x faster and higher, 0.5 = 2x slower and lower. |

#### SoundTouch Tempo

`soundtouch-tempo` · Processing → Effects

*Changes tempo while preserving pitch (quality time-stretch).*

Changes audio tempo while preserving pitch, using the SoundTouch algorithm (advanced phase vocoder). Higher-quality alternative to the native « Tempo Change » node, especially on voice and harmonic signals.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 1 x | 0.25 – 4 x, step 0.01 | Tempo factor. 1 = original, 2 = 2x faster, 0.5 = 2x slower. |

#### Spectral Formula

`formule-spectrale` · Processing → Effects

*Modifies the signal spectrum by mathematical expressions on magnitude and phase.*

Modifies the signal spectrum by mathematical expressions applied to each frequency bin. Variables: mag (current magnitude), phase (current phase), freq (frequency in Hz), bin (bin index), N (FFT size), sr (sample rate). For example, mag * 2 doubles the spectral gain; mag * (freq > 1000) keeps only frequencies above 1 kHz. Uses STFT with overlap-add. Use the Volume parameter to adjust the output level. Output is clamped to [-1, 1] to avoid out-of-range signals; be careful with your system volume before listening to high-intensity results.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Magnitude | text | `mag * 2` |  | Expression for the magnitude of each spectral bin. Variables: mag, phase, freq (Hz), bin, N (FFT size), sr. |
| Phase | text | `phase + 0.5` |  | Expression for the phase of each bin (leave empty to leave unchanged). Example: phase + 0.5 shifts the phase by 0.5 radian. Variables: mag, phase, freq, bin, N, sr. |
| Volume | number | 30 % | 0 – 100 % | Output gain. |
| FFT | number | 2048 samples | 64 – 8192 samples, step 64 | FFT size (rounded up to next power of 2). |

#### Statistical Texture

`texture-statistique` · Processing → Effects

*Generates a new texture with the statistics of a given sound — rain, fire, crowd — without copying a single sample of it.*

Generates a NEW texture having the statistics of a given sound. After Josh H. McDermott and Eero P. Simoncelli, « Sound Texture Perception via Statistics of the Auditory Periphery: Evidence from Sound Synthesis », Neuron 71(5), 2011. The paper's thesis, which is what is implemented here: a texture — rain, fire, crowd, applause — is recognised by TIME-AVERAGED STATISTICS, measured on a decomposition of the sound such as the ear performs. Two recordings of rain share no sample; what they share are those numbers. Hence the procedure: measure a sound's statistics, then build a new noise that respects them. What this brings to Attic, which already freezes and mosaics: granular freeze LOOPS a grain, corpus mosaicing COPIES grains, and the ear always ends up hearing the loop. Here nothing is copied — the output contains no sample of the input, and it can last indefinitely without repeating. The requested duration therefore bears no relation to the model's: five seconds of rain produce two minutes. WHAT IS IMPOSED, AND WHAT IS NOT, because the honest part matters here. Imposed: the complete distribution of each band's envelope — hence its mean, variance, skewness, kurtosis and every following moment, obtained by rank transport rather than by fitting the first four — and the correlations between bands. The paper shows that the former alone do not suffice and that the latter are what tip the result towards something recognisable; this is checked here by a test measuring both cases, and the statistical distance to the model falls from 40 % to 31 % when the correlations are imposed. Not imposed: the paper's C1 and C2 modulation correlations, which require a second filterbank on the envelopes — their absence is heard mostly on very rhythmic textures, where regularity is lost. Finally the paper loops analysis and synthesis by gradient descent, where this node imposes the statistics in the envelope domain by alternating projections and then reconstructs once: two orders of magnitude faster, and the remaining distance is displayed rather than hidden. One last detail that matters: each channel gets its own seed, so both sides share the statistics without sharing a sample — the texture is wide of itself, which no stereo widener gives.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | slider | 10 s | 1 – 120 s, step 1 | Duration to generate. It bears no relation to the model's: the statistics are time averages, so five seconds of rain produce two minutes that never repeat. |
| Bands | choice | 20 | 16 / 20 / 28 | Number of cochlear bands, spaced as the ear hears them — narrow in the bass, wide in the treble. The more there are, the more closely the model's colour is followed, and the longer the computation: the cost of the correlations grows with their square. |
| Correlations | choice | Yes | Yes / No | Also impose the correlations between bands, not merely each band's distribution. This is the paper's central result: bands taken in isolation do not make a recognisable texture. Measured here on a synthetic rain, the statistical distance to the model falls from 40 % to 31 % when they are imposed. Setting « No » mostly serves to hear the difference. |
| Iterations | slider | 6 | 1 – 20, step 1 | Rounds of alternating projections between distributions and correlations: imposing one spoils the other, and one alternates until both roughly hold. Beyond about ten, the gain becomes imperceptible and the computation doubles. |
| Seed | number | 1 | 1 – 999999, step 1 | Seed of the starting noise. Two seeds give two different textures with the same statistics — which is exactly what two recordings of the same rain are to each other. |

#### Stereo Delay

`delay-stereo` · Processing → Effects

*Independent left/right delay.*

Repeats the signal with an independently adjustable left/right delay, creating a stereo echo. Feedback sets the number of repeats.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time L | number | 250 ms |  | Left channel delay. |
| Time R | number | 375 ms |  | Right channel delay. |
| Feedback | number | 40 % |  | Amount of signal fed back. |
| Mix | number | 35 % |  | Dry/wet balance. |

#### Stereo Spatialization

`spatialisation-stereo` · Processing → Effects

*Positions the sound in stereo space (left/right).*

Positions a mono or stereo sound in stereo space. Uses an HRTF PannerNode for realistic binaural spatialization. Position (-100% to 100%) controls left/right, Width (0% to 100%) controls the effect range. Useful for placing an instrument in a mix or creating a spatial movement effect.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Position | slider | 0 % | -100 – 100 %, step 1 | Stereo position (-100% = left, 0% = center, 100% = right). |
| Width | slider | 100 % | 0 – 100 %, step 1 | Spatial width (0% = mono, 100% = full spatialization). |

#### Stereo Width / MS

`largeur-stereo` · Processing → Effects

*Adjusts stereo width and Mid level.*

Stereo width and Mid/Side balance control. Decodes the signal into center (Mid = L+R) and sides (Side = L-R), adjusts their gain, then re-encodes to L/R. Width = 0% gives mono, 100% preserves the original stereo image, 200% widens it. The Mid parameter lets you boost or cut the center independently (useful to make room for a vocal or kick).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Width | number | 100 % | 0 – 200 %, step 1 | Stereo width. 0% = mono, 100% = original, 200% = widened stereo. |
| Mid | number | 100 % | 0 – 200 %, step 1 | Mid channel gain. |

#### Sung Vowel (FOF)

`voyelle-fof` · Processing → Effects

*Synthesises a vowel from its formants, after Peterson and Barney's table: pitch and timbre never touch.*

Sung vowel by formant synthesis. A vowel is not a waveform, it is a configuration of RESONANCES: the vocal tract is a tube whose geometry the tongue and lips change, and that geometry places three or four bumps in the spectrum — the formants. They, and they alone, tell an A from an I; the pitch of the voice plays no part, which is exactly why the same vowel is recognisable sung low or high. Xavier Rodet proposed in 1984, with IRCAM's CHANT program, to synthesise this directly: instead of filtering a source, the formants' impulse responses are ADDED. Each formant produces a burst — a sinusoid at its frequency under an envelope that rises fast and decays according to its bandwidth — and all these bursts are retriggered at every period of the fundamental; they overlap, and that overlap is what makes the continuous resonance. This is FOF, « Fonction d'Onde Formantique ». The consequence is the one wanted: changing the note does not move the formants, where transposing a voice sample carries them along and gives the famous « Chipmunk » effect. The « Tract size » control does precisely the opposite: it moves the formants without touching the note, which amounts to changing the singer's size. The frequencies used are Peterson and Barney's (1952), the most cited table in phonetics, measured on men's voices. « Jitter » is what stops the result sounding like an organ: a real voice is never exactly periodic, and a few thousandths of variation from one period to the next are enough to make it alive.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Vowel | choice | A (father) | A (father) / E (bed) / I (beet) / O (bought) / U (boot) / AE (bat) / ER (bird) | The vowel, that is, the position of its first three formants. A has a high first formant and a low second (730 and 1090 Hz), I the opposite (270 and 2290): the sharpest contrast in the table. |
| Note | text | `A2` |  | Sung pitch when no MIDI is connected. The formants do not move with it — the whole difference from a transposed sample, which carries its formants along and gives a cartoon voice. |
| Attack | number | 3 ms | 0.5 – 20 ms, step 0.5 | Rise time of the formant bursts. Short, it spreads the formants towards the highs and hardens the voice; long, it softens it. |
| Formant width | number | 100 % | 20 – 400 %, step 5 | Multiplies the bandwidths. Narrowed, the resonances ring and sound artificial; widened, the voice becomes breathy. |
| Tract size | number | 0 st | -12 – 12 st, step 1 | Shifts all formants together, which amounts to changing the size of the vocal tract: upwards gives a child's voice, downwards a giant's — without touching the sung note. |
| Vibrato | number | 20 % | 0 – 100 %, step 1 | Depth of the pitch vibrato. |
| Vibrato rate | number | 5.5 Hz | 1 – 12 Hz, step 0.1 | Vibrato speed. An operatic singer sits around 5 to 6 Hz. |
| Jitter | number | 15 % | 0 – 100 %, step 1 | Random variation of the period from one period to the next. It is what stops the voice sounding like an organ: a real voice is never exactly periodic. |
| Duration | number | 3 s | 0.2 – 20 s, step 0.1 | Duration produced, when no MIDI is connected. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed of the jitter. 0 = drawn at random on every run. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Swap Channels

`echange-canaux` · Processing → Effects

*Swaps left/right channels.*

Swaps the left and right channels of a stereo signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Temperament

`temperament` · Processing → Effects

*Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament.*

Replays a MIDI file in a tuning other than equal temperament, and renders it to audio. Every other node in Attic plays in equal temperament: twelve rigorously identical semitones, which sound in tune nowhere but equally out of tune everywhere. That is neither natural nor ancient — it is a compromise generalised in the 19th century. Seven tunings are offered, from just intonation (exact 5/4 third and 3/2 fifth, a purity no piano gives, but the neighbouring key becomes unusable) to Renaissance quarter-comma meantone, by way of Werckmeister III, Kirnberger III and Vallotti, where every key is playable without any two sounding alike — it is those tunings that give « The Well-Tempered Clavier » its title, well-tempered not meaning equal. « Tonic » picks the note the tuning is built on: that one sounds pure, and distant keys drift the further away. The text output lists the twelve deviations from equal temperament, in cents. The node outputs AUDIO rather than MIDI, deliberately: a MIDI file cannot carry a pitch in cents without per-channel pitch bend, which not every player honours. Here the pitches become fractional and the renderer — FM or SoundFont — plays them exactly.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | Deviations | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperament | choice | Just intonation | Equal / Pythagorean / Just intonation / Quarter-comma meantone / Werckmeister III / Kirnberger III / Vallotti | The tuning used. « Equal » is the one every other node uses; the others give each key its own colour. |
| Tonic | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | The note the temperament is tuned on. It is the one that sounds pure; distant keys drift the further away. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Tempo Canon (Nancarrow)

`canon-nancarrow` · Processing → Effects

*Layers a pattern against itself at a fixed tempo ratio.*

After Conlon Nancarrow's "Studies for Player Piano". He wrote for player piano because no performer could play what he wanted to hear: the same pattern layered against itself at fixed tempo ratios — 3:4, 5:7, then, in the late studies, IRRATIONAL ratios. The difference from Reich's phasing is not one of degree but of kind, and it is arithmetic. Reich drifts two copies at almost identical speeds, and the voices meet again periodically. Nancarrow fixes a plain ratio, heard at once as two distinct tempos: if that ratio is rational the canon CLOSES — the voices coincide regularly and a stable composite pattern emerges; if it is irrational it NEVER closes, which is exactly what Nancarrow was after. The node's message tells you after how long the coincidence occurs, or that it will not. Feed it a clear rhythmic loop: two tempos only separate over an identifiable pulse.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Ratio | choice | 3:2 | 3:2 / 4:3 / 5:4 / 7:5 / √2 : 1 / Golden ratio / π : e | Ratio between the tempos. The first four are rational: the canon closes the sooner the smaller the denominator. The last three are irrational: the canon never closes, the voices only ever coinciding approximately and without return. |
| Voices | number | 2 | 2 – 5, step 1 | Number of copies. Each extra voice raises the ratio by one more power: three voices at 3:2 give tempos 1, 1.5 and 2.25. |
| Duration | number | 30 s | 1 – 300 s, step 1 | Length of the produced sound. To hear a rational canon close, allow at least one coincidence period — the message states it. |
| Stereo spread | slider | 80 % | 0 – 100 %, step 1 | Spread of the voices across the image. Without it, two superposed tempos in the centre become hard to tell apart. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade so the source loops without a click. It shortens the loop by that much, which the coincidence period accounts for. |

#### Tempo Change

`changement-tempo` · Processing → Effects

*Time-stretch via phase vocoder.*

Speeds up or slows down the track while preserving pitch (phase vocoder). Duration changes inversely to speed.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo (%) | number | 100 % | 25 – 400 %, step 5 | Target tempo. 100=normal, 50=half, 200=double. |
| Window | number | 50 ms |  | Analysis window size. |

#### Thin Out

`motif-eclaircir` · Processing → Effects

*Removes a share of the notes at random, reproducibly.*

Removes a share of the notes at random, but reproducibly. This is live-coding's « degrade », and it serves to lighten an over-dense texture without choosing the notes to sacrifice oneself — a loop of sixteen sixteenths played at 70 % becomes an irregular figure that keeps its shape. Two precautions set it apart from a plain draw. The draw is per EVENT, not per note: a chord leaves whole or stays whole, thinning must not undo the harmony. And « Keep beats » spares whatever lands on a beat, because a texture thinned purely at random loses its pulse: one usually wants it lighter, not dissolved. « Beat length » says what counts as a beat, in seconds — at 120 BPM, a quarter note is 0.5 s. With a fixed seed, the same thinning replays identically: a result found pleasing can be found again, which is why the randomly drawn seed is shown in the message so it can be copied back.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Amount | number | 30 % | 0 – 100 %, step 1 | Share of events removed. The draw is per event, not per note: a chord leaves whole or stays whole. |
| Keep beats | choice | Yes | No / Yes | Spares the events that land on a beat. A texture thinned purely at random loses its pulse; one often wants to lighten it without dissolving it. |
| Beat length | number | 0.5 s | 0.05 – 4 s, step 0.05 | What counts as a beat, in seconds. At 120 BPM, a quarter note is 0.5 s. |
| Seed | number | 0 | 0 – 999999, step 1 | 0 = drawn at random on every run, and shown in the message. Any other value replays the exact same thinning. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Tonnetz

`tonnetz` · Processing → Effects

*Chains chords through the three neo-Riemannian transformations P, L and R, each moving a single voice.*

Chains chords through the neo-Riemannian transformations. Hugo Riemann drew, at the end of the 19th century, a network in which major and minor triads form adjacent triangles — the Tonnetz — and Richard Cohn turned it in the 1990s into an analytical tool for music where chords follow one another without tonality explaining them: Wagner, Liszt, late Schubert, and by extension much film music. Everything rests on three operations, and each moves A SINGLE VOICE. P swaps major and minor on the same root by moving the third a semitone: C major becomes C minor. L moves by a semitone the note not belonging to the neighbouring chord: C major becomes E minor. R moves by a whole tone: C major becomes A minor. This is called parsimonious voice leading, and it is why these progressions sound connected although they have no tonal relation — between two neighbouring chords, two notes out of three do not move at all. The node places the voices so that this can be HEARD: without it, root-position chords would jump from one end of the keyboard to the other and the parsimony would stay theoretical. The « Path » mode finds the shortest route between two chords, which gives a distance no tonal analysis provides: measured over the 576 pairs of triads, any two chords are at most five operations apart. C major and G sharp minor, which share no note, are only three apart — the hexatonic pole, and exactly the kind of neighbourhood the Tonnetz reveals and the circle of fifths hides.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Path | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Starting chord | text | `C` |  | The chord to start from: « C » for C major, « Am » for A minor, « F#m » for F sharp minor. A MIDI file on the input wins, and its first triad is used as the start. |
| Mode | choice | Sequence of operations | Sequence of operations / Path to a chord | « Sequence » applies the operations written out. « Path » finds the shortest route to the destination chord: the distance measure proper to Riemann's space, which no tonal distance gives. |
| Operations | text | `PLRLPR` |  | The operations to apply, in order. P swaps major and minor on the same root, L and R lead to the neighbouring chords. « PLPLPL » walks the hexatonic cycle and returns to the start. |
| Destination chord | text | `G#m` |  | In « Path » mode, the chord to reach. C major and G sharp minor share no note and are yet three operations apart: the hexatonic pole. |
| Chord length | number | 1 s | 0.1 – 4 s, step 0.1 | Length of each chord. |
| Base note | number | 60 | 36 – 84, step 1 | Pitch the chords are placed around. The voices then follow the shortest path, which is what makes the parsimony audible. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Torus

`tore` · Processing → Effects

*Rotates the sound's position and level at two speeds: they only meet again at lap q, or never.*

Sends the sound around a torus, the product of two circles, along which it moves at two speeds. First circle, position: the stereo image turns one full revolution per lap — left, centre, right, centre, left — one lap lasting the whole sound. Second circle, level: the sound mixes with a version of itself whose phase rotates, so the whole level breathes, full then silent then full. The Ratio sets the level's speed relative to the position. With p:q, the two circles only fall back into place together at lap q: 2:3 at the third, 5:8 at the eighth. The Golden ratio never closes — it comes near its start at Fibonacci numbers, 5, 8, 13 laps. The message says whether the trajectory closed, or at which lap and by how many degrees it came closest. A mono sound is placed on an edge so it can turn. Best on headphones. Output is limited to 20 minutes.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Ratio | choice | 2:3 | 1:1 / 1:2 / 2:3 / 3:5 / 5:8 / Golden ratio | Speed of the level circle relative to the position circle. p:q closes at lap q: 2:3 at the third, 5:8 at the eighth. The golden ratio never closes; it comes close to its start at Fibonacci numbers (5, 8, 13…). |
| Laps | number | 3 | 1 – 13, step 1 | Number of laps; one lap lasts the whole sound. Pick a multiple of q to hear the trajectory close. |
| Depth | number | 100 % | 0 – 100 %, step 1 | Amplitude of the level circle. 100%: the sound fades out completely at the circle's trough. 0%: the level no longer moves, only the position rotation remains. |
| Crossfade | number | 30 ms | 0 – 500 ms, step 5 | Crossfade at each seam between two laps, so a sound that does not loop does not click. Capped at a quarter of the sound's length. |

#### Transient Shaper

`transient-shaper` · Processing → Effects

*Independent attack and sustain control.*

Independent control of a sound's attack and sustain. Two envelope detectors (fast for attacks, slow for the body) let you boost or cut transients and sustain separately. Essential for adding punch to drums or shortening an overly long snare.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Attack | number | 0 dB | -12 – 12 dB, step 0.5 | Gain applied to transient attacks. Positive = more punch; negative = less aggressive. |
| Sustain | number | 0 dB | -12 – 12 dB, step 0.5 | Gain applied to the sustain body. Positive = more sustain; negative = shorter. |
| Attack time | number | 1 ms | 0.1 – 50 ms, step 0.1 | Transient detector reaction time. |
| Sustain time | number | 100 ms | 10 – 500 ms, step 1 | Sustain detector reaction time. |

#### Tremolo

`tremolo` · Processing → Effects

*Amplitude modulation (periodic volume variations).*

Amplitude modulation: varies the volume periodically. Adjust the rate (vibration speed, 0.1 to 20 Hz), depth (intensity, 0 to 100%) and waveform shape (sine, square, triangle, sawtooth). A classic effect for guitars and organs.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation rate (vibrations per second). |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Modulation depth (0% = no effect, 100% = volume fully cut). A curve connected to the Modulation input takes over: that is how one gets a tremolo whose depth follows a logistic sequence, without needing a separate node for it. |
| Modulation min | slider | 0 % | 0 – 100 %, step 1 | Depth that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 100 % | 0 – 100 %, step 1 | Depth that the curve's one means. |
| Shape | choice | Sine | Sine / Square / Triangle / Sawtooth | LFO waveform shape. |

#### Velvet Reverb

`reverberation-velours` · Processing → Effects

*Reverb with a free-form tail: exponential like a room, linear, swelling, or two-sloped.*

Late reverberation whose tail takes whatever shape one wants. After Vesa Valimaki, Bo Holm-Rasmussen, Benoit Alary and Heidi-Maria Lehtonen, « Late Reverberation Synthesis Using Filtered Velvet Noise », 2017; and for the arbitrary decay, Jon Fagerstrom, Nils Meyer-Kahlen, Sebastian J. Schlecht and Vesa Valimaki, « Dark Velvet Noise », DAFx-22, then « Non-Exponential Reverberation Modeling Using Dark Velvet Noise », 2024. VELVET NOISE is a SPARSE noise: one plus-or-minus-one impulse per regular interval, placed at random within that interval, and nothing in between. At fifteen hundred impulses per second the ear no longer hears separate impulses but a wash — and a SMOOTHER wash than a Gaussian noise of the same density, because no impulse is louder than another. That is what makes it a good late reverberation, and also why lowering the density below a thousand becomes an effect in itself: the impulses are then heard one by one. What this node adds to the four reverbs already present fits in one phrase: the tail need not be an exponential. Convolution requires an impulse response FILE; the other three decay exponentially, because that is what a room does. Here the decay is a curve one chooses. Exponential like a room. Linear, falling in a straight line — no room does that. SWELLING, where the sound grows and stops dead, otherwise obtainable only by reversing a recording. Or TWO-SLOPED, the signature of coupled rooms: a church and its chapel, a stage and its tower, where the small room dies fast and the large one takes over. Darkening makes the treble die before the bass, as every room does: without it the tail stays bright and sounds like a noise wash glued onto the sound rather than a space. The Impulse response output returns the response itself, to feed the convolution reverb or simply to look at. Finally, on computation and to be exact: the paper praises a convolution WITHOUT MULTIPLICATION, the impulses being plus or minus one, which is decisive in real time. Here the processing is offline and the convolution goes through a Fourier transform, faster still at this length. What is kept from velvet is therefore not its thrift but its texture and the freedom of its decay.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Impulse response | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Profile | choice | Exponential | Exponential / Linear / Swell / Coupled rooms | Shape of the tail. The exponential is what a room does. The linear falls in a straight line, which none does. The swell RISES and stops dead — otherwise obtainable only by reversing a recording. Coupled rooms chain two slopes, the signature of a room containing another: a church and its chapel, a stage and its tower. |
| Length | slider | 2 s | 0.2 – 8 s, step 0.1 | Length of the tail. Beyond the sixty-decibel drop it adds nothing but silence. |
| Decay | slider | 1.5 s | 0.2 – 8 s, step 0.1 | Time to fall sixty decibels — the acousticians' RT60. No effect on the linear profile, which holds for the whole length. |
| Density | slider | 1500 /s | 200 – 4000 /s, step 100 | Impulses per second. Above a thousand, the ear no longer hears separate impulses but a smooth wash — smoother than a Gaussian noise of the same density, since no impulse is louder than another. Below, they are heard one by one, which is an effect in itself. |
| Darkening | slider | 25 % | 1 – 100 %, step 1 | How much the treble dies before the bass. A hundred leaves the tail bright, which sounds like a noise wash glued onto the sound; twenty-five gives an ordinary room. |
| Knee | slider | 30 % | 5 – 95 %, step 5 | For coupled rooms only: at what point in the tail the second slope takes over. |
| Mix | slider | 35 % | 0 – 100 %, step 1 | Share of reverberated sound in the output. |
| Seed | number | 1 | 1 – 999999, step 1 | Seed of the positions and signs. Two seeds give two rooms of the same dimensions. |

#### Vibrato

`vibrato` · Processing → Effects

*Pitch modulation by LFO (note oscillation).*

Pitch modulation by LFO: the note oscillates around its original pitch. Different from pitch shift (which transposes statically) — vibrato varies the pitch periodically. Adjust the rate (speed, 0.1 to 20 Hz) and depth (amplitude, 0 to ±2 semitones). Uses a modulated delay to preserve timbre.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation speed (oscillations per second). |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Pitch modulation depth (0% = none, 100% = ±2 semitones). |

#### Vocoder

`vocoder` · Processing → Effects

*Filterbank vocoder: modulator + carrier → robot voice effect.*

Filterbank vocoder. Connect a voice (or any modulator) to the Modulator input and a synthesizer (or any harmonic-rich carrier) to the Carrier input. The modulator's spectrum controls the volume of each carrier band, producing the classic robot effect. Adjust the number of bands, frequency range and Q.

| Port | Name | Type | |
|---|---|---|---|
| input | Modulator | audio |  |
| input | Carrier | audio |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Bands | number | 8 | 4 – 16, step 1 | Number of vocoder filter bands. More bands = more spectral precision. |
| Min freq | number | 100 Hz | 80 – 1000 Hz, step 10 | Lowest band frequency. |
| Max freq | number | 8000 Hz | 2000 – 16000 Hz, step 100 | Highest band frequency. |
| Q | number | 2 | 0.5 – 12, step 0.1 | Bandpass filter quality factor. Higher = narrower bands. |
| Mix | number | 50 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Voice Changer

`voice-changer` · Processing → Effects

*Transforms a voice with preset effects: chipmunk, monster, robot, phone, alien, helium, ghost.*

Transforms a voice with preset effects from a dropdown: Chipmunk (high/cartoon), Monster (low/demonic), Robot (lowered formants + modulation), Phone (telephone bandwidth), Alien, Helium and Ghost. The processing combines pitch-shift and formant shifting for natural-sounding results.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Effect | choice | Chipmunk | Chipmunk / Monster / Robot / Phone / Alien / Helium / Ghost | Voice transformation preset. |

#### Wah-wah

`wahwah` · Processing → Effects

*Modulated bandpass filter (wah pedal effect).*

Bandpass filter with a LFO-modulated center frequency — the classic wah-wah pedal effect. The center frequency oscillates between 200 Hz and 2500 Hz. Adjust the rate (0.1 to 10 Hz), depth (sweep range), resonance (filter Q, high = pronounced wah) and mix. Ideal on electric guitars and keyboards.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 2 Hz | 0.1 – 10 Hz, step 0.1 | Modulation speed (sweeps per second). |
| Depth | slider | 100 % | 0 – 100 %, step 1 | Frequency sweep range (0% = static, 100% = full wah). |
| Resonance | slider | 5 Q | 0.5 – 20 Q, step 0.5 | Filter resonance (high Q = pronounced wah, low Q = gentle). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Mix between dry and wet signal (100% = wah only). |

#### Wave Terrain

`terrain-onde` · Processing → Effects

*Travels a surface z = f(x, y) along an orbit: the orbit makes the pitch, the relief makes the timbre.*

Wave terrain synthesis. A wavetable oscillator reads a one-dimensional curve; this one reads a TWO-dimensional one: a surface z = f(x, y), travelled by an orbit that wanders over it, the sound being the terrain's altitude under the orbit. The idea dates from the 1970s (Bischoff, Gold, Horton; Mitsuhashi, 1982) and Curtis Roads gives the reference account in « The Computer Music Tutorial ». The roles are separate: the ORBIT decides the period, hence the pitch; the TERRAIN decides the waveform, hence the timbre. Widening the orbit over rugged terrain changes the whole spectrum without touching the note, and a drifting orbit evolves the timbre indefinitely. Two consequences surprise, and both are geometry rather than defects. The terrain's SYMMETRY multiplies the frequency: on a saddle z = x² − y², one turn of the orbit passes twice over the same relief, so one hears the octave above the rotation speed — the node verifies this, the half-period repeating there where on the classic terrain it does not. And a terrain of concentric circles is CONSTANT along a centred circle: it then gives no sound at all, and the orbit's centre must be offset to hear it. The « Classic » terrain is the one Mitsuhashi gives as an example and the whole literature reuses; it is hollowed along the lines x = ±1 and y = ±1, and along the diagonal too, so its relief is very uneven from area to area — hence the importance of the radius and the centre.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Terrain | choice | Classic (Mitsuhashi) | Classic (Mitsuhashi) / Saddle / Sine product / Concentric ripples / Formula | The surface travelled. « Classic » is the one of the whole literature, hollowed along the lines x = ±1 and y = ±1. « Saddle » is symmetric, and therefore sounds an octave above the rotation speed. « Concentric ripples » is constant along a centred circle: it gives nothing unless the orbit's centre is offset, and that is geometry, not a defect. |
| Formula | text | `sin(4*x) * cos(3*y)` |  | Altitude as a function of x and y, for the « Formula » terrain. The usual functions are available (sin, cos, exp, sqrt, abs…). |
| Orbit | choice | Circle | Circle / Ellipse / Lissajous / Spiral | The path followed on the terrain. A Lissajous with integer ratios closes after several turns and gives a longer waveform; the spiral drifts the radius, hence the timbre. |
| Note | text | `A2` |  | Note played when no MIDI is connected: it is the number of orbit turns per second. |
| Radius | number | 80 % | 0 – 300 %, step 1 | Size of the orbit: this is THE timbre control. A small orbit stays in a flat area and gives a poor sound, a large one explores the relief and gives a rich one — without changing the note. |
| Flattening | number | 50 % | 10 – 100 %, step 1 | Flattening of the ellipse on the y axis. |
| X ratio | number | 3 | 1 – 8, step 1 | Lissajous orbit frequency on the x axis. |
| Y ratio | number | 2 | 1 – 8, step 1 | Lissajous orbit frequency on the y axis. |
| Drift | number | 0 % | -100 – 100 %, step 1 | Variation of the radius over the sound's duration. The timbre then evolves continuously without the note moving. |
| Centre X | number | 0 % | -200 – 200 %, step 1 | Offsets the orbit on the x axis, hence the area of relief explored. |
| Centre Y | number | 0 % | -200 – 200 %, step 1 | Offsets the orbit on the y axis. |
| Duration | number | 3 s | 0.2 – 20 s, step 0.1 | Duration produced, when no MIDI is connected. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Wavesets (Wishart)

`wavesets-wishart` · Processing → Effects

*Cuts the sound at zero crossings and replays the segments differently.*

After Trevor Wishart's "Audible Design" (1994). The sound is cut not into fixed-length slices — what granulation does — but at ZERO CROSSINGS: each segment holds one pseudo-period, whose length therefore follows the pitch of the sound rather than an external clock. That is the whole difference: granulation imposes its grid and produces artefacts unrelated to the material, where wavesets hug the waveform. Repeating segments lowers the pitch without touching each one's timbre; omitting them punches holes correlated with the sound's own periodicity. And since segments start and end at zero, they can be cut, reordered or discarded without ever producing a click — the property that makes the whole family possible. Note: on inharmonic or noisy material the segmentation becomes erratic, because zero crossings no longer correspond to any periodicity. That is a limit of the process, and one Wishart deliberately exploits.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Repeat | Repeat / Omit / Reverse / Shuffle / Level | "Repeat" plays each segment several times: the pitch drops and the sound lengthens accordingly. "Omit" silences some without shortening the sound. "Reverse" plays each segment backwards: same duration and energy, altered timbre. "Shuffle" reorders segments in groups. "Level" brings every segment to the same level, flattening all dynamics. |
| Factor | number | 2 | 1 – 16, step 1 | Number of repeats, omission step (1 segment kept out of N), or shuffled group size. No effect on Reverse and Level. |
| Seed | number | 1 | 1 – 9999, step 1 | Shuffle seed: same seed, same result. No effect on the other operations. |

#### Wind Instrument

`vent-guide-onde` · Processing → Effects

*Clarinet, flute or brass by waveguide: a bore, a reed, and the timbre that follows.*

Clarinet, flute or brass by digital waveguide. A wind instrument is not an oscillator with a filter on it: it is a bore in which a pressure wave travels back and forth, and a reed — or an air jet — that decides, at each return, what it lets through. Julius Smith showed in the 1980s that a single looped delay line with a nonlinearity at its input was enough to simulate this; Perry Cook drew the Synthesis ToolKit instruments from it, which this node follows. The point is not cheap computation but BEHAVIOUR: the sound takes time to settle, the instrument refuses to speak if blown too gently, and the timbre changes with dynamics instead of only the volume. None of that is programmed as an effect; it all falls out of the model. The clarinet's bore is closed at one end, which inverts the reflection and lets only ODD harmonics live: measured, the even ones weigh 0.4 % of the odd, and that is its whole hollow colour. Below 40 % pressure its reed does not start and only breath noise comes out — a real reed's behaviour, not a defect of the node. The flute is nearly sinusoidal, the wind poorest in harmonics. The brass brightens markedly when blown hard, because the wave steepens as it travels: measured, its spectral centre of gravity moves from 1020 to 3393 Hz between 20 % and 100 % pressure. Two corrections were found by measurement and are worth stating, because they explain what the node does: the loss filter's delay is compensated, without which the clarinet gave 218 Hz for 220 asked; and the flute's and brass's bore is PRIMED at the target note, without which the model picked its own partial and an A 440 could come out at 164 Hz — exactly a beginner's problem, embouchure not yet formed. One accepted limit: the flute model only holds its pitch above 85 % pressure, so its pressure setting is remapped into that range and acts on dynamics only.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Clarinet | Clarinet / Flute / Brass | The model. The clarinet's bore is closed at one end, which lets only odd harmonics live — measured, the even ones weigh 0.4 % of the odd, and that is its whole colour. The flute is nearly sinusoidal. The brass brightens when blown hard, because the wave steepens as it travels. |
| Note | text | `A3` |  | Note played when no MIDI is connected (e.g. A3, C4, F#5). A MIDI file wins, and the line is played note by note. |
| Breath | number | 80 % | 0 – 100 %, step 1 | Breath pressure. Below 40 %, the clarinet's reed does not start and only noise comes out — that is a real reed's behaviour, not a defect. On the brass, pressure changes the timbre as much as the volume. |
| Noise | number | 5 % | 0 – 100 %, step 1 | Amount of breath noise mixed into the pressure. A little makes the attack alive; a lot gives the sound of a winded player. |
| Vibrato | number | 10 % | 0 – 100 %, step 1 | Depth of the breath vibrato. |
| Vibrato rate | number | 5 Hz | 0.5 – 12 Hz, step 0.1 | Vibrato speed. |
| Attack | number | 0.05 s | 0.005 – 0.5 s, step 0.005 | Breath rise time. The model also takes its own time to settle: that is the loop filling up. |
| Duration | number | 2 s | 0.1 – 10 s, step 0.1 | Note duration, when no MIDI is connected. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

### Generation

| Component | Summary |
|---|---|
| [Chord Grid](#chord-grid) | Generates a full accompaniment in text-to-MIDI format. |

#### Chord Grid

`tonal-grille` · Processing → Generation

*Generates a full accompaniment in text-to-MIDI format.*

Generates a full accompaniment in text-to-MIDI format. Connect its « Notation » output to the « Text → MIDI » node to get a MIDI/audio file. Accepts a progression in roman numerals (I V vi IV) or chord symbols (C Am F G). Parameters: key, tempo, duration per chord, octave and Block/Arpeggio mode.

| Port | Name | Type | |
|---|---|---|---|
| input | Progression | text |  |
| output | Notation | text |  |
| output | Chords | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note of the grid. The mode is set in « Scale »; the Progression input wins over the setting when it names a key. |
| Scale | choice | major | major / minor | Scale the degrees are read in. In minor, III, VI and VII drop a semitone: « i VI III VII » gives Am F C G in A, not Am F♯ C♯ G♯. |
| Progression | text | `I V vi IV` |  | Roman numeral progression (uppercase = major chord, lowercase = minor chord). Also accepts a space-separated list of chord symbols (e.g. C Am F G). |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Accompaniment tempo. |
| Duration | number | 1 beats | 0.25 – 4 beats, step 0.25 | Duration of each chord in beats. |
| Octave | number | 3 | 2 – 5, step 1 | Base octave for chords. |
| Mode | choice | Block | Block / Arpeggio | Block plays all notes at once, Arpeggio plays them as eighth notes. |

### Image

| Component | Summary |
|---|---|
| [Image Caption](#image-caption) | Describes an image as text using Mozilla/distilvit (Transformers.js, ONNX, local). |
| [OCR](#ocr) | Recognizes text in an image using Tesseract.js (multi-alphabet). |

#### Image Caption

`legende-image` · Processing → Image

*Describes an image as text using Mozilla/distilvit (Transformers.js, ONNX, local).*

Describes an image's content in one sentence using Mozilla/distilvit (ViT + distilled GPT2, ~0.2B parameters, Apache 2.0 license). Runs in a Web Worker via Transformers.js, downloads and caches automatically on first use (~730 MB in fp32 — app-wide constraint, see README « ONNX Models »). Adjust the max length of the generated caption. Captions are in English (model trained on English-language datasets).

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Max length | slider | 30 | 5 – 100, step 1 | Maximum number of tokens generated for the caption. |

#### OCR

`ocr` · Processing → Image

*Recognizes text in an image using Tesseract.js (multi-alphabet).*

Optical character recognition (OCR) using Tesseract.js (WASM). Connect an image (PNG, JPEG…) to the input. The node recognizes text in multiple alphabets (Latin, Cyrillic, Greek, Arabic, Hebrew by default). Each language downloads its model (~2-10 MB) from the Tesseract CDN on first use. The recognized text is emitted on the 'Text' output.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Languages | text | `eng+fra+deu+spa+rus+ell+ara` |  | Tesseract language codes separated by « + » (e.g. eng+fra+rus). Default: Latin, Cyrillic, Greek, Arabic. Each language downloads its model (~2-10 MB) from the Tesseract CDN. |

### Text

| Component | Summary |
|---|---|
| [PDF Extraction](#pdf-extraction) | Extracts already-digital text from a PDF (no OCR) — also detects scanned/image PDFs with no recoverable text. |

#### PDF Extraction

`extraction-pdf` · Processing → Text

*Extracts already-digital text from a PDF (no OCR) — also detects scanned/image PDFs with no recoverable text.*

Extracts already-digital text from a PDF using pdf-inspector (Rust/WASM, https://github.com/firecrawl/pdf-inspector), fully local. This is NOT OCR: only text already embedded in the file (not a text image) is recovered, in tens to hundreds of ms. Also detects the PDF type (text, scanned, image, mixed) and clearly flags it in the message if some or all pages have no recoverable text — in that case those pages would need to be rasterized and passed to the OCR node separately (not handled here). Format parameter: Plain text (content only) or Markdown (headings, lists, tables reconstructed from the layout).

| Port | Name | Type | |
|---|---|---|---|
| input | PDF file | file | required |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Format | choice | Plain text | Plain text / Markdown | Plain text: content only. Markdown: headings, lists and tables reconstructed from the PDF's layout. |

## Visualization

### Analysis

| Component | Summary |
|---|---|
| [Aesthetic Comparison](#aesthetic-comparison) | Compares two versions of a sound on the four aesthetic axes: one mix against another, a sound before and after processing. |
| [Aesthetic Score](#aesthetic-score) | Scores a sound on four axes — enjoyment, usefulness, complexity, production quality — with each axis' curve over time. |
| [Analysis Player](#analysis-player) | Displays an analysis result and allows listening. |
| [Attractor / IFS](#attractor--ifs) | Renders a chaotic attractor or IFS as image + audio. |
| [Audio Analysis](#audio-analysis) | Analyse tempo, key, song/instrumental type. |
| [Chord Detector](#chord-detector) | Detects the chord progression in the audio signal. |
| [ColorSynth](#colorsynth) | Derives a color palette from the audio spectrum (see the timbre). |
| [Emotional Analysis](#emotional-analysis) | Associates an emotion with a track from its music alone (tempo, mode, energy, timbre) — no text or lyrics analyzed. |
| [Genre Classifier](#genre-classifier) | Identifies the musical genre of a song via AI or heuristics. |
| [Goniometer](#goniometer) | Measures stereo width, phase correlation and what the mix would lose in mono. |
| [Harmonic Analysis](#harmonic-analysis) | Detects the key of a song and suggests a chord progression. |
| [MusicXML](#musicxml) | Converts MIDI into a MusicXML score, the format MuseScore, Finale and Sibelius read. |
| [Practice Keyboard](#practice-keyboard) | Shows a MIDI file played on an 88-key keyboard, one colour per hand, and says whether it is playable. |
| [RMS (Meyda)](#rms-meyda) | Computes the average RMS level of the signal in dBFS using Meyda. |
| [Self-Similarity Matrix](#self-similarity-matrix) | Draws a piece's form and detects its boundaries, by Foote's method. |
| [Songsee Visualizer](#songsee-visualizer) | Generates an audio visualization image using the Songsee engine. |
| [Spectral Centroid (Meyda)](#spectral-centroid-meyda) | Computes the spectral centroid of the signal using the Meyda library. |
| [Spectral Rolloff (Meyda)](#spectral-rolloff-meyda) | Computes the spectral rolloff frequency using Meyda. |
| [Spectrogram](#spectrogram) | Shows how the spectrum evolves over time (time × frequency × intensity). |
| [Spectrum Analyzer](#spectrum-analyzer) | Decomposes the signal into frequencies (FFT) and displays its spectrum. |
| [Tempo Detector](#tempo-detector) | Estimates an audio track's tempo and outputs it as a reusable value. |
| [VU-meter / LUFS](#vu-meter--lufs) | Measures and displays audio levels: RMS, peak, true peak, LUFS. |
| [Waveform Viewer](#waveform-viewer) | Displays the waveform with zoom and scrollbar. |
| [ZCR (Meyda)](#zcr-meyda) | Counts zero crossings per frame using Meyda. |

#### Aesthetic Comparison

`comparaison-esthetique` · Visualization → Analysis

*Compares two versions of a sound on the four aesthetic axes: one mix against another, a sound before and after processing.*

Compares two versions of the same sound — one mix against another, a sound before and after processing — on the four Audiobox Aesthetics axes (see « Aesthetic Score » for their meaning and limits). Each version is scored in 10 s windows, and the message gives the B − A difference for each axis: connect the original to A and the processed version to B: for CE, CU and PQ, a positive difference is a gain, which the view colours green. NOT for PC, which counts components and has no better direction — it stays grey. Measured: an 8-bit Bitcrusher on a spoken announcement loses 0.25 in PQ and gains 0.60 in PC, its quantization noise counting as one more component. Same caution as for the single score: on a creative treatment, a lower PQ does not mean « worse », and PC is meaningless for speech. The two sounds need not have the same length. Scoring takes about 0.6 s per window of each version.

| Port | Name | Type | |
|---|---|---|---|
| input | A | audio | required |
| input | B | audio | required |
| output | Report | text |  |

*No parameters.*

#### Aesthetic Score

`score-esthetique` · Visualization → Analysis

*Scores a sound on four axes — enjoyment, usefulness, complexity, production quality — with each axis' curve over time.*

Scores a sound with Audiobox Aesthetics (Meta, 2025), a model trained on 97,000 speech, music and sound-effect clips rated by listeners, on four axes from 1 to 10. ENJOYMENT (CE): listening pleasure, emotional impact. USEFULNESS (CU): how likely the sound is to be reused as material for creation. COMPLEXITY (PC): the number of components in the sound scene. QUALITY (PQ): the technical quality of the production — clarity, dynamics, spectrum, spatialization. The model listens in 10 s windows; the overall score is their average, weighted by each window's actual length, and the view shows each axis' CURVE: it tells where a track weakens, which the average hides — in the demo collection, a track with an overall PQ of 7.7 has a window at 5.6. The report gives, per axis, the lowest window and its difference from the overall score. WORTH KNOWING BEFORE INTERPRETING. PQ judges technical cleanliness, not music: a pure sine scores 7.0 in quality and 2.9 in enjoyment. PQ has learned that a good sound is clean and natural: a deliberately destructive effect (distortion, Cantor dust, inversion mirror) will score low, which says nothing about its artistic value. According to the paper, PC does not correlate with perceived speech quality: for a voice, ignore it. CE and CU are averages of annotators' tastes, tendencies rather than verdicts. Scoring takes about 0.6 s per window on CPU, around ten seconds for a 3-minute song. The model runs as published, and was measured against Meta's PyTorch code: the same scores within 0.00002 over 317 windows, and a conversion to 16 kHz identical to torchaudio's within 2·10⁻⁷ — which matters, as a coarser interpolation shifts the scores by up to 0.13. In the app, two files of the demo collection give the reference scores to the hundredth. Weights licensed CC-BY 4.0 (Meta Platforms).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |
| output | Report | text |  |

*No parameters.*

#### Analysis Player

`lecteur-analyse` · Visualization → Analysis

*Displays an analysis result and allows listening.*

Displays an analysis result and lets you listen to the associated audio.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Analysis | text |  |
| output | Audio | audio |  |

*No parameters.*

#### Attractor / IFS

`attracteur-ifs` · Visualization → Analysis

*Renders a chaotic attractor or IFS as image + audio.*

Renders a chaotic attractor or iterated function system (IFS) as image AND sound. Each point is computed by iterating nonlinear equations (Lorenz, Rössler, Henon, Ikeda) or affine transformations (Barnsley, Sierpinski). Point density determines the image color. The trajectory is also sonified: x controls the left-channel frequency, y the right-channel frequency, z the amplitude. Image output + audio output.

| Port | Name | Type | |
|---|---|---|---|
| output | Image | image |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Attractor | choice | Lorenz | Lorenz / Rossler / Henon / Ikeda / Barnsley / Sierpinski | Dynamical system or IFS to iterate to produce the trajectory. |
| Iterations | number | 200000 pts | 10000 – 1000000 pts, step 1000 | Number of points computed for the image and sonification. |
| Width | number | 1024 px | 256 – 4096 px, step 1 | Width of the rendered image in pixels. |
| Height | number | 1024 px | 256 – 4096 px, step 1 | Height of the rendered image in pixels. |
| Palette | choice | classic | classic / magma / inferno / viridis / gray / claw | Color palette applied to the point density. |
| Projection | choice | XY | XY / XZ / YZ / 3D shadow | Projection of the attractor's 3D axes onto the image. |
| Exposure | number | 1.5 | 0.1 – 5, step 0.1 | Exposure factor to emphasize or attenuate point density. |
| Gamma | number | 1 | 0.1 – 3, step 0.1 | Gamma correction of the image. |
| Seed | number | 42 | 0 – 999999, step 1 | Seed for random initial conditions of the IFS. |
| Format | choice | PNG | PNG / JPEG | Output image file format. |
| Audio duration | number | 4 s | 1 – 30 s, step 0.5 | Duration of the sound generated from the trajectory. |
| Base frequency | number | 220 Hz | 20 – 2000 Hz, step 1 | Base frequency for sonifying the X/Y coordinates. |
| Pitch range | number | 24 semitones | 0 – 48 semitones, step 1 | Pitch range in semitones of the audio pitch modulation. |
| Audio decimation | number | 1 pts/sample | 1 – 100 pts/sample, step 1 | One audio point out of N is used to slow down the frequency variation. |
| Audio volume | number | 80 % | 0 – 100 %, step 1 | Output audio signal volume. |

#### Audio Analysis

`analyse-audio` · Visualization → Analysis

*Analyse tempo, key, song/instrumental type.*

Estimates the tempo, key and type (song / instrumental) of the track and produces a text description.

| Port | Name | Type | |
|---|---|---|---|
| input | Track | audio |  |
| output | Audio | audio |  |
| output | Analysis | text |  |

*No parameters.*

#### Chord Detector

`detecteur-accords` · Visualization → Analysis

*Detects the chord progression in the audio signal.*

Analyzes the audio signal and detects the chord progression over time. For each analysis window, a chromagram (12 pitch-class vector) is computed and compared against chord templates (major, minor, 7th, minor 7th, major 7th, diminished, augmented, sus2, sus4, minor 7b5) by correlation. The result is a list of chords with their timestamp and duration. Adjust the analysis window: short (0.2-0.5 s) for fast changes, long (1-2 s) for more stability. The audio signal is passed through unchanged on the Audio output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Analysis window | number | 0.5 s | 0.1 – 5 s, step 0.1 | Duration of each analysis window. Shorter = more time-precise but less stable; longer = more stable but less detailed. |

#### ColorSynth

`colorsynth` · Visualization → Analysis

*Derives a color palette from the audio spectrum (see the timbre).*

The inverse of the « Color Combination » node: listens to the audio signal and derives a palette of 6 colors from the spectrum. The spectrum is divided into 6 bands (Sub, Bass, Low-Mid, Mid, High, Air) and each band is mapped to an HSL color: lows = warm colors (red/orange), mids = green, highs = cool colors (blue/violet). The brightness of each color = the band's energy. Educational: « see » the timbre — a bright sound will have dominant cool colors, a bass-heavy sound warm colors. Connect it after a filter, EQ or oscillator to visualize how processing modifies the spectrum.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Emotional Analysis

`analyse-emotionnelle` · Visualization → Analysis

*Associates an emotion with a track from its music alone (tempo, mode, energy, timbre) — no text or lyrics analyzed.*

Heuristic estimate combining tempo, major/minor mode, loudness and spectral brightness into a valence/arousal score (Russell's circumplex model), then mapped to a named emotion. Purely acoustic — does not read lyrics or metadata.

| Port | Name | Type | |
|---|---|---|---|
| input | Track | audio |  |
| output | Audio | audio |  |
| output | Analysis | text |  |

*No parameters.*

#### Genre Classifier

`classificateur-genre` · Visualization → Analysis

*Identifies the musical genre of a song via AI or heuristics.*

Identifies the musical genre of the track, via an ONNX model or heuristics on audio features.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Genres | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | AI (ONNX) | AI (ONNX) / Heuristic | Method used (AI model or heuristic). |
| Duration | number | 30 s | 5 – 120 s | Generated duration, in seconds. |

#### Goniometer

`goniometre` · Visualization → Analysis

*Measures stereo width, phase correlation and what the mix would lose in mono.*

Measures what the two channels do to each other, and shows it. The figure is a goniometer: each sample becomes a point whose vertical axis carries the sum of the channels — what survives in mono — and whose horizontal axis carries their difference, what disappears. A VERTICAL line is mono, a round cloud is wide stereo, a HORIZONTAL line is out of phase. Below the figure, Pearson's correlation, from -1 to +1: above 0.95 the mix is mono or nearly so; near 0 the channels are independent; below -0.2 they oppose each other and the mono sum cancels them. The report also gives each channel's level and the level of the mono sum: the « loss in mono » is how many decibels the mix leaves behind when heard on a single speaker. Three decibels are normal for wide stereo; beyond ten, something is cancelling. Audio passes through unchanged: this node measures, it does not correct. A mono file is reported as mono, which is the truth and not an error.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |
| output | Goniometer | image |  |
| output | Measurements | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Points | number | 3000 | 200 – 20000, step 100 | Number of points drawn in the figure. More points means a denser cloud — and a heavier SVG. |

#### Harmonic Analysis

`tonal-analyse` · Visualization → Analysis

*Detects the key of a song and suggests a chord progression.*

Analyses audio and estimates its global key, then suggests a fitting progression (Pop, Jazz, Blues). « Key » output = estimated key with confidence, « Progression » = suggested roman numerals, « Detected chords » = chords detected over time. Connect the « Progression » output to « Chord Grid » to generate an accompaniment.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Key | text |  |
| output | Progression | text |  |
| output | Detected chords | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Style | choice | Pop | Pop / Jazz / Blues | Suggested progression style, adapted to the detected mode (major or minor). |

#### MusicXML

`musicxml` · Visualization → Analysis

*Converts MIDI into a MusicXML score, the format MuseScore, Finale and Sibelius read.*

Converts a MIDI file into a MusicXML score — the interchange format read by MuseScore, Finale, Sibelius and Dorico. Attic already wrote ABC and drew with VexFlow, but nothing it produced would open in a score editor. The text output gives the XML, the file output a .musicxml ready to save. Notes starting together become a chord, gaps become rests, and every bar is filled exactly — a bar that does not add up is rejected by MuseScore. « Quantization » sets the smallest value written: a note played between two slots is snapped to the grid. That is what makes the score readable, and also what loses the detail of the performance. « Tempo » does not change the pitches, but a wrong tempo gives wrong durations. What the export cannot do, and no automatic transcription can: slurs, dynamics, expression marks, and the composer's enharmonic choice — a C sharp is written sharp, never D flat. A note longer than a bar is truncated, for lack of a tie. It is a starting point to edit, not an engraving.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | MusicXML | text |  |
| output | File | file |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Title | text | `Attic` |  | Title written into the score. |
| Tempo | number | 120 BPM | 20 – 300 BPM, step 1 | Tempo used to turn seconds into note values. A wrong tempo does not change the pitches, but gives wrong durations. |
| Time signature | choice | 4/4 | 4/4 / 3/4 / 2/4 / 6/8 | Time signature of the score. It decides how bars are cut. |
| Quantization | choice | Sixteenth | Sixteenth / Eighth / Quarter | Smallest value written. A note played between two slots is snapped to the grid: that is what makes the score readable, and what loses the detail of the performance. |

#### Practice Keyboard

`clavier-apprentissage` · Visualization → Analysis

*Shows a MIDI file played on an 88-key keyboard, one colour per hand, and says whether it is playable.*

Shows a MIDI file played on an eighty-eight-key keyboard, one colour per hand, while playing it back. It is the reverse of the « Melody Keyboard », which is played with the mouse and records: this one watches, and it is made for learning — seeing where the fingers land while you listen. The animation follows the AUDIO ELEMENT and nothing else: a separate clock would drift within seconds, and a keyboard a beat ahead of what you hear teaches nobody anything. The two hands are assigned by the very function that judges playability, and that is what no ordinary MIDI player shows. Then comes the question any file you did not write yourself raises: is it even PLAYABLE on a keyboard? The answer splits in two, and that is the node's whole work. FOUR IMPOSSIBILITIES CAN BE DECIDED, with no arbitrariness: a note outside the 88 keys cannot be displayed; MIDI channel 10 carries percussion instruments rather than pitches, and putting them on a keyboard would be a lie; more than ten notes at once is more than ten fingers; and above all a chord must be SPLITTABLE BETWEEN TWO HANDS — two hands do not cross, so there are only n+1 possible splits and the node tries them all, each side having to fit within five fingers and the configured span. THREE THINGS CANNOT BE DECIDED, and the node gives figures rather than a verdict: speed — measured PER HAND, failing which two alternating hands would yield a rate twice too fast —, the largest jump relative to the time available for it, and notes held under others, which call for the pedal or a finger substitution. The node REFUSES NOTHING: one learns on real repertoire, not on certified files. It shows what it can and names what it cannot, in its Conformance output. Adaptation exists — folding octaves, dropping percussion — but it must be asked for: a silent adaptation would lie about the music, a chosen one is an arrangement. One last point, which comes before all the rest: a piano piece fits on one channel, an orchestral file has sixteen, and showing them all makes the keyboard unreadable. The « Channel » setting picks, and « Automatic » takes the busiest channel while AVOIDING percussion — in an orchestral file the busiest is often the drums. The MIDI output is what is shown and heard, channel and adaptation included, rather than the input copied: the view reads it back to light the keys, so the two cannot diverge.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Conformance | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Channel | choice | Automatic | Automatic / All / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 / 10 / 11 / 12 / 13 / 14 / 15 / 16 | Which channel to show. A piano piece fits on one channel; an orchestral file has sixteen, and showing them all makes the keyboard unreadable. « Automatic » takes the one with the most notes, avoiding percussion. The report lists every channel in the file, so you can choose. |
| Hand span | slider | 12  st | 8 – 16  st, step 1 | What one hand can hold, in semitones. Twelve — the octave — is the ordinary reach; a large hand gets a tenth, sixteen. This setting decides whether a chord can be split between two hands, hence whether it is playable. |
| Adapt | choice | No | No / Fold into range / Fold and drop percussion | Make playable what is not. « No » leaves the file as it is and merely says what is wrong — notes outside the 88 keys are then not shown. Octave folding brings those notes back into range keeping their pitch class, hence the harmony, at the cost of register. Nothing is adapted unless asked for here. |
| Look ahead | slider | 3 s | 1 – 8 s, step 0.5 | How many seconds of music fall above the keys before being played. Short, the note appears at the last moment; long, the whole phrase is readable but the notes crowd together. Three seconds is the sight-reader's compromise. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### RMS (Meyda)

`rms-meyda` · Visualization → Analysis

*Computes the average RMS level of the signal in dBFS using Meyda.*

Computes the average RMS (Root Mean Square) level of the signal using Meyda. The result is converted to dBFS for intuitive reading: 0 dBFS = maximum peak, -60 dBFS = very quiet. The input audio is passed through unchanged on the Audio output; the RMS output emits a textual value in dBFS.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | RMS | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | number | 2048 samples | 64 – 8192 samples, step 64 | Analysis window size (rounded up to the next power of 2). |
| Hop | number | 1024 samples | 64 – 4096 samples, step 64 | Hop size between analysis frames. |
| Aggregation | choice | Average | Average / Median / Maximum | Aggregation method for the per-frame values. |

#### Self-Similarity Matrix

`auto-similarite` · Visualization → Analysis

*Draws a piece's form and detects its boundaries, by Foote's method.*

Draws a piece's form and detects its boundaries. Attic could compare two tracks and align them; it could say nothing about the form of ONE piece — where the chorus starts, when the material changes. Jonathan Foote proposed in 1999 a disarmingly simple method that became the basis of all musical structure analysis. The piece is cut into frames, each described by its chromagram — which notes sound — and every frame is compared to every other. The result is a square, symmetric image with a white diagonal: the self-similarity matrix. The form can be read in it by eye, a bright square being a homogeneous passage and an offset diagonal a literal repetition. To go from the image to the boundaries, Foote slides a CHECKERBOARD KERNEL along the diagonal: two bright squares on the diagonal, two dark ones off it. That pattern only matches where « before » resembles « before », « after » resembles « after », and the two do not resemble each other — that is, exactly at a boundary. The resulting curve is called novelty, and its peaks are the articulations. « Frame » is the setting that matters: short, the chord detail shows; long, the large sections do. It is the scale at which the form is looked at, not a precision setting. At both ends of the piece the kernel would hang off the matrix: the curve is left at zero there rather than filled with invented values, which would create false boundaries where there is nothing to detect.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Matrix | image |  |
| output | Structure | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Frame | number | 0.5 s | 0.1 – 2 s, step 0.1 | Length of one analysis frame. Short, the chord detail shows; long, the large sections do. This setting decides the scale at which the form is looked at. |
| Kernel size | number | 8  frames | 2 – 40  frames, step 1 | Half-width of the checkerboard kernel slid along the diagonal. It only matches where « before » and « after » each resemble themselves without resembling each other — that is, at boundaries. |
| Threshold | number | 40 % | 1 – 99 %, step 1 | Minimum peak height to count as a boundary. Low, the cut is fine; high, only the clear articulations remain. |
| Minimum gap | number | 6  frames | 1 – 40  frames, step 1 | Minimum distance between two boundaries. A broad peak otherwise gives three or four maxima all describing the same articulation. |

#### Songsee Visualizer

`visualisation-songsee` · Visualization → Analysis

*Generates an audio visualization image using the Songsee engine.*

Generates an audio visualization image using the Songsee engine (spectrogram, mel, chroma, hpss, selfsim, loudness, tempogram, mfcc, flux). Choose the visualization mode, palette, dimensions and time range. The node emits the image on its 'Image' output. Requires Electron and the bundled Songsee binary.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Image | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Visualization | choice | All | All / spectrogram / mel / chroma / hpss / selfsim / loudness / tempogram / mfcc / flux | Songsee visualization mode. 'All' renders a grid of all 9 modes. |
| Palette | choice | classic | classic / magma / inferno / viridis / gray / claw | Color palette applied to the spectrogram. |
| Width | number | 1920 px | 640 – 3840 px, step 1 | Width of the generated image. |
| Height | number | 1080 px | 480 – 2160 px, step 1 | Height of the generated image. |
| Format | choice | JPEG | JPEG / PNG | Output image format. |
| Start | number | 0 s | 0 – 3600 s, step 0.1 | Start time of the analyzed region (seconds). 0 = from beginning. |
| Duration | number | 0 s | 0 – 3600 s, step 0.1 | Duration of the analyzed region (seconds). 0 = whole file. |

#### Spectral Centroid (Meyda)

`centroide-spectral` · Visualization → Analysis

*Computes the spectral centroid of the signal using the Meyda library.*

Computes the spectral centroid of the signal using the Meyda library. The centroid is the « center of gravity » of the spectrum: a high value indicates a bright / trebly sound, a low value a dark / bass-heavy sound. The input audio is passed through unchanged on the Audio output; the Centroid output emits a textual value in Hz (mean, median or maximum of the per-frame centroids).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Centroid | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | number | 2048 samples | 64 – 8192 samples, step 64 | Analysis window size (rounded up to the next power of 2). |
| Hop | number | 1024 samples | 64 – 4096 samples, step 64 | Hop size between analysis frames. |
| Aggregation | choice | Average | Average / Median / Maximum | Aggregation method for the per-frame values. |

#### Spectral Rolloff (Meyda)

`rolloff-spectral-meyda` · Visualization → Analysis

*Computes the spectral rolloff frequency using Meyda.*

Computes the spectral rolloff of the signal using Meyda: the frequency below which a given proportion (85%) of the spectral energy is concentrated. It is an indicator of the overall brightness of the sound: a high rolloff = bright sound, a low rolloff = dark sound. The input audio is passed through unchanged; the Rolloff output emits a textual value in Hz.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Rolloff | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | number | 2048 samples | 64 – 8192 samples, step 64 | Analysis window size (rounded up to the next power of 2). |
| Hop | number | 1024 samples | 64 – 4096 samples, step 64 | Hop size between analysis frames. |
| Aggregation | choice | Average | Average / Median / Maximum | Aggregation method for the per-frame values. |

#### Spectrogram

`spectrogramme` · Visualization → Analysis

*Shows how the spectrum evolves over time (time × frequency × intensity).*

Shows how the spectrum evolves over time: horizontal = time, vertical = frequency, color = intensity (dark → bright). Notes, harmonics and transients appear. Set the FFT window (time/frequency trade-off) and scale. The signal is passed through unchanged.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | choice | 1024 | 512 / 1024 / 2048 / 4096 | FFT window size (samples). Small = better time resolution; large = better frequency resolution (time/frequency trade-off). |
| Scale | choice | Logarithmic | Logarithmic / Linear | Vertical frequency axis scale (log = close to perception). |

#### Spectrum Analyzer

`analyseur-spectre` · Visualization → Analysis

*Decomposes the signal into frequencies (FFT) and displays its spectrum.*

Decomposes the signal into its frequencies (fast Fourier transform) and displays the spectrum: level (dB) per frequency, averaged over the whole track. Choose the FFT window size (resolution) and axis scale (log/linear). The signal is passed through unchanged.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | choice | 4096 | 1024 / 2048 / 4096 / 8192 | FFT window size (samples). Larger = finer frequency resolution (but coarser time resolution). |
| Scale | choice | Logarithmic | Logarithmic / Linear | Frequency axis scale. Logarithmic = close to pitch perception (even octaves); linear = evenly spaced frequencies. |

#### Tempo Detector

`detecteur-tempo` · Visualization → Analysis

*Estimates an audio track's tempo and outputs it as a reusable value.*

Estimates a recording's tempo and outputs it as a VALUE, connectable to another node's Tempo parameter — which is how a generated loop gets aligned to an imported excerpt. The measurement is the one Attic already uses in « Audio Analysis »: onset envelope, autocorrelation and spectral flux. « Octave correction » deals with the classic weakness of every tempo detector: nothing tells 80 BPM from a 160 BPM counted every other beat, both periods explain the signal equally well. Folding brings the value into the adjustable range, which does not change the rhythm heard, only how it is counted; the report recalls the raw value and the other plausible readings. Reliability is reported in three levels rather than as a percentage: the autocorrelation peak is not a probability, and two decimals would be invented precision. What the measurement is worth, in figures: on click trains, 90, 100, 120 and 140 BPM are recovered within one beat. On drum-machine patterns, 100 and 75 BPM are right, but a 140 pattern comes out as 70 — an octave error, which the report flags by offering 140 among the plausible readings. A rubato or percussionless piece measures poorly, and the reported reliability says so.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Tempo | control |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Octave correction | choice | Fold into range | Fold into range / None | Tempo detection cannot tell 70 BPM from a 140 BPM counted every other beat: both explain the signal, and NO rule settles it every time. Measured on drum-machine patterns, raw detection readily halves: 100 comes out as 50, 140 as 70 — but a genuine 75 does come out as 75. Folding into 80-160 fixes the first two and doubles the third. Folding is therefore on by default, because that is the common case when feeding a Tempo parameter, but nothing is hidden: the report always gives the raw value and the equally plausible readings. Set « None » for a track you know to be slow. |
| Range low | number | 80 | 40 – 140, step 1 | Lower bound of the folding range. |
| Range high | number | 160 | 80 – 240, step 1 | Upper bound of the folding range. |

#### VU-meter / LUFS

`vu-metre` · Visualization → Analysis

*Measures and displays audio levels: RMS, peak, true peak, LUFS.*

Measures and displays audio levels in real time. Four vertical bargraphs: RMS (average level in dBFS), Peak (in dBFS), True Peak (4× interpolated peak in dBTP, to detect inter-sample peaks) and LUFS (ITU-R BS.1770 loudness with K-weighting filter). Also shows the crest factor (peak − RMS, indicates dynamics), dynamic range (approximate LRA) and min/max momentary LUFS. The signal is passed through unchanged. Useful for checking levels before export, comparing mixes or calibrating equipment.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Readings | text |  |

*No parameters.*

#### Waveform Viewer

`visualiseur-forme-onde` · Visualization → Analysis

*Displays the waveform with zoom and scrollbar.*

Displays the waveform of the received signal, with wheel zoom, and passes it through unchanged.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Duration | control |  |

*No parameters.*

#### ZCR (Meyda)

`zcr-meyda` · Visualization → Analysis

*Counts zero crossings per frame using Meyda.*

Counts the number of zero crossings of the signal in each analysis frame using Meyda. ZCR is a simple indicator of the « brightness » or noisiness of the signal: a high ZCR suggests high frequencies or noise, a low ZCR suggests low sounds or continuous signals. The input audio is passed through unchanged; the ZCR output emits a textual value in zero crossings.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | ZCR | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | number | 2048 samples | 64 – 8192 samples, step 64 | Analysis window size (rounded up to the next power of 2). |
| Hop | number | 1024 samples | 64 – 4096 samples, step 64 | Hop size between analysis frames. |
| Aggregation | choice | Average | Average / Median / Maximum | Aggregation method for the per-frame values. |

### Image

| Component | Summary |
|---|---|
| [Image Renderer](#image-renderer) | Displays an image and passes it through unchanged. |

#### Image Renderer

`rendu-image` · Visualization → Image

*Displays an image and passes it through unchanged.*

Displays an image received on its input and passes it through unchanged on its output. Useful for previewing any intermediate image in the graph (spectrogram, attractor, etc.) without breaking the chain. The output can be connected to an Image Export, a Pixeltone, or another processing node.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Image | image |  |

*No parameters.*

### Notation

| Component | Summary |
|---|---|
| [ABC Constraints](#abc-constraints) | Checks that an edit of an ABC score kept what had to stay fixed: bars, meter, key, melody, rhythm, chords. |
| [MIDI → ABC](#midi--abc) | Writes a MIDI file in ABC notation: a text score, readable and editable by a language model. |
| [MIDI Score](#midi-score) | Displays a musical staff from a MIDI file. |
| [VexFlow Chord Chart](#vexflow-chord-chart) | Displays a chord chart from a list of symbols. |
| [VexFlow Score](#vexflow-score) | Displays a simple score from a chord progression. |
| [VexFlow Staff](#vexflow-staff) | Displays a musical staff from a text notation. |
| [VexFlow Tab](#vexflow-tab) | Displays a tablature from a text notation. |

#### ABC Constraints

`contraintes-abc` · Visualization → Notation

*Checks that an edit of an ABC score kept what had to stay fixed: bars, meter, key, melody, rhythm, chords.*

Compares an original ABC score with an edited version, and says whether what had to stay fixed did: number and length of bars, meter, key, melody or rhythm of the first voice, chord symbols, range. Each violation is named and located — « bar 4: 3.5 beats instead of 4 », « melody modified from bar 4 (note 29: A4 → F#4) ». The « Validated ABC » output only passes the edit on if it complies: placed before « ABC → MIDI », it prevents a faulty edit from being played. Comparisons apply to what is PLAYED, repeats unrolled: repeats rewritten in full are not a fault. Why this node: measured on local language models rewriting a whole tune, none of 19 edits was correct, and one that looked right had lost a note while placing a chord. Nothing flagged it. The node depends on no model: it applies just as well to a hand-made edit. Two quality indicators accompany the verdict — share of strong beats whose note belongs to the chord, share of notes in the scale — because guaranteed structure says nothing about the music.

| Port | Name | Type | |
|---|---|---|---|
| input | Original | text | required |
| input | Edited | text | required |
| output | Validated ABC | text |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Check | choice | Reharmonization | Reharmonization / Pitch change / Variation / Structure only / Custom | What must stay fixed, depending on the edit. Reharmonization: bars, meter, key and melody. Pitch change: bars, meter and rhythm. Variation: bars, meter and key. Structure only: bars and meter. Custom: the list in the Invariants parameter. |
| Invariants | text | `bars, meter` |  | Used with Check « Custom ». Among: bars, meter, key, melody, rhythm, chords, range. Melody and rhythm apply to the first voice; range checks that no note leaves the original's span. |

#### MIDI → ABC

`midi-vers-abc` · Visualization → Notation

*Writes a MIDI file in ABC notation: a text score, readable and editable by a language model.*

Writes a MIDI file in ABC notation, so that a melody produced by Attic — Groove Box, sequencers, Magenta, capture — becomes a text score you can read, correct, and hand to a language model, which cannot read MIDI. MIDI says when notes sound, not how to write them: four decisions are made, and the message states them. The METER: Attic's nodes all write 4/4 into their files, even for a waltz; it is therefore picked by hand, not guessed. The KEY: inferred from the notes by Krumhansl's method, or imposed; it sets the key signature, hence F sharp or G flat. Inference is only reliable on harmony — measured on the Groove Box: right 24 times out of 24 on the chord part, 4 out of 24 on the melody alone, 0 out of 24 on the bass alone, without the confidence revealing it. A single line is flagged: impose the key then, or convert the full file. The GRID: the coarsest one on which every note falls exactly — a generated MIDI then does not move by a single tick — or failing that a chosen grid, the message counting moved notes. The VOICES: notes starting and ending together form a chord, a bass held under a moving melody creates a second voice — or, with « Shorten into one line », the held note is cut at the next attack, keeping a legato melody readable on a single line at the cost of exactness. Each channel is written separately; drums (channel 10) are ignored, ABC having no standard percussion notation. Notes crossing a bar line are split and tied, triplets written as (3. Only the first tempo is written, instruments appear as comments, dynamics are not written. Read back by « ABC → MIDI », the score gives exactly the same notes on grid-aligned material.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | ABC | text |  |
| output | Key | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Meter | choice | From file | From file / 2/4 / 3/4 / 4/4 / 5/4 / 6/8 / 7/8 / 9/8 / 12/8 | Where to put the bar lines. NOTE: Attic's nodes all write « 4/4 » into their files, even for a waltz — « From file » therefore almost always gives 4/4. Pick the real meter by hand; it is not guessed, because a wrongly guessed meter gives an unreadable score without saying so. |
| Key | text | `Auto` |  | « Auto » infers it from the notes (Krumhansl's method, the same as the harmonic analysis on audio). RELIABLE ON HARMONY ONLY: measured on the Groove Box, right 24 times out of 24 on the chord part, 4 out of 24 on the melody alone, 0 out of 24 on the bass alone — and the displayed confidence does not reveal the error. A single line is therefore flagged: impose the key then, as an ABC K: field (« G », « Am », « Ddor », « Bb »…). It sets the key signature, hence the spelling: F sharp or G flat. |
| Grid | choice | Automatic | Automatic / Eighths (1/8) / Sixteenths (1/16) / 32nds (1/32) / Eighth triplets / Sixteenth triplets / Sixteenths and triplets | Grid the notes are snapped to. Automatic: the coarsest one on which every note falls exactly, if any — a generated MIDI then does not move by a single tick — otherwise sixteenths. On captured or humanised playing, notes are moved and the message counts them. |
| Overlaps | choice | Separate voices (exact) | Separate voices (exact) / Shorten into one line | What to do with a note still sounding when the next one starts. Separate voices: it goes into an extra voice, and the score read back gives exactly the same notes. Shorten: it is cut at the next attack, so a legato melody stays on a single line — more readable, and easier for a language model to edit, but the length of the cut notes is lost. Chords are never cut. The Groove Box melody, whose same-pitch notes overlap, comes out on two voices in the first mode and one in the second. |
| Title | text | — |  | Title written in the T: field. Empty: the file's track name, if any. |

#### MIDI Score

`vexflow-midi` · Visualization → Notation

*Displays a musical staff from a MIDI file.*

Generates a musical staff (SVG) from a MIDI file. Connect a MIDI file (output from MIDI Transcriber, MIDI Player, etc.). Parameters: Tempo (0 = detected from MIDI), MIDI channel (-1 = all), rhythmic quantization and clef. The SVG output can be saved with the « SVG Export » node.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | SVG | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 0 BPM | 0 – 300 BPM, step 1 | Tempo used to convert MIDI durations to notation. 0 = detect from MIDI file. |
| Channel | number | -1 -1 = all | -1 – 15 -1 = all, step 1 | MIDI channel to display (-1 for all channels). |
| Quantization | choice | 1/16 | 1/4 / 1/8 / 1/16 / 1/32 | Quantization grid resolution. |
| Clef | choice | treble | treble / bass / alto / tenor | Staff clef. |
| Width | number | 800 px | 200 – 2000 px, step 10 | SVG width. |
| Height | number | 200 px | 100 – 800 px, step 10 | SVG height. |

#### VexFlow Chord Chart

`vexflow-grille` · Visualization → Notation

*Displays a chord chart from a list of symbols.*

Generates a chord chart (SVG) from a list of chord symbols or a roman numeral progression. Set « Measures per line » to control the layout. Connect the « Chords » output of a Tonal node or harmonic analysis.

| Port | Name | Type | |
|---|---|---|---|
| input | Chords | text |  |
| output | SVG | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Chords | text | `C Am F G` |  | Chords to display, separated by spaces. Also accepts a roman numeral progression if a key is set. |
| Key | text | `C` |  | Key used to interpret a roman numeral progression. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis » — the named mode then wins over « Scale ». |
| Scale | choice | major | major / minor | Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone: « i VI III VII » gives Am F C G in A. |
| Measures per line | number | 4 | 1 – 8, step 1 | Number of measures per line. |
| Width | number | 500 px | 200 – 1000 px, step 10 | SVG width. |
| Height | number | 200 px | 100 – 600 px, step 10 | SVG height. |

#### VexFlow Score

`vexflow-partition` · Visualization → Notation

*Displays a simple score from a chord progression.*

Generates a simple score (SVG) from a chord progression. Accepts roman numerals (I V vi IV) or chord symbols (C Am F G). Chords are displayed as block chords on the staff.

| Port | Name | Type | |
|---|---|---|---|
| input | Progression | text |  |
| output | SVG | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Progression | text | `I V vi IV` |  | Roman numeral progression or chord symbols (e.g. C Am F G). |
| Key | text | `C` |  | Progression key. Accepts a bare tonic (« A ») or a full label (« A minor »), as emitted by « Harmonic Analysis » — the named mode then wins over « Scale ». |
| Scale | choice | major | major / minor | Scale the degrees are read in, when the key names no mode. In minor, III, VI and VII drop a semitone. |
| Clef | choice | treble | treble / bass / alto / tenor | Staff clef. |
| Width | number | 500 px | 200 – 1000 px, step 10 | SVG width. |
| Height | number | 160 px | 100 – 400 px, step 10 | SVG height. |

#### VexFlow Staff

`vexflow-portee` · Visualization → Notation

*Displays a musical staff from a text notation.*

Generates a musical staff (SVG) from a text notation. Format: note/octave/duration, e.g. « C4/q D4/8 E4/8 F4/q G4/q ». Durations are w, h, q, 8, 16, 32. Chords use +: « C4+E4+G4/q ». Connect the SVG output to a « Text output » node or view it directly in the node.

| Port | Name | Type | |
|---|---|---|---|
| input | Notation | text |  |
| output | SVG | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notation | text | `C4/q D4/8 E4/8 F4/q G4/q` |  | Notes to display. Format: note/octave/duration (e.g. C4/q, D4/8, F#4/q, C4+E4+G4/q). |
| Clef | choice | treble | treble / bass / alto / tenor | Staff clef. |
| Width | number | 500 px | 200 – 1000 px, step 10 | SVG width. |
| Height | number | 160 px | 100 – 400 px, step 10 | SVG height. |

#### VexFlow Tab

`vexflow-tab` · Visualization → Notation

*Displays a tablature from a text notation.*

Generates a tablature (SVG) from a string-fret text notation. Format: « string-fret/duration », e.g. « 6-3/q 5-0/q 5-2/q 4-0/q 5-3/q ». The « Tuning » parameter sets the title (guitar, ukulele, bass).

| Port | Name | Type | |
|---|---|---|---|
| input | Tablature | text |  |
| output | SVG | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tablature | text | `6-3/q 5-0/q 5-2/q 4-0/q 5-3/q` |  | Tablature to display. Format: string-fret/duration (e.g. 6-3/q = 6th string, 3rd fret, quarter note). |
| Tuning | choice | Standard guitar | Standard guitar / Ukulele / Bass | Tuning displayed in title (notation remains string-fret). |
| Width | number | 500 px | 200 – 1000 px, step 10 | SVG width. |
| Height | number | 160 px | 100 – 400 px, step 10 | SVG height. |

## Outputs

### Export

| Component | Summary |
|---|---|
| [Image Export](#image-export) | Saves an image to disk and returns its path. |
| [SVG Export](#svg-export) | Saves an SVG file to disk and returns its path. |

#### Image Export

`export-image` · Outputs → Export

*Saves an image to disk and returns its path.*

Saves an image file to the working directory. Connect the 'Image' output of a Songsee node or any other image-producing node. The saved file path is emitted on the 'Path' output. Requires Electron.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Path | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Name | text | `export.png` |  | Output image filename (in the working directory). The extension is adapted to the actual image format. |

#### SVG Export

`export-svg` · Outputs → Export

*Saves an SVG file to disk and returns its path.*

Saves an SVG file to disk and returns its path. Connect an 'Image' output producing an SVG (e.g. the « SVG Reader ») to the input. The saved file path is emitted on the 'Path' output. The output extension is forced to .svg. Requires Electron.

| Port | Name | Type | |
|---|---|---|---|
| input | SVG | image |  |
| output | Path | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Name | text | `export.svg` |  | Output SVG filename (in the working directory). The extension is forced to .svg. |

### Monitoring

| Component | Summary |
|---|---|
| [A/B Comparator](#ab-comparator) | Compares two signals at matched level; toggles A/B listening. |
| [Audio output](#audio-output) | Final output. Plays the received signal and enables export. |
| [Listening Point](#listening-point) | Auditions the signal at a point in the chain without interrupting it. |
| [MIDI Listening Point](#midi-listening-point) | Auditions the MIDI without interrupting the chain. |
| [MIDI output](#midi-output) | Receives a MIDI file, synthesizes it to audio and passes it along. |
| [Text Output](#text-output) | Displays received text and allows copying or downloading. |

#### A/B Comparator

`comparateur-ab` · Outputs → Monitoring

*Compares two signals at matched level; toggles A/B listening.*

Compares two sources (A and B) by toggling which one you hear, at matched level for a fair comparison (the louder one otherwise seems better). Ideal to judge the effect of a process: connect the original signal to A and the processed one to B.

| Port | Name | Type | |
|---|---|---|---|
| input | A | audio |  |
| input | B | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Listen | choice | A | A / B | Which input is sent to the output and heard. |
| Match levels | choice | Yes | Yes / No | Brings the heard signal to the same peak level, for a fair comparison (the louder one otherwise seems « better »). |

#### Audio output

`sortie-audio` · Outputs → Monitoring

*Final output. Plays the received signal and enables export.*

Final output: plays the received signal, applies the volume and enables export. Also provides the track duration.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Duration | control |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Volume | number | 100 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Listening Point

`point-ecoute` · Outputs → Monitoring

*Auditions the signal at a point in the chain without interrupting it.*

Intermediate listening point: lets you audition the signal at a spot in the chain without interrupting it.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### MIDI Listening Point

`point-ecoute-midi` · Outputs → Monitoring

*Auditions the MIDI without interrupting the chain.*

Intermediate listening point for MIDI: lets you audition the MIDI signal at a spot in the chain without interrupting it. The received MIDI is passed through unchanged to the output.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### MIDI output

`sortie-midi` · Outputs → Monitoring

*Receives a MIDI file, synthesizes it to audio and passes it along.*

Receives a MIDI file, synthesizes it to audio (FM or SoundFont) and passes along the audio, the MIDI and the duration.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Duration | control |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset to use, or Follow MIDI to use the program/bank changes already in the MIDI file. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Text Output

`sortie-texte` · Outputs → Monitoring

*Displays received text and allows copying or downloading.*

Displays the text received on its input (blue port). The text is shown in the node with a copy button (⧉) to paste elsewhere. Connect the output of an AI script generator, translator, chord detector, AI-generated lyrics or any other text-producing node.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

*No parameters.*

## Collections

### Analysis

| Component | Summary |
|---|---|
| [Audio Similarity](#audio-similarity) | Audio similarity: aligns two tracks that differ in tempo/duration (Dynamic Time Warping on the chromagram) and measures their similarity once aligned. |
| [Track classification](#track-classification) | Groups a collection of tracks by similarity (audio features → PCA → KMeans/GMM) and estimates each track's probability of belonging to each group. |

#### Audio Similarity

`alignement-dtw` · Collections → Analysis

*Audio similarity: aligns two tracks that differ in tempo/duration (Dynamic Time Warping on the chromagram) and measures their similarity once aligned.*

Aligns two tracks that differ in tempo or duration (a slower cover, a remix, two takes of the same piece) via Dynamic Time Warping on their chromagram (frame by frame, ~11.6 ms). The optimal path is computed using checkpointed blocks (O(√n·m) memory instead of O(n·m)): memory is no longer the limiting factor, only compute time stays quadratic — the « Max analyzed duration » parameter (centered excerpt per track, 3 min by default) therefore bounds time, not memory. Two text outputs: « Similarity », a normalized [0, 1] score (1 = identical, 0 = unrelated — the optimal path's cumulative cost divided by its length, independent of track duration), and « Alignment path », as JSON: `{ chemin: [{i, j}, ...], debutEchantillonA }` — the frame-by-frame correspondence between the two tracks, plus the offset (in samples) where Track A's excerpt was taken from its original buffer, so a downstream node (Time Stretch (DTW)) can locate itself without needing the same « Max analyzed duration » again. Does NOT produce re-stretched audio: this is deliberately a separate node — connect « Alignment path » (and the same Track A) to Time Stretch (DTW) for that.

| Port | Name | Type | |
|---|---|---|---|
| input | Track to process | audio | required |
| input | Reference track | audio | required |
| output | Similarity | text |  |
| output | Alignment path | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Max analyzed duration | number | 180 s | 10 – 600 s, step 10 | Maximum duration (centered excerpt) analyzed per track. No longer memory-constrained (checkpointed computation), but compute time stays quadratic: roughly 2 s for 1 min per track, ~10 s for 2 min, ~35-55 s for 4-5 min. |

#### Track classification

`classification-pistes` · Collections → Analysis

*Groups a collection of tracks by similarity (audio features → PCA → KMeans/GMM) and estimates each track's probability of belonging to each group.*

Loads a folder of audio tracks, reduces each to a 40-feature vector (tempo, spectral centroid, chroma, MFCC), standardizes them, then projects them via PCA. A KMeans (fixed k or automatic search via the Calinski-Harabasz index) groups the tracks in the reduced space, then a Gaussian mixture (GMM) estimates each track's probability of belonging to each group. Five outputs: three structured text (JSON) streams — the classification report (group + probabilities per track), the 2D coordinates, and each track's 3 nearest neighbors (Euclidean distance in the clustering's PCA space) — reusable by another node or software (e.g. Coordinates on Map) — and two SVG image outputs: a scatter plot (first 2 PCA axes, hover = track name) and a readable table of per-group averages on the original variables (variables as rows, groups as columns), colored by deviation from each row's cross-group average to spot at a glance what distinguishes the groups. Requires at least 3 decodable tracks. Requires Electron.

| Port | Name | Type | |
|---|---|---|---|
| output | Report | text |  |
| output | Coordinates | text |  |
| output | Nearest neighbors | text |  |
| output | Chart | image |  |
| output | Group averages | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Folder | folder | — |  | Folder containing the audio tracks to classify. |
| PCA axes | number | 5 | 2 – 20, step 1 | Number of PCA axes kept for clustering (always at least 2, for visualization). |
| Number of groups | number | 0 | 0 – 20, step 1 | 0 = automatic search (Calinski-Harabasz index) up to the ceiling below. A positive value fixes the number of groups. |
| Auto ceiling | number | 10 | 2 – 30, step 1 | Maximum number of groups tested in automatic search (ignored if Number of groups > 0). |
| Seed | number | 1 | 1 – 9999, step 1 | Initialization seed (K-means++/GMM) — same tracks and same seed ⇒ same result. |

### Conversion

| Component | Summary |
|---|---|
| [MIDI→MP3 conversion](#midimp3-conversion) | Converts a folder of MIDI files to MP3. |
| [MP3→WAV conversion](#mp3wav-conversion) | Converts a folder of MP3 files to WAV. |
| [WAV→MP3 conversion](#wavmp3-conversion) | Converts a folder of audio files to MP3. |

#### MIDI→MP3 conversion

`collection-midi-vers-mp3` · Collections → Conversion

*Converts a folder of MIDI files to MP3.*

Batch-processes a folder: synthesizes all MIDI files and exports them as MP3 in the output folder (Electron).

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Input folder | folder | — |  | Folder containing the files to process. |
| Output folder | folder | — |  | Folder where the converted files are written. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Quality | number | 192 kbps | 64 – 320 kbps | MP3 encoding bitrate, in kbps (higher = better quality, larger file). |

#### MP3→WAV conversion

`collection-mp3-vers-wav` · Collections → Conversion

*Converts a folder of MP3 files to WAV.*

Batch-processes a folder: converts all MP3 files to WAV in the output folder (Electron).

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Input folder | folder | — |  | Folder containing the files to process. |
| Output folder | folder | — |  | Folder where the converted files are written. |

#### WAV→MP3 conversion

`collection-vers-mp3` · Collections → Conversion

*Converts a folder of audio files to MP3.*

Batch-processes a folder: converts all audio files (WAV, OGG…) to MP3 in the output folder (Electron).

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Input folder | folder | — |  | Folder containing the files to process. |
| Output folder | folder | — |  | Folder where the converted files are written. |
| Quality | number | 192 kbps | 64 – 320 kbps | MP3 encoding bitrate, in kbps (higher = better quality, larger file). |

### Export

| Component | Summary |
|---|---|
| [Coordinates on Map](#coordinates-on-map) | Projects 2D coordinates received as input (e.g. the Coordinates output of Track classification) onto a fictional map — same visual engine (style, aesthetic) as Sound Map, but point position reflects upstream-computed similarity instead of being random. |
| [Exhibition Gallery](#exhibition-gallery) | Generates a visual HTML gallery with procedural cover art from a directory of MP3 files. |
| [Sound Map](#sound-map) | Loads an audio folder and generates an interactive HTML map of a fictional city or a concentric map with several aesthetics, openable in a browser. |

#### Coordinates on Map

`coordonnees-sur-carte` · Collections → Export

*Projects 2D coordinates received as input (e.g. the Coordinates output of Track classification) onto a fictional map — same visual engine (style, aesthetic) as Sound Map, but point position reflects upstream-computed similarity instead of being random.*

A Sound Map variant driven by data instead of a folder: connect a classification node's « Coordinates » output (e.g. Track classification) to position points according to computed similarity, instead of random placement. The backdrop (roads, districts, buildings) stays procedural — same Style and Aesthetic as Sound Map. If the same classification node's « Report » output is also connected, each point takes its group's color instead of the usual palette cycle. Requires Electron.

| Port | Name | Type | |
|---|---|---|---|
| input | Report | text |  |
| input | Coordinates | text | required |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Output folder | folder | — |  | Folder where index.html and the sounds will be generated. |
| Title | text | `Coordinates on Map` |  | Title of the HTML page. |
| Style | choice | Grid city | Grid city / Concentric circles / Organic / Voronoi | Map style. |
| Aesthetic | choice | Classic | Classic / Baroque / Art Nouveau / Art Deco / Exotic | Visual mood of the map (backdrop: roads, districts, buildings). |
| Seed | slider | 0 | 0 – 9999, step 1 | Procedural backdrop seed (0 = different backdrop each run). Does not affect point position, which follows the received coordinates. |

#### Exhibition Gallery

`galerie-exposition` · Collections → Export

*Generates a visual HTML gallery with procedural cover art from a directory of MP3 files.*

Generates a visual HTML gallery with cover art from a directory of MP3 files. Each track cover is extracted from the MP3's ID3 tag if available, otherwise procedurally generated (SVG). Requires Electron.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Title | text | `My gallery` |  | Title displayed at the top of the gallery. |
| MP3 directory | folder | — |  | Path to the directory containing MP3 files (.mp3 only). |
| Output directory | folder | — |  | Directory where to generate the gallery (index.html + copied MP3s). |
| Visual seed | number | 0 | 0 – 99999, step 1 | Seed for procedural cover art (0 = random). Same seed = same covers. |

#### Sound Map

`carte-sonore` · Collections → Export

*Loads an audio folder and generates an interactive HTML map of a fictional city or a concentric map with several aesthetics, openable in a browser.*

Loads a folder of audio files and generates a fictional city map on each run. Colored points are placed on the map: click a point to hear the associated sound. Parameters: Path (folder), Seed (reproducibility of the city), Points (maximum number of sounds shown). Requires Electron.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Path | folder | `music collection` |  | Source audio folder. |
| Output folder | folder | — |  | Folder where index.html and the sounds will be generated. |
| Title | text | `Sound Map` |  | Title of the HTML page. |
| Style | choice | Grid city | Grid city / Concentric circles / Organic / Voronoi | Map style. |
| Aesthetic | choice | Classic | Classic / Baroque / Art Nouveau / Art Deco / Exotic | Visual mood of the map. |
| Seed | slider | 0 | 0 – 9999, step 1 | Map seed (0 = new map each run). |

### Playback

| Component | Summary |
|---|---|
| [Music player](#music-player) | Simple player to preview a music folder (shuffle, loop, volume control). |

#### Music player

`collection-lecteur-musique` · Collections → Playback

*Simple player to preview a music folder (shuffle, loop, volume control).*

Simple player with no input or output. Select a music folder, pick a track, then press ▶ to play. Includes shuffle, loop, volume and a progress bar. Requires Electron.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Path | folder | `music collection` |  | Folder containing WAV/MP3 files to play. |
| Volume | slider | 80 % | 0 – 100 % | Player volume. |
| Shuffle | choice | Off | Off / On | Play tracks in random order. |
| Loop | choice | Off | Off / On | Repeat the playlist in a loop. |

## Meta-components

### Boundary

| Component | Summary |
|---|---|
| [▸ Exposed input](#-exposed-input) | Exposed input point of a meta-component. |
| [Exposed output ◂](#exposed-output-) | Exposed output point of a meta-component. |

#### ▸ Exposed input

`__entree-frontiere` · Meta-components → Boundary

*Exposed input point of a meta-component.*

Inside a meta-component, connect this block to an inner node's input: it creates an exposed input on the meta. Type is inherited from the connected port.

| Port | Name | Type | |
|---|---|---|---|
| output | Input | audio |  |

*No parameters.*

#### Exposed output ◂

`__sortie-frontiere` · Meta-components → Boundary

*Exposed output point of a meta-component.*

Inside a meta-component, connect an inner node's output to this block: it creates an exposed output on the meta. Type is inherited from the connected port.

| Port | Name | Type | |
|---|---|---|---|
| input | Output | audio |  |

*No parameters.*

## Others

### Csound wrapper

| Component | Summary |
|---|---|
| [Csound](#csound) | Runs a Csound orchestra and score, and outputs the audio produced. |
| [Csound Effect](#csound-effect) | Processes one or two sounds through a Csound orchestra. |
| [Csound Instrument](#csound-instrument) | Plays a MIDI file with a Csound orchestra: each note becomes a score event. |
| [Csound Instruments](#csound-instruments) | Perry Cook's instruments as Csound carries them: bowed string, clarinet, flute, brass, plucked string, formants. |
| [Csound Spectral](#csound-spectral) | Spectral morphing, vocoder and phase-locked stretching, through Csound's streaming spectral opcodes. |

#### Csound

`csound` · Others → Csound wrapper

*Runs a Csound orchestra and score, and outputs the audio produced.*

Runs a Csound orchestra and score. Csound descends from MUSIC V, the line that invented digital synthesis: Barry Vercoe wrote it at MIT in 1986, it now counts some nineteen hundred opcodes, and its WebAssembly port lets it run here with nothing to install. What it brings to Attic is not one more effect, it is a LANGUAGE, where nodes are fixed tools. A Csound program has two parts, and that separation is its signature: the ORCHESTRA defines instruments, the SCORE says when to play them and with which arguments. « i1 0 1 220 0.5 » plays instrument 1 at time zero for one second, passing it 220 and 0.5 as p4 and p5. A few points the node handles for you, and which are worth knowing. The sampling rate is IMPOSED by the sound card, often 48 kHz, and Csound ignores requests to the contrary: do not write sr in your orchestra, the node then brings the result back to 44100 Hz like all of Attic, and that conversion is good — 83 dB signal-to-error at 10 kHz. The output is LIMITED below unity, because Csound bounds nothing and a badly set orchestra returns peaks above two; the original peak is reported. The orchestra and the score are written in the inspector, but they can also COME FROM THE GRAPH: the Orchestra and Score inputs accept text, and a connected input takes precedence over the matching field, which then remains the worked example. Any Attic node that outputs text thus becomes a score source. The score has three possible sources, in this order: a connected MIDI file first — each note becoming an « i1 » event with the frequency in p4, the amplitude in p5 and the note number in p6 —, then the Score input, then the field. The node STATES in its message which of the three it took, and flags a connected input that was not used: it has three and named none. A sound connected to the Audio input is written into Csound's filesystem as « entree1.wav » and is heard ONLY if the orchestra reads it, with « a1 diskin2 "entree1.wav", 1 » — failing which the node warns you that the sound is never read, instead of returning an unchanged sound without a word; it is written in MONO by default, because diskin2 requires the number of outputs asked for to match the file's channel count and refuses the note otherwise — a trap whose only trace is a line buried in the messages. Finally, set the seed if you use random opcodes: Attic requires a render to be reproducible.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | MIDI | MIDI |  |
| input | Orchestra | text |  |
| input | Score | text |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Orchestra | text | `; A minimal instrument: p4 = frequency, p5 = amplitude. i…` |  | The instruments, in Csound language, used when no Orchestra input is connected. A sound connected to the Audio input is written as « entree1.wav » and is heard ONLY if the orchestra reads it, with « a1 diskin2 "entree1.wav", 1 ». The sampling rate and 0dbfs are set by the node: do not write sr or 0dbfs. |
| Score | text | `i1 0.0 1.0 220 0.5 i1 1.0 1.0 277 0.5 i1 2.0 1.5 330 0.6 e` |  | When to play what. « i1 0 1 220 0.5 » plays instrument 1 at time 0 for 1 second, with 220 and 0.5 as p4 and p5. Three possible sources, in order of precedence: a connected MIDI file, then the Score input, then this field — and the node states in its message which one it took. The final « e » is added if missing. |
| Channels | choice | Mono | Mono / Stereo | Number of channels in the orchestra. In stereo, use outs instead of out. |
| Block size | number | 32 | 1 – 512, step 1 | ksmps, the number of samples computed per control cycle. Small means finer control signals and slower computation; 32 is the common choice. |
| Seed | number | 1 | 0 – 999999, step 1 | Seed of the random opcodes. Csound is reproducible as soon as it is fixed, which Attic requires: 0 lets Csound draw its own and the render changes on every run. |
| Input channels | choice | Mono | Mono / Stereo | Number of channels in the input files written for Csound. In mono, « a1 diskin2 "entree1.wav", 1 » always works; in stereo, diskin2 REQUIRES two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Effect

`csound-effet` · Others → Csound wrapper

*Processes one or two sounds through a Csound orchestra.*

Processes one or two sounds through a Csound orchestra. The inputs are written into Csound's filesystem as « entree1.wav » and « entree2.wav », and read with diskin2 or soundin — they are therefore FILES rather than streams, which has a useful consequence: they can be read back at another speed, looped, reversed, or loaded into a table for block processing. The score's duration is set from the longest input plus the requested tail, which is essential as soon as a delay or a reverb has something to let die away. « Input channels » deserves a word, because it is the trap that costs the most time: diskin2 REQUIRES the number of outputs asked for to match the file's channel count. « a1 diskin2 » on a stereo file refuses the note and returns nothing but silence, with a single line buried in the messages as its only trace. The inputs are therefore downmixed to mono by default; switch to stereo if your orchestra writes « a1, a2 diskin2 ». The default orchestra is a modulated delay, there to show the shape of a process rather than for its musical interest. It is written in the inspector, but it can also COME FROM THE GRAPH: the Orchestra input accepts text and takes precedence over the field, which the node announces in its message. Finally, a connected sound the orchestra never names has NO effect — the file is written, nobody reads it — and that is the most puzzling result there is, since the rendered sound then has nothing to do with the one that was connected; the node therefore checks that « entree1.wav » and « entree2.wav » are really read, comments stripped, and warns you otherwise.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio 1 | audio |  |
| input | Audio 2 | audio |  |
| input | Orchestra | text |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Orchestra | text | `; The inputs are files: entree1.wav and entree2.wav. inst…` |  | The processing orchestra, used when no Orchestra input is connected — a connected input replaces it, and the node says so. The input sounds are written into Csound's filesystem as « entree1.wav » and « entree2.wav », and read with diskin2 or soundin; a connected sound the orchestra does not name has no effect, and the node warns you. The score's duration is set from the longest input. |
| Channels | choice | Mono | Mono / Stereo | Number of channels in the orchestra. |
| Tail | number | 1 s | 0 – 20 s, step 0.1 | Time added after the input ends, to let a delay or reverb breathe. |
| Block size | number | 32 | 1 – 512, step 1 | ksmps, the number of samples per control cycle. |
| Seed | number | 1 | 0 – 999999, step 1 | Seed of the random opcodes. |
| Input channels | choice | Mono | Mono / Stereo | Number of channels in the input files written for Csound. In mono, « a1 diskin2 "entree1.wav", 1 » always works; in stereo, diskin2 REQUIRES two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Instrument

`csound-instrument` · Others → Csound wrapper

*Plays a MIDI file with a Csound orchestra: each note becomes a score event.*

Plays a MIDI file with a Csound orchestra. Each note becomes a score event, and instrument 1 is called for every one of them. The argument convention is that of Csound's own examples, and it avoids any conversion: p4 carries the FREQUENCY in hertz, p5 the amplitude from zero to one, p6 the MIDI note number for whoever needs it. This is what allows any MIDI source in Attic — the L-system, the Markov chain, Nørgård's series, the Tonnetz — to be plugged into an orchestra written once. « Tail » adds time after the last note: without it, a reverb or a resonance would be cut off at the end of the score, which is the commonest flaw of an offline render. Technically that time comes from an « f0 » holding the score open, which is the canonical way to do it in Csound. The orchestra is written in the inspector, but it can also COME FROM THE GRAPH: the Orchestra input accepts text, and a connected input takes precedence over the field, which then remains the worked example — the node announces it in its message, so nobody wonders why the field before their eyes does nothing. As with the general Csound node: do not write sr, the node brings the output back to 44100 Hz, limits it below unity, and set the seed so the render reproduces.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| input | Orchestra | text |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Orchestra | text | `; A minimal instrument: p4 = frequency, p5 = amplitude. i…` |  | Instrument 1 is called for each note. The score passes it the FREQUENCY in hertz in p4, the amplitude from 0 to 1 in p5, and the MIDI note number in p6 — so that no conversion is ever needed. This field is used when no Orchestra input is connected; a connected input replaces it, and the node says so. |
| Channels | choice | Mono | Mono / Stereo | Number of channels in the orchestra. |
| Block size | number | 32 | 1 – 512, step 1 | ksmps, the number of samples per control cycle. |
| Tail | number | 0.5 s | 0 – 10 s, step 0.1 | Time added after the last note, so resonances have room to die away. Without it, a reverb is cut off at the end of the score. |
| Seed | number | 1 | 0 – 999999, step 1 | Seed of the random opcodes, so the render is reproducible. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Instruments

`csound-instruments-physiques` · Others → Csound wrapper

*Perry Cook's instruments as Csound carries them: bowed string, clarinet, flute, brass, plucked string, formants.*

Csound's physical-model instruments, adjustable without writing a line of code. These are Perry Cook's and Julius Smith's models, carried into Csound and debugged for thirty years — and the bowed string is precisely the one Attic failed to write by hand: its Helmholtz regime, the thing that separates a bow from a mere resonator, is settled here. Six opcodes: bowed string (wgbow), clarinet (wgclar), flute (wgflute), brass (wgbrass), plucked string (wgpluck2) and formants (fof2). The three controls — Pressure, Position, Vibrato — do not mean the same thing from one instrument to the next, and that is accepted: Pressure is the violin's bow pressure, the clarinet's reed stiffness, the flute's breath, the brass's lip tension, and the plucked string's reflection, which sets its decay. Position is the bow's contact point, the air jet ratio, the attack time or the formant frequency, and it is the most sensitive control of most of them. One detail that is not a detail: each opcode's output gain was MEASURED and corrected in the node, because wgclar is twelve times quieter than wgbow at comparable settings. Without that correction one would spend all one's time chasing the volume when changing instrument, and the library would be unusable.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Bowed string (wgbow) | Bowed string (wgbow) / Clarinet (wgclar) / Flute (wgflute) / Brass (wgbrass) / Plucked string (wgpluck2) / Formants (fof2) | The opcode used. The bowed string is the one Attic could not write by hand: its Helmholtz model has been debugged here for thirty years. Each instrument uses the three settings below in its own way, detailed in the notice. |
| Note | text | `A3` |  | Note played when no MIDI is connected. |
| Pressure | number | 40 % | 0 – 100 %, step 1 | Bow pressure, reed stiffness, breath or lip tension depending on the instrument. |
| Position | number | 25 % | 0 – 100 %, step 1 | Bow position, air jet ratio, attack time or formant frequency depending on the instrument. It is the most sensitive control of most of them. |
| Vibrato | number | 20 % | 0 – 100 %, step 1 | Vibrato depth. No effect on the plucked string and the formants. |
| Vibrato rate | number | 6 Hz | 0.5 – 12 Hz, step 0.1 | Vibrato speed. |
| Duration | number | 2 s | 0.1 – 20 s, step 0.1 | Note duration, when no MIDI is connected. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Spectral

`csound-spectral` · Others → Csound wrapper

*Spectral morphing, vocoder and phase-locked stretching, through Csound's streaming spectral opcodes.*

Csound's spectral processes, unmatched elsewhere for simplicity. The « pvs » opcodes work on a spectral STREAM rather than on frames passed by hand: pvsanal analyses, the opcode transforms, pvsynth resynthesises, and a morphing chain is written in four lines. Three processes, and Attic had no equivalent of any of them. The CROSS (pvscross) keeps the first sound's frequencies and imposes the second's levels: a voice taking on a drum kit's dynamics. The VOCODER (pvsvoc) does the opposite — the first gives its spectral envelope, hence its formants, the second its excitation: this is the vocoder proper, the robot-voice one, but done in the spectral domain rather than with a filter bank. The STRETCH (mincer) lengthens a sound without changing its pitch and changes its pitch without touching its length, phase-locked, which avoids the smearing of naive stretches. The window size is the usual trade-off: large gives fine frequency resolution but smeared transients; small the opposite. Two neighbouring opcodes were tried and set aside, and that is worth saying: partikkel, Csound's most complete granular synthesis, refused three formulations of its forty-one arguments; pvsmorph compiles, finishes cleanly, reports no error and writes NOTHING. The general Csound node remains available for whoever can make them speak.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio 1 | audio |  |
| input | Audio 2 | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Process | choice | Spectral cross (pvscross) | Spectral cross (pvscross) / Spectral vocoder (pvsvoc) / Phase-locked stretch (mincer) | The opcode used. The first three need TWO sounds and cross them; the stretch needs only one. Attic had no spectral morphing before these. |
| Morph | number | 50 % | 0 – 100 %, step 1 | Amount of crossing between the two sounds. For the stretch, this is the time factor: at 25 %, the sound lasts twice as long. |
| Transpose | number | 0 st | -24 – 24 st, step 1 | Transposition, used by the stretch only: it changes the pitch without touching the duration, which is the whole point of a phase-locked stretch. |
| Window | choice | 1024 | 512 / 1024 / 2048 | Transform size. Large gives fine frequency resolution and smeared transients; small the opposite. 1024 is the usual compromise. |
| Tail | number | 0.5 s | 0 – 30 s, step 0.5 | Time added to the processed duration. Essential for the stretch, which lengthens the sound. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

### Generation

| Component | Summary |
|---|---|
| [Camelot Wheel](#camelot-wheel) | Musical journey on the Camelot wheel to illustrate harmonic transitions. |
| [Color → Sound AI](#color--sound-ai) | Generates a Suno/Udio script via AI from 1 or 2 colors with variability. |
| [Color Looper](#color-looper) | Step sequencer where each step is a color. |
| [Cover Art Generator](#cover-art-generator) | Generates a procedural album cover (SVG) from a prompt + title. |
| [Harmonic Palette](#harmonic-palette) | Extracts dominant colors from an image and generates a melody, harmony or arpeggio. |
| [Julia Processor](#julia-processor) | Julia code editor with syntax highlighting for audio processing. |
| [Pixeltone](#pixeltone) | Converts an image to sound by mapping R, G, B to frequencies. |
| [Python Processor](#python-processor) | Python code editor with syntax highlighting for audio processing. |
| [RGB Color](#rgb-color) | Synthesizes an RGB color into three oscillators (R, G, B). |
| [Sound Drawing](#sound-drawing) | Sonifies the colored shapes of a drawing image into notes or chords. |
| [Visible Spectrum](#visible-spectrum) | Transposes the frequency of a visible color (wavelength) into the audible range. |

#### Camelot Wheel

`camelot` · Others → Generation

*Musical journey on the Camelot wheel to illustrate harmonic transitions.*

Travels the Camelot wheel to illustrate harmonic transitions used by DJs. Each slot (4B, 7A, 12B…) maps to a key (ring A = minor, B = major). The node generates an audio/MIDI journey plus an SVG visualization: full circle, compatible moves (+1, -1, same number, +7) or random walk. Chords are played as block or arpeggio. Connect the MIDI output to a MIDI output node to listen, or use the direct Audio output. The Image output can be connected to an Image Renderer or SVG Export.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Image | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Start | text | `4B` |  | Starting code on the wheel (e.g. 4B, 7A, 12B). Ring A = minor, B = major. |
| Journey | choice | Full | Full / Neighbors / Random | Full = around the wheel; Neighbors = compatible moves (+1, -1, same number, +7); Random = random walk between neighbors. |
| Steps | number | 12 | 1 – 24, step 1 | Number of chords generated. |
| Octave | number | 3 | 2 – 5, step 1 | Base octave for chords. |
| Tempo | number | 120 BPM | 40 – 240 BPM | Journey speed. |
| Note duration | number | 0.75 | 0.05 – 2, step 0.05 | Duration of each chord as a fraction of a beat (1 = quarter, 0.5 = eighth). |
| Mode | choice | Block | Block / Arpeggio | Block = chord notes together; Arpeggio = notes played sequentially. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed for the journey; no effect outside the "Random" mode. 0 = drawn at random on every run, and shown in the message so it can be copied back here; any other value replays the same journey. |

#### Color → Sound AI

`couleur-suno-ia` · Others → Generation

*Generates a Suno/Udio script via AI from 1 or 2 colors with variability.*

Generates a Suno/Udio script via AI by combining color psychology and a LLM (DistilGPT-2). Select 1 or 2 colors — each color is mapped to a musical profile (emotion, mode, tempo, instruments, styles, vocals). The structured profile is then enriched by the LLM which generates a creative and unique prompt. Variability (0-100%) controls the LLM temperature: high = very creative and different scripts each time; low = scripts close to the template. The seed ensures reproducibility. The final script combines the structured profile + AI prompt + tags. Dependency: @huggingface/transformers (model download on first use, ~330 MB, cached).

| Port | Name | Type | |
|---|---|---|---|
| output | Script | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Color 1 | choice | Blue | Red / Orange / Yellow / Green / Blue / Purple / Pink / Black / White / Brown / Grey | First color (psychological mapping → emotion, mode, tempo, instruments, styles). |
| Color 2 | choice | (none) | (none) / Red / Orange / Yellow / Green / Blue / Purple / Pink / Black / White / Brown / Grey | Optional second color. If present, profiles are fused. |
| Variability | number | 70 % | 0 – 100 %, step 1 | Controls variability of generated scripts. High = LLM is more creative; low = stays close to template. |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new script each run). Same seed = same script. |

#### Color Looper

`color-looper` · Others → Generation

*Step sequencer where each step is a color.*

Step sequencer where each step is a color. Enter a list of colors (hex or rgb), comma-separated; the node loops over the colors and generates a note (or chord) per step. Hue determines the scale degree, lightness the octave, saturation the velocity. Parameters: color list, key, scale, mode, octave, range, tempo, note duration, number of bars, synthesis, instrument and volume. Audio output + MIDI output.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Colors | colour list | #e63946,#2a9d8f,#e9c46a,#8e6fce |  | Color palette. Each color = one step of the sequencer. |
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note of the scale. |
| Scale | choice | major | major / minor / dorian / phrygian / lydian / mixolydian / locrian / major pentatonic / minor pentatonic / blues / chromatonic | Scale used (7 modes + 2 pentatonic scales, in addition to blues and chromatic). |
| Mode | choice | Melody | Melody / Harmony / Arpeggios | Melody = one note per step; Harmony = triad chord per step; Arpeggios = chord notes played in quick succession. |
| Octave | number | 4 | 2 – 6, step 1 | Base octave. |
| Range | number | 2 | 1 – 3, step 1 | Allowed octave variation from lightness. |
| Tempo | number | 120 BPM | 40 – 240 BPM | Sequencer speed. |
| Note duration | number | 0.5 | 0.05 – 2, step 0.05 | Duration of each note as a fraction of a beat (1 = quarter, 0.5 = eighth, 0.25 = sixteenth). |
| Bars | number | 2 | 1 – 16, step 1 | Number of repetitions of the color pattern. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |

#### Cover Art Generator

`generateur-pochette` · Others → Generation

*Generates a procedural album cover (SVG) from a prompt + title.*

Generates procedural album cover art in SVG — offline, instant, no GPU or download. Enter a prompt (colors derived from keywords), a title and artist (inserted in the image), choose a visual style (12 styles), a palette (15 presets or auto), complexity, a border, a typography and dimensions. The « Image » output is a chainable SVG that can be connected to an Image Renderer, Image Export or SVG Export. The seed allows reproducing the exact same cover.

| Port | Name | Type | |
|---|---|---|---|
| output | Image | image |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `dark ambient night mysterious` |  | Style description. Colors are derived from keywords (fire/red, water/blue, nature/green, night/black, day/yellow, dream/purple, earth/brown…). |
| Title | text | `Album` |  | Album title (inserted in the image). |
| Artist | text | — |  | Artist name (inserted below the title). |
| Style | choice | Bauhaus | Minimalist / Geometric / Waves / Grain / Concentric / Bauhaus / Stripes / Mosaic / Stars / Brutalism / Cyber / Pastel | Visual style. Minimalist = simple gradient; Geometric = shape grid; Waves = layered waves; Grain = noisy texture; Concentric = circles; Bauhaus = primary shapes; Stripes = bands; Mosaic = tiles; Stars = star field; Brutalism = raw shapes; Cyber = grid + glitch; Pastel = soft blobs. |
| Palette | choice | Auto | Auto / Warm / Cold / Neon / Pastel / Monochrome / Earth / Royal / Synthwave / Sepia / Cyber / Forest / Ocean / Magma / Frost | Color palette. « Auto » derives colors from the prompt. Presets force a fixed mood. |
| Complexity | number | 50 | 1 – 100, step 1 | Motif density (1 = minimal, 100 = very dense). |
| Border | choice | None | None / Thin / Thick / Rounded | Decorative border around the cover. |
| Typography | choice | Sans-serif | Sans-serif / Serif / Mono / Condensed / Bold / Script | Title font style. |
| Width | number | 512 | 128 – 2048, step 1 | SVG image width in pixels. |
| Height | number | 512 | 128 – 2048, step 1 | SVG image height in pixels. |
| Format | choice | SVG | SVG / PNG | SVG: native vector format, scales losslessly (preferred). PNG: raster image rendered at Width × Height, for uses that cannot read vector files. |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new each run). Same seed = same cover. |

#### Harmonic Palette

`palette-harmonique` · Others → Generation

*Extracts dominant colors from an image and generates a melody, harmony or arpeggio.*

Extracts the dominant colors of an image and turns them into a musical sequence. Hue determines the scale degree, lightness chooses the octave, saturation affects velocity, and the horizontal position of the color determines when it plays. The node outputs audio and MIDI. Two modes: Melody (one note per color) and Harmony (triad chord per color). Parameters: key, scale, mode, octave, range (variation octaves), total duration, number of colors, reading order, synthesis (FM or SoundFont), instrument, volume and MIDI tempo.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note of the scale used. |
| Scale | choice | major | major / minor / dorian / phrygian / lydian / mixolydian / locrian / major pentatonic / minor pentatonic / blues / chromatonic | Scale used to map hues (7 modes + 2 pentatonic scales, in addition to blues and chromatic). |
| Mode | choice | Melody | Melody / Harmony / Arpeggio | Melody = one note per color; Harmony = triad chord per color; Arpeggio = triad chord played one note after another. |
| Octave | number | 4 | 2 – 6, step 1 | Base octave of generated notes. |
| Range | number | 2 | 1 – 3, step 1 | Number of octaves over which lightness can vary notes. |
| Duration | number | 8 s | 1 – 60 s, step 1 | Total duration of the audio/MIDI sequence. |
| Colors | number | 4 | 2 – 12, step 1 | Number of dominant colors to extract. |
| Order | choice | Horizontal | Horizontal / Vertical / Brightness / Saturation | Reading order of colors in the sequence. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |
| Tempo | number | 120 BPM | 40 – 240 BPM | Tempo of the MIDI file. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the palette extraction (k-means++ initialisation). The default is FIXED: the same image must yield the same colours on every run. Changing it may surface other dominant hues. |

#### Julia Processor

`julia-processor` · Others → Generation

*Julia code editor with syntax highlighting for audio processing.*

Julia code editor with syntax highlighting for audio, MIDI and text processing. Same architecture as the Python Processor. Variables: ARGS[2] = input WAV, ENV["ATTIC_OUTPUT_PATH"] = output WAV, ENV["ATTIC_SAMPLE_RATE"], ENV["ATTIC_CHANNELS"]. Requires Julia + WAV.jl package installed.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | MIDI | MIDI |  |
| input | Text | text |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Code | text | `# Julia Processor — audio processing # Environment variab…` |  | Julia code to execute. Variables: ARGS[2] = input WAV, ENV["ATTIC_OUTPUT_PATH"] = output WAV, ENV["ATTIC_SAMPLE_RATE"], ENV["ATTIC_CHANNELS"]. Requires WAV.jl package. |
| Timeout | number | 30 s | 5 – 120 s, step 5 | Maximum script execution time (in seconds). |

#### Pixeltone

`pixeltone` · Others → Generation

*Converts an image to sound by mapping R, G, B to frequencies.*

Converts an image to sound following the pixeltone.js principle: each pixel becomes a short sound slice whose red, green and blue channels are mapped to three frequency ranges. Adjust the duration per pixel and the RGB ranges to sculpt the result. Connect an image (generated or imported) to the input and get the audio on the output. Requires a browser environment to decode the image.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pixel duration | number | 0.01 s | 0.001 – 0.5 s, step 0.001 | Duration in seconds assigned to each image pixel. Lower values make the sound shorter. |
| Max width | number | 256 px | 32 – 1024 px, step 1 | Maximum width of the resized image before sonification. Controls the total audio duration. |
| Red (Hz) | text | `100,1000` |  | Frequency range for the red channel, comma-separated. |
| Green (Hz) | text | `500,3000` |  | Frequency range for the green channel, comma-separated. |
| Blue (Hz) | text | `1000,5000` |  | Frequency range for the blue channel, comma-separated. |
| Scan | choice | Horizontal | Horizontal / Vertical / Zigzag | Pixel reading order: row by row, column by column, or horizontal zigzag. |
| Channels | choice | Stereo | Mono / Stereo | Number of output audio channels. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the sound. |

#### Python Processor

`python-processor` · Others → Generation

*Python code editor with syntax highlighting for audio processing.*

Python code editor with syntax highlighting for audio processing. Input audio is converted to a temporary WAV and passed to the script via sys.argv[1]. The script must write the result to the path given by os.environ['ATTIC_OUTPUT_PATH']. Available variables: ATTIC_SAMPLE_RATE, ATTIC_CHANNELS. The default code reads the WAV, doubles the volume and writes the result. Requires Python + numpy installed on the machine. Python detection is automatic (python, python3, py) or via the ATTIC_PYTHON environment variable. Adjustable timeout (5-120s).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | MIDI | MIDI |  |
| input | Text | text |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Code | text | `import numpy as np import wave import os import sys # in…` |  | Python code to execute. Variables: sys.argv[1] = input WAV, ATTIC_OUTPUT_PATH = output WAV, ATTIC_SAMPLE_RATE, ATTIC_CHANNELS. Requires numpy + wave. |
| Timeout | number | 30 s | 5 – 120 s, step 5 | Maximum script execution time (in seconds). |

#### RGB Color

`couleur-rgb` · Others → Generation

*Synthesizes an RGB color into three oscillators (R, G, B).*

Synthesizes an RGB color into three sine-wave oscillators. Each channel (red, green, blue) controls the frequency of one oscillator within an adjustable range. Ideal for hearing a color as a composite timbre: gray = three close frequencies, pure color = one dominant channel. Parameters: Red/Green/Blue (0-255), frequency ranges for each channel, duration, volume and output channels.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Red | number | 128 | 0 – 255, step 1 | Red channel intensity (0-255). |
| Green | number | 128 | 0 – 255, step 1 | Green channel intensity (0-255). |
| Blue | number | 128 | 0 – 255, step 1 | Blue channel intensity (0-255). |
| Red (Hz) | text | `100,1000` |  | Frequency range for the red channel, comma-separated. |
| Green (Hz) | text | `500,3000` |  | Frequency range for the green channel, comma-separated. |
| Blue (Hz) | text | `1000,5000` |  | Frequency range for the blue channel, comma-separated. |
| Duration | number | 4 s | 0.1 – 60 s, step 0.1 | Duration of the generated sound. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |
| Channels | choice | Stereo | Mono / Stereo | Number of output audio channels. |

#### Sound Drawing

`dessin-sonore` · Others → Generation

*Sonifies the colored shapes of a drawing image into notes or chords.*

Sonifies the colored shapes of a drawing image (Kandinsky style). The node first extracts a palette of dominant colors, then detects connected regions of each color. Each shape becomes a note (Melody mode), a chord (Harmony mode) or a broken chord played one note after another (Arpeggio mode). Horizontal position determines timing, vertical position and color affect pitch, and shape size controls duration and velocity. Audio output + MIDI output. Parameters: key, scale, mode, octave, range, duration, number of colors, minimum shape size, synthesis, instrument, volume and tempo.

| Port | Name | Type | |
|---|---|---|---|
| input | Image | image |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note of the scale. |
| Scale | choice | major | major / minor / dorian / phrygian / lydian / mixolydian / locrian / major pentatonic / minor pentatonic / blues / chromatonic | Scale used to map hues (7 modes + 2 pentatonic scales, in addition to blues and chromatic). |
| Mode | choice | Melody | Melody / Harmony / Arpeggio | Melody = one note per shape; Harmony = triad chord per shape; Arpeggio = triad chord played one note after another. |
| Octave | number | 4 | 2 – 6, step 1 | Base octave. |
| Range | number | 2 | 1 – 3, step 1 | Allowed octave variation from lightness. |
| Duration | number | 8 s | 1 – 60 s, step 1 | Total duration of the sequence. |
| Colors | number | 4 | 2 – 12, step 1 | Number of dominant colors to detect. |
| Min size | number | 0.5 % | 0 – 20 %, step 0.1 | Minimum colored shape area to keep (percentage of image). |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |
| Tempo | number | 120 BPM | 40 – 240 BPM | Tempo of the MIDI file. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the palette extraction (k-means++ initialisation). The default is FIXED: the same drawing must yield the same shapes on every run. Changing it may surface other dominant hues. |

#### Visible Spectrum

`spectre-visible` · Others → Generation

*Transposes the frequency of a visible color (wavelength) into the audible range.*

Transposes a visible color (wavelength) into the audible range. The color is converted to an approximate wavelength, then the frequency of light is divided by powers of 2 until it becomes audible. The result is a drone whose pitch depends on the color: red = low frequency, violet = high frequency. Parameters: Red/Green/Blue (0-255), optional hex color, transposition octave, duration, volume and output channels.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Red | number | 128 | 0 – 255, step 1 | Red channel intensity. |
| Green | number | 128 | 0 – 255, step 1 | Green channel intensity. |
| Blue | number | 128 | 0 – 255, step 1 | Blue channel intensity. |
| Color | text | — |  | Optional hex color (#RRGGBB). If set, it overrides the RGB sliders. |
| Octave | number | 3 | 0 – 8, step 1 | Number of octaves to transpose down from the light frequency. |
| Duration | number | 4 s | 0.1 – 60 s, step 0.1 | Duration of the drone. |
| Volume | number | 80 % | 0 – 100 % | Output volume. |
| Channels | choice | Stereo | Mono / Stereo | Number of output channels. |

### Installation

| Component | Summary |
|---|---|
| [Node Manager](#node-manager) | Exports a node as .zip or imports a node from a .zip. |

#### Node Manager

`gestion-nodes` · Others → Installation

*Exports a node as .zip or imports a node from a .zip.*

Exports an existing node as a .zip archive or imports a node from a .zip. To export: enter the node ID, the system extracts the manifest, executer code, notice and detects dependencies, then generates a .zip. To import: select a .zip, the system decompresses, checks dependencies and installs the node in the catalog. Installed nodes are persisted and survive restarts.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Action | choice | Export | Export / Import | Export = create a .zip of an existing node. Import = install a node from a .zip. |
| Node to export | choice |  |  | Select the node to export from the 5 most recently created. The list updates on each run. |

### Magenta

| Component | Summary |
|---|---|
| [Magenta Continuation](#magenta-continuation) | Continues a MIDI melody with MusicRNN (melody_rnn). |
| [Magenta Drums](#magenta-drums) | Generates a neural drum loop with MusicVAE (2 bars, repeatable). |
| [Magenta Generate Drums](#magenta-generate-drums) | Generates a drum loop with MusicVAE. An optional MIDI seed can guide the style. |
| [Magenta Generate Melody](#magenta-generate-melody) | Generates a melody from a seed MIDI file with MusicRNN (melody_rnn). |
| [Magenta Humanize Groove](#magenta-humanize-groove) | Humanizes a MIDI drum pattern with GrooVAE (velocity and timing variations). |
| [Magenta Improvisation](#magenta-improvisation) | Generates a piano improvisation with Piano Genie (8 virtual buttons). |
| [Magenta Interpolate MIDI](#magenta-interpolate-midi) | Generates an intermediate MIDI file between two MIDI files with MusicVAE. |

#### Magenta Continuation

`magenta-continuation` · Others → Magenta

*Continues a MIDI melody with MusicRNN (melody_rnn).*

Continues a MIDI melody with @magenta/music (MusicRNN melody_rnn). The model downloads on first use (~3-4 MB). Connect a MIDI file to the input; the node appends the requested steps after the input melody. Adjustable temperature, steps and quantization.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 1 | 0.1 – 1.5, step 0.05 | Continuation creativity. |
| Steps to generate | slider | 32 | 16 – 128, step 1 | Number of steps to generate (1 bar 4/4 = 16 steps). |
| Quantization | choice | 1/16 | 1/4 / 1/8 / 1/16 / 1/32 | Quantization resolution applied to the input melody before continuation. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Drums

`magenta-drums` · Others → Magenta

*Generates a neural drum loop with MusicVAE (2 bars, repeatable).*

Generates a neural drum loop with @magenta/music (MusicVAE drums_2bar_nade_9_q2). The model downloads on first use (~28 MB). MIDI output; connect to a MIDI Output to listen. Temperature, Tempo and Bars parameters control the style and length.

| Port | Name | Type | |
|---|---|---|---|
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 1 | 0.1 – 1.5, step 0.05 | Sampling creativity. 0 = deterministic, 1 = creative, >1 = unpredictable. |
| Tempo | slider | 120 BPM | 60 – 200 BPM, step 1 | Tempo of the generated MIDI file. |
| Bars | slider | 2 | 1 – 8, step 1 | Number of bars generated. The model produces and concatenates 2-bar chunks. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Generate Drums

`magenta-generer-batterie` · Others → Magenta

*Generates a drum loop with MusicVAE. An optional MIDI seed can guide the style.*

Generates a drum loop with @magenta/music (MusicVAE drums_2bar_nade). The model downloads on first use (~28 MB). Without input, the node generates a random pattern. With a MIDI seed, it produces a variation. Adjustable: temperature, tempo, bars, similarity.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI (optional) | MIDI |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 1 | 0.1 – 1.5, step 0.05 | Sampling creativity. |
| Tempo | slider | 120 BPM | 60 – 200 BPM, step 1 | Tempo of the generated MIDI file. |
| Bars | slider | 2 | 1 – 8, step 1 | Number of bars generated (ignored when a seed is connected). |
| Similarity | slider | 0.5 | 0 – 1, step 0.05 | Resemblance to the MIDI seed (0 = random, 1 = close to the seed). |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Generate Melody

`magenta-generer-melodie` · Others → Magenta

*Generates a melody from a seed MIDI file with MusicRNN (melody_rnn).*

Generates a melody from a seed MIDI file with @magenta/music (MusicRNN melody_rnn). The model downloads on first use (~13 MB). Connect a MIDI to the input; the node appends the requested steps after the seed. Adjustable temperature, steps and quantization.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 1 | 0.1 – 1.5, step 0.05 | Generation creativity. |
| Steps to generate | slider | 32 | 16 – 128, step 1 | Number of steps generated after the MIDI seed. |
| Quantization | choice | 1/16 | 1/4 / 1/8 / 1/16 / 1/32 | Quantization resolution applied to the MIDI seed before generation. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Humanize Groove

`magenta-humaniser-groove` · Others → Magenta

*Humanizes a MIDI drum pattern with GrooVAE (velocity and timing variations).*

Humanizes a MIDI drum pattern with @magenta/music (GrooVAE). The model downloads on first use (~16 MB). Connect a drum MIDI to the input; the node adds velocity and timing variations. Adjustable temperature and quantization.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 0.5 | 0 – 1.5, step 0.05 | Amount of variation applied (0 = little, 1.5 = very expressive). |
| Quantization | choice | 1/16 | 1/4 / 1/8 / 1/16 / 1/32 | Quantization resolution of the input pattern. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Improvisation

`magenta-improvisation` · Others → Magenta

*Generates a piano improvisation with Piano Genie (8 virtual buttons).*

Generates a piano improvisation with @magenta/music (Piano Genie). The model downloads on first use (~100 MB). Eight virtual buttons are driven by a pattern (random, walk, up, down, arpeggio) and mapped to 88 piano keys. MIDI output; connect to a MIDI Output to listen. Adjustable: duration, tempo, temperature, mode and seed.

| Port | Name | Type | |
|---|---|---|---|
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | slider | 8 s | 1 – 30 s, step 0.5 | Improvisation duration in seconds. |
| Tempo | slider | 120 BPM | 60 – 200 BPM, step 1 | Tempo of the generated MIDI file. |
| Temperature | slider | 1 | 0 – 1.5, step 0.05 | Sampling creativity (0 = argmax, 1 = standard, >1 = random). |
| Mode | choice | Random | Random / Walk / Up / Down / Arpeggio | Piano Genie button sequence (0-7). Random = random buttons, Walk = drift, Up/Down/Arpeggio = patterns. |
| Seed | slider | 0 | 0 – 999999, step 1 | Seed for the improvisation — it drives both the model and the button choice. 0 = drawn at random on every run, and shown in the message so it can be copied back here. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Magenta Interpolate MIDI

`magenta-interpoler-midi` · Others → Magenta

*Generates an intermediate MIDI file between two MIDI files with MusicVAE.*

Generates an intermediate MIDI file between two MIDI files with @magenta/music (MusicVAE mel_2bar_small). The model downloads on first use (~18 MB). Connect two MIDI files to inputs A and B; choose the number of interpolations and the position. MIDI output.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI A | MIDI | required |
| input | MIDI B | MIDI | required |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Temperature | slider | 1 | 0.1 – 1.5, step 0.05 | Interpolation creativity. |
| Interpolations | slider | 5 | 3 – 11, step 2 | Number of interpolation steps between the two MIDI files (odd recommended). |
| Position | slider | 0.5 | 0 – 1, step 0.05 | Position of the intermediate between MIDI A (0) and MIDI B (1). |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

### Speech to Text

| Component | Summary |
|---|---|
| [Sherpa ASR](#sherpa-asr) | Local speech recognition via Sherpa-ONNX (multilingual Whisper tiny). |
| [Whisper (English)](#whisper-english) | English speech recognition (OpenAI Whisper base). |

#### Sherpa ASR

`sherpa-asr` · Others → Speech to Text

*Local speech recognition via Sherpa-ONNX (multilingual Whisper tiny).*

Local speech recognition via Sherpa-ONNX (multilingual Whisper tiny). Connect audio to the green input. Transcribed text is emitted on the blue output. The ONNX model (~100 MB) downloads from HuggingFace on first use. Runs in a dedicated Web Worker.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Language | choice | Auto | Auto / English / French / Spanish / German / Italian / Portuguese / Dutch / Russian / Japanese / Chinese / Arabic / Hindi / Korean | Language of the speech to transcribe. « Auto » lets Whisper detect the language. The model is multilingual (99 languages). |
| Resampling quality | choice | High (Web Audio) | High (Web Audio) / Standard (linear) | Choose the resampling quality to 16 kHz. « High » uses Web Audio API (better quality) with automatic fallback to linear interpolation if needed. « Standard » keeps the original fast linear interpolation. |
| Model cache | choice | Auto (kept across sessions) | Auto (kept across sessions) / Clear and re-download | Manage the offline cache of the ONNX model. « Auto » keeps the downloaded model across sessions (IndexedDB). « Clear and re-download » deletes the cache and forces a fresh download. |

#### Whisper (English)

`whisper-en` · Others → Speech to Text

*English speech recognition (OpenAI Whisper base).*

English speech recognition using OpenAI Whisper (base). Connect an audio signal (green port) — e.g. an « Audio Input » or « Recorder » node. The model transcribes the speech to text and outputs it on the text output (blue port). The model downloads from HuggingFace on first use (~75 MB, cached). Runs in a Web Worker. Audio is automatically mixed to mono and resampled to 16 kHz.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Text | text |  |

*No parameters.*

### Test zone

> Experimental components, still being evaluated.

| Component | Summary |
|---|---|
| [AR Continuation](#ar-continuation) | Extends a track by predicting each spectral frame from previous frames using a linear autoregressive model. |
| [LSTM Continuation](#lstm-continuation) | Extends a track by a small recurrent network (LSTM) trained on the fly on its spectrogram frames. |
| [Neural PCA](#neural-pca) | Trains a non-linear autoencoder on a track's spectrogram to filter its texture and resynthesize it. |
| [Stable Audio 3 Continuation](#stable-audio-3-continuation) | [EXPERIMENTAL] Extends an audio track by conditioning Stable Audio 3 small-music on its latent. Quality is limited: the int4 encoder is not perfectly aligned with the DiT. The ONNX model (~640 MB + encoder) runs in the main process. |
| [Time Stretch (DTW)](#time-stretch-dtw) | [EXPERIMENTAL — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity, by linear interpolation along the frame correspondence. This is NOT a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback). |

#### AR Continuation

`continuation-spectrale-ar` · Others → Test zone

*Extends a track by predicting each spectral frame from previous frames using a linear autoregressive model.*

Extends an audio track by predicting the continuation of its spectrogram. A linear autoregressive (dense) model is trained on the fly on the track's own magnitude frames (in dB): it learns to predict a frame from the previous N frames. Autoregressive generation: predicted frames are fed back into the history to predict the next one. Phase is propagated coherently (per-bin phase increment), then resynthesized by inverse STFT. This is the audio equivalent of a time-series prediction (AR/ARIMA): the result is experimental, closer to a texture than to a structured musical continuation, but fully local and without a pretrained model.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Generated duration | slider | 5 s | 1 – 60 s, step 1 | Duration of the continuation to generate, in seconds. |
| FFT | choice | 2048 | 512 / 1024 / 2048 / 4096 | FFT window size. Determines frequency resolution and number of bins. |
| Hop | number | 25 % | 10 – 100 %, step 1 | Hop size between consecutive windows, as a percentage of FFT size. 25% = 75% overlap. |
| History | number | 4 frames | 1 – 32 frames, step 1 | Number of past frames used to predict the next frame. Larger = more context (but heavier to train). |
| Epochs | number | 100 | 1 – 1000, step 1 | Maximum number of training epochs. Time budget may stop earlier. |
| Learning rate | number | 0.001 | 0.0001 – 0.01, step 0.0001 | Adam optimizer learning rate. |
| Seed | number | 1 | 1 – 99999, step 1 | Seed for weight initialization. Same track + same settings + same seed = same result. |
| Budget | number | 0 ms | 0 – 300000 ms, step 1000 | Training time budget in milliseconds. 0 = automatic. |

#### LSTM Continuation

`continuation-spectrale-lstm` · Others → Test zone

*Extends a track by a small recurrent network (LSTM) trained on the fly on its spectrogram frames.*

Extends an audio track with a small recurrent network (LSTM) trained on the fly on its magnitude spectrogram. Same principle as AR Continuation, but the model is non-linear and sequential: the LSTM layer memorizes the context of past frames to predict the future frame. Phase is propagated coherently and the result is resynthesized by inverse STFT. Experimental quality, fully local, no pretrained model.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Generated duration | slider | 5 s | 1 – 60 s, step 1 | Duration of the continuation to generate, in seconds. |
| FFT | choice | 2048 | 512 / 1024 / 2048 / 4096 | FFT window size. Determines frequency resolution and number of bins. |
| Hop | number | 25 % | 10 – 100 %, step 1 | Hop size between consecutive windows, as a percentage of FFT size. 25% = 75% overlap. |
| History | number | 4 frames | 1 – 32 frames, step 1 | Number of past frames used to predict the next frame. Larger = more context (but heavier to train). |
| Epochs | number | 100 | 1 – 1000, step 1 | Maximum number of training epochs. Time budget may stop earlier. |
| Learning rate | number | 0.001 | 0.0001 – 0.01, step 0.0001 | Adam optimizer learning rate. |
| Seed | number | 1 | 1 – 99999, step 1 | Seed for weight initialization. Same track + same settings + same seed = same result. |
| Budget | number | 0 ms | 0 – 300000 ms, step 1000 | Training time budget in milliseconds. 0 = automatic. |
| Hidden units | number | 128 | 16 – 512, step 16 | Number of hidden units in the LSTM layer. Larger = more context memory (but slower). |

#### Neural PCA

`pca-neuronale` · Others → Test zone

*Trains a non-linear autoencoder on a track's spectrogram to filter its texture and resynthesize it.*

Neural PCA: trains a non-linear autoencoder on the input track's magnitude spectrogram and resynthesizes a latent-filtered audio. Each time frame becomes a vector of frequency bins (fixed FFT size, number of frames derived from hop). The magnitude is converted to dB/log scale and standardized before training. The architecture is a progressive bottleneck: input size → hidden layers derived by geometric interpolation → latent space (number of axes). ReLU or Tanh activation. Training happens on the fly on this track's frames only (no pretrained model): the UI shows the current epoch and loss, and a time budget (automatic or forced) can stop training while keeping the last epoch's weights. The original phase is kept for inverse-STFT resynthesis. Result is non-deterministic without a fixed seed. A guard compares the final loss to the trivial baseline (reconstructing every frame by the mean frame) and warns if the autoencoder did not improve on it.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| FFT | choice | 2048 | 512 / 1024 / 2048 / 4096 | FFT window size (power of 2). Determines the number of frequency bins. |
| Hop | number | 25 % | 10 – 100 %, step 1 | Hop size between consecutive windows, as a percentage of FFT size. 25% = 75% overlap. |
| Axes | number | 64 | 1 – 1024, step 1 | Number of axes in the latent space (autoencoder bottleneck). |
| Layers | number | 2 | 1 – 6, step 1 | Number of hidden layers between input and latent space. Sizes are derived by geometric interpolation. |
| Activation | choice | ReLU | ReLU / Tanh | Hidden layer activation function. |
| Epochs | number | 100 | 1 – 1000, step 1 | Maximum number of training epochs. Time budget may stop earlier. |
| Learning rate | number | 0.001 | 0.0001 – 0.01, step 0.0001 | Adam optimizer learning rate. |
| Seed | number | 1 | 1 – 99999, step 1 | Seed for weight initialization. Same track + same settings + same seed = same result. |
| Budget | number | 0 ms | 0 – 300000 ms, step 1000 | Training time budget in milliseconds. 0 = automatic (depends on n_frames × n_bins). |

#### Stable Audio 3 Continuation

`continuation-stable-audio-3` · Others → Test zone

*[EXPERIMENTAL] Extends an audio track by conditioning Stable Audio 3 small-music on its latent. Quality is limited: the int4 encoder is not perfectly aligned with the DiT. The ONNX model (~640 MB + encoder) runs in the main process.*

[EXPERIMENTAL] Extends an audio track with Stable Audio 3 small-music. The model encodes the input audio, keeps its prefix and generates the continuation via causal inpainting. Quality remains very limited: the available int4 ONNX encoder is not perfectly aligned with the DiT latent space, so the continuation may be a drone or incoherent noise. Inputs longer than 5 seconds give better results. The ONNX bundle (~640 MB + ~36 MB encoder) runs in the main process. Generation is slow (several minutes). Requires the small-music model and the encoder_q4.onnx in the same folder.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Prompt | text |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Generated duration | slider | 5 s | 1 – 30 s, step 1 | Duration of the continuation to generate, in seconds. Total duration will be input + this value. |
| Steps | slider | 8 | 1 – 20, step 1 | Number of ping-pong sampler steps. 8 = quality/speed sweet spot. |
| Seed | slider | -1 | -1 – 999999, step 1 | Random seed. -1 = random. |
| Model path | folder | — |  | Absolute or relative path of the Stable Audio 3 bundle (empty = bundled public/oonx/stable-audio-3-small-music). The audio encoder (encoder_q4.onnx) must also be present. |

#### Time Stretch (DTW)

`etirement-dtw` · Others → Test zone

*[EXPERIMENTAL — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity, by linear interpolation along the frame correspondence. This is NOT a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback).*

[EXPERIMENTAL — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity (connect its « Alignment path » output here, and the SAME Track A to both nodes). Simple linear-interpolation resampling along the frame correspondence — not a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback), a known limitation rather than a hidden defect. The output takes Track A's sample rate and channel count, but its duration follows the reference track's frame count (derived from the path) — never needs the reference track's audio itself. Requires Audio Similarity to have run first on the same Track A.

| Port | Name | Type | |
|---|---|---|---|
| input | Track to process | audio | required |
| input | Alignment path | text | required |
| output | Aligned track | audio |  |

*No parameters.*

### Text

| Component | Summary |
|---|---|
| [ABC Editing by LLM](#abc-editing-by-llm) | Edits an ABC score with a local Ollama model — new chords, or new pitches on the same rhythm — without it being able to break what must stay fixed. |
| [AI Script Generator](#ai-script-generator) | Generates a prompt for a music AI (Suno, Udio…) by randomly combining instruments, styles, emotions and vocal ranges. |
| [DistilGPT-2](#distilgpt-2) | Generates text via AI (DistilGPT-2, English). |
| [Edit Text](#edit-text) | Transforms incoming text: replace, case, whitespace, wrapping. |
| [Emotions](#emotions) | Outputs a collection of human emotions by category as text. |
| [Graph Documentation](#graph-documentation) | Documents the graph it sits in: every node, its set values, its wiring, and the notice of every component used. |
| [Instrument Names](#instrument-names) | Outputs a long list of musical instrument names as text. |
| [Lyrics Generator](#lyrics-generator) | Generates structured song lyrics (verse, chorus, bridge) without AI. |
| [Multilingual Lyrics (AI)](#multilingual-lyrics-ai) | Generates lyrics in English via DistilGPT-2 then translates them to the chosen language. |
| [Musical Styles](#musical-styles) | Outputs a large collection of musical styles by category as text. |
| [Ollama LLM](#ollama-llm) | Generates text via a local Ollama model (Llama, Qwen, Mistral…). |
| [OPUS-MT Translation](#opus-mt-translation) | Translates text between language pairs (OPUS-MT, lightweight model). |
| [Prompt → graph](#prompt--graph) | Generates a node graph from a natural language text prompt. |
| [Qwen2.5-0.5B](#qwen25-05b) | Generates text via AI using the Qwen2.5-0.5B model (multilingual). |
| [Text Reservoir](#text-reservoir) | Generates text via random neural networks (emergence, no training). |
| [Vocal Ranges](#vocal-ranges) | Outputs a collection of vocal ranges as text (men, women, children). |

#### ABC Editing by LLM

`edition-abc-llm` · Others → Text

*Edits an ABC score with a local Ollama model — new chords, or new pitches on the same rhythm — without it being able to break what must stay fixed.*

Edits an ABC score with a local language model (Ollama), in a way that prevents it from breaking what must stay fixed. The design comes from a measurement made before development: local models asked to rewrite the whole tune failed 19 times out of 19, even when sent back the list of their errors — unchanged copy, lost header, broken bars, missing note. The same models, asked ONLY for what changes, in a JSON format enforced by Ollama, succeeded 20 times out of 20. Hence two operations. REHARMONIZE: the model returns one or two chords per bar, which Attic places on the original melody. REWRITE PITCHES: it returns exactly one pitch per note, which Attic places on the original rhythm, in the chosen key. A rejected answer — unreadable JSON, unknown chord, mere copy of the original — is sent back to the model with the precise list of problems, up to the chosen number of attempts. The result is then checked as by « ABC Constraints ». What is NOT offered: free rhythmic variation, measured at 0 successes out of 10, the models getting bar lengths wrong. What is NOT guaranteed: musical quality — the proposed chords may be bland or odd; the report's two indicators help see it. Tunes starting with a pickup are not handled. Requires Ollama and the model installed (« ollama pull gemma4:12b »).

| Port | Name | Type | |
|---|---|---|---|
| input | ABC | text | required |
| input | Instruction | text |  |
| output | ABC | text |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Reharmonize | Reharmonize / Rewrite pitches | Reharmonize: the model only returns the chords of each bar, then placed on the original melody, which it therefore cannot damage. Rewrite pitches: it only returns one pitch per note, placed on the original rhythm — change of mode, key, contour. There is NO free rhythmic variation: measured on two local models, it failed 10 times out of 10, the models getting bar lengths wrong. |
| Instruction | text | `Reharmonize with a different, richer harmonization (seven…` |  | What is asked of the model, preferably in English. Ignored if the Instruction input is connected. For « Rewrite pitches », for instance: « Rewrite this melody in E minor, keeping its contour. » |
| Result key | text | `Keep` |  | For « Rewrite pitches »: « Keep », or an ABC K: field (« Em », « Ddor »). It sets the result's key signature and is given to the model. If it changes, the original chord symbols are removed, since they no longer apply — the report says so. |
| Model | text | `gemma4:12b` |  | Installed Ollama model. Measured on reharmonization and switching to minor: gemma4:12b and qwen3:4b both succeed 10 times out of 10; gemma4:12b is more musical (idiomatic chords, 91–100% of notes in the scale) but takes 20 to 80 s; qwen3:4b answers in 2 to 9 s with odder choices (out-of-key chords, 83–88% of notes in the scale). |
| Temperature | number | 0.7 | 0 – 2, step 0.1 | Variety of answers. Low: close to a safe answer; high: more invention, more retries. |
| Attempts | number | 3 | 1 – 5, step 1 | Maximum number of calls to the model. A rejected answer — unreadable JSON, unknown chord, copy of the original — is sent back to the model with the precise list of problems. |
| Timeout | number | 600 s | 30 – 1800 s, step 30 | Timeout of one call. The first call to a model must load it into memory: allow several minutes. |

#### AI Script Generator

`generateur-script-ia` · Others → Text

*Generates a prompt for a music AI (Suno, Udio…) by randomly combining instruments, styles, emotions and vocal ranges.*

Generates a structured prompt for a music AI app (Suno, Udio…). Connect the text outputs of « Instrument Names », « Musical Styles », « Emotions » and « Vocal Ranges » nodes to the 4 corresponding inputs. The node randomly picks a configurable number of items from each list and composes a script with: style, instruments, emotions, vocals, a sentence prompt and tags. A seed allows reproducing a draw. Inputs are optional — if one is not connected, it is simply ignored.

| Port | Name | Type | |
|---|---|---|---|
| input | Instruments | text |  |
| input | Styles | text |  |
| input | Emotions | text |  |
| input | Tessituras | text |  |
| output | Script | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instruments | number | 3 | 0 – 10, step 1 | Number of instruments to randomly pick from the input. |
| Styles | number | 2 | 0 – 5, step 1 | Number of musical styles to pick. |
| Emotions | number | 2 | 0 – 5, step 1 | Number of emotions to pick. |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = random each run). |

#### DistilGPT-2

`gpt2-paroles` · Others → Text

*Generates text via AI (DistilGPT-2, English).*

Generates text via AI using DistilGPT-2 (Transformers.js, ONNX). Connect a « Text Source » or enter a prompt directly. The model generates text from the prompt (English for best results). Adjust length (30-300 tokens), creativity (temperature 0.1-1.5) and repetition penalty. The model downloads from HuggingFace on first use (~330 MB, cached). Runs in a Web Worker. Ideal for sparking inspiration or generating unusual text.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `Write a creative text about love and rain: ` |  | Seed prompt (English for best results). E.g. « Write a creative text about the ocean: » |
| Length | number | 100  tokens | 30 – 300  tokens, step 10 | Maximum number of generated tokens (~0.75 word/token). |
| Temperature | number | 0.9 | 0.1 – 1.5, step 0.1 | Temperature. High = more creative/random; low = more predictable. |
| Repetition penalty | number | 1.3 | 1 – 2, step 0.1 | Repetition penalty. High = avoids repeating the same words. |

#### Edit Text

`modifier-texte` · Others → Text

*Transforms incoming text: replace, case, whitespace, wrapping.*

Sits behind any text output — Sherpa transcription, PDF extraction, LLM output, generated lyrics — to adapt it before whatever comes next: a MusicGen prompt, speech synthesis, a Text to MIDI. It was the missing link between nodes that produce text and nodes that consume it, which until now forced a detour through the Python Processor for a simple replacement. ONE operation at a time, picked from the list: literal replace, regular-expression replace (where $1 and $2 refer to captured groups), upper or lower case, whitespace tidying, or wrapping with a prefix and a suffix. To combine several, chain several copies of the node — which is what a graph makes natural, and avoids one node per operation in a catalogue that already holds 245. Note: an invalid regular expression does NOT fail the node; the text passes through unchanged and the message gives the reason, because these patterns are written by trial and error and halting the whole graph on every missing bracket would be unbearable. Whitespace tidying preserves line breaks: lyrics keep their structure.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Replace | Replace / Replace (regex) / Uppercase / Lowercase / Tidy whitespace / Wrap | Transformation applied. One at a time: to combine several, chain several copies of this node. |
| Find | text | — |  | What to find. Taken literally in "Replace" mode, treated as a regular expression in "Replace (regex)" mode. Empty = the text passes through unchanged. |
| Replace with | text | — |  | What takes its place. In regex mode, $1 and $2 refer to captured groups. Empty = deletes what was found. |
| Before | text | — |  | Text added at the start, in "Wrap" mode. Useful to prefix an instruction to a prompt. |
| After | text | — |  | Text added at the end, in "Wrap" mode. |

#### Emotions

`emotions` · Others → Text

*Outputs a collection of human emotions by category as text.*

Outputs a collection of human emotions on its « Text » output (about 160, grouped by category: joy/happiness, sadness/melancholy, anger/frustration, fear/anxiety, love/tenderness, surprise/wonder, disgust/rejection, mixed/complex). Handy for track tagging, sentiment classification or as a text source.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Category | choice | All | All / Joy/Happiness / Sadness/Melancholy / Anger/Frustration / Fear/Anxiety / Love/Tenderness / Surprise/Wonder / Disgust/Rejection / Mixed/Complex | Filters the list by emotion category. |
| Format | choice | Comma | Comma / Newline / Bullets | Separator of the produced text. |

#### Graph Documentation

`documentation-graphe` · Others → Text

*Documents the graph it sits in: every node, its set values, its wiring, and the notice of every component used.*

Documents the graph it sits in, rather than Attic's components in general: the COMPONENTS.md catalog already does that. This node answers another need, that of handing a graph over to someone — a colleague, or an agent that has to build an application on it. It reads the whole graph, records each node's SET VALUES rather than its defaults, recovers its wiring port by port, computes the order in which the engine runs them, and gathers the notice of every component used — once per component, however many instances there are. Two texts come out of the same survey, because two audiences do not read the same thing. The « Documentation » output is dense Markdown, in the order useful to an agent: the graph first, the notices next, and the graph's JSON last, which is enough to rebuild it. The « Site » output is a self-contained HTML page — contents on the left, parameter tables, and a diagram of the graph drawn AT THE NODES' REAL POSITIONS, so that whoever reads the page recognises what they have in front of them in the application. Four things are worth knowing. The node has no input: it has nothing to receive, and where it sits does not matter. It documents the graph AS IT IS COMPOSED, meta-components unexpanded and loops unrolled, because nobody would recognise their work in numbered loop copies. It flags what would stop the graph from running — a required input left free, a component unknown to the registry, a cycle. And it writes nothing to disk until an output folder is given. One limit, finally, stated rather than worked around: a component's documentation is its notice, its ports and its parameters, not its source code — the shipped application does not contain its sources, and promising the code would be promising what cannot be delivered.

| Port | Name | Type | |
|---|---|---|---|
| output | Documentation | text |  |
| output | Site | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Title | text | — |  | Title of the document. Empty, the document is called « Graph documentation ». |
| Notices | choice | Full | Full / Summaries only | Each component's full notice, or its summary alone. Full for an agent, to whom they say what each node does and why; summaries for an overview, the document then being four to five times shorter. |
| Output folder | folder | — |  | Where to write « documentation.md » and « index.html ». Empty, nothing is written to disk and both texts leave through the ports only — enough to feed a language model or a text node. |

#### Instrument Names

`noms-instruments` · Others → Text

*Outputs a long list of musical instrument names as text.*

Outputs a list of musical instrument names on its « Text » output (about a hundred, grouped by family: strings, woodwinds, brass, percussion, keyboards, electronic, voice & world). Pick a family to filter, and the format (comma, newline, bullets). Handy as a text or reference source.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Family | choice | All | All / Strings / Woodwinds / Brass / Percussion / Keyboards / Electronic / Voice & World | Filters the list by instrument family. |
| Format | choice | Comma | Comma / Newline / Bullets | Separator of the produced text. |

#### Lyrics Generator

`generateur-paroles` · Others → Text

*Generates structured song lyrics (verse, chorus, bridge) without AI.*

Generates structured song lyrics (verse, chorus, bridge, outro) without an AI model — using templates and random word selection from dictionaries. Enter a theme, an emotion, choose the language (FR/EN) and the number of lines per section. The structure varies randomly (4 models). Each line is generated from 12 sentence templates combining subjects, verbs, objects, adjectives, places, emotions and connectors. The seed allows reproducing the exact same lyrics. Instant, offline, no download. Output to connect to a Text Output or TTS node.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Theme | text | `Love` |  | Main theme of the song (e.g. love, the sea, freedom). |
| Emotion | text | `hope` |  | Dominant emotion (e.g. hope, sadness, anger). |
| Language | choice | French | French / English | Language of generated lyrics. |
| Lines/section | number | 4 | 2 – 8, step 1 | Number of lines per section (verse, chorus). |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new each run). Same seed = same lyrics. |

#### Multilingual Lyrics (AI)

`nllb-paroles` · Others → Text

*Generates lyrics in English via DistilGPT-2 then translates them to the chosen language.*

Generates multilingual lyrics via AI in two steps: (1) DistilGPT-2 generates lyrics in English from the prompt, (2) OPUS-MT translates the lyrics to the chosen target language (French, Spanish, German, Italian, Portuguese, Russian, Japanese, Chinese, Arabic, Hindi). Connect a « Text Input » or enter a prompt in English for best results. First use downloads DistilGPT-2 (~330 MB) then the translation model (~30 MB), both cached. If translation fails, the English lyrics are returned. Runs in Web Workers.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `Write a song about the sea and freedom: ` |  | Seed prompt (English for best results). |
| Target language | choice | French | French / Spanish / German / Italian / Portuguese / Russian / Japanese / Chinese / Arabic / Hindi | Translation language. Lyrics are generated in English then translated. |
| Length | number | 80  tokens | 30 – 200  tokens, step 10 | Maximum number of generated tokens. |
| Temperature | number | 0.9 | 0.1 – 1.5, step 0.1 | Temperature. High = more creative; low = more predictable. |

#### Musical Styles

`styles-musicaux` · Others → Text

*Outputs a large collection of musical styles by category as text.*

Outputs a large collection of musical styles on its « Text » output (over 200, grouped by category: rock, metal, pop, electronic, hip-hop/rap, jazz, blues/soul/funk, country/folk, reggae/latin, classical/contemporary, world/traditional). Pick a category to filter, and the format (comma, newline, bullets). Handy as a text source, for tagging or classification.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Category | choice | All | All / Rock / Metal / Pop / Electronic / Hip-Hop/Rap / Jazz / Blues/Soul/Funk / Country/Folk / Reggae/Latin / Classical/Contemporary / World/Traditional | Filters the list by musical style category. |
| Format | choice | Comma | Comma / Newline / Bullets | Separator of the produced text. |

#### Ollama LLM

`ollama-llm` · Others → Text

*Generates text via a local Ollama model (Llama, Qwen, Mistral…).*

Queries a local Ollama server (port 11434). Install Ollama (ollama.com), run « ollama serve », then pull a model: « ollama pull llama3.2 » or « ollama pull qwen2.5 ». The prompt comes from the parameter, or from the text input if connected. Attic downloads no model — Ollama manages everything, outside the renderer.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Model | text | `qwen3:4b` |  | Installed Ollama model name (see « ollama list »). E.g. llama3.2, qwen3:4b, mistral, phi3. |
| Prompt | text | `Write the lyrics of a short song about the sea and freedom.` |  | Instruction sent to the model. Ignored if a text input is connected. |
| Temperature | number | 0.8 | 0 – 2, step 0.1 | Creativity. High = more varied/random; low = more deterministic. |
| Max tokens | number | 4096 | 32 – 8192, step 32 | Maximum response length (num_predict). Models with thinking mode (Qwen3) need more tokens. |
| Timeout | number | 600 s | 30 – 1800 s, step 30 | Timeout before aborting. The FIRST call to a model must load it into memory: allow several minutes for a large model (Qwen3.6 = 24 GB). Subsequent calls are much faster while the model stays resident. |

#### OPUS-MT Translation

`traduction-opus` · Others → Text

*Translates text between language pairs (OPUS-MT, lightweight model).*

Translates text between language pairs using OPUS-MT (Helsinki-NLP, Marian models). Connect a « Text Source » node to the input (blue port). Choose the language pair (18 pairs available: French↔English, English↔Spanish, German, Italian, Japanese, Chinese, Russian, Portuguese, Dutch, Arabic, Hindi). Each pair uses a dedicated lightweight model (~30 MB) that downloads on first use and is cached. Runs in a Web Worker. Fast direct text→text translation.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pair | choice | French → English | French → English / English → French / English → Spanish / Spanish → English / English → German / German → English / English → Italian / Italian → English / English → Japanese / Japanese → English / English → Chinese / Chinese → English / English → Russian / Russian → English / English → Portuguese / English → Dutch / English → Arabic / English → Hindi | Source → target language pair. Each pair uses a dedicated OPUS-MT model (~30 MB). |

#### Prompt → graph

`prompt-vers-graphe` · Others → Text

*Generates a node graph from a natural language text prompt.*

Generates a node graph on the canvas from a natural language prompt. Enter a description (e.g. « stereo delay with short feedback on a hall reverb then compressor and output ») or connect a « Text Source » node. Two methods (Method parameter): Keywords (default, offline, recognizes ~40 keywords in French and English across sources, effects, analysis and outputs) or Ollama (AI) — a local model interprets free-form phrasing and picks the relevant blocks from the whole installed catalog itself; requires « ollama serve » and automatically falls back to Keywords on failure. Detected nodes are chained (source → effects → analysis → output) and added to the canvas. Magical for discovering the app's possibilities without knowing the catalog.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `stereo delay with feedback on hall reverberation, then co…` |  | Natural language description of the graph to generate. The parser automatically recognizes all installed nodes (names, synonyms, aliases). Newly installed nodes (.zip or meta-components) are recognized without restart. |
| Method | choice | Keywords | Keywords / Ollama (AI) | Keywords = fast, offline, literal matching (~40 keywords). Ollama = understands free-form phrasing via a local model, but requires « ollama serve ». On Ollama failure (unreachable server, invalid reply), automatically falls back to Keywords. |
| Model | text | `qwen3:4b` |  | Ollama model to use (Ollama mode only). See « ollama list ». |
| Timeout | number | 600 s | 30 – 1800 s, step 30 | Timeout before aborting (Ollama mode only). The first call to a model must load it into memory. |

#### Qwen2.5-0.5B

`qwen2.5-lyrics` · Others → Text

*Generates text via AI using the Qwen2.5-0.5B model (multilingual).*

Generates text via AI using the Qwen2.5-0.5B model (Transformers.js, ONNX). Connect a « Text Input » or enter a prompt directly. The model supports several languages, but English works best. Adjust length (30-300 tokens), creativity (temperature 0.1-1.5) and repetition penalty. The model downloads from HuggingFace on first use (~500 MB, cached). Runs in a Web Worker. This is a separate model from DistilGPT-2, newer and multilingual.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Prompt | text | `Write a creative text about love and rain:` |  | Seed prompt. English works best, but the model supports several languages. |
| Length | number | 120  tokens | 30 – 300  tokens, step 10 | Maximum number of generated tokens. |
| Temperature | number | 0.9 | 0.1 – 1.5, step 0.1 | Temperature. High = more creative; low = more predictable. |
| Repetition penalty | number | 1.3 | 1 – 2, step 0.1 | Repetition penalty. High = avoids repeating the same phrases. |

#### Text Reservoir

`reservoir-textuel` · Others → Text

*Generates text via random neural networks (emergence, no training).*

Generates text via random neural networks (Reservoir Computing), with no training or dataset. A reservoir of a few neurons with random weights circulates impulses. Activations are mapped to alphabet letters to produce emergent words. The result is « alien » text — words that don't exist but have a coherent phonetic structure. Inspired by Allendia/EVY applied to language. Parameters: neurons (5-50), connectivity, memory, word count, alphabet (Latin, vowels-first, French with accents), seed word and seed. Useful for generating song titles, phonetic lyrics or concrete poetry.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Neurons | number | 15 | 5 – 50, step 1 | Number of neurons. Few = short/repetitive words; many = complex words. |
| Connectivity | number | 30 % | 0 – 100 %, step 1 | Probability of connection between neurons. Low = simple words; high = dense words. |
| Memory | number | 30 % | 0 – 100 %, step 1 | Leaking rate. High = long memory, slowly evolving words; low = brief reactions. |
| Words | number | 20 | 5 – 100, step 1 | Number of words to generate. |
| Alphabet | choice | Full (a-z) | Full (a-z) / Vowels-first / French (a-z + accents) | Alphabet used for generation. |
| Seed word | text | — |  | Starting word (optional). |
| Seed | number | 0 | 0 – 99999, step 1 | Random seed (0 = new network each run). |

#### Vocal Ranges

`tessitures-voix` · Others → Text

*Outputs a collection of vocal ranges as text (men, women, children).*

Outputs a collection of vocal ranges on its « Text » output, grouped by category (men, women, children). Each range includes its approximate note span (low to high). Covers classical lyric categories (bass, baritone, tenor, contralto, mezzo-soprano, soprano and their subtypes) as well as children's voices.

| Port | Name | Type | |
|---|---|---|---|
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Group | choice | All | All / Men / Women / Children | Filters the list by group: men, women or children. |
| Format | choice | Comma | Comma / Newline / Bullets | Separator of the produced text. |

### Theory

| Component | Summary |
|---|---|
| [Chord](#chord) | Detects the chord name from its notes. |
| [Pitch-Class Sets](#pitch-class-sets) | Analyses a chord or passage as a pitch-class set: normal form, prime form, interval vector. |
| [Progression](#progression) | Generates a chord progression from a key and roman numerals. |
| [Scale](#scale) | Lists the notes of a scale from a tonic and a scale type. |
| [Species Counterpoint](#species-counterpoint) | Checks a first-species counterpoint against Fux's rules and annotates every infringement. |
| [Transpose](#transpose) | Transposes a note or chord by a given interval. |

#### Chord

`tonal-accord` · Others → Theory

*Detects the chord name from its notes.*

Detects a chord name from a list of notes. Example: C E G → C major. Accepts notes separated by spaces, commas or semicolons.

| Port | Name | Type | |
|---|---|---|---|
| input | Notes | text |  |
| output | Name | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | text | `C E G` |  | Chord notes separated by spaces (e.g. C E G, F A C E). |

#### Pitch-Class Sets

`classes-hauteurs` · Others → Theory

*Analyses a chord or passage as a pitch-class set: normal form, prime form, interval vector.*

Analyses a chord or passage as a pitch-class set. When a harmony is no longer tonal, calling it « seventh on D » means nothing; the analysis developed by Allen Forte and Milton Babbitt offers something else. The chord is reduced to the classes it uses, then the most compact way of writing them is sought: that is the NORMAL FORM. It is then compared with its inversion and the one most packed to the left is kept, brought to zero: that is the PRIME FORM, the family's name. Two chords that look unrelated on paper — a chord, the same one inverted, transposed, turned over — end up together, and one can finally say that two passages use the same material. The INTERVAL VECTOR gives the colour: how many minor seconds, major seconds, thirds… the set holds. A vector rich in fifths sounds open, one rich in semitones sounds tight. It is not enough to name, though: the two « all-interval » tetrachords share a vector and have different prime forms — the Z-relation. TRANSPOSITIONAL SYMMETRY explains why some sets go nowhere: the diminished chord and the whole-tone scale come back identical to themselves after transposition, hence without possible tonal function, and that is the basis of the procedure in Debussy and Messiaen. Two limits, stated rather than hidden. Names are given only for the sets catalogued here — the twelve trichords in full, and the common chords and scales: copying Forte's two hundred entries from memory would risk labelling wrongly, which is worse than not labelling, and the prime form is enough to identify the rest. And the prime form is computed by the « most packed to the left » method of Straus's textbooks; it differs from Forte's own on a handful of five- and six-note sets. « Chord by chord » analyses each group of simultaneous notes and then lists the prime forms that recur.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Analysis | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | text | `C E G B` |  | The notes to analyse, as names or numbers from 0 to 11. A MIDI file on the input wins. |
| Grouping | choice | Whole excerpt | Whole excerpt / Chord by chord | « Chord by chord » analyses each group of simultaneous notes separately, then lists the prime forms that recurred — which is what allows saying that two passages use the same material. |

#### Progression

`tonal-progression` · Others → Theory

*Generates a chord progression from a key and roman numerals.*

Generates a chord progression from a key and roman numerals. Example: C + I V vi IV → C G Am F. Roman numerals accept uppercase (major chords) and lowercase (minor chords).

| Port | Name | Type | |
|---|---|---|---|
| input | Tonic | text |  |
| output | Chords | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Key | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Root note of the progression. The mode is set in « Scale »; the Key input wins over the setting when it names one (« A minor »). |
| Scale | choice | major | major / minor | Scale the degrees are read in. In minor, III, VI and VII drop a semitone: « i VI III VII » gives Am F C G in A, not Am F♯ C♯ G♯. Case only decides the chord quality. |
| Progression | text | `I V vi IV` |  | Roman numeral progression (e.g. I V vi IV, ii V I). Uppercase = major, lowercase = minor; an explicit accidental (bIII, #IV) is kept as written. |

#### Scale

`tonal-gamme` · Others → Theory

*Lists the notes of a scale from a tonic and a scale type.*

Lists the notes of a chosen scale. Example: C major → C D E F G A B. Available types include major, minor, dorian, mixolydian, lydian, phrygian and locrian.

| Port | Name | Type | |
|---|---|---|---|
| input | Tonic | text |  |
| output | Notes | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tonic | choice | C | C / C# / D / D# / E / F / F# / G / G# / A / A# / B | Starting tonic. |
| Type | choice | major | major / minor / dorian / mixolydian / lydian / phrygian / locrian | Scale type. |

#### Species Counterpoint

`contrepoint-especes` · Others → Theory

*Checks a first-species counterpoint against Fux's rules and annotates every infringement.*

Checks a first-species counterpoint. This is Attic's first node that CORRECTS rather than produces. Johann Joseph Fux published in 1725 the « Gradus ad Parnassum », where counterpoint is learned by species: in the first, note against note, which isolates the question of harmony and motion between two voices without rhythm interfering. Haydn, Mozart and Beethoven all worked through it, and the rules have not changed since. They amount to few things and each can be checked mechanically: only consonances are allowed — and the fourth is not one in two voices, which always surprises — parallel fifths and octaves are forbidden, as are those reached by similar motion, one begins and ends on a perfect consonance, large leaps are answered by contrary stepwise motion, and the cadence is by contrary motion to the octave. The node rewrites nothing: it ANNOTATES, separating prohibitions from mere recommendations. That is what a teacher does, and it is more useful than an automatic correction, which would deprive one of the only thing that matters — understanding why the rule exists. The exercise offered by default is correct: the node must find nothing in it, and that is the module's first test. An over-zealous checker is unusable, since one stops reading it.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Lower voice | text | `C4 D4 E4 F4 E4 D4 C4` |  | The cantus firmus, one note per beat. A MIDI file on the input wins: its notes are split into two voices by pitch. |
| Upper voice | text | `G4 F4 G4 A4 G4 B4 C5` |  | The counterpoint, one note per beat, as many notes as the lower voice. The default is a correct exercise: the node should find nothing in it. |
| Inner unisons | choice | Forbidden | Forbidden / Allowed | Fux forbids the unison anywhere but at the start and the end, because the two voices merge there and only one line is heard. |

#### Transpose

`tonal-transposer` · Others → Theory

*Transposes a note or chord by a given interval.*

Transposes a note by a given interval. Example: C4 + 2M → D4. Uses Tonal interval notation (1P, 2m, 2M, 3m, 3M, 4P, 5P, 6m, 6M, 7m, 7M, 8P).

| Port | Name | Type | |
|---|---|---|---|
| input | Note | text |  |
| output | Transposed | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | text | `C4` |  | Note to transpose (e.g. C4, D#3, F#5). |
| Interval | choice | 2M | 1P / 2m / 2M / 3m / 3M / 4P / 4A / 5P / 6m / 6M / 7m / 7M / 8P | Transposition interval (2M = whole tone, 3m = minor third, 3M = major third, etc.). |
