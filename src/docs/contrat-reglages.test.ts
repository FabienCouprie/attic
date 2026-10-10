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

import { toutesLesFiches } from "../plugins";
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

  it("DEUX RÉGLAGES D'UNE MÊME FICHE NE PORTENT PAS LE MÊME NOM", () => {
    // CE QU'UN HOMONYME FAIT, ET IL NE LÈVE AUCUNE ERREUR. Une fiche range ses valeurs par NOM :
    // `useExecutionGraphe` lit `noeud.data.parametres[nom]`, et la définition retenue est la
    // PREMIÈRE qui porte ce nom. Deux réglages homonymes partagent donc une seule valeur, et le
    // second voit la plage, l'unité et le pas du premier. Mesuré sur un banc avant d'être tenu
    // ici : deux bornes de modulation posées à 0 → 40 se lisaient aussi pour un second réglage
    // dont la plage déclarée allait de 0 à 10 secondes, et une courbe tenue à un y donnait 40.
    //
    // LA FORME CHERCHÉE EST L'HOMONYMIE, non une liste de noms à surveiller. Le piège qui a fait
    // écrire ce cas est `bornesModulation`, qui rendait « Modulation min » et « Modulation max »
    // quel que soit le réglage piloté : deux appels sur une même fiche suffisaient. Il accepte
    // désormais les noms des bornes, et la convention du catalogue est que le premier réglage
    // modulé garde « Modulation min / max » tandis que les suivants prennent le nom de leur
    // réglage, « Temps min » sur l'écho, « Azimut min » sur le spatialiseur.
    const fautifs: string[] = [];
    for (const f of toutesLesFiches) {
      const vus = new Map<string, number>();
      for (const p of f.parametres ?? []) vus.set(p.nom, (vus.get(p.nom) ?? 0) + 1);
      for (const [nom, n] of vus) if (n > 1) fautifs.push(`${f.id} : « ${nom} » déclaré ${n} fois`);
    }
    expect(fautifs).toEqual([]);
  });

  it("DEUX PORTS D'UNE MÊME FICHE NE PORTENT PAS LE MÊME NOM", () => {
    // CE QUE L'HOMONYMIE DE PORTS FAIT, ET CE QU'ELLE NE FAIT PAS. Un câble enregistré désigne sa
    // borne par son RANG, « in:2 », et non par son nom : deux ports homonymes ne cassent donc
    // aucun patch sauvegardé, et c'est pourquoi rien ne se plaignait. Le dégât est à l'écran.
    // L'inspecteur annonce un réglage modulable en nommant le port où la courbe doit aller, et la
    // notice répète ce nom ; avec deux ports du même nom, la phrase ne désigne plus rien, et
    // l'utilisateur n'a aucun moyen de savoir laquelle des deux bornes il branche.
    //
    // LE DÉFAUT QUI A FAIT ÉCRIRE CE CAS. `portModulation` choisissait le nom court « Modulation »
    // d'après le NOM du réglage piloté, « Mix » ou « Mélange », au motif qu'un réglage seul n'a
    // rien dont le distinguer. Ce raccourci est faux dès qu'un autre réglage de la même fiche est
    // déjà piloté : sur le retard spectral, où la dispersion avait son port, celui du mélange est
    // sorti « Modulation » lui aussi. La forme cherchée ici est donc l'homonymie, et non une liste
    // de noms à surveiller : un nom ne dit jamais combien ils sont.
    const fautifs: string[] = [];
    for (const f of toutesLesFiches) {
      for (const [cote, ports] of [["entrée", f.entrees], ["sortie", f.sorties]] as const) {
        const vus = new Map<string, number>();
        for (const p of ports ?? []) vus.set(p.nom, (vus.get(p.nom) ?? 0) + 1);
        for (const [nom, n] of vus) {
          if (n > 1) fautifs.push(`${f.id} : ${cote} « ${nom} » déclarée ${n} fois`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("relève bien assez de réglages pour que l'homonymie ait une chance de s'y voir", () => {
    // Un contrôle qui ne parcourt plus rien passe au vert sans rien tenir.
    const total = toutesLesFiches.reduce((n, f) => n + (f.parametres?.length ?? 0), 0);
    expect(total).toBeGreaterThan(2000);
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
