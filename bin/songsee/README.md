# Songsee binary directory

This directory must contain the Songsee CLI binary (`songsee.exe` on Windows, `songsee` on
macOS/Linux). Songsee is a Go CLI that generates audio visualization images (spectrogram, mel,
chroma, hpss, selfsim, loudness), used by the « Songsee Visualizer » component.

## Installation

The binary is not versioned in git. It lives on the `assets` release, at the version pinned in
`scripts/outils-manifest.json`, and is fetched with its checksum:

```bash
npm run outils              # fetch for this platform, verify the SHA-256
npm run outils:verifier     # report what is missing, touch nothing
```

## Updating the pin

Change `amont.version` in `scripts/outils-manifest.json`, pick a new asset name carrying that
version, then:

```bash
npm run outils:construire songsee   # clone at the pinned tag, build with Go 1.25+
npm run outils:publier songsee      # upload to the release, record size and checksum
```

Nothing clones the upstream repository at packaging time any more: what ships in the installer is
the version that was measured, not the state of a branch on that day.

Upstream: https://github.com/openclaw/songsee (MIT).

## Verification

```bash
./bin/songsee/songsee --version
./bin/songsee/songsee --help
```

## Packaging

`bin/songsee` is included as an `extraResource` by electron-builder, so the binary is shipped with
the app.
