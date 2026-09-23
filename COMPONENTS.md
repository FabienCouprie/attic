# Attic Component Catalog

> Generated from the live node registry by `src/docs/catalogue-markdown.ts` — do not edit by hand.  
> Regenerate with `npm run docs:components`.

Attic ships **395 components** in **7 categories** and **60 families**. Every name, summary, description and parameter note below is the English text the application itself displays.

## Contents

| Category | Components | Families |
|---|---:|---|
| [Inputs](#inputs) | 72 | [AI](#ai) (2) · [Audio](#audio) (6) · [Control](#control) (1) · [Fractals](#fractals) (4) · [Generation](#generation) (11) · [Image](#image) (3) · [Keyboards](#keyboards) (4) · [Notation converters](#notation-converters) (3) · [Other generators](#other-generators) (2) · [Reservoirs and randomness](#reservoirs-and-randomness) (5) · [Rhythms](#rhythms) (7) · [Sensory resonance](#sensory-resonance) (7) · [Sequencers](#sequencers) (2) · [Synthesizers](#synthesizers) (5) · [Text](#text) (1) · [Text to Speech](#text-to-speech) (6) · [Xenakis](#xenakis) (3) |
| [Processing](#processing) | 193 | [Conversion](#conversion) (4) · [Denoising](#denoising) (6) · [Distortion and modulation](#distortion-and-modulation) (19) · [Echo](#echo) (6) · [Editing](#editing) (25) · [Envelope control](#envelope-control) (2) · [Equalisation and filters](#equalisation-and-filters) (14) · [Generation](#generation-1) (1) · [Image](#image-1) (2) · [Instruments](#instruments) (11) · [Logistic](#logistic) (7) · [MIDI patterns](#midi-patterns) (4) · [Order and inversions](#order-and-inversions) (11) · [Other effects](#other-effects) (10) · [Pitch](#pitch) (11) · [Reverberation](#reverberation) (8) · [Spectrum](#spectrum) (19) · [Stereo](#stereo) (13) · [Stretching](#stretching) (4) · [Tempo](#tempo) (9) · [Text](#text-1) (1) · [Topology](#topology) (6) |
| [Visualization](#visualization) | 39 | [Analysis](#analysis) (30) · [Image](#image-2) (1) · [Notation](#notation) (8) |
| [Outputs](#outputs) | 10 | [Export](#export) (4) · [Monitoring](#monitoring) (6) |
| [Collections](#collections) | 12 | [Analysis](#analysis-1) (2) · [Conversion](#conversion-1) (5) · [Export](#export-1) (4) · [Playback](#playback) (1) |
| [Meta-components](#meta-components) | 2 | [Boundary](#boundary) (2) |
| [Other & lab](#other--lab) | 67 | [Csound wrapper](#csound-wrapper) (9) · [Generation](#generation-2) (7) · [Installation](#installation) (1) · [Learning](#learning) (2) · [Magenta](#magenta) (7) · [Multichannel](#multichannel) (6) · [Speech to Text](#speech-to-text) (2) · [Test zone](#test-zone) (5) · [Text](#text-2) (16) · [Theory](#theory) (10) · [Video](#video) (2) |

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

### AI

| Component | Summary |
|---|---|
| [MusicGen](#musicgen) | Generates music from a text prompt using Xenova/musicgen-small, an ONNX-converted version of Meta's MusicGen Small text-to-audio model, optimized to run locally in JavaScript environments via Transformers.js. |
| [Stable Audio 3](#stable-audio-3) | Generates stereo music from a text prompt using Stable Audio 3 (ONNX). |

#### MusicGen

`musicgen` · Inputs → AI

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

#### Stable Audio 3

`stable-audio-3` · Inputs → AI

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

### Control

| Component | Summary |
|---|---|
| [Curve](#curve) | Builds a modulation curve: oscillator, ramp, logistic sequence or random walk. |

#### Curve

`generateur-courbe` · Inputs → Control

*Builds a modulation curve: oscillator, ramp, logistic sequence or random walk.*

Builds a modulation curve to plug into an effect's Modulation input. A curve carries values between zero and one; the effect decides what zero and one mean at its end. The logistic sequence deserves an explanation, because it is this node's reason for being as much as the other shapes: seven Attic nodes each reimplemented it on their own — logistic echo, logistic tremolo, logistic vibrato, logistic auto-pan, logistic chopper, logistic Paulstretch, logistic mixer. Seven implementations of the same sequence, and for seven effects only. A single source plugged into any effect does the same work, and for every effect that accepts a modulation. The sequence itself is x next = r x (1 - x): below 3 it settles on one value, around 3.45 it alternates between two then four, and beyond 3.57 it turns chaotic and never repeats — that is where the Chaos setting gets interesting. The periodic shapes give the ordinary tremolo, vibrato and sweep; the ramp gives the « progressive » effects; the random walk gives a gentle drift that never comes back to the same place.

| Port | Name | Type | |
|---|---|---|---|
| output | Curve | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Shape | choice | Sine | Sine / Triangle / Square / Ramp / Logistic / Random | The shape of the modulation. The logistic sequence is here for a precise reason: seven Attic nodes each reimplemented it on their own — logistic echo, logistic tremolo, and five others. A single source plugged into any effect does the same work, and on all of them rather than on seven. |
| Duration | slider | 10 s | 0.5 – 120 s, step 0.5 | Length of the curve. It need not match the sound's: the effect stretches it to cover it, so a ramp stays a ramp whatever the sound's length. |
| Frequency | slider | 0.5 Hz | 0.01 – 20 Hz, step 0.01 | Cycles per second for the periodic shapes; for the logistic and random ones, steps per second. |
| Chaos | slider | 3.9 | 2.5 – 4, step 0.01 | The logistic sequence's r. Below 3 it settles; around 3.45 it alternates between two values, then four; beyond 3.57 it turns chaotic and never repeats. |
| Seed | number | 1 | 1 – 999999, step 1 | Seed of the random walk. |

### Fractals

| Component | Summary |
|---|---|
| [Fractal Music](#fractal-music) | Generates a fractal melody from a repeated motif and scale. |
| [Fractal Spectrogram](#fractal-spectrogram) | Generates a fractal spectrogram and its associated audio. |
| [Koch Snowflake Arpeggiator](#koch-snowflake-arpeggiator) | Three voices playing three levels of the same Koch snowflake at three speeds: the pattern and its reductions heard together. |
| [Mandelbrot Mapper](#mandelbrot-mapper) | Scans a view of the Mandelbrot set and turns each point into a note: the number of iterations before divergence sets the pitch. |

#### Fractal Music

`generateur-fractal` · Inputs → Fractals

*Generates a fractal melody from a repeated motif and scale.*

Builds a piece by recursively applying an interval motif over several depth levels, producing a self-similar structure. Audio output + MIDI output for chaining to other MIDI nodes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Motif | choice | Major triad | Major triad / Minor triad / 7th arpeggio / Cantus firmus / Custom | Base interval motif repeated recursively. |
| Intervals | text | `0,3,7,10` |  | Intervals of the custom motif, in semitones separated by commas (e.g. 0,3,7,10). |
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

`spectrogramme-fractal` · Inputs → Fractals

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

#### Koch Snowflake Arpeggiator

`arpege-koch` · Inputs → Fractals

*Three voices playing three levels of the same Koch snowflake at three speeds: the pattern and its reductions heard together.*

Three voices play three levels of the same Koch snowflake. Each starts from one side of the triangle formed by the chord - root to third, third to fifth, fifth to octave - and subdivides it by the Koch rule: the interval is cut into three, and the middle third replaced by a peak, each sub-segment of which in turn receives a peak three times smaller. The resulting pitches are brought onto the chosen scale. The first voice is subdivided at the requested depth and plays in sixteenths; the second, one level less, four times slower; the third, two levels less, sixteen times slower. The three complete together a cycle of 4^depth sixteenths: one hears the pattern, its reduction and the reduction of its reduction at once, in a 1 : 4 : 16 polyrhythm. The height is that of the first peak, in semitones; a peak smaller than one scale step melts into its neighbours, so a great depth calls for a great height. The direction says which way the peaks point. Each level of depth multiplies the cycle length by four; the repeats chain several cycles, and the last note of each voice closes the whole on the chord. The articulation sets how much of each step sounds; two neighbouring notes landing on the same pitch can be tied or replayed. Audio and MIDI output.

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
| Depth | number | 3 | 1 – 5, step 1 | Number of subdivisions of the fastest voice; the other two have one and two fewer. Each level multiplies the cycle length by four: 4 sixteenths at 1, 64 at 3, 1024 at 5. |
| Direction | choice | alternating | alternating / outward / inward | Direction of the Koch peaks on each voice. |
| Height | number | 9 semitones | 1 – 24 semitones, step 1 | Height of the first peak, in semitones; each following level sets peaks three times smaller. A peak smaller than one scale step is no longer heard: at 9 semitones, three levels stay audible (9, 3 and 1); for depth 4, go up towards 18 or 24. |
| Tempo | number | 100 BPM | 40 – 240 BPM | Tempo of the arpeggio in beats per minute. |
| Repeats | number | 1 | 1 – 16, step 1 | Number of complete cycles of the snowflake. A cycle lasts 4^depth sixteenths at the chosen tempo. |
| Articulation | slider | 85 % | 10 – 100 %, step 1 | Share of each note's step that sounds. 100%: legato; 30%: staccato. It applies to each voice at its own speed, so the slow voice holds its notes four and sixteen times longer. |
| Repeated notes | choice | Tied | Tied / Replayed | Once brought onto the scale, two neighbouring positions sometimes land on the same note. Tied: they make a single, longer note; replayed: the note is struck again. |
| Timbre | choice | Soft | Soft / Bright / Percussive | Character of the FM synthesis. Soft: close to a sine, softened attack. Bright: rich in harmonics. Percussive: dry attack and a note that falls away fast. No effect with SoundFont, where the chosen instrument sets the timbre. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the audio. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

#### Mandelbrot Mapper

`mappeur-mandelbrot` · Inputs → Fractals

*Scans a view of the Mandelbrot set and turns each point into a note: the number of iterations before divergence sets the pitch.*

Scans a view of the Mandelbrot set and turns each point into a note. For each point c of the view, the node iterates z = z² + c and counts the iterations before z escapes: a few far from the set, hundreds right by its edge. That number sets the pitch, on a logarithmic scale spread over two octaves of the chosen scale (the sensitivity widens or narrows this range); the closer a point is to the edge, the higher and louder it sounds. The points of the set itself, which never escape, are the black of the image: they fall silent, and the edge of the fractal then makes the rhythm, or they hold the tonic an octave lower. Three modes. Escape time: the pitch follows the iterations. Dwell: the note lengths follow them too, and the points of the edge linger. Octave: the octave comes from the point's height in the image, the degree from the iterations, and the view is scanned column by column. The centre and zoom choose the region: the whole view gives a symmetric melody, since the set is symmetric about the real axis; a zoom on the edge, where the fractal branches, gives more agitated lines. Same seed, same points. Audio and MIDI output.

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
| Mode | choice | Escape time | Escape time / Dwell / Octave | Escape time: the pitch follows the number of iterations - points near the edge of the set sound high. Dwell: same pitch, and the length of each note follows the iterations too, so the points of the edge linger. Octave: the octave comes from the point's height in the image (top is high), the degree from the iterations; the points are then scanned column by column. |
| Notes | number | 32 notes | 8 – 256 notes, step 1 | Number of points sampled in the plane, hence notes generated. |
| Note duration | number | 0.5 | 0.05 – 2, step 0.05 | Length of each note, as a fraction of a beat (1 = a quarter note, 0.5 = an eighth). In Dwell mode it is the average length: from half for points that diverge at once to twice for those of the edge. |
| Tempo | number | 100 BPM | 40 – 240 BPM | Tempo of the melody in beats per minute. |
| Key | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | Reference note (tonic) of the scale. |
| Scale | choice | Major | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | Scale used to quantize note pitches. |
| Octave | number | 4 | 1 – 6, step 1 | Octave of the lowest note of the range. 4: C4, MIDI note 60. |
| Sensitivity | number | 1 | 0.1 – 5, step 0.1 | Width of the pitch range. At 1, two octaves of the scale; at 0.5, one; at 2, four. The iteration count is spread over it on a logarithmic scale, so that no note gets stuck at the top of the keyboard. |
| Inside | choice | Silence | Silence / Low tonic | What becomes of the points of the set itself, which never diverge - the black of the image. Silence: they fall silent, and the edge of the fractal makes the rhythm. Low tonic: they hold the tonic one octave below the range. |
| Timbre | choice | Soft | Soft / Bright / Percussive | Character of the FM synthesis. Soft: close to a sine, softened attack. Bright: rich in harmonics. Percussive: dry attack and a note that falls away fast. No effect with SoundFont, where the chosen instrument sets the timbre. |
| Volume | number | 80 % | 0 – 100 % | Output volume of the audio. |
| Seed | number | 42 | 0 – 999999, step 1 | Seed for the pseudo-random distribution of sampling points. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |

### Generation

| Component | Summary |
|---|---|
| [Cellular automaton](#cellular-automaton) | Generates a musical sequence from a 1D or 2D cellular automaton. |
| [Chord Generator](#chord-generator) | Generates a chord progression. |
| [Custom Sampler](#custom-sampler) | Plays an audio sample as a melodic instrument. |
| [Feature Synthesis](#feature-synthesis) | Builds a sound from the forty measurements that describe it, and shows how close it comes. |
| [Frequency Generator](#frequency-generator) | Generates a pure tone at a given frequency (Hz) or note. |
| [Mathematical Audio Generator](#mathematical-audio-generator) | Generates an audio signal from a mathematical expression. |
| [Noise Generator](#noise-generator) | Generates white, pink or brownian noise. |
| [Oscillator](#oscillator) | Generates a pure waveform; the view shows the wave and its harmonics. |
| [Pulsar Synthesis](#pulsar-synthesis) | Fundamental and formant set independently, from short repeated bursts. |
| [Risset Bell](#risset-bell) | Synthesises a bell by adding inharmonic partials. |
| [SSP (Koenig)](#ssp-koenig) | Composes the waveform the way one composes a piece: two lists of numbers, principles for drawing from them, and the sound is the line joining the resulting points. |

#### Cellular automaton

`automate-cellulaire` · Inputs → Generation

*Generates a musical sequence from a 1D or 2D cellular automaton.*

Generates a musical sequence from a 1D cellular automaton (Wolfram rules 30, 90, 110, 126, 150). Each cell generation becomes a time step. Active cells are mapped to a chosen scale and key to form chords (Polyphony mode) or a melody (Melody mode). Audio + MIDI output. Rules 90 and 150 produce fractal structures; rules 30 and 110 yield more chaotic patterns. In 2D (Conway, Highlife), the whole grid evolves, and each generation is a step of the sequence. Every live cell sounds: its column gives the degree in the scale, its row the register, over three octaves - the top of the grid sounds high. Several cells on the same note add up, and their number sets the velocity when the mapping asks for it. One thus hears the life of the grid: a growing pattern fills the spectrum, a pattern that settles repeats its chord, a grid that dies out falls silent. Seed 0 starts from a long-lived pattern: in Conway, the R-pentomino, five cells that unfold before settling; in Highlife, the replicator, twelve cells that copy themselves along a diagonal.

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
| Height | number | 16 cells | 4 – 64 cells, step 1 | Grid height in 2D mode. The rows are spread over three octaves: the top of the grid sounds high. No effect in 1D. |
| Generations | number | 32 steps | 4 – 256 steps, step 1 | Number of generations, hence of steps in the sequence: each generation, in 1D as in 2D, is one step. |
| Seed | number | 0 | 0 – 9999, step 1 | 0: a fixed pattern in the centre - one cell in 1D; in 2D, a long-lived pattern (the R-pentomino in Conway, the replicator in Highlife). Otherwise, a grid drawn at random from this seed. |
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

#### Feature Synthesis

`synthese-features` · Inputs → Generation

*Builds a sound from the forty measurements that describe it, and shows how close it comes.*

The reverse path of « Track Features »: give it a vector, it returns a sound. What it cannot do, and what should be known first. The vector does not determine a sound: it determines an infinite class of them. Two very different tracks can share their tempo, centroid, chroma and cepstral coefficients. This node therefore reproduces nothing — it builds a sound whose measured vector comes close to the target, and it tells you how close. The four families do not invert equally. Tempo is not a measurement to recover but a setting to impose: one chooses the rate. Chroma is allocated exactly — twelve weights, twelve pitch classes in those proportions. The centroid is solved: for a harmonic series whose amplitudes fall as one over k to the alpha, the centroid is a monotone function of alpha, inverted by bisection on the spectrum actually produced. The cepstral coefficients resist: Meyda computes thirteen of them over twenty-six mel bands, and going back gives a smoothed envelope. That is what MFCCs are for — discarding that detail — and no inversion will restore it. What the round trip gives, measured. The centroid comes back within a few per cent: 797 targeted, 803 obtained. The three dominant pitch classes are the same, in close proportions. The cepstral coefficients come back approximately, which is expected. The tempo needs an explanation. The synthesis places one note every 60 divided by the tempo seconds: the tempo produced IS the one asked for. But the detector often reads a sub-multiple — 40 or 60 for 120 depending on the seed — because notes all of equal strength give it no accent to choose between a beat and its double. The deviation shown for that family therefore comes from the measurement, not from the synthesis.

| Port | Name | Type | |
|---|---|---|---|
| input | Vector | text |  |
| output | Audio | audio |  |
| output | Deviation | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | slider | 8 s | 1 – 60 s, step 1 | Length of the sound built. Longer, the chroma proportions come out better — enough notes are needed for a twelve-class allocation to show. |
| Octave | slider | 4 | 1 – 7, step 1 | Octave of the fundamentals. The vector carries no absolute pitch: chroma says which classes, never in which register. The choice is yours, and it moves the centroid obtained. |
| Partials | slider | 24 | 4 – 48, step 1 | Number of partials per note. Few, and the target centroid may be out of reach — a short series does not reach high enough. Many, and the sound gains richness without the measurement changing much. |
| Seed | slider | 5 | 0 – 999999, step 1 | Seed for the note order. The chroma proportions do not change with it — they are allocated exactly — only the order does. The same seed replays the same sound. |
| Verify | choice | Yes | Yes / No | Re-measure the sound produced and show the deviation family by family. It is the only proof the node comes close to anything, and it doubles the computation time. « No » returns the sound only. |

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

#### Pulsar Synthesis

`pulsars-roads` · Inputs → Generation

*Fundamental and formant set independently, from short repeated bursts.*

After Curtis Roads's pulsar synthesis ("Microsound", 2001). A pulsar is a brief waveform — the pulsaret — followed by silence, the whole thing repeated. Two durations describe it, and therein lies its interest: the repetition period, whose inverse gives the fundamental you hear, and the pulsaret duration, whose inverse gives the formant position, that is, the region of the spectrum where energy concentrates. The two are independent: you can drop the note an octave without moving the formant, or move the formant without changing the note. No acoustic instrument allows this, and neither does classic granulation, whose time grid and grain content stay tied together. The silence between pulsars is not incidental: it is what makes the decoupling possible. When the pulsaret duration reaches the period — that is, when the formant drops to the fundamental — pulsars touch and the process dissolves into a continuous waveform; the node caps there, which is a constraint of the model rather than a limitation of the implementation.

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

#### Risset Bell

`cloche-risset` · Inputs → Generation

*Synthesises a bell by adding inharmonic partials.*

The timbre from Jean-Claude Risset's "Introductory Catalogue of Computer Synthesized Sounds" (Bell Labs, 1969), influential for a precise reason: it showed that timbre is not a fixed spectrum but an evolution. A bell sounds like a bell not because it contains particular frequencies, but because its eleven partials die away at different rates — the highest in a tenth of the time the lowest take. A second lesson, which the "Inharmonicity" parameter lets you hear: no partial is an integer multiple of the base frequency, which is why a bell has no definite pitch. Set it to 0% and the same partials, snapped onto the harmonics, instantly stop sounding like a bell. Finally, two partials are doubled 1 Hz and 1.7 Hz apart: that tiny detuning makes them beat slowly, and this beating is what gives the bell its life — the "Beating" parameter lets you switch it off and hear it vanish. The stated frequency is not the perceived pitch, since no partial sits on it.

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

#### SSP (Koenig)

`ssp-koenig` · Inputs → Generation

*Composes the waveform the way one composes a piece: two lists of numbers, principles for drawing from them, and the sound is the line joining the resulting points.*

After Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institute of Sonology, Utrecht, in the 1970s, whose selection principles come from his programs Project 1 (1964) and Project 2 (1966). See also Luc Dobereiner, « Models of Constructed Sound: Nonstandard Synthesis as an Aesthetic Perspective », Computer Music Journal 35(3), 2011. What « nonstandard » means. All ordinary synthesis starts from a model: an oscillator, a waveform, a spectrum, an envelope, an instrument. Here there is none of that. You give two lists of numbers — amplitudes and durations — and principles for drawing from them. The pairs so drawn are points, and the sound is the line joining them. No pitch, no note, no timbre: the pitch you will hear is a consequence of the durations you wrote, never a setting. Koenig's thesis, and what makes this node unlike the others. The same principles hold at every scale: what orders the points of a waveform also orders the sections of a piece. That is why the same choice of five words is offered for the amplitudes, for the durations and for the order of the sections. A series means exactly the same thing at all three scales — each element once before any repeats — and you can hear it. The warning that must be given. SSP has a reputation for being impossible to steer. Koenig himself found that the program resisted musical intention, and the overwhelming majority of settings return noise. But two things really are under your command, and they can be measured. The durations make the treble: measured, the spectrum's centre of gravity runs from 9 Hz for durations of a thousand samples to 4,419 Hz for durations of two or three, close to five hundred to one. The amplitudes make the crest: from 1.81 dB for two extreme values to 8.38 dB for many small ones and one large. And the two axes are separate — changing the amplitudes does not move the treble, changing the durations does not change the crest — which forbids saying that this node has but a single noise knob. How to use it without getting lost. Write the durations first, which decide the region where the sound will sit: around three samples for a high whistle, around fifty for a middle register, beyond five hundred for reliefs you hear going past rather than sounding. Then write the amplitudes, which decide the relief: two extreme values give a full, straight sound, a mixture of small and large gives a hollowed one. The principles come last, and that is where composition begins. One case worth knowing. A tendency applied to the amplitudes draws a ramp crossing the set from end to end, not a sound: at the scale of a whole section it is heard only as a slow drift. Tendency comes into its own at the scale of form, which is where Koenig used it. At equal seed the node returns the same sound twice; at a different seed, two unrelated sounds drawn from the same material.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Amplitudes | text | `-1, -0.6, -0.2, 0.2, 0.6, 1` |  | The list of amplitudes to draw from, between -1 and 1, separated by commas. It is your material, not a setting: one set is not larger or smaller than another, it is other. Two extreme values give a full, straight sound whose crest falls below 2 dB; many small values and one large give a hollowed sound whose crest exceeds 8 dB. An empty or unreadable entry falls back on the original list. |
| Durations | text | `5, 9, 17, 33, 65` |  | The list of gaps between two points, in samples. It is the only place pitch comes from, and there is no other: around three samples the sound whistles near 4 kHz; around fifty it sits in the middle register; beyond five hundred you hear reliefs going past rather than sounding. The report measures the treble obtained afterwards, since nothing here lets you predict it in your head. |
| Amplitude principle | choice | Alea | Alea / Series / Sequence / Group / Tendency | How to draw from the amplitude list. Alea draws at random and may repeat. Series exhausts the list before starting over, which forbids any immediate repeat. Sequence follows the written order, never departing from it. Group holds each value two to five times in a row, and you then hear steps where alea only makes a sizzle. Tendency drifts the drawing window from one end of the list to the other — applied to amplitudes, it draws a ramp rather than a sound. |
| Duration principle | choice | Alea | Alea / Series / Sequence / Group / Tendency | How to draw from the duration list. The same vocabulary applied to time: a sequence on the durations gives strict periodicity, hence a clear pitch; alea dissolves it; group holds one speed for several points before changing, which makes register steps audible. |
| Form principle | choice | Series | Alea / Series / Sequence / Group / Tendency | How to order the sections, and this is where Koenig's thesis is verified instead of proclaimed. The same word means the same thing as at the sample scale: a series has each section pass once before any repeats, a group holds the same one several times, a tendency moves from the first towards the last. The report gives the resulting order. |
| Sections | slider | 4 | 1 – 24, step 1 | How many distinct sections to compose before ordering them. At one, the piece is of a single piece and the form principle has nothing to act on. Beyond a dozen, each section becomes too brief to be identified, and the order stops being audible. |
| Joining | choice | Line | Line / Steps | What happens between two points, and it is the only timbre decision the method knows. The line joins them and the signal passes through every intermediate value. Steps hold each amplitude until the next point, so the signal only ever takes the values you wrote. Measured on identical points, the crest goes from 5.14 to 3.34 dB: a fuller sound, and a harder one. |
| Duration | slider | 8 s | 0.5 – 60 s, step 0.5 | The duration of the piece. It is shared among the sections, which are therefore the briefer the more you ask for. |
| Seed | slider | 7 | 1 – 9999, step 1 | Two seeds give two unrelated sounds drawn from the same material. At equal seed the node returns exactly the same sound twice, which lets you find again a draw you had liked. |

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

### Keyboards

| Component | Summary |
|---|---|
| [Instrument Note](#instrument-note) | Carries the played note into an instrument chain: audio excitation, one-note MIDI, and the pitch as a curve. |
| [Melody Keyboard](#melody-keyboard) | Plays a keyboard-recorded sequence and also exports a MIDI file. |
| [SFZ Bank](#sfz-bank) | Loads an SFZ sample bank — the drum kit shipped with Attic, or a file from disk — with no keyboard. |
| [SFZ Keyboard](#sfz-keyboard) | Plays an SFZ bank — a file from disk or a bank from the graph — on an 88-key keyboard, and records what you play. |

#### Instrument Note

`frontiere-note` · Inputs → Keyboards

*Carries the played note into an instrument chain: audio excitation, one-note MIDI, and the pitch as a curve.*

Carries the played note into an instrument chain. This is the boundary: everything wired between this node and « Instrument End » is the instrument's recipe, and the engine copies it once per keyboard note before execution, injecting the note into each copy. Nothing is transposed: each note is computed at its own pitch, which is the difference between a synthesiser and a sampler. On its own — with no end downstream — the node renders the note set in the inspector: enough to listen to and tune the instrument at one pitch before spreading it across the eighty-eight keys. Three outputs, and none replaces the other two. Audio: an excitation at the note's frequency — sawtooth to give a filter something to bite on, impulse to excite a resonator like a plucked string, noise for a breathy sound or a percussion. MIDI: a one-note file, for the nodes that play notes themselves — Csound instrument, physical models, SoundFont, drum synth. Curve: the pitch normalised over the keyboard range, on a logarithmic scale, to drive a parameter with the note — a filter opening toward the treble, for instance. Offering only the first would have shut out the other two families of instruments.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Pitch | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Note | slider | 60 | 21 – 108, step 1 | MIDI note rendered (60 = middle C). This is the instrument's boundary: when an « Instrument End » is connected downstream, the engine copies the chain once per keyboard note and replaces this setting in each copy. On its own, the node renders the note set here — enough to listen to and tune the instrument at one pitch before spreading it across the 88 keys. |
| Waveform | choice | Sawtooth | Sine / Sawtooth / Square / Triangle / Impulse / Noise | Shape of the excitation on the Audio output. The sawtooth holds every harmonic, giving a filter something to work with; the impulse excites a resonator like a plucked string; Noise serves breathy sounds and percussion. The MIDI and Pitch outputs do not depend on this setting. |
| Duration | slider | 1.5 s | 0.1 – 8 s, step 0.1 | Length of the excitation, hence of each sample in the bank. It decides the instrument's weight: eighteen zones of a second and a half come to about two megabytes. |
| Volume | slider | 60 % | 0 – 100 %, step 1 | Level of the excitation. Keep it low if the chain resonates: a high-resonance filter can multiply the level tenfold. |
| Velocity | slider | 100 | 1 – 127, step 1 | Velocity written into the MIDI output, for the nodes that take it into account. |

#### Melody Keyboard

`clavier-melodie` · Inputs → Keyboards

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

#### SFZ Bank

`banque-sfz` · Inputs → Keyboards

*Loads an SFZ sample bank — the drum kit shipped with Attic, or a file from disk — with no keyboard.*

Loads an SFZ sample bank and hands it to the graph, with no keyboard. The missing path: until now, bringing a .sfz from disk went through « SFZ Keyboard », whose eighty-eight keys are pointless in an arrangement — four parts meant four keyboards eating the canvas for nothing. The drums ship with Attic: the built-in kit, this node's default source, holds eight sounds on General MIDI notes — 36 kick, 38 snare, 39 clap, 42 closed hi-hat, 45 low tom, 46 open hi-hat, 49 crash, 50 high tom. Those sounds are synthesized by Attic itself, the advanced drum sequencer's own, rendered to files and bundled with the application just like the default SoundFont: three hundred and seventy kilobytes, no third-party samples, no download, and the node gives a playable drum kit with nothing to set. The bank type is what makes the drums right, and it is this node's most important distinction. A pitched bank always looks for the nearest zone: measured on a real kit read that way, key 37 — absent from General MIDI — played the kick a semitone higher, and key 60 played the crash an octave and a half up. A kit transposes nothing and leaves a key with no sound silent. The file says so itself — single-key regions, or a « pitch_keytrack=0 » — and automatic mode detects it; forcing either remains possible, including to get a deliberately transposed kit. Velocity layers are kept. A seriously sampled piano has three to eight recordings per key — played softly the hammer brushes the string, played hard it slams — and that is not a matter of level: a forte sample turned down twenty decibels remains a forte sample. Each layer becomes a zone with its velocity range, and the message reports how many there are. If the file declares « amp_veltrack », it is honoured: at zero, velocity only picks the layer and no longer touches the level, which avoids the double effect that made notes played piano nearly inaudible. The preview plays each sound one after another — one note per key, not one per zone — then, when there are layers, a staircase of dynamics on a single key, from softest to loudest: the only way to hear what the layers bring without wiring a keyboard or a MIDI file.

| Port | Name | Type | |
|---|---|---|---|
| output | Bank | bank |  |
| output | Preview | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Source | choice | Built-in kit | Built-in kit / SFZ file | Built-in kit: the drum kit shipped with Attic — eight sounds on General MIDI notes (36 kick, 38 snare, 42 closed hi-hat…), synthesized by Attic and bundled with the application, hence available with no network and no download. SFZ file: a `.sfz` from disk, chosen with the node's 📂 button; its samples are read beside it. |
| Bank type | choice | Automatic | Automatic / Pitched / Kit | How the bank plays. Automatic: the file decides — single-key regions, or a `pitch_keytrack=0`, mark a kit. Pitched: a key is a pitch; the nearest zone is resampled and no key stays silent. Kit: a key is a sound; nothing is transposed, and a key with no sound plays nothing. Forcing « Pitched » on a kit makes key 37 play the kick a semitone higher — sometimes that is the effect you want, but better to know it. |
| Preview | choice | Yes | Yes / No | Renders an audio preview: one note per key of the bank, one after another — not one per zone, otherwise a layered bank would sound the same note three times. If there are velocity layers, a staircase of dynamics follows on a single key, from softest to loudest: the only way to hear what they bring. |

#### SFZ Keyboard

`clavier-sfz` · Inputs → Keyboards

*Plays an SFZ bank — a file from disk or a bank from the graph — on an 88-key keyboard, and records what you play.*

An eighty-eight-key keyboard, playable with the mouse or the computer keyboard, that sounds a sample bank. Attic could already write SFZ — « SFZ Export » — but nothing could read it back: the application's only playable keyboard plays a globally loaded SF2, one file for the whole session. This node reads a .sfz at node level, and the instrument may differ from one node to the next within a single graph. Two sources, and that is the double point. The file: the 📂 button picks a .sfz, its samples are read beside it, and the path is kept in the graph — enough to check what you have just exported, or to play a bank from elsewhere. The bank input: « Spread Across Keyboard » or « Instrument End » wired straight in, with no disk round trip; the graph must then have been run once for the keyboard to have something to play. What you play is recorded, and the node outputs three things: the sequence's audio, its MIDI, and the bank itself, which can therefore be chained on to « SFZ Export » or « Multi-Zone Sampler ». The playback ratios are the render's: the same function serves live playing and the graph's audio, so what you hear while listening to yourself is what will come out. What is read from the format: regions, opcode inheritance through &lt;global>, &lt;master> and &lt;group>, note names as well as numbers, default_path, sustain loops, tune, volume and transpose. What is not is stated in the node's message rather than guessed: ignored opcodes are counted and named, missing samples too, and velocity layers are kept: one key may carry three to eight recordings — piano, mezzo, forte — and the played velocity picks which one sounds. On the keyboard, velocity comes from the striking rhythm: playing fast brings out the loud layer. An #include is reported, not followed.

| Port | Name | Type | |
|---|---|---|---|
| input | Bank | bank |  |
| output | Audio | audio (stereo) |  |
| output | MIDI | MIDI |  |
| output | Bank | bank |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Source | choice | Automatic | Automatic / SFZ file / Incoming bank | Where the instrument comes from. Automatic: the incoming bank if one is connected, otherwise the `.sfz` file chosen in the node's view. SFZ file: always the file, even if a bank arrives — useful to compare what was exported with what the graph produces now. Incoming bank: always the input. |
| Volume | slider | 80 % | 0 – 100 %, step 1 | Output level. Each note's velocity scales it, and an SFZ region's `volume` adds to it. |
| Release | slider | 150 ms | 1 – 2000 ms, step 1 | Fade-out time after the key is released. If the SFZ file declares an `ampeg_release`, it is shown in the node's message — but this setting is what applies, so the node stays in charge of what it renders. |
| Loop crossfade | slider | 20 ms | 1 – 200 ms, step 1 | Length of the crossfade at the sustain loop's join, for the render. Too short, a click is heard on every turn; too long, the loop starts to breathe. Live playing loops through the audio hardware and does not crossfade the join. |
| Tempo | slider | 120 BPM | 40 – 240 BPM, step 1 | Tempo written into the output MIDI file. It does not change the audio: what was played was played at the time it was played. |

### Notation converters

| Component | Summary |
|---|---|
| [ABC → MIDI](#abc--midi) | Reads a score in ABC notation — melody, chord symbols, repeats, several voices — and renders it to MIDI and audio. |
| [ABC Cover](#abc-cover) | Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass — ballad, pop, waltz, march, bossa nova. |
| [Text → MIDI](#text--midi) | Converts a text notation (one note/chord per line) into MIDI + audio. |

#### ABC → MIDI

`abc-vers-midi` · Inputs → Notation converters

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

`reprise-abc` · Inputs → Notation converters

*Covers an ABC score in another style: same melody, same chords, with an accompaniment and a bass — ballad, pop, waltz, march, bossa nova.*

Covers an ABC score in another style: melody and chord symbols stay those of the score, and the node adds an accompaniment voice and a bass line that follow the harmony with a pattern — held chords, ballad arpeggios, pop chords on the beats, waltz bass–chord–chord, march bass–chord, bossa nova. It outputs the audio, a three-track MIDI (one instrument each) and the arranged ABC. This is a cover in YuE2's sense, symbolically: same melody, different arrangement. No language model is involved: the patterns are deterministic, because the measurement made for « ABC Editing by LLM » showed that local models go wrong as soon as they write durations — and an accompaniment is made of nothing but durations. To change the harmony too, first place « ABC Editing by LLM » in reharmonization. The original melody is copied as is and verified intact at the end, as by « ABC Constraints ». Each hit stops at the next chord change: a chord never spills over the next one. A score without chord symbols is refused, with an indication of what to do; so is a style that does not fit the meter — no bossa nova in 3/4, no march on an odd number of beats. Tunes starting with a pickup are not handled.

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

#### Text → MIDI

`texte-vers-midi` · Inputs → Notation converters

*Converts a text notation (one note/chord per line) into MIDI + audio.*

Renders a simple text notation into a MIDI file and synthesized audio. One line = « note octave duration [velocity] », e.g. « C4 0.5 » or « C4+E4+G4 1 » (chord), « rest 0.5 » for a rest, « Tempo 120 » at the top. Text comes from the input (blue port) or the parameter. Ideal after an AI node (Ollama, GPT-2) prompted to output this format.

| Port | Name | Type | |
|---|---|---|---|
| input | Text | text |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notation | text | `Tempo 120 C4 0.5 E4 0.5 G4 0.5 C5 1 rest 0.5 A4+C5+E5 1` |  | Notation to convert, used when no text input is connected. One note/chord per line. |
| Tempo | number | 120 BPM | 40 – 240 BPM, step 1 | Default tempo (beats → seconds). A « Tempo n » line in the text overrides it. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesized audio volume. |

### Other generators

| Component | Summary |
|---|---|
| [Infinity Series (Nørgård)](#infinity-series-nørgård) | Generates Per Nørgård's self-similar sequence, and its slower voices which form an exact canon. |
| [L-system](#l-system) | Generates a melody from a self-rewriting grammar (Lindenmayer). |

#### Infinity Series (Nørgård)

`serie-infinie` · Inputs → Other generators

*Generates Per Nørgård's self-similar sequence, and its slower voices which form an exact canon.*

Generates Per Nørgård's infinity series, discovered in 1959 and the entire material of his Second Symphony (1970). Its definition fits in three lines: s(0) = 0, s(2n) = −s(n), s(2n+1) = s(n) + 1. The first terms are 0, 1, −1, 2, 1, 0, −2, 3, −1, 2, 0, 1, 2, −1, −3, 4… and the sequence never repeats. It is nevertheless self-similar, and exactly rather than approximately: every second note gives back the inverted series, every fourth note gives back the series itself, identically. One can therefore layer the melody over its own four-times-slower version and obtain a perfectly coherent counterpoint — which is exactly what Nørgård does, and why his symphony can be a single melody from beginning to end without ever sounding repetitive. The « Voices » setting does precisely that, and is therefore not a layering effect: the slow voice IS the same melody. Two readings are offered, which change the whole character without touching the structure: in semitones the sequence unfolds chromatically and leaves any key behind, which is Nørgård's reading; in degrees each integer counts a scale step and the result stays tonal. The sequence is unbounded but rises slowly — a thousand terms fit within some twenty degrees — and pitches that would leave the keyboard are folded by octaves. It is catalogued as A004718 in the encyclopedia of integer sequences, which allows its first terms to be checked elsewhere than here.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Sequence | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | number | 64 | 4 – 1000, step 1 | Number of terms generated. |
| Voices | number | 1 | 1 – 3, step 1 | Superimposes the sequence taken every term, every two and every four. This is not an effect: at stride 4 the sequence comes back identical to itself, so the slow voice is the same melody and the counterpoint holds by itself. It is the procedure of the Second Symphony. |
| Tonic | choice | C | C / C# / D / Eb / E / F / F# / G / G# / A / Bb / B | The note the sequence starts from, its first term always being zero. |
| Octave | number | 4 | 2 – 6, step 1 | Octave of the tonic. |
| Reading | choice | Semitones | Semitones / Scale degrees | In semitones the sequence unfolds chromatically and leaves any key behind: that is Nørgård's reading. In degrees each integer counts a scale step and the result stays tonal — same structure, quite another character. |
| Scale | choice | Major | Major / Minor / Pentatonic / Chromatic | The scale used when reading by degrees. |
| Note length | number | 0.25 s | 0.05 – 2 s, step 0.05 | Length of each note of the fast voice. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### L-system

`l-systeme` · Inputs → Other generators

*Generates a melody from a self-rewriting grammar (Lindenmayer).*

Generates a melody from a self-rewriting grammar. Aristid Lindenmayer, a biologist, proposed this system in 1968 to describe plant growth: a starting word, and rules replacing each letter with a group of letters, applied to every letter at once. Repeated, the rewriting produces self-similar structures — hence the ferns and trees drawn from it, and here phrases whose motifs repeat at several scales without ever repeating identically. The reading is a turtle's: each symbol is a gesture. A letter plays a note and moves on; + and − move up and down one scale degree, never a semitone, so the result never leaves the key; brackets open and close an ornament, which returns exactly where it started and plays more softly than the line; > and &lt; double and halve the step; a dot is a rest. Five classic grammars are provided — Lindenmayer's algae, whose lengths follow the Fibonacci sequence, the Koch snowflake, the dragon curve, a plant and Cantor dust. Pick « Hand-written » to use your own. The word grows fast: a rule that doubles its length reaches a thousand in ten passes, and the rewriting stops by itself before exploding. The text output gives the resulting word, so you can see what you hear. Nothing is random here: the same grammar always gives the same music.

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

### Reservoirs and randomness

| Component | Summary |
|---|---|
| [Groove Box](#groove-box) | Generates a groove loop: deterministic chord progression + reservoir melody + drums. |
| [Multi-reservoir](#multi-reservoir) | Multiple neural reservoirs in network (melody, bass, harmony, rhythm) — polyphonic emergence. |
| [Music Generator](#music-generator) | Generates a multi-track composition from a descriptive script. Audio output + three MIDI outputs (one per instrument). |
| [Neural Reservoir](#neural-reservoir) | Generates emergent melody via random neural networks (inspired by Allendia/EVY). Audio output + MIDI output. |
| [Random Melody](#random-melody) | Generates a random melody. |

#### Groove Box

`boite-groove` · Inputs → Reservoirs and randomness

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

#### Multi-reservoir

`multi-reservoirs` · Inputs → Reservoirs and randomness

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

`generateur-musical` · Inputs → Reservoirs and randomness

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

#### Neural Reservoir

`reservoir-musical` · Inputs → Reservoirs and randomness

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

#### Random Melody

`melodie-aleatoire` · Inputs → Reservoirs and randomness

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

### Rhythms

| Component | Summary |
|---|---|
| [Advanced Drum Sequencer](#advanced-drum-sequencer) | Programs an 8-track drum pattern with per-step velocity, and outputs the rhythm as MIDI so the sounds underneath can be changed. |
| [Cantor Rhythm](#cantor-rhythm) | Generates a self-similar rhythmic groove by recursively removing beats from a grid, and also outputs it as MIDI. |
| [Drum Machine](#drum-machine) | Generates a drum pattern, and outputs the same rhythm as MIDI so the sounds underneath can be changed. |
| [Euclidean Rhythm](#euclidean-rhythm) | Spreads N onsets as evenly as possible over M steps (Bjorklund's algorithm). |
| [Metronome](#metronome) | Generates a steady metronome click at a given tempo. |
| [Resultant (Schillinger)](#resultant-schillinger) | The rhythm that arises from superposing two regular pulses. |
| [Tiling Canon](#tiling-canon) | Builds a rhythmic canon where each pulse is struck by one voice and one only. |

#### Advanced Drum Sequencer

`sequenceur-batterie-avance` · Inputs → Rhythms

*Programs an 8-track drum pattern with per-step velocity, and outputs the rhythm as MIDI so the sounds underneath can be changed.*

Programs an advanced drum pattern on 8 tracks (kick, snare, closed hi-hat, open hi-hat, clap, crash, low tom, high tom). Click a cell to turn it on or off, as in the other sequencers; nuance is on the modifiers — Shift+click raises velocity one step (0 to 9), Alt+click lowers it. A cell turned back on recovers the velocity it had before being cleared, or 6 if it never had one. Higher velocity makes the cell brighter and the sound louder. Sounds are synthesized (drum-machine style), no SoundFont. Set tempo, number of steps (16 or 32), swing and bars; the audio output loops the pattern. A second output gives the same rhythm as MIDI, on percussion channel 10 and at the General MIDI numbers (36 kick, 38 snare, 42 closed hi-hat…): connect it to the SFZ keyboard, to a SoundFont player or to a Csound orchestra to play exactly the same rhythm with other sounds. The grid's nuances become velocities there and swing is applied: the groove survives the change of sounds.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Steps | choice | 16 | 8 / 16 / 32 | Steps per bar. |
| Swing | number | 0 % | 0 – 60 % | Delays off-beats for a shuffle groove. |
| Bars | number | 2 | 1 – 8, step 1 | Number of pattern repetitions. |
| Volume | number | 90 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |
| Pattern | text | `9000000090000000\|0000900000009000\|9090909090909090\|000000…` |  | Encoded pattern (edited via the grid): 8 step rows separated by « \| », each step 0 (off) or 1–9 (velocity). |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the noise bursts (snare, hi-hat). The default is fixed: the same pattern must render the same file on every run. |

#### Cantor Rhythm

`rythme-cantor` · Inputs → Rhythms

*Generates a self-similar rhythmic groove by recursively removing beats from a grid, and also outputs it as MIDI.*

Generates a self-similar rhythmic groove by Cantor recursion on a 64-step grid per bar. At each depth level, the central (or left/right/random) part of each remaining interval is removed. Surviving steps trigger drums: in 'All' mode, kick = levels 0, 3, 6…, snare = levels 1, 4…, hi-hat = levels 2, 5…, creating a fractal rhythmic texture. A second output gives the same rhythm as MIDI, on percussion channel 10 and at the General MIDI numbers (36 kick, 38 snare, 42 closed hi-hat…): connect it to the SFZ keyboard, to a SoundFont player or to a Csound orchestra to play exactly the same rhythm with other sounds. Swing and volume are kept there, the volume becoming the velocity of the hits.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

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

#### Drum Machine

`boite-rythmes` · Inputs → Rhythms

*Generates a drum pattern, and outputs the same rhythm as MIDI so the sounds underneath can be changed.*

Generates a drum track from a pattern (Rock, Funk, House…), with per-drum volume control. A second output gives the same rhythm as MIDI, on percussion channel 10 and at the General MIDI numbers (36 kick, 38 snare, 42 closed hi-hat…): connect it to the SFZ keyboard, to a SoundFont player or to a Csound orchestra to play exactly the same rhythm with other sounds. Each drum's volume becomes a velocity there, since a MIDI file has no volume.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 120 BPM | 40 – 240 BPM | Speed in beats per minute (BPM). |
| Pattern | choice | Rock | Rock / Four-on-the-floor / Funk / Hip-hop / Jazz / Reggae / Samba / House / Techno / Drum & Bass / Trap / Disco / Ska / Bossa Nova / Tango / Calypso / Military march / Pop ballad / Pop dance / Pop latin / Pop folk / Pop R&B / Pop punk / Waltz / Bolero / Afrobeat / Rumba / Flamenco / Merengue / Breakbeat / Electro / Detroit techno / Minimal / Dubstep / Moombahton / Dembow / Reggaeton / Cumbia / Bachata / Blues shuffle / Gospel / Metal / Punk / Grunge / Trance / Hardstyle / Lo-fi hip hop / Boom bap / Drill / Trip hop / Amapiano / Salsa / Highlife / Baile funk / Tech house | Preset rhythmic pattern. |
| Bars | number | 2 | 1 – 8, step 1 | Number of bars to generate. |
| Kick | number | 80 % | 0 – 100 % | Kick drum volume, from 0 to 100%. |
| Snare | number | 70 % | 0 – 100 % | Snare volume, from 0 to 100%. |
| Hi-hat | number | 60 % | 0 – 100 % | Hi-hat volume, from 0 to 100%. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the noise bursts (snare, hi-hat). The default is fixed: the same pattern must render the same file on every run. |

#### Euclidean Rhythm

`rythme-euclidien` · Inputs → Rhythms

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

#### Metronome

`metronome` · Inputs → Rhythms

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

#### Resultant (Schillinger)

`resultante-schillinger` · Inputs → Rhythms

*The rhythm that arises from superposing two regular pulses.*

After Joseph Schillinger, « The Schillinger System of Musical Composition », Carl Fischer, 1946, book I: « Theory of Rhythm ». Attic already generates rhythm in six ways: Euclidean, Cantor, cellular automaton, L-system, Xenakis sieves, Roads pulsars. The resultant is none of them, and the contrast with the Euclidean is sharp. The latter spreads onsets as evenly as possible over a cycle; the former superposes two periods and lets the pattern fall where it falls. One seeks regularity, the other produces it by accident — and from that governed chance come the figures Schillinger pursued. Two pulses of 3 and 2 give 2-1-1-2, the system's most recognisable figure. It is palindromic, and that is no accident: the resultant of two coprime numbers always is, by symmetry of the cycle about its midpoint. What to know before setting it. The cycle lasts the product of the two periods, but if they share a factor they fall together before the end and the pattern repeats inside itself: the resultant of 4 and 2 is no richer than that of 2 and 1, it is the same, played twice as slowly. The node says so rather than letting one believe in a setting with no effect. What this node does not do: fractioning, by which Schillinger enriches his resultants and obtains self-similar structures. The sources consulted name the technique without giving its rule, and an operation bearing his name that could not be checked against a published figure would have been an invention under a borrowed authority.

| Port | Name | Type | |
|---|---|---|---|
| output | Analysis | text |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pulse A | slider | 3 | 1 – 16, step 1 | Period of the first pulse, in beats. With 3 and 2 one gets the system's basic figure. |
| Pulse B | slider | 2 | 1 – 16, step 1 | Period of the second. Take it coprime with the first: otherwise the pattern repeats inside the cycle, and the node will say so. |
| Tempo | slider | 120 bpm | 30 – 300 bpm, step 1 | Beat speed, for the rendered MIDI. |
| Note | slider | 38 | 21 – 108, step 1 | MIDI note of the onsets. 38 is the General MIDI snare. |

#### Tiling Canon

`canon-pavage` · Inputs → Rhythms

*Builds a rhythmic canon where each pulse is struck by one voice and one only.*

Builds a rhythmic tiling canon. An ordinary canon layers a melody over itself, offset. A tiling canon adds a constraint of arithmetical severity: at each pulse of the cycle, one voice and one only must strike — never two together, never none. The motif and the voice entries therefore interlock exactly, like tiles covering a floor with no gap and no overlap. The question goes back to the 1950s in mathematics (Hajós, de Bruijn); Dan Tudor Vuza restated it musically in 1991, and Moreno Andreatta and Emmanuel Amiot implemented it at IRCAM in OpenMusic. The entries are found by exact cover: take the smallest still-free pulse — someone has to strike it — try every way of placing a voice there, and repeat; no branch is missed. The most sought-after case is the one where neither the motif nor the entries are periodic: a Vuza canon. Those exist only from a cycle of 72 pulses upwards, every shorter tiling having a hidden regularity — the node checks this and says so in its report. Giving each voice a different pitch is not an ornament: on a single pitch one would hear only a steady pulse, which is exactly what every tiling canon is, without hearing that it is shared.

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

### Sensory resonance

| Component | Summary |
|---|---|
| [Camelot Wheel](#camelot-wheel) | Musical journey on the Camelot wheel to illustrate harmonic transitions. |
| [Color Looper](#color-looper) | Step sequencer where each step is a color. |
| [Food-Music Pairing](#food-music-pairing) | From a tasting profile — sweet, sour, bitter, salty — to an accompanying music, and the written plan of what it does. |
| [Odour → Motif](#odour--motif) | Builds a motif from an odour — register, consonance and timbre taken from the published odour-sound correspondences. |
| [Pulsing Circle](#pulsing-circle) | An animation and a melody drawn from the same series of pulses: colour gives the key, pulsation the rhythm. |
| [RGB Color](#rgb-color) | Synthesizes an RGB color into three oscillators (R, G, B). |
| [Visible Spectrum](#visible-spectrum) | Transposes the frequency of a visible color (wavelength) into the audible range. |

#### Camelot Wheel

`camelot` · Inputs → Sensory resonance

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

#### Color Looper

`color-looper` · Inputs → Sensory resonance

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

#### Food-Music Pairing

`accord-mets-musique` · Inputs → Sensory resonance

*From a tasting profile — sweet, sour, bitter, salty — to an accompanying music, and the written plan of what it does.*

This node takes the four intensities of a tasting and returns an accompanying music, as audio and as MIDI, with the written plan of what it does. How the point is computed. Each of the four tastes has a region in a five-dimensional space — register, articulation, speed, consonance, loudness. The aimed point is the barycentre of the four regions, weighted by the given intensities. A profile with only one taste lands exactly on its region; a profile that mixes them lands between them, and the music is the more neutral the more balanced the profile. The literature gives four regions and not a continuous map of tastings: the plan flags the case where no taste reaches 40% of the profile. Only the proportions count. Four values of 20 give the same point as four values of 80; what decides is the ratio between the tastes, not their sum. Loudness is set separately. The instrument follows the dominant taste where the literature gives one: piano for sweet, trombone for bitter and sour. It gives none for salty, and the plan says so. How the music is built. The voices sound simultaneously, a fifth apart for a consonant point, in a five-note cluster for a harsh one — roughness arises from neighbouring partials beating together, not from harsh intervals played one after another. The lower voice carries the energy, the others sound at 60%. Attacks are regular, one per step, and the synthesis timbre is soft, its energy median having to stay close to its fundamental for the register to be reached. What the node reaches. The register lands within 0.03 of the aimed point, the speed within 0.05, the loudness exactly, except on a motif whose peak forbids reaching the requested level without clipping. Articulation stays above its aimed value in the staccato range, the synthesizer's resonance filling part of the silences: around 0.28 for 0.10 requested. Consonance is the weakest of the five dimensions: it comes down from 0.99 to about 0.70 and no lower, where the sour region would ask for 0.15. The report gives all five gaps, dimension by dimension. This node does not change the taste of any food. The studies establish that music shifts tasting judgements — cinder toffee rated sweeter and less bitter under a high-pitched soundscape, chocolate rated sweeter under positive music — with medium effect sizes, 0.54 to 0.66 in Cohen's d. Part of these correspondences runs through language and varies with the listener's culture and musical training. Sources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review, and its caveats — the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes. A.-S. Crisinel et al., “A Bittersweet Symphony”, Food Quality and Preference 24, 2012, and Q. J. Wang, B. Mesz and C. Spence on wine by temporal dominance of sensations: music shifts tasting judgements, with medium effect sizes, 0.54 to 0.66 in Cohen's d.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Plan | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Sweet | slider | 70 % | 0 – 100 %, step 1 | Sweetness in the tasting. Only the proportions between the four tastes count. |
| Sour | slider | 30 % | 0 – 100 %, step 1 | Sourness. |
| Bitter | slider | 10 % | 0 – 100 %, step 1 | Bitterness. |
| Salty | slider | 0 % | 0 – 100 %, step 1 | Saltiness. It is the only one of the four tastes for which the literature gives no instrument. |
| Duration | number | 20 s | 2 – 120 s, step 1 | Music duration. |
| Loudness | slider | 40 % | 0 – 100 %, step 1 | Target root-mean-square level, from -40 dB to 0 dB. |
| Seed | number | 42 | 1 – 999999, step 1 | For the choice of degrees: same seed, same music. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset, or Follow MIDI to keep the instrument that the dominant taste wrote into the file. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesis volume, before the target level is applied. |

#### Odour → Motif

`parfum-motif` · Inputs → Sensory resonance

*Builds a motif from an odour — register, consonance and timbre taken from the published odour-sound correspondences.*

This node takes an odour from a list and returns a motif of several voices, as audio and as MIDI, with a report of what was done. What the odour decides. Its register: fruity odours and citrus go high; musk, roasted coffee, smoke and dark chocolate go low. Its pleasantness carries the consonance, an odour's pleasantness and complexity — not its intensity — being what drives the matching in the study this node relies on. Its complexity carries the number of events per second. Its timbre follows three families of words, [bright, fresh, ethereal], [sharp, metallic] and [full, rich, warm], answered by a flute, an oboe and a cello. What the odour does not decide: articulation, on which the odour literature is silent, and loudness, of which it establishes that it does not count in the matching. Both are set separately and default to 50%. How the motif is built. The voices sound simultaneously, a fifth apart for a consonant point, in a five-note cluster for a harsh one — roughness arises from neighbouring partials beating together, not from harsh intervals played one after another. The lower voice carries the energy, the others sound at 60%. Attacks are regular, one per step, and the synthesis timbre is soft, its energy median having to stay close to its fundamental for the register to be reached. What the node reaches. The register lands within 0.03 of the aimed point, the speed within 0.05, the loudness exactly, except on a motif whose peak forbids reaching the requested level without clipping. Articulation stays above its aimed value in the staccato range, the synthesizer's resonance filling part of the silences: around 0.28 for 0.10 requested. Consonance is the weakest of the five dimensions: it comes down from 0.99 to about 0.70 and no lower, where the sour region would ask for 0.15. The report gives all five gaps, dimension by dimension. Two caveats from the study. Instrument matching was reliable for only about a quarter of the odours tested: the proposed timbre is a default, not a result. And the authors published no numerical values per odour: the report says, for the chosen odour, whether the article names it or whether it is placed by its family. Sources. A.-S. Crisinel and C. Spence, “A Fruity Note: Crossmodal Associations Between Odors and Musical Notes”, Chemical Senses 37, 2012, pp. 151-158: register, pleasantness and complexity, and the limited reliability of the instrument. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994). For the five-dimensional space the motif is placed in: B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801), and B. Mesz, M. Sigman and M. A. Trevisan, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071).

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | MIDI | MIDI |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Odour | choice | lemon | lemon / mint / candied orange / iris / strawberry / rose / vanilla / dark chocolate / roasted coffee / musk / smoke | The odour, taken from the list of the table's eleven odours, ordered from the highest register to the lowest. |
| Duration | number | 12 s | 2 – 60 s, step 1 | Motif duration. |
| Articulation | slider | 50 % | 0 – 100 %, step 1 | From staccato, with silences between the notes, to legato, where the sound never stops. The odour literature does not decide this axis: it stays in the middle by default. |
| Loudness | slider | 50 % | 0 – 100 %, step 1 | Target root-mean-square level, from -40 dB to 0 dB. The study establishes that an odour's intensity does not drive its matching to a sound: this dimension is therefore left to be set. |
| Seed | number | 42 | 1 – 999999, step 1 | For the choice of degrees: same seed, same motif. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples. |
| Instrument | SoundFont preset | follow MIDI |  | SoundFont preset, or Follow MIDI to keep the instrument that the odour's timbre family wrote into the file. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Synthesis volume, before the target level is applied. |

#### Pulsing Circle

`cercle-pulsant` · Inputs → Sensory resonance

*An animation and a melody drawn from the same series of pulses: colour gives the key, pulsation the rhythm.*

A circle that breathes, changes size and colour, and a melody that comes out of it. But not in the sense of sonifying a picture: the two are the same list, looked at twice. The principle, and what sets it apart from decorative sonification. The node computes a single series of pulses — an instant, a size, a colour — then the drawing animates exactly those instants and the melody writes exactly those notes. They cannot drift apart, because there is nothing to synchronise. Hue gives the key through the Camelot wheel, and this is no arbitrary mapping. That wheel lays the twelve keys in a circle — ring A for the minors, B for the majors — following the disc jockeys' mixing rule: a neighbouring position, the same number in the other ring, or seven positions away. Hue is a circle, the wheel is another: matching them means two neighbouring hues give two compatible keys. A continuous gradient therefore produces a sequence of modulations that work. The obvious mapping — hue divided into twelve semitones — would do the opposite: two neighbouring colours would give two unrelated keys, and a gradient would sound like a string of accidents. The rest follows. Saturation chooses the ring: dull for minor, vivid for major, which the eye already reads as sombre or brilliant. Lightness gives the register. The radius at the moment of the stroke gives the scale degree — a large circle is a low note, the sense the eye spontaneously gives a wide shape — and its amplitude gives the dynamic. Silence has a picture. Below the threshold the pulse is seen and not heard: the circle contracts, the music falls silent, and both fall silent together because it is the same decision. The animation is watched in the node, and does not leave by a port: it is written as an SVG animated by SMIL, a clock rather than pixels, and no image processing would make anything of it. What the node outputs is what can be connected: the notes, the sound, and the journey through the keys.

| Port | Name | Type | |
|---|---|---|---|
| output | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | Journey | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | slider | 20 s | 2 – 120 s, step 1 | Length of the animation, and of the piece. It is the same: one cannot end before the other. |
| Initial rate | slider | 1.6 /s | 0.2 – 12 /s, step 0.1 | Beats per second at the start. Below one per second one hears isolated events; beyond five, a texture. |
| Final rate | slider | 3.2 /s | 0.2 – 12 /s, step 0.1 | Beats per second at the end. Different from the initial one, the rate slides continuously from one to the other: not a tempo change but an acceleration, cut into no steps. |
| Hue | slider | 210 ° | 0 – 359 °, step 1 | Starting colour. Zero is red, 120 green, 240 blue. Every thirty degrees moves one position on the Camelot wheel, hence one key. |
| Hue journey | slider | 150 ° | -720 – 720 °, step 15 | How far the colour turns over the whole duration. At zero the piece stays in one key. At 360 it goes round all twelve — and since neighbouring positions are compatible, each passage is a modulation that holds. |
| Saturation | slider | 70 % | 0 – 100 %, step 1 | Vividness of the colour, and mode of the piece: below 50 %, the minor ring; above, the major. The threshold sits in the middle, and there is no reason to put it elsewhere. |
| Lightness | slider | 55 % | 0 – 100 %, step 1 | Lightness of the colour, and register of the melody: a dark colour drops an octave, a light one rises an octave. |
| Breathing | slider | 80 % | 0 – 100 %, step 1 | Amplitude of the size variation. At zero the circle keeps its diameter and the melody its degree: only the key is heard changing. At maximum the circle goes from a dot to a full disc, and the melody covers the whole scale. |
| Silence threshold | slider | 45 % | 0 – 90 %, step 1 | Size below which the pulse does not sound. This is what lets the piece breathe rather than placing a note on every beat from start to finish. A figure worth knowing: the radius never falls below one hundred minus the breathing, so a threshold lower than that never cuts anything. At 65 % breathing, a threshold under 35 % has no effect — measured, all forty-eight pulses sounded. |
| Echoes | choice | Yes | Yes / No | Let a ring open and fade at each audible stroke. It is the note's decay made visible, and what gives the picture its depth. |
| Size | slider | 600 px | 200 – 1200 px, step 20 | Side of the square image. |
| Seed | slider | 7 | 0 – 999999, step 1 | Seed for the irregularity of the sizes. The same seed replays the same piece, picture included. |

#### RGB Color

`couleur-rgb` · Inputs → Sensory resonance

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

#### Visible Spectrum

`spectre-visible` · Inputs → Sensory resonance

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

### Sequencers

| Component | Summary |
|---|---|
| [Chord Sequencer](#chord-sequencer) | Programs a chord progression on a step grid. |
| [Melodic Sequencer](#melodic-sequencer) | Programs a melody on a step-by-step piano-roll grid (synthesized). |

#### Chord Sequencer

`sequenceur-accords` · Inputs → Sequencers

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

#### Melodic Sequencer

`sequenceur-melodique` · Inputs → Sequencers

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

### Synthesizers

| Component | Summary |
|---|---|
| [FM / AM Synth](#fm--am-synth) | Generates a note with frequency modulation (FM) or amplitude modulation (AM). |
| [Membrane Synth](#membrane-synth) | Generates a synthetic kick drum with Tone.js. |
| [Metal Synth](#metal-synth) | Generates a metallic sound (hi-hat, bell, cymbal) with Tone.js. |
| [Pluck Synth](#pluck-synth) | Generates a plucked string note using Karplus-Strong synthesis. |
| [Poly Synth](#poly-synth) | Generates a polyphonic chord with an ADSR envelope. |

#### FM / AM Synth

`fm-synth` · Inputs → Synthesizers

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

#### Membrane Synth

`membrane-synth` · Inputs → Synthesizers

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

`metal-synth` · Inputs → Synthesizers

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

#### Pluck Synth

`pluck-synth` · Inputs → Synthesizers

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

`poly-synth` · Inputs → Synthesizers

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

### Xenakis

| Component | Summary |
|---|---|
| [GENDYN (Xenakis)](#gendyn-xenakis) | Stochastic synthesis: the waveform itself is a bounded random walk. |
| [Screens (Xenakis)](#screens-xenakis) | A grid of frequencies and intensities where each cell draws its own grains, and screens that follow one another through a Markov chain. |
| [Sieve (Xenakis)](#sieve-xenakis) | Builds a scale and a rhythm from modular arithmetic. |

#### GENDYN (Xenakis)

`gendyn-xenakis` · Inputs → Xenakis

*Stochastic synthesis: the waveform itself is a bounded random walk.*

After Iannis Xenakis's dynamic stochastic synthesis (Gendy3, 1991). Xenakis attacks the problem from the other end: rather than starting from an acoustic model — partials, a filter, an envelope — he works directly on the waveform, seen as a polygon joining a few points, and lets those points move. At each period, every vertex takes a random step in both time and amplitude. There is therefore no pitch, timbre or envelope here in the usual sense: those are no longer parameters but consequences. Pitch emerges from the sum of the segment durations, timbre from the shape of the polygon, and both drift by themselves since the points never stop moving. You do not set the sound, you set the law that makes it evolve. Everything rests on reflecting barriers: without them a random walk always escapes — amplitudes clip, durations turn absurd, the sound dies. Reflected, values stay bounded forever while still wandering. Set both step sizes to zero and the polygon freezes into a periodic waveform, a useful starting point for hearing what the walk contributes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | number | 10 s | 0.5 – 120 s, step 0.5 | Length of the produced sound. |
| Points | number | 8 | 2 – 40, step 1 | Number of vertices in the polygon. Few points = simple sound, close to a basic waveform; many = rich, unstable timbre. |
| Min segment | number | 0.5 ms | 0.05 – 20 ms, step 0.05 | Minimum segment duration: the high bound of the drift. The shorter it is, the higher the sound can go. |
| Max segment | number | 4 ms | 0.1 – 50 ms, step 0.1 | Maximum segment duration: the low bound. The gap between the two bounds sets how far the pitch can wander. |
| Time step | slider | 10 % | 0 – 100 %, step 1 | Liveliness of the walk on durations, hence on pitch. At 0% the pitch stops moving. |
| Amplitude step | slider | 10 % | 0 – 100 %, step 1 | Liveliness of the walk on amplitudes, hence on timbre. Both steps at 0% freeze the waveform entirely. |
| Seed | number | 1 | 1 – 9999, step 1 | Random seed. Same seed, same sound — essential to recover a result you liked. |

#### Screens (Xenakis)

`ecrans-xenakis` · Inputs → Xenakis

*A grid of frequencies and intensities where each cell draws its own grains, and screens that follow one another through a Markov chain.*

After Iannis Xenakis, « Formalized Music » (1963), and the pieces « Analogique A and B » (1959) — the first composed granulation in history, ten years before the first computer granulations. What is singular about the idea, and what sets it apart from the rest of the granular catalog: other processes describe a grain — its shape, its duration, its pitch — then repeat it. Here no grain is described at all. A space is described, gridded into cells of frequency and intensity, and each cell is told how many grains per second it should hold; the grains themselves are drawn at random inside their cell. You no longer compose sounds but a probability density, which was exactly Xenakis's point: moving from the point to the statistic. A screen is one state of that grid, held for a brief moment. A book of screens is their succession, and it is the succession that makes the piece. Xenakis chained classes of screens through a transition matrix; here each cell follows its own two-state chain — lit or unlit — with a probability of staying lit and a probability of lighting up. It is an adaptation, and it behaves the same way: the two regimes Xenakis was after appear at the extremes. Strong hold and weak appearance give stable pads; weak hold and strong appearance, a boiling. Measured: at 98 % hold, fewer than 6 % of cells change from one screen to the next; at 30 %, more than 30 % change. The bands are logarithmic, and that is no display convenience: the ear hears ratios. A linear grid would put half its cells between 10 and 11 kilohertz, where almost no difference is heard, and a single cell for the three octaves of the low end. A grain's frequency is drawn logarithmically inside its band, for the same reason. Density is not a count of grains but an average. A quarter of a grain per screen cannot be rendered: rounding would always give zero or always one, and density would stop being adjustable below one grain per screen — which would remove half the process. The fractional part therefore decides on one extra grain, at random, and it is the average that lands right. The first screen is drawn at the chain's equilibrium probability, not on a coin toss. Otherwise every piece would start on a half-full screen whatever the settings: a sparse texture would take seconds to empty out, and a transient nobody asked for would be heard. The second output returns the book in plain text — one column per screen, one line per cell, frequencies in the margin. Stochastic music whose weave cannot be seen cannot be learned; connect it to a « Text Output » and compare what you read with what you hear.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |
| output | Book | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | slider | 8 s | 0.5 – 60 s, step 0.5 | The piece's duration. The number of screens follows from it: the duration divided by one screen's. |
| Screen duration | slider | 100 ms | 10 – 1000 ms, step 5 | How long one state of the grid is held. Short, the screens follow too fast to be told apart and a texture is heard; long, the succession of states is heard, that is, a form. |
| Bands | slider | 8 | 1 – 24, step 1 | The number of frequency bands in the grid, spread logarithmically between the two bounds. Few bands give a thick, coarse cloud; many, a fine sieve. |
| Levels | slider | 3 | 1 – 6, step 1 | The number of intensity degrees. It is the grid's second axis in Xenakis: a cell is not only a pitch, it is a pitch at a given strength. |
| Level step | slider | 6 dB | 0 – 24 dB, step 1 | By how much each intensity degree falls below the previous one. At zero, every level sounds the same and the intensity axis vanishes; at twelve, the weak degrees only colour the background. |
| Lowest frequency | slider | 100 Hz | 20 – 2000 Hz, step 10 | The bottom of the grid. |
| Highest frequency | slider | 6400 Hz | 200 – 16000 Hz, step 100 | The top of the grid. Between the two bounds, the bands are spread by intervals that are equal to the ear, not in hertz. |
| Density | slider | 20 grains/s | 0.5 – 200 grains/s, step 0.5 | How many grains per second each lit cell holds. It is Xenakis's third axis, and its value is not a count but an average: a density below one grain per screen is rendered by an occasional grain, drawn at random, and it is the average that lands right. |
| Grain duration | slider | 30 ms | 5 – 200 ms, step 1 | A grain's duration, window included. Below some fifty milliseconds a grain has no pitch of its own and the cloud is heard as matter; beyond, the cells' pitches start to be told apart. |
| Hold | slider | 85 % | 0 – 100 %, step 1 | The probability that a lit cell stays lit on the next screen. It is half of the Markov chain, and the setting that decides between the pad and the boiling. |
| Appearance | slider | 10 % | 0 – 100 %, step 1 | The probability that an unlit cell lights up on the next screen. Together with hold, it sets the grid's equilibrium occupancy: appearance divided by the sum of appearance and extinction. |
| Volume | slider | 70 % | 0 – 100 %, step 1 | The overall level. Grains add up: doubling the density or the number of lit cells moves that much closer to the ceiling. |
| Seed | slider | 42 | 1 – 999999, step 1 | The draw, from end to end: the book of screens as well as each grain's place inside its cell. The same seed replays exactly the same piece, which is indispensable to music drawn at random — without it nothing you liked can be found again. |

#### Sieve (Xenakis)

`crible-xenakis` · Inputs → Xenakis

*Builds a scale and a rhythm from modular arithmetic.*

After Iannis Xenakis's sieve theory ("Sieves", 1990; the technique appears as early as "Nomos alpha", 1966). Xenakis was looking for a way to build scales and rhythms that are neither regular nor random — both bore the ear, one through predictability, the other through shapelessness. His answer lies in modular arithmetic: a sieve keeps the integers n such that n ≡ i (mod m), written m@i. Taken alone a sieve is just a grid: 3@0 gives 0, 3, 6, 9… Combined, two sieves produce a sequence whose intervals only repeat after the LCM of the moduli — long enough that periodicity is no longer heard, structured enough that it is not heard as chance. That in-between is exactly what Xenakis aimed at, and why he chose coprime moduli: 5, 7 and 11 give a period of 385, beyond the ear's reach. The node reads the same structure along two axes — the kept degrees become pitches, or onsets, or both — which Xenakis claimed explicitly: pitch and rhythm are for him the same thing seen from two sides.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Sieve | text | `5@0 7@2 11@3` |  | Residual classes as "modulus@residue", separated by spaces. Coprime moduli give the longest period: 5@0 7@2 11@3 only repeats after 385 degrees. Malformed fragments are ignored rather than emptying the sieve. |
| Operation | choice | Union | Union / Intersection / Difference | "Union" keeps what at least one class holds — the operation that creates irregularity. "Intersection" keeps only what all of them hold, hence very little. "Difference" keeps what the first class holds and no other does: the only way to punch holes in a regular grid. |
| Reading | choice | Pitches and rhythm | Pitches / Rhythm / Pitches and rhythm | Which axis to read the sieve along. "Pitches" plays the kept degrees as evenly spaced notes; "Rhythm" plays a single note at the kept onsets; "Pitches and rhythm" does both — the duality Xenakis claimed. |
| Span | number | 96 | 8 – 512, step 1 | Number of degrees examined. To hear a long-period sieve you need at least its period — otherwise you only hear a fragment. |
| Base note | number | 48 | 24 – 96, step 1 | MIDI pitch of degree 0. Each kept degree is one semitone above. |
| Subdivision | number | 120 ms | 20 – 1000 ms, step 10 | Duration of one degree on the time axis. Short, the sieve is heard as a texture; long, as a melody. |
| Note length | slider | 60 % | 10 – 100 %, step 5 | Share of the subdivision actually sounding. Low, notes stand apart; high, they run together. |

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

### Denoising

| Component | Summary |
|---|---|
| [AI Denoise](#ai-denoise) | Denoises speech with the GTCRN model, with no noise profile to provide. |
| [Click Removal](#click-removal) | Click detection and removal. |
| [Declipper](#declipper) | Rebuilds the clipped peaks of a saturated sound, by looking for the simplest signal that accounts for what is left. |
| [Dereverb](#dereverb) | Reverb attenuation. |
| [Noise Profile](#noise-profile) | Captures the spectral profile of a noise. |
| [Noise Reduction](#noise-reduction) | Spectral noise subtraction. |

#### AI Denoise

`debruitage-ia` · Processing → Denoising

*Denoises speech with the GTCRN model, with no noise profile to provide.*

Denoises speech with GTCRN, a 344 kB learned model (Xiaobin-Rong/gtcrn, MIT licence). Unlike the « Noise Reduction » node it needs NO profile: nothing to capture on a silent passage, and it follows noise that changes. Two limits worth knowing, both from the model rather than its integration. It works at 16 kHz: the result is resampled back to the input rate so it stays connectable, but nothing above 8 kHz is restored. And it was trained on speech: on music it also removes what is not a voice. The Strength parameter blends with the original — below 100%, some hiss and reverb come back, which often sounds more natural than complete silence between words. The message reports the level removed, so you can see at once whether the model acted: on an already clean recording it barely does, which is the right behaviour.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Strength | number | 100 % | 0 – 100 %, step 1 | Blend between the denoised signal and the original. 100% = model output only. Going lower lets some hiss and reverb back in, which often sounds more natural on speech than total silence between words. |
| Output | choice | Original rate | Original rate / Model 16 kHz | The model works at 16 kHz. « Original rate » resamples the result back to the input rate so it stays connectable to the rest of the graph — without restoring anything above 8 kHz, which the model never saw. « Model 16 kHz » returns the signal as it comes out, with no second resampling. |

#### Click Removal

`suppression-clics` · Processing → Denoising

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

#### Declipper

`restauration-ecretage` · Processing → Denoising

*Rebuilds the clipped peaks of a saturated sound, by looking for the simplest signal that accounts for what is left.*

Rebuilds the clipped peaks of a saturated sound. After Srdan Kitic, Nancy Bertin and Remi Gribonval, « Sparsity and cosparsity for audio declipping: a flexible non-convex approach », LVA/ICA 2015 — the a-spade algorithm; the measurements follow the overview by Pavel Zaviska, Pavel Rajmic, Alexey Ozerov and Lucas Rencker, IEEE/ACM TASLP 2021. What was missing: Attic could remove clicks, reduce noise, dereverberate, but no node repaired a clipped sound — the Normalizer only changes gain, and turning a clipped sound down merely gives a quieter clipped sound. Yet clipping is the commonest fault of amateur recordings, and Attic can produce it itself: « Loop End C » goes past 1 as soon as three passes of the same sound are stacked. The idea: a clipped sample is not unknown. We know it was at least the threshold, and we know its unclipped neighbours are right. So this is an inverse problem under constraints — find a signal that leaves the reliable samples as they are, goes above the threshold where it clipped, and is sparse in time-frequency, that is, sounds like a sound. Without that third condition there would be infinitely many solutions, each uglier than the last. How: two gestures alternate — make the spectrum sparse by keeping only the strongest lines, then put the signal back inside its constraints. Neither suffices alone, the first spoiling the constraints and the second the sparsity. Sparsity starts tight and loosens by one line per pass: the simplest explanation is tried first. What it gives, and where it stops — measured as signal-to-distortion ratio computed on the clipped samples only, the overview's measure: 8 % of samples cut gives +7.5 dB, 14 % +13.5 dB, 24 % +16.8 dB, 41 % +15.3 dB, then 57 % gives only +2.7 dB. The gain peaks around a quarter of samples cut and collapses beyond half: what holds the signal is the reliable samples, and once they are in the minority there are no longer enough constraints to single out a solution. Iterating more does not make up for it. Two promises kept whatever happens, because the constraints are reimposed after the frames are joined: a sample that was not clipped comes out exactly as it was, and a clipped sample always comes out above the threshold. The repaired sound therefore exceeds the threshold that bounded it — that is the point — and may leave the [-1, 1] range: the peak is announced in the message, and a Normalizer downstream sets that right. What it gives, and where it stops — measured on two sounds of equal peak clipped at various thresholds, as signal-to-distortion ratio computed on the clipped samples only. On a five-harmonic sound: +25 dB at threshold 0.8, +14 dB at 0.6, +13 dB at 0.5, +3 to +5 dB below. On a hundred-harmonic sawtooth: +2 dB at 0.8, but -10 dB at 0.6 and -5 dB at 0.5, then +1 to +6 dB again lower down. The method is reliable on a sparse sound and erratic on a dense one. The reason is not energy density — a sawtooth concentrates its own in its first lines and passes for sparse on every energy measure tried. It is that reconstruction has a floor specific to each sound: rebuilding a sawtooth's corner from a few dozen lines takes exact phases, and the model cannot manage it. When the clipping damage is milder than that floor, repairing harms. This is consistent with the literature, which reports average gains over music corpora rather than a per-signal guarantee: compare with the original before keeping the result. Two safeguards that are not in the paper, and are stated as such: a ceiling on reconstructed samples, because the error of a model that explains nothing takes refuge in the free samples — without it the peak ran to three times the threshold; and the residual, announced in the message, which is the only thing the node can say about the quality of its own repair, having no original to compare against. High, the model did not account for the sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | choice | Automatic | Automatic / Manual | In automatic mode the threshold is guessed from plateau length: a clipped sound holds consecutive samples at the same value, where an intact sine only grazes its peak one sample at a time. With no plateau, the node says so and returns the sound unchanged. |
| Manual threshold | slider | 0.5 | 0.05 – 1, step 0.01 | Value above which a sample counts as clipped. Only used in manual mode. |
| Window | choice | 1024 | 512 / 1024 / 2048 | Frame length. Long, the model has more spectral lines to account for the sound and repairs better; short, it follows a fast-changing sound better. |
| Passes | slider | 60 | 10 – 200, step 5 | Maximum passes per frame. Sparsity loosens by one line per pass: the number of passes is therefore also the number of lines the model will eventually allow itself. Measured at 41 % clipped samples: 3.4 dB gained in ten passes, 11.2 in thirty, 15.3 in sixty. |
| Max overshoot | slider | 2 | 1.1 – 4, step 0.1 | How many times the threshold a reconstructed sample may reach. This is not in the paper, and is stated as such: when the model no longer explains the sound, its error takes refuge in the free samples — precisely those being reconstructed — and the peak ran up to three times the threshold. The ceiling bounds the damage without changing anything when the method works: on a five-harmonic sound the reconstructed peak stays under 1.5 times the threshold. |
| Tolerance | slider | 0.01 | 0.001 – 0.3, step 0.001 | Gap below which a frame is deemed explained, and computation stops. This setting matters more than it looks: measured on a sound clipped at 24 %, 0.01 gives 16.8 dB where 0.1 gives only 8.5 — stopping early was cutting convergence far too short. |

#### Dereverb

`dereverberation` · Processing → Denoising

*Reverb attenuation.*

Attenuates the reverberation of a recording via spectral processing, tightening an overly reverberant sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Reduction | number | 60 % |  | Reverb reduction strength. |

#### Noise Profile

`profil-bruit` · Processing → Denoising

*Captures the spectral profile of a noise.*

Analyses a noise-only passage and produces a spectral profile, to feed into « Noise Reduction ».

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Profile | control |  |

*No parameters.*

#### Noise Reduction

`reduction-bruit` · Processing → Denoising

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

### Distortion and modulation

| Component | Summary |
|---|---|
| [Beat Repeat / Stutter](#beat-repeat--stutter) | Captures and repeats a short segment at rhythmic intervals (stutter effect). |
| [Bitcrusher](#bitcrusher) | Bit quantization + downsampling (lo-fi). |
| [Chopper](#chopper) | Rhythmic gate that chops the sound periodically (stutter/DJ effect). |
| [Chorus](#chorus) | Modulated stereo doubling. |
| [Distortion](#distortion) | Saturation / overdrive. |
| [Exciter / Aural Enhancer](#exciter--aural-enhancer) | Adds presence via harmonic distortion in the high mids. |
| [Flanger](#flanger) | Variable delay modulation. |
| [Formant Shift](#formant-shift) | Formant shifting via LPC — change pitch and timbre independently (voice conversion). |
| [Phaser](#phaser) | All-pass filter cascade modulated by LFO (sweeping effect). |
| [Pitch Follower](#pitch-follower) | Follows a sound's pitch instant by instant, to drive an effect with it. |
| [Quadrafuzz](#quadrafuzz) | Four-band distortion: each register saturates independently. |
| [Ring Modulator](#ring-modulator) | Ring modulation (carrier multiplication). |
| [Tape Machine](#tape-machine) | The four faults of tape: wow, flutter, saturation, dropouts. |
| [Tremolo](#tremolo) | Amplitude modulation (periodic volume variations). |
| [Two-Sound Convolution](#two-sound-convolution) | Makes one sound ring through another: only their shared frequencies survive, and their durations add up. |
| [Vibrato](#vibrato) | Pitch modulation by LFO (note oscillation). |
| [Vocoder](#vocoder) | Filterbank vocoder: modulator + carrier → robot voice effect. |
| [Voice Changer](#voice-changer) | Transforms a voice with preset effects: chipmunk, monster, robot, phone, alien, helium, ghost. |
| [Wah-wah](#wah-wah) | Modulated bandpass filter (wah pedal effect). |

#### Beat Repeat / Stutter

`beat-repeat` · Processing → Distortion and modulation

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

`bitcrusher` · Processing → Distortion and modulation

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

#### Chopper

`chopper` · Processing → Distortion and modulation

*Rhythmic gate that chops the sound periodically (stutter/DJ effect).*

Rhythmic gate that chops the sound periodically — stutter/DJ effect. Adjust the rate (cuts per second, 0.5 to 20 Hz), ON segment length (1% = very short, 50% = square, 99% = near continuous) and type (Hard = abrupt, Soft = smooth). Ideal for pumping effects, rhythmic gating or extreme tremolo.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 4 Hz | 0.5 – 20 Hz, step 0.5 | Chop speed (cuts per second). |
| Length | slider | 50 % | 1 – 99 %, step 1 | ON ratio in cycle (1% = very short, 50% = square, 99% = near continuous). |
| Type | choice | Hard | Hard / Soft | Hard = abrupt cut, Soft = smooth transition. |
| Rate min | slider | 1 Hz | 0.5 – 20 Hz, step 0.5 | Rate that a curve's zero means on the Rate modulation input: the chop that accelerates into a stutter. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing. |
| Rate max | slider | 16 Hz | 0.5 – 20 Hz, step 0.5 | Rate that the curve's one means. |

#### Chorus

`chorus` · Processing → Distortion and modulation

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

#### Distortion

`distorsion` · Processing → Distortion and modulation

*Saturation / overdrive.*

Saturates the signal to add harmonics and grit, from light overdrive to full distortion.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Gain | number | 50 % |  | Amount of saturation drive. |

#### Exciter / Aural Enhancer

`exciter` · Processing → Distortion and modulation

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

#### Flanger

`flanger` · Processing → Distortion and modulation

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

`shift-formants` · Processing → Distortion and modulation

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

#### Phaser

`phaser` · Processing → Distortion and modulation

*All-pass filter cascade modulated by LFO (sweeping effect).*

All-pass filter cascade with a LFO-modulated cutoff frequency. Creates moving peaks and notches in the spectrum — the "sweeping" effect characteristic of analog synths and guitars (Van Halen, Pink Floyd). Adjust rate, depth, number of stages (2 to 8, more = stronger) and mix.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 0.5 Hz | 0.05 – 10 Hz, step 0.05 | Modulation speed (sweeps per second). |
| Depth | slider | 80 % | 0 – 100 %, step 1 | Frequency sweep range. |
| Stages | slider | 4 | 2 – 8, step 1 | Number of all-pass stages (more = stronger effect). |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Mix between dry and wet signal. |
| Rate min | slider | 0.1 Hz | 0.05 – 10 Hz, step 0.05 | Rate that a curve's zero means on the Rate modulation input: the swirl that tightens. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing. |
| Rate max | slider | 4 Hz | 0.05 – 10 Hz, step 0.05 | Rate that the curve's one means. |

#### Pitch Follower

`suiveur-hauteur` · Processing → Distortion and modulation

*Follows a sound's pitch instant by instant, to drive an effect with it.*

Follows a sound's pitch instant by instant and returns it as a modulation curve. After Alain de Cheveigné and Hideki Kawahara, « YIN, a fundamental frequency estimator for speech and music », Journal of the Acoustical Society of America 111(4), 2002; and Matthias Mauch and Simon Dixon, « pYIN: a fundamental frequency estimator using probabilistic threshold distributions », ICASSP 2014. This is the feature the Feature Follower was missing, and it is not just one more: Verfaille's paper on adaptive effects cites pitch first among the features that drive, and it is the one that yields the effects everyone quotes — a filter following the melody, a delay tuned to the note being played. Attic could detect chords and analyse a harmony; no node returned pitch instant by instant. How it works: YIN looks for how far the sound must be shifted to resemble itself most — that duration is the period, and its inverse the pitch. Its finding is the cumulative-mean normalisation: without it a sound resembles itself just as much shifted by two periods, and nothing tells a note from its octave. Why two decodings: YIN returns a single estimate per frame, and on a frame where the fundamental weakens that estimate is the octave — the curve jumps, and no smoothing repairs it since the right value was never produced. pYIN keeps several candidates weighted by a prior distribution over the threshold, then picks the most likely path over the whole sound: an ambiguous frame is settled by its neighbours. Measured on a held note broken by two weak passages: 17 faulty frames out of 119 with YIN, none with pYIN. The setting keeps both so that it can be heard rather than believed. The pitch continues through silences instead of dropping to zero — the path goes through the « unvoiced » state of the pitch it was on — so an effect driven by the melody crosses a silence without slamming shut; it is the confidence output that says where nothing was played, and it can be used to let an effect act on notes only. The curve's scale is logarithmic between « Lowest pitch » and « Highest pitch »: an octave is worth the same interval wherever it falls. The cost is one transform per frame: about 112 ms of computation per second of sound at the default rate.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Pitch | curve |  |
| output | Audio | audio |  |
| output | Confidence | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Lowest pitch | slider | 55 Hz | 27.5 – 500 Hz, step 0.5 | The lowest pitch searched for, and what the curve's zero means. It also decides the cost: the analysis window spans two of its periods, so the lower it is, the longer the analysis and the less it follows a fast gesture. |
| Highest pitch | slider | 1760 Hz | 100 – 4000 Hz, step 10 | The highest pitch searched for, and what the curve's one means. The scale between the two is logarithmic: an octave is worth the same curve interval wherever it falls. |
| Decoding | choice | pYIN (most likely path) | pYIN (most likely path) / YIN (plain threshold) | pYIN keeps several candidates per frame and picks the most likely path over the whole sound: an ambiguous frame is settled by its neighbours. YIN keeps a single candidate, and jumps an octave whenever the fundamental weakens. The second is here so the difference can be heard rather than taken on trust: on a held note broken by two weak passages, YIN returns 17 faulty frames out of 119, pYIN none. |
| Inertia | slider | 30 % | 0 – 99 %, step 1 | Smoothing of the pitch curve, forwards then backwards so as not to shift it. At zero, vibrato passes through as is; high, only the melodic line remains. |
| Rate | slider | 100 /s | 20 – 400 /s, step 10 | Frames per second. This is the setting that decides the cost, and it matters more here than elsewhere: one transform per frame, that is about 60 ms of computation per second of sound at rate 50, 112 ms at 100 and 182 ms at 200. |

#### Quadrafuzz

`quadrafuzz` · Processing → Distortion and modulation

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

#### Ring Modulator

`ring-modulator` · Processing → Distortion and modulation

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

#### Tape Machine

`magnetophone` · Processing → Distortion and modulation

*The four faults of tape: wow, flutter, saturation, dropouts.*

None of the four faults is decorative, and each has a distinct cause. Wow comes from the reel's eccentricity: a slow oscillation, under two hertz, that makes the pitch drift. Flutter comes from the capstan and the rollers: the same thing, but between five and twenty hertz, and the ear hears it as a tremble rather than a drift. Saturation comes from the oxide, which stops responding linearly long before it gives up — hence a gentle compression of the peaks, and harmonics that were not there. Dropouts come from holes in the magnetic coating: the sound vanishes for an instant, without warning. The first two share their machinery with the Doppler node, and it is the same idea: reading the signal at a distance that changes. An ambulance coming closer shortens the distance; a badly turning roller lengthens and shortens it by turns. Saturation is normalised: raising its drive changes the waveshape, not the volume. Without that, one would take it for a fault in the setting.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Wow | slider | 8 % | 0 – 60 %, step 1 | Amplitude of the slow pitch drift. A few per cent are enough to suggest a tired machine; beyond twenty, one hears an instrument detuning itself. |
| Wow rate | slider | 0.6 Hz | 0.1 – 3 Hz, step 0.1 | Rate of the drift, that is the reel's turn. Under one hertz one hears a breathing; above two it starts to resemble a vibrato. |
| Flutter | slider | 3 % | 0 – 30 %, step 1 | Amplitude of the fast tremble. It is far less noticeable than wow at equal amplitude, which is why its range goes less high. |
| Flutter rate | slider | 9 Hz | 4 – 25 Hz, step 0.5 | Rate of the tremble, that is the capstan's turn. |
| Saturation | slider | 2 | 0 – 12, step 0.5 | Drive of the tape saturation. At zero, none. The level does not change as it is raised — only the waveshape does, and the harmonics that come with it. |
| Dropouts | slider | 0.5 /s | 0 – 20 /s, step 0.5 | Holes per second in the magnetic coating. Each lasts some twenty milliseconds and opens with a fade, without which one would hear a click rather than an absence. |
| Hiss | slider | 0.5 % | 0 – 5 %, step 0.1 | Level of tape hiss. It is heard only in the silences, which is exactly its original failing. |
| Seed | slider | 1 | 0 – 999999, step 1 | Seed for dropouts and hiss. The same seed replays the same tape. |

#### Tremolo

`tremolo` · Processing → Distortion and modulation

*Amplitude modulation (periodic volume variations).*

Amplitude modulation: varies the volume periodically. Adjust the rate (vibration speed, 0.1 to 20 Hz), depth (intensity, 0 to 100%) and waveform shape (sine, square, triangle, sawtooth). A classic effect for guitars and organs.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation rate (vibrations per second). A curve connected to the Rate modulation input takes over: the tremolo that speeds up or settles. |
| Rate min | slider | 1 Hz | 0.1 – 20 Hz, step 0.1 | Rate that a curve's zero means on the Rate modulation input. The travel is multiplicative: from 1 to 16 Hz, the middle of the curve is 4 Hz, and every octave lasts as long. |
| Rate max | slider | 10 Hz | 0.1 – 20 Hz, step 0.1 | Rate that the curve's one means. |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Modulation depth (0% = no effect, 100% = volume fully cut). A curve connected to the Modulation input takes over: that is how one gets a tremolo whose depth follows a logistic sequence, without needing a separate node for it. |
| Modulation min | slider | 0 % | 0 – 100 %, step 1 | Depth that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 100 % | 0 – 100 %, step 1 | Depth that the curve's one means. |
| Shape | choice | Sine | Sine / Square / Triangle / Sawtooth | LFO waveform shape. |

#### Two-Sound Convolution

`convolution-deux-sons` · Processing → Distortion and modulation

*Makes one sound ring through another: only their shared frequencies survive, and their durations add up.*

To convolve is to make one sound ring through another. It is how a sound is placed in a room whose response is known; but the second sound can be anything at all: a voice through a gong, a scrape through a drop, a chord through footsteps. It is a basic tool of electroacoustic composition, from the Composers' Desktop Project to SoundHack. What you hear. Each instant of the first sound triggers a whole copy of the second, at its level. Two consequences decide everything. The spectrum of the result is the product of the two spectra: only the shared frequencies survive, the others cancel - a noise convolved by a note becomes that note, breathed. And the duration is the sum of the two: a long sound through a long sound gives a pad, a short sound through anything gives back nearly that anything, struck once. The operation is symmetric: swapping the two inputs gives the same sound. What tells the first from the second is only the output level, brought back to that of the first sound. A raw convolution of two full-scale sounds adds up thousands of samples and would come out twenty or forty decibels too loud; nothing musical hangs on that figure.

| Port | Name | Type | |
|---|---|---|---|
| input | Sound | audio |  |
| input | Second sound | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mix | slider | 100 % | 0 – 100 %, step 1 | Share of the convolved sound. At 0%, the first sound alone, unchanged; in between, the sound and what it becomes overlap. |

#### Vibrato

`vibrato` · Processing → Distortion and modulation

*Pitch modulation by LFO (note oscillation).*

Pitch modulation by LFO: the note oscillates around its original pitch. Different from pitch shift (which transposes statically) — vibrato varies the pitch periodically. Adjust the rate (speed, 0.1 to 20 Hz) and depth (amplitude, 0 to ±2 semitones). Uses a modulated delay to preserve timbre.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 5 Hz | 0.1 – 20 Hz, step 0.1 | Modulation speed (oscillations per second). A curve connected to the Rate modulation input takes over: the vibrato that speeds up, like a singer holding a note. If the Modulation input is connected too, it wins: it then draws the whole gesture, and there is no LFO left whose speed could be set. |
| Rate min | slider | 1 Hz | 0.1 – 20 Hz, step 0.1 | Rate that a curve's zero means on the Rate modulation input. The travel is multiplicative, as for any frequency. |
| Rate max | slider | 10 Hz | 0.1 – 20 Hz, step 0.1 | Rate that the curve's one means. |
| Depth | slider | 50 % | 0 – 100 %, step 1 | Pitch deviation at the peak of the oscillation (0% = none, 100% = ±2 semitones), the same at any speed: speeding the vibrato up does not widen it. |

#### Vocoder

`vocoder` · Processing → Distortion and modulation

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

`voice-changer` · Processing → Distortion and modulation

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

`wahwah` · Processing → Distortion and modulation

*Modulated bandpass filter (wah pedal effect).*

Bandpass filter with a LFO-modulated center frequency — the classic wah-wah pedal effect. The center frequency oscillates between 200 Hz and 2500 Hz. Adjust the rate (0.1 to 10 Hz), depth (sweep range), resonance (filter Q, high = pronounced wah) and mix. Ideal on electric guitars and keyboards.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 2 Hz | 0.1 – 10 Hz, step 0.1 | Modulation speed (sweeps per second). No effect when a curve is connected to the Modulation input: it then walks the centre frequency, and the sweep's rhythm is its own. |
| Sweep from | slider | 200 Hz | 50 – 5000 Hz, step 10 | The low end of the sweep. These two bounds were hard-wired at 200 and 2500 Hz, invisible and unsettable; they hold with or without a curve, since the wah sweeps between them either way. |
| Sweep to | slider | 2500 Hz | 50 – 8000 Hz, step 10 | The high end of the sweep. A connected curve travels it by multiplying rather than adding — an octave is a doubling — so the sweep does not rush into the treble. |
| Depth | slider | 100 % | 0 – 100 %, step 1 | Frequency sweep range (0% = static, 100% = full wah). |
| Resonance | slider | 5 Q | 0.5 – 20 Q, step 0.5 | Filter resonance (high Q = pronounced wah, low Q = gentle). |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Mix between dry and wet signal (100% = wah only). |
| Rate min | slider | 0.5 Hz | 0.1 – 10 Hz, step 0.1 | Rate that a curve's zero means on the Rate modulation input: the pedal that runs away. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing. |
| Rate max | slider | 8 Hz | 0.1 – 10 Hz, step 0.1 | Rate that the curve's one means. |

### Echo

| Component | Summary |
|---|---|
| [Echo](#echo-1) | Ping-pong delay/echo with feedback. |
| [Note Echo](#note-echo) | Layers time-shifted copies of a pattern, with decreasing velocity. |
| [Ping-Pong Echo](#ping-pong-echo) | Stereo ping-pong echo. |
| [Reverse Echo](#reverse-echo) | Reverse echo: attenuated repetitions build up before the main sound. |
| [Spectral Delay](#spectral-delay) | Delays the low end more than the high end — or the other way round — without cutting anything: the sound is not filtered, it is spread out. |
| [Stereo Delay](#stereo-delay) | Independent left/right delay. |

#### Echo

`echo` · Processing → Echo

*Ping-pong delay/echo with feedback.*

Ping-pong delay/echo with feedback. Time sets the interval between repetitions, feedback controls how many repetitions occur, and spread controls the stereo sweep. Dry and wet signals are mixed at the output.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Time modulation | curve |  |
| input | Feedback modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | slider | 350 ms | 50 – 2000 ms, step 10 | Delay time between repetitions. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Amount of signal fed back into the delay (more = more repetitions). |
| Spread | slider | 50 % | 0 – 100 %, step 1 | Stereo width of the echo (0% = mono, 100% = maximum left/right sweep). |
| Time min | slider | 100 ms | 50 – 2000 ms, step 10 | Delay that a curve's zero means on the Time modulation input. Moving the delay makes the repeats glide in pitch, like a tape echo whose speed is touched: that is the intended sound. With no curve, this setting does nothing. |
| Time max | slider | 800 ms | 50 – 2000 ms, step 10 | Delay that the curve's one means. |
| Feedback min | slider | 0 % | 0 – 95 %, step 1 | Feedback that a curve's zero means on the Feedback modulation input: the echo that dies away, or that runs away. Capped at 95%, like the setting, so the loop never diverges. |
| Feedback max | slider | 80 % | 0 – 95 %, step 1 | Feedback that the curve's one means. |

#### Note Echo

`motif-echo-notes` · Processing → Echo

*Layers time-shifted copies of a pattern, with decreasing velocity.*

Layers time-shifted copies of the pattern, each weaker than the last. The difference from an audio delay is total: these are not repetitions of a signal, they are notes, written into the MIDI file, and they can be transposed, quantized, replayed with another instrument, read in a score. A delay is mixed in; this one composes. « Feedback » is multiplicative: at 60 %, a note at 100 gives 60, then 36, then 22. The series stops by itself as soon as a copy would fall below velocity 1, rather than writing silent notes into the file. « Transpose » accumulates from copy to copy: at +7, the echo climbs fifth by fifth, and the series stops dead when it would leave the MIDI range instead of folding notes back anywhere. Every note of a chord is echoed, hence the whole chord. At a short offset — a twentieth of a second — the effect is no longer an echo but a flam; at a long offset with no transposition, it is a canon with oneself.

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

#### Ping-Pong Echo

`echo-ping-pong` · Processing → Echo

*Stereo ping-pong echo.*

Echo whose repeats bounce alternately between the left and right channels.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Time modulation | curve |  |
| input | Feedback modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | number | 250 ms |  | Delay between repeats. |
| Feedback | number | 35 % |  | Amount fed back. |
| Pan | number | 80 % |  | Left/right balance. |
| Time min | slider | 100 ms | 50 – 2000 ms, step 10 | Delay that a curve's zero means on the Time modulation input. Moving the delay makes the repeats glide in pitch, like a tape echo whose speed is touched: that is the intended sound. With no curve, this setting does nothing. |
| Time max | slider | 800 ms | 50 – 2000 ms, step 10 | Delay that the curve's one means. |
| Feedback min | slider | 0 % | 0 – 95 %, step 1 | Feedback that a curve's zero means on the Feedback modulation input: the echo that dies away, or that runs away. Capped at 95%, like the setting, so the loop never diverges. |
| Feedback max | slider | 80 % | 0 – 95 %, step 1 | Feedback that the curve's one means. |

#### Reverse Echo

`echo-inverse` · Processing → Echo

*Reverse echo: attenuated repetitions build up before the main sound.*

Reverse echo: attenuated repetitions build up before the main sound. Principle: reverse the signal, apply a normal echo, then reverse the result. This produces a build-up of pre-echos that grow louder until the main sound hits. Adjust the time between repetitions and the feedback (number and decay of repetitions).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Time | slider | 350 ms | 50 – 2000 ms, step 10 | Delay time between repetitions. |
| Feedback | slider | 40 % | 0 – 95 %, step 1 | Amount of signal fed back (more = more repetitions and longer build-up). |

#### Spectral Delay

`retard-spectral` · Processing → Echo

*Delays the low end more than the high end — or the other way round — without cutting anything: the sound is not filtered, it is spread out.*

Delays the low end more than the high end — or the other way round — without cutting anything. After Vesa Valimaki, Jonathan S. Abel and Julius O. Smith III, « Spectral Delay Filters », Journal of the Audio Engineering Society 57(7-8), 2009, pp. 521-531; feedback and time-varying coefficients come from Jussi Pekonen and Vesa Valimaki, « Spectral Delay Filters with Feedback and Time-Varying Coefficients », DAFx-09. What was missing, and this is why this effect was chosen: out of a hundred and twenty-one effects, none delays one frequency more than another. Flanger, phaser, echo, stereo delay all delay the whole signal by the same amount — they vary the amount, never its distribution across the spectrum. Here the low end can arrive eighty milliseconds after the high end, and yet nothing is filtered: the sound is not cut, it is spread out. How: a first-order allpass changes no amplitude — hence its name — but delays each frequency by a different time, given by tau(w) = (1 - a^2)/(1 + 2a·cos w + a^2) samples. One section does almost nothing; put two hundred of them and the delays add up. Measured at 44.1 kHz with two hundred sections and a dispersion of 0.9: 85.5 ms of delay at 100 Hz, 73.5 ms at 300 Hz, 30.5 ms at 1 kHz, 2.9 ms at 4 kHz and 0.6 ms at 10 kHz — theory predicted 84.6, 74.0, 30.5, 2.9 and 0.6. The direction needs nothing but the sign of the coefficient: the formula swaps its two ends along with it. The two directions are not equals, and a measurement showed it rather than a reading: the delay gathers in a bump that is narrow in frequency, placed at the low end or at Nyquist depending on the sign. At the low end that bump spans several audible octaves — 86 ms at 100 Hz, still 30 ms at 1 kHz. At the high end it sits in the last fraction of an octave below Nyquist, where there is almost nothing left to delay: 0.3 ms at 10 kHz, 1.4 ms at 16 kHz. « High end delayed » is therefore a subtle effect by nature. It is also why the node's message reports the delay at 100 Hz and at 10 kHz rather than at the two mathematical ends of the spectrum: announcing « 86 ms » on the high side would promise an effect the ear will not hear. Feedback returns the output into the cascade, giving a series of echoes each more dispersed than the last: the first is still a sound, the tenth a streak. Modulation is the second paper: dispersion itself becomes a gesture, driven by a curve — a feature follower, a logistic sequence, a ramp. With no curve connected, the node returns exactly what the setting gives: there is only one computation path. Max tail is not a comfort setting: the tail grows as (1+a)/(1-a), hence without bound as dispersion approaches one — at 0.999 and four hundred sections it is eighteen seconds, which feedback repeats again, and rendering would become endless. The output is longer than the input, and that is intended: the slow end's tail comes out after the sound has finished.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Sections | slider | 200 | 1 – 1000, step 1 | Number of cascaded allpass sections. One section does almost nothing — a few samples — and the delays add up: this setting sets the scale of the effect. It also decides the cost, the computation being proportional to sections times duration: 0.05 s for two seconds of sound at 200 sections, 0.14 s at 500. |
| Dispersion | slider | 0.9 | 0 – 0.99, step 0.01 | Strength of the spreading, that is the allpass coefficient. At zero the cascade becomes a plain delay of « Sections » samples, the same for every frequency. Near one, the gap between the two ends of the spectrum explodes — and so does the tail, which grows as (1+a)/(1−a). |
| Direction | choice | Low end delayed | Low end delayed / High end delayed | Which end of the spectrum arrives last. Nothing else needs changing to reverse the effect: it is the sign of the coefficient, and the group-delay formula swaps its two ends with it. The two directions are not equals, and it is better to know it: the delay gathers in a bump that is narrow in frequency, placed at the low end or at Nyquist depending on the sign. At the low end that bump spans several audible octaves — measured at 44.1 kHz, 200 sections, dispersion 0.9: 86 ms at 100 Hz, still 30 ms at 1 kHz. At the high end it sits in the last fraction of an octave below Nyquist, where there is almost nothing left to delay: 0.3 ms at 10 kHz, 1.4 ms at 16 kHz. « High end delayed » is therefore a subtle effect by nature, not a botched setting. |
| Feedback | slider | 0 % | 0 – 95 %, step 1 | Feeds the output back into the cascade, giving a series of echoes each more dispersed than the last: the first is still a sound, the tenth a streak. This is the addition of the 2009 paper's DAFx-09 sequel. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of processed sound. At 0 %, the output is the input, unchanged. |
| Max tail | slider | 4 s | 0.5 – 20 s, step 0.5 | Bound on the tail added after the sound. This is not a comfort setting: at high dispersion the theoretical tail reaches tens of seconds, which feedback then repeats, and rendering would become endless. The bound cuts it, and that is what makes extreme settings usable. |
| Modulation min | slider | 0.2 | 0 – 0.99, step 0.01 | Dispersion that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 0.95 | 0 – 0.99, step 0.01 | Dispersion that the curve's one means. It is also what sets the tail length when a curve is connected: the tail is measured on the strongest dispersion the render will reach. |

#### Stereo Delay

`delay-stereo` · Processing → Echo

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

### Editing

| Component | Summary |
|---|---|
| [Add Silence](#add-silence) | Adds silence at the beginning and/or end of the track. |
| [Audio Join](#audio-join) | Places two tracks one after the other with a crossfade. |
| [Extract duration](#extract-duration) | Measures track duration and passes it along. |
| [Extract Zone](#extract-zone) | Extracts a portion with fade and returns the Zone object. |
| [Extract Zones (Selector)](#extract-zones-selector) | Cuts and concatenates the zones chosen in the multi-zone selector. |
| [Fade](#fade) | Fade in/out. |
| [Grain Editing](#grain-editing) | Finds a sound's grains — each hit, each syllable — then drops some, repeats them, reverses their order or shuffles them, never cutting in the middle of a sound. |
| [Loop](#loop) | Repeats the whole signal a given number of times. |
| [Loop End A](#loop-end-a) | Closes a graph loop and puts every pass's result end to end. |
| [Loop End B](#loop-end-b) | Closes a graph loop and keeps only the last pass's result. |
| [Loop End C](#loop-end-c) | Closes a graph loop and stacks the passes on top of one another, like the mixer. |
| [Loop Start](#loop-start) | Marks the start of a graph loop: what follows is replayed N times, each pass starting from the previous result. |
| [MIDI Join](#midi-join) | Places two MIDI files one after another with an overlap. |
| [MIDI Loop](#midi-loop) | Repeats a MIDI file a given number of times. |
| [MIDI Splitter](#midi-splitter) | Splits a MIDI file into parts — one per instrument — to play them with four different banks. |
| [Mixer](#mixer) | Sums several tracks into one. Each track's level is set on the node that produces it. |
| [Montage](#montage) | Lays sounds on a timeline, each at its own instant and level, with its own fades; the node grows one track at a time. |
| [Multi-Zone Selector](#multi-zone-selector) | Selects multiple audio zones and passes them as a list. |
| [Place sound on zones](#place-sound-on-zones) | Inserts a copy of a sound at the center of each zone onto a target track, or onto a silent track of the given duration. |
| [Reinsert Zone](#reinsert-zone) | Reinserts a treated zone into the original track. |
| [Reorder Objects](#reorder-objects) | Chains a sound's objects in the order of a descriptor: from darkest to brightest, from quietest to loudest. |
| [Sound Object Segmentation](#sound-object-segmentation) | Finds the sound objects of a recording — by attacks, silences or changes of timbre — and describes them. |
| [Track Aligner](#track-aligner) | Aligns a track to a reference length (silence or fade). |
| [Trim Silence](#trim-silence) | Removes silence at the start and end of a take, and in the middle if asked. |
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

#### Fade

`fondu` · Processing → Editing

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

#### Grain Editing

`montage-grains` · Processing → Editing

*Finds a sound's grains — each hit, each syllable — then drops some, repeats them, reverses their order or shuffles them, never cutting in the middle of a sound.*

After the `GRAIN` family of the Composers Desktop Project, developed by Trevor Wishart. What sets it apart from the rest of the granular catalog: the boundaries come from the sound and not from a set rate. Granular freeze, brassage, random slicing and particles all cut on a grid that owes nothing to what it is given; here each hit of a rhythm, each syllable of a voice, each note of an arpeggio becomes a grain that can be dropped, moved or repeated without ever cutting in the middle of a sound. Detection rests on two rules, and the second does the work. The first separates what sounds from what does not, by a threshold in decibels, using the envelope of the silence trimmer — two nodes cutting the same sound should not cut it differently. But that rule fails exactly where the process is useful: on a roll, a held phrase or a pad, the envelope never falls back to silence and you get one single thirty-second grain. The second rule therefore looks for attacks inside what sounds: a clear rise of the envelope after a fall opens a grain, with no silence in front of it. Sensitivity is a setting, and it has to be. It says by how many decibels the envelope must rise for an attack to be seen. Measured on a roll whose hits fall every 240 milliseconds under a 250 millisecond decay: between two of them the envelope only falls by 8.4 decibels. At nine decibels of sensitivity one hit hides in the previous one's tail; at six, all eight come out. The setting reaches towards the sound it is given, it does not guess. The minimum gap is no convenience. An attack is not an instant but a rise of a few milliseconds, where the envelope wavers: without it a single hit gives three or four grains and every manipulation turns to mincemeat. Start with « Count only ». The operation does not touch the sound, and the report says what was found — how many grains, their mean duration, their mean gap, and the list of their onsets in seconds. That is where threshold and sensitivity get set; everything that follows depends on them. Spacing decides what becomes of the rhythm. « As found » puts each grain back at the instant it was found: dropping one hit in two leaves a hole in its place, duration does not move, and the rhythm stays recognisable — which is what you want to thin out a loop. « Butted » glues the grains end to end: the sound shortens accordingly and the rhythm changes. The first keeps duration, the second keeps density. Reversing the order turns the sequence of grains around without turning the grains themselves: the hits follow one another backwards, each of them still forwards. That is a wholly different thing from reversed playback, which would put every attack at the end of its sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Count only | Count only / Keep n out of m / Reverse the order / Repeat each / Shuffle | What is done with the grains once found. « Count only » does not touch the sound: start there, to set detection against the report before manipulating anything. The others drop, repeat, reverse the order or shuffle — and none cuts in the middle of a sound, since they work on whole grains. |
| Keep | slider | 1 | 0 – 8, step 1 | For « Keep n out of m »: how many grains are kept in each group. At one out of two, every other hit disappears; at two out of three, one in three. Zero returns silence, which is a fair answer to an absurd request. |
| Out of | slider | 2 | 1 – 8, step 1 | The size of the group being counted in. With « Keep », it decides the pattern: one out of two thins by half, three out of four drops one grain in four. |
| Repeats | slider | 2 | 1 – 8, step 1 | For « Repeat each »: how many times each grain is played. With « As found » spacing, the copies overlap the rest and add up; butted, they lengthen the sound accordingly. |
| Spacing | choice | As found | As found / Butted | Where the grains land. « As found » keeps the instants found in the sound: duration does not move and the rhythm stays recognisable, a dropped grain leaving a hole in its place. « Butted » glues them end to end: the sound shortens and the rhythm changes. The first keeps duration, the second keeps density. |
| Threshold | slider | -45 dBFS | -80 – -20 dBFS, step 1 | Below this level, there is deemed to be no sound. It is the same threshold, on the same envelope, as the silence trimmer. Too high and only the loud hits are found; too low and hiss is taken for a grain. |
| Sensitivity | slider | 6 dB | 0 – 24 dB, step 1 | By how much the envelope must rise, after a fall, for an attack to be seen. This is the setting that separates the hits of a roll, whose envelope never falls back to silence. At zero the rule is off and only silences separate grains — which gives one single grain on a sustained sound. |
| Minimum gap | slider | 40 ms | 1 – 500 ms, step 1 | Two grains cannot start closer than this. An attack is not an instant but a rise of a few milliseconds where the envelope wavers: without this gap, a single hit gives three or four grains. |
| Seed | slider | 42 | 1 – 999999, step 1 | The shuffle's draw. The same seed replays exactly the same order, which is what makes a result you liked findable again. |

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

#### Loop End A

`boucle-graphe-fin` · Processing → Editing

*Closes a graph loop and puts every pass's result end to end.*

Closes a graph loop opened by « Loop Start », and puts every pass's result end to end: the output holds the N successive states, in the order they were produced — its duration is therefore the sum of the passes. This is the loop end that lets you hear the transformation itself: you follow the sound drifting pass after pass. « Fade » smooths the join between two passes; at 0 ms they follow each other exactly. The two other ends do the same loop work and differ only in what they keep: « Loop End B » returns the last pass only, « Loop End C » stacks the passes on top of one another. A loop has a single end: choosing it is how you choose the result. If this node has no « Loop Start » upstream, nothing is unrolled: it then behaves as a plain join of whatever it receives.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fade | number | 0 ms | 0 – 500 ms, step 5 | Crossfade between two passes. 0 = hard join, the passes follow each other exactly. |

#### Loop End B

`boucle-graphe-fin-b` · Processing → Editing

*Closes a graph loop and keeps only the last pass's result.*

Closes a graph loop opened by « Loop Start » and keeps only the last pass's result. The earlier passes are computed — they must be, each starting from the previous result — but they do not come out here: the output lasts a single pass. This is what you want when the loop is there to iterate rather than to let the iteration be heard: five passes of a light saturation to get the saturation a single pass cannot give, ten passes of a smoothing for a polished sound, a reverb applied again and again until nothing is left but a wash. « Loop End A » would keep the ten successive states end to end and return ten times the duration; here only the final state is kept. No setting: there is nothing to decide, and the number of passes is set on « Loop Start ». If this node has no « Loop Start » upstream, nothing is unrolled: it then returns what it receives.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Loop End C

`boucle-graphe-fin-c` · Processing → Editing

*Closes a graph loop and stacks the passes on top of one another, like the mixer.*

Closes a graph loop opened by « Loop Start » and stacks the passes: they all sound at once, summed from time zero, exactly as the mixer sums tracks. The output lasts as long as the longest pass, not the sum of the passes. This is what makes audible together what a loop produces one after the other: a canon if the chain delays the sound, a chord if it transposes, a choir if it detunes slightly. The mixer has no level setting because each track's level is set on the node producing it; here that is impossible — the passes are copies of a single chain and share their settings — hence the « Level » setting, applied to the sum. The message reports the peak reached: stacking ten passes of the same sound goes above 1, and that should be visible on the node rather than audible on playback; lower the level then. If this node has no « Loop Start » upstream, nothing is unrolled: it behaves as a mixer of whatever it receives.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Level | number | 0 dB | -24 – 6 dB, step 0.5 | Level applied to the sum of the passes. At 0 dB they add up as they are, as on the mixer. |

#### Loop Start

`boucle-graphe-debut` · Processing → Editing

*Marks the start of a graph loop: what follows is replayed N times, each pass starting from the previous result.*

Opens a graph loop. Everything wired between this node and a « Loop End » — A, B or C — is played « Passes » times, and each pass starts from the previous result: if the chain transposes by a semitone, the second pass transposes an already transposed signal, so by two semitones in total, the third by three, and so on. The loop end then decides what is kept of the N successive states: « Loop End A » puts them end to end, « B » keeps only the last one, « C » stacks them on top of one another like the mixer. Attic's engine only runs acyclic graphs: the loop is therefore unrolled before execution — the inner chain is copied as many times as there are passes, and each copy is wired to the previous one. It shows in the computation time, which is that of N passes, not one. Anything entering the loop from outside through another port — a setting, a second source — feeds every pass identically. Anything leaving it other than through « Loop End » leaves only once, on the last pass. Limits: a loop cannot contain another loop, and a loop end can only have one start upstream. In those cases nothing is unrolled and the node says so instead of producing nonsense.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Passes | number | 3 | 1 – 32, step 1 | How many times the chain between this node and the « Loop End » (A, B or C) is played. Effects accumulate: if the chain transposes by a semitone, the second pass starts from an already transposed signal and therefore rises by two semitones. |

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

#### MIDI Splitter

`repartiteur-midi` · Processing → Editing

*Splits a MIDI file into parts — one per instrument — to play them with four different banks.*

Splits a MIDI file into parts, one per instrument, so that a full arrangement can be played by several sample banks — the melody by one, the chords by another, the bass by a third, the drums by a kit. This was the missing link: « Multi-Zone Sampler » plays a MIDI file with one bank, so a four-channel file sent all four parts into the same instrument — a piano playing the kick drum too, two octaves too high. Notes have always carried their channel; nothing used it. What this node guarantees, and what four separate sequencers do not: the parts come from the same file, hence the same tempo and the same time origin — there is nothing to synchronise, and a tempo change follows all of them. Channel 10 is special: General MIDI reserves it for percussion, where the note number means an instrument rather than a pitch — 36 kick, 38 snare, 42 hi-hat. It therefore always goes to the Drums output, which needs a different kind of bank, a kit, where a key is a sound and not a pitch. Three modes. Automatic: the node inventories the file and splits on its own, in channel order. By channels: you write each part's channels, counted from 1 to 16 as on a device, with ranges (« 1-3 ») and lists (« 1,4 »). By tracks: the same boxes mean track numbers, which is what files whose voices share a channel need — a notation program often writes a choir's four voices on channel 1, separated by tracks; the tempo is then kept in every part even when the track that carried it is not one of them. The « Rest » output exists so that no note vanishes silently: any channel or track that plays and was assigned to no part ends up there, and the node's message names it. That message also says what went where, with each part's note count: a part that is silent because it received nothing is then not mistaken for a badly set sampler.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Part 1 | MIDI |  |
| output | Part 2 | MIDI |  |
| output | Part 3 | MIDI |  |
| output | Drums | MIDI |  |
| output | Rest | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Split by | choice | Automatic | Automatic / By channels / By tracks | Automatic: the node looks at what the file holds and splits on its own — channel 10, which General MIDI reserves for percussion, always goes to the Drums output, and the other channels fill the parts in channel order. By channels: you write each part's channels below. By tracks: the same boxes then mean track numbers, which is what files whose voices share a channel need — a notation program often writes a choir's four voices on channel 1, separated by tracks. |
| Part 1 | text | `1` |  | Channels (or tracks) of the first part: « 1 », « 1,2 », « 1-3 ». Channels count from 1 to 16, as on a device. Ignored in automatic mode. |
| Part 2 | text | `2` |  | Channels (or tracks) of the second part. |
| Part 3 | text | `3` |  | Channels (or tracks) of the third part. |
| Drums | text | `10` |  | Channels (or tracks) of the drums. 10 by default, the General MIDI convention. This output needs a different kind of bank — a kit, where a key is a sound and not a pitch — hence its name. |

#### Mixer

`melangeur` · Processing → Editing

*Sums several tracks into one. Each track's level is set on the node that produces it.*

Sums several tracks into a single output. Add as many inputs as needed. There is no per-track level and no limiter: tracks are summed as they come, and the sum can exceed the ceiling — three tracks at 0.8 come out at 2.4, which clips on playback and on export. Set the Volume on the node producing each track, both to balance them and to keep headroom.

| Port | Name | Type | |
|---|---|---|---|
| input | Track | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Montage

`montage` · Processing → Editing

*Lays sounds on a timeline, each at its own instant and level, with its own fades; the node grows one track at a time.*

This node lays sounds out on a timeline and adds them into one. It shows four tracks to begin with; the « + » and « - » buttons under its inputs make it longer or shorter, up to sixteen. The « - » refuses while the last track is connected: no cable disappears without being unplugged first. Each track has four settings: its start instant, its level, its fade in and its fade out. They only appear for connected tracks. Above them, the timeline shows the tracks in place and at their real length after a run: drag a track to move it, drag its corners to set its fades. Widening the inspector over the canvas gives the timeline the room it deserves. Fades are equal-power: two sounds crossing over the same length, one going out, the other coming in, keep their energy in the middle of the crossing, without the dip a straight ramp would make there. Fades longer than the sound are shortened in the same proportion. A negative start trims the sound by that much: one enters a sound already under way, and the fade in applies to what remains. The output lasts until the end of the last sound. Tracks are numbered, and track 3 stays track 3 whatever order the cables were drawn in. For more than sixteen sounds, montage montages.

| Port | Name | Type | |
|---|---|---|---|
| input | Track 1 | audio |  |
| input | Track 2 | audio |  |
| input | Track 3 | audio |  |
| input | Track 4 | audio |  |
| input | Track 5 | audio |  |
| input | Track 6 | audio |  |
| input | Track 7 | audio |  |
| input | Track 8 | audio |  |
| input | Track 9 | audio |  |
| input | Track 10 | audio |  |
| input | Track 11 | audio |  |
| input | Track 12 | audio |  |
| input | Track 13 | audio |  |
| input | Track 14 | audio |  |
| input | Track 15 | audio |  |
| input | Track 16 | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Start 1 | number | 0 s | -600 – 3600 s, step 0.01 | Instant at which track 1 starts. Negative: the sound is trimmed by that much. |
| Gain 1 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 1. |
| Fade in 1 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 1's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 1 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 1's fade out. |
| Start 2 | number | 2 s | -600 – 3600 s, step 0.01 | Instant at which track 2 starts. Negative: the sound is trimmed by that much. |
| Gain 2 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 2. |
| Fade in 2 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 2's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 2 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 2's fade out. |
| Start 3 | number | 4 s | -600 – 3600 s, step 0.01 | Instant at which track 3 starts. Negative: the sound is trimmed by that much. |
| Gain 3 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 3. |
| Fade in 3 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 3's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 3 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 3's fade out. |
| Start 4 | number | 6 s | -600 – 3600 s, step 0.01 | Instant at which track 4 starts. Negative: the sound is trimmed by that much. |
| Gain 4 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 4. |
| Fade in 4 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 4's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 4 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 4's fade out. |
| Start 5 | number | 8 s | -600 – 3600 s, step 0.01 | Instant at which track 5 starts. Negative: the sound is trimmed by that much. |
| Gain 5 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 5. |
| Fade in 5 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 5's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 5 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 5's fade out. |
| Start 6 | number | 10 s | -600 – 3600 s, step 0.01 | Instant at which track 6 starts. Negative: the sound is trimmed by that much. |
| Gain 6 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 6. |
| Fade in 6 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 6's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 6 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 6's fade out. |
| Start 7 | number | 12 s | -600 – 3600 s, step 0.01 | Instant at which track 7 starts. Negative: the sound is trimmed by that much. |
| Gain 7 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 7. |
| Fade in 7 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 7's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 7 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 7's fade out. |
| Start 8 | number | 14 s | -600 – 3600 s, step 0.01 | Instant at which track 8 starts. Negative: the sound is trimmed by that much. |
| Gain 8 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 8. |
| Fade in 8 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 8's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 8 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 8's fade out. |
| Start 9 | number | 16 s | -600 – 3600 s, step 0.01 | Instant at which track 9 starts. Negative: the sound is trimmed by that much. |
| Gain 9 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 9. |
| Fade in 9 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 9's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 9 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 9's fade out. |
| Start 10 | number | 18 s | -600 – 3600 s, step 0.01 | Instant at which track 10 starts. Negative: the sound is trimmed by that much. |
| Gain 10 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 10. |
| Fade in 10 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 10's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 10 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 10's fade out. |
| Start 11 | number | 20 s | -600 – 3600 s, step 0.01 | Instant at which track 11 starts. Negative: the sound is trimmed by that much. |
| Gain 11 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 11. |
| Fade in 11 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 11's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 11 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 11's fade out. |
| Start 12 | number | 22 s | -600 – 3600 s, step 0.01 | Instant at which track 12 starts. Negative: the sound is trimmed by that much. |
| Gain 12 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 12. |
| Fade in 12 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 12's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 12 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 12's fade out. |
| Start 13 | number | 24 s | -600 – 3600 s, step 0.01 | Instant at which track 13 starts. Negative: the sound is trimmed by that much. |
| Gain 13 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 13. |
| Fade in 13 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 13's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 13 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 13's fade out. |
| Start 14 | number | 26 s | -600 – 3600 s, step 0.01 | Instant at which track 14 starts. Negative: the sound is trimmed by that much. |
| Gain 14 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 14. |
| Fade in 14 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 14's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 14 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 14's fade out. |
| Start 15 | number | 28 s | -600 – 3600 s, step 0.01 | Instant at which track 15 starts. Negative: the sound is trimmed by that much. |
| Gain 15 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 15. |
| Fade in 15 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 15's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 15 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 15's fade out. |
| Start 16 | number | 30 s | -600 – 3600 s, step 0.01 | Instant at which track 16 starts. Negative: the sound is trimmed by that much. |
| Gain 16 | slider | 0 dB | -60 – 12 dB, step 0.5 | Level of track 16. |
| Fade in 16 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 16's fade in. A few milliseconds avoid a click; several seconds make the sound emerge. |
| Fade out 16 | number | 10 ms | 0 – 60000 ms, step 1 | Length of track 16's fade out. |

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

#### Reorder Objects

`reordonner-objets` · Processing → Editing

*Chains a sound's objects in the order of a descriptor: from darkest to brightest, from quietest to loudest.*

This node chains a sound's objects in the order of a descriptor: loudness, brightness, noisiness or length. A rain of fragments sorted from darkest to brightest becomes a rise; sorted from noisiest to most tonal, a sound that clears; from longest to shortest, an acceleration. The principle is that of CataRT's navigation, reduced to one axis. The zones may arrive already described, or carry only their bounds - a hand-made selection: the node then describes them itself, and they sort the same way. Each object gets a fade in and out, so that no cut clicks. The space between two objects can be negative: they then overlap, and the chain becomes a texture. At random, the order is drawn with a seed: same seed, same order.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Zones | control |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Order | choice | Brightness | Original / Loudness / Brightness / Noise / Length / Random | The descriptor that sorts the objects. Original: the sound's own order, to apply only the spacing and fades. |
| Direction | choice | Ascending | Ascending / Descending | Ascending: from lowest to highest on the chosen descriptor. No effect at random. |
| Spacing | slider | 0 ms | -2000 – 5000 ms, step 10 | Silence between two objects; negative, they overlap by that much. |
| Fade | slider | 10 ms | 0 – 500 ms, step 1 | Fade in and out of each object. |
| Seed | number | 42 | 1 – 999999, step 1 | For random order: same seed, same order. |

#### Sound Object Segmentation

`decoupage-objets` · Processing → Editing

*Finds the sound objects of a recording — by attacks, silences or changes of timbre — and describes them.*

This node finds the sound objects of a recording - sounds each perceived as a whole, in Pierre Schaeffer's sense (Traite des objets musicaux, 1966) - and returns them as zones: each can then be extracted, processed or put back by any node that accepts zones. Three criteria, depending on the material: an object is not bounded the same way everywhere. Attacks: for what is struck, plucked, knocked. A boundary is an instant where the spectrum suddenly gains energy; the object runs from one attack to the next, and its resonance belongs to it. The attack is placed to the sample, two milliseconds before the sound, so that no object starts cut off. Silences: for a field recording, a voice, separate events. What falls below the threshold is a silence; a gap under 60 ms is not one, it is a breath inside the object. Change of timbre: for a continuous flow, a wind, a crowd, a pad, which have neither attack nor silence. A boundary is an instant where what comes before and what comes after differ, on three descriptors at once - brightness, noisiness, level. Each object is described by what one hears of it: its loudness, in dB; its brightness, the centre of gravity of its spectrum in hertz; its noisiness, from 0 for a pure note to 1 for white noise; its duration. The report lists them, and each zone carries them along, which makes it possible to sort the objects by what one hears of them. Three outputs, for three uses. The audio is the input sound passed through unchanged, to carry on the chain without rewiring. The zones are the list of objects, to be connected to any zone input: to extract them, mute them, place a sound on them, reorder them. The report is the text above, to read or to save - it is how the segmentation is checked, as the node does not draw the objects on the sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Zones | control |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Criterion | choice | Attacks | Attacks / Silences / Change of timbre | What separates two objects. Attacks: what is struck or plucked. Silences: separate events, a field recording. Change of timbre: a continuous flow, with neither attack nor silence. |
| Sensitivity | slider | 50 % | 0 – 100 %, step 1 | Higher, more objects: smaller attacks or smaller changes of timbre are enough to make a boundary. No effect on the silence criterion, which its threshold sets. |
| Min length | slider | 80 ms | 20 – 5000 ms, step 10 | A shorter object is dropped, and two boundaries closer than this make only one - the sharper. It is the setting that keeps a drum roll from being cut note by note, if one wants it whole. |
| Silence threshold | slider | -40 dB | -90 – -10 dB, step 1 | For the silence criterion: what falls below this level is a silence. No effect on the other criteria. |

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

#### Trim Silence

`rogner-silences` · Processing → Editing

*Removes silence at the start and end of a take, and in the middle if asked.*

The commonest editing gesture, and it was missing. Attic could add silence, extract a zone, align one track to another — but not remove the blank at the start and end of a take, which is done to every file entering a project. The threshold is counted in decibels, the only honest scale. A linear threshold of 0.01 looks small and is forty decibels below full scale, that is, a level where a breath, a reverb tail or a preamp hiss are still alive. In decibels, one knows what is being cut. The margin exists because a threshold alone always cuts too much. A sound's attack rises out of silence: the first sample above the threshold already arrives after the rise began, and trimming there gives a click and a truncated attack. A few dozen milliseconds given back on either side are enough. What is measured is the envelope, not the sample. A sinusoid crosses zero twice per period: looking at samples alone, every sound contains silences of a few tenths of a millisecond, and the « Everywhere » mode would cut an A 440 into eight hundred and eighty pieces per second. Two ambitions, and the choice is not innocent. At the edges, what happens in the middle is untouched: a silence between two phrases is part of the playing, and removing it changes the music. Everywhere, inner silences longer than the minimum duration are removed too — that is another craft, speech editing. Both channels are always trimmed at the same places, failing which the image would shift.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | slider | -60 dB | -80 – -20 dB, step 1 | Below this level it is silence. -60 lets through almost everything audible; -40 trims firmly, at the risk of taking a reverb tail with it. |
| Margin | slider | 50 ms | 0 – 500 ms, step 5 | What is given back on either side. Without a margin the attack is truncated and a click is heard: the first sample above the threshold already arrives after the rise began. |
| Scope | choice | Edges | Edges / Everywhere | At the edges, the middle is untouched: a silence between two phrases is part of the playing. Everywhere, long enough inner silences are removed too — that is speech editing, and it changes the music. |
| Minimum length | slider | 0.5 s | 0.1 – 5 s, step 0.1 | In Everywhere mode: the length from which an inner silence is removed. Below it, it is kept. |

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

### Envelope control

| Component | Summary |
|---|---|
| [ADSR Envelope](#adsr-envelope) | Shapes the sound's volume over time (attack, decay, sustain, release). |
| [Envelope Transfer](#envelope-transfer) | Takes one sound's amplitude contour and lays it on another: one's rhythm, the other's material. |

#### ADSR Envelope

`enveloppe-adsr` · Processing → Envelope control

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

#### Envelope Transfer

`transfert-enveloppe` · Processing → Envelope control

*Takes one sound's amplitude contour and lays it on another: one's rhythm, the other's material.*

After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `envel extract` and `envel impose`. Attic could build an envelope — the ADSR envelope draws one, the fade applies one at the edges. No node could take one sound's and lay it on another. Yet this is the operation that makes a pad speak: the rhythm of a spoken phrase, the breathing of a drum kit, the attack of a percussion, transferred onto a sound that has none. Why the target must be flattened first, and this is the point one misses doing it by hand. Simply multiplying the target by the model's envelope does not give the model's contour: it gives the product of the two. If the target already has an attack, it survives beneath the one being imposed, and the result has neither one's rhythm. Flattening first brings the target back to a constant amplitude, and what one then hears is indeed the model's contour. The two sounds need not be the same length: the model's envelope is stretched to cover the target.

| Port | Name | Type | |
|---|---|---|---|
| input | Target | audio |  |
| input | Model | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Resolution | slider | 10 ms | 1 – 300 ms, step 1 | How finely the contour is followed. It is the only setting that really changes the nature of the result: at 5 milliseconds one transfers almost the waveform, and the model's grain comes with it; at 200, only its large breaths remain, the phrase alone. |
| Flatten | choice | Yes | Yes / No | Erase the target's own contour before imposing the model's. At « No » one gets the product of the two contours, which is sometimes wanted but is not a transfer. |
| Floor | slider | -60 dB | -80 – -20 dB, step 1 | Level below which the target is not flattened. Flattening is a division, and dividing silence would only amplify background noise: below this threshold the target's silence is taken as silence and not as a dip to correct. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of imposed contour. At 0 %, the output is the target, unchanged. |

### Equalisation and filters

| Component | Summary |
|---|---|
| [Amplifier](#amplifier) | Amplification/ attenuation of the signal. |
| [Compressor](#compressor) | Feed-forward compressor. |
| [De-esser](#de-esser) | Dynamic sibilance compression. |
| [Ducking](#ducking) | One sound steps aside for another: the music backs off under the voice, without the voice being heard. |
| [Equalizer](#equalizer) | 9-band equalizer. |
| [Filter + Response](#filter--response) | Filters the signal and displays the frequency response curve. |
| [Filter by Spectrum](#filter-by-spectrum) | Filters one sound by another's spectrum, moment by moment: the partials of the second carve the first, or its colour is printed on it. |
| [Gate/Expander](#gateexpander) | Dynamic gate or expander (cuts or attenuates signal below a threshold). |
| [Limiter](#limiter) | Peak limiter for mastering. |
| [Multiband Compressor](#multiband-compressor) | 3-band compressor with independent thresholds/ratios. |
| [Normalizer](#normalizer) | Brings the sound to a target level, by peak or by loudness (LUFS). |
| [Resonators](#resonators) | A bank of tuned resonators that any sound can set ringing: a noise becomes a chord, a scrape a bell. |
| [Transient Shaper](#transient-shaper) | Independent attack and sustain control. |
| [Tuned Combs](#tuned-combs) | Comb filters tuned to a note or a chord: the input sound rings like a string, at the note and all its harmonics. |

#### Amplifier

`amplificateur` · Processing → Equalisation and filters

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

#### Compressor

`compresseur` · Processing → Equalisation and filters

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

#### De-esser

`de-esser` · Processing → Equalisation and filters

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

#### Ducking

`ducking` · Processing → Equalisation and filters

*One sound steps aside for another: the music backs off under the voice, without the voice being heard.*

Attic has a compressor, a limiter, a multiband, a gate. All listen to the signal they treat: they lower a sound when that sound is loud. None can lower a sound when another is loud. Yet this is the commonest gesture in mixing — the music stepping aside under a voice, the pad backing off at each kick — and no combination of the four produces it. One says « side chain » when speaking of the wiring: the controlling signal comes in from the side, and never comes out. Only the target is rendered. The hold deserves attention. Without it, a hesitating voice lets the music rise between two words, and one hears a panting. The hold keeps the attenuation for a while after the trigger has fallen back, so that a spoken phrase digs one hole rather than twelve.

| Port | Name | Type | |
|---|---|---|---|
| input | Target | audio |  |
| input | Trigger | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Threshold | slider | -30 dB | -60 – 0 dB, step 1 | Level of the trigger above which the attenuation engages. Too high and a soft voice triggers nothing; too low and the microphone's hiss is enough to push the music back. |
| Reduction | slider | 12 dB | 0 – 40 dB, step 1 | How far the target drops. Six decibels are enough to clear a voice; beyond twenty, the music vanishes rather than backs off. |
| Attack | slider | 0.01 s | 0.001 – 0.5 s, step 0.001 | Fall time. Short, the first word is cleared but one hears the dip happen; long, the start of the phrase stays buried. |
| Release | slider | 0.25 s | 0.01 – 2 s, step 0.01 | Rise time, once the hold has elapsed. It is what makes the effect natural: too short and the music jumps back; too long and it takes a second to return. |
| Hold | slider | 0.1 s | 0 – 1 s, step 0.01 | How long the attenuation is kept after the trigger has fallen back below the threshold. This is the setting that prevents panting between two words. |

#### Equalizer

`equaliseur` · Processing → Equalisation and filters

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

#### Filter + Response

`reponse-filtre` · Processing → Equalisation and filters

*Filters the signal and displays the frequency response curve.*

Filters the signal by the chosen type (lowpass, highpass, bandpass, notch) with adjustable cutoff frequency and resonance (Q). The view displays the filter's frequency response curve (gain in dB per frequency) in real time — useful to visually understand what the filter does to the spectrum. The curve updates instantly as you change parameters, even before execution.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Cutoff modulation | curve |  |
| input | Resonance modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Type | choice | Lowpass | Lowpass / Highpass / Bandpass / Notch | Filter type. Lowpass passes lows, highpass passes highs, bandpass keeps a band, notch removes a band. |
| Cutoff | number | 1000 Hz | 20 – 20000 Hz, step 1 | Filter hinge frequency (cutoff or band center). |
| Resonance | number | 0.7 Q | 0.5 – 12 Q, step 0.1 | Quality factor Q: higher = a sharper peak at the cutoff. |
| Modulation min | number | 200 Hz | 20 – 20000 Hz, step 1 | Cutoff that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | number | 6000 Hz | 20 – 20000 Hz, step 1 | Cutoff that the curve's one means. Feeding the sound's own brightness into this input gives the paper's adaptive effect: the filter opens as the sound gets harsh. |
| Resonance min | slider | 0.7 Q | 0.5 – 12 Q, step 0.1 | Resonance that a curve's zero means on the Resonance modulation input. |
| Resonance max | slider | 8 Q | 0.5 – 12 Q, step 0.1 | Resonance that the curve's one means. Two settings of the same filter can move together: the cutoff sweeping while the resonance pinches is what no two filters in series can reproduce. |

#### Filter by Spectrum

`filtrage-spectre` · Processing → Equalisation and filters

*Filters one sound by another's spectrum, moment by moment: the partials of the second carve the first, or its colour is printed on it.*

At each moment, each component of the first sound is multiplied by the weight of the same frequency in the second. What is strong in the second passes; what is absent from it is removed from the first. The first sound keeps its unfolding and its matter; the second imposes its pitches or its colour on it. Without smoothing, the partials of the second carve the first: a noise filtered by a note takes on that note's pitch and timbre, footsteps filtered by a chord start sounding the chord. With smoothing, the second imposes only its spectral envelope - its formants, its brightness - and the first sound keeps its own pitches: a matter taking on the colour of a voice. The depth doses the effect, from 0 (the first sound untouched) to 100%. If the second sound is shorter, it is read in a loop. The output lasts as long as the first sound. After the spectrum combination operations of the Composers' Desktop Project (« combine »), and Trevor Wishart, « Audible Design », 1994.

| Port | Name | Type | |
|---|---|---|---|
| input | Sound | audio |  |
| input | Filter | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Depth | slider | 100 % | 0 – 100 %, step 1 | Share of the filtering. 0: the sound untouched; 100%: fully filtered. |
| Smoothing | slider | 0 Hz | 0 – 1000 Hz, step 10 | Width over which the filter's spectrum is averaged. 0: its partials carve the sound; a few hundred hertz: only its envelope, its colour, is printed. |

#### Gate/Expander

`gate-expandeur` · Processing → Equalisation and filters

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

#### Limiter

`limiteur` · Processing → Equalisation and filters

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

#### Multiband Compressor

`compresseur-multibande` · Processing → Equalisation and filters

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

#### Normalizer

`normaliseur` · Processing → Equalisation and filters

*Brings the sound to a target level, by peak or by loudness (LUFS).*

Adjusts overall gain to bring the signal peak to the target level, without changing dynamics.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Peak | Peak / Loudness (LUFS) | Peak aligns the largest sample; loudness aligns what is heard. Two pieces normalised to the same peak can differ by fifteen decibels to the ear, a dry drum kit and a compressed pad both topping out at 0 dBFS. |
| Level | slider | -3 dB | -40 – 0 dB, step 0.5 | Target peak, in Peak mode. This setting does nothing in Loudness mode. |
| Target loudness | slider | -14 LUFS | -36 – -6 LUFS, step 0.5 | Target loudness, in Loudness mode. -14 is the streaming platforms' target, -23 the EBU R 128 broadcast standard, -16 a common podcast value. |
| Ceiling | slider | -1 dBTP | -6 – 0 dBTP, step 0.1 | True peak not to be exceeded, in Loudness mode. If the target required crossing it, the ceiling wins and the node announces that the target was not reached: it prefers saying so to clipping silently or slipping a limiter behind a button that only promises to normalise. Put a limiter upstream if you want both. |

#### Resonators

`resonateurs` · Processing → Equalisation and filters

*A bank of tuned resonators that any sound can set ringing: a noise becomes a chord, a scrape a bell.*

This node passes a sound through a bank of tuned resonators. Each resonator keeps only its own frequency from what it receives, and goes on ringing once it is no longer excited: the input sound takes on the bank's chord. A breath becomes a held chord, a rain of clicks a shimmering harmony, a scrape a bell. The principle is that of the Reson tool of GRM Tools and of Max's resonators~. The bank plays nothing by itself: the input sound sets it ringing, and what one hears depends as much on that sound as on how the resonators are tuned. Resonance is set in seconds, the way one thinks of it: the time a resonator takes to lose 60 dB once it is no longer excited. Short, the sound keeps its grain and takes on a colour; long, it fades behind the chord it set ringing. A tail of that length is added to the output, so the resonators can be heard dying away after the sound ends. The structure says where the resonators sit above the fundamental: harmonic (1, 2, 3...), odd (1, 3, 5..., the spectrum of a clarinet or a closed pipe), bar (1; 2.756; 5.404; 8.933..., the modes of a free bar, inharmonic, metallic), or chord, from the intervals written, repeated octave after octave. The fundamental can be driven by a curve: the resonances then glide, and the input sound follows them. The output level is brought back to that of the input.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Fundamental modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fundamental | slider | 110 Hz | 20 – 4000 Hz, step 1 | Frequency of the first resonator; the others follow from it through the structure. A resonator that would fall beyond half the sample rate is dropped, not folded back. |
| Structure | choice | Harmonic | Harmonic / Odd / Bar / Chord | Where the resonators sit above the fundamental. Harmonic: 1, 2, 3...; odd: 1, 3, 5...; bar: the inharmonic modes of a free bar; chord: the intervals written below. |
| Intervals | text | `0 4 7 11` |  | For the chord structure: the intervals in semitones above the fundamental, separated by spaces or commas. They repeat octave after octave up to the number of resonators. « 0 4 7 11 »: a major seventh chord; « 0 1 6 »: a tense cluster. |
| Count | slider | 12 | 1 – 32, step 1 | Number of resonators. |
| Resonance | slider | 3 s | 0.05 – 20 s, step 0.05 | Time a resonator takes to lose 60 dB. Short, the sound takes on a colour; long, it fades behind the chord. |
| Brightness | slider | 50 % | 0 – 100 %, step 1 | Level of the high resonators relative to the low ones. 100%: all at the same level; 0%: the k-th at 1/k², a dark sound. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Share of the resonated sound. At 0%, the input alone. |
| Fundamental min | slider | 55 Hz | 20 – 4000 Hz, step 1 | Fundamental that a connected curve's zero means. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing. |
| Fundamental max | slider | 440 Hz | 20 – 4000 Hz, step 1 | Fundamental that the curve's one means. |

#### Transient Shaper

`transient-shaper` · Processing → Equalisation and filters

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
| Attack time | number | 1 ms | 0.1 – 50 ms, step 0.1 | Transient detector reaction time. No effect while Attack and Sustain are both at 0 dB: the node then passes the sound through unchanged. |
| Sustain time | number | 100 ms | 10 – 500 ms, step 1 | Sustain detector reaction time. No effect while Attack and Sustain are both at 0 dB. |

#### Tuned Combs

`peignes-accordes` · Processing → Equalisation and filters

*Comb filters tuned to a note or a chord: the input sound rings like a string, at the note and all its harmonics.*

A comb filter sends the sound round a loop whose length is the period of a note: what comes back in phase is reinforced, and the filter rings at that note and all its harmonics, like a string. Each note of the chord is a comb; the input sound sets them vibrating. A noise becomes a bowed string, a percussion a struck string, a voice a choir of sympathetic strings. Resonance is set in seconds: the time a comb takes to lose 60 dB, the same for a low note and a high one. Damping dies away the high harmonics before the fundamental, as on a real string: at zero, the sound stays bright and metallic; high, it rounds off. The combs stay in tune whatever the damping. The chord is written in semitones above the fundamental: « 0 » for a single note, « 0 7 » for a fifth, « 0 4 7 » for a major triad. The fundamental can follow a curve: the whole chord then glides, and the strings with it. A tail as long as the resonance lets the combs die away; the output level is brought back to that of the input. After Julius O. Smith III, « Physical Audio Signal Processing », 2010, and the tuning of Karplus-Strong strings by David Jaffe and Julius O. Smith, Computer Music Journal 7(2), 1983.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Fundamental modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fundamental | slider | 110 Hz | 20 – 2000 Hz, step 0.5 | Note of the first comb; the others follow from it through the chord. |
| Chord | text | `0 7 12` |  | The notes, in semitones above the fundamental, separated by spaces or commas. « 0 »: a single note. |
| Resonance | slider | 3 s | 0.05 – 20 s, step 0.05 | Time a comb takes to lose 60 dB. |
| Damping | slider | 20 % | 0 – 95 %, step 1 | Loss of highs on each trip round the loop. 0: bright, metallic; high: round, muffled. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Share of the resonated sound. At 0%, the input alone. |
| Fundamental min | slider | 55 Hz | 20 – 2000 Hz, step 0.5 | Fundamental that a connected curve's zero means; the travel is multiplicative. With no curve, this setting does nothing. |
| Fundamental max | slider | 220 Hz | 20 – 2000 Hz, step 0.5 | Fundamental that the curve's one means. |

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

Describes an image's content in one sentence using Mozilla/distilvit (ViT + distilled GPT2, ~0.2B parameters, Apache 2.0 license). Runs in a Web Worker via Transformers.js, downloads and caches automatically on first use (~730 MB in fp32 — app-wide constraint, see readme « ONNX Models »). Adjust the max length of the generated caption. Captions are in English (model trained on English-language datasets).

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

### Instruments

| Component | Summary |
|---|---|
| [DDSP Tone Transfer](#ddsp-tone-transfer) | Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet). |
| [Drum Synth](#drum-synth) | Receives MIDI and plays it with percussion synthesizers (no SoundFont). |
| [MIDI Sampler](#midi-sampler) | Plays incoming MIDI notes with an audio sample loaded from the inspector. |
| [Modal Bar](#modal-bar) | Marimba, vibraphone, glockenspiel, tubular bell or bowl, by modal synthesis on published ratios. |
| [Multi-Zone Sampler](#multi-zone-sampler) | Plays MIDI with a keyboard bank: each note takes its nearest zone. |
| [Scanned Synthesis](#scanned-synthesis) | Reads the shape of a slowly moving mechanical object as a wavetable: the timbre evolves endlessly while the note stays in tune. |
| [Shakers](#shakers) | Shaken percussion — maracas, cabasa, tambourine, sleigh bells — from a stochastic particle model. |
| [Spread Across Keyboard](#spread-across-keyboard) | Turns one sound into a sample bank playable across the 88 keys, in zones. |
| [Sung Vowel (FOF)](#sung-vowel-fof) | Synthesises a vowel from its formants, after Peterson and Barney's table: pitch and timbre never touch. |
| [Wave Terrain](#wave-terrain) | Travels a surface z = f(x, y) along an orbit: the orbit makes the pitch, the relief makes the timbre. |
| [Wind Instrument](#wind-instrument) | Clarinet, flute or brass by waveguide: a bore, a reed, and the timbre that follows. |

#### DDSP Tone Transfer

`ddsp-tone-transfer` · Processing → Instruments

*Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet).*

Transfers the timbre of an audio clip to another instrument via DDSP (Differentiable Digital Signal Processing). The spice model extracts pitch and loudness from the input audio, then a pretrained DDSP model resynthesizes the signal with the chosen timbre (violin, flute, tenor saxophone, trumpet). Requires an Internet connection to download spice and the instrument model (~3-4 MB). Output is mono at 48 kHz.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instrument | choice | Violin | Violin / Flute / Tenor saxophone / Trumpet | Target instrument for the timbre transfer. The model downloads on first use (~3-4 MB). |
| Model URL | text | — |  | Custom URL of a DDSP checkpoint. If set, it overrides the selected instrument. |

#### Drum Synth

`drum-synth` · Processing → Instruments

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

#### MIDI Sampler

`sampler-midi` · Processing → Instruments

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

#### Modal Bar

`barre-modale` · Processing → Instruments

*Marimba, vibraphone, glockenspiel, tubular bell or bowl, by modal synthesis on published ratios.*

Definite-pitched percussion by modal synthesis. A bar does not vibrate like a string. A string has integer partials — 1, 2, 3, 4 — because it vibrates in one dimension under tension; a free bar vibrates in flexion, and its natural modes land on 1, then 2.756, then 5.404, then 8.933. Those non-integer ratios are a published acoustics result, and they are what give the glockenspiel its metallic colour. Instrument makers correct them deliberately: carving an arch under a marimba bar lowers its second mode to four times the first and its third towards ten, so the bar becomes harmonic, hence musical. The tubular bell goes further — its partials sit around 2, 3, 4.16 and 5.43, so the note one hears does not exist in the sound: it is a missing fundamental the ear reconstructs, and the node's spectrum indeed carries no trace of it. The Tibetan bowl owes its voice to two nearly coincident modes, at 1 and 1.02, whose spacing produces a slow beating. « Mallet hardness » is the setting that changes the timbre most, and for a physical reason: a hard mallet gives a short impulse, hence rich in highs, which wakes the upper modes, whereas a soft one wakes only the first. A mode whose frequency would exceed half the sampling rate is simply dropped rather than folded down into the bass where it would sound wrong. A MIDI file on the input turns each note into a mallet stroke, and the strokes overlap — which is what gives a vibraphone its halo.

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

#### Multi-Zone Sampler

`sampler-multizones` · Processing → Instruments

*Plays MIDI with a keyboard bank: each note takes its nearest zone.*

Plays a MIDI file with a keyboard bank — the one from « Spread Across Keyboard », the one from an « SFZ Bank » read from disk, or the drum kit shipped with Attic. Each note takes its nearest zone and is resampled only by the gap between them; the message reports the maximum shift encountered, and if it exceeds the zone width, the MIDI reaches outside the keyboard the bank covers. Velocity layers are played: if the bank has any, each note's velocity picks the recording, and the message says how many layers were used out of those available — a MIDI file whose velocities are all 100 will only ever wake one layer, and better to see it than to guess. With a kit, none of that applies: a key is a sound, nothing is transposed, and a key with no sound plays nothing — the message then counts the silent notes, which is the only way to see that a drum file asks for percussion the kit does not have. Four settings turn this node into an orchestra part, and they live here because Attic's mixer has no per-track setting. Pan: places the part in the stereo field, with a cosine law — a moved sound keeps the same perceived level when passing through the centre, where a linear pan would lose three decibels. Transpose: shifts incoming notes, useful for a bass written an octave too high; on a kit it changes instrument rather than pitch. Lowest key and highest key: notes outside are ignored and counted, which splits one MIDI file between two banks — a bass below C3, a piano above — without touching the file. The range applies to the written notes, before transposition: what you read on the score is what you bound. Sample rates are aligned: a zone recorded at 48 kHz played in a bank rendered at 44.1 came out 147 cents flat — a semitone and a half — which happens as soon as an SFZ library mixes two rates. The MIDI output passes the notes through unchanged, for chaining other nodes.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| input | Bank | bank |  |
| output | Audio | audio (stereo) |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Volume | slider | 80 % | 0 – 100 %, step 1 | Output level. Each note's velocity scales it. |
| Release | slider | 50 ms | 1 – 2000 ms, step 1 | Fade-out time after the key is released. Short, notes cut off; long, they overlap. |
| Loop crossfade | slider | 20 ms | 1 – 200 ms, step 1 | Length of the crossfade at the sustain loop's join. Too short, a click is heard on every turn; too long, the loop starts to breathe. |
| Pan | slider | 0 % | -100 – 100 %, step 1 | Places the part in the stereo field: −100 hard left, 0 centre, +100 hard right. This is what lets four instruments be spread apart without adding four spatialization nodes — the mixer itself has no per-track setting. The law is a cosine one: a moved sound keeps the same perceived level when passing through the centre, where a linear pan would lose three decibels. |
| Transpose | slider | 0  semitones | -24 – 24  semitones, step 1 | Shifts incoming notes before playing them, in semitones. Useful for a bass written an octave too high, or to align a bank whose root was not the expected one. On a kit it changes instrument rather than pitch — shifting by two plays the snare instead of the kick, which is rarely the intent. |
| Lowest key | slider | 0 | 0 – 127, step 1 | First note this bank plays. Notes below are ignored, and the message counts them. Together with « Highest key », this splits one MIDI file between two banks — a bass below C3, a piano above — without touching the file. |
| Highest key | slider | 127 | 0 – 127, step 1 | Last note this bank plays. Notes above are ignored. |

#### Scanned Synthesis

`synthese-scanning` · Processing → Instruments

*Reads the shape of a slowly moving mechanical object as a wavetable: the timbre evolves endlessly while the note stays in tune.*

Scanned synthesis, after Bill Verplank, Max Mathews and Rob Shaw (CCRMA, 2000). The idea is strange and fits in two sentences. A mechanical object is simulated — here a chain of masses joined by springs, closed into a ring — at a slow rate, a few hundred steps per second, so that its motion is on the scale of a gesture: a few hertz, like a string filmed in slow motion. Then the shape of that object is read, mass by mass, as a wavetable, at whatever audio frequency one wants to hear. The consequence is the whole point: pitch and timbre are entirely separate. The pitch depends only on the scanning speed, the waveform only on the mechanics, and it therefore evolves continuously, never repeating, while the note stays in tune. No ordinary wavetable oscillator does this, since its table is frozen — and one can check that here by setting the tension to zero: the chain freezes and an ordinary oscillator is exactly what comes back. Max Mathews, who wrote the first synthesis program in 1957, saw scanning as the culmination of his search for a living timbre without samples. Nothing sustains the motion: it is therefore the initial excitation that decides the whole sound, like the way a string is plucked, and « Plucked » gives displacement without velocity where « Struck » gives velocity without displacement. One implementation detail that was audible: the table is interpolated in time between two mechanical steps, without which it changed all at once and rang at the simulation rate — measured, an A 110 was dominated by a 1 kHz component that was nothing but that artefact.

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

#### Shakers

`secoueurs` · Processing → Instruments

*Shaken percussion — maracas, cabasa, tambourine, sleigh bells — from a stochastic particle model.*

Shaken percussion from a stochastic particle model. Perry Cook posed the problem the opposite way round to ordinary synthesis: for a maraca one could solve the motion of every seed in the gourd — and he did — but the result is too heavy and, above all, useless, because the ear does not hear trajectories, it hears a statistic. So from his simulations he kept only two numbers: the probability that a collision occurs at a given instant, and the rate at which the system's energy falls. That is PhISEM (« Physically Informed Stochastic Event Modeling », 1996-97), and it fits in fifteen lines. The model has three stages: energy rises with each shake and falls back, a collision occurs with a probability proportional to that energy and to the number of particles, and the burst of noise it deposits passes through resonators, which are the only thing that really tells one instrument from another. « Energy » therefore does not set the volume: the greater it is, the likelier the collisions, hence the denser the grain — it is a physical parameter, not a gain. « Particles » is the setting that turns a countable rattle into a continuous hiss: measured, the cabasa produces more than five times a maraca's collisions at equal energy, and that is all that separates them. A MIDI file on the input turns each note into a shake whose velocity becomes the energy. With a fixed seed the sound replays identically, which no real tambourine does and which a graph you re-run needs.

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

#### Spread Across Keyboard

`banque-clavier` · Processing → Instruments

*Turns one sound into a sample bank playable across the 88 keys, in zones.*

Turns one sound into a sample bank playable across the 88 keys. The problem, in figures: an 88-key keyboard runs from A0 (27.5 Hz) to C8 (4186 Hz), a ratio of 152 — seven octaves and a minor third. A sampler that resamples a single sound from a single reference note, as « MIDI Sampler » does, therefore reads between 0.105 and 16 times speed: a two-second sound lasts nineteen seconds at the bottom of the keyboard and a hundred and twenty-five milliseconds at the top, and a 5 ms attack becomes 48 ms of mush at the bottom and 0.3 ms of click at the top. That is the « chipmunk » effect, and no setting makes up for it. The solution separates two transpositions that are often confused. Building the bank: the sound is transposed to each root by a constant-duration method, since the intervals reach four octaves. Playing a note: the nearest zone is resampled by a few semitones only, which is exact in pitch by construction and changes duration by just 12 % at ±2. The zone rule comes from sample-library practice: do not resample by more than two or three semitones — the « minor third rule ». At ±2, eighteen or nineteen zones cover the 88 keys. One zone is always the sound itself: the root grid is anchored on the source note, so at least one zone undergoes no transposition at all — one line of code, a free gain. The source note is measured rather than declared: the pitch follower finds it, and it will be right. Three transposition methods are offered, and they are not equals: constant duration (phase vocoder), tape (resampling, the chipmunk effect when it is wanted), and attack preserved — the sound is split into sines, transients and noise, only the first two are transposed, and the transients are put back untouched, so the attack neither smears nor turns into a click. Key tracking shortens notes toward the treble, as every instrument does: a bass piano string rings for twenty seconds, a treble one for less than one. The sustain loop lets a held key sound beyond the sample; its join is crossfaded, failing which each turn would leave a click. The preview output plays each zone's root one after the other: enough to hear the bank without connecting a keyboard. Measured: over eight keys spread from A0 to A7, a note's duration varies by a factor below 2 — where a single sample would spread it by 152 — and the pitch lands within a third of a semitone of the requested note, verified by the pitch follower.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Bank | bank |  |
| output | Preview | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Source note | choice | Automatic | Automatic / Manual | In automatic mode the sound's pitch is measured by the pitch follower — no need to declare it, and it will be right. It is also what anchors the zone grid, so that at least one zone plays the sound with no transposition at all. |
| Manual note | slider | 60 | 21 – 108, step 1 | MIDI note matching the sound's pitch (60 = middle C). Only used in manual mode — useful for an inharmonic sound, whose pitch cannot be measured. |
| Zone width | slider | 2  semitones | 1 – 6  semitones, step 1 | By how many semitones a zone is resampled at most, either side of its root. This is the quality setting: sample-library practice does not exceed two or three semitones — the « minor third rule ». At ±2, eighteen or nineteen zones cover the 88 keys and a note's duration varies by only 12 % within a zone; at ±6, one zone per octave, and the seams are audible. |
| Transposition | choice | Constant duration | Constant duration / Tape / Attack preserved | How each zone is built. Constant duration: phase vocoder — pitch changes, duration stays, which is what intervals of up to four octaves require. Tape: resampling, like speeding up a tape — duration follows pitch, the « chipmunk » effect one usually wants to avoid, though sometimes it is the point. Attack preserved: the sound is first split into sines, transients and noise, only the first two are transposed, and the transients are put back untouched — the attack neither smears nor turns into a click. |
| Lowest key | slider | 21 | 21 – 108, step 1 | First key covered. 21 = A0, the lowest of an 88-key piano. |
| Highest key | slider | 108 | 21 – 108, step 1 | Last key covered. 108 = C8, the highest. |
| Key tracking | slider | 50 % | 0 – 100 %, step 1 | By how much a note shortens toward the treble. At 100 %, duration halves with every octave up, which is a piano's order of magnitude — a bass string rings for twenty seconds, a treble one for less than one. At 0 %, every key lasts as long, which sounds like a sampler rather than an instrument. |
| Sustain loop | choice | Yes | Yes / No | Places in each zone a loop replayed while the key is held: without it, a held note stops at the end of the sample. The join is crossfaded, failing which each turn would leave a click — the wave not returning to the same phase. |
| Loop start | slider | 50 % | 5 – 90 %, step 1 | Where the loop starts within the sample. After the attack, then: a loop enclosing it would repeat it on every turn. |

#### Sung Vowel (FOF)

`voyelle-fof` · Processing → Instruments

*Synthesises a vowel from its formants, after Peterson and Barney's table: pitch and timbre never touch.*

Sung vowel by formant synthesis. A vowel is not a waveform, it is a configuration of resonances: the vocal tract is a tube whose geometry the tongue and lips change, and that geometry places three or four bumps in the spectrum — the formants. They, and they alone, tell an A from an I; the pitch of the voice plays no part, which is exactly why the same vowel is recognisable sung low or high. Xavier Rodet proposed in 1984, with IRCAM's chant program, to synthesise this directly: instead of filtering a source, the formants' impulse responses are added. Each formant produces a burst — a sinusoid at its frequency under an envelope that rises fast and decays according to its bandwidth — and all these bursts are retriggered at every period of the fundamental; they overlap, and that overlap is what makes the continuous resonance. This is FOF, « Fonction d'Onde Formantique ». The consequence is the one wanted: changing the note does not move the formants, where transposing a voice sample carries them along and gives the famous « Chipmunk » effect. The « Tract size » control does precisely the opposite: it moves the formants without touching the note, which amounts to changing the singer's size. The frequencies used are Peterson and Barney's (1952), the most cited table in phonetics, measured on men's voices. « Jitter » is what stops the result sounding like an organ: a real voice is never exactly periodic, and a few thousandths of variation from one period to the next are enough to make it alive.

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

#### Wave Terrain

`terrain-onde` · Processing → Instruments

*Travels a surface z = f(x, y) along an orbit: the orbit makes the pitch, the relief makes the timbre.*

Wave terrain synthesis. A wavetable oscillator reads a one-dimensional curve; this one reads a two-dimensional one: a surface z = f(x, y), travelled by an orbit that wanders over it, the sound being the terrain's altitude under the orbit. The idea dates from the 1970s (Bischoff, Gold, Horton; Mitsuhashi, 1982) and Curtis Roads gives the reference account in « The Computer Music Tutorial ». The roles are separate: the orbit decides the period, hence the pitch; the terrain decides the waveform, hence the timbre. Widening the orbit over rugged terrain changes the whole spectrum without touching the note, and a drifting orbit evolves the timbre indefinitely. Two consequences surprise, and both are geometry rather than defects. The terrain's symmetry multiplies the frequency: on a saddle z = x² − y², one turn of the orbit passes twice over the same relief, so one hears the octave above the rotation speed — the node verifies this, the half-period repeating there where on the classic terrain it does not. And a terrain of concentric circles is constant along a centred circle: it then gives no sound at all, and the orbit's centre must be offset to hear it. The « Classic » terrain is the one Mitsuhashi gives as an example and the whole literature reuses; it is hollowed along the lines x = ±1 and y = ±1, and along the diagonal too, so its relief is very uneven from area to area — hence the importance of the radius and the centre.

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
| Radius | number | 80 % | 0 – 300 %, step 1 | Size of the orbit: this is the timbre control. A small orbit stays in a flat area and gives a poor sound, a large one explores the relief and gives a rich one — without changing the note. |
| Flattening | number | 50 % | 10 – 100 %, step 1 | Flattening of the ellipse on the y axis. |
| X ratio | number | 3 | 1 – 8, step 1 | Lissajous orbit frequency on the x axis. |
| Y ratio | number | 2 | 1 – 8, step 1 | Lissajous orbit frequency on the y axis. |
| Drift | number | 0 % | -100 – 100 %, step 1 | Variation of the radius over the sound's duration. The timbre then evolves continuously without the note moving. |
| Centre X | number | 0 % | -200 – 200 %, step 1 | Offsets the orbit on the x axis, hence the area of relief explored. |
| Centre Y | number | 0 % | -200 – 200 %, step 1 | Offsets the orbit on the y axis. |
| Duration | number | 3 s | 0.2 – 20 s, step 0.1 | Duration produced, when no MIDI is connected. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Wind Instrument

`vent-guide-onde` · Processing → Instruments

*Clarinet, flute or brass by waveguide: a bore, a reed, and the timbre that follows.*

Clarinet, flute or brass by digital waveguide. A wind instrument is not an oscillator with a filter on it: it is a bore in which a pressure wave travels back and forth, and a reed — or an air jet — that decides, at each return, what it lets through. Julius Smith showed in the 1980s that a single looped delay line with a nonlinearity at its input was enough to simulate this; Perry Cook drew the Synthesis ToolKit instruments from it, which this node follows. The point is not cheap computation but behaviour: the sound takes time to settle, the instrument refuses to speak if blown too gently, and the timbre changes with dynamics instead of only the volume. None of that is programmed as an effect; it all falls out of the model. The clarinet's bore is closed at one end, which inverts the reflection and lets only odd harmonics live: measured, the even ones weigh 0.4 % of the odd, and that is its whole hollow colour. Below 40 % pressure its reed does not start and only breath noise comes out — a real reed's behaviour, not a defect of the node. The flute is nearly sinusoidal, the wind poorest in harmonics. The brass brightens markedly when blown hard, because the wave steepens as it travels: measured, its spectral centre of gravity moves from 1020 to 3393 Hz between 20 % and 100 % pressure. Two corrections were found by measurement and are worth stating, because they explain what the node does: the loss filter's delay is compensated, without which the clarinet gave 218 Hz for 220 asked; and the flute's and brass's bore is primed at the target note, without which the model picked its own partial and an A 440 could come out at 164 Hz — exactly a beginner's problem, embouchure not yet formed. One accepted limit: the flute model only holds its pitch above 85 % pressure, so its pressure setting is remapped into that range and acts on dynamics only.

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

### Logistic

| Component | Summary |
|---|---|
| [Logistic auto-pan](#logistic-auto-pan) | Left-to-right sweep following a logistic curve. |
| [Logistic chopper](#logistic-chopper) | Rhythmic gate whose depth grows following a logistic curve. |
| [Logistic echo](#logistic-echo) | Echo whose feedback grows following a logistic curve. |
| [Logistic Mixer](#logistic-mixer) | Mixes two tracks with a logistic transition: the first fades out while the second fades in. |
| [Logistic Paulstretch](#logistic-paulstretch) | Extreme time-stretch that grows in progressively. |
| [Logistic tremolo](#logistic-tremolo) | Tremolo whose depth grows following a logistic curve. |
| [Logistic vibrato](#logistic-vibrato) | Vibrato whose depth grows following a logistic curve. |

#### Logistic auto-pan

`auto-pan-logistique` · Processing → Logistic

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

`chopper-logistique` · Processing → Logistic

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

`echo-logistique` · Processing → Logistic

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

#### Logistic Mixer

`melangeur-logistique` · Processing → Logistic

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

#### Logistic Paulstretch

`paulstretch-logistique` · Processing → Logistic

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the phase randomization. The default is fixed: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character. |

#### Logistic tremolo

`tremolo-logistique` · Processing → Logistic

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

`vibrato-logistique` · Processing → Logistic

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

### MIDI patterns

| Component | Summary |
|---|---|
| [Impose Rhythm](#impose-rhythm) | Applies one MIDI file's rhythmic grid to another's pitches. |
| [Markov Chain](#markov-chain) | Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight. |
| [MIDI Arpeggiator](#midi-arpeggiator) | Arpeggiates chords from a MIDI file according to a pattern and direction. |
| [Thin Out](#thin-out) | Removes a share of the notes at random, reproducibly. |

#### Impose Rhythm

`motif-imposer-rythme` · Processing → MIDI patterns

*Applies one MIDI file's rhythmic grid to another's pitches.*

Separates pitch from rhythm, then marries them again. The first input supplies a sequence of pitches — a melody, a chord progression — the second a grid of onsets, and each onset takes the next pitch from the sequence, which cycles when the grid is longer. This is the operation TidalCycles calls « struct », and it is what makes « Euclidean Rhythm » composable: a Cuban tresillo becomes the grid for a chord sequence, without writing a single onset by hand. What comes from which side is explicit: Pitches contribute pitches only, the grid contributes onsets, durations and velocities — hence the accentuation. A chord on the Pitches input is struck whole on one onset, not spelled out. The grid governs the length of the result: it never repeats by itself, whereas the pitches replay from the start as many times as needed. The output channel is the pitches' one, so the grid can be taken from a drum track without the result coming out as percussion.

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

#### Markov Chain

`markov-midi` · Processing → MIDI patterns

*Learns a MIDI file's note transitions and generates new ones, with the transition table in plain sight.*

Learns a MIDI file's note transitions, then generates new ones. Attic can already continue a melody with a neural network (Magenta); it lacked the simple procedure, the one you can read: count how many times each note follows another, then replay by drawing at random according to those counts. The text output gives the table, context by context, in note names and percentages. « Order » is the setting that matters: it is how many notes are looked back on. At 1, the piece comes out in its key but without phrasing; at 2 or 3, its turns of phrase reappear; beyond that, the chain has no choice left and copies the source. The share of contexts with « no choice », shown at the head of the report, measures exactly that overfitting: above 80%, lower the order. Two simplifications, stated rather than hidden: the source's durations are not learned — the node imitates pitches only and plays them as eighth notes — and a chord is read from the bottom up, hence as an arpeggio. When the chain meets a transition never seen, it restarts from a known context instead of stopping. With a fixed seed, the same sequence is replayed identically.

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

`arpegiateur-midi` · Processing → MIDI patterns

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

#### Thin Out

`motif-eclaircir` · Processing → MIDI patterns

*Removes a share of the notes at random, reproducibly.*

Removes a share of the notes at random, but reproducibly. This is live-coding's « degrade », and it serves to lighten an over-dense texture without choosing the notes to sacrifice oneself — a loop of sixteen sixteenths played at 70 % becomes an irregular figure that keeps its shape. Two precautions set it apart from a plain draw. The draw is per event, not per note: a chord leaves whole or stays whole, thinning must not undo the harmony. And « Keep beats » spares whatever lands on a beat, because a texture thinned purely at random loses its pulse: one usually wants it lighter, not dissolved. « Beat length » says what counts as a beat, in seconds — at 120 BPM, a quarter note is 0.5 s. With a fixed seed, the same thinning replays identically: a result found pleasing can be found again, which is why the randomly drawn seed is shown in the message so it can be copied back.

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

### Order and inversions

| Component | Summary |
|---|---|
| [Brassage](#brassage) | A single segment engine: stretching, transposition, granulation and scrambling are four settings of the same gesture. |
| [Inversion Mirror](#inversion-mirror) | Flips the spectrum around a pivot frequency: lows become highs and highs become lows. |
| [Inversions and Voicings](#inversions-and-voicings) | Inverts, spreads and chains a MIDI file's chords while moving as few voices as possible. |
| [Negative Harmony](#negative-harmony) | Reflects pitches around the tonic-dominant axis: C major becomes C minor, G7 becomes F minor 6. |
| [Ply and Rotate](#ply-and-rotate) | Repeats each note within its own duration, and shifts the pitches along the grid. |
| [Polarity Inversion](#polarity-inversion) | Flips the sign of every sample. Inaudible on its own, decisive in relation. |
| [Random Slice](#random-slice) | Slices a track into equal parts and rearranges them (random, original or reverse order). |
| [Retrograde and Palindrome](#retrograde-and-palindrome) | Plays a pattern backwards, or there and back. |
| [Reverse Playback](#reverse-playback) | Plays the track from end to start. |
| [Serial Operations](#serial-operations) | Plays a row's four forms — original, retrograde, inversion, retrograde inversion — and writes its matrix. |
| [Wavesets (Wishart)](#wavesets-wishart) | Cuts the sound at zero crossings and replays the segments differently. |

#### Brassage

`brassage` · Processing → Order and inversions

*A single segment engine: stretching, transposition, granulation and scrambling are four settings of the same gesture.*

After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `brassage` family. Wishart kept the French word as it stands. This is not one more granulator. Attic already cuts into grains — granular freeze loops a grain, random slice shuffles slices, mosaicing replaces each grain with another sound's. Each does one thing. Brassage is the opposite: a single mechanism, reading segments and gluing them back, whose four settings give four transformations one takes to be distinct. Speed alone stretches or compresses, without touching pitch. Transposition alone changes pitch, without touching duration. Density and segment size move from a sparse cloud to a continuous wall. Strong position scatter shuffles the source, and the order of things is lost. Making it one node rather than four is not a saving in code: it is what makes visible that they are the same gesture. One moves from one to the other by dragging a slider, and hears the path between them — which no chain of four separate nodes shows.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Segment | slider | 0.05 s | 0.002 – 0.5 s, step 0.002 | Length of one segment. Short, one hears grains; long, one hears recognisable pieces of sound. The turn comes around 50 milliseconds, where the ear stops telling events apart and starts hearing a material. |
| Density | slider | 40 /s | 1 – 400 /s, step 1 | Segments started per second. Beyond the inverse of the segment length they overlap and the sound becomes continuous; below it there are gaps, and one hears a cloud. |
| Speed | slider | 1 x | 0.01 – 4 x, step 0.01 | Ratio between the output's time and the source's. At 1, the source is traversed at its own pace. At 0.5, two seconds of output are needed to cover one second of source: this is the stretch, and pitch is not affected. Bounded at one hundredth, without which the output would demand tens of gigabytes. |
| Transposition | slider | 0 semitones | -24 – 24 semitones, step 1 | Pitch of the segments. It does not touch the read position: it changes the rate at which each segment is replayed. That is what makes it independent of speed — which a tape player cannot do. |
| Scatter | slider | 0 s | 0 – 2 s, step 0.01 | Largest random offset on the read position. At zero the segments follow one another in order. High, they come from anywhere in the source, and the order of things is lost. For sound to travel from a distant place, the scatter must exceed the distance to cover. |
| Pitch scatter | slider | 0 semitones | 0 – 24 semitones, step 0.5 | Largest random offset on each segment's transposition. A few semitones give a shimmer; an octave gives a cloud with no pitch. |
| Seed | slider | 1 | 0 – 999999, step 1 | Seed of the draw. The same seed replays exactly the same brassage — useful to find again a result one liked. With no scatter it does nothing: nothing is drawn at random. |

#### Inversion Mirror

`miroir-inversion` · Processing → Order and inversions

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

`voicings-accords` · Processing → Order and inversions

*Inverts, spreads and chains a MIDI file's chords while moving as few voices as possible.*

Inverts, spreads and chains a MIDI file's chords. Attic has always built chords the same way: root, third, fifth, seventh, bottom to top, packed inside one octave — the heaviest position there is, the one no pianist plays and no arranger writes. This node does what one does by hand. « Inversion » moves the bottom notes above, one at a time, without changing the chord — only who carries it; pushed as far as the note count, it leaves the chord unchanged rather than driving the music ever upwards. « Voicing » spreads the voices: « Open » raises every other note by an octave, and the « drop » voicings lower the second or third voice from the top by an octave, which hollows the chord in the middle and gives it the sound of jazz guitar and four-part brass — it needs at least four notes, and without them the chord comes out unchanged. « Voice leading » is the setting one hears most. Between C major and F major there is a version that moves all three voices by several tones and one that moves a single voice by a semitone; the latter sounds like a harmony moving forward, the former like two unrelated chords. So the node looks, for each chord, for the register that moves the fewest voices from the previous one — by whole octaves only, so that the voicing chosen above is kept exactly. The first chord is never moved: it is the one that sets the register. The search is greedy, with no going back on past choices: a global search would sometimes do better by a semitone, at exponential cost and for a result one would not hear.

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

#### Negative Harmony

`harmonie-negative` · Processing → Order and inversions

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

#### Ply and Rotate

`motif-repeter-tourner` · Processing → Order and inversions

*Repeats each note within its own duration, and shifts the pitches along the grid.*

Two operations on one pattern, which do not touch the same thing. Repeat subdivides each event's duration into equal parts and replays the same pitch in each — live-coding's « ply »: the rhythmic grid does not move, it fills up. A quarter note repeated four times becomes four sixteenths on the same pitch, and the other notes' onsets stay exactly where they were. Rotate shifts the pitch sequence along the grid without touching the onsets: the rhythm stays put, the melody slides. A rotation of 1 on C-D-E gives D-E-C at the same instants. This is « iter », and on a loop it makes the same material heard from another starting point. The two apply in that order, which means the rotation acts on the already densified pattern: two notes repeated twice make four steps, so rotating by one step shifts by half a step of the original pattern. A negative rotation turns the other way, and a rotation larger than the pattern wraps. Chords are repeated whole.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Repeats | number | 2 | 1 – 16, step 1 | How many times each event is played inside its original duration. The grid does not move: it fills up. 1 = no repetition. |
| Rotation | number | 0 | -32 – 32, step 1 | Shifts the pitch sequence along the rhythmic grid without touching the onsets: the rhythm stays, the melody slides. The rotation applies after the repeats, hence on the densified pattern. |
| Tempo | number | 120 BPM | 40 – 300 BPM, step 1 | Tempo written into the produced MIDI file. The durations themselves are in seconds and do not change. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. No effect on a percussion track, which always goes through the drum synthesis. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume. |

#### Polarity Inversion

`inversion-polarite` · Processing → Order and inversions

*Flips the sign of every sample. Inaudible on its own, decisive in relation.*

Flips the sign of every sample. On its own the operation cannot be heard: the ear is insensitive to the absolute polarity of a sound, which is why it can seem useless. It works only in relation, and three uses make it indispensable. The null test first: add a sound and its inverted polarity in the mixer, and nothing remains. That silence is the surest proof that two files are identical — if something remains, it is exactly what differs, and you can listen to it. Two-microphone takes next: a microphone under a snare receives the head moving away when the one above receives it moving closer, so their sum hollows out; flipping one of the two gives the hit back. Mono compatibility last: flipping every other channel empties the mono sum, and it is the quickest way to check that a goniometer is telling the truth. Not to be confused with « Reverse Playback », which inverts time rather than sign.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Random Slice

`decoupe-aleatoire` · Processing → Order and inversions

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

#### Retrograde and Palindrome

`motif-retrograde` · Processing → Order and inversions

*Plays a pattern backwards, or there and back.*

Plays the pattern backwards, or there and back. The retrograde is a counterpoint operation as old as the canon, and its definition is precise: the order of the notes is reversed, not the notes themselves. Durations are therefore kept exactly, and the consequence is audible — a figure that ended on a long held note now opens with it. Time is turned around the pattern's own span, so the pattern does not move. « There and back » puts the pattern then its retrograde one after the other: that is the palindrome, the figure Machaut was already writing and that live-coding calls `palindrome`. « Back and there » starts with the retrograde, which makes the original pattern sound like a resolution rather than a departure. « Repeat the hinge » decides what becomes of the turning event, and the choice is offered because both stand up: C-D-E followed by its retrograde gives C-D-E-E-D-C, where the E is played twice and marks the pivot clearly; the palindrome one writes in music is C-D-E-D-C, with a single E at the top, and it flows. With the hinge dropped, the join is exact: no gap and no overlap. Chords stay struck whole on either side, and a single note is returned as is, being its own palindrome.

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

#### Reverse Playback

`inverseur-audio` · Processing → Order and inversions

*Plays the track from end to start.*

Reverses the signal in time: the track plays from end to start. Not to be confused with polarity inversion, which flips the sign of the samples without touching the order of time — this node used to be called « Audio Inverter » and summarised as « inverts the signal », which means polarity everywhere else in the craft.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

#### Serial Operations

`serie-dodecaphonique` · Processing → Order and inversions

*Plays a row's four forms — original, retrograde, inversion, retrograde inversion — and writes its matrix.*

Plays a row's four forms and writes its matrix. Twelve-tone writing is a calculating technique before it is an aesthetic: a row of the twelve pitches, and four transformations — original, retrograde, inversion, retrograde inversion — each transposable onto twelve levels, so forty-eight forms drawn from a single material. Schoenberg, Webern and Berg wrote them out by hand in a twelve-by-twelve grid; that grid is what the text output gives, labelled P and I, with the retrogrades read backwards. It can be checked at a glance the way it was taught: the first row is the series, the first column its inversion, and the diagonal never changes. None of this is reserved for serialism — retrograding and inverting a motif are counterpoint operations as old as the canon, and the node accepts a sequence of any length. It merely states, in passing, whether what it was given is a real row: twelve distinct classes. « Register » decides how the resulting classes are played: « Closest » takes for each note the octave nearest the previous one, and one hears a line — which is how a row is actually played, the octaves being free; « One octave » stacks everything above the starting note, and one hears the order of the classes. The default row is that of Berg's Violin Concerto, built from alternating thirds that make it almost tonal.

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

#### Wavesets (Wishart)

`wavesets-wishart` · Processing → Order and inversions

*Cuts the sound at zero crossings and replays the segments differently.*

After Trevor Wishart's "Audible Design" (1994). The sound is cut not into fixed-length slices — what granulation does — but at zero crossings: each segment holds one pseudo-period, whose length therefore follows the pitch of the sound rather than an external clock. That is the whole difference: granulation imposes its grid and produces artefacts unrelated to the material, where wavesets hug the waveform. Repeating segments lowers the pitch without touching each one's timbre; omitting them punches holes correlated with the sound's own periodicity. And since segments start and end at zero, they can be cut, reordered or discarded without ever producing a click — the property that makes the whole family possible. Note: on inharmonic or noisy material the segmentation becomes erratic, because zero crossings no longer correspond to any periodicity. That is a limit of the process, and one Wishart deliberately exploits.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Repeat | Repeat / Omit / Reverse / Shuffle / Level | "Repeat" plays each segment several times: the pitch drops and the sound lengthens accordingly. "Omit" silences some without shortening the sound. "Reverse" plays each segment backwards: same duration and energy, altered timbre. "Shuffle" reorders segments in groups. "Level" brings every segment to the same level, flattening all dynamics. |
| Factor | number | 2 | 1 – 16, step 1 | Number of repeats, omission step (1 segment kept out of N), or shuffled group size. No effect on Reverse and Level. |
| Seed | number | 1 | 1 – 9999, step 1 | Shuffle seed: same seed, same result. No effect on the other operations. |

### Other effects

| Component | Summary |
|---|---|
| [Cantor Dust](#cantor-dust) | Hollows the sound by removing the middle third of each piece, level after level: a fractal silence. |
| [Corpus Mosaicing](#corpus-mosaicing) | Rebuilds one sound from another's grains: the target's shape, the corpus's material. |
| [Ecosystem (Di Scipio)](#ecosystem-di-scipio) | A system that listens to itself, sets its own density and grains from what it hears, and seeks its own balance. You do not set the result, you set the coupling. |
| [Feature Follower](#feature-follower) | Extracts a feature from a sound — energy, brightness, flatness, flux — to drive an effect with it. |
| [Granular Freeze](#granular-freeze) | Loops a grain with size and pitch control. |
| [Lucier Room](#lucier-room) | Feeds the sound back into the same room until only its resonances remain. |
| [Particles](#particles) | One generator for seven species of particle: grains, pulsars, glissons, trainlets, grainlets, and the granulation of a connected sound — on a grid, or locked to its period. |
| [Sample Formula](#sample-formula) | Applies a mathematical expression to each sample of the signal. |
| [Sonic Seasoning](#sonic-seasoning) | Moves a sound toward the musical region of a taste — sweet, sour, bitter or salty — and says how far it moved. |
| [Statistical Texture](#statistical-texture) | Generates a new texture with the statistics of a given sound — rain, fire, crowd — without copying a single sample of it. |

#### Cantor Dust

`poussiere-cantor` · Processing → Other effects

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

#### Corpus Mosaicing

`mosaiquage` · Processing → Other effects

*Rebuilds one sound from another's grains: the target's shape, the corpus's material.*

Audio mosaicing, or corpus-based concatenative synthesis. The principle is a mosaic's: a corpus — any sound, a sample collection, a whole record — is cut into small grains, each described by a few numbers, the grains of a target sound are described the same way, and each target grain is replaced by the corpus grain that most resembles it. The result has the target's shape and the corpus's material: a spoken phrase played with piano strings, a drum track rebuilt from door noises. This is the method Diemo Schwarz formalised at IRCAM (CataRT, 2006). Attic already had all the pieces without the assembly — descriptors, an audio similarity, samplers: this node does the matching, which is what was missing. Three descriptors are used, deliberately legible so that one can say why a grain was chosen: loudness, the spectral centre of gravity, and the zero-crossing rate that tells a noisy sound from a steady one. They are normalised before comparison, without which the distance would see only the centre of gravity, counted in thousands where the others are below one. « Avoid repeats » deals with the method's most audible defect: too poor a corpus returns the same grain a hundred times, which sounds like a drone — and the output report says so plainly when it happens. « Grain size » is the main trade-off: short grains follow the target closely but lose the corpus's character; long ones make the corpus recognisable but the target barely shows. The joining uses windows overlapping by half, whose sum is exactly one: a corpus identical to the target therefore rebuilds it to better than 2 %, which the node verifies in test.

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

#### Ecosystem (Di Scipio)

`ecosysteme` · Processing → Other effects

*A system that listens to itself, sets its own density and grains from what it hears, and seeks its own balance. You do not set the result, you set the coupling.*

After Agostino Di Scipio, « "Sound is the interface": from interactive to ecosystemic signal processing », Organised Sound 8(3), 2003, and the « Audible Ecosystemics » series (2003-2005); the nonlinear engine comes from « Iterated Nonlinear Functions as a Sound-Generating Engine », Leonardo 34(3), 2001. Last of the paths surveyed in the literature of the grain. This node is not set like the others, and that is its whole point. Everywhere else in the catalog you set an effect and the effect obeys: a density, a threshold, a duration. Here nobody sets the result. You set the coupling — the strength with which the system hears itself — and everything else is decided by the system, from what it measures of its own voice and of the world you give it. The density of the grains, their duration, the place in the past it fetches them from: all of that comes out of the loop, never out of the sliders. This is what Di Scipio calls making sound the interface. The loop lives entirely inside the node, because the Attic graph is acyclic and a node cannot feed back into itself. That is a good thing — a cyclic graph would have no execution order — and it is faithful besides: Di Scipio's devices are closed loops, one single apparatus listening to itself. It is not a compressor, and that can be measured. A compressor too brings a level back to a target. The difference is that observation here does not command a volume but the very shape of the synthesis. Give the system two worlds of rigorously equal level, one of which moves and one of which does not: both outputs come out at the same level, and the two textures have nothing in common. Measured, a calm world gives 24 grains per second of 82 ms, an agitated one 51 grains of 39 ms. A compressor stops at volume; the system changes behaviour. The sound comes from the loop, not from the input. Stop the world after one second and listen to the seven that follow: at zero coupling nothing at all is left, and the level of what remains rises with the coupling, with no gap and no reversal. The node does not granulate its input, it lives from it. The regime cannot be read from the level, and the log is there for that. The homeostat almost always brings the level back to its target: a system holding itself easily and a system at the end of its strength sound at the same volume. What separates them is what it cost, and that is read on the drive curve. Drive pinned at the ceiling, the coupling is too weak and you hear the world barely granulated. Drive at the floor, the system would run away if allowed and the homeostat is merely holding it back: that is where the liveliest textures are found. In between, it holds, or it swings. The background noise, inaudible a hundred decibels below the target, is not a contrivance. Without it zero would be an absorbing state: let the memory vanish once, and no amount of drive could ever amplify exact silence again. Di Scipio makes that noise the starting point of his « Background Noise Study »; it plays the same part here. At equal seed the system returns the same sound twice — without which none of the above would be verifiable. At a different seed it returns two sounds that resemble each other in no sample and in every statistic: it is not an object, it is an instance.

| Port | Name | Type | |
|---|---|---|---|
| input | World | audio |  |
| output | Audio | audio |  |
| output | Log | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Coupling | slider | 0.8 | 0 – 3, step 0.05 | The strength with which the system hears itself, and the only setting that really matters. At zero it hears only the world and does not survive its silence. Weak, the drive pins itself to the ceiling without ever reaching the target: you hear the world barely granulated. Around one, the system carries itself and the homeostat spends its time holding it back — that is where the liveliest textures are found. The log says which regime the setting led you to, which no number read here can predict. |
| Balance point | slider | -20 dB | -40 – -6 dB, step 1 | The level the system seeks to hold for its own voice, not for the whole room. The distinction is no subtlety: a system regulating on what it hears would be condemned to silence as soon as the world were louder than the target, the error staying negative whatever it did. |
| Reactivity | slider | 0.5 | 0 – 1, step 0.05 | How fast the homeostat corrects its error. Slow, the system overshoots its target then takes seconds to come back, in a swing you hear very clearly. Quick, it holds its level closely and leaves less life to the texture. At zero it no longer corrects anything, and the coupling alone decides everything. |
| Memory | slider | 1.5 s | 0.05 – 8 s, step 0.05 | How deep into the past the grains are drawn from. The system mixes its own voice and the world in there, and chooses the distance itself: agitated, it draws near the present and the sound tightens; calm, it reaches far back and you hear forgotten things return. |
| Maximum density | slider | 120 /s | 5 – 400 /s, step 5 | The ceiling of grains per second, which the system reaches when it judges itself very agitated. It never stays there long: the density it actually uses is reported in the log, and it is that one which says what it made of the world it was given. |
| Duration | slider | 15 s | 1 – 120 s, step 1 | The output duration, independent of the world's. This is where the node parts company with an effect: ask for thirty seconds on a one-second input, and listen to what the system becomes once the world has gone. |
| Homeostat | choice | Connected | Connected / Disconnected | The node's control, and it is made to be disconnected. The same loop, the same grains, the same memory, without the regulation: the system then follows the world's volume instead of holding its own. Measured, three worlds thirty-four decibels apart give three outputs 1.13 dB apart with the homeostat, and 33.19 dB apart without it. |
| Seed | slider | 7 | 1 – 9999, step 1 | Two seeds give two sounds that resemble each other in no sample and in every statistic — same levels, same densities. What the node returns is not an object but an instance, and the seed serves to find again exactly the one you had liked. |

#### Feature Follower

`suiveur-caracteristique` · Processing → Other effects

*Extracts a feature from a sound — energy, brightness, flatness, flux — to drive an effect with it.*

Extracts a feature from a sound to drive an effect with it. After Vincent Verfaille, Udo Zolzer and Daniel Arfib, « Adaptive Digital Audio Effects (A-DAFx): A New Class of Sound Transformations », IEEE Transactions on Audio, Speech and Language Processing 14(5), 2006, and « Implementation Strategies for Adaptive Digital Audio Effects », DAFx-02. Their idea is that an effect becomes something else when its setting stops being a fixed number and becomes a feature of the sound itself: brightness opening its own filter, energy lengthening its own delay. No Attic node could do this. The four features say different things and do not replace one another. Energy follows the player's gesture, and is the most immediate. Brightness — the spectrum's centre of gravity — follows timbre: it rises as the sound gets harsh, even at constant volume. Flatness tells a note from a noise, zero for a sine and one for white noise: it serves to treat breath and notes differently. Flux marks attacks and falls back during sustains. Inertia deserves a word: without it, an energy curve makes the parameter jump at every attack and the result chatters. The smoothing runs forwards then backwards, never one way only — a one-way smoothing would delay the curve relative to the sound that produced it, and the filter would open after the note instead of with it. The node also passes the audio through unchanged, so it slots into a chain without cutting it. A curve always carries values between zero and one: the consumer decides what zero and one mean at its end, through its « Modulation min » and « Modulation max » settings.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Curve | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Feature | choice | Energy | Energy / Brightness / Flatness / Flux | What is followed, and the four say different things. Energy follows the player's gesture. Brightness — the spectrum's centre of gravity — follows timbre and rises as the sound gets harsh. Flatness tells a note from a noise: zero for a sine, one for white noise. Flux marks attacks and falls back during sustains. |
| Inertia | slider | 70 % | 0 – 99 %, step 1 | Smoothing of the curve. Without it, an energy curve makes the parameter jump at every attack. The smoothing runs forwards then backwards so that it does not delay the curve: without that care, the filter would open after the note instead of with it. |
| Rate | slider | 200 /s | 20 – 1000 /s, step 10 | Values per second. High, the curve follows every twitch; low, it keeps only the overall gesture. The rate need not match the sound's: the effect interpolates. |

#### Granular Freeze

`granular-freeze` · Processing → Other effects

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

#### Lucier Room

`piece-lucier` · Processing → Other effects

*Feeds the sound back into the same room until only its resonances remain.*

After Alvin Lucier's "I Am Sitting in a Room" (1969), whose principle fits in one sentence: record a voice in a room, play the recording back into that same room, re-record, and repeat. With each pass the frequencies the room favours are reinforced and those it absorbs fade further; after a few dozen passes no speech is left, only the room's resonant modes turned into a sustained chord. This is not a very wet reverb: a space is a filter, and applying it many times does not give "more of the same" — it turns the filter into the sound. The decisive parameter is therefore the iteration count: below 5 you hear colouring, around 15-20 the source becomes unrecognisable, past 30 only the room remains. The other settings describe the space, exactly as on the convolution reverb node. Note: the pre-delay accumulates from pass to pass and progressively pushes the sound later; that is expected behaviour, not a fault.

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
| Pre-delay | number | 10 ms | 0 – 200 ms, step 1 | Delay before the first reflections. It accumulates from pass to pass: a high value combined with many iterations pushes the sound later, possibly out of the frame. |
| Damping | number | 30 % | 0 – 100 %, step 1 | Absorption of highs by air and materials. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the room. It deserves to be fixed here more than anywhere else: the room is the subject of the piece, and twenty passes through a different room each time would never give the same result twice. Changing it means recording in another room. |

#### Particles

`particules` · Processing → Other effects

*One generator for seven species of particle: grains, pulsars, glissons, trainlets, grainlets, and the granulation of a connected sound — on a grid, or locked to its period.*

After Oyvind Brandtsegg, Sigurd Saue and Thom Johansen, « Particle synthesis — a unified model for granular synthesis », Linux Audio Conference, 2011 — Csound's `partikkel` opcode. The paper's thesis: the varieties of granular synthesis are not distinct techniques but one generator set differently. This node exposes seven of them, and a single choice moves from one to the next. Grains are the ordinary case: a brief waveform, repeated at a rate. The rate gives the pitch heard as soon as it passes some twenty per second; below that, grains can be counted. Pulsars decouple two durations, and therein lies their point. For them the grain duration counts in cycles of the waveform instead of following the rate: the rate then sets the fundamental, and the frequency sets the formant, independently of each other. No acoustic instrument allows this. Glissons give each grain its own frequency trajectory: the grain is no longer a point but a vector. The transposition setting says how far it rises or falls during its brief existence. Trainlets replace the waveform with a band-limited impulse train, whose number of partials is set. They sound like clicks that have a pitch — measured, at twelve partials they carry close to 27 % of their energy above four kilohertz, against two tenths of a percent for a sine grain, and their crest factor rises from 6 to 16 decibels. Grainlets tie two settings to one another, which is their whole definition. Frequency travels the interval given by the transposition across the note, and grain duration follows it: each grain then carries the same number of cycles, high ones short and low ones long, as a wavelet does. Without that link, a two-octave sweep would leave the low grains at four cycles and the high ones at sixteen, and the grain would be heard changing nature on the way. It is the quietest of the seven species: it does not make a new timbre, it stops a timbre from drifting. Granulation takes the sound connected to the input and reads it in grains. That is where position and speed serve: at zero speed the read head stops moving and you get a granular freeze; at one half the sound lasts twice as long without changing pitch; negative, it reads backwards. With no sound connected the species falls back to grains and the node says so rather than failing. Pitch-synchronous granulation locks the grains to the sound's period instead of a regular grid, and that is what separates a clean granulation from one that buzzes. A grid imposes its own rate on the sound: measured on a 220 hertz sawtooth, granulating at sixty grains per second leaves no sustained pitch at all, and at a hundred and fifty the measured pitch drops to 73 hertz — the grid's, not the sound's. Locked to the period, the same granulation returns 220.14 hertz, the original pitch to within three hundredths of a hertz. The period is read by the catalog's pYIN follower, the very one the « Pitch Follower » shows: the two nodes cannot contradict each other. In this species, density and dispersion command nothing, since the sound gives the rate; grain duration, for its part, counts in periods. Spatial width scatters the grains between the two channels: each one gets its own place instead of the whole sound moving as a block. That is what separates granulation from panning — the ear draws a cloud from it, not a direction. Measured on a hundred and twenty grains per second: the correlation of the two channels goes from 1.00 to 0.31 between zero width and full opening, balance stays at nil throughout, and loudness does not move by a hundredth of a decibel — -16.91 LUFS at all four settings tried. Positions come in mirrored pairs, and amplitude is corrected for what the scattering would add in energy: a width that makes things louder gets judged better for the wrong reason. Dispersion disorders the instants. At zero, grains land on a regular grid and the ear hears a pitch; going up, the grid blurs and pitch gives way to texture. That is the passage from synchronous to asynchronous, done here with one slider.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Species | choice | Grains | Grains / Pulsars / Glissons / Trainlets / Granulating a sound / Pitch-synchronous granulation / Grainlets | Five settings of one generator. Grains: a brief waveform repeated. Pulsars: grain duration counts in cycles, so the formant no longer follows the rate. Glissons: each grain sweeps its own frequency. Trainlets: the grain is an impulse train, and « Partials » sets its richness. Grainlets: frequency sweeps the interval given by « Transposition » and grain duration follows it, so every grain carries the same number of cycles. Granulation: the sound connected to the input is read in grains, and « Position » and « Speed » drive the read head. Pitch-synchronous granulation: the same, but grains lock to the sound's period instead of a grid, which keeps its pitch. |
| Density | slider | 60 grains/s | 1 – 500 grains/s, step 1 | Grains per second — without effect on pitch-synchronous granulation, whose rate comes from the sound. Below some twenty, you count them and the node sounds like a rhythm; above, they fuse and the rate becomes a pitch — the continuum between rhythm and pitch, crossed with one slider. |
| Grain duration | slider | 50 % | 1 – 400 %, step 1 | A grain's duration, as a percentage of what separates two grains. Below one hundred the grains do not touch and the silence between them is heard; beyond, they overlap and the texture fills in. For a pulsar this percentage counts in cycles of the waveform, which is exactly what detaches the formant from the fundamental. |
| Frequency | slider | 440 Hz | 20 – 8000 Hz, step 1 | The frequency of the waveform inside the grain. For a pulsar it is the formant position; for a trainlet, the rate of the train's impulses. It does nothing for granulation, whose content comes from the connected sound. |
| Transposition | slider | 0 semitones | -24 – 24 semitones, step 1 | For a grainlet, the interval frequency travels across the note, and which grain duration follows. For a glisson, the interval each grain travels during its brief existence: the grain starts at its frequency and arrives here. For granulation, the pitch at which the connected sound's grains are replayed, duration unchanged. It does nothing for the other species. |
| Partials | slider | 8 | 1 – 40, step 1 | A trainlet's number of partials, that is, the bandwidth of its impulse train. At one, only a sine remains; at forty, a sharp click. It does nothing for the other species, which have no train. |
| Dispersion | slider | 0 % | 0 – 100 %, step 1 | The disorder of the instants, as a percentage of the period. Without effect on pitch-synchronous granulation, where the instants are dictated by the sound. At zero, grains land on a regular grid and the ear draws a pitch from it; going up, the grid blurs and pitch gives way to texture. That is the passage from synchronous to asynchronous granular. |
| Spatial width | slider | 0 % | 0 – 100 %, step 1 | Scatters the grains between the two channels: each one gets its own place, instead of the whole sound moving as a block. At zero, every grain lands in the centre and both channels come out identical; at one hundred, they take the full width. This is where granulation parts from panning: it is not the sound that is placed but its grains, and the ear draws a cloud from it rather than a direction. The catalog's goniometer shows it — the correlation of the two channels falls as you open up. Positions are drawn from the seed: the same seed replays the same scattering. |
| Position | slider | 0 % | 0 – 100 %, step 1 | Where to start reading in the connected sound, as a percentage of its duration. Only serves granulation. |
| Speed | slider | 1 | -2 – 2, step 0.05 | How fast the read head advances through the connected sound. One reads it at its original speed; a half stretches it twofold without transposing it; zero freezes it, which gives the granular freeze; a negative number reads it backwards. Only serves granulation. |
| Duration | slider | 4 s | 0.5 – 60 s, step 0.5 | The duration of the sound produced. It does not depend on the connected sound's: granulating two seconds of material for a minute is an ordinary use of the process. |
| Volume | slider | 60 % | 0 – 100 %, step 1 | Each grain's amplitude. Grains add up: doubling the density moves that much closer to the ceiling, which is why a high density calls for a lower volume. |
| Seed | slider | 42 | 1 – 999999, step 1 | The seed of the draw that disperses the instants. The same seed replays exactly the same disorder, which is what makes a render findable again. |

#### Sample Formula

`formule-echantillons` · Processing → Other effects

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

#### Sonic Seasoning

`assaisonnement-sonore` · Processing → Other effects

*Moves a sound toward the musical region of a taste — sweet, sour, bitter or salty — and says how far it moved.*

This node measures where a sound sits in the space of music-taste correspondences, then moves it toward the region of the chosen taste, by the requested dose. It returns the transformed sound and a report giving the applied settings and the share of the target taste before and after. Five gestures, one per dimension. The register moves by transposition, which keeps the duration. The speed moves by time-stretching, which keeps the pitch. Articulation moves both ways: toward staccato, a gate hollows out the silences between notes; toward legato, a resonant tail fills them. Consonance moves toward roughness through a detuned copy beating against the original, and toward consonance through a filter that removes the highs, where roughness lives. Loudness, by a gain. The order of operations. The gate works on the original envelope, hence before any stretching; the transposition comes after the stretching; the gain comes last. What each gesture can and cannot do. A recording is not a score: its notes cannot be rewritten, only what the signal carries can be treated. Consonance is the weakest of the five: what beats can be removed, what is not consonant does not become so. Transposition is capped at one octave either way, and the dose no longer widens the gap once that cap is reached. The dose covers part of the distance: at 50%, every gap to the region is halved. At 0%, the sound comes out untouched. This node moves a sound within a space of correspondences; it does not change the taste of any food. Sources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review, and its caveats — the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes. A.-S. Crisinel et al., “A Bittersweet Symphony”, Food Quality and Preference 24, 2012, and Q. J. Wang, B. Mesz and C. Spence on wine by temporal dominance of sensations: music shifts tasting judgements, with medium effect sizes, 0.54 to 0.66 in Cohen's d.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Taste | choice | Sweet | Sweet / Sour / Bitter / Salty | The target region. Sweet: consonant, slow, soft, legato. Sour: high, dissonant, fast. Bitter: low and legato. Salty: staccato, with silences between the notes. |
| Dose | slider | 60 % | 0 – 100 %, step 1 | How far toward the region: at 0%, the sound comes out untouched; at 100%, every dimension is taken to the region's value, within what each gesture allows. |

#### Statistical Texture

`texture-statistique` · Processing → Other effects

*Generates a new texture with the statistics of a given sound — rain, fire, crowd — without copying a single sample of it.*

Generates a new texture having the statistics of a given sound. After Josh H. McDermott and Eero P. Simoncelli, « Sound Texture Perception via Statistics of the Auditory Periphery: Evidence from Sound Synthesis », Neuron 71(5), 2011. The paper's thesis, which is what is implemented here: a texture — rain, fire, crowd, applause — is recognised by time-averaged statistics, measured on a decomposition of the sound such as the ear performs. Two recordings of rain share no sample; what they share are those numbers. Hence the procedure: measure a sound's statistics, then build a new noise that respects them. What this brings to Attic, which already freezes and mosaics: granular freeze loops a grain, corpus mosaicing copies grains, and the ear always ends up hearing the loop. Here nothing is copied — the output contains no sample of the input, and it can last indefinitely without repeating. The requested duration therefore bears no relation to the model's: five seconds of rain produce two minutes. What is imposed, and what is not, because the honest part matters here. Imposed: the complete distribution of each band's envelope — hence its mean, variance, skewness, kurtosis and every following moment, obtained by rank transport rather than by fitting the first four — and the correlations between bands. The paper shows that the former alone do not suffice and that the latter are what tip the result towards something recognisable; this is checked here by a test measuring both cases, and the statistical distance to the model falls from 40 % to 31 % when the correlations are imposed. Not imposed: the paper's C1 and C2 modulation correlations, which require a second filterbank on the envelopes — their absence is heard mostly on very rhythmic textures, where regularity is lost. Finally the paper loops analysis and synthesis by gradient descent, where this node imposes the statistics in the envelope domain by alternating projections and then reconstructs once: two orders of magnitude faster, and the remaining distance is displayed rather than hidden. One last detail that matters: each channel gets its own seed, so both sides share the statistics without sharing a sample — the texture is wide of itself, which no stereo widener gives.

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

### Pitch

| Component | Summary |
|---|---|
| [Harmonizer / Octaver](#harmonizer--octaver) | Adds pitch-shifted voices (octave, fifth…) under the original. |
| [MIDI Transposer/Quantizer](#midi-transposerquantizer) | Transposes and/or quantizes a MIDI file. |
| [Octaver](#octaver) | Adds an upper and/or lower octave. |
| [Phase Vocoder Pitch](#phase-vocoder-pitch) | Transposes pitch via phase vocoder (frequency-domain), without changing duration. |
| [Pitch Correction](#pitch-correction) | Brings every note to the nearest degree of the chosen scale, without moving the formants. |
| [Pitch Glissando](#pitch-glissando) | Pitch glissando from one pitch to another. |
| [Pitch Shift](#pitch-shift) | Pitch shift. |
| [Progressive Pitch](#progressive-pitch) | Repeats the sound, shifting it one step further each time, with silences in between. |
| [Risset Glissando](#risset-glissando) | Turns a sound into a pitch that falls (or rises) endlessly. |
| [SoundTouch Pitch](#soundtouch-pitch) | Changes pitch while preserving duration (quality pitch-shift). |
| [Temperament](#temperament) | Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament. |

#### Harmonizer / Octaver

`harmonizer` · Processing → Pitch

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

#### MIDI Transposer/Quantizer

`transposeur-quantiseur-midi` · Processing → Pitch

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

#### Octaver

`octaver` · Processing → Pitch

*Adds an upper and/or lower octave.*

Generates up to two extra voices — hence the two sliders: "Octave up" sets the volume of the voice one octave above, "Octave down" the voice one octave below. Set either to 0 to add a single voice. "Mix" then balances the original against the added voices. Monophonic technique (analog pedal style): works best on single-note sources (voice, bass, lead).

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Octave up | slider | 50 % | 0 – 100 %, step 1 | Volume of the added voice one octave above (frequency doubled by rectification). |
| Octave down | slider | 50 % | 0 – 100 %, step 1 | Volume of the added voice one octave below (period doubled by polarity flipping). |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Dry / added-voices balance. 0% = dry only, 100% = octaves only. |

#### Phase Vocoder Pitch

`phase-vocoder-tonalite` · Processing → Pitch

*Transposes pitch via phase vocoder (frequency-domain), without changing duration.*

Transposes pitch via phase vocoder (FFT frequency-domain processing), without changing the track duration. The algorithm stretches the signal in time then resamples it back to the original length. Alternative to native pitch-shift for creative effects.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch | number | 0 st | -12 – 12 st, step 0.5 | Pitch shift in semitones. 0 = original, +12 = one octave up, -12 = one octave down. |

#### Pitch Correction

`correction-hauteur` · Processing → Pitch

*Brings every note to the nearest degree of the chosen scale, without moving the formants.*

The classic that was missing, and whose parts Attic already had: a pYIN pitch follower returning a frequency per frame with its confidence, scales, temperaments, and ways to transpose. Only the node that links them was missing — which is exactly the shape a growing catalogue's omissions take: what has an author and a paper proposes itself, what is too ordinary to have a parent has nobody to recall it. Two settings do everything, and they are readily confused. Strength says how much of the deviation is corrected: at 100 % the note lands exactly on the degree; at 50 % half the vibrato and the attacks are kept, which is what one wants almost always. Transition says how long the correction takes to settle: at zero the pitch jumps from one degree to the next without passing through — the effect made famous by a 1998 record, and it is an effect, not a fault; at fifty milliseconds the ear hears nothing but tuning restored. The method is pitch-synchronous overlap-add, and that choice has an audible consequence: formants do not follow the note. The signal is cut into two-period grains that are glued back at a different spacing; each grain's content does not move, so a corrected voice does not take on a chipmunk accent — which resampling would have done to it. A first attempt did precisely that and, over the few dozen cents of an ordinary correction, did not even move the pitch: an A at 452 Hz came out at 452.06 instead of 440. Its limit, since it has one: it assumes a periodic sound. On a voice or a sustained instrument that holds; on a chord, a noise or a drum there is no period to glue, and the confidence threshold is there so those passages are not corrected at all. The ratio is bounded to four semitones: beyond that, two copies of one grain cancel — measured, at the octave the dominant line falls to a hundredth of the input level. To transpose in earnest, the catalogue has tools made for it. The maximum deviation is not decorative caution: a pitch follower makes octave errors on rich sounds, and correcting an octave error would move the note by a whole octave. Beyond the bound nothing is corrected — better to leave a note in tune than to manufacture one out of it. The second output returns the applied correction as a curve, to be plugged into the viewer: a half means no correction, the top pulls towards the treble, the bottom towards the bass. It is the most direct way to see what the node did, and where it gave up.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Correction | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Root | choice | C | C / C# / D / E♭ / E / F / F# / G / G# / A / B♭ / B | The scale's root. Without effect in chromatic, which contains every note. |
| Scale | choice | Chromatic | Chromatic / Major / Natural minor / Harmonic minor / Major pentatonic / Minor pentatonic / Blues | The allowed degrees. The more a scale has, the less the correction moves the notes: chromatic restores tuning, pentatonic imposes a colour and is heard as an effect. |
| Strength | slider | 100 % | 0 – 100 %, step 1 | Share of the deviation corrected. At 100 % the note lands exactly on the degree; at 50 % half the vibrato and the attacks survive, which is almost always what one wants. |
| Transition | slider | 0 ms | 0 – 200 ms, step 1 | How long the correction takes to settle. At zero the pitch jumps from one degree to the next: that is the 1998 effect, and it is one. Around fifty milliseconds, nothing is heard but tuning restored. |
| Confidence | slider | 40 % | 10 – 90 %, step 5 | Below this follower confidence, the frame is not corrected. That is what leaves consonants, breaths and drums alone: periods are not glued where there are none. |
| Max deviation | slider | 1 semitones | 0.2 – 2 semitones, step 0.1 | Beyond this deviation the frame is not corrected: a follower makes octave errors on rich sounds, and correcting one would move the note by a whole octave. |

#### Pitch Glissando

`glissando-tonalite` · Processing → Pitch

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

`changement-tonalite` · Processing → Pitch

*Pitch shift.*

Transposes the pitch by a given number of semitones, without changing the track duration.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Semitones | number | 2 | -24 – 24, step 1 | Transposition in semitones. |

#### Progressive Pitch

`pitch-progressif` · Processing → Pitch

*Repeats the sound, shifting it one step further each time, with silences in between.*

Repeats the sound n+1 times, shifting it one step further each time, with silences in between. With 3 loops, a 10 s gap and -5 semitones: the original, then -5, then -10, then -15 st. The output lasts 4 times the source + 30 s, since SoundTouch's pitch-shift preserves each pass's duration. There is NO silence after the last pass: 3 loops give three gaps, not four. Each repeat is computed from the original using k times the step, never by re-applying the shift to the previous result: both give the same pitch, but a pitch-shift is lossy, and chaining it would accumulate artefacts until the last repeat sounded markedly worse than the first with nothing in the settings to explain it. Step 0 does not go through the shifter at all, which would degrade the signal for a zero shift. Note: past 12 cumulative semitones down the timbre hollows out considerably — the point of a progressive fall, less so for a plain transposition, where the SoundTouch Pitch node is a better fit.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Loops | number | 3 | 1 – 12, step 1 | Number of repeats after the original. 3 gives four passes in total: the original, then three transpositions. |
| Gap | number | 10 s | 0 – 60 s, step 0.5 | Silence between passes. None after the last one: with 3 loops the output holds three gaps, not four. |
| Step | number | -5 st | -12 – 12 st, step 0.5 | Pitch added at each repeat, in semitones. −5 goes 5, then 10, then 15 semitones below the original. Negative descends, positive rises. |

#### Risset Glissando

`glissando-risset` · Processing → Pitch

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

#### SoundTouch Pitch

`soundtouch-tonalite` · Processing → Pitch

*Changes pitch while preserving duration (quality pitch-shift).*

Transposes audio pitch while preserving duration, using the SoundTouch algorithm (advanced phase vocoder). Higher-quality alternative to the native « Pitch Change » node, especially on voice.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch | number | 0 st | -12 – 12 st, step 0.5 | Pitch shift in semitones. 0 = original, +12 = one octave up, -12 = one octave down. |

#### Temperament

`temperament` · Processing → Pitch

*Replays a MIDI file in a historical temperament or just intonation, instead of equal temperament.*

Replays a MIDI file in a tuning other than equal temperament, and renders it to audio. Every other node in Attic plays in equal temperament: twelve rigorously identical semitones, which sound in tune nowhere but equally out of tune everywhere. That is neither natural nor ancient — it is a compromise generalised in the 19th century. Seven tunings are offered, from just intonation (exact 5/4 third and 3/2 fifth, a purity no piano gives, but the neighbouring key becomes unusable) to Renaissance quarter-comma meantone, by way of Werckmeister III, Kirnberger III and Vallotti, where every key is playable without any two sounding alike — it is those tunings that give « The Well-Tempered Clavier » its title, well-tempered not meaning equal. « Tonic » picks the note the tuning is built on: that one sounds pure, and distant keys drift the further away. The text output lists the twelve deviations from equal temperament, in cents. The node outputs audio rather than MIDI, deliberately: a MIDI file cannot carry a pitch in cents without per-channel pitch bend, which not every player honours. Here the pitches become fractional and the renderer — FM or SoundFont — plays them exactly.

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

### Reverberation

| Component | Summary |
|---|---|
| [Convolution Reverb (IR)](#convolution-reverb-ir) | Convolution reverb with synthetic IR (adjustable) or external IR file. |
| [Feedback Delay Network Reverb](#feedback-delay-network-reverb) | A reverb whose decay time is set separately for the low and the high end — as every real room behaves. |
| [Fractal Reverb](#fractal-reverb) | Convolution reverb whose impulse response is generated by a fractal pattern. |
| [Gated Reverb](#gated-reverb) | A reverb tail cut dead by a gate driven by the dry sound. |
| [Progressive Reverb](#progressive-reverb) | Progressive reverb (dry→wet). |
| [Reverb](#reverb) | Convolution reverb. |
| [Shimmer](#shimmer) | A reverb whose tail rises an octave at each pass, receding as it climbs. |
| [Velvet Reverb](#velvet-reverb) | Reverb with a free-form tail: exponential like a room, linear, swelling, or two-sloped. |

#### Convolution Reverb (IR)

`reverbe-convolution` · Processing → Reverberation

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

#### Feedback Delay Network Reverb

`reverbe-reseau` · Processing → Reverberation

*A reverb whose decay time is set separately for the low and the high end — as every real room behaves.*

A reverb whose decay time is set separately for the low and the high end. After Jean-Marc Jot and Antoine Chaigne, « Digital delay networks for designing artificial reverberators », AES Convention 90, 1991 — the feedback delay network and, above all, the way to control reverberation time explicitly within it; exact RT60 control was taken up and refined by Sebastian J. Schlecht and Emanuel A. P. Habets, DAFx-17. What was missing, and it is the only real gap among the five reverbs already present: None has a frequency-dependent decay. Convolution needs a response file; the others — simple, fractal, progressive, velvet — decay at one single rate everywhere. Yet that is exactly what a room does not do: air and materials absorb the high end far faster than the low, so a real reverb tail darkens as it dies. Without that, a reverb sounds like an effect rather than a place. How: eight delay lines looped into one another by a Hadamard matrix, which is unitary — it preserves energy, so the network would never die out by itself. It is the attenuation placed on each line that decides the decay, and separating diffusion from absorption in this way is the paper's idea: RT60 becomes adjustable without touching anything else. The delay lengths are prime, since two delays sharing a divisor would make their echoes coincide periodically — heard as a metallic ringing. The absorption calculation is derived rather than copied: a line of m samples is traversed fs/m times per second, so to lose 60 dB in T seconds each pass must cost 60·m/(T·fs) decibels; a first-order lowpass on each line then suffices to make that cost frequency-dependent, and its two coefficients solve exactly. Measured, by the Schroeder integral on the resulting response, band by band: for 2.00 s requested at the low end and 0.50 s at 8 kHz, one reads 1.96 s at 125 Hz, 1.90 at 500 Hz, 1.54 at 2 kHz and 0.58 at 8 kHz; for 1.00 s everywhere, one reads 0.98, 0.98, 1.01, 0.99 and 1.00. The transition between the two is gradual, like a first-order filter's, not a step. The node measures what it produces and announces it: enough to know whether the room requested is the room obtained, without having to measure it oneself. Two precautions found by measuring. The first: solving the filter at Nyquist is simpler but makes the setting misleading — 0.73 s was measured at 18 kHz for 0.50 requested, exactness falling at a frequency nobody listens to; hence the « High reference » setting. The second: asking for a high end longer than the low can be physically impossible, the loop's magnitude then exceeding unity — measured, a response whose peak reached 1.2 × 10^13 instead of dying out. A safeguard now bounds the absorption. Measured in the application with 0.5 s at the low end and 2 s at the high: the tail stays flat at 0.5 s in every band — the bound eats the inversion. This direction of the setting therefore does almost nothing, and it was better written down than left to be hunted for by ear. One output returns the impulse response itself, to look at or to feed the convolution reverb. Cost: 20 ms for two seconds of sound at eight lines.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio (stereo) |  |
| output | Impulse response | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Low RT60 | slider | 2 s | 0.1 – 12 s, step 0.1 | Time the low end takes to lose 60 dB. This is the duration the ear calls « room size », and here it is requested rather than endured: the network holds it. Measured by the Schroeder integral on the resulting response — 1.96 s for 2.00 requested. |
| High RT60 | slider | 0.7 s | 0.1 – 12 s, step 0.1 | Decay time at the reference frequency. This is the setting the other five Attic reverbs lacked: none of them decays at anything but one single rate everywhere, whereas a room absorbs the high end far faster than the low — a real tail darkens as it dies. Setting it longer than the low end gives an effect no room produces, and stability then bounds severely what can be asked: the loop's magnitude cannot exceed unity, on pain of the reverb swelling instead of dying out. Measured in the application with 0.5 s at the low end and 2 s at the high: the tail stays flat at 0.5 s throughout, the difference being eaten by the bound. In other words this direction of the setting does almost nothing, and it is better read here than hunted for by ear. |
| High reference | slider | 8000 Hz | 1000 – 16000 Hz, step 100 | Frequency at which « High RT60 » is exact. It exists because the first version solved the filter at Nyquist, which is simpler but makes the setting misleading: 0.73 s was measured at 18 kHz for 0.50 requested, exactness falling at a frequency nobody listens to. Placed here, the setting announces what one hears. |
| Delay lines | choice | 8 | 4 / 8 / 16 | Number of delay lines looped into one another. The more there are, the denser and smoother the tail; four is enough for a small room, sixteen gives a large hall. Their lengths are taken prime: two delays sharing a divisor would make their echoes coincide periodically, which is heard as a metallic ringing. |
| Shortest delay | slider | 23 ms | 5 – 60 ms, step 1 | Length of the shortest line: this is what gives the apparent size of the place, even before the duration. |
| Longest delay | slider | 79 ms | 20 – 200 ms, step 1 | Length of the longest line. The gap between the two makes the density of early echoes; narrow it and you hear a corridor, widen it and a cathedral. |
| Width | slider | 100 % | 0 – 100 %, step 1 | Difference between the two channels. At zero the reverb is mono; the two channels come from different sign combinations of the same lines, which decorrelates them at no cost. |
| Mix | slider | 35 % | 0 – 100 %, step 1 | Proportion of reverb. At 0 %, the output is the input. |
| Tail | slider | 0 s | 0.2 – 15 s, step 0.1 | Duration added after the sound to let the tail die out. At zero the node takes the longer of the two RT60s — a reverb that stopped with the sound would not be one. |

#### Fractal Reverb

`reverb-fractale` · Processing → Reverberation

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

#### Gated Reverb

`reverbe-hachee` · Processing → Reverberation

*A reverb tail cut dead by a gate driven by the dry sound.*

The drum sound of the eighties, and it is not obtained by putting a gate after a reverb. An ordinary gate listens to what it processes: placed after the tail, it closes when the tail falls below its threshold, that is, late and gradually. One hears a decay where a cleaver was wanted. Here the gate is driven by the dry sound. It opens at the attack, holds for a fixed time, then cuts dead — and that brutal silence is the effect. As long as the dry signal comes back above the threshold the countdown restarts: a roll therefore holds the gate open, and the cleaver falls after the last hit. The catalogue does have a node that listens to another signal, ducking, but it lowers the sound instead of holding it open: the exact opposite of what is needed. The node reports the trail — what the reverb adds after the dry sound ends — before and after gating. Three measures were tried. The energy after closing relative to before spoke of the ungated tail, and would have been the same without a gate. The share of energy discarded is correct but mute: measured at eleven per cent, it suggests a discreet effect, whereas the tail in fact goes from more than a second to four tenths. A tail is heard long after it weighs nothing. Feed it drums, or anything percussive: the effect assumes clear attacks, since it is on them that the gate is set.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Decay | slider | 1.5 s | 0.2 – 4 s, step 0.1 | Length of the tail before gating. It decides the density and colour of what is heard during the hold, not the final length — the hold sets that. |
| Hold | slider | 0.2 s | 0.02 – 1 s, step 0.01 | How long the gate stays open after the last attack. It sets the length of the tail heard: two tenths of a second give the 1985 snare. |
| Release | slider | 0.01 s | 0.002 – 0.3 s, step 0.002 | Closing time. Short, it is the cleaver; beyond a hundred milliseconds or so one hears a fade and the effect vanishes. |
| Threshold | slider | -40 dB | -60 – -10 dB, step 1 | Dry level above which the gate opens. Too low and it stays open on hiss; too high and soft hits no longer trigger anything. |
| Mix | slider | 60 % | 0 – 100 %, step 1 | Proportion of reverb added. At 0 %, the output is the input. |
| Seed | slider | 1 | 1 – 999999, step 1 | Seed of the room's response. The same seed replays the same room. |

#### Progressive Reverb

`reverb-progressive` · Processing → Reverberation

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
| Fade | number | 8 s | 0 – 60 s, step 0.5 | Length of the move from dry to wet. Capped at the length of the render - the sound plus the reverb tail -: beyond that, the fade never reaches its end value. 0: over the whole sound. |
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the impulse-response noise. The default is fixed: a reverb that moves to a different room on every run would be a defect. |

#### Reverb

`reverberation` · Processing → Reverberation

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the impulse-response noise. The default is fixed: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions. |

#### Shimmer

`shimmer` · Processing → Reverberation

*A reverb whose tail rises an octave at each pass, receding as it climbs.*

A reverb whose tail rises an octave at each pass, receding as it climbs. The effect is associated with Brian Eno's and Daniel Lanois's pads, and its recipe is a loop: the tail is transposed then fed back into the reverb, indefinitely, each pass higher and quieter. An acyclic graph cannot express that — it is feedback, not a chain — which is why it takes a node rather than a patch. The loop is therefore unrolled into generations: the first is the reverb of the sound, the second the reverb of the first transposed, and so on. Four or five are enough; beyond that everything is below the hearing floor, and the node shows each one's level so it can be seen. The first generation is not transposed, and that is what makes the effect recognisable: one hears the room first, then the octave rising inside it. Transposing from the first pass would give an immediate high sound, which sounds like a misconfiguration. One fault found by measuring, and it would have made the node unusable: the reverb response was not unity gain, so every convolution added energy. The fourth generation came out seventy-four decibels above the first, and the feedback setting commanded nothing. The response is now normalised in energy; feedback alone decides the decay.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Decay | slider | 1.2 s | 0.2 – 4 s, step 0.1 | Tail length of each generation. It accumulates: four generations of one second extend well beyond one second. |
| Feedback | slider | 60 % | 0 – 95 %, step 1 | What goes back into the loop at each pass. It alone decides the decay — since the response was normalised in energy. |
| Transposition | slider | 12 semitones | -12 – 24 semitones, step 1 | What the loop transposes at each pass. Twelve gives the classic shimmer octave; seven gives a fifth that stacks chords; negative values descend, which thickens instead of brightening. |
| Generations | slider | 4 | 1 – 8, step 1 | Number of passes unrolled. Beyond four or five everything is below the hearing floor and the computation costs for nothing — the node shows each generation's level so it can be seen. |
| Mix | slider | 50 % | 0 – 100 %, step 1 | Proportion added to the dry sound. At 0 %, the output is the input. |
| Seed | slider | 1 | 1 – 999999, step 1 | Seed of the room's response. |

#### Velvet Reverb

`reverberation-velours` · Processing → Reverberation

*Reverb with a free-form tail: exponential like a room, linear, swelling, or two-sloped.*

Late reverberation whose tail takes whatever shape one wants. After Vesa Valimaki, Bo Holm-Rasmussen, Benoit Alary and Heidi-Maria Lehtonen, « Late Reverberation Synthesis Using Filtered Velvet Noise », 2017; and for the arbitrary decay, Jon Fagerstrom, Nils Meyer-Kahlen, Sebastian J. Schlecht and Vesa Valimaki, « Dark Velvet Noise », DAFx-22, then « Non-Exponential Reverberation Modeling Using Dark Velvet Noise », 2024. Velvet noise is a sparse noise: one plus-or-minus-one impulse per regular interval, placed at random within that interval, and nothing in between. At fifteen hundred impulses per second the ear no longer hears separate impulses but a wash — and a smoother wash than a Gaussian noise of the same density, because no impulse is louder than another. That is what makes it a good late reverberation, and also why lowering the density below a thousand becomes an effect in itself: the impulses are then heard one by one. What this node adds to the four reverbs already present fits in one phrase: the tail need not be an exponential. Convolution requires an impulse response file; the other three decay exponentially, because that is what a room does. Here the decay is a curve one chooses. Exponential like a room. Linear, falling in a straight line — no room does that. Swelling, where the sound grows and stops dead, otherwise obtainable only by reversing a recording. Or two-sloped, the signature of coupled rooms: a church and its chapel, a stage and its tower, where the small room dies fast and the large one takes over. Darkening makes the treble die before the bass, as every room does: without it the tail stays bright and sounds like a noise wash glued onto the sound rather than a space. The Impulse response output returns the response itself, to feed the convolution reverb or simply to look at. Finally, on computation and to be exact: the paper praises a convolution without multiplication, the impulses being plus or minus one, which is decisive in real time. Here the processing is offline and the convolution goes through a Fourier transform, faster still at this length. What is kept from velvet is therefore not its thrift but its texture and the freedom of its decay.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Impulse response | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Profile | choice | Exponential | Exponential / Linear / Swell / Coupled rooms | Shape of the tail. The exponential is what a room does. The linear falls in a straight line, which none does. The swell rises and stops dead — otherwise obtainable only by reversing a recording. Coupled rooms chain two slopes, the signature of a room containing another: a church and its chapel, a stage and its tower. |
| Length | slider | 2 s | 0.2 – 8 s, step 0.1 | Length of the tail. Beyond the sixty-decibel drop it adds nothing but silence. |
| Decay | slider | 1.5 s | 0.2 – 8 s, step 0.1 | Time to fall sixty decibels — the acousticians' RT60. No effect on the linear profile, which holds for the whole length. |
| Density | slider | 1500 /s | 200 – 4000 /s, step 100 | Impulses per second. Above a thousand, the ear no longer hears separate impulses but a smooth wash — smoother than a Gaussian noise of the same density, since no impulse is louder than another. Below, they are heard one by one, which is an effect in itself. |
| Darkening | slider | 25 % | 1 – 100 %, step 1 | How much the treble dies before the bass. A hundred leaves the tail bright, which sounds like a noise wash glued onto the sound; twenty-five gives an ordinary room. |
| Knee | slider | 30 % | 5 – 95 %, step 5 | For coupled rooms only: at what point in the tail the second slope takes over. |
| Mix | slider | 35 % | 0 – 100 %, step 1 | Share of reverberated sound in the output. |
| Seed | number | 1 | 1 – 999999, step 1 | Seed of the positions and signs. Two seeds give two rooms of the same dimensions. |

### Spectrum

| Component | Summary |
|---|---|
| [AI Separator](#ai-separator) | Separates audio sources via AI (Demucs 4/6 stems, MDX-Net). |
| [Atomic Decomposition](#atomic-decomposition) | Describes a sound by the N Gabor grains that best explain it, and returns the resulting sketch and what it left behind, separately. |
| [Audio Inpainting](#audio-inpainting) | Rebuilds a missing passage by continuing the sound's own resonance from both sides. |
| [Frequency Shifter](#frequency-shifter) | Adds the same number of hertz to every frequency: the sound stops being harmonic and turns bell-like. |
| [Griffin-Lim](#griffin-lim) | Iterative reconstruction from the magnitude spectrogram. Changes phase to create spectral textures. |
| [Harmonic Sieve](#harmonic-sieve) | Keeps - or removes - only the components near chosen harmonics of a fundamental: a noise becomes a chord, a sound loses its even partials. |
| [Harmonic/Percussive Separation](#harmonicpercussive-separation) | Separates what sustains from what strikes, by median filtering the spectrogram (Fitzgerald, DAFx-10). |
| [Inner Glissando](#inner-glissando) | Keeps the sound's formant envelope and puts an endless glissando underneath: Risset's illusion, dressed in a real timbre. |
| [Phase Reconstruction (PGHI)](#phase-reconstruction-pghi) | Rebuilds a sound from its spectrogram magnitudes alone, without iterating: the phase is read from the magnitude's gradient. |
| [Sines + Transients + Noise (STN)](#sines--transients--noise-stn) | Splits a sound into three materials — what sustains, what strikes, what breathes — losing nothing. |
| [Sinusoids + Noise (SMS)](#sinusoids--noise-sms) | Tracks a sound's partials and sets the rest aside: transpose the harmony without touching the breath. |
| [Spectral Arpeggio](#spectral-arpeggio) | A narrow band sweeps the spectrum and lets only the partials it touches sound: a held sound is picked out partial by partial. |
| [Spectral Blur](#spectral-blur) | Averages the spectrum over neighbouring moments: the sound spreads out in time without changing duration. |
| [Spectral Formula](#spectral-formula) | Modifies the signal spectrum by mathematical expressions on magnitude and phase. |
| [Spectral Freeze](#spectral-freeze) | Holds one moment's spectrum for all that follows: a stillness, not a loop. |
| [Spectral Morphing](#spectral-morphing) | Travels from one sound to another through the spectrum: in the middle, a timbre that did not exist. |
| [Spectral Tracing](#spectral-tracing) | Keeps only the loudest partials of each moment: a complex sound becomes a few interweaving lines. |
| [Wavelets](#wavelets) | Analyses the sound with wavelets — short window in the treble, long in the bass — and keeps only the coefficients that carry something. |
| [Window Shuffle](#window-shuffle) | Cuts the sound into very short blocks and moves them in time: the sound becomes a cloud of its own instants. |

#### AI Separator

`separateur-ia` · Processing → Spectrum

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

#### Atomic Decomposition

`decomposition-atomique` · Processing → Spectrum

*Describes a sound by the N Gabor grains that best explain it, and returns the resulting sketch and what it left behind, separately.*

After Stephane Mallat and Zhifeng Zhang, « Matching pursuits with time-frequency dictionaries », IEEE Transactions on Signal Processing 41(12), 1993, applied to sound by Bob L. Sturm and described by Curtis Roads as microsound's atomic decomposition. What the method does, and what exists nowhere else in the catalog. A Fourier transform cuts the sound into a fixed number of cells, all of the same duration: one single scale for a finger snap as for a held note. Here the sound is described by a sum of Gabor grains — sines under a window — chosen one at a time, each where it explains the most of the remaining signal, and taken from several durations at once. An attack takes a short atom, a held note a long one. And you stop when you like: it is a sketch of the sound, whose number of strokes you set. At ten atoms you hear what is nearly enough to recognise a sound without quite recognising it; at a few hundred, it comes back. The question the node asks is that one: how many strokes does a sound need to stay itself? The method's guarantee is that the residual's energy decreases with every atom, since each time the orthogonal projection of what remains is removed. It is also the trap of its implementation: selecting the best candidate goes through a transform, but its coefficient is approximate — windows overlap and atoms are not orthogonal to one another. The projection is therefore computed exactly in the time domain. Taking the transform's coefficient as is would make the residual rise again, which a test checks step by step. Scales are compared at equal window. A window twice as long gathers twice as many samples and would always win without that scaling: the multi-scale dictionary would then be pointless, every attack being described by long atoms that smear it. The second output returns the residual, and it is the more instructive of the two. The sketch alone does not say what its likeness is made of; the residual says exactly what the atoms failed to explain. Wire both into a comparator, or measure them with the spec sheet. The cost is bounded by the number of atoms, not by the sound's duration: each atom means finding the best candidate at each scale, then recomputing only the frames the removed atom just changed. The rest of the sound is not touched.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Sketch | audio |  |
| output | Residual | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Atoms | slider | 200 | 1 – 2000, step 1 | How many grains describe the sound. It is the sketch's number of strokes, and the only setting that really matters: at ten, you hear what is nearly enough to recognise the sound; at a few hundred, it comes back. Computation cost is proportional to it. |
| Scales | choice | All three | Short (5 ms) / Medium (45 ms) / Long (185 ms) / All three | The window durations to search in. Short, the atoms describe attacks well and held notes badly; long, the other way round. « All three » lets the method choose for each stroke, which is the whole point of a Gabor dictionary — and a test checks that a click does take a short window where a held note takes a long one. |

#### Audio Inpainting

`remplissage-trou` · Processing → Spectrum

*Rebuilds a missing passage by continuing the sound's own resonance from both sides.*

Rebuilds a missing passage by continuing the sound's own resonance from both sides. After Amir Adler, Valentin Emiya, Maria G. Jafari, Michael Elad, Remi Gribonval and Mark D. Plumbley, « Audio Inpainting », IEEE Transactions on Audio, Speech and Language Processing 20(3), 2012, which gave the problem its name; the method used is the one that remains the reference for short gaps, the autoregressive interpolation of Janssen, Veldhuis and Vries (1986), revisited in 2024 by Mokry and Rajmic as « Janssen 2.0 », which confirms it still stands up to sparse and neural methods on gaps of a few tens of milliseconds. What was missing: « Click Removal » interpolates short clicks, a few samples. Nothing rebuilt a gap of twenty or fifty milliseconds — a network dropout, a scratch, a blank to make disappear. Yet the Multi-Zone Selector is already there to point at the passage: select it, and the node rebuilds it. The idea: the sound is assumed autoregressive, that is, each sample is roughly a linear combination of the preceding ones. This is not a fancy — it is what an instrument does, its material imposing a resonance. The problem bites its own tail, since the sound would be needed to estimate the model and the model to remake the sound; Janssen sidesteps this by alternating: estimate the model on the current sound, gap filled as best one can, then recompute the gap that minimises this model's prediction error, and start again. Each pass improves both, and computation stops as soon as the gap stops moving. Why it works so well on a note: a sine is exactly a second-order autoregressive process — x[n] = 2·cos(w)·x[n-1] - x[n-2] — so an order of thirty carries fifteen partials with no approximation at all, phases included. Measured, as signal-to-distortion ratio computed on the gap only, against a linear interpolation, which is what one would do by hand: on a 2 ms gap, 12 dB for the straight line against 59 dB; at 5 ms, -4 against 65; at 10 ms, -3 against 62; at 20 ms, -3 against 53; at 50 ms, -6 against 41; at 100 ms, -6 against 34. The method therefore does not lose its superiority as gaps grow, it only loses precision. The cost, on the other hand, grows as gap length times the square of the order: 90 ms of computation for a 20 ms gap, two and a half seconds for a 100 ms one — hence the « Max gap » setting, which leaves oversized gaps as they are and says so. On noise there is nothing to predict and the reconstruction cannot be right; what is guaranteed is that it does not diverge and stays within the sound's amplitudes. Nothing outside the gaps is touched.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Zones | control |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Gaps | choice | Connected zones | Connected zones / Detected silences | Where the gaps to fill come from. « Connected zones » takes them from the Zones input — the Multi-Zone Selector is made for this: select the passage to rebuild, and the node rebuilds it. « Detected silences » looks for mute passages itself, which suits recording dropouts, being exactly at zero. |
| Silence threshold | slider | -60 dB | -90 – -20 dB, step 1 | Level below which a sample counts as missing, in automatic detection. Not strict zero: a file that has been through an encoder leaves values of a thousandth instead of exact silence. |
| Minimum length | slider | 1 ms | 0.2 – 20 ms, step 0.1 | Length below which a silence is not taken for a gap, in automatic detection. Without it, every zero crossing of a sine would be taken for a gap — the exact mistake a naive detector makes. |
| Order | slider | 0 | 0 – 256, step 8 | Order of the autoregressive model, that is, on how many past samples each sample depends. At zero it is chosen automatically: three times the gap length, capped at 256, which is the paper's rule. A useful landmark: a sine is exactly a second-order process, so an order of thirty carries fifteen partials with no approximation. |
| Passes | slider | 12 | 1 – 40, step 1 | Alternations between estimating the model and computing the gap. Computation stops of its own accord as soon as the gap stops moving, so raising this number costs nothing when it is not needed. |
| Max gap | slider | 120 ms | 5 – 500 ms, step 5 | Beyond this, the gap is left as it is and the node says so. This is not a limit of principle but of time: computation grows as gap length times the square of the order — 90 ms for a 20 ms gap, two and a half seconds for a 100 ms one. And quality drops: 53 dB at 20 ms, 34 dB at 100 ms. |

#### Frequency Shifter

`decaleur-frequence` · Processing → Spectrum

*Adds the same number of hertz to every frequency: the sound stops being harmonic and turns bell-like.*

Adds the same number of hertz to every frequency. After Scott Wardle, « A Hilbert-Transformer Frequency Shifter for Audio », DAFx-98; the original is analogue, described by Harald Bode and Robert Moog in « A High-Accuracy Frequency Shifter for Professional Audio Applications », Journal of the Audio Engineering Society, 1972. Attic already had a ring modulator and a pitch shifter, and this node is neither — it is the brick that was missing between them. The pitch shifter multiplies frequencies: 200-400-600 raised an octave gives 400-800-1200, the ratios are kept, the sound stays harmonic and one hears a higher note. The ring modulator returns both sidebands at once, sum and difference. The shifter adds, and a single sideband: 200-400-600 shifted by 50 gives 250-450-650. The ratios are no longer whole numbers, harmonicity is destroyed, and that is why a note becomes a bell, a metal bar, an unheard-of thing — while keeping its envelope and its rhythm intact. A few hertz are enough to make a sound beat without disfiguring it; beyond a hundred, the original pitch is frankly left behind. Technically, the analytic signal is formed — the signal and its Hilbert transform, which is the same signal shifted ninety degrees at every frequency — then rotated in the complex plane at the wanted speed. A negative shift gives the other sideband without having to ask for it. One inherent flaw, better known than suffered: downwards, partials that would pass below zero hertz fold around zero and come back up. Lowering a 200 Hz partial by 300 Hz does not give minus 100 but 100, on the other side. This is not a bug, it is what a single sideband does, and it is part of its character — but it explains why a large downward shift on a bass gives something other than a lower bass. The stereo offset, finally, shifts the right channel by a few tenths of a hertz more: the two channels drift slowly apart and the sound widens, without the destructive phasing of a delay.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Shift | slider | 100 Hz | -1000 – 1000 Hz, step 1 | Hertz added to every frequency. 200-400-600 shifted by 50 gives 250-450-650: the ratios are no longer whole numbers, which is why a note turns into a bell. A few hertz are enough to make a sound beat without disfiguring it; beyond a hundred, the original pitch is frankly left behind. |
| Stereo offset | slider | 0 Hz | 0 – 20 Hz, step 0.5 | Hertz added to the right channel on top of the shift. A few tenths are enough: the two channels then drift apart and the sound widens slowly, with no destructive phasing. No effect on a mono sound. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Share of the shifted sound in the output. At 50 %, the original and its shift beat together — that is how one gets gently metallic timbres rather than a complete displacement. |

#### Griffin-Lim

`griffin-lim` · Processing → Spectrum

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the initial phases; no effect outside the « Random » mode. The default is fixed: a reconstruction that changes on every run would be a defect. |
| FFT | number | 2048 samples | 64 – 8192 samples, step 64 | FFT size (rounded up to next power of 2). |
| Overlap | choice | 75 % | 50 % / 75 % | Overlap between frames. 75% gives a smoother result. |
| Mix | number | 100 % | 0 – 100 %, step 1 | Dry/wet balance. |

#### Harmonic Sieve

`crible-harmonique` · Processing → Spectrum

*Keeps - or removes - only the components near chosen harmonics of a fundamental: a noise becomes a chord, a sound loses its even partials.*

The sieve is a harmonic series: the fundamental and its multiples, whose ranks one chooses - all, odd, even, primes, or a written list. Each component of the sound near a kept rank passes; the others are removed. In remove mode, the reverse. On a noise, the sieve cuts out a chord: the breath takes on the pitch of the fundamental and the timbre of the chosen ranks - odd ones give a hollow, clarinet-like sound; primes, a strange sound, sparse towards the top. On a harmonic sound with the same fundamental, partials are removed, or only some kept. On a sound of another pitch, only the meeting points survive. The tolerance, in cents, says how far from a harmonic a component still passes: narrow, the result is pure and whistling; wide, it keeps some matter around each partial. The fundamental can follow a curve: the sieve then glides, and the chord it cuts glides with it. After the « spec pick » program of the Composers' Desktop Project.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Fundamental modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Fundamental | slider | 110 Hz | 20 – 2000 Hz, step 0.5 | Fundamental of the harmonic series that forms the sieve. |
| Ranks | choice | All | All / Odd / Even / Primes / List | The harmonics kept. Primes: 1, 2, 3, 5, 7, 11... List: the ranks written below. |
| Rank list | text | `1 2 3 5 8 13` |  | For « List »: the ranks kept, separated by spaces or commas. |
| Tolerance | slider | 30 cents | 2 – 200 cents, step 1 | Distance from a harmonic within which a component passes. |
| Mode | choice | Keep | Keep / Remove | Keep: only the kept harmonics pass. Remove: only they are taken out. |
| Fundamental min | slider | 55 Hz | 20 – 2000 Hz, step 0.5 | Fundamental that a connected curve's zero means; the travel is multiplicative. With no curve, this setting does nothing. |
| Fundamental max | slider | 220 Hz | 20 – 2000 Hz, step 0.5 | Fundamental that the curve's one means. |

#### Harmonic/Percussive Separation

`separation-harmonique-percussive` · Processing → Spectrum

*Separates what sustains from what strikes, by median filtering the spectrogram (Fitzgerald, DAFx-10).*

Splits a sound in two: what sustains and what strikes. After Derry Fitzgerald, « Harmonic/Percussive Separation using Median Filtering », 13th International Conference on Digital Audio Effects (DAFx-10), Graz, 2010 — arrow.tudublin.ie/argcon/67. The idea fits in two sentences, and that is what makes it beautiful. On a spectrogram, a sustained note is a horizontal line — same frequency band, many frames — and a percussive hit a vertical line — same instant, every frequency at once. A median filter along time therefore erases what is brief and keeps what lasts; the same filter along frequency does exactly the opposite. Two passes, two masks, two sounds. This is not the AI Separator, and the two serve different purposes: that one looks for instruments — voice, drums, bass — with a model of several tens of megabytes; this one looks for nothing, has no model, runs in seconds and works on any material, including material no network has ever seen. It serves where the other has nothing to say: reverberating sustains without drowning attacks, compressing attacks without pumping on sustains, replacing a drum part while keeping the harmony, or simply looking at what a sound is made of — the message states the percussive share. The property that matters: the two masks are complementary, their sum is one at every point. The two outputs added back together therefore give the original sound, sample for sample — nothing is lost and nothing is invented between them, which a mask allows and a resynthesis would not. It is checked by a test, and it is what licenses saying that one has separated rather than transformed. The three settings read together: the window decides what can be distinguished, the two filter lengths what counts as « lasting » and « wide », and the split how firm the verdict is on ambiguous material.

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

#### Inner Glissando

`glissando-interieur` · Processing → Spectrum

*Keeps the sound's formant envelope and puts an endless glissando underneath: Risset's illusion, dressed in a real timbre.*

After Trevor Wishart, « Audible Design » (1994), who calls it « inner glissando ». The illusion itself is Roger Shepard's (1964), made continuous by Jean-Claude Risset. What this node adds to the « Risset Glissando » already present. That one produces the illusion bare — a synthetic sound rising endlessly, which sounds like a laboratory demonstration. Here the illusion passes through someone's mouth: the input's formant envelope is kept, and it decides the timbre. A vowel stays the same vowel while the pitch rises without end. Why it works. The formant envelope is what makes a vowel an « ah » or an « oo »: it does not depend on the pitch one sings at. That is exactly why one can change one without touching the other. The node extracts that envelope by smoothing the spectrum — broad bumps survive, fine lines vanish — then places beneath it partials an octave apart whose amplitude follows a fixed bell: each is born low, crosses, dies high, and one never catches either its appearance or its disappearance.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Speed | slider | 0.5 oct/s | -4 – 4 oct/s, step 0.1 | Octaves per second. Positive: it rises endlessly. Negative: it falls. At zero the partials stay put and one hears the sound's timbre laid over a stack of octaves. |
| Octaves | slider | 6 | 3 – 10, step 1 | How many octaves the illusion stacks. Below three the bell is too narrow and one hears partials appear: the illusion breaks. |
| Smoothing | slider | 20 | 0 – 80, step 1 | Width of the smoothing that separates formants from partials, in components. Too little and the original's partials survive, blurring the glissando. Too much and the envelope flattens: the timbre vanishes and one falls back on the bare illusion. |
| Resolution | choice | Ordinary (2048) | Sharp in time (1024) / Ordinary (2048) / Sharp in frequency (4096) / Very sharp (8192) | Analysis window size, in samples. The choice is a trade-off with no right answer: a short window places moments well and separates neighbouring frequencies badly; a long window does the opposite. At 44,100 Hz, 1024 samples see 23 ms and separate 43 Hz; 8192 see 186 ms and separate 5 Hz. On a voice or a percussion, go short; on a pad or a chord to untangle, go long. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of processed sound. At 0 %, the output is the input, unchanged. |

#### Phase Reconstruction (PGHI)

`phase-pghi` · Processing → Spectrum

*Rebuilds a sound from its spectrogram magnitudes alone, without iterating: the phase is read from the magnitude's gradient.*

Rebuilds a sound from its spectrogram magnitudes alone, without iterating. After Zdenek Prusa, Peter Balazs and Peter L. Sondergaard, « A Noniterative Method for Reconstruction of Phase from STFT Magnitude », IEEE/ACM Transactions on Audio, Speech and Language Processing 25(5), 2017 — the PGHI algorithm. What existed badly: Attic has a Griffin-Lim node, which iterates — it projects alternately onto the wanted magnitudes and onto the set of true spectrograms, sixty times, starting from a randomly drawn phase. That is the 1984 method, and it has two faults no number of iterations fixes: it starts from nothing, and it falls into a local minimum that depends on the initial randomness — two renders never give the same sound. Pghi's idea: phase is not independent of magnitude. For a gaussian window the two are linked exactly — the phase's derivative in time equals the angular frequency plus the log-magnitude's derivative in frequency divided by the window's parameter; and the phase's derivative in frequency equals minus the log-magnitude's derivative in time times that same parameter. The phase gradient can therefore be read off the magnitude, which is known, and all that remains is to integrate it. The second move in the paper is what separates it from a naive integration: integration does not proceed in an arbitrary order but starting from the strongest magnitudes, through a priority heap, stopping where energy falls below the tolerance. The reason is that the gradient is reliable where there is energy and meaningless where there is none: integrating across an empty region would propagate noise through everything else. Hence the name: phase gradient heap integration. Regions separated by emptiness are integrated independently — the node reports their number as islands — which is of no consequence, only phase differences being audible. Measured, as spectral convergence, the paper's measure: on a harmonic sound, PGHI alone gives -18 dB in 30 ms, ten Griffin-Lim passes -6 dB in 40 ms, a hundred passes -21 dB in 350 ms, and PGHI followed by ten passes -26 dB in 70 ms. In other words: better than a hundred passes, for a fifth of the time. Its limit, stated rather than left to be discovered: on noise the phase-magnitude relation is worth nothing, there being no structure to follow — measured, -8 dB for PGHI against -14 for ten Griffin-Lim passes. Refinement makes up for it, which is why the node refines by default. The node measures its own reconstruction and announces it in decibels: enough to know what the result is worth without having to listen to it.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Window | choice | 1024 | 512 / 1024 / 2048 / 4096 | Transform size. The window is gaussian rather than the Hann used elsewhere in Attic: it is the only one for which the relation between phase and magnitude is exact, and that relation is the whole algorithm. |
| Refinement | slider | 10  passes | 0 – 60  passes, step 1 | Griffin-Lim passes applied after PGHI, as the paper recommends: PGHI does not replace iteration, it gives it a starting point that makes sense. Measured on a harmonic sound: PGHI alone gives −18 dB of spectral convergence, ten Griffin-Lim passes alone −6, a hundred passes −21, and PGHI followed by ten passes −26, for a fifth of the hundred passes' computation time. At zero, you hear PGHI on its own. |
| Tolerance | choice | 10⁻⁶ | 10⁻⁸ / 10⁻⁶ / 10⁻⁴ / 10⁻² | Below this fraction of the strongest magnitude, a point is not integrated and keeps zero phase. This is no detail: integrating across an empty region would propagate noise through the rest of the spectrogram, and that is precisely what the paper avoids by starting from the strongest magnitudes. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of reconstructed sound. At 0 %, the output is the input. |

#### Sines + Transients + Noise (STN)

`stn-sinus-transitoires-bruit` · Processing → Spectrum

*Splits a sound into three materials — what sustains, what strikes, what breathes — losing nothing.*

Splits a sound into three materials — what sustains, what strikes, what breathes — and loses nothing on the way. After Leonardo Fierro and Vesa Valimaki, « Enhanced Fuzzy Decomposition of Sound Into Sines, Transients, and Noise », Journal of the Audio Engineering Society 71(7-8), 2023, pp. 468-480; the three-way decomposition goes back to Scott Levine and Julius O. Smith III (AES 1998), and the median filtering that makes it so simple to Derry Fitzgerald (DAFx-10). What was missing: Attic already split in two, twice — harmonic/percussive by median filtering, and SMS into deterministic plus stochastic — but neither isolates transients: harmonic/percussive separation files them with the percussive part, SMS with the noise. Yet the attack is what makes an instrument recognisable, and it is the material one wants to treat on its own: stretching a sound without smearing its attacks, softening a percussion without killing its tail, bringing out breath without detuning what carries it. Two Windows, and that is the whole problem: a partial only shows on a long window — it takes time to establish that a frequency lasts — and an attack only on a short one, since in a long window it is already diluted into the tens of milliseconds around it. A single analysis therefore cannot do both: first remove what sustains, then look for what strikes in what remains. The order cannot be swapped — the other way round would take the beginning of every sustained note for an attack. The fuzziness is the paper's contribution: a spectrogram point is not necessarily sinusoidal OR noisy, it can be both, and the mask goes from zero to one along a raised-cosine ramp rather than a step — which avoids clicks on points crossing the boundary. Reconstruction is perfect: the three masks sum to one at every point, so the three outputs added together give back the original sound, sample for sample (measured: 6.4e-8 maximum deviation, that is floating-point rounding and nothing else). This is not an elegance, it is what allows one material to be reworked and the whole reassembled without the sum betraying the split. Measured: on one and the same sound with attacks added, the transient path swells nineteenfold while the sine path does not move (x1.00); adding breath, the noise path swells thirty-sixfold, the sines still unmoved. How this node differs from SMS: SMS tracks each partial through time, which lets one transpose it without touching the breath; it is slower and says nothing about attacks. STN tracks nothing, cuts in three by texture, and costs three tenths of a second for two seconds of sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Sines | audio |  |
| output | Transients | audio |  |
| output | Noise | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Sines window | choice | 4096 | 2048 / 4096 / 8192 | Window of the first pass. It must be long: it takes time to establish that a frequency lasts. Too short, and partials no longer stand out from the rest. |
| Transients window | choice | 512 | 256 / 512 / 1024 | Window of the second pass. It must be short: in a long window an attack is already diluted into the tens of milliseconds around it. This is why there are two passes — a single analysis cannot see both at once. |
| Time filter | slider | 17  frames | 3 – 51  frames, step 2 | Length of the median filter along time, which erases what does not last. |
| Frequency filter | slider | 17  bins | 3 – 51  bins, step 2 | Length of the median filter along frequency, which erases what is narrow — a partial — and keeps what is wide, the noise of an attack. |
| Threshold | slider | 0.7 | 0.5 – 0.95, step 0.01 | How outspoken a spectrogram point must be to fall into a material. High, only the clearest material is kept and the rest goes to noise; low, all three paths fill up quickly. |
| Fuzziness | slider | 0.2 | 0 – 0.6, step 0.01 | Width of the zone where a point belongs to both materials at once, in proportion — this is the paper's contribution. At zero the split goes back to all-or-nothing: cleaner-cut, and noisier on material that is frankly neither. In both cases the three outputs, added together, give back the original sound. |

#### Sinusoids + Noise (SMS)

`sms-sinusoides-bruit` · Processing → Spectrum

*Tracks a sound's partials and sets the rest aside: transpose the harmony without touching the breath.*

Tracks a sound's partials, and sets all the rest aside. After Xavier Serra and Julius O. Smith III, « Spectral Modeling Synthesis: A Sound Analysis/Synthesis System Based on a Deterministic plus Stochastic Decomposition », Computer Music Journal 14(4), 1990; the partial tracking and additive resynthesis follow Robert McAulay and Thomas Quatieri, IEEE Transactions on Acoustics, Speech and Signal Processing 34(4), 1986. The idea: a sound consists of a deterministic part — partials, each with its own evolving frequency and amplitude — and a stochastic part, the rest: a flute's breath, a violin's bow, a piano's attack noise. Separating them allows transforming them separately, and that is the whole point: transposing the partials without touching the breath, making an instrument breathier without detuning it by a hundredth of a tone, removing the noise without dulling the harmony. No phase vocoder allows this, because it does not know what a partial is — it only knows bins. Attic transposed and stretched blindly, reconstructed lost phase, separated what lasts from what strikes; none of those nodes tracked a partial through time. Three things are worth knowing. Each peak's frequency is refined by parabolic interpolation between bins: without it the resolution would be twenty-one hertz at 2048 points, and an A 440 would read as 431 or 452 — the transposition would be wrong. Prominence is what separates a partial from a noise bump, and such a criterion is needed: persistence does not suffice, since neighbouring frames share three quarters of their samples, so a noise bump « persists » too — measured before this criterion, 55 % of white noise passed for deterministic. Finally, two resynthesis paths coexist and do not serve the same purpose: without transposition the partials are cut out of the sound itself by complementary masks, so that partials plus residual give back the original sample for sample — this is tested; as soon as one transposes, they are rebuilt by adding oscillators whose phase is integrated rather than restarted, and rescaled onto the energy of those they replace. The residual is never rebuilt: it is kept as it is.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Partials | audio |  |
| output | Residual | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Transpose | slider | 0  st | -24 – 24  st, step 1 | Transposes the partials only. The residual — breath, bow, attack noise — knows nothing of it and stays where it is: that is what no pitch shifter can do, and it is the whole point of the model. As soon as it is non-zero, the partials are rebuilt by adding oscillators rather than cut out of the original sound. |
| Partials gain | slider | 100 % | 0 – 200 %, step 5 | Level of the deterministic part. At zero, only the breath remains — an instrument without a note. |
| Residual gain | slider | 100 % | 0 – 200 %, step 5 | Level of the stochastic part. At zero, the sound becomes pure additive synthesis, smooth and grainless; beyond a hundred, the instrument gets breathier without detuning by a hundredth of a tone. |
| Threshold | slider | 60  dB | 20 – 90  dB, step 5 | Decibels below each frame's strongest peak under which a maximum is not considered. Low, only dominant partials are tracked; high, weaker ones too, at the risk of taking noise for a partial. |
| Prominence | slider | 12  dB | 0 – 30  dB, step 1 | Minimum height of a peak above the median of its neighbourhood. This is what separates a partial from a noise bump, and one is needed: persistence does not suffice, since neighbouring frames share three quarters of their samples. At zero, white noise passes for half harmonic. |
| Max partials | slider | 60 | 10 – 120, step 5 | Number of peaks kept per frame, strongest first. |
| Window | choice | 2048 | 1024 / 2048 / 4096 | Transform size. Large separates neighbouring partials better but smears attacks; small does the opposite. |

#### Spectral Arpeggio

`arpege-spectral` · Processing → Spectrum

*A narrow band sweeps the spectrum and lets only the partials it touches sound: a held sound is picked out partial by partial.*

A frequency band a few tenths of an octave wide sweeps the spectrum between two bounds, upwards, downwards or both ways. Only the components it covers sound. On a held sound rich in partials - a chord, a voice, a drone - one hears its partials one after another, like an arpeggio the sound contained. The speed says how many sweeps per second; the width, how many partials sound at once. The sweep moves in octaves, so the band spends as long in each octave. The persistence lets a partial ring on after the band has passed: it then decays by 60 dB over the given time. At zero, only what the band touches sounds; long, the partials pile up and the arpeggio becomes a chord building itself. After the « spec arpeg » program of the Composers' Desktop Project.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Speed | slider | 1 Hz | 0.05 – 20 Hz, step 0.05 | Number of sweeps per second. |
| Width | slider | 0.5 oct | 0.05 – 3 oct, step 0.05 | Width of the band that lets through, in octaves. Narrow, one partial at a time; wide, a group. |
| Low | slider | 100 Hz | 20 – 10000 Hz, step 1 | Bottom of the sweep. |
| High | slider | 5000 Hz | 40 – 20000 Hz, step 1 | Top of the sweep. |
| Direction | choice | Up | Up / Down / Up and down | Upwards, downwards, or both ways. |
| Persistence | slider | 0 s | 0 – 10 s, step 0.05 | Time a partial takes to lose 60 dB after the band has passed. 0: it falls silent as soon as the band moves on. |

#### Spectral Blur

`flou-spectral` · Processing → Spectrum

*Averages the spectrum over neighbouring moments: the sound spreads out in time without changing duration.*

After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `blur blur`. What it is not: a stretch. Paulstretch and the phase vocoder lengthen the duration, hence move everything that follows. Here the end arrives on time — but one no longer knows when things began. It is a blur in the photographic sense: motion blur, not slow motion. An attack becomes a swell. A note that changes pitch becomes a held chord, the two pitches overlapping. Spoken text loses its consonants and keeps its vowels. The wider the setting, the further the sound spills beyond itself. Phases are not averaged, only energies: phases carry the grain of the sound, and mixing them would give a signal with no relief.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Width | slider | 24 | 1 – 200, step 1 | Number of moments averaged. At 1, nothing changes. How long that is depends on the resolution: at 2048 and 44,100 Hz one moment is 12 ms, so 24 moments spread the sound over roughly three tenths of a second. |
| Resolution | choice | Ordinary (2048) | Sharp in time (1024) / Ordinary (2048) / Sharp in frequency (4096) / Very sharp (8192) | Analysis window size, in samples. The choice is a trade-off with no right answer: a short window places moments well and separates neighbouring frequencies badly; a long window does the opposite. At 44,100 Hz, 1024 samples see 23 ms and separate 43 Hz; 8192 see 186 ms and separate 5 Hz. On a voice or a percussion, go short; on a pad or a chord to untangle, go long. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of processed sound. At 0 %, the output is the input, unchanged. |

#### Spectral Formula

`formule-spectrale` · Processing → Spectrum

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

#### Spectral Freeze

`gel-spectral` · Processing → Spectrum

*Holds one moment's spectrum for all that follows: a stillness, not a loop.*

After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `blur freeze`. How it differs from the granular freeze already in Attic. That one loops a piece of signal: one hears the loop, its period and its joins, and the sound keeps the grain of the fragment taken. Here an analysis is held — the energies are those of the chosen moment, but the phases keep advancing as though the sound went on. So there is no period, no join, no beating: the sound stops moving entirely. It is the difference between stopping a record on a groove and stopping time. What precedes the chosen moment passes through untouched; from there on the sound freezes and holds to the end.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Moment | slider | 50 % | 0 – 100 %, step 1 | Where the freeze begins, as a proportion of the duration. What precedes passes through unchanged; from there on, that moment's spectrum is held to the end. |
| Resolution | choice | Ordinary (2048) | Sharp in time (1024) / Ordinary (2048) / Sharp in frequency (4096) / Very sharp (8192) | Analysis window size, in samples. The choice is a trade-off with no right answer: a short window places moments well and separates neighbouring frequencies badly; a long window does the opposite. At 44,100 Hz, 1024 samples see 23 ms and separate 43 Hz; 8192 see 186 ms and separate 5 Hz. On a voice or a percussion, go short; on a pad or a chord to untangle, go long. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of processed sound. At 0 %, the output is the input, unchanged. |

#### Spectral Morphing

`morphing-spectral` · Processing → Spectrum

*Travels from one sound to another through the spectrum: in the middle, a timbre that did not exist.*

This is not a crossfade, and that is the first thing to say. A crossfade makes two sounds heard, one leaving and one arriving; in the middle one hears both. A morph makes only one heard, whose timbre moves. Nor is it the catalogue's vocoder, which does cross-synthesis: that one takes the envelope of one and applies it to the other, an asymmetric operation where there is a modulator and a carrier, and where the carrier provides the matter. Here both sounds have the same role, and the setting travels continuously from one to the other. The interpolation is done on the logarithms of the amplitudes, and that detail is the whole subject. Interpolating linearly would let the louder of the two dominate: halfway between a partial at 1 and a partial at 0.01, the mean is 0.505, that is the loud sound to within half a decibel. In logarithm the same midpoint gives 0.1, that is halfway in decibels — the only way to be in the middle for the ear. The phase comes from the dominant sound, the one being leaned towards, rather than from an interpolation: two averaged phases do not make an intermediate phase but an interference, and the result thins out instead of moving. Amplitudes carry the timbre; phase carries the grain. What the method does not do, and it must be written: it interpolates amplitudes bin by bin, it does not pair partials to glide them from one to the other. Between a 200 Hz sine and a 3000 Hz sine the midpoint therefore does not hold a 775 Hz sine: it holds both, at the geometric mean of their amplitudes. On rich sounds this is heard as an intermediate timbre and the centroid confirms it — measured, it goes from 200 to 2640 then to 3000 Hz as one travels. On two isolated sines, the limit shows. A curve connected to the Modulation input travels along the sound: a ramp starts at the first and arrives at the second, a sine goes there and back.

| Port | Name | Type | |
|---|---|---|---|
| input | Sound A | audio |  |
| input | Sound B | audio |  |
| input | Modulation | curve |  |
| output | Audio | audio |  |
| output | Measurements | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Morph | slider | 50 % | 0 – 100 %, step 1 | At 0 % sound A; at 100 % sound B; in between, an intermediate timbre. A curve connected to the Modulation input takes this setting's place. |
| Modulation min | slider | 0 % | 0 – 100 %, step 1 | Morph that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 100 % | 0 – 100 %, step 1 | Morph that the curve's one means. A ramp from zero to a hundred travels all the way from one sound to the other. |
| Window | choice | 2048 | 1024 / 2048 / 4096 | Analysis size. Long, it separates partials better and blurs attacks; short, the reverse. Two thousand and forty-eight points are forty-six milliseconds at 44.1 kHz. |

#### Spectral Tracing

`tracage-spectral` · Processing → Spectrum

*Keeps only the loudest partials of each moment: a complex sound becomes a few interweaving lines.*

After Trevor Wishart, « Audible Design » (1994), and the Composers Desktop Project's `spec trace`. At every moment the sound is broken into a few hundred components, and this node keeps only the loudest. It is not a filter, and the difference is what makes the process interesting: a filter keeps a region of the spectrum decided in advance, the same from start to finish; tracing keeps what is loud, wherever it sits, and its choice changes at every moment. It follows the sound instead of cutting it up. With a single component kept, one hears the dominant partial moving — a melody the sound contained without one hearing it, and that nothing else brings out. With sixty or so, one hears the sound stripped of its background noise. In between, one hears lines interweaving: this is what Wishart calls tracing.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Components | slider | 12 | 1 – 200, step 1 | Number of components kept at each moment. At 1, the dominant partial alone. Beyond a hundred or so the effect becomes hard to hear on most sounds: there is not much left to throw away. |
| Resolution | choice | Ordinary (2048) | Sharp in time (1024) / Ordinary (2048) / Sharp in frequency (4096) / Very sharp (8192) | Analysis window size, in samples. The choice is a trade-off with no right answer: a short window places moments well and separates neighbouring frequencies badly; a long window does the opposite. At 44,100 Hz, 1024 samples see 23 ms and separate 43 Hz; 8192 see 186 ms and separate 5 Hz. On a voice or a percussion, go short; on a pad or a chord to untangle, go long. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of processed sound. At 0 %, the output is the input, unchanged. |

#### Wavelets

`ondelettes` · Processing → Spectrum

*Analyses the sound with wavelets — short window in the treble, long in the bass — and keeps only the coefficients that carry something.*

After Ingrid Daubechies, « Orthonormal bases of compactly supported wavelets », Communications on Pure and Applied Mathematics 41(7), 1988; thresholding comes from David Donoho and Iain Johnstone, « Ideal spatial adaptation by wavelet shrinkage », Biometrika 81(3), 1994, and averaging over shifts from Ronald Coifman and David Donoho, « Translation-invariant de-noising », 1995. What a wavelet has that the Fourier transform has not. A short-term transform imposes one single window on the whole sound: long, it separates pitches finely and smears attacks; short, it places attacks and blurs the bass. You must choose once and for all, and the choice is always wrong somewhere. A wavelet does not choose: it looks at the highest octave through a short window, the next one through a window twice as long, and so on down to the bass. It is the grainlet principle — short highs, long lows — but exact, and reversible. Reconstruction is perfect, and that is the one point that is not negotiable. Without touching the coefficients, the node returns the input sound to within a ten-millionth: that is what « Reconstruct » lets you check for yourself, and what a test demands of each of the four wavelets on noise, the hardest signal there is. What thresholding really brings. Noise spreads over every coefficient; a structured sound concentrates into a few. Erasing the small coefficients therefore erases mostly noise. The risk, when measuring that gain, is to applaud oneself for a plain low-pass: on a held note, cutting the treble alone would win decibels. The decisive test therefore uses broadband clicks, which no band cut can clean — the control that zeroes the very same bands gains 0.01 dB there, and thresholding 11 dB. The difference is what sparsity brings, and nothing else. Shifts are worth their cost. A decimated transform is not translation invariant: the same sound moved forward by one sample does not give the same coefficients, and a characteristic shimmer is left around attacks. Processing the sound at several shifts and averaging removes it, since the artefacts depend on the shift and the sound does not. Four shifts are usually enough; beyond that, cost rises faster than gain. A useful warning. With few levels, the whole bass escapes processing: the node then behaves partly as a filter, and a narrowband sound will look beautifully cleaned without wavelets having much to do with it. The honest setting reaches for enough levels that the sound's own band is thresholded too. The second output returns exactly what was removed. If you hear the sound there rather than the hiss, the threshold is too strong — the ear says so in a second, where no number would.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Removed | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Operation | choice | Denoise | Reconstruct / Denoise / Keep the strongest | What is done with the coefficients. « Reconstruct » leaves them alone, and serves to check that the transform does return the input sound untouched. « Denoise » erases coefficients smaller than Donoho's threshold, estimated from the sound's own noise. « Keep the strongest » retains only a chosen share of them whatever the noise level — a sketch of the sound, in the manner of atomic decomposition but for a cost beyond comparison. |
| Wavelet | choice | Daubechies (8) | Haar (2) / Daubechies (4) / Daubechies (6) / Daubechies (8) | The shape of the elementary wave, given by its number of coefficients. Haar is a plain step: it sees only jumps, and returns them with their corners. The Daubechies wavelets are smoother the longer they are, and the better they ignore the regular parts of the sound — which concentrates the information into fewer coefficients and makes thresholding more effective. The price is a spread in time: a long wavelet places an attack less sharply. |
| Levels | slider | 6 | 1 – 12, step 1 | How far down in octaves to go. Each level halves the band that remains: at one level, only the highest octave is analysed; at six, you reach down to around 340 Hz. Everything below is not processed at all — which is the trap of this setting, since a bass-heavy sound will then look cleaned by the mere fact that it was left alone. The report states which bands were actually reached. |
| Threshold strength | slider | 0.6 | 0 – 2, step 0.05 | Multiplies Donoho's universal threshold, which is the smallest threshold that erases pure noise almost surely. At one it is often too severe on sound and takes attacks away with the hiss; measurements put the optimum near 0.6 for hard thresholding and 0.4 for soft. At zero, nothing is erased. No effect on « Keep the strongest », which sets its threshold otherwise. |
| Thresholding | choice | Soft | Soft / Hard | Soft subtracts the threshold from the coefficients it keeps instead of cutting sharply. It loses a little of the sound, but avoids the shimmer of a coefficient crossing the line back and forth from one instant to the next. Hard often measures better and often sounds worse: judge it on the « Removed » output. |
| Shifts | slider | 4 | 1 – 8, step 1 | How many shifted versions of the sound to process before averaging them. A decimated transform is not translation invariant, and the shimmer it leaves around attacks depends on where the sound sits in the file; averaging cancels it. Cost is proportional: four shifts, four times the computation, for about a decibel of gain that then dries up. |
| Share kept | slider | 5 % | 0 – 100 %, step 0.5 | The share of coefficients that « Keep the strongest » retains. At five per cent, a held sound keeps nearly all its energy and noise keeps only a third: that is the very measure of its sparsity. Going lower gives an ever rougher sketch, and an ever more interesting one to listen to. No effect on the other two operations. |

#### Window Shuffle

`melange-fenetres` · Processing → Spectrum

*Cuts the sound into very short blocks and moves them in time: the sound becomes a cloud of its own instants.*

The sound is cut into blocks a few tens of milliseconds long, and each block is moved in time, by at most the range. At zero range, nothing moves. Short, the sound blurs in place: a phrase stays recognisable but shivers. Long, the instants mix over the whole duration, and the sound becomes a texture that keeps its timbre and loses its unfolding. The block length sets the grain: short, they melt into a continuous matter; long, one recognises fragments trading places. Each block is resynthesised with phases suited to its new place, so the joins do not click. The sound keeps its duration, and nothing is lost or repeated: every instant of the sound is heard once, elsewhere. Same seed, same shuffle. After the « blur shuffle » program of the Composers' Desktop Project.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Block length | slider | 50 ms | 12 – 2000 ms, step 1 | Length of a moved block. Short, a continuous matter; long, recognisable fragments. |
| Range | slider | 1 s | 0 – 60 s, step 0.05 | How far a block can move from its place. 0: no movement. |
| Seed | number | 42 | 1 – 999999, step 1 | Same seed, same shuffle. |

### Stereo

| Component | Summary |
|---|---|
| [Ambisonic Rotation](#ambisonic-rotation) | Encodes the take as a sound field, turns it around the listener, and brings it back down to stereo. |
| [Auto-pan](#auto-pan) | Automatic left/right sweep (animated panning). |
| [Bass Mono](#bass-mono) | Collapses the bass of both channels below a crossover, and leaves the treble untouched. |
| [Center/Side Extract](#centerside-extract) | Separates stereo center from sides. |
| [Channel Splitter](#channel-splitter) | Splits a stereo signal into two mono outputs (left and right). |
| [Doppler](#doppler) | A source going past: the pitch rises as it approaches, tips over at the closest point, and falls as it recedes. |
| [Hard panner](#hard-panner) | Switches the sound fully to the left, center, or right. |
| [Merge to Stereo](#merge-to-stereo) | Joins two mono takes into one stereo: the first on the left, the second on the right. |
| [Resonance Audio](#resonance-audio) | Binaural 3D spatialization of a sound using Resonance Audio (HRTF + room model). |
| [Spaciousness](#spaciousness) | Widens a sound instead of raising it: early reflections that differ for each ear, at constant loudness. |
| [Stereo Spatialization](#stereo-spatialization) | Positions the sound in stereo space (left/right). |
| [Stereo Width / MS](#stereo-width--ms) | Adjusts stereo width and Mid level. |
| [Swap Channels](#swap-channels) | Swaps left/right channels. |

#### Ambisonic Rotation

`ambisonique` · Processing → Stereo

*Encodes the take as a sound field, turns it around the listener, and brings it back down to stereo.*

After Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio Engineering Society 21(1), 1973, and the Ambisonic system's B-format convention. Attic can already place a sound in space — the HRTF panner, Resonance Audio's scene. Both place a source. Neither can take a whole recording and turn it around the listener, which is exactly what ambisonics brings: the sound field is represented by four quantities independent of any loudspeaker, and a rotation there is a simple rotation of two of them. Turning a stereo scene otherwise would require separating the sources, which nobody can do cleanly. Pressure and height do not turn: one has no direction, the other is the axis of rotation. Turning a scene therefore costs two multiplications per sample, and that is the format's reason for being. What this node does not claim to do: recover the original scene. It reconstitutes a plausible one — two sources at the usual listening angles — and treats it as a field. With no rotation it renders the two channels in the right order, the image narrowed by the decoding and the level multiplied by 1.5 — measured, that is 3.5 dB more: encoding followed by decoding is not unity gain, and this node does not normalise, failing which the rotation would only be heard as a level change. A mono take has no scene to turn, and that is the first thing to know before trying. Two identical channels give a field whose left-right component is L−R, hence zero: only one direction remains, and turning it moves the source to one side instead of turning anything. Measured on a frequency generator: at 90°, 9.5 dB between the channels — a plain pan, which is audible; at 180°, strictly nothing, since swapping two identical channels leaves them identical, only the level dropping. The node therefore shows the directional share of the field it received: at zero, no angle will change its output. To hear it turn, give it an image that already exists — two panned sources, a widener upstream — and a curve on the Modulation input.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rotation | slider | 90 ° | -180 – 180 °, step 1 | How far the scene turns, counter-clockwise. At 180° left and right are swapped; at 90°, what was on the left comes to the front. On a mono source that swap is inaudible — two identical channels swapped stay identical — and only the level drops; it is at 90° that a mono source moves, by 9.5 dB. A curve connected to the Modulation input turns the scene continuously, which is far more audible than a fixed angle. |
| Source spread | slider | 90 ° | 30 – 180 °, step 5 | Angle between the two sources whose scene is reconstituted. Narrow, the take is treated as two voices almost in front; wide, as two voices at the sides. Contrary to expectation, wide is not more striking, and at the extreme it is the opposite: the share of the field a rotation can move is the cosine of half this spread on a mono take — 0.71 at 90°, and zero at 180°, where no angle changes anything any more. On a true stereo take, 180° does not turn the image either: a quarter-turn there makes the two channels identical, measured — it crushes the image instead of turning it. Ninety degrees is the setting that really turns. |
| Decoder width | slider | 90 ° | 30 – 180 °, step 5 | Angle between the two virtual microphones of the decoding. Narrow, the image is tight but coherent; wide, it separates further at the cost of a dip in the centre. |
| Modulation min | slider | 0 ° | -360 – 360 °, step 5 | Rotation that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 360 ° | -360 – 360 °, step 5 | Rotation that the curve's one means. From zero to 360°, a ramp makes the scene turn a full circle. |

#### Auto-pan

`auto-pan` · Processing → Stereo

*Automatic left/right sweep (animated panning).*

Automatic stereo sweep: the sound moves periodically between left and right. Adjust the rate (sweep speed, 0.1 to 20 Hz) and depth (amplitude, 0 to 100%). At low frequencies, creates a floating effect; at high frequencies, approaches a Leslie/vibrato stereo effect.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Rate modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Rate | slider | 2 Hz | 0.1 – 20 Hz, step 0.1 | Sweep speed (round trips per second). |
| Depth | slider | 80 % | 0 – 100 %, step 1 | Sweep depth (0% = static, 100% = extreme left to extreme right). |
| Rate min | slider | 0.5 Hz | 0.1 – 20 Hz, step 0.1 | Rate that a curve's zero means on the Rate modulation input: the sway that speeds up. The travel is multiplicative, as for any frequency. With no curve, this setting does nothing. |
| Rate max | slider | 8 Hz | 0.1 – 20 Hz, step 0.1 | Rate that the curve's one means. |

#### Bass Mono

`mono-grave` · Processing → Stereo

*Collapses the bass of both channels below a crossover, and leaves the treble untouched.*

Three reasons to collapse the bass, and none is a studio superstition. Cutting first: a record groove carries the sum of the channels on one axis and their difference on the other, so a decorrelated bass throws the cutting stylus out of the groove — the plant refuses the record or lowers its level. The room next: below a hundred hertz or so, the wavelength exceeds three metres, the ear localises nothing there, and two different basses only produce an energy flutter depending on where one stands. Nothing is lost by joining them. The mono sum last: it is in the bass that cancellations cost the most, because that is where the energy is. The processing is a high-pass on the side, and nothing else. That is the formulation that makes the operation exact, and a first attempt had not found it: it split each channel into two bands and joined the low one. Two faults, both measured by the tests. The high band obtained by subtraction kept a great deal of bass — at 50 Hz under a 120 Hz crossover, half the amplitude remained, because a filter shifts phase and a subtraction does not remove what has been phase-shifted. And the measure returned looked at the internal bands rather than the output: it announced a perfect correlation for a job half done. Written on the side, everything becomes exact. The mid is never filtered, so the mono sum comes out bit for bit whatever the setting — the property one wants most here, and it is free. At zero amount the input comes out as it went in, without even a phase shift. The node says what it did: by how much the low side fell, and what the correlation of the two channels below the crossover becomes. The first figure depends on the distance to the crossover, as with any filter — measured under 120 Hz: -22.7 dB for a side at 50 and 70 Hz, -40.9 dB at 30 and 40 Hz.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Crossover | slider | 120 Hz | 40 – 400 Hz, step 5 | Frequency below which the side vanishes. A hundred and twenty hertz is common practice; a record cut often asks for higher, headphone listening needs less. |
| Amount | slider | 100 % | 0 – 100 %, step 1 | At 100 % the low side vanishes entirely; at 50 % half of it remains. The setting is useful, because a fully mono bass sometimes tightens a reverberation one had wanted wide. |

#### Center/Side Extract

`extraction-centre-cote` · Processing → Stereo

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

`separateur-canaux` · Processing → Stereo

*Splits a stereo signal into two mono outputs (left and right).*

Splits a stereo signal into two distinct mono outputs: the 'Left' output contains only the left channel (L), the 'Right' output only the right channel (R). If the input is already mono, both outputs receive the same signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Left | audio (mono) |  |
| output | Right | audio (mono) |  |

*No parameters.*

#### Doppler

`doppler` · Processing → Stereo

*A source going past: the pitch rises as it approaches, tips over at the closest point, and falls as it recedes.*

The effect described by Christian Doppler in 1842. Attic can place sounds in space — the HRTF panner, Resonance Audio's scene — but it cannot move anything: its sources are set down and stay there. This node does not transpose the sound by a computed ratio. It sets the delay equal to the time sound takes to cover the distance, and lets the pitch shift fall out of that on its own. This is what gives the right tipping point at the moment of passing, where a fixed-ratio transposition goes wrong: the radial velocity reverses there, and no constant ratio can describe it. The point worth knowing, because it was measured: the distance is taken at the instant of emission, not of arrival. Taking the arrival instant amounts to moving the listener rather than the source, and gives a pitch too low by twenty-four hundredths of a semitone — enough to be heard on a sustained sound.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Speed | slider | 30 m/s | 1 – 120 m/s, step 1 | Speed of the source. 30 m/s is 108 km/h, a car's pace on a road. Beyond the speed of sound the effect stops making physical sense: the source would catch up with what it emitted. |
| Distance | slider | 10 m | 0.5 – 100 m, step 0.5 | How close the pass comes. It decides how abrupt the tipping is: from very close the pitch drops at once; from far away it glides at length. It also decides how fast the image crosses the stereo field. |
| Speed of sound | slider | 343 m/s | 200 – 500 m/s, step 1 | Speed of sound. 343 m/s at 20 °C at sea level; 331 at zero degrees, 1480 in water. Lowering it exaggerates the effect without changing its shape, which is a handy way of hearing it better. |
| Attenuation | choice | Yes | Yes / No | Apply the one-over-distance level drop. Without it, one keeps the pitch shift and the movement across the field, but the source seems to stay as close — which is sometimes exactly what one wants. |

#### Hard panner

`hard-panner` · Processing → Stereo

*Switches the sound fully to the left, center, or right.*

Switches the sound fully to the left, center, or right. Useful for testing a mono chain, forcing an extreme position, or fixing a wiring mistake. Input can be stereo or mono; output is always stereo.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Position | choice | Center | Left / Center / Right | Pan position: hard left, center, or hard right. |

#### Merge to Stereo

`fusion-stereo` · Processing → Stereo

*Joins two mono takes into one stereo: the first on the left, the second on the right.*

The inverse of the channel splitter, which existed alone: one could take a stereo apart without being able to put one together. It is the gesture of every two-microphone take — two mono files, two separate processing chains, and a stereo at the end. The length is that of the longer one, and the shorter is padded with silence rather than looped or stretched: two takes of different lengths are not the same take, and making their ends coincide would invent an alignment nobody asked for. If that alignment is wanted, the « Track Aligner » node does it, and says so.

| Port | Name | Type | |
|---|---|---|---|
| input | Left | audio |  |
| input | Right | audio |  |
| output | Audio | audio (stereo) |  |

*No parameters.*

#### Resonance Audio

`resonance-audio` · Processing → Stereo

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

#### Spaciousness

`ampleur` · Processing → Stereo

*Widens a sound instead of raising it: early reflections that differ for each ear, at constant loudness.*

After Vesa Välimäki and colleagues on velvet noise — « A perceptual study on velvet noise and its variants at different pulse densities », IEEE Transactions on Audio, Speech and Language Processing 21(7), 2013. What no existing node does. « Stereo Width / MS » decodes into mid and side then raises the side: on a mono source the side is the difference of the two channels, hence zero, and amplifying zero gives zero. Stereo delay and chorus likewise manipulate a difference that must already exist. No tool in the catalogue can create that difference when there is none. And the six reverbs all have a tail, whereas filling the room is the work of early reflections. The two mechanisms are one. A reflection pattern that differs for each channel decorrelates and gives room body in a single gesture — and that is what a real room does, since your two ears do not receive the same reflections. Early reflections arrive within the precedence window: the ear fuses them with the direct sound rather than hearing them as echoes. The sound grows; nothing repeats. A curve connected to the Modulation input drives the mix, and the room fills or empties along the sound: a ramp opens it from one end to the other, a sine makes it breathe, a curve extracted from the sound itself opens it on the loud passages. It is the mix, and not the four other settings, because those describe the room: it is built once, as a reflection sequence drawn from the given seed. Making them vary continuously would mean rebuilding it at every sample, and « the same seed replays the same room » would no longer mean anything. The mix, for its part, is a gain on what is already computed: it modulates exactly. Loudness moves no more than at a fixed mix — the correction is made on the whole sound, once the mix has been applied. Three figures say whether the promise holds, and the node shows them. Loudness does not move. Each channel returns to its own input level: if the energy rose it would not be spaciousness but gain, the commonest illusion in sound processing. Correlation falls. One means two identical channels, hence a point source wedged between the speakers; zero means a sound with no locatable position. At the default settings it goes from 1.000 to 0.035. The mono sum holds, and that figure must be read correctly. It is not free: a correlation of rho imposes a hold of the square root of (1+rho)/2. Two perfectly decorrelated channels therefore give 0.707, and geometry allows no better — not a loss but the price of width. Measured in the application: a correlation of -0.06 gives 0.68, where the formula predicts 0.686. The node shows both side by side, because it is their gap that signals a fault, never the value alone: a fixed threshold at 0.707 would have cried collapse over a perfectly healthy result.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Modulation | curve |  |
| output | Audio | audio (stereo) |  |
| output | Measurements | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Density | slider | 200 /s | 20 – 400 /s, step 10 | Reflections per second. It is the sparseness of velvet noise that lets it decorrelate without colouring: dense noise would be heard as hiss, a regular comb as a timbre. Measured, at 20 reflections per second the correlation barely moves; at 200 it falls to almost nothing. |
| Window | slider | 80 ms | 5 – 120 ms, step 5 | How long the reflections keep arriving. Below some forty milliseconds the ear firmly fuses them with the direct sound; beyond a hundred they start to be heard as separate echoes. Eighty is where decorrelation is clear without anything standing out. |
| Pre-delay | slider | 12 ms | 0 – 60 ms, step 1 | Silence before the first reflection. This is the cue to the room's size: the sound takes that long to reach the first wall and return. Three milliseconds give a booth, forty a hall. |
| Absorption | slider | 50 % | 0 – 100 %, step 1 | Damping of the later reflections. At zero they all keep the same strength — a room with bare walls. At maximum they die away fast: curtains, books, people. |
| Mix | slider | 100 % | 0 – 100 %, step 1 | Proportion of reflections added. At 0 %, the output is the input, unchanged. Loudness does not change at any setting: only the width moves. A curve connected to the Modulation input takes this setting's place, which then serves no purpose. |
| Modulation min | slider | 0 % | 0 – 100 %, step 1 | Mix that a connected curve's zero means. At zero the room vanishes entirely when the curve falls; at twenty, some of it always remains. With no curve, this setting does nothing. |
| Modulation max | slider | 100 % | 0 – 100 %, step 1 | Mix that the curve's one means. A ramp from zero to a hundred per cent opens the room from one end of the sound to the other; a sine makes it breathe. |
| Seed | slider | 7 | 0 – 999999, step 1 | Seed for the two reflection patterns. The same seed replays the same room. Changing the seed changes the room without changing its dimensions. |

#### Stereo Spatialization

`spatialisation-stereo` · Processing → Stereo

*Positions the sound in stereo space (left/right).*

Positions a mono or stereo sound in stereo space. Uses an HRTF PannerNode for realistic binaural spatialization. Position (-100% to 100%) controls left/right, Width (0% to 100%) controls the effect range. Useful for placing an instrument in a mix or creating a spatial movement effect.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| input | Modulation | curve |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Position | slider | 0 % | -100 – 100 %, step 1 | Stereo position (-100% = left, 0% = center, 100% = right). A curve connected to the Modulation input takes over: the sound then travels instead of sitting still, and what one hears is the curve's path. |
| Width | slider | 100 % | 0 – 100 %, step 1 | Extent of the movement around the position: 0% leaves the sound in the centre, 100% takes it all the way to the set position. The sound is first folded to mono; no effect when the position is centred and no curve is connected. |
| Modulation min | slider | -100 % | -100 – 100 %, step 1 | Position that a connected curve's zero means. With no curve, this setting does nothing. |
| Modulation max | slider | 100 % | -100 – 100 %, step 1 | Position that the curve's one means. |

#### Stereo Width / MS

`largeur-stereo` · Processing → Stereo

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

#### Swap Channels

`echange-canaux` · Processing → Stereo

*Swaps left/right channels.*

Swaps the left and right channels of a stereo signal.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

*No parameters.*

### Stretching

| Component | Summary |
|---|---|
| [Paulstretch](#paulstretch) | Extreme phase-randomization time-stretch (stereo). |
| [Pitch ↔ Rhythm Continuum](#pitch--rhythm-continuum) | Slows a sound until its pitch turns into a pulse. |
| [Slide Stretch](#slide-stretch) | Time-stretch with a factor that gradually changes from start to end. |
| [Spectrum Stretch](#spectrum-stretch) | Spreads or squeezes the partials above a pivot frequency: a harmonic sound becomes inharmonic, gradually if need be. |

#### Paulstretch

`paulstretch` · Processing → Stretching

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the phase randomization. The default is fixed: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character. |

#### Pitch ↔ Rhythm Continuum

`continuum-stockhausen` · Processing → Stretching

*Slows a sound until its pitch turns into a pulse.*

After the discovery Karlheinz Stockhausen formulated while composing "Kontakte" (1960): pitch, timbre and rhythm are not three distinct phenomena but one, observed at three time scales. A pulse repeated 200 times a second is heard as a 200 Hz note; slowed a thousandfold, the same pulse is heard as one beat every five seconds. Nothing changes in the signal but the scale, and yet the ear flips from one category to the other somewhere around 20 Hz. This node is therefore not one more effect but a demonstration: it carries your sound across that boundary, continuously, and you hear the exact point where pitch decomposes into rhythm. Feed it a periodic, clearly articulated source — a pulse train, a sustained note, a short percussive pattern: its periodicity is what becomes the rhythm. On material without clear periodicity, nothing audible happens beyond a slow-down. Mechanically this is variable-speed playback, like the "Tape" mode of the Risset glissando; what changes everything is the span of the sweep — some ten octaves, a factor of a thousand, where a glissando covers a few.

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

#### Slide Stretch

`etirement-glissant` · Processing → Stretching

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

#### Spectrum Stretch

`etirement-spectre` · Processing → Stretching

*Spreads or squeezes the partials above a pivot frequency: a harmonic sound becomes inharmonic, gradually if need be.*

Above the pivot frequency, each component f is moved to pivot × (f / pivot)^k, where k is the stretch. At 1, nothing moves. Above 1, the partials spread apart, the more so the higher they are: with a pivot at 200 Hz and k = 1.5, the harmonics at 400, 600 and 800 Hz land at 566, 1039 and 1600 Hz. Below 1, they squeeze together. What lies under the pivot does not move: set on the fundamental, it keeps the pitch of the sound and changes only its timbre. A stretched harmonic sound turns metallic, then bell-like, then comes apart into separate components. A curve connected to the Stretch modulation input varies k over the sound: that is how a sound is made gradually inharmonic, or brought back to harmony. Processing goes through an amplitude and frequency analysis of each bin of the spectrum, then a resynthesis that rebuilds the phases from the moved frequencies; the duration of the sound does not change. After the « stretch spectrum » program of the Composers' Desktop Project, and Trevor Wishart, « Audible Design », 1994.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Stretch modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Stretch | slider | 1.3 | 0.5 – 2, step 0.01 | The exponent k. 1: no change; above, the partials spread; below, they squeeze together. |
| Pivot | slider | 200 Hz | 20 – 4000 Hz, step 1 | Frequency below which nothing moves. Set on the fundamental of the sound, it keeps its pitch. |
| Stretch min | slider | 1 | 0.5 – 2, step 0.01 | Stretch that a connected curve's zero means. With no curve, this setting does nothing. |
| Stretch max | slider | 1.6 | 0.5 – 2, step 0.01 | Stretch that the curve's one means. |

### Tempo

| Component | Summary |
|---|---|
| [MIDI Speed](#midi-speed) | Plays a MIDI file slower or faster, without touching the pitches. |
| [Phase Vocoder Tempo](#phase-vocoder-tempo) | Changes tempo via phase vocoder (frequency-domain), with transient detection. |
| [Reich Phasing](#reich-phasing) | Lets several copies of a pattern drift apart from one another. |
| [Risset Rhythm](#risset-rhythm) | Turns a loop into a pulse that speeds up (or slows down) endlessly. |
| [SoundTouch Rate](#soundtouch-rate) | Changes playback rate (tempo + pitch together), like a tape player. |
| [SoundTouch Tempo](#soundtouch-tempo) | Changes tempo while preserving pitch (quality time-stretch). |
| [Tempo Canon (Nancarrow)](#tempo-canon-nancarrow) | Layers a pattern against itself at a fixed tempo ratio. |
| [Tempo Change](#tempo-change) | Time-stretch via phase vocoder. |
| [Varispeed](#varispeed) | The tape you speed up or slow down: pitch and duration tied together, drivable by a curve. |

#### MIDI Speed

`vitesse-midi` · Processing → Tempo

*Plays a MIDI file slower or faster, without touching the pitches.*

Plays a MIDI file slower or faster. Attic has stretched time for a long while, but on audio only — phase vocoder, SoundTouch; of the twenty-six nodes that take a MIDI file and return one, none touched the speed, although it is the most ordinary gesture there is: slowing a passage down to learn it, matching two pieces to the same tempo. And on MIDI it is exact where audio can only approximate: nothing is resampled, pitches do not move by a hundredth of a tone, and no artefact appears at four times slower. Three ways of saying the same thing, because one does not think in the same unit depending on the task: a factor when you know what you want — 0.5 plays twice as slow, 2 twice as fast —, a percentage when feeling your way, a target tempo when matching one piece to another, the node then reading the file's tempo and doing the division itself. Two points are worth knowing. The MIDI output is not re-encoded: only its tempo is rewritten, which leaves the tick positions untouched, so channels, program changes, controllers, pedal and track names go through without a scratch — re-encoding from pitches alone would have flattened a two-handed piano part onto a single channel. That is also what keeps the notation right: a quarter note stays a quarter note and the tempo changes, where a naive stretch would double every note value and make the score unreadable. Then, a duration cannot be divided indefinitely: at eight times faster a sixteenth note falls below five milliseconds and is no longer a note but a click. An adjustable floor prevents it, and the number of notes concerned is announced; it only applies to the audio rendered here, the MIDI output keeping its exact durations. A file with a variable tempo keeps its relief, every change being stretched; the node says so, because the tempo it announces is then only the first.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Audio | audio |  |
| output | MIDI | MIDI |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Mode | choice | Factor | Factor / Percentage / Target tempo | How to state the speed. « Factor » when you know what you want, « Percentage » when you are feeling your way, « Target tempo » when matching one piece to another — the node then reads the file's tempo and does the division itself. |
| Factor | slider | 1 × | 0.1 – 8 ×, step 0.05 | Playback speed: 0.5 plays twice as slow, 2 twice as fast. This is a speed and not a stretch — durations are divided by it. |
| Percentage | slider | 100 % | 10 – 800 %, step 5 | The same thing as a percentage of the original speed: 75 % for a quarter slower, 200 % for twice as fast. |
| Target tempo | number | 120 BPM | 20 – 300 BPM, step 1 | The tempo to play the file at. The factor follows: a file at 120 played at 90 is slowed to 0.75. The tempo read from the file is recalled in the message. |
| Minimum duration | slider | 20 ms | 0 – 200 ms, step 5 | Duration floor for a sped-up note. At eight times faster, a sixteenth note falls below five milliseconds: that is no longer a note, it is a click. This floor only affects the audio rendered here — the MIDI output keeps its exact durations. |
| Synthesis | choice | Auto | Auto / FM/Oscillators / SoundFont | Auto = SoundFont if an SF2 file is loaded, else FM. |
| Instrument | SoundFont preset | program 0 |  | Preset of the loaded global SoundFont to use for rendering (ignored in FM mode). Load an SF2 file from the toolbar first. Drum kits (bank 128) are included if present. |
| Volume | number | 80 % | 0 – 100 % | Output level, from 0 (silence) to 100%. |

#### Phase Vocoder Tempo

`phase-vocoder-tempo` · Processing → Tempo

*Changes tempo via phase vocoder (frequency-domain), with transient detection.*

Changes tempo via phase vocoder (FFT frequency-domain processing). The « transients » option enables transient detection to preserve drum/pluck attacks. Alternative to native time-stretch and SoundTouch for smoother results at extreme ratios.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 1 x | 0.25 – 4 x, step 0.01 | Tempo factor. 1 = original, 2 = 2x faster, 0.5 = 2x slower. |

#### Reich Phasing

`dephasage-reich` · Processing → Tempo

*Lets several copies of a pattern drift apart from one another.*

Steve Reich stumbled on the process in 1965: two copies of the same tape running on two machines whose motors are not quite in step. Starting in unison, they drift slowly apart — and that drift produces patterns nobody composed. He later moved the process to instruments with "Piano Phase" (1967). What makes it fascinating is how little it costs: no note is added, no processing applied. The composite patterns, the shifting accents, the pseudo-polyrhythm are merely the consequence of a minute speed difference — the music is already entirely in the material; it just has to be offset against itself. The control is the cycle duration: the time after which the offset has travelled a whole loop and the voices meet again in unison. Feed it a short, clearly articulated loop — a piano figure, a rhythmic cell — and a long cycle: slowness is what makes the process hypnotic. Voices are spread across the stereo image, without which you hear mush rather than distinct voices.

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
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied so the source loops without a click. It shortens the loop by that much, which the cycle computation accounts for. |

#### Risset Rhythm

`rythme-risset` · Processing → Tempo

*Turns a loop into a pulse that speeds up (or slows down) endlessly.*

The rhythmic twin of "Risset Glissando": the very same illusion, moved from the pitch axis to the time axis. The node layers several copies of the sound whose tempos are in a 2:1 ratio, all speeding up; a layer that has become too fast has already faded out, the one reappearing slow is still inaudible, so the jump is never heard and the acceleration seems endless. Pitch, however, does not move at all — that is what separates this from the glissando: grains are used whose anchor alone accelerates, while reading inside each grain stays at normal speed. Feed it a clear rhythmic loop (drums, a percussive pattern, an arpeggio): the illusion needs an identifiable pulse. On a continuous pad, next to nothing happens.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Direction | choice | Speeding up | Speeding up / Slowing down | Perceived direction. "Speeding up" is the more striking version: the pulse seems to rush forward forever. |
| Duration | number | 20 s | 1 – 300 s, step 1 | Length of the produced sound. The acceleration being endless, you decide when to cut. |
| Cycle | number | 10 s | 1 – 60 s, step 0.5 | Time for one layer to double its tempo. Short = dizzying rush; long = slow drift, more convincing illusion. |
| Layers | number | 5 | 3 – 8, step 1 | Number of layered copies, hence the tempo range (each layer runs twice as fast as the previous one). Few layers = clearer rhythm; many = dense texture, heavier to compute. |
| Grain size | number | 60 ms | 10 – 200 ms, step 5 | Grain length. Short = attacks better preserved but choppier; long = smoother but attacks get smeared — worth watching on percussive material. |
| Loop crossfade | number | 50 ms | 0 – 500 ms, step 5 | Crossfade applied to make the source loop without a click. Raise it if the source has abrupt ends. |

#### SoundTouch Rate

`soundtouch-rate` · Processing → Tempo

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

`soundtouch-tempo` · Processing → Tempo

*Changes tempo while preserving pitch (quality time-stretch).*

Changes audio tempo while preserving pitch, using the SoundTouch algorithm (advanced phase vocoder). Higher-quality alternative to the native « Tempo Change » node, especially on voice and harmonic signals.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo | number | 1 x | 0.25 – 4 x, step 0.01 | Tempo factor. 1 = original, 2 = 2x faster, 0.5 = 2x slower. |

#### Tempo Canon (Nancarrow)

`canon-nancarrow` · Processing → Tempo

*Layers a pattern against itself at a fixed tempo ratio.*

After Conlon Nancarrow's "Studies for Player Piano". He wrote for player piano because no performer could play what he wanted to hear: the same pattern layered against itself at fixed tempo ratios — 3:4, 5:7, then, in the late studies, irrational ratios. The difference from Reich's phasing is not one of degree but of kind, and it is arithmetic. Reich drifts two copies at almost identical speeds, and the voices meet again periodically. Nancarrow fixes a plain ratio, heard at once as two distinct tempos: if that ratio is rational the canon closes — the voices coincide regularly and a stable composite pattern emerges; if it is irrational it never closes, which is exactly what Nancarrow was after. The node's message tells you after how long the coincidence occurs, or that it will not. Feed it a clear rhythmic loop: two tempos only separate over an identifiable pulse.

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

`changement-tempo` · Processing → Tempo

*Time-stretch via phase vocoder.*

Speeds up or slows down the track while preserving pitch (phase vocoder). Duration changes inversely to speed.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio (stereo) |  |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Tempo (%) | number | 100 % | 25 – 400 %, step 5 | Target tempo. 100=normal, 50=half, 200=double. |
| Window | number | 50 ms | 5 – 400 ms, step 5 | Analysis window size, rounded to the nearest power of two in samples. Short (10 to 30 ms), attacks stay sharp but low sounds blur; long (80 to 200 ms), held sounds stay smooth but attacks smear. |

#### Varispeed

`vitesse-variable` · Processing → Tempo

*The tape you speed up or slow down: pitch and duration tied together, drivable by a curve.*

This node changes the playback speed of a sound, as one speeds up or slows down a tape: pitch and duration move together. An octave up, the sound lasts half as long; an octave down, twice as long, and its grain comes out. It is how Pierre Schaeffer transposed his discs and tapes. The speed can stay fixed, or move: a curve connected to the Transposition modulation input then draws the gesture: speeding up a fall, braking a resonance down into the bass, sliding a sound upwards like a record being spun. The curve follows the source, not the output. Its start acts on the start of the original sound, its end on its end: one writes a gesture laid on the material, and the output duration follows from it. The travel is in semitones, that is by multiplying the speed: from -12 to +12, the middle of the curve gives back the original speed, and every octave lasts as long on the curve. That is how the ear hears a transposition. Speeding up does not fold the highs back. Pushed two octaves up, an 8 kHz sound would rise to 32 kHz, beyond what a file can hold; a naive reading would make it reappear at 12 kHz, a sound that existed nowhere. Tape does not fold back: the reading therefore filters as it speeds up. At zero semitones the source is returned exactly, sample for sample.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Transposition modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Transposition | slider | -12 semitones | -48 – 48 semitones, step 0.1 | How much the tape is sped up (positive) or slowed down (negative). +12: an octave up and half as long; -12: an octave down and twice as long. Four octaves at most either way. |
| Transposition min | slider | -12 semitones | -48 – 48 semitones, step 0.1 | Transposition that a connected curve's zero means. With no curve, this setting does nothing. |
| Transposition max | slider | 12 semitones | -48 – 48 semitones, step 0.1 | Transposition that the curve's one means. |

### Text

| Component | Summary |
|---|---|
| [PDF Extraction](#pdf-extraction) | Extracts already-digital text from a PDF (no OCR) — also detects scanned/image PDFs with no recoverable text. |

#### PDF Extraction

`extraction-pdf` · Processing → Text

*Extracts already-digital text from a PDF (no OCR) — also detects scanned/image PDFs with no recoverable text.*

Extracts already-digital text from a PDF using pdf-inspector (Rust/WASM, https://github.com/firecrawl/pdf-inspector), fully local. This is not OCR: only text already embedded in the file (not a text image) is recovered, in tens to hundreds of ms. Also detects the PDF type (text, scanned, image, mixed) and clearly flags it in the message if some or all pages have no recoverable text — in that case those pages would need to be rasterized and passed to the OCR node separately (not handled here). Format parameter: Plain text (content only) or Markdown (headings, lists, tables reconstructed from the layout).

| Port | Name | Type | |
|---|---|---|---|
| input | PDF file | file | required |
| output | Text | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Format | choice | Plain text | Plain text / Markdown | Plain text: content only. Markdown: headings, lists and tables reconstructed from the PDF's layout. |

### Topology

| Component | Summary |
|---|---|
| [Braid](#braid) | Splits the sound into bands that cross over and under in space, returning to their places after a countable number of patterns. |
| [Dirac Belt](#dirac-belt) | Spins the sound around the listener: after one lap it comes back inverted and cancels, after two it is intact. |
| [Klein Bottle](#klein-bottle) | Endless glissando whose voices come back on the other side every lap: it takes two laps for everything to return. |
| [Möbius Strip](#möbius-strip) | Sends the sound around a Möbius strip: one lap takes it to the other side, two laps bring it back. |
| [Tonnetz](#tonnetz) | Chains chords through the three neo-Riemannian transformations P, L and R, each moving a single voice. |
| [Torus](#torus) | Rotates the sound's position and level at two speeds: they only meet again at lap q, or never. |

#### Braid

`tresse` · Processing → Topology

*Splits the sound into bands that cross over and under in space, returning to their places after a countable number of patterns.*

Splits the sound into 3 or 4 frequency bands — low, mid, high — and makes them the strands of a braid. Each band occupies a place in the stereo field, the lowest on the left, the highest on the right. The Word describes the pattern: « 1 » makes the strand in place 1 go over the one in place 2, « -1 » under, « 2 » concerns places 2 and 3. At each crossing, two bands glide towards each other's place; the one going over rises 3 dB mid-crossing, the one going under drops 6 dB. Repeated, a pattern brings each band back to its place after a number of repeats set by the permutation it produces — 3 for the classic plait « 1 -2 », 2 for « 1 », 4 for « 1 2 3 » on four strands. The message says whether the strands came back. Bands are cut by masks summing exactly to 1: without crossings, they give back the original sound. Each strand being a point, a stereo input is mixed down to mono. The braid is spread over the sound's length, which is not looped.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Strands | choice | 3 (low · mid · high) | 3 (low · mid · high) / 4 | Number of bands. Three: cutoffs at 250 Hz and 2.5 kHz. Four: at 180 Hz, 900 Hz and 4.5 kHz. At first, the lowest band is on the left and the highest on the right. |
| Word | text | `1 -2` |  | The braid's pattern, as crossings separated by spaces. « 1 »: the strand in place 1 goes over the one in place 2; « -1 »: it goes under; « 2 » concerns places 2 and 3. « 1 -2 » is the classic three-strand plait. Places are counted from left to right. |
| Repeats | number | 3 | 1 – 12, step 1 | Number of times the pattern is played, spread over the sound's length. Strands return to their places after a number of patterns set by the word — 3 for the plait: the message tells you. |
| Relief | number | 100 % | 0 – 100 %, step 1 | Contrast between the strand going over (+3 dB mid-crossing at 100%) and the one going under (−6 dB). At 0%, bands swap places without it being heard which one passes in front. |
| Width | number | 90 % | 0 – 100 %, step 1 | Distance of the outermost places from the centre. |

#### Dirac Belt

`ceinture-dirac` · Processing → Topology

*Spins the sound around the listener: after one lap it comes back inverted and cancels, after two it is intact.*

Hold an object attached to a belt and turn it one revolution: it is back in place, but the belt stays twisted. A second revolution is needed to untwist it. That is the property of rotations in space carried by spinors: 360° flips their sign, 720° restores it. Here the sound circles the listener — front, right, back, left — while its phase turns half as fast. After one lap it is back in front, but inverted; after two, intact. An inverted signal cannot be told from the original by ear: the node therefore places a fixed copy of the sound in front of the listener, the Witness. When the circling sound comes back to the front after one lap, it cancels out completely against it: silence falls at the exact moment it « has come back ». On the second lap, the two add up. Without a witness you hear the circling but not the belt. Stereo limitation: two speakers cannot place a sound behind you; the rear is simulated by a quieter (Rear) and duller (Cutoff) sound. Without head-related transfer functions, this is an approximation. A stereo input is mixed down to mono.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio | required |
| output | Audio | audio (stereo) |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Laps | number | 2 | 1 – 8, step 1 | Number of laps around the listener; one lap lasts the whole sound. Two laps untie the belt. |
| Witness | number | 100 % | 0 – 100 %, step 1 | Level of the fixed copy placed in front of the listener. Without it, the sound's sign change is inaudible. At 100%, the sound coming back to the front after one lap cancels out completely against it; after the second lap, the two add up. |
| Rear | number | 6 dB | 0 – 24 dB, step 1 | Attenuation of the sound when it passes behind. Stereo cannot place a sound behind you: the rear is simulated by a quieter, duller sound. |
| Cutoff | number | 1500 Hz | 300 – 8000 Hz, step 50 | Frequency above which the sound is dulled when it is behind. |
| Crossfade | number | 30 ms | 0 – 500 ms, step 5 | Crossfade at each seam between two laps. Capped at a quarter of the sound's length. |

#### Klein Bottle

`bouteille-klein` · Processing → Topology

*Endless glissando whose voices come back on the other side every lap: it takes two laps for everything to return.*

A Klein bottle is built like a torus — a base circle, and above each point a « fibre » circle — with one difference: going around the base, the fibre comes back flipped as in a mirror, and it takes two laps to come back the right way. Here the base is the range of a Risset glissando, whose top is glued to its bottom: a voice leaving through the high end is reborn in the low end. The fibre is the left/right position, and each glued voice is reborn on the other side. The mirror not being continuous, it is hidden where Risset already hides the octave jump: in silence, the voice being mute at the moment it is glued. All voices start on the same side; the glissando rises endlessly, and the sound migrates from one side to the other voice by voice, through the register, before coming back. The full return requires every voice to have gone around the range twice: 2 × octaves × cycle, and the message says whether the chosen length lets you hear it. Why a mirror and not a rotation: a rotation can be undone, and the object would only be a torus. Each voice being a point, a stereo input is mixed down to mono. As with the Risset glissando, a rich, loosely rhythmic source works best.

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

#### Möbius Strip

`anneau-moebius` · Processing → Topology

*Sends the sound around a Möbius strip: one lap takes it to the other side, two laps bring it back.*

Sends the sound around a Möbius strip. One lap lasts the whole sound; as it moves, the strip turns half a revolution, so after one lap the sound is back where it started… on the other side. A second lap is needed to find it unchanged: that is the strip's property, and the node makes it audible. Stereo side: the strip's width is the stereo width; the image turns continuously and left and right are swapped after one lap. It does not collapse to mono halfway: the component that leaves the left/right plane is carried by a 90° phase shift, which keeps the width intact — at the centre, both channels have the same energy without being the same signal. A mono sound, or a stereo one with identical channels, has no width to turn: it is placed on the strip's edge, starts left, moves right during the first lap and returns during the second. Best heard on headphones. Phase side: the other side is the inverted signal. Rotating its phase at a constant speed amounts to shifting it in frequency by half a hertz divided by the sound's length — 0.05 Hz for a 10 s sound. On its own it is barely audible. With Mix at 50%, the two sides cancel: the whole sound fades out after one lap and returns after two. This is not a phaser's sweep of notches, because the original goes through the same phase shifter: the phase difference is the same at every frequency. Two laps close the strip; an odd number ends on the other side. Since the sound is not a loop, each seam is sewn with a crossfade. The phase shift is accurate to ±0.7° from 20 Hz to 20 kHz; below 20 Hz it degrades. Output is limited to 20 minutes.

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

#### Tonnetz

`tonnetz` · Processing → Topology

*Chains chords through the three neo-Riemannian transformations P, L and R, each moving a single voice.*

Chains chords through the neo-Riemannian transformations. Hugo Riemann drew, at the end of the 19th century, a network in which major and minor triads form adjacent triangles — the Tonnetz — and Richard Cohn turned it in the 1990s into an analytical tool for music where chords follow one another without tonality explaining them: Wagner, Liszt, late Schubert, and by extension much film music. Everything rests on three operations, and each moves a single voice. P swaps major and minor on the same root by moving the third a semitone: C major becomes C minor. L moves by a semitone the note not belonging to the neighbouring chord: C major becomes E minor. R moves by a whole tone: C major becomes A minor. This is called parsimonious voice leading, and it is why these progressions sound connected although they have no tonal relation — between two neighbouring chords, two notes out of three do not move at all. The node places the voices so that this can be heard: without it, root-position chords would jump from one end of the keyboard to the other and the parsimony would stay theoretical. The « Path » mode finds the shortest route between two chords, which gives a distance no tonal analysis provides: measured over the 576 pairs of triads, any two chords are at most five operations apart. C major and G sharp minor, which share no note, are only three apart — the hexatonic pole, and exactly the kind of neighbourhood the Tonnetz reveals and the circle of fifths hides.

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

`tore` · Processing → Topology

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
| [Curve Viewer](#curve-viewer) | Draws a modulation curve and measures it, without altering it. |
| [Emotional Analysis](#emotional-analysis) | Associates an emotion with a track from its music alone (tempo, mode, energy, timbre) — no text or lyrics analyzed. |
| [Genre Classifier](#genre-classifier) | Identifies the musical genre of a song via AI or heuristics. |
| [Goniometer](#goniometer) | Measures stereo width, phase correlation and what the mix would lose in mono. |
| [Harmonic Analysis](#harmonic-analysis) | Detects the key of a song and suggests a chord progression. |
| [Masking](#masking) | Says what one track makes inaudible in another, critical band by critical band. |
| [MusicXML](#musicxml) | Converts MIDI into a MusicXML score, the format MuseScore, Finale and Sibelius read. |
| [Practice Keyboard](#practice-keyboard) | Shows a MIDI file played on an 88-key keyboard, one colour per hand, and says whether it is playable. |
| [RMS (Meyda)](#rms-meyda) | Computes the average RMS level of the signal in dBFS using Meyda. |
| [Roughness](#roughness) | Measures a sound's sensory dissonance over time, after Plomp and Levelt's model. |
| [Self-Similarity Matrix](#self-similarity-matrix) | Draws a piece's form and detects its boundaries, by Foote's method. |
| [Songsee Visualizer](#songsee-visualizer) | Generates an audio visualization image using the Songsee engine. |
| [Spec Sheet](#spec-sheet) | Returns everything measurable about a sound as text: duration, loudness, true peak, crest factor, band shares, correlation, balance, pitch and tuning — with a compliance verdict. |
| [Spectral Centroid (Meyda)](#spectral-centroid-meyda) | Computes the spectral centroid of the signal using the Meyda library. |
| [Spectral Rolloff (Meyda)](#spectral-rolloff-meyda) | Computes the spectral rolloff frequency using Meyda. |
| [Spectrogram](#spectrogram) | Shows how the spectrum evolves over time (time × frequency × intensity). |
| [Spectrum Analyzer](#spectrum-analyzer) | Decomposes the signal into frequencies (FFT) and displays its spectrum. |
| [Tempo Detector](#tempo-detector) | Estimates an audio track's tempo and outputs it as a reusable value. |
| [The Taste of a Sound](#the-taste-of-a-sound) | Places a sound between sweet, sour, bitter and salty, after the published music-taste correspondences, and says what puts it there. |
| [Track Features](#track-features) | The forty measurements track classification uses, for a single track. |
| [VU-meter / LUFS](#vu-meter--lufs) | Measures and displays audio levels: RMS, peak, true peak, LUFS. |
| [Waveform Viewer](#waveform-viewer) | Displays the waveform with zoom and scrollbar. |
| [ZCR (Meyda)](#zcr-meyda) | Counts zero crossings per frame using Meyda. |

#### Aesthetic Comparison

`comparaison-esthetique` · Visualization → Analysis

*Compares two versions of a sound on the four aesthetic axes: one mix against another, a sound before and after processing.*

Compares two versions of the same sound — one mix against another, a sound before and after processing — on the four Audiobox Aesthetics axes (see « Aesthetic Score » for their meaning and limits). Each version is scored in 10 s windows, and the message gives the B − A difference for each axis: connect the original to A and the processed version to B: for CE, CU and PQ, a positive difference is a gain, which the view colours green. Not for PC, which counts components and has no better direction — it stays grey. Measured: an 8-bit Bitcrusher on a spoken announcement loses 0.25 in PQ and gains 0.60 in PC, its quantization noise counting as one more component. Same caution as for the single score: on a creative treatment, a lower PQ does not mean « worse », and PC is meaningless for speech. The two sounds need not have the same length. Scoring takes about 0.6 s per window of each version.

| Port | Name | Type | |
|---|---|---|---|
| input | A | audio | required |
| input | B | audio | required |
| output | Report | text |  |

*No parameters.*

#### Aesthetic Score

`score-esthetique` · Visualization → Analysis

*Scores a sound on four axes — enjoyment, usefulness, complexity, production quality — with each axis' curve over time.*

Scores a sound with Audiobox Aesthetics (Meta, 2025), a model trained on 97,000 speech, music and sound-effect clips rated by listeners, on four axes from 1 to 10. Enjoyment (CE): listening pleasure, emotional impact. Usefulness (CU): how likely the sound is to be reused as material for creation. Complexity (PC): the number of components in the sound scene. Quality (PQ): the technical quality of the production — clarity, dynamics, spectrum, spatialization. The model listens in 10 s windows; the overall score is their average, weighted by each window's actual length, and the view shows each axis' curve: it tells where a track weakens, which the average hides — in the demo collection, a track with an overall PQ of 7.7 has a window at 5.6. The report gives, per axis, the lowest window and its difference from the overall score. Worth knowing before interpreting. PQ judges technical cleanliness, not music: a pure sine scores 7.0 in quality and 2.9 in enjoyment. PQ has learned that a good sound is clean and natural: a deliberately destructive effect (distortion, Cantor dust, inversion mirror) will score low, which says nothing about its artistic value. According to the paper, PC does not correlate with perceived speech quality: for a voice, ignore it. CE and CU are averages of annotators' tastes, tendencies rather than verdicts. Scoring takes about 0.6 s per window on CPU, around ten seconds for a 3-minute song. The model runs as published, and was measured against Meta's PyTorch code: the same scores within 0.00002 over 317 windows, and a conversion to 16 kHz identical to torchaudio's within 2·10⁻⁷ — which matters, as a coarser interpolation shifts the scores by up to 0.13. In the app, two files of the demo collection give the reference scores to the hundredth. Weights licensed CC-BY 4.0 (Meta Platforms).

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

Renders a chaotic attractor or iterated function system (IFS) as image and sound. Each point is computed by iterating nonlinear equations (Lorenz, Rössler, Henon, Ikeda) or affine transformations (Barnsley, Sierpinski). Point density determines the image color. The trajectory is also sonified: x controls the left-channel frequency, y the right-channel frequency, z the amplitude. Image output + audio output.

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

#### Curve Viewer

`visualiseur-courbe` · Visualization → Analysis

*Draws a modulation curve and measures it, without altering it.*

The curve type had eight outputs and eight inputs, and all eight consumers were effects: filter, tremolo, spatialisation, amplifier, spectral delay, Csound scores, ambisonic rotation. So one could drive an effect with a curve without ever seeing the curve, and tune it blind by listening to the result. That is all the more awkward because the point of the method is that a curve can come from the sound itself — the brightness that opens its own filter, the energy that lengthens its own delay: a manufactured curve can be guessed at, a curve extracted from a sound cannot. The curve comes out unchanged on the first output, as the goniometer passes its audio through: the viewer sits in the middle of a chain without cutting it. Put it between the modulation source and the effect. The vertical scale is fixed from zero to one and never adjusts to the content. That is the type's convention: the producer returns values between zero and one, the consumer decides what zero and one mean at its end. A curve that only goes from 0.48 to 0.52 must therefore look flat, because that is exactly what the effect will make of it; an auto-scaled plot would show it wide and lie about its effect. Two curves drawn at the same scale can also be compared. The reduction keeps the minimum and maximum of each column, rather than one value in n. A curve carries two hundred values per second: a minute makes twelve thousand of them for six hundred drawing columns, and taking one value in twenty would make a brief spike vanish — a transient's, precisely what one came to look at. The band drawn runs from the lowest to the highest of each column, and loses nothing. Four figures accompany the plot. Minimum, maximum and mean can be read off the drawing; the agitation, in units per second, says what the extremes confuse. A ramp from zero to one over ten seconds is 0.10; a noise covering the same range ten times a second is worth dozens, for identical minimum and maximum.

| Port | Name | Type | |
|---|---|---|---|
| input | Curve | curve |  |
| output | Curve | curve |  |
| output | Plot | image |  |
| output | Measurements | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Width | slider | 640 px | 240 – 1280 px, step 20 | Width of the plot. It also sets the number of columns: wider means more detail — up to one column per value, beyond which there is nothing more to gain. |
| Height | slider | 200 px | 120 – 480 px, step 10 | Height of the plot. The scale stays from zero to one whatever happens: the height changes the room taken, not the reading. |

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

Measures what the two channels do to each other, and shows it. The figure is a goniometer: each sample becomes a point whose vertical axis carries the sum of the channels — what survives in mono — and whose horizontal axis carries their difference, what disappears. A vertical line is mono, a round cloud is wide stereo, a horizontal line is out of phase. Below the figure, Pearson's correlation, from -1 to +1: above 0.95 the mix is mono or nearly so; near 0 the channels are independent; below -0.2 they oppose each other and the mono sum cancels them. The report also gives each channel's level and the level of the mono sum: the « loss in mono » is how many decibels the mix leaves behind when heard on a single speaker. Three decibels are normal for wide stereo; beyond ten, something is cancelling. Audio passes through unchanged: this node measures, it does not correct. A mono file is reported as mono, which is the truth and not an error.

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

#### Masking

`masquage` · Visualization → Analysis

*Says what one track makes inaudible in another, critical band by critical band.*

After Eberhard Zwicker (Journal of the Acoustical Society of America 33, 1961) for the critical-band scale, and Manfred Schroeder, Brian Atal and Joseph Hall (same journal, 66, 1979) for the spreading function — the one perceptual coders have used since. Attic could say what a mix loses in mono, that is the goniometer, and measured level, centroid, rolloff, phase correlation. No node said what one track hides. Yet that is the question one asks of a mix that will not clear: not « is this track too loud » but « what is it making inaudible ». The model, and its asymmetry. A loud sound raises the hearing threshold around it, and not equally on both sides: it masks far more towards the treble than towards the bass, because the wave travels from bass to treble in the cochlea. Hence the kick that eats the low mids without touching the cymbals, and the voice that covers everything above it. The figures, computed: at one critical band, a masker lowers by 4.3 decibels upwards against 7.9 downwards; at three bands, by 21.4 against 50.7. The gap widens with distance, and that is where the model becomes clear-cut. The trigger does not come out of the node: only the masked sound is returned, together with what has been taken from it.

| Port | Name | Type | |
|---|---|---|---|
| input | Masked | audio |  |
| input | Masker | audio |  |
| output | Analysis | text |  |
| output | Curve | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Masker nature | choice | In between | Tonal / Noisy / In between | A tonal sound masks less than noise of equal energy: the ear separates it better from the rest. Perceptual coders commonly subtract some ten decibels for a tonal sound against five for noise. « In between » takes a middle value, which is what a real track usually is. |
| Resolution | choice | Ordinary (2048) | Ordinary (2048) / Sharp in frequency (4096) | Analysis window size. A long window separates the low bands better, where they are narrow. |

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

Shows a MIDI file played on an eighty-eight-key keyboard, one colour per hand, while playing it back. It is the reverse of the « Melody Keyboard », which is played with the mouse and records: this one watches, and it is made for learning — seeing where the fingers land while you listen. The animation follows the audio element and nothing else: a separate clock would drift within seconds, and a keyboard a beat ahead of what you hear teaches nobody anything. The two hands are assigned by the very function that judges playability, and that is what no ordinary MIDI player shows. Then comes the question any file you did not write yourself raises: is it even playable on a keyboard? The answer splits in two, and that is the node's whole work. Four impossibilities can be decided, with no arbitrariness: a note outside the 88 keys cannot be displayed; MIDI channel 10 carries percussion instruments rather than pitches, and putting them on a keyboard would be a lie; more than ten notes at once is more than ten fingers; and above all a chord must be splittable between two hands — two hands do not cross, so there are only n+1 possible splits and the node tries them all, each side having to fit within five fingers and the configured span. Three things cannot be decided, and the node gives figures rather than a verdict: speed — measured per hand, failing which two alternating hands would yield a rate twice too fast —, the largest jump relative to the time available for it, and notes held under others, which call for the pedal or a finger substitution. The node refuses nothing: one learns on real repertoire, not on certified files. It shows what it can and names what it cannot, in its Conformance output. Adaptation exists — folding octaves, dropping percussion — but it must be asked for: a silent adaptation would lie about the music, a chosen one is an arrangement. One last point, which comes before all the rest: a piano piece fits on one channel, an orchestral file has sixteen, and showing them all makes the keyboard unreadable. The « Channel » setting picks, and « Automatic » takes the busiest channel while avoiding percussion — in an orchestral file the busiest is often the drums. The MIDI output is what is shown and heard, channel and adaptation included, rather than the input copied: the view reads it back to light the keys, so the two cannot diverge.

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

#### Roughness

`rugosite` · Visualization → Analysis

*Measures a sound's sensory dissonance over time, after Plomp and Levelt's model.*

After Reinier Plomp and Willem Levelt, « Tonal Consonance and Critical Bandwidth », Journal of the Acoustical Society of America 38(4), 1965. Attic measured level, centroid, rolloff, zero-crossing rate, phase correlation. Nowhere did it measure perceived dissonance. What the model says. Two neighbouring sounds beat: as long as they fall within the same critical band, the ear does not separate them and hears roughness. It is nil at the unison, greatest at about a quarter of the critical band, and falls away once the two sounds are far enough apart to be heard separately. This is why a low third sounds murky and the same third two octaves higher does not: the critical band widens with frequency. The measure is referred to the energy of the retained partials, and that is necessary: without it a loud passage would be declared rough and a quiet one consonant, when it is the same chord at two dynamics. What is measured is the sound's quality, not its volume.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Analysis | text |  |
| output | Curve | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Partials | slider | 10 | 2 – 24, step 1 | How many partials to keep at each moment. Faint partials add measurement noise more than audible roughness. |
| Resolution | choice | Ordinary (2048) | Sharp in time (1024) / Ordinary (2048) / Sharp in frequency (4096) | Analysis window size. A long window separates neighbouring partials better, hence measures a held chord's roughness better; a short one follows a moving passage better. |

#### Self-Similarity Matrix

`auto-similarite` · Visualization → Analysis

*Draws a piece's form and detects its boundaries, by Foote's method.*

Draws a piece's form and detects its boundaries. Attic could compare two tracks and align them; it could say nothing about the form of one piece — where the chorus starts, when the material changes. Jonathan Foote proposed in 1999 a disarmingly simple method that became the basis of all musical structure analysis. The piece is cut into frames, each described by its chromagram — which notes sound — and every frame is compared to every other. The result is a square, symmetric image with a white diagonal: the self-similarity matrix. The form can be read in it by eye, a bright square being a homogeneous passage and an offset diagonal a literal repetition. To go from the image to the boundaries, Foote slides a checkerboard kernel along the diagonal: two bright squares on the diagonal, two dark ones off it. That pattern only matches where « before » resembles « before », « after » resembles « after », and the two do not resemble each other — that is, exactly at a boundary. The resulting curve is called novelty, and its peaks are the articulations. « Frame » is the setting that matters: short, the chord detail shows; long, the large sections do. It is the scale at which the form is looked at, not a precision setting. At both ends of the piece the kernel would hang off the matrix: the curve is left at zero there rather than filled with invented values, which would create false boundaries where there is nothing to detect.

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

#### Spec Sheet

`fiche-technique` · Visualization → Analysis

*Returns everything measurable about a sound as text: duration, loudness, true peak, crest factor, band shares, correlation, balance, pitch and tuning — with a compliance verdict.*

One page saying everything the software can measure about a sound, and passing it through unchanged. It drops into the middle of a chain like a VU-meter, with nothing to unplug. This node was born of a flaw. The « Journey » node's trials measure things no node was stating: the share of energy below 200 hertz, the correlation of the two channels, left-right balance, the deviation from the nearest semitone. A learner therefore read a verdict — « correlation 0.24 » — without being able to find it anywhere. The examiner saw more than the user, and a judgement you cannot reproduce teaches nothing: it intimidates. The sheet returns exactly the same figures, through the same functions. The level measurements come from the catalog's VU-meter, the pitch from the pYIN follower: the sheet therefore cannot contradict either. Three delivery targets are offered with their real values — platforms at -14 LUFS, podcast at -16, radio and television at -23 under the EBU R 128 standard —, all with a true-peak ceiling at -1 dBTP. The verdict goes through the same function as the journey's trials: a compliance written separately would eventually drift by a tenth of a decibel, and that is precisely the gap that makes one doubt a measuring tool. What is not shown matters as much. On a mono sound the stereo section is absent instead of announcing a correlation of 1.000 and a balance of 0.00 dB: two exact figures that would suggest a measurement when they only repeat that there is one channel. With no sustained pitch, the sheet says so in a word rather than lining up cents on noise. One label carries its own caveat: the loudness spread counts silences, and one blank is enough for it to announce a hundred decibels. It is the value the VU-meter shows, hence correct; it is written « silence included » because a figure that is correct and misleading is worse than one that is absent. Pitch analysis can be switched off. It needs one transform per frame, bounded to the first eight seconds: negligible on a take, noticeable over a collection of two hundred files, pointless on percussion, which has no pitch to find.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Sheet | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Delivery target | choice | None | None / Platforms (-14 LUFS) / Podcast (-16 LUFS) / Radio and television, EBU R 128 (-23 LUFS) | Adds a compliance verdict to the sheet. The values are the ones in use: -14 LUFS for streaming platforms, -16 for podcasts, -23 for radio and television under EBU R 128, with a true-peak ceiling of -1 dBTP in all three cases. The verdict is produced by the same function as the « Journey » node's trials, so the two cannot contradict each other. |
| Pitch analysis | choice | Yes | Yes / No | Pitch and tuning need a pYIN track: one transform per frame, bounded to the sound's first eight seconds. That is negligible on a take, noticeable over a collection of two hundred files, and moot on percussion, which has no pitch to find. Switched off, the Pitch section disappears from the sheet. |

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

Estimates a recording's tempo and outputs it as a value, connectable to another node's Tempo parameter — which is how a generated loop gets aligned to an imported excerpt. The measurement is the one Attic already uses in « Audio Analysis »: onset envelope, autocorrelation and spectral flux. « Octave correction » deals with the classic weakness of every tempo detector: nothing tells 80 BPM from a 160 BPM counted every other beat, both periods explain the signal equally well. Folding brings the value into the adjustable range, which does not change the rhythm heard, only how it is counted; the report recalls the raw value and the other plausible readings. Reliability is reported in three levels rather than as a percentage: the autocorrelation peak is not a probability, and two decimals would be invented precision. What the measurement is worth, in figures: on click trains, 90, 100, 120 and 140 BPM are recovered within one beat. On drum-machine patterns, 100 and 75 BPM are right, but a 140 pattern comes out as 70 — an octave error, which the report flags by offering 140 among the plausible readings. A rubato or percussionless piece measures poorly, and the reported reliability says so.

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
| Range high | number | 160 | 80 – 240, step 1 | Upper bound of the folding range. The range must span at least an octave (twice the lower bound): narrower, no tempo is sure to have its double or half inside, and folding is dropped. |

#### The Taste of a Sound

`gout-du-son` · Visualization → Analysis

*Places a sound between sweet, sour, bitter and salty, after the published music-taste correspondences, and says what puts it there.*

This node measures five features of a sound — its register, articulation, speed, consonance and loudness — and returns the share of each of the four tastes, with the measurements behind them. Where the four regions come from. Mesz, Trevisan and Sigman had musicians improvise on the words sweet, sour, bitter and salty, then placed each improvisation in this five-dimensional space. The regions are distinct enough that a classifier recovers the word from the melody alone eight times out of ten: sweet is consonant, slow, soft and legato; sour high, dissonant and fast; bitter low and legato; salty staccato, with silences between the notes. Crisinel and Spence add high pitch for sweet and low for bitter. How each dimension is computed. The register is the median frequency of the energy, not the fundamental: the common period of a C major chord — 262, 330 and 392 Hz — points to an absent fundamental at 65 Hz, while the chord's energy sits two octaves higher. Articulation is the share of time the sound is heard, above 35 dB below its peak: it is the silence between notes that separates staccato from legato, not their number. Speed counts attacks per second, an attack being a rise above the mean of the five preceding windows, followed by a 60 ms dead time. Consonance comes from the roughness of the partials, relative to their energy, so that a loud passage is not called rough for being loud. Loudness is the root-mean-square level. The four shares are distributed by the inverse square of the distances to the regions: no taste is ever zero, and a sound never quite belongs to one box, the correspondences described by the literature being gradual rather than categorical. Each dimension is weighted by what the literature says of it for the taste at hand: the register counts double for bitter, articulation double for salty. The authors did not publish the means and standard deviations of their regions: the values used here are a numbered reading of their descriptions. This node places a sound in a space of correspondences; it does not change the taste of any food. Sources. B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801): the four regions and the five-dimensional space. B. Mesz, M. Sigman and M. A. Trevisan, “A Composition Algorithm Based on Crossmodal Taste-Music Correspondences”, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071): the distance reduction to a region. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994): pitch and timbre. K. Knöferle and C. Spence, “Crossmodal Correspondences Between Sounds and Tastes”, Psychonomic Bulletin & Review, 2012 (doi 10.3758/s13423-012-0321-z): the field's own review, and its caveats — the correspondences are partly mediated by language, and vary with culture and musical training. L. Euler, Tentamen novae theoriae musicae, 1739: the gradus suavitatis, from which the consonance measure comes.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

*No parameters.*

#### Track Features

`caracteristiques-piste` · Visualization → Analysis

*The forty measurements track classification uses, for a single track.*

« Track classification » reduces each track of a folder to a vector of forty numbers, then compares them with one another. That computation takes one track at a time, but nothing exposed it outside the collection: one could read that a track belonged to group 2 with 84 % probability, without ever seeing what had produced that judgement. What the vector holds. The tempo, in beats per minute. The mean spectral centroid, which says where the sound's centre of gravity sits — the measurement that separates dull from bright. The twelve pitch classes of the chromagram, which say which notes recur, key included. And the mean and variance of thirteen cepstral coefficients, which describe timbre: the mean gives its colour, the variance says whether it moves. This node adds no computation. It calls the same function, on the same excerpt, with the same settings, and that is its whole reason for being: the numbers it shows are those the classification used. It is also why it offers no duration setting — the thirty-second cap comes from the classification, where it exists so that a collection of several hundred tracks stays computable, and changing it here would give a vector the classification would not recognise. The second output returns the same vector as JSON, for another node or another program to use.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Analysis | text |  |
| output | Vector | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Detail | choice | Whole vector | Whole vector / Summary by family | « Whole vector » writes the forty values, one per line. « Summary by family » groups the chroma and cepstral coefficients to give the dominant key and the shape of the timbre first — easier to read when comparing two tracks by eye. |
| Decimals | slider | 3 | 0 – 6, step 1 | Digits after the decimal point. Cepstral coefficients play out in tenths, variances in units: three decimals suit both. |

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
| [Engraved Score](#engraved-score) | Engraves an ABC, MusicXML, MEI or Humdrum notation into an SVG score, to music-publishing rules. |
| [MIDI → ABC](#midi--abc) | Writes a MIDI file in ABC notation: a text score, readable and editable by a language model. |
| [MIDI Score](#midi-score) | Displays a musical staff from a MIDI file. |
| [VexFlow Chord Chart](#vexflow-chord-chart) | Displays a chord chart from a list of symbols. |
| [VexFlow Score](#vexflow-score) | Displays a simple score from a chord progression. |
| [VexFlow Staff](#vexflow-staff) | Displays a musical staff from a text notation. |
| [VexFlow Tab](#vexflow-tab) | Displays a tablature from a text notation. |

#### ABC Constraints

`contraintes-abc` · Visualization → Notation

*Checks that an edit of an ABC score kept what had to stay fixed: bars, meter, key, melody, rhythm, chords.*

Compares an original ABC score with an edited version, and says whether what had to stay fixed did: number and length of bars, meter, key, melody or rhythm of the first voice, chord symbols, range. Each violation is named and located — « bar 4: 3.5 beats instead of 4 », « melody modified from bar 4 (note 29: A4 → F#4) ». The « Validated ABC » output only passes the edit on if it complies: placed before « ABC → MIDI », it prevents a faulty edit from being played. Comparisons apply to what is played, repeats unrolled: repeats rewritten in full are not a fault. Why this node: measured on local language models rewriting a whole tune, none of 19 edits was correct, and one that looked right had lost a note while placing a chord. Nothing flagged it. The node depends on no model: it applies just as well to a hand-made edit. Two quality indicators accompany the verdict — share of strong beats whose note belongs to the chord, share of notes in the scale — because guaranteed structure says nothing about the music.

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

#### Engraved Score

`partition-verovio` · Visualization → Notation

*Engraves an ABC, MusicXML, MEI or Humdrum notation into an SVG score, to music-publishing rules.*

This node engraves a score from a notation text, and returns one page as SVG. Four notations are read: ABC, recognisable by its header fields (X:, M:, K:); MusicXML, the exchange format of score editors; MEI, its scholarly counterpart; and Humdrum, that of analysis corpora. The format is recognised from the shape of the text; the setting lets you impose it when recognition gets it wrong. The engraving follows publishing rules: spacing proportional to duration, beams, stems and accidentals placed, staves aligned. Page width and scale decide what fits on a line; « Unrolled » puts the whole piece on a single system, as long as needed, to read it in one go. The empty bottom of the page is cut off: a three-bar score does not return a full page of white. A long piece spans several pages: the « Page » setting says which one to render, and the message gives their number. The SVG goes out on the output and is shown in the node.

| Port | Name | Type | |
|---|---|---|---|
| input | Notation | text |  |
| output | SVG | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notation | text | `X:1 T:Gamme M:4/4 L:1/4 K:C C D E F \| G A B c \|` |  | The notation to engrave, when no text is connected to the input. |
| Format | choice | Auto | Auto / ABC / MusicXML / MEI / Humdrum | « Auto » recognises the format from the shape of the text. The others impose it. |
| Width | slider | 1800 | 600 – 6000, step 50 | Page width, in tenths of a millimetre: 2100 is an A4 sheet. Wider, more bars per line. No effect in unrolled mode. |
| Scale | slider | 40 % | 10 – 200 %, step 5 | Size of the engraving. Small, the score fits whole in the node; large, it can be read. |
| Unrolled | choice | No | No / Yes | The whole piece on a single system, as long as needed, instead of pages. |
| Page | number | 1 | 1 – 200, step 1 | The page to render. Beyond the last one, the last one is rendered. |

#### MIDI → ABC

`midi-vers-abc` · Visualization → Notation

*Writes a MIDI file in ABC notation: a text score, readable and editable by a language model.*

Writes a MIDI file in ABC notation, so that a melody produced by Attic — Groove Box, sequencers, Magenta, capture — becomes a text score you can read, correct, and hand to a language model, which cannot read MIDI. MIDI says when notes sound, not how to write them: four decisions are made, and the message states them. The meter: Attic's nodes all write 4/4 into their files, even for a waltz; it is therefore picked by hand, not guessed. The key: inferred from the notes by Krumhansl's method, or imposed; it sets the key signature, hence F sharp or G flat. Inference is only reliable on harmony — measured on the Groove Box: right 24 times out of 24 on the chord part, 4 out of 24 on the melody alone, 0 out of 24 on the bass alone, without the confidence revealing it. A single line is flagged: impose the key then, or convert the full file. The grid: the coarsest one on which every note falls exactly — a generated MIDI then does not move by a single tick — or failing that a chosen grid, the message counting moved notes. The voices: notes starting and ending together form a chord, a bass held under a moving melody creates a second voice — or, with « Shorten into one line », the held note is cut at the next attack, keeping a legato melody readable on a single line at the cost of exactness. Each channel is written separately; drums (channel 10) are ignored, ABC having no standard percussion notation. Notes crossing a bar line are split and tied, triplets written as (3. Only the first tempo is written, instruments appear as comments, dynamics are not written. Read back by « ABC → MIDI », the score gives exactly the same notes on grid-aligned material.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI | required |
| output | ABC | text |  |
| output | Key | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Meter | choice | From file | From file / 2/4 / 3/4 / 4/4 / 5/4 / 6/8 / 7/8 / 9/8 / 12/8 | Where to put the bar lines. Note: Attic's nodes all write « 4/4 » into their files, even for a waltz — « From file » therefore almost always gives 4/4. Pick the real meter by hand; it is not guessed, because a wrongly guessed meter gives an unreadable score without saying so. |
| Key | text | `Auto` |  | « Auto » infers it from the notes (Krumhansl's method, the same as the harmonic analysis on audio). Reliable on harmony only: measured on the Groove Box, right 24 times out of 24 on the chord part, 4 out of 24 on the melody alone, 0 out of 24 on the bass alone — and the displayed confidence does not reveal the error. A single line is therefore flagged: impose the key then, as an ABC K: field (« G », « Am », « Ddor », « Bb »…). It sets the key signature, hence the spelling: F sharp or G flat. |
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
| [Instrument End](#instrument-end) | Closes an instrument chain and gathers every note's render into a keyboard bank. |
| [SFZ Export](#sfz-export) | Writes a keyboard bank as SFZ: a text file and its samples, readable by any sampler. |
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

#### Instrument End

`instrument-fin` · Outputs → Export

*Closes an instrument chain and gathers every note's render into a keyboard bank.*

Closes an instrument chain and gathers every note's render into a keyboard bank, playable by « Multi-Zone Sampler » and exportable as SFZ. The engine has already done the work: before execution it copied the chain between « Instrument Note » and this node once per note, and each copy deposits its render here, in note order. This node therefore only sets the zone bounds and the loops. How this differs from « Spread across keyboard »: there, a recorded sound is transposed to each zone, and a sound transposed by four octaves remains a sound transposed by four octaves. Here the recipe is replayed at each pitch: there is no transposition artefact at all, and the zone width does not degrade the root's sound — it only decides by how many semitones neighbouring keys will be resampled at playback. The cost is the other side: the chain runs once per note, so eighteen times at ±2 semitones over 88 keys. The unrolling refuses beyond sixty-four notes, and says so, rather than launching hundreds of renders. The copies are independent — an instrument does not chain its notes, unlike a graph loop. Whatever leaves the chain other than through this node leaves only once, from the lowest note's copy.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Bank | bank |  |
| output | Preview | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Zone width | slider | 2  semitones | 1 – 12  semitones, step 1 | Gap between two rendered notes. This is the setting that decides the cost: the chain is replayed once per note, so eighteen times at ±2 semitones over 88 keys, six times at ±6. Unlike spreading by transposition, the width does not degrade the root's sound — it only decides by how many semitones neighbouring keys will be resampled at playback. |
| Lowest key | slider | 21 | 21 – 108, step 1 | First key covered. 21 = A0. |
| Highest key | slider | 108 | 21 – 108, step 1 | Last key covered. 108 = C8. |
| Sustain loop | choice | Yes | Yes / No | Places in each zone a loop replayed while the key is held. Useful if the excitation is short and held notes are wanted. |
| Loop start | slider | 50 % | 5 – 90 %, step 1 | Where the loop starts within the sample — after the attack, then. |

#### SFZ Export

`export-sfz` · Outputs → Export

*Writes a keyboard bank as SFZ: a text file and its samples, readable by any sampler.*

Writes a keyboard bank as SFZ: a text file describing the regions, and the samples in a folder beside it — one WAV per zone, named after its root note. SFZ is read by almost every sampler (Sforzando, LinuxSampler, Bitwig, Renoise, and by conversion most others), and it is a text format: it can be opened, read back, corrected by hand. That is also what makes it verifiable — the tests read back what the node writes and rebuild the keyboard coverage from the regions, to make sure all eighty-eight keys are covered exactly once. An SF2 would be another undertaking: a binary format with its tables and generators. Three fields carry everything: « pitch_keycenter » says at which note the sample is in tune, « lokey » and « hikey » bound the zone, and the sampler derives the transposition — at most the zone width chosen at build time. When the bank has a sustain loop it is written in samples with « loop_mode=loop_sustain »: it then turns only while the key is held, exactly as Attic's Multi-Zone Sampler does. The samples are written first and the SFZ file only afterwards: were one of them to fail, an already-written SFZ would point at a missing file and the sampler would fall silent without saying why. The node reports how many samples were written and their total size. Requires Electron, like the other export nodes.

| Port | Name | Type | |
|---|---|---|---|
| input | Bank | bank |  |
| output | Path | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Name | text | `banque.sfz` |  | Name of the SFZ file, written in the working directory. The samples go into a folder of the same name beside it — one WAV file per zone, named after its root note. |
| Release | slider | 300 ms | 10 – 3000 ms, step 10 | Release written into the SFZ's global envelope (`ampeg_release`). It does not change the samples: the sampler will apply it. |

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

Aligns two tracks that differ in tempo or duration (a slower cover, a remix, two takes of the same piece) via Dynamic Time Warping on their chromagram (frame by frame, ~11.6 ms). The optimal path is computed using checkpointed blocks (O(√n·m) memory instead of O(n·m)): memory is no longer the limiting factor, only compute time stays quadratic — the « Max analyzed duration » parameter (centered excerpt per track, 3 min by default) therefore bounds time, not memory. Two text outputs: « Similarity », a normalized [0, 1] score (1 = identical, 0 = unrelated — the optimal path's cumulative cost divided by its length, independent of track duration), and « Alignment path », as JSON: `{ chemin: [{i, j}, ...], debutEchantillonA }` — the frame-by-frame correspondence between the two tracks, plus the offset (in samples) where Track A's excerpt was taken from its original buffer, so a downstream node (Time Stretch (DTW)) can locate itself without needing the same « Max analyzed duration » again. Does not produce re-stretched audio: this is deliberately a separate node — connect « Alignment path » (and the same Track A) to Time Stretch (DTW) for that.

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
| [Collection Loop End](#collection-loop-end) | Closes a batch: writes each pass's result into the output folder, under the source file's name. |
| [Collection Loop Start](#collection-loop-start) | Opens a batch: the graph is run once per audio file in the folder, and this node returns the file of the current pass. |
| [MIDI→MP3 conversion](#midimp3-conversion) | Converts a folder of MIDI files to MP3. |
| [MP3→WAV conversion](#mp3wav-conversion) | Converts a folder of MP3 files to WAV. |
| [WAV→MP3 conversion](#wavmp3-conversion) | Converts a folder of audio files to MP3. |

#### Collection Loop End

`boucle-collection-fin` · Collections → Conversion

*Closes a batch: writes each pass's result into the output folder, under the source file's name.*

This node writes the result of each pass into the output folder, under the name of its source, plus the suffix if there is one. When a file of that name is already there, the setting decides: the pass is refused and the existing file left intact, or it is overwritten. Otherwise, this node writes. It is the only thing it does, and that is why it exists: without it a batch would compute thirty results and keep none, each pass erasing the one before. A written file's name is its source's, with the extension replaced. That is what makes a batch readable back: the output folder compares to the input folder file by file, and you see at once what is missing. A suffix can be added to tell two successive runs of the same batch apart. The bit depth is the toolbar's, as for any save — 24-bit by default. A batch meant for delivery has no reason to come out at 16-bit when the rest of the software no longer does. The output folder must differ from the input folder, and the node refuses if they are the same. This is no excess of caution: at identical extension every file would overwrite its own source, and the batch would destroy what it processes — with nothing to say so until the end. The text output is the batch log, one line per file, complete at the last pass. It is what you read back to know which ones went through.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Log | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Output folder | folder | — |  | The folder where each result is written. It must differ from the input folder: at identical extension every file would overwrite its own source, and the batch would destroy what it processes. |
| Format | choice | WAV | WAV / MP3 | The format of the written files. WAV follows the bit depth chosen in the toolbar; MP3 is encoded at 192 kbps, and has no bit depth. |
| If the file exists | choice | Report an error | Report an error / Overwrite | What a pass does when the output folder already contains a file of that name. « Report an error » refuses the pass and moves on, leaving the existing file intact; « Overwrite » replaces it. A batch run again without changing the suffix writes over its own results: that is the case this setting makes explicit. |
| Suffix | text | — |  | Added to the name before the extension. Useful to tell two successive runs of the same batch apart in one folder, or simply to mark what has been processed. |

#### Collection Loop Start

`boucle-collection-debut` · Collections → Conversion

*Opens a batch: the graph is run once per audio file in the folder, and this node returns the file of the current pass.*

This node and « Collection Loop End » bracket a chain, as « Loop Start » and « Instrument Note » bracket theirs. What you put between them is any graph at all — an equaliser, a reverb, a loudness normalisation, a whole chain — and it is that graph which is applied to every file in the folder. The difference from the collection conversions already present comes down to one word: ports. « WAV to MP3 conversion » reads one folder and writes another, but the operation is sealed inside it and nothing can be inserted. Here the processing is yours. The graph is run once per file, one after another, rather than copied as many times as there are files. The distinction is not theoretical: the project's two other repetitions unroll the chain before execution, so every turn lives at once. That is harmless on a two-second note, and would ask for 7.5 GB on thirty three-minute tracks. Here a pass releases its memory before the next one, so the number of files has no ceiling. The order is that of the names, not the one the file system returns: a batch whose order changed between runs would make any log incomparable. One collection loop start per graph. Two nested batches would make no sense here, each wanting to command the number of passes.

| Port | Name | Type | |
|---|---|---|---|
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Folder | folder | — |  | The folder whose every audio file will be processed. Recognised extensions are wav, wave, ogg, mp3, flac, m4a, aac, aif and aiff; everything else is quietly ignored. The number of passes is the number of files found, and it is shown on this node as soon as the run starts. |

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
| [Cover Art Generator](#cover-art-generator) | Generates a procedural album cover (SVG) from a prompt + title. |
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

#### Cover Art Generator

`generateur-pochette` · Collections → Export

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

## Other & lab

### Csound wrapper

| Component | Summary |
|---|---|
| [Csound](#csound) | Runs a Csound orchestra and score, and outputs the audio produced. |
| [Csound Effect](#csound-effect) | Processes one or two sounds through a Csound orchestra. |
| [Csound Formulas](#csound-formulas) | Eight complete orchestras to choose from — FM, subtractive, granular, reverb bus — each with its own test score. |
| [Csound Instrument](#csound-instrument) | Plays a MIDI file with a Csound orchestra: each note becomes a score event. |
| [Csound Instruments](#csound-instruments) | Perry Cook's instruments as Csound carries them: bowed string, clarinet, flute, brass, plucked string, formants. |
| [Csound Orchestra](#csound-orchestra) | Composes a Csound orchestra by ticking several instruments, and outputs a playable test score that sounds each one in turn. |
| [Csound Score](#csound-score) | Translates MIDI into a Csound score: one note per line, with a choice of pitch convention and p-fields. |
| [Csound Spectral](#csound-spectral) | Spectral morphing, vocoder and phase-locked stretching, through Csound's streaming spectral opcodes. |
| [Random Csound Score](#random-csound-score) | Draws a Csound score at random: onsets as a Poisson process, pitches and durations from distributions, and the statistics of what came out. |

#### Csound

`csound` · Other & lab → Csound wrapper

*Runs a Csound orchestra and score, and outputs the audio produced.*

Runs a Csound orchestra and score. Csound descends from music V, the line that invented digital synthesis: Barry Vercoe wrote it at MIT in 1986, it now counts some nineteen hundred opcodes, and its WebAssembly port lets it run here with nothing to install. What it brings to Attic is not one more effect, it is a language, where nodes are fixed tools. A Csound program has two parts, and that separation is its signature: the orchestra defines instruments, the score says when to play them and with which arguments. « i1 0 1 220 0.5 » plays instrument 1 at time zero for one second, passing it 220 and 0.5 as p4 and p5. A few points the node handles for you, and which are worth knowing. The sampling rate is imposed by the sound card, often 48 kHz, and Csound ignores requests to the contrary: do not write sr in your orchestra, the node then brings the result back to 44100 Hz like all of Attic, and that conversion is good — 83 dB signal-to-error at 10 kHz. The output is limited below unity, because Csound bounds nothing and a badly set orchestra returns peaks above two; the original peak is reported. The orchestra and the score are written in the inspector, but they can also come from the graph: the Orchestra and Score inputs accept text, and a connected input takes precedence over the matching field, which then remains the worked example. Any Attic node that outputs text thus becomes a score source. The score has three possible sources, in this order: a connected MIDI file first — each note becoming an « i1 » event with the frequency in p4, the amplitude in p5 and the note number in p6 —, then the Score input, then the field. The node states in its message which of the three it took, and flags a connected input that was not used: it has three and named none. A sound connected to the Audio input is written into Csound's filesystem as « entree1.wav » and is heard only if the orchestra reads it, with « a1 diskin2 "entree1.wav", 1 » — failing which the node warns you that the sound is never read, instead of returning an unchanged sound without a word; it is written in mono by default, because diskin2 requires the number of outputs asked for to match the file's channel count and refuses the note otherwise — a trap whose only trace is a line buried in the messages. Finally, set the seed if you use random opcodes: Attic requires a render to be reproducible.

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
| Orchestra | text | `; A minimal instrument: p4 = frequency, p5 = amplitude. i…` |  | The instruments, in Csound language, used when no Orchestra input is connected. A sound connected to the Audio input is written as « entree1.wav » and is heard only if the orchestra reads it, with « a1 diskin2 "entree1.wav", 1 ». The sampling rate and 0dbfs are set by the node: do not write sr or 0dbfs. |
| Score | text | `i1 0.0 1.0 220 0.5 i1 1.0 1.0 277 0.5 i1 2.0 1.5 330 0.6 e` |  | When to play what. « i1 0 1 220 0.5 » plays instrument 1 at time 0 for 1 second, with 220 and 0.5 as p4 and p5. Three possible sources, in order of precedence: a connected MIDI file, then the Score input, then this field — and the node states in its message which one it took. The final « e » is added if missing. |
| Channels | choice | Mono | Mono / Stereo | Number of channels in the orchestra. In stereo, use outs instead of out. |
| Block size | number | 32 | 1 – 512, step 1 | ksmps, the number of samples computed per control cycle. Small means finer control signals and slower computation; 32 is the common choice. |
| Seed | number | 1 | 0 – 999999, step 1 | Seed of the random opcodes. Csound is reproducible as soon as it is fixed, which Attic requires: 0 lets Csound draw its own and the render changes on every run. |
| Input channels | choice | Mono | Mono / Stereo | Number of channels in the input files written for Csound. In mono, « a1 diskin2 "entree1.wav", 1 » always works; in stereo, diskin2 requires two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Effect

`csound-effet` · Other & lab → Csound wrapper

*Processes one or two sounds through a Csound orchestra.*

Processes one or two sounds through a Csound orchestra. The inputs are written into Csound's filesystem as « entree1.wav » and « entree2.wav », and read with diskin2 or soundin — they are therefore files rather than streams, which has a useful consequence: they can be read back at another speed, looped, reversed, or loaded into a table for block processing. The score's duration is set from the longest input plus the requested tail, which is essential as soon as a delay or a reverb has something to let die away. « Input channels » deserves a word, because it is the trap that costs the most time: diskin2 requires the number of outputs asked for to match the file's channel count. « a1 diskin2 » on a stereo file refuses the note and returns nothing but silence, with a single line buried in the messages as its only trace. The inputs are therefore downmixed to mono by default; switch to stereo if your orchestra writes « a1, a2 diskin2 ». The default orchestra is a modulated delay, there to show the shape of a process rather than for its musical interest. It is written in the inspector, but it can also come from the graph: the Orchestra input accepts text and takes precedence over the field, which the node announces in its message. Finally, a connected sound the orchestra never names has NO effect — the file is written, nobody reads it — and that is the most puzzling result there is, since the rendered sound then has nothing to do with the one that was connected; the node therefore checks that « entree1.wav » and « entree2.wav » are really read, comments stripped, and warns you otherwise.

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
| Input channels | choice | Mono | Mono / Stereo | Number of channels in the input files written for Csound. In mono, « a1 diskin2 "entree1.wav", 1 » always works; in stereo, diskin2 requires two outputs — « a1, a2 diskin2 … » — and refuses the note otherwise, which yields a silent render. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Formulas

`formules-csound` · Other & lab → Csound wrapper

*Eight complete orchestras to choose from — FM, subtractive, granular, reverb bus — each with its own test score.*

Eight complete Csound orchestras to choose from, each with its own test score. The Csound node's Orchestra field already carried one example formula — a vibrato oscillator — and there was only one: this node offers a list. How this differs from « Csound orchestra »: there, instruments sharing the same contract — p4 the pitch, p5 the amplitude — are assembled so that a multi-part score can address them by number; that is made for arranging. Here, each entry is a whole orchestra demonstrating a technique, with its own p-fields: the modulation index for FM, the filter cutoff for subtractive, the grain density for granular. It is made for learning, listening, and starting from something. The eight: vibrato oscillator, frequency modulation with variable index (Chowning, 1973), subtractive with swept Moog filter, additive with counted harmonics, Karplus-Strong string (1983), ring modulation, granular cloud (after Gabor, 1947, taken up by Roads and Truax), and an instrument paired with a reverb bus — two instruments and a global variable, the structure of nearly every serious piece, and the one thing a single-instrument orchestra cannot show. The test score is not an ornament: p-fields differ from one formula to the next, and a score written for FM means nothing for the granular one. The one that comes out with each formula demonstrates what it can do — FM sweeps its index from 1 to 12 then moves to an irrational ratio, subtractive sweeps its cutoff both ways, granular thickens its cloud from eight to four hundred grains per second. Wire both outputs to the Csound node and you hear the technique. The level is written into the orchestra as a global variable « gkNiveau » that every output line multiplies: it is visible in the text, hence editable by hand by whoever reads it. Two things to know. The reverb bus outputs in stereo: set the Csound node accordingly, or half the render is lost. And the granular density multiplies the level — overlapping grains add up — which is why its test score lowers the amplitude as it thickens the cloud: at four hundred grains per second, amplitude 0.4 clipped, with a measured peak of 0.95, that is to say the limiter.

| Port | Name | Type | |
|---|---|---|---|
| output | Orchestra | text |  |
| output | Test score | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Formula | choice | Vibrato oscillator — Synthesis | Vibrato oscillator — Synthesis / FM with variable index — Synthesis / Subtractive with swept filter — Synthesis / Additive with counted harmonics — Synthesis / Karplus-Strong string — Synthesis / Ring modulation — Synthesis / Granular cloud — Synthesis / Instrument and reverb (global bus) — Structure | The orchestra produced. Each one is complete and demonstrates a technique: vibrato oscillator (the one the Csound node carried by default), FM with variable index, subtractive with swept filter, additive with counted harmonics, Karplus-Strong string, ring modulation, granular cloud, and an instrument with a reverb bus. The p-fields differ from one formula to the next — modulation index, filter cutoff, grain density — which is why each carries its own test score. |
| Level | slider | 100 % | 0 – 100 %, step 1 | Output level, written into the orchestra as a global variable `gkNiveau` that every output line multiplies. It is visible in the text: whoever reads it can change it by hand. |

#### Csound Instrument

`csound-instrument` · Other & lab → Csound wrapper

*Plays a MIDI file with a Csound orchestra: each note becomes a score event.*

Plays a MIDI file with a Csound orchestra. Each note becomes a score event, and instrument 1 is called for every one of them. The argument convention is that of Csound's own examples, and it avoids any conversion: p4 carries the frequency in hertz, p5 the amplitude from zero to one, p6 the MIDI note number for whoever needs it. This is what allows any MIDI source in Attic — the L-system, the Markov chain, Nørgård's series, the Tonnetz — to be plugged into an orchestra written once. « Tail » adds time after the last note: without it, a reverb or a resonance would be cut off at the end of the score, which is the commonest flaw of an offline render. Technically that time comes from an « f0 » holding the score open, which is the canonical way to do it in Csound. The orchestra is written in the inspector, but it can also come from the graph: the Orchestra input accepts text, and a connected input takes precedence over the field, which then remains the worked example — the node announces it in its message, so nobody wonders why the field before their eyes does nothing. As with the general Csound node: do not write sr, the node brings the output back to 44100 Hz, limits it below unity, and set the seed so the render reproduces.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| input | Orchestra | text |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Orchestra | text | `; A minimal instrument: p4 = frequency, p5 = amplitude. i…` |  | Instrument 1 is called for each note. The score passes it the frequency in hertz in p4, the amplitude from 0 to 1 in p5, and the MIDI note number in p6 — so that no conversion is ever needed. This field is used when no Orchestra input is connected; a connected input replaces it, and the node says so. |
| Channels | choice | Mono | Mono / Stereo | Number of channels in the orchestra. |
| Block size | number | 32 | 1 – 512, step 1 | ksmps, the number of samples per control cycle. |
| Tail | number | 0.5 s | 0 – 10 s, step 0.1 | Time added after the last note, so resonances have room to die away. Without it, a reverb is cut off at the end of the score. |
| Seed | number | 1 | 0 – 999999, step 1 | Seed of the random opcodes, so the render is reproducible. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Csound Instruments

`csound-instruments-physiques` · Other & lab → Csound wrapper

*Perry Cook's instruments as Csound carries them: bowed string, clarinet, flute, brass, plucked string, formants.*

Csound's physical-model instruments, adjustable without writing a line of code. These are Perry Cook's and Julius Smith's models, carried into Csound and debugged for thirty years — and the bowed string is precisely the one Attic failed to write by hand: its Helmholtz regime, the thing that separates a bow from a mere resonator, is settled here. Six opcodes: bowed string (wgbow), clarinet (wgclar), flute (wgflute), brass (wgbrass), plucked string (wgpluck2) and formants (fof2). The three controls — Pressure, Position, Vibrato — do not mean the same thing from one instrument to the next, and that is accepted: Pressure is the violin's bow pressure, the clarinet's reed stiffness, the flute's breath, the brass's lip tension, and the plucked string's reflection, which sets its decay. Position is the bow's contact point, the air jet ratio, the attack time or the formant frequency, and it is the most sensitive control of most of them. One detail that is not a detail: each opcode's output gain was measured and corrected in the node, because wgclar is twelve times quieter than wgbow at comparable settings. Without that correction one would spend all one's time chasing the volume when changing instrument, and the library would be unusable.

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

#### Csound Orchestra

`orchestre-csound` · Other & lab → Csound wrapper

*Composes a Csound orchestra by ticking several instruments, and outputs a playable test score that sounds each one in turn.*

Composes a Csound orchestra by ticking instruments in a list rather than writing code. The orchestra is half the language — Csound separates the instruments, which say how to sound, from the score, which says when to play what — and Attic offered only one at a time until now. A four-part arrangement needs four instruments in the same orchestra, each numbered: that is what this node does. The second output is a test score, not a comment: wired to the Csound node's Score input, it sounds each ticked instrument in turn, one second of A4 each — so the orchestra is auditioned with a single wire, without writing a line. It also carries, as comments Csound ignores, each instrument's number and description along with the tables created: copy it into the Score field and edit it, and you have the skeleton of your own score with the p-fields already in place. The order of the ticked boxes decides the numbers: the first becomes « instr 1 », the second « instr 2 », which matches « Csound Score »'s « one instrument per channel » option, numbering the MIDI channels present the same way. Three traps are closed here, each of which makes a combined orchestra fail. First numbering: two instruments both named « instr 1 » raise no error, the second simply replaces the first and the score plays the wrong sound. Second function tables, which used to be declared in the score — « f1 0 16384 10 1 » — and would clash between instruments; they go through « ftgen » in the orchestra, with a number assigned by Csound and held in a variable, so no collision is possible any more and one table serves everyone who asks for it. Third the channel count: an instrument writing « out » mixed with one writing « outs » yields a half-silent render — so all are written the same way, and the Channels setting must match the Csound node's. The p-field contract is shared: p4 the pitch in hertz, p5 the amplitude between 0 and 1 — « Csound Score »'s defaults, so the two nodes assemble with no setting at all. Every instrument was measured in the application, at three octaves, pitch and peak: « wgbrass » was dropped, holding no pitch at any of the eight settings tried; the bowed string and the flute were rescued by a measured tuning compensation — the string overblows by an octave and a fifth in the treble at bow pressure 4, and plays 0.034 cent sharp per hertz at pressure 2, which corrects exactly. The gains come from the same measurement: for a requested amplitude of 0.6, peaks ranged from 0.10 to 0.95 depending on the opcode, and each gain brings them back to 0.6. This node does not tune an instrument: its entries are playable presets, and the envelope is shared — 20 ms attack, 40 ms release, just enough not to click, each model keeping its own decay. To tune a single instrument finely, « Csound Instruments » remains, with its pressure, position and vibrato sliders.

| Port | Name | Type | |
|---|---|---|---|
| output | Orchestra | text |  |
| output | Test score | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Instruments | text | `wgbow,foscil` |  | The chosen instruments, by their identifiers separated by commas. The node's tick list writes this field, and the order there decides the numbers: the first ticked becomes `instr 1`, the second `instr 2`. An unknown identifier is dropped without failing the rest, and a duplicate is ignored — the same instrument twice would give two numbers to one sound. |
| Channels | choice | Mono | Mono / Stereo | How every instrument writes its output — `out` in mono, `outs` in stereo. This must match the Csound node's setting: a stereo orchestra rendered by a node set to mono loses every other channel, and the reverse renders silence. The node's message states which one to set. |
| First instrument | number | 1 | 1 – 90, step 1 | Number of the first `instr`. Leave it at 1 unless the orchestra is assembled with another: « Csound Score » also numbers from 1, and the two must agree. |
| Level | slider | 100 % | 0 – 100 %, step 1 | Level applied to every instrument, on top of each one's own gain. Those gains come from measurement: Csound's opcodes share no amplitude convention — for a requested amplitude of 0.6, measured peaks ranged from 0.10 for the modal resonance to 0.95 for the bowed string, which hit the limiter. |

#### Csound Score

`partition-csound` · Other & lab → Csound wrapper

*Translates MIDI into a Csound score: one note per line, with a choice of pitch convention and p-fields.*

Translates a MIDI file into a Csound score. One node for all of attic's notations: ABC, tablature, drum, melody and chord sequencers, text to MIDI — all already converge on MIDI, so translating it translates them all. The output is text, to be connected to the Csound node's Score input. What a score has that MIDI does not: a note is a line « i1 0 1 440 0.5 60 », where every number after the duration is a p-field the orchestra reads as it likes. MIDI carries only pitch, velocity and duration; a score carries as many as you want, and this node lets you choose what goes in each — pitch, amplitude, raw velocity, note number, duration, channel, a constant, or the value of a connected curve, read at each note's onset. The setting that decides everything is the pitch convention. Csound has four and an orchestra written for one does not work with another: cps in hertz (440 for A4), pch in octave point pitch-class (8.00 middle C, 8.09 the A — Music V's notation, whose hundredths stop at 11), oct in decimal octaves (8.0 middle C, 8.75 the A), and midi as a note number. Feeding hertz to an orchestra that expects pch produces neither sound nor error, and it is the hardest fault to spot in all of Csound — hence this explicit setting rather than a hard-coded value. One instrument per channel makes a whole arrangement playable: each MIDI channel present gets its number, following the previous one — channels 1, 2 and 10 yield instruments 1, 2 and 3, because an orchestra numbers its own consecutively — and the Report output states the mapping, without which the orchestra cannot be written. Times are in seconds and there is no tempo setting: a Csound score beats at sixty by default, where one beat is one second. Adding a « t » tempo statement would reinterpret those numbers and make the piece run beside what was written. The final margin, written as « f0 », lets reverb tails ring: without it Csound stops at the last note and cuts them off.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| input | Curve | curve |  |
| output | Score | text |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pitch as | choice | cps (hertz) | cps (hertz) / pch (8.09) / oct (8.75) / midi (69) | The convention the pitch is written in, and this is the setting that decides whether anything is heard. Csound has four, and an orchestra written for one does not work with another. CPS: frequency in hertz, 440 for A4 — what `oscili` and Perry Cook's physical models expect. PCH: octave point pitch-class, 8.00 for middle C and 8.09 for the A above — Music V's notation, converted by `cpspch()`; its hundredths only run to 11, 8.11 being followed by 9.00. OCT: octave in decimal, 8.0 for middle C and 8.75 for the A, converted by `cpsoct()` — handy for transposing by simple addition. MIDI: the note number, converted by `cpsmidinn()`. Feeding hertz to an orchestra that expects pch produces neither sound nor error: it is the hardest fault to spot in all of Csound. |
| Instrument | number | 1 | 1 – 99, step 1 | Number of the first instrument — the `1` in `i1`. It is the one the orchestra must define with `instr 1`. |
| One instrument per channel | choice | No | No / Yes | Yes: each MIDI channel present gets its own instrument number, following the previous one. A file on channels 1, 2 and 10 yields instruments 1, 2 and 3 — not 1, 2 and 10, because an orchestra numbers its instruments consecutively. This is what lets a whole arrangement be played by several Csound instruments, and the Report output states the mapping. NO: everything goes to the same number. |
| p4 | choice | Pitch | Pitch / Amplitude (velocity ÷ 127) / MIDI velocity (0–127) / MIDI note number / Duration / MIDI channel / Constant / Curve / Nothing | What the fourth field of each note carries. Pitch is the custom, and most orchestras read it there. |
| p5 | choice | Amplitude (velocity ÷ 127) | Pitch / Amplitude (velocity ÷ 127) / MIDI velocity (0–127) / MIDI note number / Duration / MIDI channel / Constant / Curve / Nothing | What the fifth field carries. Amplitude — velocity brought to the 0–1 range — is the custom, `0dbfs` being 1 in Attic. |
| p6 | choice | MIDI note number | Pitch / Amplitude (velocity ÷ 127) / MIDI velocity (0–127) / MIDI note number / Duration / MIDI channel / Constant / Curve / Nothing | What the sixth field carries. The note number is handy there even when p4 already carries the pitch: an orchestra uses it to pick a table or a register. |
| p7 | choice | Nothing | Pitch / Amplitude (velocity ÷ 127) / MIDI velocity (0–127) / MIDI note number / Duration / MIDI channel / Constant / Curve / Nothing | What the seventh field carries. Nothing omits it, and any that would follow. |
| Constant | number | 0 | -1000 – 1000, step 0.01 | Value of the « Constant » field. Used to pass a fixed setting to the orchestra — a table index, a factor, a stereo position. |
| Final margin | number | 0.5 s | 0 – 30 s, step 0.1 | Seconds added after the last note, written as `f0`. Without them, Csound stops at the last note and cuts reverb or resonance tails, which is heard as a click. |

#### Csound Spectral

`csound-spectral` · Other & lab → Csound wrapper

*Spectral morphing, vocoder and phase-locked stretching, through Csound's streaming spectral opcodes.*

Csound's spectral processes, unmatched elsewhere for simplicity. The « pvs » opcodes work on a spectral stream rather than on frames passed by hand: pvsanal analyses, the opcode transforms, pvsynth resynthesises, and a morphing chain is written in four lines. Three processes, and Attic had no equivalent of any of them. The cross (pvscross) keeps the first sound's frequencies and imposes the second's levels: a voice taking on a drum kit's dynamics. The vocoder (pvsvoc) does the opposite — the first gives its spectral envelope, hence its formants, the second its excitation: this is the vocoder proper, the robot-voice one, but done in the spectral domain rather than with a filter bank. The stretch (mincer) lengthens a sound without changing its pitch and changes its pitch without touching its length, phase-locked, which avoids the smearing of naive stretches. The window size is the usual trade-off: large gives fine frequency resolution but smeared transients; small the opposite. Two neighbouring opcodes were tried and set aside, and that is worth saying: partikkel, Csound's most complete granular synthesis, refused three formulations of its forty-one arguments; pvsmorph compiles, finishes cleanly, reports no error and writes nothing. The general Csound node remains available for whoever can make them speak.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio 1 | audio |  |
| input | Audio 2 | audio |  |
| output | Audio | audio |  |
| output | Report | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Process | choice | Spectral cross (pvscross) | Spectral cross (pvscross) / Spectral vocoder (pvsvoc) / Phase-locked stretch (mincer) | The opcode used. The first three need two sounds and cross them; the stretch needs only one. Attic had no spectral morphing before these. |
| Morph | number | 50 % | 0 – 100 %, step 1 | Amount of crossing between the two sounds. For the stretch, this is the time factor: at 25 %, the sound lasts twice as long. |
| Transpose | number | 0 st | -24 – 24 st, step 1 | Transposition, used by the stretch only: it changes the pitch without touching the duration, which is the whole point of a phase-locked stretch. |
| Window | choice | 1024 | 512 / 1024 / 2048 | Transform size. Large gives fine frequency resolution and smeared transients; small the opposite. 1024 is the usual compromise. |
| Tail | number | 0.5 s | 0 – 30 s, step 0.5 | Time added to the processed duration. Essential for the stretch, which lengthens the sound. |
| Volume | number | 80 % | 0 – 100 %, step 1 | Output volume, applied after limiting. |

#### Random Csound Score

`partition-aleatoire-csound` · Other & lab → Csound wrapper

*Draws a Csound score at random: onsets as a Poisson process, pitches and durations from distributions, and the statistics of what came out.*

Draws a Csound score at random. Why a node of its own, rather than « a random melody then a translator »: a MIDI file carries only pitch, velocity and duration, and it is tied to a grid; a Csound score carries as many p-fields as you want and has no grid at all. It is even the historical use of this family of languages — Iannis Xenakis wrote his stochastic pieces, the ST series in 1962 on an IBM 7090, by drawing the onsets from an exponential law, that is to say a Poisson process, and the pitches and durations from other laws. The Poisson process, in one sentence: events arrive at random, without memory, at a given mean density, and the interval between neighbours then follows an exponential law. Its signature is measurable, and the Statistics output measures it: the standard deviation of the intervals equals their mean, where a regular grid has it at zero. That is the whole difference between a cloud and a pulse, and it is as audible as it is computable. A connected curve modulates the density over time — a cloud that thickens then disperses — and it does so by thinning, the method of Lewis and Shedler (1979): draw at the maximum density, then keep each onset with the probability the curve gives. Varying the density inside the draw itself would bias the law, and the result would no longer be a Poisson process but a nameless deformation. The free field is what a score has that MIDI does not: an extra p-field, drawn from its own law for every event, which the orchestra reads as it likes — a stereo position, a modulation index, a bandwidth. What is not drawn matters just as much: the scale, the range, the number of instruments and the duration bounds are constraints, and an unconstrained draw makes noise rather than music — which is precisely what Xenakis constrained most. The statistics report what was produced, not what was asked: eight seconds at four events per second do not make thirty-two events but a number that varies from draw to draw. The seed, finally, makes a draw reproducible: zero draws a new one on each run and shows it in the message, any other value gives exactly the same score again.

| Port | Name | Type | |
|---|---|---|---|
| input | Curve | curve |  |
| output | Score | text |  |
| output | Statistics | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Duration | number | 8 s | 0.5 – 300 s, step 0.5 | Length of the generated score. |
| Density | number | 4 /s | 0.2 – 50 /s, step 0.1 | Events per second, on average. A draw does not yield the requested count: eight seconds at four per second do not make thirty-two events but a number that varies from draw to draw, which is what randomness means. The Statistics output reports the real count. |
| Distribution | choice | Poisson (cloud) | Poisson (cloud) / Regular grid | How the onsets are spread. Poisson: they arrive at random, without memory, at the requested density — the interval between neighbours then follows an exponential law, which is what Xenakis used for his stochastic pieces (the ST series, 1962). Its signature is measurable: the standard deviation of the intervals equals their mean, and the Statistics output checks it. Grid: one event every 1/density, zero standard deviation. That is the difference between a cloud and a pulse. |
| Instruments | number | 1 | 1 – 8, step 1 | How many instruments to spread the events over — `i1` to `iN`, drawn at random. To be matched with « Csound Orchestra », which numbers its own in the order of the ticked boxes. |
| Lowest note | slider | 48 | 12 – 120, step 1 | Lowest note the draw can produce. 48 = C2. |
| Highest note | slider | 84 | 12 – 120, step 1 | Highest note. 84 = C6. |
| Scale | choice | Chromatic | Major / Natural minor / Harmonic minor / Dorian / Phrygian / Lydian / Mixolydian / Locrian / Major pentatonic / Minor pentatonic / Chromatic | The allowed notes. Each drawn pitch is moved to the nearest one belonging to the scale. An unconstrained draw does not make music: this is precisely what Xenakis constrained most, his distributions being held by chosen registers and densities. |
| Pitch distribution | choice | Uniform | Uniform / Gaussian | Uniform: every note of the range is equally likely. Gaussian: notes cluster around the centre of the range, with a standard deviation of a quarter of it — two thirds fall in the central half, and the edges stay reachable. Out-of-range values are folded back rather than clipped, which would otherwise pile them onto the two extreme notes. |
| Shortest | number | 0.2 s | 0.01 – 20 s, step 0.01 | Shortest duration an event can take. |
| Longest | number | 1 s | 0.01 – 20 s, step 0.01 | Longest duration. Longer than the mean interval, events overlap — which is how a mass is obtained rather than a succession. |
| Lowest velocity | slider | 60 | 1 – 127, step 1 | Lowest velocity. It becomes the amplitude, divided by 127. |
| Highest velocity | slider | 110 | 1 – 127, step 1 | Highest velocity. |
| Pitch as | choice | cps (hertz) | cps (hertz) / pch (8.09) / oct (8.75) / midi (69) | The convention the pitch is written in, in p4, as in « Csound Score » — an orchestra written for one does not work with another, and feeding hertz to an orchestra expecting pch produces neither sound nor error. |
| Free field | choice | None | None / Uniform / Gaussian | One more p-field, drawn at random for each event and written as p6. This is what a score has that MIDI does not: the orchestra can read whatever it likes there — a stereo position, a modulation index, a bandwidth — and each note gets its own value. No MIDI file can carry that. |
| Free min | number | 0 | -10000 – 10000, step 0.01 | Lower bound of the free field. |
| Free max | number | 1 | -10000 – 10000, step 0.01 | Upper bound of the free field. |
| Seed | number | 0 | 0 – 999999, step 1 | Seed of the draw. 0 = drawn at random on each run, and shown in the message so it can be copied back here. Any other value gives exactly the same score again — which is how a draw you like is kept. |

### Generation

| Component | Summary |
|---|---|
| [Color → Sound AI](#color--sound-ai) | Generates a Suno/Udio script via AI from 1 or 2 colors with variability. |
| [Harmonic Palette](#harmonic-palette) | Extracts dominant colors from an image and generates a melody, harmony or arpeggio. |
| [Julia Processor](#julia-processor) | Julia code editor with syntax highlighting for audio processing. |
| [Pixeltone](#pixeltone) | Converts an image to sound by mapping R, G, B to frequencies. |
| [Pure Data](#pure-data) | Generates audio by running a Pure Data patch (.pd). |
| [Python Processor](#python-processor) | Python code editor with syntax highlighting for audio processing. |
| [Sound Drawing](#sound-drawing) | Sonifies the colored shapes of a drawing image into notes or chords. |

#### Color → Sound AI

`couleur-suno-ia` · Other & lab → Generation

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

#### Harmonic Palette

`palette-harmonique` · Other & lab → Generation

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the palette extraction (k-means++ initialisation). The default is fixed: the same image must yield the same colours on every run. Changing it may surface other dominant hues. |

#### Julia Processor

`julia-processor` · Other & lab → Generation

*Julia code editor with syntax highlighting for audio processing.*

Julia code editor with syntax highlighting for audio, MIDI and text processing. Same architecture as the Python Processor. Variables: ARGS[2] = input WAV, ENV["Attic_output_path"] = output WAV, ENV["Attic_sample_rate"], ENV["Attic_channels"]. Requires Julia + WAV.jl package installed.

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
| Code | text | `# Julia Processor — audio processing # Environment variab…` |  | Julia code to execute. Variables: ARGS[2] = input WAV, ENV["Attic_output_path"] = output WAV, ENV["Attic_sample_rate"], ENV["Attic_channels"]. Requires WAV.jl package. |
| Timeout | number | 30 s | 5 – 120 s, step 5 | Maximum script execution time (in seconds). |

#### Pixeltone

`pixeltone` · Other & lab → Generation

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

#### Pure Data

`pure-data` · Other & lab → Generation

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

#### Python Processor

`python-processor` · Other & lab → Generation

*Python code editor with syntax highlighting for audio processing.*

Python code editor with syntax highlighting for audio processing. Input audio is converted to a temporary WAV and passed to the script via sys.argv[1]. The script must write the result to the path given by os.environ['attic_output_path']. Available variables: Attic_sample_rate, Attic_channels. The default code reads the WAV, doubles the volume and writes the result. Requires Python + numpy installed on the machine. Python detection is automatic (python, python3, py) or via the Attic_Python environment variable. Adjustable timeout (5-120s).

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
| Code | text | `import numpy as np import wave import os import sys # in…` |  | Python code to execute. Variables: sys.argv[1] = input WAV, Attic_output_path = output WAV, Attic_sample_rate, Attic_channels. Requires numpy + wave. |
| Timeout | number | 30 s | 5 – 120 s, step 5 | Maximum script execution time (in seconds). |

#### Sound Drawing

`dessin-sonore` · Other & lab → Generation

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
| Seed | number | 42 | 1 – 999999, step 1 | Seed for the palette extraction (k-means++ initialisation). The default is fixed: the same drawing must yield the same shapes on every run. Changing it may surface other dominant hues. |

### Installation

| Component | Summary |
|---|---|
| [Node Manager](#node-manager) | Exports a node as .zip or imports a node from a .zip. |

#### Node Manager

`gestion-nodes` · Other & lab → Installation

*Exports a node as .zip or imports a node from a .zip.*

Exports an existing node as a .zip archive or imports a node from a .zip. To export: enter the node ID, the system extracts the manifest, executer code, notice and detects dependencies, then generates a .zip. To import: select a .zip, the system decompresses, checks dependencies and installs the node in the catalog. Installed nodes are persisted and survive restarts.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Action | choice | Export | Export / Import | Export = create a .zip of an existing node. Import = install a node from a .zip. |
| Node to export | choice |  |  | Select the node to export from the 5 most recently created. The list updates on each run. |

### Learning

| Component | Summary |
|---|---|
| [Journey](#journey) | Forty-five hands-on exercises that validate against the workshop you build, and ten trials measured on the sound you hand in. |
| [Quiz](#quiz) | Quizzes you on Attic's acronyms, concepts, formulas, figures and sources, in a random order and without repetition. |

#### Journey

`parcours` · Other & lab → Learning

*Forty-five hands-on exercises that validate against the workshop you build, and ten trials measured on the sound you hand in.*

A journey in ten chapters — the first sound, the ear, level, colour, time, space, pitch, matter, music, the finished work — which never validates on a declaration. An ordinary tutorial flips through pages and asks you to click « next »: it teaches nothing a documentation would not teach better, and it lies on one point, since it claims the gesture was made. Here every step is read off something real. Exercises validate against the workshop. « Place a generator, wire it to a viewer, run » is checked by looking at the nodes and edges you just placed. The checklist ticks itself while you work, and the point left red says precisely what is missing: the absent node, the node placed but not run, the setting beside the mark, or two nodes present and unconnected. Those are four different failures, and folding them into a single « not done » would have removed the whole point. Trials are measured on the sound. They close each chapter and say nothing about the route: wire the result of your work into the « Copy » input, and the node measures it. Loudness, true peak, peak, crest factor, channel correlation, left-right balance, share of energy below 200 Hz, pitch and tuning in cents: the figures come from the same functions as the catalog's VU-meter and Pitch Follower, so a trial cannot declare passed what those nodes would declare failed. The verdict always carries the measured figure, passed or failed. Knowing you are at -24 LUFS when -14 was asked is the only thing that lets you correct; « failed » teaches nothing. Lessons say why, never how. The how is in the hint, which you open if you want. The lesson carries the reason — why the limiter goes after the compressor, why a wide low end cancels in mono, why loudness is not won with gain — and that is what remains once the gesture is forgotten, including in front of another piece of software. Nothing is locked. The order is a proposal: the « Along the journey » setting always leads to the first unfinished exercise, and choosing a chapter goes straight there. Someone who came for spatialization should not have to redo twelve wiring exercises to reach it. Progress is saved with the project, since it lives in a parameter. You close the application halfway through the third chapter and reopen it where you left off. The field reads plainly and clears with one button. Ten titles are earned at the trials, and at the trials alone, from « New ear » to « Journeyman of sound ». They are good for nothing, which is exactly what makes them pleasant to get. Running the node returns the roadmap — the exercises and their instructions, which print and hand out — and the report card, with the per-chapter count and the verdict of the trial under way. Connect them to a « Text Output » to keep them.

| Port | Name | Type | |
|---|---|---|---|
| input | Copy | audio |  |
| output | Roadmap | text |  |
| output | Report card | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Chapter | choice | Along the journey | Along the journey / The first sound / The ear / Level / Colour / Time / Space / Pitch / Matter / Music / The finished work | « Along the journey » always leads to the first unfinished exercise, across all chapters: that is the route for someone discovering the software. Choosing a chapter goes straight there, demanding nothing of the earlier ones — you do not make someone who came for space redo twelve wiring exercises. |
| Completed | text | — |  | The steps completed, separated by commas. The view adds one on every success, and it is this field the report card and the title count read — so the two cannot contradict each other. It is saved with the project: an interrupted journey resumes where it stood. Empty it to start over. |

#### Quiz

`quiz` · Other & lab → Learning

*Quizzes you on Attic's acronyms, concepts, formulas, figures and sources, in a random order and without repetition.*

Six themes, and one of them is not written by hand. Acronyms, concepts, formulas, figures and sources form a written bank, where each question carries its explanation. The sixth, « Catalog », is computed on the node registry as you play: it draws several hundred questions from it — recognising a node from its summary, placing it in its universe and family — which therefore can neither lie nor age, since they read the same cards the application runs. The series is a permutation, not a run of draws. That settles boredom at the root: you do not see a question again before having seen all the others. Drawing each question independently would have given duplicates very soon — over a hundred questions, the chance of seeing one already seen passes one in two by the twelfth. Themes alternate, and that is the second half of the remedy. A permutation of a bank where one theme weighs two thirds gives series that speak of the same subject six times in a row: technically without repetition, and tiresome all the same. The draw therefore takes turns in each theme present, the order of the themes being itself redrawn each round. Twenty questions over six themes give three or four of each, whatever the bank sizes. The order of the options is drawn too. The bank always writes the correct answer first — a convention that removes a whole class of authoring faults, since one can no longer be off by one while proofreading — so without that second draw the answer would always be A. Two ways to use it. In the node, one question at a time: you click, it says right or wrong and why. By running it, it returns two texts — the questionnaire alone, and the answer key with the explanations and the score. Connect them to a « Text Output » to keep them. The seed is the questionnaire. The same seed gives exactly the same series back, options included: that is what allows retaking the same test, giving it to someone, or resuming an interrupted round. Changing the seed changes the order without touching the content. The answers are a parameter rather than a state of the view, and that choice has a pleasant consequence: they are saved with the project. You can close the application halfway through a round of fifty questions and resume where you left off. The field reads plainly — one letter per question, a dot for a skipped one — and clears with one button.

| Port | Name | Type | |
|---|---|---|---|
| output | Questionnaire | text |  |
| output | Answer key | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Theme | choice | All | All / Acronyms / Concepts / Formulas / Figures / Sources / Catalog | « All » alternates the six themes, which is the setting the draw was designed for. A single theme serves to revise one point: acronyms before an interview, formulas before writing a process. « Catalog » is the only computed theme — it quizzes on the installed nodes, and grows by itself with every node added. |
| Level | choice | All | All / Beginner / Advanced | « Beginner » keeps what you meet on opening the software, « Advanced » what you have had to go and look for — the masking spreading function, a maqam's neutral third, Tymoczko's theorem. If a theme has nothing at the requested level, the whole bank is returned rather than an empty quiz. |
| Questions | slider | 20 | 5 – 100, step 5 | The length of the series. Beyond the pool's size a second round starts in a different order — so a question only comes back after all the others have been seen. |
| Seed | slider | 7 | 1 – 999999, step 1 | The seed is the questionnaire: the same one gives the same series back, options included. Change it for another draw — the view's « New round » button does it and clears the answers in the same gesture. |
| Answers | text | — |  | One letter per question, in the order of the series; a dot for a skipped question. The view fills it on every click, and it is this field the answer key reads — so the two cannot contradict each other. Empty it to retake the same series from the start. |

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

`magenta-continuation` · Other & lab → Magenta

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

`magenta-drums` · Other & lab → Magenta

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

`magenta-generer-batterie` · Other & lab → Magenta

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

`magenta-generer-melodie` · Other & lab → Magenta

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

`magenta-humaniser-groove` · Other & lab → Magenta

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

`magenta-improvisation` · Other & lab → Magenta

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

`magenta-interpoler-midi` · Other & lab → Magenta

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

### Multichannel

| Component | Summary |
|---|---|
| [Ambisonic Decoder](#ambisonic-decoder) | Decodes an ambisonic field to a real room: concert ring or channel format. |
| [Binaural Monitor](#binaural-monitor) | Makes any layout audible on headphones — ring, 7.1.4, ambisonic field — through virtual speakers filtered by the head. |
| [Declare Layout](#declare-layout) | States what a multichannel file's channels are — a 5.1, a ring, an AmbiX field — so that the rest of the chain knows. |
| [Object Renderer](#object-renderer) | Renders every connected sound object into a single room, chosen here and changeable at any time. |
| [Sound Object](#sound-object) | Attaches its trajectory to a sound without choosing a room: the layout will only be decided at render time, for all objects at once. |
| [Spatialiser](#spatialiser) | Places a sound on a trajectory — azimuth, elevation, distance — in a layout of your choice: concert ring, 5.1 to 7.1.4, or ambisonic field. |

#### Ambisonic Decoder

`decodeur-ambisonique` · Other & lab → Multichannel

*Decodes an ambisonic field to a real room: concert ring or channel format.*

An ambisonic field chooses no room, and that is its strength: written once, it decodes to a ring of eight, of sixteen, a 5.1 or a 7.1.4. This node does that decoding. The decoder is a sampling one: each speaker receives the field read in its own direction. Two precautions make it right. The input's SN3D normalisation is undone at decoding — forgetting it gives a field dominated by its omnidirectional component, where everything seems to come from everywhere. And Zotter and Frank's « max-rE » weights concentrate energy towards the right direction by reducing rear lobes: it is the setting to prefer for listening, and the default. The field's order is read from its label. An AmbiX file loaded from disk is first declared with « Declare Layout ». A higher order localises better, provided there are enough speakers to carry it: an order three on four speakers brings nothing.

| Port | Name | Type | |
|---|---|---|---|
| input | Field | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Room | choice | Octophony (ring of 8) | Stereo / Quad / 5.1 / 7.1 / 7.1.4 / Octophony (ring of 8) / Ring of 16 | The speaker layout to decode to. The subwoofer of a 5.1 or 7.1 receives nothing from the field, which has no bass channel. |
| Weights | choice | max-rE | max-rE / Basic | Max-rE weights concentrate energy towards the source direction and reduce rear lobes; basic weights keep the response most faithful to the field but localise less well. For listening, max-rE. |

#### Binaural Monitor

`ecoute-binaurale` · Other & lab → Multichannel

*Makes any layout audible on headphones — ring, 7.1.4, ambisonic field — through virtual speakers filtered by the head.*

You do not listen to a 7.1.4 on headphones, and yet headphones are where you compose. Without this node, a space written for twelve speakers stays inaudible at the workstation: the browser's player folds everything to stereo by its own rules, which know nothing of ambisonics. Each channel becomes a virtual speaker placed at its direction, filtered by the audio engine's head-related transfer functions. An ambisonic field is first decoded to twenty-six directions spread over the sphere. The process is the same for all four families, so that on headphones you compare comparable things. It is a working monitor, not an export: the subwoofer is added to both ears six decibels lower, and if the sum exceeds full scale the whole render is brought just below it — clipping would mask precisely what you came to hear. The transfer functions are the engine's generic ones: they are not those of your head, and the sense of front and back always suffers a little.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Headphones | audio (stereo) |  |

*No parameters.*

#### Declare Layout

`declarer-disposition` · Other & lab → Multichannel

*States what a multichannel file's channels are — a 5.1, a ring, an AmbiX field — so that the rest of the chain knows.*

A file loaded from disk arrives with a number of channels, and nothing else. Yet four channels is a quad or a first-order ambisonic field: the same number, two worlds, and treating one as the other gives noise. Attic therefore never guesses from the number alone, and this node is what states it. The input's channel count must match the declared layout; otherwise the node refuses, rather than letting a 7.1 pass for a ring of eight. The sound is not changed: only the label is, and it then follows the sound to the export.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Layout | choice | 5.1 | Stereo / Quad / 5.1 / 7.1 / 7.1.4 / Octophony (ring of 8) / Ring of 16 / Ambisonics order 1 (AmbiX) / Ambisonics order 2 (AmbiX) / Ambisonics order 3 (AmbiX) | What the input's channels are. An AmbiX file is declared as ambisonics of the matching order: four channels for order one, nine for two, sixteen for three. |

#### Object Renderer

`rendu-objets` · Other & lab → Multichannel

*Renders every connected sound object into a single room, chosen here and changeable at any time.*

The point where the room is decided. Every connected object — as many as you like, on the same input — is placed on its own trajectory in the chosen layout, then summed. Changing the layout replays the whole piece in another room: a ring of sixteen for concert, a 7.1.4 for broadcast, ambisonics for later decoding, without touching a single object. Objects are rendered at the sample rate of the first of them; objects at different rates should be resampled beforehand, and the node says so rather than mixing seconds that are not the same length.

| Port | Name | Type | |
|---|---|---|---|
| input | Objects | objet |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Layout | choice | 7.1.4 | Stereo / Quad / 5.1 / 7.1 / 7.1.4 / Octophony (ring of 8) / Ring of 16 / Ambisonics order 1 (AmbiX) / Ambisonics order 2 (AmbiX) / Ambisonics order 3 (AmbiX) | The render room, for all objects at once. Changing it rewrites nothing: the trajectories stay the objects' own. |

#### Sound Object

`objet-sonore` · Other & lab → Multichannel

*Attaches its trajectory to a sound without choosing a room: the layout will only be decided at render time, for all objects at once.*

The most compositional family, because it separates what is written from where it is played. An object does not know whether it will end in 5.1, a ring of sixteen or on headphones: it only carries its sound and its movement. Connect several objects to one « Object Renderer », and the room is chosen once, for all of them; changing it replays the same piece in another room without rewriting anything. It is the principle of cinema's object formats, brought into the graph. Trajectories are set like the spatialiser's: three modulation inputs, azimuth, elevation, distance, shown in the inspector as their ranges. The output is not audio: it is an object, which cannot be listened to alone and only connects to an object renderer.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Azimuth modulation | curve |  |
| input | Elevation modulation | curve |  |
| input | Distance modulation | curve |  |
| output | Object | objet |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Name | text | — |  | A name to find your way in the renderer, which lists its objects. |
| Azimuth | slider | 0 ° | -180 – 180 °, step 1 | The direction in the horizontal plane, in degrees: zero in front, positive to the left, one hundred and eighty behind. It is the convention of ambisonics and of the ITU, held throughout this family so that a panner never turns the opposite way from a decoder. |
| Elevation | slider | 0 ° | -90 – 90 °, step 1 | The height, in degrees: zero at the horizon, ninety at the zenith. A layout without height speakers brings it back to the horizon; 7.1.4 and ambisonics render it. |
| Distance | slider | 1 | 1 – 10, step 0.1 | The relative distance: one for the reference, two for twice as far, which halves the amplitude. Closer than the reference the sound stops growing — an infinitely near source must not become infinitely loud. |
| Azimuth min | slider | -180 ° | -180 – 180 °, step 1 | The azimuth a connected curve's zero means. From -180 to 180, a ramp takes the source through one full turn. |
| Azimuth max | slider | 180 ° | -180 – 180 °, step 1 | The azimuth the curve's one means. |
| Elevation min | slider | 0 ° | -90 – 90 °, step 1 | The elevation a connected curve's zero means. |
| Elevation max | slider | 60 ° | -90 – 90 °, step 1 | The elevation the curve's one means. |
| Distance min | slider | 1 | 1 – 10, step 0.1 | The distance a connected curve's zero means. |
| Distance max | slider | 4 | 1 – 10, step 0.1 | The distance the curve's one means. A rising curve moves the source away, and the amplitude follows 1/r. |

#### Spatialiser

`spatialiseur` · Other & lab → Multichannel

*Places a sound on a trajectory — azimuth, elevation, distance — in a layout of your choice: concert ring, 5.1 to 7.1.4, or ambisonic field.*

The central node of the family. A sound comes in, mono or not — it is first brought down to mono, since it is a source being placed and not a field —, and it comes out in the chosen layout, labelled as such: the layout then travels with it to the export, through any ordinary effect. The three trajectories are modulation inputs. Connect a curve to the azimuth and the source turns; to the elevation, it rises; to the distance, it moves away. Without a curve each setting holds its value. In the inspector, a connected trajectory shows as its range, in its degrees. For a ring or a channel layout, placement follows Ville Pulkki's vector base amplitude panning: a source only excites the speakers framing it, and power stays constant wherever it is — a source passing between two speakers neither dips nor swells. The heights of 7.1.4 are handled by layers, ear level and ceiling. The subwoofer never receives panning: it has no direction. For ambisonics, the source is encoded into the field following the AmbiX convention — ACN channel order, SN3D normalisation —, the one decoders and production tools expect. The field chooses no room: a decoder or the binaural monitor will do so afterwards. The player under this node plays a stereo fold-down computed by Attic, which knows how to decode ambisonics: it resembles the piece at a sixth of its weight, but front and back merge in it, as in any stereo. To hear the composed space on headphones, connect « Binaural Monitor ». The saved file stays multichannel — it is rebuilt from the full buffer, not from the preview.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| input | Azimuth modulation | curve |  |
| input | Elevation modulation | curve |  |
| input | Distance modulation | curve |  |
| output | Audio | audio |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Layout | choice | 7.1.4 | Stereo / Quad / 5.1 / 7.1 / 7.1.4 / Octophony (ring of 8) / Ring of 16 / Ambisonics order 1 (AmbiX) / Ambisonics order 2 (AmbiX) / Ambisonics order 3 (AmbiX) | The room being written for. Rings and channel formats are real speakers; ambisonics is a field, decoded later to any room. The octophony numbers its channels clockwise starting left of the axis: it is the most widespread convention for concert rings, not the only one. |
| Azimuth | slider | 0 ° | -180 – 180 °, step 1 | The direction in the horizontal plane, in degrees: zero in front, positive to the left, one hundred and eighty behind. It is the convention of ambisonics and of the ITU, held throughout this family so that a panner never turns the opposite way from a decoder. |
| Elevation | slider | 0 ° | -90 – 90 °, step 1 | The height, in degrees: zero at the horizon, ninety at the zenith. A layout without height speakers brings it back to the horizon; 7.1.4 and ambisonics render it. |
| Distance | slider | 1 | 1 – 10, step 0.1 | The relative distance: one for the reference, two for twice as far, which halves the amplitude. Closer than the reference the sound stops growing — an infinitely near source must not become infinitely loud. |
| Azimuth min | slider | -180 ° | -180 – 180 °, step 1 | The azimuth a connected curve's zero means. From -180 to 180, a ramp takes the source through one full turn. |
| Azimuth max | slider | 180 ° | -180 – 180 °, step 1 | The azimuth the curve's one means. |
| Elevation min | slider | 0 ° | -90 – 90 °, step 1 | The elevation a connected curve's zero means. |
| Elevation max | slider | 60 ° | -90 – 90 °, step 1 | The elevation the curve's one means. |
| Distance min | slider | 1 | 1 – 10, step 0.1 | The distance a connected curve's zero means. |
| Distance max | slider | 4 | 1 – 10, step 0.1 | The distance the curve's one means. A rising curve moves the source away, and the amplitude follows 1/r. |

### Speech to Text

| Component | Summary |
|---|---|
| [Sherpa ASR](#sherpa-asr) | Local speech recognition via Sherpa-ONNX (multilingual Whisper tiny). |
| [Whisper (English)](#whisper-english) | English speech recognition (OpenAI Whisper base). |

#### Sherpa ASR

`sherpa-asr` · Other & lab → Speech to Text

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

`whisper-en` · Other & lab → Speech to Text

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
| [Stable Audio 3 Continuation](#stable-audio-3-continuation) | [experimental] Extends an audio track by conditioning Stable Audio 3 small-music on its latent. Quality is limited: the int4 encoder is not perfectly aligned with the DiT. The ONNX model (~640 MB + encoder) runs in the main process. |
| [Time Stretch (DTW)](#time-stretch-dtw) | [experimental — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity, by linear interpolation along the frame correspondence. This is not a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback). |

#### AR Continuation

`continuation-spectrale-ar` · Other & lab → Test zone

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

`continuation-spectrale-lstm` · Other & lab → Test zone

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

`pca-neuronale` · Other & lab → Test zone

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

`continuation-stable-audio-3` · Other & lab → Test zone

*[experimental] Extends an audio track by conditioning Stable Audio 3 small-music on its latent. Quality is limited: the int4 encoder is not perfectly aligned with the DiT. The ONNX model (~640 MB + encoder) runs in the main process.*

[experimental] Extends an audio track with Stable Audio 3 small-music. The model encodes the input audio, keeps its prefix and generates the continuation via causal inpainting. Quality remains very limited: the available int4 ONNX encoder is not perfectly aligned with the DiT latent space, so the continuation may be a drone or incoherent noise. Inputs longer than 5 seconds give better results. The ONNX bundle (~640 MB + ~36 MB encoder) runs in the main process. Generation is slow (several minutes). Requires the small-music model and the encoder_q4.onnx in the same folder.

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

`etirement-dtw` · Other & lab → Test zone

*[experimental — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity, by linear interpolation along the frame correspondence. This is not a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback).*

[experimental — very questionable result] Re-stretches Track A's audio along the alignment path produced by Audio Similarity (connect its « Alignment path » output here, and the same Track A to both nodes). Simple linear-interpolation resampling along the frame correspondence — not a phase vocoder: pitch drifts locally wherever the rate changes (like variable-speed playback), a known limitation rather than a hidden defect. The output takes Track A's sample rate and channel count, but its duration follows the reference track's frame count (derived from the path) — never needs the reference track's audio itself. Requires Audio Similarity to have run first on the same Track A.

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

`edition-abc-llm` · Other & lab → Text

*Edits an ABC score with a local Ollama model — new chords, or new pitches on the same rhythm — without it being able to break what must stay fixed.*

Edits an ABC score with a local language model (Ollama), in a way that prevents it from breaking what must stay fixed. The design comes from a measurement made before development: local models asked to rewrite the whole tune failed 19 times out of 19, even when sent back the list of their errors — unchanged copy, lost header, broken bars, missing note. The same models, asked only for what changes, in a JSON format enforced by Ollama, succeeded 20 times out of 20. Hence two operations. Reharmonize: the model returns one or two chords per bar, which Attic places on the original melody. Rewrite pitches: it returns exactly one pitch per note, which Attic places on the original rhythm, in the chosen key. A rejected answer — unreadable JSON, unknown chord, mere copy of the original — is sent back to the model with the precise list of problems, up to the chosen number of attempts. The result is then checked as by « ABC Constraints ». What is not offered: free rhythmic variation, measured at 0 successes out of 10, the models getting bar lengths wrong. What is not guaranteed: musical quality — the proposed chords may be bland or odd; the report's two indicators help see it. Tunes starting with a pickup are not handled. Requires Ollama and the model installed (« ollama pull gemma4:12b »).

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

`generateur-script-ia` · Other & lab → Text

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

`gpt2-paroles` · Other & lab → Text

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

`modifier-texte` · Other & lab → Text

*Transforms incoming text: replace, case, whitespace, wrapping.*

Sits behind any text output — Sherpa transcription, PDF extraction, LLM output, generated lyrics — to adapt it before whatever comes next: a MusicGen prompt, speech synthesis, a Text to MIDI. It was the missing link between nodes that produce text and nodes that consume it, which until now forced a detour through the Python Processor for a simple replacement. One operation at a time, picked from the list: literal replace, regular-expression replace (where $1 and $2 refer to captured groups), upper or lower case, whitespace tidying, or wrapping with a prefix and a suffix. To combine several, chain several copies of the node — which is what a graph makes natural, and avoids one node per operation in a catalogue that already holds 245. Note: an invalid regular expression does not fail the node; the text passes through unchanged and the message gives the reason, because these patterns are written by trial and error and halting the whole graph on every missing bracket would be unbearable. Whitespace tidying preserves line breaks: lyrics keep their structure.

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

`emotions` · Other & lab → Text

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

`documentation-graphe` · Other & lab → Text

*Documents the graph it sits in: every node, its set values, its wiring, and the notice of every component used.*

Documents the graph it sits in, rather than Attic's components in general: the components.md catalog already does that. This node answers another need, that of handing a graph over to someone — a colleague, or an agent that has to build an application on it. It reads the whole graph, records each node's set values rather than its defaults, recovers its wiring port by port, computes the order in which the engine runs them, and gathers the notice of every component used — once per component, however many instances there are. Two texts come out of the same survey, because two audiences do not read the same thing. The « Documentation » output is dense Markdown, in the order useful to an agent: the graph first, the notices next, and the graph's JSON last, which is enough to rebuild it. The « Site » output is a self-contained HTML page — contents on the left, parameter tables, and a diagram of the graph drawn at the nodes' real positions, so that whoever reads the page recognises what they have in front of them in the application. Four things are worth knowing. The node has no input: it has nothing to receive, and where it sits does not matter. It documents the graph as it is composed, meta-components unexpanded and loops unrolled, because nobody would recognise their work in numbered loop copies. It flags what would stop the graph from running — a required input left free, a component unknown to the registry, a cycle. And it writes nothing to disk until an output folder is given. One limit, finally, stated rather than worked around: a component's documentation is its notice, its ports and its parameters, not its source code — the shipped application does not contain its sources, and promising the code would be promising what cannot be delivered.

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

`noms-instruments` · Other & lab → Text

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

`generateur-paroles` · Other & lab → Text

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

`nllb-paroles` · Other & lab → Text

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

`styles-musicaux` · Other & lab → Text

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

`ollama-llm` · Other & lab → Text

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
| Timeout | number | 600 s | 30 – 1800 s, step 30 | Timeout before aborting. The first call to a model must load it into memory: allow several minutes for a large model (Qwen3.6 = 24 GB). Subsequent calls are much faster while the model stays resident. |

#### OPUS-MT Translation

`traduction-opus` · Other & lab → Text

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

`prompt-vers-graphe` · Other & lab → Text

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

`qwen2.5-lyrics` · Other & lab → Text

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

`reservoir-textuel` · Other & lab → Text

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

`tessitures-voix` · Other & lab → Text

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
| [Dissonance Curve](#dissonance-curve) | Finds the scale a timbre calls for: the dips of its dissonance curve are its intervals. |
| [Pitch-Class Sets](#pitch-class-sets) | Analyses a chord or passage as a pitch-class set: normal form, prime form, interval vector. |
| [Progression](#progression) | Generates a chord progression from a key and roman numerals. |
| [Rhythm Analysis](#rhythm-analysis) | Describes a rhythm the way « Pitch-Class Sets » describes a chord: intervals, evenness, offbeats, necklace. |
| [Scale](#scale) | Lists the notes of a scale from a tonic and a scale type. |
| [Species Counterpoint](#species-counterpoint) | Checks a first-species counterpoint against Fux's rules and annotates every infringement. |
| [Transpose](#transpose) | Transposes a note or chord by a given interval. |
| [Voice-Leading Distance](#voice-leading-distance) | Measures in semitones what each chord change costs, and says which one flows and which one strains. |
| [World Scales](#world-scales) | Maqamat, ragas and gamelan scales, in cents — the degrees a keyboard cannot play. |

#### Chord

`tonal-accord` · Other & lab → Theory

*Detects the chord name from its notes.*

Detects a chord name from a list of notes. Example: C E G → C major. Accepts notes separated by spaces, commas or semicolons.

| Port | Name | Type | |
|---|---|---|---|
| input | Notes | text |  |
| output | Name | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | text | `C E G` |  | Chord notes separated by spaces (e.g. C E G, F A C E). |

#### Dissonance Curve

`courbe-dissonance` · Other & lab → Theory

*Finds the scale a timbre calls for: the dips of its dissonance curve are its intervals.*

After William Sethares, « Local consonance and the relationship between timbre and scale », Journal of the Acoustical Society of America 94(3), 1993, taken up in « Tuning, Timbre, Spectrum, Scale » (1998). Attic measured spectra and knew about temperaments, without ever connecting the two. Yet this is Sethares' thesis: consonance does not rest on intervals fixed in advance, but on the agreement between a sound's spectrum and the scale applied to it. The procedure. The timbre is sounded against a transposed copy of itself, at every interval within an octave, and the roughness of the whole is measured each time. Where the curve dips, the timbre supports that interval; elsewhere its partials beat. The dips are therefore its scale. What the computation shows, and what is written nowhere in the code: for a harmonic sound the dips fall on the octave, the fifth at 702 cents, the fourth at 498, the thirds at 386 and 316. Just intonation is not a cultural choice — it is the consequence of a harmonic spectrum. And conversely. A timbre whose partials are not whole multiples calls for another scale, whose very octave may no longer sit at 1200 cents. The example Sethares develops is the gamelan: metallophones have inharmonic spectra, and the slendro and pelog scales follow them. Feed in a recording of a bell, a plate or a voice: the scale that comes out has no reason to be ours.

| Port | Name | Type | |
|---|---|---|---|
| input | Audio | audio |  |
| output | Scale | text |  |
| output | Curve | curve |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Timbre | choice | Measured from input | Measured from input / Harmonic / Stretched | Where the partials come from. « Measured » takes them from the connected sound, at its loudest moment. « Harmonic » uses a reference timbre, the one whose curve recovers just intonation — the point of comparison. « Stretched » is there to see the process at work: the spectrum is deformed and one watches the scale move with it. |
| Partials | slider | 8 | 2 – 24, step 1 | How many partials to keep. Few, and the curve is smooth but coarse; many, and it bristles with tiny dips due to faint partials. Between six and ten suits most sounds. |
| Stretch | slider | 2.1 | 1.5 – 2.6, step 0.05 | Octave stretch factor of the timbre, when « Stretched » is chosen. At 2 the timbre is harmonic and nothing moves. At 2.1, that timbre's octave goes to 1249 cents, and every other dip follows. |
| Range | slider | 1300 cents | 600 – 2400 cents, step 100 | How far the curve is computed. Ask a little beyond the interval of interest: neither end of a curve can be detected as a dip, having no neighbour on one side, and a curve stopped exactly at 1200 does not return the octave. |
| Depth | slider | 0.005 | 0.001 – 0.1, step 0.001 | Minimum depth for a dip to be kept, as a fraction of the curve's range. Raising it keeps only the clear intervals; lowering it brings out the degrees the timbre barely supports. |

#### Pitch-Class Sets

`classes-hauteurs` · Other & lab → Theory

*Analyses a chord or passage as a pitch-class set: normal form, prime form, interval vector.*

Analyses a chord or passage as a pitch-class set. When a harmony is no longer tonal, calling it « seventh on D » means nothing; the analysis developed by Allen Forte and Milton Babbitt offers something else. The chord is reduced to the classes it uses, then the most compact way of writing them is sought: that is the normal form. It is then compared with its inversion and the one most packed to the left is kept, brought to zero: that is the prime form, the family's name. Two chords that look unrelated on paper — a chord, the same one inverted, transposed, turned over — end up together, and one can finally say that two passages use the same material. The interval vector gives the colour: how many minor seconds, major seconds, thirds… the set holds. A vector rich in fifths sounds open, one rich in semitones sounds tight. It is not enough to name, though: the two « all-interval » tetrachords share a vector and have different prime forms — the Z-relation. Transpositional symmetry explains why some sets go nowhere: the diminished chord and the whole-tone scale come back identical to themselves after transposition, hence without possible tonal function, and that is the basis of the procedure in Debussy and Messiaen. Two limits, stated rather than hidden. Names are given only for the sets catalogued here — the twelve trichords in full, and the common chords and scales: copying Forte's two hundred entries from memory would risk labelling wrongly, which is worse than not labelling, and the prime form is enough to identify the rest. And the prime form is computed by the « most packed to the left » method of Straus's textbooks; it differs from Forte's own on a handful of five- and six-note sets. « Chord by chord » analyses each group of simultaneous notes and then lists the prime forms that recur.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Analysis | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Notes | text | `C E G B` |  | The notes to analyse, as names or numbers from 0 to 11. A MIDI file on the input wins. |
| Grouping | choice | Whole excerpt | Whole excerpt / Chord by chord | « Chord by chord » analyses each group of simultaneous notes separately, then lists the prime forms that recurred — which is what allows saying that two passages use the same material. |

#### Progression

`tonal-progression` · Other & lab → Theory

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

#### Rhythm Analysis

`analyse-rythme` · Other & lab → Theory

*Describes a rhythm the way « Pitch-Class Sets » describes a chord: intervals, evenness, offbeats, necklace.*

After Godfried Toussaint, « The Geometry of Musical Rhythm: What Makes a "Good" Rhythm Good? » (2013). Attic analysed pitch in depth — normal and prime forms, interval vector, Forte names, neo-Riemannian transformations — and could do nothing with rhythm but generate it. Toussaint showed that rhythm is described with exactly the same tools: a set of points on a circle, its distances, its symmetries, its evenness. Every measure counts on the circle, because a rhythm repeats: its end touches its beginning. That is what makes a rhythm and its rotations the same object — the son clave and the rumba differ only in where one starts counting, and their necklace says so. What each measure teaches. The successive intervals are how percussionists name their rhythms: the son clave is the 3-3-4-2-4. The distance histogram is the rhythm's interval vector, and two rhythms sharing it resemble each other regardless of rotation. A deep rhythm gives each gap its own rarity, so that no pair of onsets in it is interchangeable. Evenness says how far apart the onsets are, one being perfect regularity. Offbeats are the onsets falling on no regular subdivision — the measure that, according to Toussaint, separates African and Afro-Cuban rhythms from European dance rhythms far better than the usual syncopation measures.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Analysis | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Pattern | text | `x..x..x...x.x...` |  | The rhythm to analyse, as filled and empty cells — « x..x..x. » — or as positions — « 0 3 6 ». The default is the son clave, the most widespread rhythm in the world. A MIDI file on the input wins. |
| Steps | slider | 16 | 2 – 64, step 1 | Number of cells in the cycle. Used when the pattern is given as positions, and to quantise a MIDI file. A pattern written as cells imposes its own length. |
| Cycle | slider | 2 s | 0.25 – 16 s, step 0.25 | Length of one turn, to quantise a MIDI file. With no MIDI connected, this setting does nothing. |

#### Scale

`tonal-gamme` · Other & lab → Theory

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

`contrepoint-especes` · Other & lab → Theory

*Checks a first-species counterpoint against Fux's rules and annotates every infringement.*

Checks a first-species counterpoint. This is Attic's first node that corrects rather than produces. Johann Joseph Fux published in 1725 the « Gradus ad Parnassum », where counterpoint is learned by species: in the first, note against note, which isolates the question of harmony and motion between two voices without rhythm interfering. Haydn, Mozart and Beethoven all worked through it, and the rules have not changed since. They amount to few things and each can be checked mechanically: only consonances are allowed — and the fourth is not one in two voices, which always surprises — parallel fifths and octaves are forbidden, as are those reached by similar motion, one begins and ends on a perfect consonance, large leaps are answered by contrary stepwise motion, and the cadence is by contrary motion to the octave. The node rewrites nothing: it annotates, separating prohibitions from mere recommendations. That is what a teacher does, and it is more useful than an automatic correction, which would deprive one of the only thing that matters — understanding why the rule exists. The exercise offered by default is correct: the node must find nothing in it, and that is the module's first test. An over-zealous checker is unusable, since one stops reading it.

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

`tonal-transposer` · Other & lab → Theory

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

#### Voice-Leading Distance

`distance-conduite-voix` · Other & lab → Theory

*Measures in semitones what each chord change costs, and says which one flows and which one strains.*

After Dmitri Tymoczko, « The Geometry of Musical Chords », Science 313(5783), 2006, and « A Geometry of Music » (2011). Attic could already choose a voice leading: « Inversions and Voicings » looks, for each chord, for the register that moves the fewest voices. That is a heuristic, and it returns a chord. What it does not return is a number — and without a number one can neither compare two harmonisations nor find the place in a piece where the movement strains. The Tonnetz, for its part, chains the transformations that move only one voice, but does not say how far the rest moves. The theorem that makes the computation short. One believes one must try every way of pairing the voices — six notes make seven hundred and twenty. Tymoczko proves otherwise: the minimal voice leading between two chords of the same size is always achievable without voice crossings. It therefore suffices to sort both chords and try the rotations of one against the other, and the result is the exact minimum, not an approximation. What the numbers say. The neo-Riemannian transformations P, L and R cost one, one and two semitones — the smoothest chord changes that exist between triads. Six semitones is the maximum between two triads, reached by diametrically opposed chords such as C and F sharp. Between the two, one reads a progression's tension.

| Port | Name | Type | |
|---|---|---|---|
| input | MIDI | MIDI |  |
| output | Analysis | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Chords | text | `0 4 7 \| 9 0 4 \| 5 9 0 \| 7 11 2 \| 0 4 7` |  | The chords, separated by vertical bars, each as pitch classes from 0 to 11. The default is the progression C – A minor – F – G – C. A MIDI file on the input wins. |
| Tolerance | slider | 0.05 s | 0.01 – 0.5 s, step 0.01 | Gap below which two notes of a MIDI file are taken as simultaneous, hence members of the same chord. With no MIDI connected, this setting does nothing. |

#### World Scales

`gammes-monde` · Other & lab → Theory

*Maqamat, ragas and gamelan scales, in cents — the degrees a keyboard cannot play.*

The Scale node knew seven church modes and two pentatonics; the Temperament node, the historical Western temperaments. Neither maqam, nor raga, nor gamelan. This was not an oversight in a list: these systems do not fit in twelve equal semitones. Maqam Rast has a third midway between major and minor; the Indian shrutis divide the octave into twenty-two unequal degrees; Javanese slendro has neither a just octave nor an equal interval. Writing them takes cents, not note numbers — and that is why this node returns frequencies and never keys. Where the figures come from. The maqamat follow the quarter-tone division adopted at the 1932 Cairo Congress, which remains the written reference even where practitioners depart from it. The ragas are given in just intonation, as the shrutis define them: Bhairav's third is at 386 cents, the pure third, not the piano's 400. The gamelan scales are averages — each ensemble is tuned for itself, and two gamelans do not play the same scale. That is a property of the genre, not an imprecision of the measurement. And this answers the dissonance curve. Sethares' central example is precisely the gamelan: metallophones have inharmonic spectra, and both slendro and pelog follow those spectra rather than the harmonic series. Slendro's octave is 1208 cents and not 1200 — it is stretched, as those spectra are. Feeding a gamelan recording into « Dissonance Curve » and comparing the dips obtained to the degrees listed here is the verification Sethares himself proposes.

| Port | Name | Type | |
|---|---|---|---|
| output | Scale | text |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Scale | choice | Maqam Rast | Maqam Rast / Maqam Bayati / Maqam Hijaz / Maqam Saba / Raga Bhairav / Raga Yaman / Raga Todi / Slendro (gamelan) / Pelog (gamelan) / The twenty-two shrutis | The system to read. Each carries its own note, saying what one should know before using it. |
| Tonic | slider | 220 Hz | 55 – 880 Hz, step 1 | Frequency of the first degree. In hertz and not as a note, because these scales do not sit on a keyboard. |
| Tolerance | slider | 20 cents | 1 – 50 cents, step 1 | Deviation from the tempered semitone beyond which a degree is declared unplayable on a keyboard. Twenty cents is about what a trained ear hears as out of tune. |

### Video

| Component | Summary |
|---|---|
| [Application Film](#application-film) | Films the Attic window while it builds the graph it sits in, runs it and plays each node. |
| [Demonstration](#demonstration) | Makes a video of the graph it sits in: each node in turn, its name, its settings, and its result played or shown. |

#### Application Film

`film-application` · Other & lab → Video

*Films the Attic window while it builds the graph it sits in, runs it and plays each node.*

This node films the Attic window while it replays the graph it sits in. It connects to nothing; the film starts from its « Film the application » button, not from running the graph.¶First the construction: the canvas empties, then each node appears in its place, captioned with its name and where it sits in the palette; its cables are drawn from the nodes already placed, and its settings open in the inspector. Nodes are placed following the chains of the graph: a node comes right after the one that feeds it. Then the tour: the graph runs, the view moves close to each node in turn, the inspector shows its settings, and its result is heard for the length per node. A drawn cursor shows every gesture. The film ends on the whole graph.¶The title, if filled in, opens the film. Esc stops it. At the end, the graph, the view and the selection are put back as they were, with the results of the run. In Attic, the window films itself; in a browser, the browser asks permission to share the tab. The recorded sound is that of the results played. The film is a WebM, at the size of the window.

*No ports.*

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Length per node | slider | 5 s | 1 – 60 s, step 0.5 | Listening time for each node during the tour. A shorter sound stops earlier; a node that returns neither sound nor picture is skipped. |
| Title | text | — |  | Title shown for 3 s at the opening of the film. Empty, the film starts straight on the construction. |

#### Demonstration

`demonstration` · Other & lab → Video

*Makes a video of the graph it sits in: each node in turn, its name, its settings, and its result played or shown.*

This node makes a video of the graph it sits in. It connects to nothing: it runs after every other node, takes their results and gives each one a segment of the same length. Nodes are shown following the chains of the graph: a node comes right after the one that feeds it, before moving on to another branch. No node is shown before what it receives. Each segment shows the node's name, its summary, its settings, and its result. A sound is played while its waveform scrolls under a playhead; a curve is drawn and traversed; an image is shown; a text is shown, and scrolls if it overflows the frame. A node that returns several things is shown by its sound first, then its image, its curve, its text. A node that returns nothing showable gets no segment. At the bottom of the picture, the chain of steps places the current node: a line joins two steps when the first feeds the second, a dot separates them otherwise. A node's sound starts 0.4 s after the start of its segment and stops 0.3 s before the end; a longer sound is cut with a fade, and the caption gives the excerpt played. Sounds are laid in as they are, without normalisation: one hears the levels the graph produces. The video is rendered offline, frame by frame, and encoded as WebM (VP9 video, Opus sound at 48 kHz): two renders of the same graph give the same video. Running this node alone runs the whole graph. The copies of a node inside a loop get a single segment, showing the result of the last pass.

| Port | Name | Type | |
|---|---|---|---|
| output | Video | file |  |

| Parameter | Type | Default | Values | Description |
|---|---|---|---|---|
| Length per node | slider | 6 s | 2 – 60 s, step 0.5 | Length of each node's segment. A sound longer than the segment, minus 0.7 s, is cut. |
| Title | text | — |  | Title shown on a 3 s opening card. Empty, the video starts straight on the first node. |
| Resolution | choice | 720p | 480p / 720p / 1080p | Picture size: 854 × 480, 1280 × 720 or 1920 × 1080. Rendering time grows with it. |
| Frames per second | choice | 30 | 24 / 30 / 60 | Video frame rate. 60 makes scrolling smoother and doubles rendering time. |
| Settings | choice | Shown | Shown / Hidden | Shows the node's set values to the right of each segment, eight at most. Hidden, the result takes the full width. |
