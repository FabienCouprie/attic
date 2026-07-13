# Adding a node (block) to Attic

Step-by-step guide to creating a new node, illustrated with a **neutral** node: the
**Listening Point** (`point-ecoute`) — a pass-through that auditions the signal without
interrupting the chain. This is the simplest case: **a sheet + a registration
+ a notice**, nothing else. Advanced features (custom view, size,
new flow type…) are at the end of the guide, each optional.

> Architecture reminders: a node = a **plugin** described by a `PluginDef`
> sheet and an `executer(ctx)` function. The core, the palette, the inspector, the docs, the
> meta-components and persistence are **generic** — you only touch your
> domain files. See `ARCHITECTURE.md`.

---

## Anatomy of the "Listening Point" node

File: [`src/plugins/sortie-conversion.ts`](src/plugins/sortie-conversion.ts)

```ts
{
  id: "point-ecoute", nom: "Point d'écoute", nomEn: "Listening Point",
  univers: "Sorties", famille: "Écoute",
  resume: "Auditionne le signal sans interrompre la chaîne.",
  resumeEn: "Auditions the signal at a point in the chain without interrupting it.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [],
  async executer(ctx: any) {
    const a = ctx.entree(0);
    if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée connectée." };
    return { valeurs: [a] };            // passe l'entrée telle quelle sur la sortie
  },
}
```

Then at the bottom of the file, **a single line** registers all the sheets in the file:

```ts
] as PluginDef[]) enregistrer(avecDoc(def));
```

And its notice (educational documentation) in
[`src/plugins/notices.ts`](src/plugins/notices.ts):

```ts
"point-ecoute": {
  fr: "Point d'écoute intermédiaire : permet d'auditionner le signal à un endroit de la chaîne sans l'interrompre.",
  en: "Intermediate listening point: lets you audition the signal at a spot in the chain without interrupting it.",
},
```

That's it. The node appears in the palette (universe *Sorties* / family *Écoute*),
with its colored ports, its summary, its bilingual "learn more" notice, and it
executes in the graph.

---

## The fields of the sheet (`PluginDef`)

Defined in [`src/core/types.ts`](src/core/types.ts).

| Field | Required | Role |
|---|---|---|
| `id` | ✅ | Unique identifier, stable kebab-case (used for the catalog, edges, persistence). **Do not change it** after publication (otherwise breaks saved graphs → see *Alias*). |
| `nom` | ✅ | Displayed FR name. |
| `nomEn` | recommended | EN name (otherwise falls back to `nom`, or to the `NOMS_EN` table). |
| `univers` / `famille` | ✅ | Arrangement in the palette (universe = column/color, family = sub-group). Reuse existing ones (`Entrées`, `Traitement`, `Sorties`…) or create new ones. |
| `resume` / `resumeEn` | `resume` ✅ | Short sentence always visible (on the node and the inspector). |
| `notice` / `noticeEn` | recommended | "Learn more" explanation (§3.9). Provided here **or** via `notices.ts` (see below). Its absence triggers a console *warning* in dev. |
| `entrees` / `sorties` | ✅ (arrays, possibly empty) | Ports. See below. |
| `parametres` | ✅ (array, possibly empty) | Settings exposed in the inspector. See below. |
| `executer` | ✅ | The computation function. See the contract below. |
| `etiquettes` | optional | Search keywords. |

### Ports (`PortDef`)

```ts
{ nom: "Audio", type: "audio", sousType?: "stereo"|"mono", dynamique?: true }
```

- `type` = **id of a flow type** (registry `core/typesFlux`). The audio domain
  provides: `audio`, `midi`, `controle`, `texte`, `fichier`. The port **color**
  and **connection compatibility** follow automatically — you don't write
  any color. (For a new type → *Create a flow type*, below.)
- `dynamique: true` on an input = **variadic fan-in** (multiple edges on the
  same port; e.g. the `fusionneur`). Then retrieve the values with `ctx.entrees()`.

### Parameters (`ParametreDef`)

```ts
{ nom: "Volume", nomEn: "Volume", plage: [0,100], pas: 1, defaut: 100, unite: "%",
  doc: "…", docEn: "…" }
```

| `type` | Inspector rendering | Useful fields |
|---|---|---|
| *(omitted)* + `plage` | slider | `plage: [min,max]`, `pas`, `unite` |
| `"choix"` | dropdown menu | `options: string[]` |
| `"texte"` | text field | — |
| `"dossier"` | folder selector (Electron) | — |

The `defaut` (number or string) is applied at node creation. `doc`/`docEn`
feed the parameter's "?" tooltip (otherwise falls back to `DOCS_PARAM`).

---

## The `executer(ctx)` contract

`ctx` is the **execution context** ([`core/types.ts`](src/core/types.ts),
`ContexteExecution<TValeur, TRuntime>`). Most plugins type it `any` for
brevity; you can also annotate it `ContexteExecution` for autocompletion.

**Read inputs / parameters:**
| Call | Returns |
|---|---|
| `ctx.entree(i)` | the value plugged into input `i` (or `null` if not connected) |
| `ctx.entrees()` | **all** input values (array, `null` included) — for `dynamique` ports. Filter by type yourself: `ctx.entrees().filter(v => v instanceof AudioBuffer)` |
| `ctx.paramNombre(nom, defaut)` | numeric value of a parameter |
| `ctx.paramTexte(nom, defaut)` | text value of a parameter |
| `ctx.noeud.data` | node data (raw params **and** loaded files: `audioFichier`, `midiFichier`, `enregistrementBlob`…) |
| `ctx.runtime` | the domain environment — here the `AudioContext` (e.g. `decoderFichier(f, ctx.runtime)`) |
| `ctx.repertoireTravail` | working folder (Electron I/O) |
| `ctx.onProgress(msg)` | updates the node's status message during a long computation |

**Manipulated values** (audio domain, type `TypeValeur`):
`AudioBuffer | Float32Array | File | string | { debut; duree } | null`.

**Return**: `{ valeurs: TValeur[]; message?: string; mp3Url?: string }`
- `valeurs` is a **parallel array to `sorties`**: `valeurs[j]` = what comes out of
  output port `j`. (Listening Point: 1 output → `valeurs: [a]`.)
- `message` is displayed on the node (useful to signal "no input", a summary…).
- In case of missing/invalid input, return `{ valeurs: [null, …], message: "…" }`
  (as many `null`s as outputs) rather than throwing an exception.

Any exception is anyway **caught** by the engine, logged and surfaced as an
`erreur` status on the node.

---

## The 3 steps (neutral node)

### 1. Write the sheet
Add the `PluginDef` object in the appropriate **family** file of `src/plugins/`
(by domain/theme): `entrees.ts`, `effets.ts`, `generateurs.ts`, `montage.ts`,
`analyse.ts`, `sorties.ts`, `sortie-conversion.ts`… Each file ends with
`… as PluginDef[]) enregistrer(avecDoc(def));` → your sheet is registered
automatically. (New file? import it in
[`src/plugins/index.ts`](src/plugins/index.ts).)

### 2. Register
Nothing more if you add to an existing file: the `enregistrer(avecDoc(def))`
loop handles it. `avecDoc` fills in the notice, the EN name and the parameter docs from
the tables in `notices.ts`.

### 3. Document (notice)
Add the entry in `NOTICES` of [`src/plugins/notices.ts`](src/plugins/notices.ts)
(`"mon-id": { fr, en }`). The registry **guardrail** requires `id`/`nom`/`resume`/
`executer` (otherwise the sheet is **rejected**) and *warns* if the notice or a parameter
doc is missing. Documentation is first-class in this project (educational purpose).

---

## Optional steps (beyond neutral)

The Listening Point needs none of them. Add them only if relevant:

- **Shared EN name / parameter doc** — rather than `nomEn`/`doc` on the sheet,
  fill in the central tables `NOMS_EN`, `PARAMS_EN`, `DOCS_PARAM` of
  `notices.ts` (shared between nodes).

- **Default node size** — a neutral node takes the standard size. For a
  larger node (custom view), add a case in `tailleDefaut()` of
  [`src/ui/App.tsx`](src/ui/App.tsx).

- **Custom view** (uploader, waveform, keyboard, preview…) — register a
  component in the `REGISTRE` registry of [`src/ui/vues.tsx`](src/ui/vues.tsx):
  `{ correspond: parId("mon-id"), vue: MaVue, position: "avant"|"apres" }`. The view
  receives `{ id, data, def }` and renders above/below the generic player.
  (This is the UI extension point — cf. ARCHITECTURE.md §11.)

- **New flow type** (port of a new type) — register it in
  [`src/plugins/typesFlux.ts`](src/plugins/typesFlux.ts):
  `enregistrerTypeFlux({ id: "mon-flux", couleur: "#…", libelle: "…" })`. Color and
  connection compatibility follow automatically.

- **Rename an existing node** — never change a published `id` outright. Add
  `ancien-id → nouvel-id` in the `ALIAS` table of
  [`src/core/registre.ts`](src/core/registre.ts): saved graphs always reload.

---

## Verify

```sh
# from G:\attic (portable Node in the PATH)
npx tsc -b --noEmit      # 0 errors
npx vitest run           # all tests pass
npm run build            # build OK
```

Then in the app (dev): drag the node from the palette → it displays with its
colored ports; connect it; **Run** (Run button or spacebar) → it produces a
result; hover "?" → the notice and parameter docs appear (FR/EN).

---

## Template to copy

A neutral "Marker" node: passes audio as-is + a label parameter
(illustrates a text parameter). To paste into a file in `src/plugins/`:

```ts
{
  id: "marqueur", nom: "Marqueur", nomEn: "Marker",
  univers: "Sorties", famille: "Écoute",
  resume: "Repère un point de la chaîne ; laisse passer le signal inchangé.",
  resumeEn: "Marks a spot in the chain; passes the signal through unchanged.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [
    { nom: "Étiquette", nomEn: "Label", type: "texte", defaut: "repère",
      doc: "Texte libre affiché comme repère.", docEn: "Free label shown as a marker." },
  ],
  async executer(ctx: any) {
    const a = ctx.entree(0);
    if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée connectée." };
    const etiquette = ctx.paramTexte("Étiquette", "repère");
    return { valeurs: [a], message: `Marqueur : ${etiquette}` };
  },
}
```

And its notice in `notices.ts`:

```ts
"marqueur": {
  fr: "Repère visuel/nominatif à un endroit de la chaîne, sans effet sur le signal (passe-plat).",
  en: "A named/visual marker at a spot in the chain, with no effect on the signal (pass-through).",
},
```
