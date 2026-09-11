# Security Policy

## Supported versions

We release security patches for the current minor version line. Please upgrade to the latest patch to receive fixes.

| Version | Supported |
| :------ | :-------- |
| 3.1.x (latest: 3.1.7) | ✅ |
| 3.0.x | ❌ |
| < 3.0 | ❌ |

## Reporting a vulnerability

If you discover a security vulnerability in Attic, please **do not open a public issue**.

Instead, report it privately via:

- [GitHub Security Advisories](https://github.com/FabienCouprie/attic/security/advisories/new)
- Email: [atticofsound@free.fr](mailto:atticofsound@free.fr)

Please include:

- A clear description of the vulnerability.
- Steps to reproduce it.
- Affected version(s) and platform(s).
- Potential impact.
- Suggested fix or mitigation (optional).

## Disclosure policy

We follow a coordinated disclosure process:

1. We acknowledge receipt of your report within 5 business days.
2. We investigate the issue and work on a fix.
3. We release a security patch and publish a GitHub Security Advisory.
4. We credit you in the advisory and in the acknowledgments section below, unless you prefer to remain anonymous.

## Security updates

Security fixes are released as patch versions (for example, `3.1.7` → `3.1.8`). They are announced through:

- GitHub Releases
- A GitHub Security Advisory
- A pinned issue in the repository when the issue is critical

Always keep your installation updated to the latest supported version.

## Accepted risks

Advisories that cannot be fixed by any change we can make, and why we accept
them. Each entry records the analysis so it does not have to be redone at every
review.

### `adm-zip` — GHSA-vwc7-r8mq-g2x9 (moderate, dismissed as *not used*)

> adm-zip extraction follows destination symlinks, allowing arbitrary file overwrite

**No patched version exists.** 0.6.0 is the latest release and the advisory
covers `>= 0.5.9, <= 0.6.0`. The only version outside that range is 0.5.8 — ten
patch releases back, and npm itself classifies the downgrade as breaking.

**The advisory targets `extractAllTo` and `extractEntryTo`. Attic never calls
either.** Verified across `electron/`, `scripts/` and `src/`: no occurrence. The
only place the app reads a `.zip` is the node importer, which iterates entries
itself and writes each one with `fs.writeFileSync`, after resolving and
validating the destination against the installation directory (see
`electron/extraire-node-zip.cjs`, and its Zip Slip tests).

**We cannot remove the dependency.** `onnxruntime-node` declares `adm-zip`
itself, so it stays in the tree even if our own code stops using it — and
dropping `onnxruntime-node` would remove Demucs, Stable Audio 3 and SDXS-512.
Forcing 0.5.8 through `overrides` would likely break that package's install
script, which *does* call `extractEntryTo`: we would trade a vulnerability we
never exercise for ONNX binaries that no longer install.

**The one place the vulnerable API does run** is `onnxruntime-node`'s install
script, extracting an archive it downloaded from Microsoft's CDN during
`npm install` — on a developer machine, not in the shipped application.

*Re-examine this entry if `adm-zip` publishes a patched release, or if the app
ever starts calling an adm-zip extraction API.*

## Acknowledgments

We thank the following people who have responsibly reported security vulnerabilities in Attic:

*(No vulnerabilities reported yet.)*
