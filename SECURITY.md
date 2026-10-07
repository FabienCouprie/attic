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

### `sprintf-js` — GHSA (moderate, no patch exists)

> sprintf-js vulnerable to denial of service through unbounded precision
> specifiers

**No patched version exists.** The advisory covers `<= 1.1.3`, and 1.1.3 is the
latest published release: there is no version to move to, so an `overrides`
entry would have nothing to point at.

**It is not in the shipped application.** Verified with `npm ls sprintf-js
--omit=dev`, which returns an empty tree. It reaches the repository only through
development dependencies, by two paths: `@huggingface/transformers` →
`onnxruntime-node` → `global-agent` → `roarr`, and `@tensorflow/tfjs` →
`argparse`. Dependabot classifies the alert as `development` scope for the same
reason.

**What the advisory needs is an attacker-controlled format string.** `roarr` is
a logger and `argparse` formats usage messages; both build their format strings
from literals in their own source. Nothing in Attic passes user input, file
content or network data to either as a format.

**We cannot remove the dependency.** Both paths are transitive and start at
packages we need at build time. `argparse` 2.x did drop `sprintf-js` and
declares no dependencies at all, but it is a rewrite with a different API, and
`@tensorflow/tfjs` declares `argparse@1.0.10`: forcing 2.x on it through
`overrides` would be an untested substitution on a package we do not control.
The tree already carries both, 1.0.10 under `@tensorflow/tfjs` and 2.0.1 under
`electron-updater`.

*Re-examine this entry if `sprintf-js` publishes a patched release, if either
path reaches the production tree, or if any of our own code starts formatting
with a string it did not write itself.*

## Acknowledgments

We thank the following people who have responsibly reported security vulnerabilities in Attic:

*(No vulnerabilities reported yet.)*
