// plugins/cycle-de-vie-noeuds.test.ts — Les transitions d'un nœud, éprouvées sur les 448 d'un coup.
//
// POURQUOI CE BANC EXISTE, demandé par Fabien : « si une petite chose est modifiée, on doit revoir
// les 448 composants dans le détail, un à un. Ce n'est pas tenable. » C'est ce banc qui remplace
// cette revue : une passe mécanique sur toutes les fiches, pour chaque transition qu'un nœud subit.
//
// IL N'EXÉCUTE AUCUN COMPOSANT, ET C'EST VOULU. Faire tourner quatre cent quarante-huit exécuteurs
// demanderait des entrées, des modèles, du réseau et des minutes ; et ce n'est pas ce qui casse. Ce
// qui casse, ce sont les TRANSITIONS : ce qu'un nœud garde et oublie quand on le remet à zéro, quand
// on bouge un réglage, quand on le copie. Le banc fabrique donc l'état qu'un run laisse, à partir de
// ce que la fiche déclare, et éprouve les transitions dessus.
//
// CE QUI L'A RENDU POSSIBLE. Deux choses, et aucune n'existait il y a peu. Les règles ont quitté le
// crochet React pour `core/cycle-de-vie.ts`, où elles s'appellent sans monter React. Et un exécuteur
// peut déclarer ce qu'il montre, par `affichage` et `designe` : avant ce canal, un test générique ne
// pouvait pas savoir ce qu'il devait vérifier, puisque chaque composant écrivait où il voulait dans
// un sac anonyme.
//
// CE QU'IL NE VOIT PAS, et il faut le dire. Il éprouve les règles, pas leur câblage : un appelant
// qui n'emploierait pas ces fonctions lui échapperait. C'est exactement le défaut du 2026-09-28, où
// le même geste avait deux implémentations ; le dernier cas de ce fichier garde cette porte-là.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { apresCopie, apresEffacement, champsAReporter, CANAUX_DECLARES, urlsARevoquer } from "../core/cycle-de-vie";
import { CHAMPS_GARDES_AU_REGLAGE, CLASSES } from "../ui/hooks/useExecutionGraphe";
import { toutesLesFiches } from "./index";
import "../audio/adaptateur";

const fiches = toutesLesFiches;

/**
 * L'état qu'un run laisse sur un nœud de cette fiche.
 *
 * Il porte les trois natures à la fois : la saisie de la personne, ce que le run a produit, ce que
 * le run a désigné de ses entrées. C'est le seul état où les trois transitions se distinguent.
 */
function etatApresUnRun(fiche: { parametres?: { nom: string; defaut?: unknown }[] }) {
  const parametres: Record<string, unknown> = {};
  for (const p of fiche.parametres ?? []) parametres[p.nom] = p.defaut ?? 0;
  return {
    ficheId: "peu-importe",
    parametres,
    // Saisie : un fichier chargé à la main, et son nom.
    audioFichier: { nom: "charge-a-la-main.wav" },
    audioNom: "charge-a-la-main.wav",
    // Produit par le run, dont une URL d'objet qu'il faudra révoquer.
    audioResultatUrl: "blob:http://localhost/abcdef",
    audioResultatMessage: "fait",
    tempsExecution: 42,
    _affichage: { dessin: [1, 2, 3] },
    // Désigné des entrées.
    _designe: { sons: { 0: "tampon-d-amont" } },
  };
}

describe("les transitions d'un nœud, sur toutes les fiches", () => {
  it("il y a bien des fiches à éprouver", () => {
    // Sans ce plancher, un registre vide ferait passer tout le fichier au vert.
    expect(fiches.length).toBeGreaterThan(400);
  });

  it("UNE REMISE À ZÉRO N'ÉPARGNE RIEN DE CE QU'UN RUN A PRODUIT", () => {
    const fautives: string[] = [];
    for (const f of fiches) {
      const { etat } = apresEffacement(etatApresUnRun(f as never), CLASSES);
      const restes = [...CLASSES.resultat].filter((c) => etat[c] !== undefined);
      if (restes.length) fautives.push(`${f.id} : ${restes.join(", ")}`);
    }
    expect(fautives, "un résultat survivant décrit une exécution qui n'a plus lieu").toEqual([]);
  });

  it("ET ELLE NE TOUCHE JAMAIS À CE QUE LA PERSONNE A SAISI", () => {
    const fautives: string[] = [];
    for (const f of fiches) {
      const avant = etatApresUnRun(f as never);
      const { etat, saisiesSauvees } = apresEffacement(avant, CLASSES);
      if (saisiesSauvees.length) fautives.push(`${f.id} : ${saisiesSauvees.join(", ")}`);
      if (etat.audioFichier === undefined) fautives.push(`${f.id} : le fichier chargé a disparu`);
      if (etat.parametres !== avant.parametres) fautives.push(`${f.id} : les réglages ont bougé`);
    }
    expect(fautives, "un champ de saisie effacé fait perdre le travail de la personne").toEqual([]);
  });

  it("UN RÉGLAGE PÉRIME CE QUE LE NŒUD A CALCULÉ, ET GARDE CE QU'IL A REÇU", () => {
    // La transition qui a coûté le plus cher : effacer ici ce que le run avait désigné de ses
    // entrées arrête l'écoute vivante d'un montage au premier gain bougé.
    const fautives: string[] = [];
    for (const f of fiches) {
      const { etat } = apresEffacement(etatApresUnRun(f as never), CLASSES, CHAMPS_GARDES_AU_REGLAGE);
      if (etat._designe === undefined) fautives.push(`${f.id} : le désigné a été effacé`);
      if (etat._affichage !== undefined) fautives.push(`${f.id} : l'affichage a survécu`);
      if (etat.audioResultatUrl !== undefined) fautives.push(`${f.id} : la sortie périmée a survécu`);
      if (etat.audioFichier === undefined) fautives.push(`${f.id} : le fichier chargé a disparu`);
    }
    expect(fautives).toEqual([]);
  });

  it("UN COPIER-COLLER N'EMPORTE AUCUN RÉSULTAT, ni le média local", () => {
    const fautives: string[] = [];
    for (const f of fiches) {
      const copie = apresCopie(etatApresUnRun(f as never), CLASSES);
      const resultats = Object.keys(copie).filter((c) => CLASSES.resultat.has(c));
      if (resultats.length) fautives.push(`${f.id} : ${resultats.join(", ")}`);
      if (copie.audioFichier !== undefined) fautives.push(`${f.id} : le média local est dupliqué`);
      if (copie.parametres === undefined) fautives.push(`${f.id} : les réglages ne suivent pas`);
    }
    expect(fautives, "un nœud collé afficherait le son de l'original sans avoir tourné").toEqual([]);
  });

  it("TOUTE URL D'OBJET PRODUITE PAR UN RUN EST RÉVOQUÉE", () => {
    const fautives: string[] = [];
    for (const f of fiches) {
      const urls = urlsARevoquer(etatApresUnRun(f as never), CLASSES);
      if (!urls.includes("blob:http://localhost/abcdef")) fautives.push(f.id);
    }
    expect(fautives, "une URL non révoquée tient un blob en mémoire par nœud et par run").toEqual([]);
  });

  it("UN RÉGLAGE NE RÉVOQUE PAS CE QU'IL GARDE", () => {
    // Une URL gardée puis révoquée serait pire qu'une fuite : la vue montrerait une source morte.
    const etat = { ...etatApresUnRun(fiches[0] as never), _designe: "blob:http://localhost/garde" };
    expect(urlsARevoquer(etat, CLASSES, CHAMPS_GARDES_AU_REGLAGE)).not.toContain("blob:http://localhost/garde");
  });

  it("CHAQUE TRANSITION N'A QU'UNE IMPLÉMENTATION, et c'est ce qui manquait le plus", () => {
    // LE DÉFAUT QUE CE CAS GARDE FERMÉ. « Changer un réglage » avait deux points d'appel, celui du
    // nœud et celui de l'inspecteur, et ils avaient divergé : régler depuis le nœud marchait, régler
    // depuis l'inspecteur arrêtait l'écoute. Un commentaire disait déjà « il y en a deux dans ce
    // fichier » ; le dire n'a rien empêché. Le banc ci-dessus éprouve les règles, pas leur câblage :
    // sans ce cas, une seconde copie du geste lui échapperait entièrement.
    const app = readFileSync(join("src", "ui", "App.tsx"), "utf8");
    const appels = (motif: RegExp) => (app.match(motif) ?? []).length;
    expect(appels(/reinitialiserPourReglage\(/g), "un seul appelant pour « changer un réglage »").toBe(1);
    expect(appels(/changerReglage\(/g), "un seul point d'entrée, appelé par le nœud et l'inspecteur")
      .toBeLessThanOrEqual(3);
  });
});

// ── D'OÙ VIENT CE QU'UN NŒUD MONTRE, ET D'OÙ IL NE VIENT JAMAIS ──
//
// LE DÉFAUT QUE CES CAS GARDENT FERMÉ, relevé par Fabien : « run, le cercle apparait, reset puis
// run, le cercle a disparu ainsi que le lecteur ». Le moteur reporte sur le nœud vivant les champs
// préfixés d'un blanc souligné qu'il trouve dans l'INSTANTANÉ pris au début du run. Une remise à
// zéro pose `_affichage` à `undefined` : la clé EXISTE, `Object.keys` la voit, et ce report
// remplaçait donc par `undefined` l'affichage que le run venait de produire. Sans remise à zéro, la
// clé porte la valeur du run PRÉCÉDENT, et l'écran montre alors une exécution qui n'est plus la
// bonne, sans que rien ne le dise.
//
// ET DEUX FAUTES SE MASQUAIENT L'UNE L'AUTRE. Le cache ne portait pas ces deux canaux : un nœud
// sauté ne repassait donc rien, et le moteur posait `undefined`. Cela ne se voyait pas, parce que le
// report remettait par-dessus la valeur de l'instantané. Corriger le report seul aurait vidé l'écran
// à chaque succès de cache ; corriger le cache seul n'aurait rien changé. Les deux ensemble, donc,
// et ces cas tiennent les deux.
describe("les deux canaux déclarés ne viennent que de l'exécuteur ou du cache", () => {
  it("LE REPORT DE L'INSTANTANÉ NE TOUCHE JAMAIS UN CANAL DÉCLARÉ", () => {
    const rapporte = champsAReporter({
      _carteHtmlUrl: "file:///carte/index.html",
      _affichage: { dessin: "celui d'avant" },
      _designe: { sons: "ceux d'avant" },
      parametres: {},
    });
    expect(rapporte, "un champ autonome doit continuer de passer").toEqual({
      _carteHtmlUrl: "file:///carte/index.html",
    });
  });

  it("ET IL NE LE TOUCHE PAS DAVANTAGE QUAND LA REMISE À ZÉRO L'A LAISSÉ À `undefined`", () => {
    // C'est le cas exact du défaut : la clé existe, sa valeur est `undefined`, et `Object.keys` la
    // voit. Un report naïf écrasait donc l'affichage neuf par ce vide-là.
    const efface = apresEffacement(etatApresUnRun(fiches[0] as never), CLASSES).etat;
    expect(Object.prototype.hasOwnProperty.call(efface, "_affichage"),
      "la remise à zéro pose bien la clé, et c'est ce qui rendait le défaut possible").toBe(true);
    expect(efface._affichage).toBeUndefined();
    const rapporte = champsAReporter(efface);
    expect(rapporte === null || !("_affichage" in rapporte), "le vide ne doit pas être reporté").toBe(true);
    expect(rapporte === null || !("_designe" in rapporte)).toBe(true);
  });

  it("un nœud sans aucun champ autonome ne fait rien reporter", () => {
    expect(champsAReporter({ parametres: {}, _affichage: { x: 1 } })).toBeNull();
  });

  it("les deux canaux déclarés sont bien ceux que le moteur efface à la remise à zéro", () => {
    // Si l'un des deux quittait `CHAMPS_RESULTAT`, il ne serait plus effacé et l'écran décrirait un
    // run qui n'a plus lieu ; s'il n'était pas dans `CANAUX_DECLARES`, le report le ressusciterait.
    for (const canal of CANAUX_DECLARES) {
      expect(CLASSES.resultat.has(canal), `${canal} doit être effacé par une remise à zéro`).toBe(true);
    }
  });

  it("LE CÂBLAGE SUIT : le moteur range les canaux au cache, les en ressort, et passe par la règle", () => {
    // Le banc ci-dessus éprouve la règle, pas son câblage. Ces trois lectures gardent les trois
    // endroits du moteur où le défaut se tenait.
    const moteur = readFileSync(join("src", "ui", "hooks", "useExecutionGraphe.ts"), "utf8");
    expect(moteur, "le cache doit ranger les deux canaux, sans quoi un nœud sauté vide son écran")
      .toMatch(/cacheExec\.current\.set\([^)]*affichage:\s*res\.affichage[^)]*designe:\s*res\.designe/s);
    expect(moteur, "et les en ressortir au succès de cache")
      .toMatch(/entreeCache\.affichage\)\s*affichageParNoeud\.set/);
    expect(moteur, "et les en ressortir aussi pour le désigné")
      .toMatch(/entreeCache\.designe\)\s*designeParNoeud\.set/);
    expect(moteur, "le report doit passer par `champsAReporter`, et non relire `Object.keys` sur place")
      .toMatch(/champsAReporter\(/);
    // Et la boucle de report ne doit plus balayer les clés elle-même : c'est cette boucle-là qui
    // ramassait les canaux déclarés.
    expect(moteur.match(/for \(const cle of Object\.keys\(d\)\)/g) ?? [],
      "plus aucun balayage des champs `_` à la main dans le moteur").toEqual([]);
  });
});
