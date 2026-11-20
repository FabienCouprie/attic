# Adding a node (block) to Attic

Step-by-step guide to creating a new node, illustrated with a **neutral** node: the
**Listening Point** (`point-ecoute`) — a pass-through that auditions the signal without
interrupting the chain. This is the simplest case. In the code it is **a sheet and a
notice**, nothing else; the repository then asks for its generated tables and its
announced counts to be brought up to date (see *Before you commit*). Advanced features
(custom view, size, new flow type…) are at the end of the guide, each optional.

> Architecture reminders: a node = a **plugin** described by a `FicheAudio` (a `PluginDef` specialised for the audio domain — see `PORTING-A-DOMAIN.md`)
> sheet and an `executer(ctx)` function. The core, the palette, the inspector, the docs, the
> meta-components and persistence are **generic** — you only touch your
> domain files. See `ARCHITECTURE.md`, and `IMPACT.md` for what a change in a shared file touches.

---

## Anatomy of the "Listening Point" node

File: [`src/plugins/sortie-conversion.ts`](src/plugins/sortie-conversion.ts)

```ts
fiche({
  id: "point-ecoute", nom: "Point d'écoute", nomEn: "Listening Point",
  univers: "Sorties", famille: "Écoute",
  resume: "Auditionne le signal sans interrompre la chaîne.",
  resumeEn: "Auditions the signal at a point in the chain without interrupting it.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [],
  async executer(ctx) {
    const a = entreeAudio(ctx, 0);      // le son de l'entrée 0, ou l'échec à rendre tel quel
    if (sansEntree(a)) return a;        // `plugins/lire-entree.ts` : un seul message, `erreur: true`
    return { valeurs: [a] };            // passe l'entrée telle quelle sur la sortie
  },
})
```

`fiche` comes from [`src/plugins/fiche.ts`](src/plugins/fiche.ts) and returns the sheet unchanged:
it exists so that the compiler knows the names of the sheet's parameters (see *The `executer(ctx)`
contract*). The file exports its sheets as `fiches`, and almost every file ends with **a single
line** that fills in their documentation:

```ts
] as FicheAudio[]).map(avecDoc);
```

And its notice (educational documentation) in
[`src/plugins/notices.ts`](src/plugins/notices.ts):

```ts
"point-ecoute": {
  fr: "Point d'écoute intermédiaire : permet d'auditionner le signal à un endroit de la chaîne sans l'interrompre.",
  en: "Intermediate listening point: lets you audition the signal at a spot in the chain without interrupting it.",
},
```

A new notice follows the notice contract of `AGENTS.md` §3: the first sentence says what the
component **does**, in the present tense, with the component as subject; then how each setting
acts; then what each output returns. Every term must be found on screen, and the two languages
say the same thing.

The node appears in the palette (universe *Sorties* / family *Écoute*),
with its colored ports, its summary, its bilingual "learn more" notice, and it
executes in the graph.

---

## The fields of the sheet (`FicheAudio`)

`FicheAudio` is `PluginDef<ValeurAudio, RuntimeAudio>`
([`src/audio/types-domaine.ts`](src/audio/types-domaine.ts)); the fields are those of `PluginDef`, in
[`src/core/types.ts`](src/core/types.ts).

| Field | Required | Role |
|---|---|---|
| `id` | ✅ | Unique identifier, stable kebab-case (used for the catalog, edges, persistence). **Do not change it** after publication (otherwise breaks saved graphs → see *Alias*). |
| `nom` | ✅ | Displayed FR name. Unique in the catalogue, like `nomEn` (`plugins/identifiants-uniques.test.ts`). |
| `nomEn` | ✅ in practice | EN name. Without it the English interface shows the French name, and `src/docs/anglais-registre.test.ts` fails on any French it finds in the English projection. The fallback to the `NOMS_EN` table of `notices.ts` only covers a few old ids. |
| `univers` / `famille` | ✅ | Arrangement in the palette (universe = column/color, family = sub-group). Reuse existing ones (`Entrées`, `Traitement`, `Sorties`…). In *Traitement*, *Entrées* and *Visualisation*, the family shown comes from the tables of `src/plugins/familles-palette.ts`, which override the sheet's. A new family needs its `famille.<name>` key in `src/i18n.tsx`, and a family of those tables needs at least two nodes (`src/docs/anglais-registre.test.ts`). |
| `resume` / `resumeEn` | ✅ both | Short sentence always visible (on the node and the inspector). |
| `notice` / `noticeEn` | recommended | "Learn more" explanation. Provided here **or** via `notices.ts` (see below). Its absence triggers a console *warning* in dev. |
| `nomDicte` / `nomDicteEn` | when needed | The spoken name, for a node whose name holds a word the dictation lexicon lacks; `src/plugins/noms-parles.test.ts` refuses a name that cannot be spoken. |
| `entrees` / `sorties` | ✅ (arrays, possibly empty) | Ports. See below. |
| `parametres` | ✅ (array, possibly empty) | Settings exposed in the inspector. See below. |
| `anciensReglages` | optional | Parameters the sheet no longer declares and that `executer` still reads, for projects saved before they were replaced. They are never shown. |
| `executer` | ✅ | The computation function. See the contract below. |
| `etiquettes` | optional | Search keywords, read by the palette search (`src/ui/recherche-palette.ts`) besides the names, summaries, family and notice: the name of a device or a use that the notice does not need to say (`"leslie"`, `"dx7"`). `src/ui/recherche-palette.test.ts` checks that every declared keyword finds its node. |
| engine hints | optional | `jamaisCache`, `sortieNullePermise`, `entreesExtensibles`, `sortiesExtensibles` and the others of the "Indices pour le moteur" block of `PluginDef`, each documented there. |

### Ports (`PortDef`)

```ts
{ nom: "Audio", nomEn?: "Audio", type: "audio", sousType?: "stereo", requis?: false, dynamique?: true, module?: "Volume" }
```

- `type` = **id of a flow type**. The audio domain registers its flow types in
  [`src/audio/adaptateur.ts`](src/audio/adaptateur.ts): `audio`, `midi`, `controle`, `texte`,
  `fichier`, `image`, `courbe`, `banque`, `objet`, `video`, `sequence`, `cercle`, `spectrogramme`,
  `accordage`, and the internal `frontiere`. The port **color** and **connection compatibility**
  follow automatically — you don't write any color. (For a new type → *Create a flow type*, below.)
- `sousType` refines the content: `stereo` or `mono` on an audio port; on a `texte` port, the content
  of `src/audio/sous-types-texte.ts` (a plan, a notation, an ABC score, lyrics, a prompt); on a
  `controle` port, one of `src/audio/sous-types-controle.ts`, and every `controle` port declares one
  (`src/plugins/sous-types-controle.test.ts`). Two declared and different contents refuse each other
  when an edge is drawn.
- `requis` is true by default: the graph does not run while a required input is unplugged. An
  optional input says `requis: false`, and `ctx.entree(i)` then returns `null` when it is unplugged.
- `dynamique: true` on an input lets it take **several edges**, where a new edge otherwise
  replaces the old one; e.g. the Mixer (`melangeur`). Then retrieve the values with `ctx.entrees()`.
- `module` names the parameter that a curve plugged into this input modulates.

### Parameters (`ParametreDef`)

```ts
{ nom: "Volume", nomEn: "Volume", plage: [0,100], pas: 1, defaut: 100, unite: "%",
  doc: "…", docEn: "…" }
```

| `type` | Inspector rendering | Useful fields |
|---|---|---|
| *(omitted)*, `"curseur"` or `"nombre"`, with `plage` | slider and numeric field | `plage: [min,max]`, `pas`, `unite` |
| `"choix"` | dropdown menu | `options`, `optionsEn` (same length), `optionIds` (the canonical values stored), `optionsHeritees` (old labels → id) |
| `"case"` | checkbox, value 0 or 1 | — |
| `"couleurs"` | list of colours | — |
| `"texte"` | text field | `defautEn` when the default is a word |
| `"fichier"` | text field **+ system file selector** | `extensions: string[]` (no leading dot) |
| `"dossier"` | text field **+ system folder selector** | — |

A domain can add its own genres (the audio domain declares `"sf2instrument"` in
`src/composition.ts`). `hidden: true` hides a parameter the program writes itself. A parameter
renamed keeps its old name in `nomsHerites`, and a seed declares `graine: true`
(`src/docs/contrat-graines.test.ts`).

The `defaut` (number or string) is applied at node creation. `doc`/`docEn`
feed the parameter's "?" tooltip (otherwise falls back to `DOCS_PARAM`).

**A path is never typed by hand.** A parameter that designates an existing file
takes `type: "fichier"`, one that designates a folder takes `type: "dossier"`;
`"texte"` is for neither. Both keep the field editable — a relative path, or one
pasted from elsewhere — and add a `…` button that opens the system dialog, which
is the only source of an exact path. A hand-typed path is wrong for one capital,
one accent, one reversed separator or one extra space, and the node then fails on
a file that exists. `extensions` feeds the dialog's filter, without the dot
(`["mp4", "mov"]`). Two exceptions: a **hidden** parameter written by the program
to remember a loaded file, and the **name of a file the node will create**, which
no open dialog can designate. The rule is enforced by
[`plugins/coherence-chemins.test.ts`](src/plugins/coherence-chemins.test.ts).

---

## The `executer(ctx)` contract

`ctx` is the **execution context** ([`core/types.ts`](src/core/types.ts),
`ContexteExecution<TValeur, TRuntime, TNom>`). Write `async executer(ctx)` with no annotation:
`fiche({...})` infers the audio context, and `TNom`, the names of the sheet's parameters. A helper
function that takes the context names it `ContexteAudio` (from `audio/types-domaine.ts`). Never
`ctx: any`, and never `as unknown as FicheAudio[]`: both silence the compiler about what a sheet
really returns, and `ValeurAudio` already lists everything that travels on an edge.

**A parameter is read by a name the sheet declares.** `ctx.paramNombre("Volme", 100)` does not
compile when the sheet declares `Volume`: without this check, a misspelt name, or a parameter
renamed in its sheet, silently fell back on the call's default. A closure that reads a parameter
through a variable types it `(nom: NomDeReglage<typeof ctx>) => ctx.paramTexte(nom, "")`, and a
fixed list of names is written `as const`. A parameter the sheet replaced, and still reads for old
projects, is named in `anciensReglages`. A sheet whose names cannot be inferred, because a function
builds its list or it takes a shared parameter annotated `ParametreDef`, is refused by `fiche`, and
there is no way around it. Declare the shared parameter with `reglagePartage`, give a factory its
name as a generic parameter (`<N extends string>(nom: N)`), and take numbered names from a literal
tuple (`[1, 2, 3] as const`).

**Every declared parameter acts at run time** (`AGENTS.md` §3): changing its value must change the
result, and a parameter that is legitimately inert says why, next to it.

**Read inputs / parameters:**
| Call | Returns |
|---|---|
| `ctx.entree(i)` | the value plugged into input `i` (or `null` if not connected) |
| `entreeAudio(ctx, i)` | from `plugins/lire-entree.ts`: the `AudioBuffer` on input `i`, or a ready-to-return failure (`erreur: true`, one translated message). Test it with `sansEntree(a)` and `return a` — this replaces the hand-written `instanceof AudioBuffer` preamble. A sheet with N outputs passes `{ sorties: N }`, so that the failure carries as many values as outputs |
| `ctx.entrees()` | one value per incoming edge, in edge order (`null` for a source that has not produced anything) — for `dynamique` ports. Filter by type yourself: `ctx.entrees().filter(v => v instanceof AudioBuffer)` |
| `ctx.paramNombre(nom, defaut)` | numeric value of a parameter the sheet declares |
| `ctx.paramTexte(nom, defaut)` | text value of a parameter the sheet declares |
| `ctx.noeud.data` | node data, **read only** (raw params **and** loaded files: `audioFichier`, `midiFichier`, `enregistrementBlob`…) |
| `ctx.runtime` | the domain environment — here the `AudioContext` (e.g. `decoderFichier(f, ctx.runtime)`) |
| `ctx.repertoireTravail` | working folder (Electron I/O) |
| `ctx.onProgress(msg)` | updates the node's status message during a long computation |
| `ctx.sortieBranchee?.(j)` | whether output `j` is wired: an expensive output that nobody reads can be skipped |
| `ctx.signal` | the run's `AbortSignal`, to check in a long loop |

**Manipulated values**: `ValeurAudio`
([`src/audio/types-domaine.ts`](src/audio/types-domaine.ts)) lists everything that travels on an
edge: `AudioBuffer`, `Float32Array`, `File`, `string`, zones, numbers, curves, sequences, circles,
banks, tunings and the other types declared there, or `null`.

**Return**: `{ valeurs; message?; erreur?; affichage?; designe?; moteur? }`
- `valeurs` is a **parallel array to `sorties`**: `valeurs[j]` = what comes out of
  output port `j`. (Listening Point: 1 output → `valeurs: [a]`.)
- `message` is displayed on the node (useful to signal "no input", a summary…).
- In case of missing/invalid input, return `{ valeurs: [null, …], erreur: true, message: "…" }`,
  with as many `null`s as declared outputs, rather than throwing an exception; `entreeAudio` builds
  exactly this. An all-`null` result is also taken as a failure, but it carries no message and does
  not cover a node without outputs: `erreur: true` is what does.
- **The executor writes nothing on the node.** What it has to say goes through three declared
  channels: `affichage`, what this run produced and the view shows, cleared by a reset and by a
  setting change; `designe`, what it designated among its inputs, kept by a setting change;
  `moteur`, what it asks the engine for. The shapes of the first two are declared in
  `src/plugins/formes-des-canaux.ts` and written with `satisfies` (e.g. the MP3 link of the
  converter, `affichage: { mp3Url } satisfies AffichageMp3`). A field written into `ctx.noeud.data`
  has no class, nothing clears it, and the run reads a copy of the graph anyway, where the write is
  reported (`core/instantane-de-graphe.ts`).

Any exception is anyway **caught** by the engine, logged and surfaced as an
`erreur` status on the node.

**What the repository asks of an executor besides**, each held by a guard of `src/docs/`: chance
comes from the common generator of `src/core/hasard.ts`, never `Math.random()`; a generator does not
generate at the sound card's rate (`contrat-frequence-de-travail.test.ts`); an image the node
renders is shown by a declared view (`contrat-vues-image.test.ts`); an executor reads no value from
`src/ui/` (`frontiere-domaine.test.ts`); a field set on a node is declared in `src/core/saisies.ts`.

---

## The steps (neutral node)

### 1. Write the sheet
Add the `FicheAudio` object, wrapped in `fiche({...})`, in the appropriate **family** file of `src/plugins/`
(by domain/theme): `entrees.ts`, `effets.ts`, `generateurs.ts`, `montage.ts`,
`analyse.ts`, `sorties.ts`, `sortie-conversion.ts`… A new file exports its `fiches`, which are
spread once into the file of [`src/plugins/categories/`](src/plugins/categories/) it belongs with;
[`src/plugins/index.ts`](src/plugins/index.ts) says how the catalogue is cut. A file stays under four
hundred lines of code (`src/docs/generer-compte-lignes.test.ts`).

### 2. Registration: nothing to write
The file's `.map(avecDoc)` fills in the notice, the EN names and the parameter docs from the tables
of `notices.ts`. `plugins/index.ts` then applies the palette families and the automatic audio
output of a sheet that renders a sequence, and [`src/audio/adaptateur.ts`](src/audio/adaptateur.ts)
registers every sheet in one loop before freezing the native set.

The registry **guardrail** (`src/core/validation.ts`, called by `src/core/registre.ts`) **rejects**
a sheet without `id`/`nom`/`resume`/`executer`, a port of an unregistered flow type, or a parameter
that the cache hash would not capture; in dev it *warns* if the notice or a parameter doc is missing.

### 3. Document (notice)
Add the entry in `NOTICES` of [`src/plugins/notices.ts`](src/plugins/notices.ts)
(`"mon-id": { fr, en }`), by the notice contract above. Documentation is first-class in this
project (educational purpose), and `src/docs/style-documentation.test.ts` refuses a word shouted in
capitals.

---

## Optional steps (beyond neutral)

The Listening Point needs none of them. Add them only if relevant:

- **Shared EN name / parameter doc** — rather than `nomEn`/`doc` on the sheet,
  fill in the central tables `NOMS_EN`, `PARAMS_EN`, `DOCS_PARAM` of
  `notices.ts` (shared between nodes).

- **Default node size** — a neutral node takes the standard size. For a
  larger node (custom view), add a case in `tailleDefaut()` of
  [`src/ui/tailles-noeuds.ts`](src/ui/tailles-noeuds.ts), then `npm run docs:interface`.

- **Custom view** (uploader, waveform, keyboard, preview…) — register a
  component in the view declaration of the audio domain,
  [`src/vues-domaine/vues.tsx`](src/vues-domaine/vues.tsx):
  `{ correspond: parId("mon-id"), vue: MaVue, position: "avant"|"apres", porteLecteur?: true }`.
  The view receives `{ id, data, def }` and renders above/below the generic player. It reads what
  the run returned through `affichageDe` and `designeDe` of `src/vues-domaine/lire-canaux.ts`,
  never writes into these channels, and opens any audio at `NIVEAU_ECOUTE` of
  `src/ui/niveau-ecoute.ts`. `porteLecteur` says the view already gives a way to listen, so the
  node does not add a second player. Then `npm run docs:interface`.
  (This is the UI extension point — cf. PORTING-A-DOMAIN.md §6.)

- **New flow type** (port of a new type) — register it in
  [`src/audio/adaptateur.ts`](src/audio/adaptateur.ts):
  `registre.enregistrerTypeFlux({ id: "mon-flux", couleur: "#…", libelle: "…" })`, with a `forme`
  and an `estDuType` if needed. Color and connection compatibility follow automatically. Add the
  type of its values to `ValeurAudio`, keep its colour apart from the others
  (`src/audio/couleurs-flux.test.ts`), and give it its English label in `src/i18n.tsx`.

- **Rename an existing node** — never change a published `id` outright. Add
  `ancien-id → nouvel-id` in the `ALIAS` table of
  [`src/audio/alias.ts`](src/audio/alias.ts): saved graphs always reload. An id in that table can
  no longer be registered: `enregistrer` refuses it, since `trouverDef` would open the alias target.

- **Replace a parameter** — saved projects still carry the old one. If `executer` keeps reading it
  as a fallback, name it in the sheet's `anciensReglages`: the compiler then accepts the read, and
  `plugins/repli-du-defaut.test.ts` knows it is a migration and not a misspelling.

- **Change an existing node's contract** — a saved graph holds ports by rank and settings by name.
  `npm run docs:compatibilite` rewrites `COMPATIBILITE.json` for a compatible change (a setting
  added, an optional input added at the end, a setting renamed with its old name in `nomsHerites`).
  A **break** (a setting or port removed or renamed without migration, a type, default, unit, bound
  or seed role changed, a choice value no longer recognised) fails `src/docs/compatibilite.test.ts`
  until it has its migration or a declaration with its reason in `src/docs/ruptures-declarees.json`.
  A new node only needs the regeneration.

- **A computation moved into a worker** — the worker is claimed by a watched component, which
  means adding that component to the sound fingerprints (`src/docs/couverture-empreintes.test.ts`,
  `tests-e2e/empreintes.json`).

---

## Before you commit

A new node, even in an existing file, makes these guards fail until the repository is brought up
to date:

- **The generated tables.** `npm run docs:components` rewrites `COMPONENTS.md` and the catalogue
  order, `src/plugins/ordre-du-catalogue.txt`; `npm run docs:interface` rewrites `INTERFACE.md`,
  which lists every node with its size; `npm run docs:compatibilite` adds the node to
  `COMPATIBILITE.json`. The whole line, `docs:dependances` and `docs:modulables` included, is in
  `AGENTS.md` §5.
- **The announced counts.** `src/docs/generer-catalogue.test.ts` checks the number of nodes written
  in `README.md`, `package.json` and `AGENTS.md`, and in `AGENTS.md` the number of components that
  render audio, that have a seed, and that are watched by the fingerprints.

## Verify

The verification order of `AGENTS.md`, from the repository root:

```sh
npx tsc -b      # 0 errors
npx oxlint      # 0 errors
npx vitest run  # all tests pass
```

Then in the app (dev): drag the node from the palette → it displays with its
colored ports; connect it; **Run** (Run button or spacebar) → it produces a
result; hover "?" → the notice and parameter docs appear (FR/EN). Measure it rather than trust a
green suite: `COMPOSANT=mon-id npm run mesurer`, and `COMPOSANTS=mon-id npm run messages-anglais`
for a message composed at run time, which no unit test sees. Then write the CHANGELOG entry.

---

## Template to copy

A neutral "Marker" node: passes audio as-is + a label parameter
(illustrates a text parameter). To paste into a file in `src/plugins/`, which imports `fiche`,
`FicheAudio`, `avecDoc`, `entreeAudio` and `sansEntree` like `sortie-conversion.ts`:

```ts
fiche({
  id: "marqueur", nom: "Marqueur", nomEn: "Marker",
  univers: "Sorties", famille: "Écoute",
  resume: "Repère un point de la chaîne ; laisse passer le signal inchangé.",
  resumeEn: "Marks a spot in the chain; passes the signal through unchanged.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [
    { nom: "Étiquette", nomEn: "Label", type: "texte", defaut: "repère", defautEn: "marker",
      doc: "Texte libre affiché comme repère.", docEn: "Free label shown as a marker." },
  ],
  async executer(ctx) {
    const a = entreeAudio(ctx, 0);
    if (sansEntree(a)) return a;
    const etiquette = ctx.paramTexte("Étiquette", "repère");
    return { valeurs: [a], message: etiquette };
  },
})
```

And its notice in `notices.ts`:

```ts
"marqueur": {
  fr: "Le marqueur repère un point de la chaîne par une étiquette, sans modifier le signal. Le réglage « Étiquette » donne le texte affiché dans le message. La sortie « Audio » rend l'entrée inchangée.",
  en: "The marker marks a point in the chain with a label, without changing the signal. The « Label » setting gives the text shown in the message. The « Audio » output returns the input unchanged.",
},
```
