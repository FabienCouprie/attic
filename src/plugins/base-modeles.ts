// plugins/base-modeles.ts — Où lire un modèle livré, selon l'endroit où le code tourne.
//
// LES MODÈLES SONT LIVRÉS AVEC L'APPLICATION, et ne viennent pas d'un tiers. C'est la règle du
// dépôt, et elle a trois raisons, toutes vérifiées sur les points de contrôle Magenta avant de
// l'être sur les deux modèles de reconnaissance vocale : une installation SANS RÉSEAU doit pouvoir
// employer le nœud ; l'intégrité de ce qui arrive doit être vérifiable, ce que `modeles-manifest`
// fait et qu'un téléchargement direct chez un tiers ne fait pas ; et un tiers peut déplacer,
// renommer ou retirer ce qu'il héberge.
//
// DEUX ENVIRONNEMENTS, ET LE SECOND EST LE DIFFICILE.
//
//   · navigateur et développement — `http://hôte/oonx/…`, que Vite sert depuis `public/` ;
//   · application empaquetée — la page vient de `file://`, où un `fetch` est refusé. On passe par
//     le schéma `attic-res:`, servi par le processus principal, qui résout par le même chemin que
//     tout le reste du dépôt et ne sert que les dossiers qu'il déclare.
//
// POURQUOI CETTE BASE SE CALCULE DANS LA PAGE ET SE TRANSMET AU WORKER, plutôt que d'être calculée
// là-bas. Dans un worker, `self.location` est l'URL DU SCRIPT : une adresse relative s'y résoudrait
// contre `/src/workers/` et non contre la page, et un worker servi depuis `public/` n'a pas la même
// base qu'un worker passé par le graphe de Vite. La page, elle, connaît la sienne sans ambiguïté.
// `magenta-helpers` résout dans le worker parce que son module y est chargé ; ces deux nœuds-ci
// construisent leur configuration dans la page, et la lui passent.

/**
 * La base d'où lire un paquet de modèle livré sous `public/`.
 *
 * @param dossier le dossier du paquet, par exemple `"oonx/whisper-base-en"`. Il doit être sous un
 *   dossier que `electron/ressource-locale.cjs` déclare servir, sans quoi le schéma le refusera.
 */
export function baseModeleLivre(dossier: string): string {
  const loc = typeof location !== "undefined" ? location : undefined;
  if (!loc) return dossier;
  if (loc.protocol === "file:") return `attic-res://${dossier}`;
  // UNE ADRESSE ENRACINÉE, ET NON UNE URL ABSOLUE, et ce n'est pas une préférence de style.
  // Transformers.js interroge le disque avant le réseau, mais SEULEMENT si le chemin composé n'est
  // pas une URL http : `_get_file_metadata` fait `isValidUrl(localPath, ["http:", "https:"])` et
  // saute toute la branche locale quand c'est vrai. Avec le réseau interdit, les deux branches
  // étaient alors sautées, le tokeniseur déclaré absent, et `tokenizer_class` lu sur `undefined`.
  // La réponse est en outre mémoïsée, de sorte qu'un seul essai raté condamnait la page entière.
  // `attic-res:` passe, lui, puisque la vérification ne reconnaît que http et https.
  return `/${dossier}`;
}
