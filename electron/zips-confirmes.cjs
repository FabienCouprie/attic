// electron/zips-confirmes.cjs — Les archives de node que la personne a confirmées, en attente du registre.
//
// POURQUOI CE MODULE. `node:importer-zip` montrait le node, puis dépliait l'archive dans
// `~/.attic/nodes/<id>/` dans le même geste, et le registre ne décidait qu'après, dans la fenêtre.
// Un node refusé, natif figé, alias ou manifeste invalide, laissait donc son dossier sur le disque ;
// et un manifeste invalide écrasait les fichiers de la version du même node qui tournait. Le
// registre vit dans la fenêtre et non ici : la décision ne peut pas se prendre de ce côté.
//
// L'IMPORT SE FAIT DONC EN DEUX TEMPS. `node:importer-zip` lit et fait confirmer, sans rien écrire,
// et garde ici l'archive confirmée sous un jeton. La fenêtre demande au registre, puis, s'il
// accepte, `node:deplier-zip` déplie CETTE archive, et nulle autre.
//
// L'ARCHIVE EST GARDÉE EN MÉMOIRE, ET NON SON CHEMIN. Relire le fichier au second temps déplierait
// ce qui s'y trouve alors, peut-être autre chose que ce que la boîte a montré.
//
// UN JETON NE SERT QU'UNE FOIS, et seuls les derniers restent : une archive confirmée puis refusée
// par le registre n'est jamais redemandée, et rien ne doit s'accumuler.
const { randomUUID } = require("crypto");

/** Le nombre d'archives confirmées que l'on garde à la fois. */
const CAPACITE = 4;

function creerZipsConfirmes(capacite = CAPACITE) {
  /** jeton → { zip, id }, dans l'ordre d'arrivée. */
  const enAttente = new Map();

  /** Garde l'archive confirmée, et rend le jeton qui la désigne. */
  function retenir(zip, id) {
    const jeton = randomUUID();
    enAttente.set(jeton, { zip, id });
    while (enAttente.size > capacite) enAttente.delete(enAttente.keys().next().value);
    return jeton;
  }

  /** Rend l'archive de ce jeton et l'oublie, ou `null` si le jeton est inconnu ou déjà servi. */
  function reprendre(jeton) {
    if (typeof jeton !== "string") return null;
    const e = enAttente.get(jeton);
    if (!e) return null;
    enAttente.delete(jeton);
    return e;
  }

  return { retenir, reprendre, taille: () => enAttente.size };
}

module.exports = { creerZipsConfirmes, CAPACITE };
