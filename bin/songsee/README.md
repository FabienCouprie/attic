# Songsee binary directory

This directory must contain the Songsee CLI binary (`songsee.exe` on Windows, `songsee` on macOS/Linux).

Songsee is a Go CLI that generates audio visualization images (spectrogram, mel, chroma, hpss, selfsim, loudness, tempogram, mfcc, flux).

## Installation

### Option 1: Build from source (recommended)

Requires Go 1.25+ installed.

```bash
npm run download:songsee
```

Or manually:

```bash
git clone https://github.com/openclaw/songsee.git
cd songsee/cmd/songsee
go build -o ../../../bin/songsee/songsee .
```

### Option 2: Homebrew (macOS / Linux)

```bash
brew install steipete/tap/songsee
```

Then copy or symlink the binary into this directory:

```bash
cp $(which songsee) bin/songsee/songsee
```

### Option 3: go install

```bash
go install github.com/steipete/songsee/cmd/songsee@latest
# Binary is in $(go env GOPATH)/bin
```

## Verification

```bash
./bin/songsee/songsee --version
./bin/songsee/songsee --help
```

## Packaging

`bin/songsee` is included as an `extraResource` by electron-builder, so the binary is shipped with the app.
