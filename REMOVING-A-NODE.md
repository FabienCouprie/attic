# Removing a Node (Plugin)

Guide to safely remove a plugin node from Attic.

A removal reaches further than the sheet: saved graphs, shipped examples, generated tables,
announced counts and several guards name the node by its id. The steps below follow what the
guards require; the last real removal, that of the MIDI Transcriber (commit `a1155d3d`, 37 files),
is the reference to compare with: `git show --stat a1155d3d`. `IMPACT.md` says what each shared
zone touches.

## Steps

### 1. Remove the plugin definition

Delete its `fiche({ id: "...", nom: "...", ... })` call from its file in `src/plugins/` (e.g.
`effets.ts`, `generateurs.ts`, `montage.ts`, `sorties.ts`). If the file is left with no sheet,
remove it from the category of [`src/plugins/categories/`](src/plugins/categories/) that spreads its
`fiches` (`src/plugins/categories-du-catalogue.test.ts`).

### 2. Remove the notice

Delete the entry from `src/plugins/notices.ts`:

```ts
"node-id": { fr: "...", en: "..." },
```

### 3. Remove the prompt-graphe entry

Delete the entry from `ALIAS_MANUELS` in `src/plugins/prompt-graphe.ts`, if there is one:

```ts
{ ficheId: "node-id", mots: [...], category: "..." },
```

### 4. Remove the palette family entry

If the node is named in the tables of `src/plugins/familles-palette.ts`, remove it there. A family
of these tables keeps at least two nodes (`src/docs/anglais-registre.test.ts`).

### 5. Remove any custom view

If the node has a registered view in `src/vues-domaine/vues.tsx`, delete the entry:

```ts
{ correspond: parId("node-id"), vue: VueXxx, position: "avant" },
```

Also delete the view component function itself if it's no longer used by any other node, and the
lists that name it: `tests-e2e/vues-non-ecrasees.spec.ts`, `src/ui/urls-medias-naissances.test.ts`.

### 6. Add an alias (for backward compatibility)

If users have saved workflows that reference the old node id, add an alias in `src/core/registre.ts` so the saved graph still loads:

```ts
export const ALIAS: Readonly<Record<string, string>> = {
  ...
  "old-node-id": "replacement-node-id",
};
```

The compatibility guard (`src/docs/compatibilite.test.ts`) holds this step: a node that leaves the
registry without an alias is a **break**, and so is an alias whose replacement does not take back
the old node's ports at the same ranks, or its settings under the same names. Each break needs its
migration or a declaration in `src/docs/ruptures-declarees.json`, with its reason; then
`npm run docs:compatibilite` rewrites `COMPATIBILITE.json`. With no replacement, add no alias and
declare the break. **Never remove an existing alias**: that is a break too.

### 7. Update the shipped examples

A graph of `exemples/` that uses the node no longer loads without an alias. With an alias, its
setting keys must be those of the replacement (`src/docs/contrat-cles-de-reglage.test.ts`); the
MIDI Transcriber's removal had to rewrite `exemples/audio-vers-midi.json`. An example watched by
`tests-e2e/empreintes-exemples.json` then has its sound fingerprint to check again.

### 8. Remove unused imports and modules

Check the plugin file for imports that are no longer used after the deletion (functions from
`../audio`, `midi-file`, etc.). They are errors, not warnings: `noUnusedLocals` fails `npx tsc -b`,
and `no-unused-vars` fails `npx oxlint`. A module of `src/audio/` that only this node used leaves
with it, and `npm run docs:dependances` rewrites `DEPENDANCES-AUDIO.md`. A model that only this node
downloaded leaves `scripts/modeles-manifest.json`, and its notice leaves `THIRD_PARTY.md`.

### 8.5. Check build-time dependencies (Vite plugins / worker fixes)

Build plugins, resolve aliases, and dependency-optimization rules (`optimizeDeps`) are **not** in the runtime plugin registry. They live in the domain adapter, e.g. `src/audio/build-plugins.ts`.

- If the node used a Web Worker (e.g. `src/workers/magenta-worker.ts`), do not delete the worker file unless it is no longer used by any other node. A worker that leaves also leaves the lists of `src/docs/couverture-empreintes.test.ts` and `src/workers/graphe-imports.test.ts`.
- If the node was the last consumer of a domain-specific build fix (worker plugin, resolve alias, optimizeDeps entry, `.onnx` cleanup), remove the corresponding entry from `src/audio/build-plugins.ts`.

### 9. Remove the default size entry (if any)

If the node has a custom size in `tailleDefaut()` of `src/ui/tailles-noeuds.ts`, delete the line,
and its id from the `VUES_IMAGE` and `VUES_IMAGE_AVEC_LECTEUR` sets of the same file:

```ts
if (def.id === "node-id") return { width: ..., height: ... };
```

### 10. Remove inspector entries (if any)

If the node has special handling in `src/ui/Inspector.tsx` (e.g. recorder UI, file loader), delete the conditional block:

```tsx
{def.id === "node-id" ? (
  ...
) : null}
```

### 11. Remove what the tests and lists name

- **Sound fingerprints.** A watched node leaves `SURVEILLES` of `tests-e2e/empreintes.spec.ts` and
  `tests-e2e/empreintes.json`.
- **Translations.** The keys of `src/i18n.tsx` that only this node used become dead, and
  `src/i18n-cles-mortes.test.ts` refuses them.
- **The crossing pass.** Its tables name nodes by id and fail on a node that no longer exists
  (`src/docs/croisement-nomenclatures.test.ts`): `src/audio/croisement-bases.ts`,
  `src/audio/croisement-entrees.ts`, `src/audio/croisement-entrees-choix.ts`,
  `src/audio/croisement-inscriptions.ts`.
- **The modulable list.** A node named in `ECARTES` of `src/docs/modulables.ts` leaves it.
- **Tests and specs** that name the node, found by searching for its id.

### 12. Regenerate the tables and the counts

```sh
npm run docs:components && npm run docs:interface && npm run docs:compatibilite
```

`docs:components` rewrites `COMPONENTS.md` and `src/plugins/ordre-du-catalogue.txt`;
`docs:interface` rewrites `INTERFACE.md` and `tests-e2e/composants-vues.json`; the whole line is in
`AGENTS.md` §5. Then bring the announced counts down: `src/docs/generer-catalogue.test.ts` checks the
number of nodes in `README.md`, `package.json` and `AGENTS.md`, and in `AGENTS.md` the number of
components that render audio, that have a seed, and that are watched.

### 13. Verify

The verification order of `AGENTS.md`:

```sh
npx tsc -b      # 0 errors
npx oxlint      # 0 errors
npx vitest run  # all tests pass
```

Then test in the app: confirm the node no longer appears in the palette and that saved workflows
with the old id still load (via the alias). Then write the CHANGELOG entry.
