// docs/contrat-graines.test.ts — Une graine se DÉCLARE, et le moteur la résout pour tout le monde.
//
// POURQUOI CE FICHIER EXISTE. Relevé par Fabien : « pour les graines aléatoires nous devons normer
// tous les nodes ; c'est une erreur de conception de ma part, il y a un excès de décentralisation,
// il faut le corriger partout où c'est possible, le fonctionnement sur les graines doit être
// homogène ».
//
// CE QU'ÉTAIT LA DÉCENTRALISATION, MESURÉE. Soixante-seize réglages de graine, dans soixante-cinq
// fichiers. Une convention de projet existait — `hasardDuNoeud` : au-dessus de zéro la graine est
// posée, sinon elle est tirée, et la graine tirée se rend pour qu'un résultat réussi soit rejouable
// — mais treize fichiers seulement l'appliquaient. Ailleurs, une graine à zéro était une graine
// FIXE valant zéro : le composant rendait toujours la même chose, quand la documentation de
// plusieurs annonçait « 0 = nouvel ordre à chaque exécution ». Douze passaient par `creerAleatoire`
// sans la convention, huit appelaient `Math.random` en ignorant la graine posée.
//
// CE QUI A ÉTÉ FAIT. Le rôle est DÉCLARÉ sur le réglage, par `graine: true`, et c'est le MOTEUR qui
// résout la valeur avant que le composant ne la lise. Aucun composant n'a eu à changer :
// `resoudreGraine` est idempotente, donc un composant qui appelle encore `hasardDuNoeud` sur une
// valeur déjà résolue obtient la même.
//
// CE QUE CE FICHIER TIENT, ET POURQUOI IL CHERCHE UNE FORME. La déclaration ne vaut que si personne
// ne peut l'oublier. Le premier cas cherche donc les réglages qui RESSEMBLENT à une graine et
// n'en portent pas le rôle : c'est le seul endroit du dépôt où un libellé sert à quelque chose, et
// il y sert à DÉNONCER une déclaration manquante, jamais à décider d'un comportement. La différence
// est tout : un garde qui se trompe crie, un moteur qui se trompe se tait.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins";
import "../audio/adaptateur";
import { GRAINE_MAX, hasardDuNoeud, resoudreGraine } from "../core/hasard";

interface Reglage { nom: string; nomEn?: string; graine?: true; defaut?: unknown; plage?: [number, number] }
interface Fiche { id: string; parametres?: Reglage[] }

const fiches = toutesLesFiches as unknown as Fiche[];
const tousLesReglages = fiches.flatMap((f) => (f.parametres ?? []).map((p) => ({ fiche: f.id, p })));

/**
 * Ce qui se lit comme une graine, dans les deux langues.
 *
 * UN NOMBRE, ET LE LIBELLÉ SEULEMENT ENSUITE. « Graines » au pluriel, sur le début de boucle, est un
 * CHOIX qui dit ce que les graines de la chaîne deviennent : le libellé s'en rapproche, mais un
 * choix n'est jamais une graine. La forme tranche donc avant le nom, ce qui est l'ordre habituel
 * ici ; le nom ne sert qu'à dénoncer une déclaration manquante, jamais à décider d'un comportement.
 */
const seLitCommeUneGraine = (p: Reglage) =>
  typeof p.defaut === "number"
  && (/graine/i.test(p.nom ?? "") || /\bseed\b/i.test(p.nomEn ?? ""));

describe("le rôle de graine se déclare", () => {
  it("IL Y A BIEN DES GRAINES À VÉRIFIER, et le compte est écrit", () => {
    // Un test qui ne trouve rien passe, et l'on croirait qu'il garde quelque chose.
    const declarees = tousLesReglages.filter(({ p }) => p.graine === true);
    expect(declarees.length).toBeGreaterThanOrEqual(70);
  });

  it("TOUT RÉGLAGE QUI SE LIT COMME UNE GRAINE EN PORTE LE RÔLE", () => {
    // LA LISTE SE JOINT EN UNE CHAÎNE, et ce n'est pas un détail : un tableau se fait tronquer par
    // le rapport de test, et l'on ne voit alors que le premier fautif sur quatre.
    const oublies = tousLesReglages
      .filter(({ p }) => seLitCommeUneGraine(p) && p.graine !== true)
      .map(({ fiche, p }) => `${fiche} : « ${p.nom} »`)
      .join(" | ");
    expect(oublies, [
      "Ces réglages se lisent comme une graine et ne portent pas `graine: true`.",
      "Sans le rôle, le moteur ne les résout pas : un zéro y reste une graine FIXE valant zéro,",
      "et le composant rend toujours la même chose au lieu de tirer au sort.",
    ].join("\n")).toBe("");
  });

  it("ET AUCUN RÉGLAGE NE PORTE LE RÔLE SANS ÊTRE UNE GRAINE", () => {
    // L'autre sens : le rôle fait résoudre la valeur, donc le poser sur un réglage ordinaire
    // remplacerait silencieusement un zéro par un nombre tiré au sort.
    const abusifs = tousLesReglages
      .filter(({ p }) => p.graine === true && !seLitCommeUneGraine(p))
      .map(({ fiche, p }) => `${fiche} : « ${p.nom} »`);
    expect(abusifs).toEqual([]);
  });

  it("UNE GRAINE DÉCLARÉE EST UN NOMBRE, jamais un choix ni un texte", () => {
    const malFormees = tousLesReglages
      .filter(({ p }) => p.graine === true && typeof p.defaut !== "number")
      .map(({ fiche, p }) => `${fiche} : « ${p.nom} » a pour défaut ${JSON.stringify(p.defaut)}`);
    expect(malFormees).toEqual([]);
  });

  it("ET SA PLAGE VA JUSQU'À LA GRAINE TIRÉE, sans quoi un résultat réussi ne se rejoue pas", () => {
    // CE QUE LA PLAGE COMMANDE VRAIMENT : le champ numérique de l'inspecteur REFUSE ce qui sort des
    // bornes (`ui/Inspector.tsx`, `v >= mn && v <= mx`). Une plage qui s'arrêtait à 9999 rendait donc
    // intapable la graine que le message venait d'annoncer, et la promesse de la convention — un
    // résultat réussi se rejoue en reposant sa graine — était vide sur vingt-six réglages.
    const tropCourtes = tousLesReglages
      .filter(({ p }) => p.graine === true && p.plage !== undefined && p.plage[1] < GRAINE_MAX)
      .map(({ fiche, p }) => `${fiche} : « ${p.nom} » va jusqu'à ${p.plage![1]}`);
    expect(tropCourtes.join(" | ")).toBe("");
  });

  it("ET ELLE DESCEND JUSQU'À LA VALEUR QUI DEMANDE UN TIRAGE", () => {
    // L'AUTRE BOUT, ET C'ÉTAIT LE PLUS GRAVE : trente-six plages commençaient à 1. Le zéro qui
    // demande un tirage était hors d'atteinte, et sur ces réglages-là la convention n'existait pas.
    // Quatre plages commencent à -1 : c'est le défaut de ces fiches-là, et il demande déjà un
    // tirage, donc la borne est bonne. Ce que le cas exige est la POSSIBILITÉ du tirage, pas un
    // chiffre : `resoudreGraine` tire dès que la valeur n'est pas au-dessus de zéro.
    const sansTirage = tousLesReglages
      .filter(({ p }) => p.graine === true && p.plage !== undefined && p.plage[0] > 0)
      .map(({ fiche, p }) => `${fiche} : « ${p.nom} » commence à ${p.plage![0]}`);
    expect(sansTirage.join(" | ")).toBe("");
  });
});

describe("ce que la convention garantit à tous", () => {
  it("UNE GRAINE POSÉE EST GARDÉE, et une graine absente est tirée dans les bornes", () => {
    expect(resoudreGraine(42)).toBe(42);
    for (const v of [0, -1]) {
      const g = resoudreGraine(v);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(GRAINE_MAX);
    }
  });

  it("ET ELLE EST IDEMPOTENTE, ce qui permet de la poser au centre sans toucher aux composants", () => {
    // C'est la clause qui a rendu la correction possible sans réécrire soixante-cinq fichiers : un
    // composant qui appelle encore `hasardDuNoeud` sur une valeur que le moteur a déjà résolue
    // obtient exactement la même, au lieu d'en tirer une seconde.
    for (const v of [0, -1, 7, 999999]) {
      const une = resoudreGraine(v);
      expect(hasardDuNoeud(une).graine).toBe(une);
    }
  });
});
