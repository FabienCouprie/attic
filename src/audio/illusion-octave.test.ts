// audio/illusion-octave.test.ts — Le stimulus envoie-t-il vraiment autre chose que ce qu'on entend ?
//
// CE QUE CE FICHIER DOIT PROUVER. L'illusion ne tient qu'à une chose : que les deux oreilles
// reçoivent un son EN PERMANENCE, et jamais le même. Un stimulus où une oreille se tairait pendant
// que l'autre sonne ne serait qu'une alternance, entendue pour ce qu'elle est, et personne ne s'en
// apercevrait — le percept serait le bon.
//
// LE DERNIER GROUPE EST CELUI QUI DONNE SA PORTÉE AU RESTE. Le modèle à deux voies place la hauteur
// d'après une oreille et le côté d'après l'autre ; il en sort, un pas sur deux, une hauteur entendue
// du côté qui ne l'a jamais reçue. C'est cela qu'il faut garder, et non le seul fait que deux sons
// alternent.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  echantillonsDichotiques, pasDeLaSequence, perceptsDuModele,
} from "./illusion-octave";

const SR = 16000;
const PLAN = { frequence: 400, ecart: 12, alternances: 6, aiguADroiteDabord: true };
const RENDU = { dureeDunTon: 0.25, fondu: 0.005, niveau: 1, sampleRate: SR };

/** L'énergie d'une tranche de signal à une fréquence donnée, par Goertzel. */
function energieA(x: Float32Array, hz: number, debut: number, fin: number): number {
  const w = (2 * Math.PI * hz) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = debut; i < fin; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}

/** Le cœur d'un pas, fondus écartés : c'est là que la fréquence du pas se mesure proprement. */
function coeurDuPas(k: number): [number, number] {
  const parPas = Math.round(RENDU.dureeDunTon * SR);
  return [k * parPas + Math.round(parPas * 0.1), k * parPas + Math.round(parPas * 0.9)];
}

/** La fréquence qui domine un canal pendant un pas, choisie entre les deux envoyées. */
function dominanteDuPas(x: Float32Array, k: number): number {
  const [a, b] = coeurDuPas(k);
  return energieA(x, 800, a, b) > energieA(x, 400, a, b) ? 800 : 400;
}

const rendu = (plan = PLAN, rend = RENDU) => echantillonsDichotiques(pasDeLaSequence(plan), rend);

describe("ce qui part vers les deux oreilles", () => {
  it("LES DEUX EN REÇOIVENT UN À CHAQUE PAS, et jamais le même", () => {
    // LA CONDITION DE L'ILLUSION, et elle se vérifie sur le plan comme sur le signal : si une oreille
    // se taisait à son tour, il n'y aurait plus qu'une alternance, entendue pour ce qu'elle est.
    const pas = pasDeLaSequence(PLAN);
    for (const p of pas) {
      expect(p.gauche, `pas ${p.rang}`).toBeGreaterThan(0);
      expect(p.droite, `pas ${p.rang}`).toBeGreaterThan(0);
      expect(p.gauche, `pas ${p.rang}`).not.toBe(p.droite);
    }

    const { gauche, droite } = rendu();
    for (let k = 0; k < pas.length; k++) {
      const [a, b] = coeurDuPas(k);
      const creteG = Math.max(...Array.from(gauche.subarray(a, b), Math.abs));
      const creteD = Math.max(...Array.from(droite.subarray(a, b), Math.abs));
      expect(creteG, `pas ${k} à gauche`).toBeGreaterThan(0.5);
      expect(creteD, `pas ${k} à droite`).toBeGreaterThan(0.5);
      expect(dominanteDuPas(gauche, k), `pas ${k}`).not.toBe(dominanteDuPas(droite, k));
    }
  });

  it("ET L'OREILLE QUI TIENT L'AIGU CHANGE À CHAQUE PAS", () => {
    const { gauche, droite } = rendu();
    const cotes = Array.from({ length: PLAN.alternances }, (_, k) =>
      dominanteDuPas(droite, k) === 800 ? "droite" : "gauche");
    expect(cotes).toEqual(["droite", "gauche", "droite", "gauche", "droite", "gauche"]);
    // Et le canal gauche dit exactement l'inverse, pas après pas.
    for (let k = 0; k < PLAN.alternances; k++) {
      expect(dominanteDuPas(gauche, k), `pas ${k}`).toBe(cotes[k] === "droite" ? 400 : 800);
    }
  });

  it("CHAQUE CANAL PRIS SEUL ALTERNE GRAVE ET AIGU, ce qu'aucun auditeur ne rapporte", () => {
    // Une seule oreillette suffirait à entendre l'alternance des deux hauteurs. Les deux ensemble la
    // font disparaître : c'est l'écart entre ce qui est envoyé et ce qui est entendu.
    const { gauche } = rendu();
    const suite = Array.from({ length: PLAN.alternances }, (_, k) => dominanteDuPas(gauche, k));
    expect(suite).toEqual([400, 800, 400, 800, 400, 800]);
  });

  it("L'ÉCART VAUT L'OCTAVE, et un autre écart se retrouve dans le signal", () => {
    expect(pasDeLaSequence(PLAN)[0].droite / pasDeLaSequence(PLAN)[0].gauche).toBeCloseTo(2, 9);
    // À la quinte, les deux sons ne fusionnent plus : le réglage a donc bien un effet, et la notice
    // le dit.
    const quinte = pasDeLaSequence({ ...PLAN, ecart: 7 });
    expect(quinte[0].droite / quinte[0].gauche).toBeCloseTo(Math.pow(2, 7 / 12), 9);
    const { droite } = rendu({ ...PLAN, ecart: 7 });
    const [a, b] = coeurDuPas(0);
    expect(energieA(droite, 400 * Math.pow(2, 7 / 12), a, b))
      .toBeGreaterThan(energieA(droite, 800, a, b) * 100);
  });

  it("ÉCHANGER LES CANAUX LES ÉCHANGE EXACTEMENT, ce qui est l'épreuve de la latéralité", () => {
    // Deutsch fait retourner le casque : si le percept suivait la place d'un son dans la suite, il
    // s'inverserait ; s'il suit l'oreille, il ne bouge pas. Le réglage doit donc rendre le miroir
    // exact du signal, sans quoi l'épreuve ne prouverait rien.
    const droit = rendu();
    const inverse = rendu({ ...PLAN, aiguADroiteDabord: false });
    for (let i = 0; i < droit.gauche.length; i++) {
      expect(inverse.gauche[i]).toBeCloseTo(droit.droite[i], 6);
      expect(inverse.droite[i]).toBeCloseTo(droit.gauche[i], 6);
    }
  });

  it("LE FONDU RAMÈNE LE RACCORD AU PAS DE LA MATIÈRE, là où sans lui c'est un clic", () => {
    // LA FRÉQUENCE DE CE CAS N'EST PAS CELLE DES AUTRES, ET C'EST VOULU. À quatre cents hertz et
    // deux cent cinquante millisecondes, un pas contient exactement cent cycles : le raccord tombe
    // sur un passage à zéro et ne saute pas, même sans fondu. Le réglage par défaut est donc le cas
    // le plus favorable, et un cas bâti sur lui ne prouverait rien. Quatre cent trente-trois hertz
    // ne tombe pas juste, et c'est ce que rencontre un auditeur qui touche au réglage.
    const plan = { ...PLAN, frequence: 433 };
    const parPas = Math.round(RENDU.dureeDunTon * SR);
    const sautAuRaccord = (x: Float32Array) => {
      let m = 0;
      for (let k = 1; k < plan.alternances; k++) {
        const i = k * parPas;
        for (let j = i - 2; j < i + 2; j++) m = Math.max(m, Math.abs(x[j + 1] - x[j]));
      }
      return m;
    };
    const pasDeLaMatiere = (x: Float32Array) => {
      const [a, b] = coeurDuPas(0);
      let m = 0;
      for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i + 1] - x[i]));
      return m;
    };
    const sans = rendu(plan, { ...RENDU, fondu: 0 });
    const avec = rendu(plan);
    // MESURÉ : sans fondu, le raccord saute de 1,3336 quand la matière elle-même ne fait que 0,3384
    // d'un échantillon au suivant ; avec cinq millisecondes de fondu, il tombe à 0,0014. Au réglage
    // aligné de quatre cents hertz, il valait déjà 0,3090, c'est-à-dire le pas de la matière.
    expect(sautAuRaccord(sans.droite)).toBeGreaterThan(pasDeLaMatiere(sans.droite) * 2);
    expect(sautAuRaccord(avec.droite)).toBeLessThan(pasDeLaMatiere(avec.droite));
  });
});

describe("le repli en mono", () => {
  it("EFFACE LE STIMULUS ENTIER, ce qui est la raison du casque", () => {
    // LA PREUVE LA PLUS FORTE DU FICHIER, parce qu'elle est exacte : la somme des deux canaux ne
    // dépend plus du tout de l'oreille qui tient l'aigu. Sur un haut-parleur les deux canaux se
    // mélangent dans la pièce, et il ne reste qu'un accord d'octave immobile.
    const droit = rendu();
    const inverse = rendu({ ...PLAN, aiguADroiteDabord: false });
    for (let i = 0; i < droit.gauche.length; i++) {
      expect(droit.gauche[i] + droit.droite[i]).toBeCloseTo(inverse.gauche[i] + inverse.droite[i], 6);
    }
  });
});

describe("le modèle à deux voies", () => {
  it("REND LE PERCEPT CLASSIQUE POUR UNE DOMINANCE DROITE : l'aigu à droite, le grave à gauche", () => {
    const percus = perceptsDuModele(pasDeLaSequence(PLAN), "droite");
    expect(percus.map((p) => `${p.hauteur} ${p.cote}`))
      .toEqual(["800 droite", "400 gauche", "800 droite", "400 gauche", "800 droite", "400 gauche"]);
  });

  it("ET SON IMAGE POUR UNE DOMINANCE GAUCHE, ce qui est la seule différence entre deux auditeurs", () => {
    const percus = perceptsDuModele(pasDeLaSequence(PLAN), "gauche");
    expect(percus.map((p) => `${p.hauteur} ${p.cote}`))
      .toEqual(["400 droite", "800 gauche", "400 droite", "800 gauche", "400 droite", "800 gauche"]);
  });

  it("UN PAS SUR DEUX, LA HAUTEUR S'ENTEND DU CÔTÉ QUI NE L'A PAS REÇUE", () => {
    // LE CŒUR DU SUJET, et la seule chose qu'il faille vraiment garder. Les deux décisions du modèle
    // ne regardent pas la même oreille : il en sort un son placé là où il n'a jamais été envoyé, et
    // c'est ce que rapportent les auditeurs.
    const pas = pasDeLaSequence(PLAN);
    for (const dominante of ["gauche", "droite"] as const) {
      const percus = perceptsDuModele(pas, dominante);
      const deplaces = percus.filter((p) =>
        (p.cote === "droite" ? pas[p.rang].droite : pas[p.rang].gauche) !== p.hauteur);
      expect(deplaces.length, `dominance ${dominante}`).toBe(pas.length / 2);
    }
  });
});
