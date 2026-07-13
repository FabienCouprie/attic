# Breakdown of `App.tsx` — completed ✅

**Status: the 3 hooks are extracted.** `App.tsx` went from **839 to 437 lines**
(`usePersistance` + `useMetaComposants` + `useExecutionGraphe` in `src/ui/hooks/`),
with no regression: `tsc` 0 errors · 19 tests · build OK · real flows re-checked in
the browser at each step. This document traces the method and serves as a
non-regression checklist for any future rework.

Goal: break down `ui/App.tsx` (~800 lines, a "God" component) into hooks **without
regression**. The difficulty is not typing (covered by `tsc`) but **behavioral
verification**: runtime regressions (stale closures, un-updated refs, effect
ordering) are invisible to the compiler, and part of the flows (drag-connection,
audio playback, Electron dialogs, Demucs) cannot be driven automatically.

Method: **characterization tests first, then refactor** (red→green).

---

## Step 1 — done: pure graph logic + tests

The graph logic, previously **inlined in the `lancer` loop**, is extracted into
**pure, domain-neutral, tested** functions:

**`src/core/graphe.ts`**
| Function | Role |
|---|---|
| `ordreTopologique(ids, aretes)` | topological sort (Kahn) → execution order |
| `ancetres(cible, aretes)` | transitive upstream of a node ("priority" mode) |
| `empreinteEntrees(nodeId, aretes)` | "incoming sources" cache key |
| `empreinteParametres(data)` | "parameters" cache key (current, audio-tinted) |
| `resoudreEntree(nodeId, i, aretes, resultats)` | value connected to input `i` |
| `valeursEntrantes(nodeId, aretes, resultats)` | all inputs (variadic) |

**`src/core/graphe.test.ts`** — 9 tests freezing the behavior: chain, diamond,
isolated nodes, cycle (returns the acyclic part), ancestors, stable/sensitive
fingerprints, resolution via handles (`out:2 → in:1`), null inputs not computed.

**`App.tsx` now delegates to these functions** (the inline code was replaced): they
are the **single source of truth** for ordering and caching. Any future hook
breakdown will not touch this logic again — it is frozen + tested.

Verified: `tsc` **0 errors** · **19 tests** (including 9 new) · build OK · real
execution of a node in the browser → "Done" status + audio player (the `lancer`
loop correctly goes through the extracted functions).

---

## Next steps — hook breakdown

Proposed order, from least coupled to most coupled, **one step at a time**:

1. ✅ **`usePersistance`** — JSON export/import. **Done.** Extracted into
   `src/ui/hooks/usePersistance.ts` (with `serialiserMeta`), `App.tsx` calls
   `usePersistance({...})` and wires `onExporter={exporter}` / `onImporter={importer}`.
   Extraction **identical** (no behavior change). App.tsx: 808 → 703 lines.
   Verified: `tsc` 0 errors · 19 tests · build OK · **browser round-trip** (drop
   a node → Export captures a valid JSON → modify a parameter → Import → the node
   and the modified parameter are restored, 0 console errors).
2. ✅ **`useMetaComposants`** — group / ungroup / navigation. **Done.** Extracted
   into `src/ui/hooks/useMetaComposants.ts` (`grouper`, `degrouper`,
   `sauvegarderContexteCourant`, `ouvrirMeta`, `remonterA`; the shared helper
   `idUnique` was moved to `src/ui/ids.ts`). The pure logic stays in `core/meta.ts`
   (tested); the hook only orchestrates it with React state. Extraction
   **identical**. App.tsx: 703 → 596 lines. Verified: `tsc` 0 errors · 19 tests ·
   build OK · **complete meta cycle in the browser** (select 2 nodes → **Group**
   → double-click opens the inside + breadcrumb "Atelier / Groupe 1" → **Atelier**
   returns to the root → **Ungroup** re-exposes the 2 sub-nodes).
3. ✅ **`useExecutionGraphe`** — the `lancer` loop + cascade reset + statuses.
   **Done.** Extracted into `src/ui/hooks/useExecutionGraphe.ts`; App gets
   `{ lancer, reinitialiserNoeud }` and keeps `lancerRef.current = lancer` (used
   by `ajouterNoeud`/`callbacksNoeud`/`usePersistance`). Ordering/caching/resolution
   stay in `core/graphe.ts` (tested). Extraction **identical** + cleanup of 12
   `core`/`audio` imports that became unnecessary. App.tsx: 596 → 437 lines.
   Verified: `tsc` 0 errors · 19 tests · build OK · **real execution in the
   browser** (node *Random Melody* → **Run** / ▶ "run this block" / spacebar →
   status "terminé", via the extracted `lancer`).

**Bonus — pre-existing bug fixed along the way**: the **Run** button in the toolbar
(`onLancer={lancer}` + `onClick={onLancer}`) was passing the click event as
`noeudPrioritaireId` → `priorite` became an Event object, `ancetres()` found no
node and the button launched **nothing** (only the spacebar shortcut, which calls
`onLancer()` with no argument, worked). Fixed to `onLancer={() => lancer()}`. Bug
prior to the refactor (neither this JSX line nor `BarreOutils` had been touched) —
discovered thanks to the browser verification post-extraction.

Each step:
- `tsc` + `vitest` + `build` green;
- **manual checklist** in the desktop app on the affected area;
- backup copy beforehand (near-free rollback).

---

## What the tests do NOT cover (→ manual checklist)

Unit tests freeze the **pure logic**. Still to verify by hand, in the desktop app,
after each step:
- add 2 nodes, **connect them by drag**, **Run** → sound comes out;
- an effect, a generator, a **splitter (native Demucs)**;
- **group → double-click opens the inside → ungroup**;
- **Export** then **Import** the JSON → graph (and a meta) restored;
- change tab, change language, **Electron** dialogs (folders).

A **witness workflow** (`.json` exported from a working version) serves as a
"golden file": import it after refactor and compare.

---

## Summary

Breakdown **completed**. The risky core of `lancer` (ordering + caching + input
resolution) was first **isolated and tested** in `core/graphe.ts` (the safety net),
then the three hooks (`usePersistance`, `useMetaComposants`,
`useExecutionGraphe`) were extracted one by one to `src/ui/hooks/`, each verified
`tsc`/tests/build + real flow in the browser. `App.tsx`: **839 → 437 lines**,
with no regression. What remains in `App.tsx` is orchestration (state, tabs, JSX)
and node callbacks (`ajouterNoeud`, `callbacksNoeud`) — consistent to keep there.

Final structure:

| File | Role |
|---|---|
| `core/graphe.ts` | pure graph logic (topo, cache, resolution) — **tested** |
| `ui/ids.ts` | node id generation (shared) |
| `ui/hooks/usePersistance.ts` | JSON export / import (+ meta) |
| `ui/hooks/useMetaComposants.ts` | group / ungroup / navigation (§3.8) |
| `ui/hooks/useExecutionGraphe.ts` | `lancer` loop + reset + statuses |
| `ui/App.tsx` | orchestration (state, tabs, JSX, node callbacks) |
