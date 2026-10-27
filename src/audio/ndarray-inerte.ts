// audio/ndarray-inerte.ts — Ce qui remplace `ndarray` et `ndarray-resample` dans la construction.
//
// ═══ POURQUOI CE MODULE EXISTE ═══
//
// LE `unsafe-eval` DE LA CSP NE TENAIT PLUS QU'À CELA, relevé le 2026-10-27. Le nœud DDSP importe
// `@magenta/music`, dont `core/audio_utils` importe `ndarray` et `ndarray-resample`. Ces deux
// bibliothèques FABRIQUENT DU CODE : `ndarray-ops` compile ses opérations par `new Function` dès
// l'import (`exports.any = compile(…)`, puis `cwise-compiler/lib/thunk.js:82`), et `ndarray`
// compile un constructeur par forme de tableau. Sans `unsafe-eval`, le simple import levait.
//
// ET CE CODE NE SERT JAMAIS ICI. `resampleAndMakeMono` ne passe par ndarray QUE SOUS SAFARI :
//
//   if (!isSafari) { …OfflineAudioContext… } else { …resample(ndarray(…), ndarray(…))… }
//
// Electron embarque Chromium, donc la branche Safari n'est jamais prise. On payait une permission
// de sécurité pour une bibliothèque importée et jamais appelée.
//
// CE MODULE REMPLACE LES DEUX À LA CONSTRUCTION (`audio/build-plugins.ts`). Il n'évalue rien, et
// s'il était un jour appelé il LÈVERAIT en le disant : un rééchantillonnage qui rendrait en silence
// un tableau vide serait pire qu'une erreur.
//
// L'AUTRE VOIE AVAIT ÉTÉ DEMANDÉE, ET ELLE EST ÉCARTÉE PAR LA MESURE : isoler DDSP dans un cadre à
// lui aurait demandé de charger Magenta, TensorFlow et Tone dans une origine opaque, y compris
// depuis `file://` en production. Retirer la cause est plus sûr que de l'enfermer.

const RAISON = "ndarray n'est pas inclus dans cette construction : Magenta n'y recourt que sous Safari, "
  + "et Electron embarque Chromium. Voir src/audio/ndarray-inerte.ts.";

/** Lève, et dit pourquoi. N'est jamais appelé dans Electron. */
export default function ndarrayInerte(): never {
  throw new Error(RAISON);
}
