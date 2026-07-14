# Removing a Node (Plugin)

Guide to safely remove a plugin node from Attic.

## Steps

### 1. Remove the plugin definition

Delete the plugin object (the `{ id: "...", nom: "...", ... }` block) from its file in `src/plugins/` (e.g. `effets.ts`, `generateurs.ts`, `montage.ts`, `sorties.ts`).

### 2. Remove the notice

Delete the entry from `src/plugins/notices.ts`:

```ts
"node-id": { fr: "...", en: "..." },
```

### 3. Remove the prompt-graphe entry

Delete the entry from `src/plugins/prompt-graphe.ts`:

```ts
{ ficheId: "node-id", mots: [...], category: "..." },
```

### 4. Remove any custom view

If the node has a registered view in `src/ui/vues.tsx`, delete the entry:

```ts
{ correspond: parId("node-id"), vue: VueXxx, position: "avant" },
```

Also delete the view component function itself if it's no longer used by any other node.

### 5. Add an alias (for backward compatibility)

If users have saved workflows that reference the old node id, add an alias in `src/core/registre.ts` so the saved graph still loads:

```ts
const ALIAS: Record<string, string> = {
  ...
  "old-node-id": "replacement-node-id",  // or just remove the alias if there's no replacement
};
```

### 6. Remove unused imports

Check the plugin file for imports that are no longer used after the deletion (functions from `../audio`, `midi-file`, etc.). Remove them to avoid build warnings.

### 7. Remove the default size entry (if any)

If the node has a custom size in `tailleDefaut()` in `src/ui/App.tsx`, delete the line:

```ts
if (def.id === "node-id") return { width: ..., height: ... };
```

### 8. Remove inspector entries (if any)

If the node has special handling in `src/ui/Inspector.tsx` (e.g. recorder UI, file loader), delete the conditional block:

```tsx
{def.id === "node-id" ? (
  ...
) : null}
```

### 9. Verify

```sh
npm run build    # 0 errors
npm test         # all tests pass
```

Then test in the app: confirm the node no longer appears in the palette and that saved workflows with the old id still load (via the alias).
