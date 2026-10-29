// electron/fenetres.cjs — Plusieurs fenêtres : à laquelle on parle, et ce qu'une fenêtre neuve reçoit.
//
// ═══ LE PROCESSUS PRINCIPAL NE CONNAISSAIT QU'UNE FENÊTRE ═══
//
// `creerFenetre` réaffectait une variable de module à chaque ouverture. Tout ce qui la lisait
// parlait donc à la DERNIÈRE fenêtre ouverte, quelle que soit celle qui demandait : les dix
// dialogues de fichier s'y ouvraient, F12 y ouvrait les outils, la mise à jour ne prévenait qu'elle.
// Relevé le 2026-10-29, deux fenêtres ouvertes. Un dialogue se rattache désormais à la fenêtre qui
// l'a demandé, et ce qui concerne l'application entière part à toutes.
//
// ═══ LE MODE DÉVELOPPEMENT EFFAÇAIT TOUT À CHAQUE FENÊTRE ═══
//
// Le vidage des caches et du stockage, fait pour qu'un ancien build ne soit pas resservi, vivait
// DANS `creerFenetre`. Ouvrir une seconde fenêtre vidait donc le stockage de la première pendant
// qu'elle travaillait. Mesuré le 2026-10-29 : `localStorage` de 4 clés à 0, une entrée de Cache
// Storage et une base IndexedDB disparues, et la seconde fenêtre ouverte sans aucun méta-composant
// de l'utilisateur. Le vidage a lieu une fois par processus, avant la première fenêtre.
//
// ═══ UNE FENÊTRE NEUVE NAÎT VIDE ═══
//
// Décidé par Fabien le 2026-10-29 : « Nouvelle fenêtre » ouvre toujours un canevas vide, sans
// fichier courant, en développement comme sur le build. La fenêtre l'apprend par son adresse ;
// `src/ui/fenetre.ts` lit le même paramètre, et un cas des tests vérifie que les deux noms
// coïncident.

/** Le paramètre d'adresse qui marque une fenêtre ouverte par « Nouvelle fenêtre ». */
const PARAMETRE_FENETRE = "fenetre";
const VALEUR_NOUVELLE = "nouvelle";

/**
 * La fenêtre qui a envoyé ce message, ou `null`.
 *
 * `null` EST UNE RÉPONSE ADMISE : `dialog.showOpenDialog(null, options)` ouvre un dialogue sans
 * parent, ce qui vaut mieux qu'un dialogue rattaché à une autre fenêtre que celle qui l'attend.
 */
function fenetreDe(BrowserWindow, evenement) {
  const emetteur = evenement && evenement.sender;
  if (!emetteur) return null;
  return BrowserWindow.fromWebContents(emetteur) || null;
}

/**
 * Enveloppe `vider` pour qu'il ne s'exécute qu'une fois par processus.
 *
 * LES APPELS SUIVANTS ATTENDENT LE PREMIER au lieu de repartir : une seconde fenêtre ouverte
 * pendant que le premier vidage tourne ne doit ni le relancer, ni charger sa page avant qu'il soit
 * fini.
 */
function uneSeuleFois(vider) {
  let promesse = null;
  return (...args) => {
    if (!promesse) promesse = Promise.resolve().then(() => vider(...args));
    return promesse;
  };
}

/** La requête de `loadFile` pour une fenêtre : vide pour la première, marquée pour une neuve. */
function requeteDeFenetre(nouvelle) {
  return nouvelle ? { [PARAMETRE_FENETRE]: VALEUR_NOUVELLE } : {};
}

/** L'adresse du serveur de développement, marquée de même. */
function adresseDeDeveloppement(base, nouvelle) {
  const url = new URL(base);
  if (nouvelle) url.searchParams.set(PARAMETRE_FENETRE, VALEUR_NOUVELLE);
  return url.toString();
}

/** Une fenêtre vivante, n'importe laquelle, ou `null` : pour ce qui ne doit se faire qu'une fois. */
function uneFenetreVivante(fenetres) {
  return fenetres.find((f) => f && !f.isDestroyed()) || null;
}

module.exports = {
  PARAMETRE_FENETRE, VALEUR_NOUVELLE,
  fenetreDe, uneSeuleFois, requeteDeFenetre, adresseDeDeveloppement, uneFenetreVivante,
};
