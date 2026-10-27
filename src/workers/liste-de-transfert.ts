// src/workers/liste-de-transfert.ts — Ce qu'un worker de calcul rend part TRANSFÉRÉ, non recopié.
//
// LES DEUX DIALOGUES L'EMPLOIENT, `servir-par-canal` et `servir-par-lot`. Le premier en tenait une
// copie, qui ne connaissait pas un résultat qui EST un tableau typé : ses neuf workers qui rendent
// un `Float32Array` nu recopiaient donc leur résultat. Mesuré le 2026-10-27 dans le navigateur, sur
// deux canaux de trois minutes et le worker de la vitesse variable : 2 008 à 2 219 ms par appel
// avant, 520 à 662 ms après.
//
// UN MODULE À PART, ET NON UN IMPORT D'UN DIALOGUE DANS L'AUTRE : `docs/couverture-empreintes.test.ts`
// reconnaît un worker de calcul à ce qu'il importe un dialogue. Un dialogue qui en importerait un
// autre y passerait pour un worker orphelin, et c'est arrivé.

/** Les tampons à transférer plutôt qu'à recopier : tout tableau typé que porte un résultat. */
export function tamponsDe(resultat: unknown): ArrayBuffer[] {
  if (!resultat || typeof resultat !== "object") return [];
  // UN RÉSULTAT QUI EST LUI-MÊME UN TABLEAU TYPÉ, et c'était un piège : `Object.values` sur un
  // `Float32Array` de quatre cent mille échantillons en fabrique un tableau de quatre cent mille
  // nombres, pour ne rien trouver à transférer ensuite. Ici il n'y a qu'un tampon, et c'est lui.
  if (ArrayBuffer.isView(resultat)) return [resultat.buffer as ArrayBuffer];
  const out: ArrayBuffer[] = [];
  for (const v of Object.values(resultat as Record<string, unknown>)) {
    if (ArrayBuffer.isView(v)) out.push(v.buffer as ArrayBuffer);
    else if (Array.isArray(v)) for (const e of v) if (ArrayBuffer.isView(e)) out.push(e.buffer as ArrayBuffer);
  }
  return out;
}

/**
 * La liste de transfert de tous les résultats d'une réponse, chaque tampon une seule fois.
 *
 * UN TAMPON NOMMÉ DEUX FOIS FAIT LEVER `postMessage` (`DataCloneError`, relevé dans Chromium :
 * « ArrayBuffer at index 1 is a duplicate »), et deux vues sur un même tampon suffisent pour cela :
 * la copie, elle, les acceptait.
 */
export function listeDeTransfert(resultats: readonly unknown[]): ArrayBuffer[] {
  return [...new Set(resultats.flatMap(tamponsDe))];
}
