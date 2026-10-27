// audio/vosk-travailleur.ts — Le worker de Vosk, sorti de son blob pour avoir sa propre politique.
//
// ═══ POURQUOI CE MODULE EXISTE ═══
//
// `unsafe-eval` a quitté la politique du document le 2026-10-27. Le relevé du catalogue sous cette
// politique (`tests-e2e/csp-stricte-catalogue.spec.ts`) a alors trouvé deux composants qui levaient
// `EvalError` : « Couper aux mots » et « Parole vers séquence », tous deux sur `vosk-browser`, comme
// la dictée vocale de l'application.
//
// LA CAUSE EST DANS LE WORKER DE VOSK. Son code Emscripten emploie embind, qui CONSTRUIT DES
// FONCTIONS : `createNamedFunction` par `new Function`, et deux `craftInvokerFunction` par
// `new_(Function, …)`. Et ce worker naît d'un BLOB — `vosk-browser` porte son code encodé en base64,
// et `createBase64WorkerFactory` en fait une adresse `blob:`. Un worker de blob HÉRITE la politique
// du document : sous la politique stricte, Vosk ne démarrait plus.
//
// RÉÉCRIRE EMBIND AURAIT ÉTÉ RISQUÉ : c'est du code tiers, généré, au cœur du moteur. Le worker est
// donc SORTI DU BLOB : son code devient un fichier, `vosk-worker.js`, servi à côté d'`index.html`,
// et `electron/politique-securite.cjs` lui donne SA politique, la seule autre que celle du cadre
// isolé qui permette `eval`. Un worker n'a ni DOM ni pont : ce qu'il évalue ne sort pas de lui.
//
// LE TEXTE EST CELUI DU BLOB, OCTET POUR OCTET. `createURL` décode le base64 en chaîne d'octets
// (latin-1), retire la première ligne — le commentaire du chargeur — et en fait un `Blob`, qui
// encode la chaîne en UTF-8. On fait exactement cela.
//
// CE MODULE EST PUR ET TOURNE À LA CONSTRUCTION, sous Node : `src/audio/build-plugins.ts` l'emploie.

/** Le nom du fichier du worker, servi à côté d'`index.html`. */
export const FICHIER_TRAVAILLEUR_VOSK = "vosk-worker.js";

/** La ligne que `vosk-browser` 0.0.8 écrit pour fabriquer son worker. */
const MOTIF = /var WorkerFactory = createBase64WorkerFactory\('([A-Za-z0-9+/=]+)', null, false\);/;

/**
 * Sépare le worker de `vosk-browser` : rend le module modifié, et le texte du worker.
 *
 * REND `null` SI LA FORME ATTENDUE N'Y EST PAS : une version neuve de la bibliothèque qui
 * fabriquerait son worker autrement ne doit pas être transformée à l'aveugle. Le plugin le dit
 * alors bruyamment, et `src/audio/vosk-travailleur.test.ts` tient la forme sur le paquet installé.
 */
export function separerTravailleurVosk(code: string): { code: string; travailleur: string } | null {
  const m = MOTIF.exec(code);
  if (!m) return null;
  const source = Buffer.from(m[1], "base64").toString("latin1");
  const travailleur = source.substring(source.indexOf("\n", 10) + 1);
  // L'ADRESSE SE RÉSOUT CONTRE LE DOCUMENT : `public/` est servi à la racine en développement, et le
  // fichier est émis à côté d'`index.html` au build.
  const remplacement = "var WorkerFactory = function WorkerFactory(options) { "
    + `return new Worker(new URL(${JSON.stringify(FICHIER_TRAVAILLEUR_VOSK)}, document.baseURI), options); };`;
  return { code: code.replace(m[0], () => remplacement), travailleur };
}
