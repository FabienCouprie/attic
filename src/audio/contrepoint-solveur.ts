// audio/contrepoint-solveur.ts — Écrire un contrepoint, au lieu de le corriger.
//
// LE VÉRIFICATEUR SERT DE RÈGLE AU SOLVEUR, ET C'EST LE POINT. `audio/contrepoint.ts` porte les
// règles de Fux, écrites et éprouvées ; les recopier sous une autre forme pour guider la recherche
// donnerait deux jeux de règles qui divergeraient au premier ajout, et un générateur dont le
// correcteur refuserait la production. Le solveur appelle donc le vérificateur lui-même, sur le
// préfixe déjà posé.
//
// CE QUE COÛTE CE CHOIX, ET POURQUOI IL EST PAYÉ. Vérifier un préfixe entier à chaque nœud est en
// n² sur la longueur, là où des règles incrémentales seraient en n. Sur un cantus firmus de dix à
// vingt notes, ce qui est la taille de l'exercice, la différence ne se voit pas ; sur la garantie,
// elle est totale.
//
// LES RÈGLES DE FIN NE S'APPLIQUENT QU'À LA FIN. Le vérificateur traite la dernière note qu'on lui
// donne comme la dernière de la pièce : sur un préfixe, il exigerait une cadence à chaque pas et
// rien ne passerait. Elles sont donc écartées tant que la ligne n'est pas complète, et exigées
// quand elle l'est.

import { creerAleatoire } from "../core";
import { verifier, type Infraction } from "./contrepoint";
import {
  domaineHauteurs, ecartMaximal, repetitionMaximale, resoudre,
  type Contrainte, type Resolution,
} from "./contraintes";

/** Les règles que le vérificateur ne peut juger qu'une fois la pièce finie. */
const REGLES_DE_FIN = new Set(["fin", "fin.quinte", "cadence"]);

export interface OptionsContrepoint {
  /** L'étendue dans laquelle la voix ajoutée se meut. */
  grave?: number;
  aigu?: number;
  /** Les degrés permis, en classes de hauteurs. Vide : les douze. */
  degres?: readonly number[];
  /** Le saut mélodique le plus grand, en demi-tons. */
  ecartMax?: number;
  /** La voix ajoutée est-elle au-dessus du cantus firmus ? */
  auDessus?: boolean;
  /** Combien de contrepoints rendre. */
  combien?: number;
  budget?: number;
  graine?: number;
}

export interface ContrepointTrouve extends Resolution {
  /** Les lignes trouvées, dans l'ordre du meilleur au moins bon n'ayant pas lieu d'être ici. */
  lignes: number[][];
  /** Les avis que le vérificateur rend sur la première ligne : ce qui n'est pas interdit. */
  avis: Infraction[];
}

/**
 * Cherche une voix qui fasse un contrepoint de première espèce avec le cantus firmus.
 *
 * LES INFRACTIONS QUI COMPTENT SONT LES ERREURS, NON LES AVIS. Fux distingue ce qui est interdit de
 * ce qui est déconseillé, et le vérificateur garde la distinction. Chercher une ligne sans aucun
 * avis reviendrait à refuser des contrepoints que Fux accepte ; les avis sont donc rendus à part,
 * pour qu'on les lise sans qu'ils aient barré la route.
 */
export function chercherContrepoint(
  cantus: readonly number[], o: OptionsContrepoint = {},
): ContrepointTrouve {
  const n = cantus.length;
  if (n === 0) {
    return { lignes: [], avis: [], solutions: [], noeuds: 0, abandonne: false, meilleurPartiel: [], regleBloquante: "" };
  }

  const auDessus = o.auDessus !== false;
  const grave = o.grave ?? (auDessus ? Math.max(...cantus) : Math.min(...cantus) - 24);
  const aigu = o.aigu ?? (auDessus ? Math.max(...cantus) + 24 : Math.min(...cantus));
  const domaine = domaineHauteurs(grave, aigu, o.degres);

  // LA RÈGLE DE FUX EST UNE SEULE CONTRAINTE, celle qui appelle le vérificateur. Les deux autres
  // sont des bornes ordinaires, mises DEVANT elle parce qu'elles coûtent presque rien : une ligne
  // recalée pour un saut de deux octaves n'a pas besoin qu'on lui cherche des quintes parallèles.
  const regleDeFux: Contrainte = {
    nom: "fux",
    admet: (valeurs, i, complet) => {
      const partie = valeurs.slice(0, i + 1);
      const cf = cantus.slice(0, i + 1);
      const infractions = verifier(
        auDessus ? cf : partie, auDessus ? partie : cf, { unissonsInterieurs: false },
      );
      return !infractions.some(
        (x) => x.gravite === "erreur" && (complet || !REGLES_DE_FIN.has(x.regle)),
      );
    },
  };

  const contraintes: Contrainte[] = [
    ecartMaximal(o.ecartMax ?? 9),
    repetitionMaximale(2),
    regleDeFux,
  ];

  const res = resoudre(new Array(n).fill(domaine), contraintes, {
    budget: o.budget ?? 200000,
    graine: o.graine ?? 1,
    combien: o.combien ?? 1,
  });

  const lignes = res.solutions;
  const avis = lignes.length > 0
    ? verifier(auDessus ? cantus.slice() : lignes[0], auDessus ? lignes[0] : cantus.slice())
      .filter((x) => x.gravite === "avis")
    : [];
  return { ...res, lignes, avis };
}

/**
 * Un cantus firmus, pour qui veut essayer sans en avoir un sous la main.
 *
 * IL N'EST PAS TIRÉ AU HASARD, mais construit sur les règles d'un cantus : il commence et finit sur
 * la tonique, se meut par degrés conjoints sauf un saut ou deux, atteint un sommet unique, et
 * descend par degré vers sa fin. Un tirage uniforme donnerait une suite que rien ne saurait
 * harmoniser, et l'on croirait le solveur en cause.
 */
export function cantusFirmus(tonique = 60, combien = 8, graine = 1): number[] {
  const hasard = creerAleatoire(graine);
  const gamme = [0, 2, 4, 5, 7, 9, 11];
  const degre = (d: number) => tonique + 12 * Math.floor(d / 7) + gamme[((d % 7) + 7) % 7];
  const n = Math.max(4, Math.min(16, Math.round(combien)));

  // Le sommet est placé vers le milieu, entre la quarte et l'octave au-dessus de la tonique.
  const sommet = 3 + Math.floor(hasard() * 4);
  const place = Math.max(1, Math.min(n - 3, Math.floor(n / 2) + (hasard() < 0.5 ? 0 : 1)));

  // L'avant-dernière est la sensible ou la sus-tonique ; elle est VISÉE et non imposée après coup.
  // L'imposer à la fin produisait un saut de quinte ou de triton depuis la note d'avant, ce qu'un
  // cantus ne fait jamais et ce que le commentaire de cette fonction promettait déjà d'éviter.
  const penultieme = hasard() < 0.5 ? -1 : 1;

  /**
   * Mène de `depart` à `arrivee` en exactement `pas` degrés, sans jamais sauter plus d'une tierce.
   *
   * QUAND IL RESTE PLUS DE PAS QUE DE CHEMIN, on brode par une note voisine, et seulement s'il
   * reste de quoi revenir : sans cette réserve, la broderie éloignerait du but au dernier moment et
   * il faudrait un saut pour rattraper.
   */
  const mener = (depart: number, arrivee: number, pas: number): number[] => {
    const sortie: number[] = [];
    let ici = depart;
    for (let k = 0; k < pas; k++) {
      const reste = pas - k;
      const ecart = arrivee - ici;
      let d: number;
      if (Math.abs(ecart) >= reste) d = Math.sign(ecart) * Math.min(2, Math.ceil(Math.abs(ecart) / reste));
      else if (reste - Math.abs(ecart) >= 2 && hasard() < 0.4) d = ecart === 0 ? (hasard() < 0.5 ? 1 : -1) : -Math.sign(ecart);
      else d = Math.sign(ecart);
      ici += d;
      sortie.push(ici);
    }
    return sortie;
  };

  const degres = [
    0,
    ...mener(0, sommet, place),
    ...mener(sommet, penultieme, n - 2 - place),
    0,
  ];
  return degres.map(degre);
}
