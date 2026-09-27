// docs/contrat-reglages.test.ts — Un réglage qui peut être une commande n'est pas un champ de texte.
//
// POURQUOI CE FICHIER EXISTE. Le micromontage a été livré avec sept champs libres, où l'on écrivait
// « 0.04~0.12 » pour dire une durée entre quarante et cent vingt millisecondes. Cela marche et
// n'aide personne : rien ne dit les bornes admises, rien ne se règle à la souris, et la syntaxe
// s'apprend au lieu de se voir. Relevé par Fabien : dès qu'on peut mettre une glissière, une liste
// déroulante ou un sélecteur, il faut le faire.
//
// LA RÈGLE. Un réglage qui porte UNE grandeur numérique bornée se déclare `curseur` ou `nombre` ;
// un réglage qui porte un choix parmi quelques valeurs se déclare `choix` ; un chemin se déclare
// `fichier` ou `dossier`. Le champ libre est le dernier recours, et il n'est légitime que pour ce
// qui n'est pas une valeur : une suite, une formule, un motif, une phrase.
//
// CE QUE LE TEST PEUT VOIR, ET CE QU'IL NE PEUT PAS. Il ne lit pas les intentions : il relève les
// champs de texte dont le défaut se lit comme un nombre, une rampe ou un tirage, ce qui est le
// symptôme le plus net d'une grandeur déguisée en texte. Les champs qui portent VRAIMENT autre
// chose sont nommés un par un ci-dessous, avec leur raison ; la liste est courte, et l'allonger est
// un acte délibéré qui se voit à la relecture.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins/index";
import "../audio/adaptateur";

/**
 * Les champs de texte dont le défaut ressemble à un nombre et qui portent pourtant autre chose.
 *
 * Chaque entrée est « composant / réglage », et la raison suit. Sans raison, pas d'exemption.
 */
const CHAMPS_LEGITIMES: Record<string, string> = {
  // La matrice d'OMChroma : un champ y décrit une grandeur pour des centaines d'événements, sous
  // trois formes qu'aucune glissière ne rend, dont une suite de longueur quelconque.
  "matrice-parametres/Départs": "une suite, une rampe ou un tirage sur des centaines d'événements",
  "matrice-parametres/Durées": "idem",
  "matrice-parametres/p4": "idem, et son sens dépend de l'orchestre qui le lit",
  "matrice-parametres/p5": "idem",
  // La boucle par créneau décrit les créneaux eux-mêmes, en nombre variable.
  "boucle-creneau-debut/Départs": "un instant par créneau, en nombre variable",
  "boucle-creneau-debut/Durées": "une durée par créneau, en nombre variable",
  // Les transformations de cercle prennent une quantité par passe de boucle, même mécanisme.
  "cercle-tourner/Pas": "une quantité par passe de boucle",
  "cercle-miroir/Axe": "une quantité par passe de boucle",
  "cercle-inverser/Axe": "une quantité par passe de boucle",
  "cercle-permuter/Graine": "une quantité par passe de boucle",
  // Un motif de cercle est une suite de zéros et de uns, pas un nombre : sa longueur EST le nombre
  // de places, et le dessin l'écrit à chaque clic.
  "cercle-rythmique/Motif": "une suite de zéros et de uns, dont la longueur est le nombre de places",
  "cercle-melodique/Motif": "idem",
  // Le répartiteur MIDI accepte « 1 », « 1,2 », « 1-3 » : une liste de canaux, pas un canal.
  "repartiteur-midi/Partie 1": "une liste de canaux ou de pistes",
  "repartiteur-midi/Partie 2": "une liste de canaux ou de pistes",
  "repartiteur-midi/Partie 3": "une liste de canaux ou de pistes",
  "repartiteur-midi/Batterie": "une liste de canaux ou de pistes",
};

/** Le défaut se lit-il comme une grandeur : un nombre seul, une rampe « a:b », un tirage « a~b » ? */
function ressembleAUneGrandeur(defaut: unknown): boolean {
  if (typeof defaut !== "string") return false;
  const t = defaut.trim();
  if (t.length === 0) return false;
  return /^-?\d+(\.\d+)?$/.test(t)
    || /^-?\d+(\.\d+)?\s*[:~]\s*-?\d+(\.\d+)?$/.test(t);
}

describe("le contrat de réglages", () => {
  it("UN CHAMP DE TEXTE NE PORTE PAS UNE GRANDEUR : c'est une glissière qu'il faut", () => {
    const fautifs: string[] = [];
    for (const f of toutesLesFiches) {
      for (const p of f.parametres ?? []) {
        if (p.type !== "texte") continue;
        if (!ressembleAUneGrandeur(p.defaut)) continue;
        const cle = `${f.id}/${p.nom}`;
        if (CHAMPS_LEGITIMES[cle]) continue;
        fautifs.push(`${cle} (défaut « ${p.defaut} »)`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("UN RÉGLAGE NUMÉRIQUE DÉCLARE SES BORNES, sans quoi la glissière n'a pas de course", () => {
    const sansPlage: string[] = [];
    for (const f of toutesLesFiches) {
      for (const p of f.parametres ?? []) {
        if (p.type !== "curseur") continue;
        if (!p.plage || p.plage.length !== 2 || !(p.plage[1] > p.plage[0])) {
          sansPlage.push(`${f.id}/${p.nom}`);
        }
      }
    }
    expect(sansPlage).toEqual([]);
  });

  it("UN CHOIX A SES LIBELLÉS ET SES IDENTIFIANTS EN NOMBRE ÉGAL, sinon une option est injoignable", () => {
    // CE CONTRÔLE A DÉJÀ SERVI. Deux listes de gammes portaient neuf libellés pour onze
    // identifiants : le blues et la chromatique existaient dans le moteur et ne se choisissaient
    // nulle part. Le compte des options n'est PAS contrôlé, en revanche : certaines listes se
    // remplissent à l'exécution, une banque chargée ou des composants installés, et sont vides
    // dans la fiche.
    const boiteux: string[] = [];
    for (const f of toutesLesFiches) {
      for (const p of f.parametres ?? []) {
        if (p.type !== "choix") continue;
        const n = p.options?.length ?? 0;
        if (n === 0) continue;
        if (p.optionsEn && p.optionsEn.length !== n) {
          boiteux.push(`${f.id}/${p.nom} : ${n} libellés, ${p.optionsEn.length} en anglais`);
        }
        if (p.optionIds && p.optionIds.length !== n) {
          boiteux.push(`${f.id}/${p.nom} : ${n} libellés, ${p.optionIds.length} identifiants`);
        }
      }
    }
    expect(boiteux).toEqual([]);
  });

  it("chaque exemption nomme un réglage qui existe, sinon la liste vieillit en silence", () => {
    const orphelines: string[] = [];
    for (const cle of Object.keys(CHAMPS_LEGITIMES)) {
      const [id, nom] = cle.split("/");
      const f = toutesLesFiches.find((x) => x.id === id);
      if (!f || !(f.parametres ?? []).some((p) => p.nom === nom)) orphelines.push(cle);
    }
    expect(orphelines).toEqual([]);
  });

  it("LE MICROMONTAGE N'A PLUS UN SEUL CHAMP LIBRE, puisque c'est lui qui a fait écrire ce contrat", () => {
    const f = toutesLesFiches.find((x) => x.id === "micromontage")!;
    expect(f.parametres.filter((p) => p.type === "texte")).toEqual([]);
    // Et chaque grandeur y porte bien ses trois commandes.
    for (const nom of ["Source", "Prise", "Pose", "Durée", "Nuance", "Panoramique", "Transposition"]) {
      expect(f.parametres.find((p) => p.nom === nom)?.type, nom).toBe("curseur");
      expect(f.parametres.find((p) => p.nom === `${nom}, fin`)?.type, nom).toBe("curseur");
      expect(f.parametres.find((p) => p.nom === `${nom}, loi`)?.type, nom).toBe("choix");
    }
  });
});
