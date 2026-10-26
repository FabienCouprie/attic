// electron/hotes-telechargement.cjs — Les hotes que `telecharger:url` accepte, et rien d'autre.
//
// ═══ POURQUOI CETTE LISTE DESCEND ICI, ALORS QU'ELLE EXISTAIT DEJA ═══
//
// `src/plugins/electronFetch.ts` portait ces memes hotes dans `isModelDownloadUrl`, et ne laissait
// passer qu'eux. Mais c'etait DANS LE RENDERER : un noeud installe, qui a `window.api` puisqu'il
// s'evalue par `new Function` dans le contexte principal de l'interface, appelait
// `api.telechargerUrl` directement et contournait la liste. Le pont, lui, acceptait n'importe
// quelle adresse — et une adresse transporte des donnees dans ses parametres.
//
// RELEVE PAR UNE REVUE CRITIQUE LE 2026-10-26 : « le pont lit toujours n'importe quel fichier,
// `telecharger:url` accepte de son cote n'importe quelle adresse http(s), et une adresse peut
// transporter des donnees dans ses parametres. » Le second maillon se coupe ici.
//
// UNE REGLE QUI VIT DANS LE RENDERER N'EST PAS UNE REGLE, c'est une convention entre honnetes
// gens. Celle-ci vit desormais la ou elle ne se contourne pas.
//
// ═══ POURQUOI UN MODULE, ET NON QUINZE LIGNES DANS `main.cjs` ═══
//
// `main.cjs` demarre Electron : aucun cas ne peut le charger. La partie qui PEUT SE TROMPER —
// comparer un nom d'hote sans se laisser prendre par `kaggle.com.evil.com` — vit donc ici, ou elle
// s'eprouve directement. C'est ce que le depot a deja fait pour `chemin-sur.cjs`.

/**
 * Les hotes servis, repris MOT POUR MOT du renderer pour ne rien casser.
 *
 * Seul `storage.googleapis.com` sert aujourd'hui — les points de controle DDSP. Les autres
 * viennent du chargement TensorFlow Hub, qui redirige. `kagglesdsdata` etait une sous-chaine
 * cherchee n'importe ou dans l'adresse ; ici c'est un NOM D'HOTE, et si celui de Kaggle differe,
 * le refus le nommera — ce qui est la bonne facon de l'apprendre.
 */
const HOTES_TELECHARGEMENT = [
  "tfhub.dev",
  "storage.googleapis.com",
  "kaggle.com",
  "googleusercontent.com",
  "kagglesdsdata.blob.core.windows.net",
];

/**
 * Cette adresse mene-t-elle a un hote servi, en HTTPS ?
 *
 * LA COMPARAISON PORTE SUR LE NOM D'HOTE, JAMAIS SUR L'ADRESSE ENTIERE. `evil.com/?x=kaggle.com`
 * contient la chaine sans etre Kaggle, et `kaggle.com.evil.com` s'en rapproche plus encore : on
 * compare donc le nom EXACT, ou un sous-domaine, le point compris.
 *
 * HTTPS SEUL : les cinq hotes le servent, et une redirection qui retomberait en clair serait un
 * affaiblissement qu'on n'a aucune raison d'accepter pour un telechargement de modele.
 */
function hoteDeTelechargementAutorise(url) {
  if (!url || url.protocol !== "https:") return false;
  const hote = String(url.hostname ?? "").toLowerCase();
  return HOTES_TELECHARGEMENT.some((d) => hote === d || hote.endsWith(`.${d}`));
}

module.exports = { HOTES_TELECHARGEMENT, hoteDeTelechargementAutorise };
