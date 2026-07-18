# Atelier — Framework Technical Specification

> **Technical** spec derived from the *attic* project (nodal audio editor), designed
> to be **reapplied to other domains** (image, data/ETL, ML, shaders,
> IoT, or any pedagogical "data flow" tool).
>
> Completes the **conceptual** spec (`Atelier-Specification.md §3`: blocks, typed
> ports, dynamic inputs, catalog, inspector, execution states,
> meta-components, mandatory documentation), which remains **domain-independent**.
>
> Each section distinguishes **[Current]** (what attic does today) and
> **[Target]** (the proposed generalization for other domains).

---

## 1. Purpose & principle

A **flow graph editor**: the user places **blocks** (nodes) on a
canvas, connects their **typed ports**, adjusts their **parameters**, then runs the
graph. Each block is an autonomous **plugin** described by a **sheet** (`PluginDef`)
and an `executer(ctx)` function. A DAG engine evaluates the graph.

Cross-cutting invariants (valid for all domains):
- **Typed & colored ports**: a connection is only allowed if the types are compatible.
- **First-class documentation**: every block has a summary + notice; every parameter has a tooltip. Bilingual. A guard rejects an under-documented block.
- **Deterministic execution & caching** by fingerprint (parameters + inputs).
- **Composition**: sub-graphs are encapsulated as reusable **meta-components**.
- **Persistence**: the graph (and its meta-components) serializes to JSON.

---

## 2. Layered architecture

| Layer | Role | Domain-dependent? |
|---|---|---|
| **`core`** | registry, DAG engine, meta-components, validation, i18n, doc overlay | **No** |
| **Domain adapter** | flow types, value types, plugins, views, preview | **Yes** |
| **`ui` (shell)** | palette, canvas, inspector, breadcrumb, generic node | Generic, driven by registries |

**Golden rule**: *shipping a new domain = providing an adapter (types + plugins + views), without modifying `core` or the `ui` shell.*

[Current] `core/*` is already agnostic. The residual couplings to extract:
1. `TypeValeur` (fixed union `AudioBuffer|Float32Array|File|…`) in `core/types.ts`;
2. port types (`"audio"|"midi"|"controle"|"texte"`) + colors hardcoded;
3. ~18 `if (ficheId === …)` branches in `ui/AtelierNode.tsx` (specific rendering);
4. `ctxAudio` / `toutesEntreesAudio()` in the execution context.

---

## 3. Plugin contract (`PluginDef`)

Base unit. A sheet describes **everything** a block exposes.

```ts
interface PluginDef<TValeur = unknown> {
  id: string;                 // stable identifier, kebab-case
  nom: string; nomEn?: string;
  univers: string; famille: string;   // catalog taxonomy (2 levels)
  resume: string; resumeEn?: string;  // sentence always visible
  notice?: string; noticeEn?: string; // "learn more"
  entrees: PortDef[]; sorties: PortDef[];
  parametres: ParametreDef[];
  executer: (ctx: ContexteExecution<TValeur>) => Promise<ResultatExec<TValeur>>;
  vue?: string;               // [Target] custom view id (view registry)
  alias?: string[];           // [Target] old ids (migration) — currently central map
  etiquettes?: string[];
}

interface PortDef {
  nom: string; nomEn?: string;
  type: string;               // flow type id (see §4)
  sousType?: string;          // e.g. "stereo" | "mono"
  dynamique?: boolean;        // variadic input ("+" button)
}

interface ParametreDef {
  nom: string; nomEn?: string;
  type?: "choix" | "curseur" | "texte" | "dossier";
  options?: string[]; plage?: [number, number]; pas?: number;
  defaut: string | number; unite?: string;
  doc?: string; docEn?: string;   // tooltip (mandatory in the end, see §7)
}
```

The contract is **domain-neutral**: only the port content (`type`), the nature of
the `parametres` and the body of `executer` are specific.

---

## 4. Flow types & value types

### 4.1 Flow types (port colors) — ✅ registry
[Done] **Flow type registry** (`core/typesFlux.ts`), populated by the adapter
(`plugins/typesFlux.ts` for audio):
```ts
interface TypeFlux {
  id: string; couleur: string; libelle?: string;
  compatible?: (cibleId: string) => boolean; // default: id equality
}
```
`PortDef.type` is an **opaque id**. Port color (`couleurFlux(id)`) and connection
validation (`fluxCompatibles(source, cible)`) query the registry — no more fixed
union in the core or UI. The audio domain declares
`audio / midi / controle / texte / fichier`; an "image" domain would declare
e.g. `image / masque / nombre / courbe`.

### 4.2 Value types (what flows) — ✅ parameterized
[Done] The core is **generic over `TValeur`**: `ContexteExecution<TValeur, TRuntime>`,
`FonctionPlugin<…>`, `PluginDef<…>`. The core only manipulates values opaquely
(output → input); only plugins interpret them. The parameters have a **default
value** (audio `TypeValeur` / `AudioContext`) so existing plugins remain unchanged;
an adapter provides its own `TValeur`.
Remaining (polish): move the `TypeValeur` union out of `core` into the audio domain.

---

## 5. Execution context (`ctx`) — ✅ agnostic

Passed to each `executer`. Interface now **domain-neutral**:

```ts
interface ContexteExecution<TValeur = TypeValeur, TRuntime = AudioContext> {
  noeud: { id: string; data: Record<string, unknown> };
  aretes: Arete[];
  resultats: Map<string, TValeur[]>;
  entree: (index: number) => TValeur;      // value connected to input i
  entrees: () => TValeur[];                 // all inputs (filtering = domain's responsibility)
  paramNombre: (nom: string, defaut: number) => number;
  paramTexte:  (nom: string, defaut: string) => string;
  onProgress: (msg: string) => void;
  runtime: TRuntime;         // domain context (audio: AudioContext)
  repertoireTravail: string; // optional I/O
}
```
[Done] `ctxAudio` → `runtime` (opaque, provided by the host); `toutesEntreesAudio(): AudioBuffer[]`
→ generic `entrees(): TValeur[]` — audio plugins filter themselves
(`ctx.entrees().filter(v => v instanceof AudioBuffer)`).

`executer` returns `{ valeurs: TValeur[]; message?: string }` — a parallel array
to the sheet's `sorties`.

---

## 6. Execution engine (`core/engine` + `lancer` loop)

1. **Topological sort** of the DAG (Kahn); "priority" option = only run ancestors of a target node.
2. **Level-by-level execution** (parallelism: independent nodes of the same level in `Promise.all`).
3. **Per-node cache**, invalidated by a **fingerprint** `hash(parametres) + hash(incoming sources)`; reused if unchanged and upstream not reprocessed.
4. **Input resolution**: `entree(i)` reads `resultats[source][indexSortie]` via edge handles (`in:i` / `out:j`).
5. **Verbose errors**: any exception from an `executer` is caught, logged (`console.error`) and surfaced as a message on the node (`erreur` status).

Per-node statuses: `attente | en_cours | termine | erreur` (spec §3.6).

---

## 7. Documentation & i18n (overlay)

- **Content separated from code**: `plugins/notices.ts` maps `id → notice` and `nomParam → doc`, applied at registration (`avecDoc`). Same for EN names/labels. → docs are reviewed/translated in one place, without touching the sheets.
- **Two levels** (§3.9): always-visible summary + collapsible "learn more" notice; "?" tooltip per parameter. Bilingual everywhere (canvas node **and** inspector).
- **i18n**: key→{fr,en} dictionary + global toggle.

---

## 8. Meta-components (sub-graphs, §3.8)

- **Encapsulate** a selection into a meta-node; **exposed ports = boundary edges** (type inherited from the internal port); internal output with shared fan-out.
- **Catalog**: the meta is registered as a plugin (reusable, wired like any node).
- **Flattening execution**: `aplatirGraphe` recursively replaces meta-nodes with their interior (prefixed ids) before the engine → engine unchanged, nesting handled.
- **Editing**: double-click → opens the interior (breadcrumb); **boundary nodes** materialize the exposed ports; on save, `redériverMeta` rebuilds the ports from the boundaries (inherited types, stable indexes).
- **Persistence**: meta definitions are serialized with the graph.

**Pure and tested** logic in `core/meta.ts` (create / flatten / re-derive).

---

## 9. Persistence

`{ nodes, edges, metas, viewport }` in JSON. Serialization that **strips non-JSON objects** (files, blobs) — only metadata/parameters are kept; files must be reloaded. On import: re-register the `metas` **before** rebuilding the nodes (meta-node resolution).

---

## 10. Quality — registry guard

`enregistrer(def)` applies `valider(def)`:
- **Blocking errors** (not registered): missing `id`/`nom`/`resume`/`executer`.
- **Warnings** (dev): missing notice, parameter without doc.
- **Dedup**: same `id` → in-place replacement (compatible with hot reload, no palette duplicate).
- **Alias**: central table of old id → current id (migration of saved graphs).

---

## 11. View registry (UI extension) — ✅ done

[Done] The ~18 `if (ficheId === …)` branches were extracted from `ui/AtelierNode.tsx`
(520 → 163 lines) into a **registry** `ui/vues.tsx`: `{ id/predicate → component, position
before|after }`. `AtelierNode` is a generic shell that resolves a node's views
(`vuesPourNoeud(ficheId, position)`) and passes them `{ data, onChanger… }`. Uploader,
recorder, SoundFont selector, keyboard, export, waveform are **views registered by the
domain**. → Decouples the UI from the domain **and** provides the extension point for
other domains (image→canvas, data→grid, etc.).

---

## 12. Recipe: instantiating a new domain

1. Define the **flow types** (`TypeFlux[]`) + colors.
2. Define the domain's **`TValeur`** type and the context's **`runtime`**.
3. Write the **plugins** (`PluginDef<TValeur>` + `executer`), organized by universe/family.
4. Provide the **notices/labels** (overlay) — the guard mandates docs.
5. Register custom **views** (previews, inline editors) in the view registry.
6. Choose the **preview convention** (audio player / image canvas / data grid…).

**Example (image processing)**: flows `image | masque | nombre`; `TValeur = ImageBitmap | Float32Array | number`; plugins `Flou`, `Seuil`, `Composer`, `Convolution`; "preview" view = `<canvas>`; final preview = downloadable image. The core, palette, inspector, meta-components, docs and persistence **remain identical**.

---

## 13. Maintainability — debt absorbed

The four large files were split up (see `ROADMAP.md` / `DECOUPAGE-APP.md`):

| Original file | Before | After |
|---|---|---|
| `audio/_audio_backup.ts` | 3474 lines | → 7 modules `audio/*` (io, effets-*, generation, midi, analyse) |
| `ui/App.tsx` | 839 lines | **437 lines** + 3 hooks `ui/hooks/*` (persistence, meta, execution) |
| `plugins/complements.ts` | 664 lines | → 6 files per family (`generateurs`, `montage`, `collections`…) |
| `ui/AtelierNode.tsx` | 520 lines | **163 lines** (shell) + registry `ui/vues.tsx` (§11) |

---

## 14. Current state vs target (honest summary)

### What has been done

The core has been **rewritten** to uphold the §12 promise ("without modifying core").
The promise was not upheld before: the `TValeur` generic was decorative
(`enregistrer` fixed it to `TypeValeur`), flow types lived in a global `Map`,
and a boundary cast `as unknown as PluginDef` hid the lie in 5 UI files. The
work dismantled all three.

**Instantiated registry** (`creerRegistre<TV, TR>()`): each domain creates its
own typed registry. `trouverDef` returns `PluginDef<TV, TR>` directly —
0 boundary casts. Sheets are stored with their type preserved, not erased to
`unknown`. Flow types (`Map<string, TypeFlux>`) live in the same closure as
the sheets — two domains can declare a homonymous type without clobbering
each other.

**DI**: `metastore` and `nodes-installes` receive the registry via
`configurerRegistre(r)` at adapter startup. `gestion-nodes` (administration
tool, not a processing plugin) receives the registry via
`configurerRegistreGestion(r)`. No core module imports a singleton.

**Phantom domain** (`core/domaine-nombre.test.ts`): 4 micro-plugins
(`Generer`, `Multiplier`, `Additionner`, `Formater`), `TValeur = number | string`,
`TRuntime = null`. Computes `(4×2)+3 = 11` via `ordreTopologique` + `resoudreEntree`
+ `trouverPlugin`. Tests `validerGraphe` (incompatible types, required ports).

**No default generic** (`core/types.ts`): `PluginDef`, `ContexteExecution` and
`FonctionPlugin` take `<TValeur, TRuntime>` with **no default**. A new domain
therefore *cannot* silently bind to the audio union — the compiler forces it to
name its own value and runtime types, exactly as `domaine-nombre.test.ts` does.
The audio domain declares its aliases once in `audio/types-domaine.ts`
(`FicheAudio`, `ContexteAudio`, `FonctionAudio`, `ValeurAudio`, `RuntimeAudio`);
plugins and UI use those, never `PluginDef` bare.

**Accepted debt — one domain per process.** `TypeValeur` still lives in
`core/types.ts`, and `core/metastore.ts` / `core/nodes-installes.ts` pin
`PluginDef<TypeValeur, AudioContext>`. Likewise `AtelierNode`'s `DEFS_CACHE`
and the non-namespaced `attic-metas` / `attic-nodes-installes` localStorage
keys are process-global. Running two *different* domains inside one process
would require namespacing all four; running one domain per process (the actual
use case) is unaffected.

**Compartmentalization** (`core/cloisonnement.test.ts`): two independent
registries (audio + number). `audio.trouverDef("reverb")` defined, `nombre.trouverDef("reverb")`
undefined. Independent catalogs. Homonymous flow types ("nombre" in both
domains) do not clobber each other.

### The 5 rules protected by mutation

Each core rule has a test that protects it. The proof: breaking the rule
makes the tests fail. The figures are measured after the full migration.

| Rule | Mutation | Tests that fail |
|---|---|---|
| Type compatibility | `fluxCompatibles → true` | 9 |
| Cache hash | `empreinteParametres` ignores `parametres` | 16 |
| Port indexes | `resoudreEntree`: source index +1 | 5 |
| Required ports | `validerGraphe`: check disabled | 3 |
| Type compartmentalization | `enregistrerTypeFlux`: Map shared between registries | 1 |

If a figure drops at the next refactor, a tooth has been blunted.

### What had to change in core

§12 says "without modifying core". That was the target contract, not the
starting state. To uphold it, `core/` was modified:

- `registre.ts`: global registry → `creerRegistre<TV, TR>()` factory + closure
- `types.ts`: `ContexteExecution` cleaned up (`aretes`/`resultats` removed,
  `entree` guaranteed non-null for required ports, `PortDef.requis` added)
- `typesFlux.ts`: global `Map` removed, only contains the interface
- `validation.ts`: `valider` and `validerGraphe` receive flow types as a
  parameter (DepsTypesFlux / 4th argument) instead of importing the global
- `graphe.ts`: `resoudreEntree<T = unknown>` / `valeursEntrantes<T = unknown>`
  (`unknown` by default, the domain narrows at the boundary)

**The §12 promise will be verified the day a third domain is written
without touching a line of `core/`.** The phantom domain proves it for an
isolated domain. Two simultaneous domains are proven by the
compartmentalization test. Three domains in the same app is not a current use
case — it's the next test, not urgent.

### What remains

- `TypeValeur` (the audio union) still lives in `core/types.ts`. It's the
  default of the generic parameter — a domain that doesn't specify `TValeur`
  inherits it. Relocating this union out of the core is cosmetic: the type
  parameter already lets you ignore it.
- `soundfontGlobal.ts` imports audio modules at the module level (SF2). Not
  related to the registry, but it's the last import side-effect in `plugins/`.
- The UI (`App.tsx`, `AtelierNode.tsx`, hooks) imports `registre` from
  `audio/adaptateur` — that's the domain singleton, not the core's. Acceptable
  as long as a single domain is loaded per app. For co-existence, the UI should
  receive the registry as a prop.

**64 tests · tsc 0 errors · 0 global singleton · 0 boundary casts.**
