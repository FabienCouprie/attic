// audio/criteres-schaefferiens.test.ts — Trois critères, et un témoin NÉGATIF par classe.
//
// CE FICHIER EST ÉCRIT AVANT LE MODULE, et pour une raison que le lot précédent a payée. Le nœud du
// grain, livré trois jours plus tôt, portait cinq défauts sans qu'aucun de ses cas ne bouge : ses
// trois sons d'essai étaient tous les trois des grains. UN TÉMOIN POSITIF PROUVE QU'ON RECONNAÎT CE
// QU'ON CHERCHE ; IL NE DIT RIEN DE CE QU'ON RANGE À TORT. Les cinq défauts sont tous sortis de sons
// qu'aucun cas ne présentait : une tenue lisse, un sinus pur, une note harmonique grave.
//
// D'OÙ LA RÈGLE QUE CE FICHIER SUIT : pour chaque classe qu'un critère sait nommer, un cas lui
// présente un son qui N'EN EST PAS. Un classeur de masse doit voir un bruit, un classeur de forme
// dynamique doit voir une tenue plate, un classeur d'allure doit voir un son qui n'ondule pas.
//
// ET LES CAS DE CONTRÔLE SONT CE QUI COMPTE. Pour chacun des trois critères, ils montrent qu'aucune
// grandeur unique ne donne le classement, donc que le descripteur n'est pas une mesure déguisée.
import { describe, expect, it } from "vitest";
import {
  ALLURE_MAX, ALLURE_MIN, criteresSchaefferiens, dynamique, masse, allure,
} from "./criteres-schaefferiens";
import { creerAleatoire } from "../core/hasard";

const SR = 16000;
const DUREE = 2;

/** Tous les sons d'essai sortent au même niveau efficace : rien ne se décide sur un volume. */
function normaliser(x: Float32Array, eff = 0.2): Float32Array {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const v = Math.sqrt(s / Math.max(1, x.length));
  return Float32Array.from(x, (u) => (v > 1e-12 ? (u * eff) / v : 0));
}

const echantillons = (duree = DUREE) => Math.round(duree * SR);

/** Le même son, bâti à une cadence quelconque : c'est ce qui éprouve l'indépendance à la cadence. */
const aCadence = (sr: number, f: (t: number) => number, duree = DUREE) =>
  normaliser(Float32Array.from({ length: Math.round(duree * sr) }, (_, i) => f(i / sr)));

/** Un bruit à bande, à une cadence quelconque. */
function bandeACadence(sr: number, centre: number, largeur: number, graine = 24691): Float32Array {
  const n = Math.round(DUREE * sr);
  const x = new Float32Array(n);
  const tirer = creerAleatoire(graine);
  let y1 = 0, y2 = 0, z1 = 0, z2 = 0;
  const r = Math.exp((-Math.PI * largeur) / sr);
  const c = 2 * r * Math.cos((2 * Math.PI * centre) / sr);
  for (let i = 0; i < n; i++) {
    const u = tirer() * 2 - 1 + c * y1 - r * r * y2;
    y2 = y1; y1 = u;
    const w = u + c * z1 - r * r * z2;
    z2 = z1; z1 = w;
    x[i] = w;
  }
  return normaliser(x);
}

/** Un bruit blanc, à une cadence quelconque. */
function blancACadence(sr: number, graine = 97531): Float32Array {
  const tirer = creerAleatoire(graine);
  return normaliser(Float32Array.from({ length: Math.round(DUREE * sr) }, () => tirer() * 2 - 1));
}
const bati = (f: (t: number) => number, duree = DUREE) =>
  normaliser(Float32Array.from({ length: echantillons(duree) }, (_, i) => f(i / SR)));

// ── Les sons d'essai de la MASSE, un par degré de l'échelle du Traité ──

/** Un son pur : une seule partielle, le premier degré de l'échelle des masses. */
const sonPur = (f = 440) => bati((t) => Math.sin(2 * Math.PI * f * t));

/** Un son tonique : une série harmonique, donc une hauteur franche et un timbre. */
const tonique = (f = 220, rangs = 6) => bati((t) => {
  let v = 0;
  for (let h = 1; h <= rangs; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
  return v;
});

/** Un groupe tonique : deux séries sans rapport harmonique, donc deux hauteurs distinctes. */
const groupeTonique = () => bati((t) => {
  let v = 0;
  for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * 220 * h * t) / h;
  for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * 311 * h * t) / h;
  return v;
});

/** Un bruit à bande étroite : une masse sans hauteur franche, mais qui n'occupe pas tout le champ. */
function groupeNodal(centre = 1200, largeur = 120, graine = 24691): Float32Array {
  const n = echantillons();
  const x = new Float32Array(n);
  const tirer = creerAleatoire(graine);
  // Deux cellules résonantes en cascade sur du bruit : la bande est bornée des deux côtés.
  let y1 = 0, y2 = 0, z1 = 0, z2 = 0;
  const r = Math.exp((-Math.PI * largeur) / SR);
  const c = 2 * r * Math.cos((2 * Math.PI * centre) / SR);
  for (let i = 0; i < n; i++) {
    const blanc = tirer() * 2 - 1;
    const u = blanc + c * y1 - r * r * y2;
    y2 = y1; y1 = u;
    const w = u + c * z1 - r * r * z2;
    z2 = z1; z1 = w;
    x[i] = w;
  }
  return normaliser(x);
}

/**
 * Un bruit blanc : tout le champ des hauteurs occupé, le dernier degré de l'échelle.
 *
 * LE GÉNÉRATEUR EST CELUI DU DÉPÔT, ET IL A FALLU LE RELEVER POUR LE COMPRENDRE. Une première
 * version de ces témoins tirait avec un générateur congruentiel écrit sur place, dont les BITS DE
 * POIDS FAIBLE sont de mauvaise qualité : ils y ajoutaient de vraies raies à 4000 et 8000 Hz, c'est-
 * à-dire aux périodes de deux et quatre échantillons. Le critère les trouvait, et il avait raison :
 * sept bruits blancs sur douze portaient DEUX hauteurs franches, et le motif était déterministe,
 * les quatre sons d'une même graine donnant exactement le même compte. C'était le témoin qui était
 * faux, non le module. Voir `core/hasard.ts`, qui existe pour cela.
 */
function bruitBlanc(graine = 97531): Float32Array {
  const n = echantillons();
  const tirer = creerAleatoire(graine);
  return normaliser(Float32Array.from({ length: n }, () => tirer() * 2 - 1));
}

/** Une masse variée : la même série harmonique, dont la hauteur monte d'une octave et demie. */
const masseVariee = () => bati((t) => {
  const f = 200 * Math.pow(2, (1.5 * t) / DUREE);
  // La phase est l'intégrale de la fréquence, sans quoi le glissando serait faux.
  const phase = (200 * DUREE) / (1.5 * Math.LN2) * (Math.pow(2, (1.5 * t) / DUREE) - 1);
  let v = 0;
  for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * h * phase) / h;
  return v * (f > 0 ? 1 : 1);
});

// ── Les sons d'essai de la DYNAMIQUE, un par forme du Traité ──

const porteuse = (t: number) => {
  let v = 0;
  for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * 440 * h * t) / h;
  return v;
};

/** Une impulsion : une attaque et rien derrière, moins de cinquante millisecondes en tout. */
const impulsion = () => bati((t) => (t < 0.05 ? Math.exp(-90 * t) * porteuse(t) : 0));

/** Une tenue : un plateau, qui ne monte ni ne descend. */
const tenue = () => bati((t) => {
  const bord = 0.02;
  const g = t < bord ? t / bord : t > DUREE - bord ? (DUREE - t) / bord : 1;
  return g * porteuse(t);
});

/** Un crescendo : le niveau monte d'un bout à l'autre. */
const crescendo = () => bati((t) => (t / DUREE) * porteuse(t));

/** Un decrescendo : une résonance, qui décroît du début à la fin. */
const decrescendo = () => bati((t) => Math.exp((-3 * t) / DUREE) * porteuse(t));

/** Une forme en delta : le niveau monte puis redescend, son sommet au milieu. */
const delta = () => bati((t) => Math.sin((Math.PI * t) / DUREE) * porteuse(t));

// ── Les sons d'essai de l'ALLURE, un par espèce du Traité ──

/** Une allure mécanique : un trémolo dont la période est immuable. */
const mecanique = (fm = 5, p = 0.3) => bati((t) =>
  (1 - p + p * (0.5 + 0.5 * Math.sin(2 * Math.PI * fm * t))) * porteuse(t), 4);

/**
 * Une allure vivante : le même trémolo, dont la CADENCE s'écarte de `ecart`.
 *
 * Le vibrato d'un instrumentiste n'est jamais à la période de la machine : sa cadence varie
 * lentement de quelques pour cent. Six pour cent est la valeur retenue, au milieu de ce que les
 * relevés de vibrato chanté rapportent.
 */
function vivante(fm = 5, p = 0.3, ecart = 0.06): Float32Array {
  const n = echantillons(4);
  const x = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (fm * (1 + ecart * Math.sin(2 * Math.PI * 0.6 * t))) / SR;
    x[i] = (1 - p + p * (0.5 + 0.5 * Math.sin(2 * Math.PI * phase))) * porteuse(t);
  }
  return normaliser(x);
}

/**
 * Une allure désordonnée : chaque période de l'ondulation est tirée au sort.
 *
 * C'est la définition de l'espèce chez Schaeffer, une ondulation dont le pas ne se prévoit pas, et
 * c'est ce qu'il faut écrire ici : UN BRUIT LENT NE SUFFIT PAS. Un premier témoin faisait errer le
 * niveau par un bruit passe-bas, et il ressortait MÉCANIQUE, à 0,017 d'écart : un bruit très lissé
 * a des sommets fort réguliers, et sa profondeur restait d'ailleurs sous le seuil de l'ondulation.
 */
function desordonnee(fm = 5, p = 0.3, graine = 31337): Float32Array {
  const n = echantillons(4);
  const x = new Float32Array(n);
  const tirer = creerAleatoire(graine);
  let i = 0;
  while (i < n) {
    const periode = Math.max(2, Math.round((SR / fm) * (0.5 + 1.5 * tirer())));
    for (let k = 0; k < periode && i < n; k++, i++) {
      const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / periode);
      x[i] = (1 - p + p * u) * porteuse(i / SR);
    }
  }
  return normaliser(x);
}

// ── La masse ──

describe("la masse", () => {
  it("LE TÉMOIN : LES CINQ DEGRÉS DE L'ÉCHELLE SE RANGENT EN CINQ PLACES DISTINCTES", () => {
    const vus = {
      pur: masse(sonPur(), SR).espece,
      tonique: masse(tonique(), SR).espece,
      groupe: masse(groupeTonique(), SR).espece,
      nodal: masse(groupeNodal(), SR).espece,
      blanc: masse(bruitBlanc(), SR).espece,
    };
    const dit = JSON.stringify(vus);
    expect(vus.pur, dit).toBe("pur");
    expect(vus.tonique, dit).toBe("tonique");
    expect(vus.groupe, dit).toBe("groupe");
    expect(vus.nodal, dit).toBe("nodal");
    expect(vus.blanc, dit).toBe("blanc");
  });

  it("LE TÉMOIN NÉGATIF : UN BRUIT N'EST PAS UN GROUPE TONIQUE, et un son pur n'est pas tonique", () => {
    // C'est la faute que le lot du grain a payée : ses trois témoins étaient tous des grains, donc
    // aucun ne pouvait montrer qu'il rangeait en grain ce qui n'en était pas un.
    for (const [nom, x] of [["bruit blanc", bruitBlanc()], ["groupe nodal", groupeNodal()]] as [string, Float32Array][]) {
      const m = masse(x, SR);
      expect(["pur", "tonique", "groupe"], `${nom} : ${m.espece}`).not.toContain(m.espece);
    }
    // ET UN SON PUR N'EST PAS UN SON TONIQUE : l'échelle du Traité les sépare, le premier degré
    // n'ayant aucun timbre harmonique puisqu'il n'a qu'une partielle.
    expect(masse(sonPur(), SR).espece).not.toBe("tonique");
    expect(masse(tonique(), SR).espece).not.toBe("pur");
  });

  it("LE TÉMOIN NÉGATIF : UNE BANDE ÉTROITE N'EST PAS UN SON PUR, bien qu'elle n'ait qu'une raie", () => {
    // UNE SEULE RAIE NE SUFFIT PAS À DIRE « PUR » : un bruit de bande étroite survit au moyennage
    // des trames comme une raie, donc ne porte qu'une hauteur, et il ressortait « pur ». Un son pur
    // occupe un POINT du champ, une bande étroite un intervalle, et c'est l'occupation qui le dit.
    const etroite = groupeNodal(1200, 60);
    const m = masse(etroite, SR);
    const p = masse(sonPur(1200), SR);
    const dit = `bande de 60 Hz : ${m.espece}, ${m.hauteurs} hauteur(s), occupation ${m.occupation.toFixed(4)} ;`
      + ` sinus : occupation ${p.occupation.toFixed(4)}`;
    expect(m.espece, dit).not.toBe("pur");
    expect(p.espece, dit).toBe("pur");
    expect(m.occupation / p.occupation, dit).toBeGreaterThan(3);
  });

  it("AUCUN BRUIT NE PORTE DE FAUSSE HAUTEUR, sur douze graines et quatre largeurs de bande", () => {
    // UNE HAUTEUR TROUVÉE DANS DU BRUIT EST LA FAUTE PROPRE À CE CRITÈRE : elle ferait passer un
    // bruit pour un groupe tonique, c'est-à-dire la remonter de deux degrés sur l'échelle. Et elle
    // ne se voit pas sur une seule graine, le bruit étant par nature différent d'un tirage à
    // l'autre. Ce cas est celui qui a tranché entre une trame et huit trames moyennées : sur ces
    // mêmes douze graines, le moyennage donnait une fausse hauteur et la trame unique aucune.
    let fautes: string[] = [];
    for (const graine of [97531, 24691, 13579, 31337, 777, 4242, 11111, 555555, 8080, 1234567, 42, 999331]) {
      const essais: [string, Float32Array][] = [
        ["blanc", bruitBlanc(graine)],
        ["bande 300", groupeNodal(1200, 300, graine)],
        ["bande 900", groupeNodal(600, 900, graine)],
        ["bande 1500", groupeNodal(3000, 1500, graine)],
      ];
      for (const [nom, x] of essais) {
        const m = masse(x, SR);
        if (m.hauteurs !== 0) fautes.push(`${nom} graine ${graine} : ${m.hauteurs} hauteur(s), ${m.espece}`);
      }
    }
    expect(fautes, "ces bruits portent une hauteur franche").toEqual([]);
  });

  it("LE CONTRÔLE : L'OCCUPATION DU CHAMP SEULE CONFOND LE SON PUR ET LE GROUPE TONIQUE", () => {
    // Tous deux occupent peu de place dans le champ des hauteurs, l'un parce qu'il n'a qu'une
    // partielle, l'autre parce que ses deux séries sont franches. Un seul axe les met ensemble.
    const p = masse(sonPur(), SR);
    const g = masse(groupeTonique(), SR);
    const b = masse(bruitBlanc(), SR);
    const dit = `occupation : pur ${p.occupation.toFixed(3)}, groupe ${g.occupation.toFixed(3)}, blanc ${b.occupation.toFixed(3)}`;
    expect(Math.abs(p.occupation - g.occupation), dit).toBeLessThan(0.25);
    expect(b.occupation, dit).toBeGreaterThan(p.occupation + 0.4);
  });

  it("LE CONTRÔLE : LE COMPTE DE HAUTEURS SEUL CONFOND LE GROUPE NODAL ET LE BRUIT BLANC", () => {
    // Ni l'un ni l'autre ne porte de hauteur franche : cet axe les met au même endroit, et c'est
    // l'occupation du champ qui les sépare. Il faut donc bien les deux.
    const n = masse(groupeNodal(), SR);
    const b = masse(bruitBlanc(), SR);
    const dit = `hauteurs : nodal ${n.hauteurs}, blanc ${b.hauteurs}`;
    expect(n.hauteurs, dit).toBe(b.hauteurs);
    expect(b.occupation - n.occupation, dit).toBeGreaterThan(0.2);
  });

  it("UNE MASSE QUI BOUGE EST DÉCLARÉE VARIÉE, et une masse tenue ne l'est pas", () => {
    const v = masse(masseVariee(), SR);
    const f = masse(tonique(), SR);
    expect(v.variee, `glissando : ${v.espece}, étendue ${v.etendueDemiTons.toFixed(2)} demi-tons`).toBe(true);
    expect(f.variee, `tenue : ${f.espece}, étendue ${f.etendueDemiTons.toFixed(2)} demi-tons`).toBe(false);
    // L'ÉTENDUE EST PRISE SUR LES DÉCILES, donc elle rend QUATRE CINQUIÈMES de l'étendue écrite, un
    // dixième étant écarté à chaque bout. Sur un glissando linéaire en octaves, dix-huit demi-tons
    // écrits ressortent à 14,4, et c'est le rapport qui est mis sous contrat plutôt que le nombre :
    // les extrêmes seraient pris par un seul relevé aberrant.
    expect(v.etendueDemiTons / 18, `relevé ${v.etendueDemiTons.toFixed(2)} sur 18 écrits`)
      .toBeCloseTo(0.8, 1);
  });
});

describe("les critères ne dépendent pas de la cadence du son", () => {
  it("LES CINQ MASSES SE RANGENT PAREIL DE HUIT À 192 kHz", () => {
    // CE CAS MANQUAIT, ET DEUX DÉFAUTS Y VIVAIENT, que seul le passage dans l'application a
    // montrés : tous les autres cas tournent à 16 kHz, de sorte qu'aucun ne pouvait voir une mesure
    // qui dépend de la cadence.
    //
    // LE PREMIER ÉTAIT L'OCCUPATION DU CHAMP, rapportée au demi de la cadence : la même bande de
    // bruit en occupait 0,0075 à 16 kHz et 0,0027 à 44,1, soit presque trois fois moins, et un
    // bruit à bande étroite rangé « nodal » ressortait « pur ». Le champ est maintenant borné en
    // hertz.
    //
    // LE SECOND ÉTAIT LE TEST HARMONIQUE, mené sur les rangs du spectre : à 44,1 kHz le pas vaut
    // 21,5 Hz, de sorte qu'une série de 330, 660 et 990 Hz tombe sur les rangs 15, 31 et 46, dont
    // les rapports valent 2,067 et 3,067. La série n'était plus reconnue et un son TONIQUE
    // ressortait en GROUPE. Les fréquences sont maintenant affinées entre trois points.
    const cadences = [8000, 16000, 22050, 32000, 44100, 48000, 96000, 192000];
    const attendus: [string, (sr: number) => Float32Array, string][] = [
      ["son pur", (sr) => aCadence(sr, (t) => Math.sin(2 * Math.PI * 440 * t)), "pur"],
      ["tonique", (sr) => aCadence(sr, (t) => {
        let v = 0;
        for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * 330 * h * t) / h;
        return v;
      }), "tonique"],
      ["groupe", (sr) => aCadence(sr, (t) => {
        let v = 0;
        for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * 220 * h * t) / h + Math.sin(2 * Math.PI * 311 * h * t) / h;
        return v;
      }), "groupe"],
      ["bande nodale", (sr) => bandeACadence(sr, 1200, 300), "nodal"],
      ["bruit blanc", (sr) => blancACadence(sr), "blanc"],
    ];
    const fautes: string[] = [];
    for (const sr of cadences) {
      for (const [nom, faire, attendu] of attendus) {
        const m = masse(faire(sr), sr);
        if (m.espece !== attendu) {
          fautes.push(`${nom} à ${sr} Hz : ${m.espece} au lieu de ${attendu}`
            + ` (${m.hauteurs} hauteur(s), occupation ${m.occupation.toFixed(4)})`);
        }
      }
    }
    expect(fautes, "ces masses changent d'espèce avec la cadence").toEqual([]);
  });

  it("ET L'OCCUPATION ELLE-MÊME NE BOUGE PAS, ce qui est plus fort que l'espèce", () => {
    // L'ESPÈCE PEUT TENIR ALORS QUE LA MESURE DÉRIVE, et c'est pourquoi ce cas porte sur le CHIFFRE.
    // Rapportée au demi de la cadence, l'occupation d'une même bande vaut 0,23 à 16 kHz et 0,077 à
    // 48, soit trois fois moins : les espèces s'en tiraient parce que les deux valeurs restent du
    // même côté du seuil, mais le chiffre affiché à l'écran, lui, est faux. Le champ est donc borné
    // en HERTZ, et la mesure se tient alors dans un rapport de 1,2 sur six cadences.
    for (const [nom, faire] of [
      ["bande de 300 Hz", (sr: number) => bandeACadence(sr, 1200, 300)],
      ["bande de 120 Hz", (sr: number) => bandeACadence(sr, 1200, 120)],
      ["bruit blanc", (sr: number) => blancACadence(sr)],
    ] as [string, (sr: number) => Float32Array][]) {
      const vues = [8000, 16000, 22050, 32000, 44100, 48000].map((sr) => masse(faire(sr), sr).occupation);
      const bas = Math.min(...vues);
      const haut = Math.max(...vues);
      const dit = `${nom} : ${vues.map((v) => v.toFixed(4)).join(" · ")}`;
      expect(haut / Math.max(1e-9, bas), dit).toBeLessThan(1.8);
    }
  });

  it("ET LA FORME DYNAMIQUE AUSSI, aux mêmes six cadences", () => {
    const fautes: string[] = [];
    for (const sr of [8000, 16000, 22050, 32000, 44100, 48000]) {
      const essais: [string, Float32Array, string][] = [
        ["impulsion", aCadence(sr, (t) => (t < 0.05 ? Math.exp(-90 * t) : 0)), "impulsion"],
        ["tenue", aCadence(sr, (t) => {
          const b = 0.02;
          return (t < b ? t / b : t > DUREE - b ? (DUREE - t) / b : 1) * Math.sin(2 * Math.PI * 440 * t);
        }), "tenue"],
        ["crescendo", aCadence(sr, (t) => (t / DUREE) * Math.sin(2 * Math.PI * 440 * t)), "crescendo"],
        ["decrescendo", aCadence(sr, (t) => Math.exp((-3 * t) / DUREE) * Math.sin(2 * Math.PI * 440 * t)), "decrescendo"],
        ["delta", aCadence(sr, (t) => Math.sin((Math.PI * t) / DUREE) * Math.sin(2 * Math.PI * 440 * t)), "delta"],
      ];
      for (const [nom, x, attendu] of essais) {
        const d = dynamique(x, sr);
        if (d.forme !== attendu) fautes.push(`${nom} à ${sr} Hz : ${d.forme} au lieu de ${attendu}`);
      }
    }
    expect(fautes, "ces formes changent avec la cadence").toEqual([]);
  });

  it("ET L'ALLURE AUSSI : une machine reste mécanique à toute cadence", () => {
    const fautes: string[] = [];
    for (const sr of [8000, 16000, 22050, 32000, 44100, 48000]) {
      const x = aCadence(sr, (t) =>
        (0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * t)) * Math.sin(2 * Math.PI * 440 * t), 4);
      const a = allure(x, sr);
      if (a.espece !== "mecanique" || Math.abs((a.debit ?? 0) - 5) > 0.6) {
        fautes.push(`${sr} Hz : ${a.espece}, débit ${a.debit?.toFixed(2)}, irrégularité ${a.irregularite.toFixed(4)}`);
      }
    }
    expect(fautes, "l'allure change avec la cadence").toEqual([]);
  });
});

// ── La dynamique, par où se lit la facture ──

describe("la dynamique", () => {
  it("LE TÉMOIN : LES CINQ FORMES SE RANGENT EN CINQ PLACES DISTINCTES", () => {
    const vus = {
      impulsion: dynamique(impulsion(), SR).forme,
      tenue: dynamique(tenue(), SR).forme,
      crescendo: dynamique(crescendo(), SR).forme,
      decrescendo: dynamique(decrescendo(), SR).forme,
      delta: dynamique(delta(), SR).forme,
    };
    const dit = JSON.stringify(vus);
    expect(vus.impulsion, dit).toBe("impulsion");
    expect(vus.tenue, dit).toBe("tenue");
    expect(vus.crescendo, dit).toBe("crescendo");
    expect(vus.decrescendo, dit).toBe("decrescendo");
    expect(vus.delta, dit).toBe("delta");
  });

  it("LE TÉMOIN NÉGATIF : UNE TENUE N'EST NI UN CRESCENDO NI UN DECRESCENDO", () => {
    // Un plateau a une pente nulle, mais le bruit de mesure lui en donne toujours une petite : sans
    // ce cas, un seuil de pente posé trop bas rangerait toute tenue en crescendo.
    const f = dynamique(tenue(), SR).forme;
    expect(["crescendo", "decrescendo", "delta", "impulsion"], `tenue rangée en ${f}`).not.toContain(f);
  });

  it("LE TÉMOIN NÉGATIF : UNE IMPULSION N'EST PAS UN DECRESCENDO, bien que les deux descendent", () => {
    // LES DEUX ONT LA MÊME PENTE : ce qui les sépare est que l'impulsion n'a pas d'entretien du
    // tout. C'est la durée au-dessus du seuil, non la pente, qui décide.
    const i = dynamique(impulsion(), SR);
    const d = dynamique(decrescendo(), SR);
    const dit = `impulsion : pente ${i.pente.toFixed(3)}, entretien ${i.entretienMs.toFixed(0)} ms ;`
      + ` decrescendo : pente ${d.pente.toFixed(3)}, entretien ${d.entretienMs.toFixed(0)} ms`;
    expect(i.pente, dit).toBeLessThan(0);
    expect(d.pente, dit).toBeLessThan(0);
    expect(i.entretienMs * 5, dit).toBeLessThan(d.entretienMs);
  });

  it("LE CONTRÔLE : LA PENTE SEULE CONFOND LA TENUE ET LA FORME EN DELTA", () => {
    // Une forme en delta monte autant qu'elle descend : sa pente d'ensemble est nulle, comme celle
    // d'une tenue. C'est la place de son sommet qui la désigne.
    const t = dynamique(tenue(), SR);
    const d = dynamique(delta(), SR);
    const dit = `pente : tenue ${t.pente.toFixed(3)}, delta ${d.pente.toFixed(3)} ;`
      + ` sommet : tenue ${t.sommet.toFixed(2)}, delta ${d.sommet.toFixed(2)}`;
    expect(Math.abs(t.pente - d.pente), dit).toBeLessThan(0.25);
    expect(d.bombement, dit).toBeGreaterThan(t.bombement + 0.1);
  });

  it("L'ATTAQUE EST RELEVÉE EN MILLISECONDES, et elle sépare le raide du doux", () => {
    const raide = dynamique(impulsion(), SR);
    const doux = dynamique(crescendo(), SR);
    const dit = `attaque : impulsion ${raide.attaqueMs.toFixed(1)} ms, crescendo ${doux.attaqueMs.toFixed(0)} ms`;
    expect(raide.attaqueMs, dit).toBeLessThan(20);
    expect(doux.attaqueMs, dit).toBeGreaterThan(500);
  });
});

// ── L'allure ──

describe("l'allure", () => {
  it("LE TÉMOIN : LES TROIS ESPÈCES SE RANGENT EN TROIS PLACES DISTINCTES", () => {
    const vus = {
      mecanique: allure(mecanique(), SR).espece,
      vivante: allure(vivante(), SR).espece,
      desordonnee: allure(desordonnee(), SR).espece,
    };
    const dit = JSON.stringify(vus);
    expect(vus.mecanique, dit).toBe("mecanique");
    expect(vus.vivante, dit).toBe("vivante");
    expect(vus.desordonnee, dit).toBe("desordonnee");
  });

  it("LE TÉMOIN NÉGATIF : UNE TENUE SANS ONDULATION N'A PAS D'ALLURE", () => {
    // C'est exactement la faute du lot du grain, transposée : un son qui n'ondule pas recevait une
    // espèce. Ici il reçoit « aucune », et le dire vaut mieux que de tirer une espèce au hasard.
    const a = allure(tenue(), SR);
    expect(a.espece, `tenue : ${a.espece}, profondeur ${a.profondeur.toFixed(4)}`).toBe("aucune");
  });

  it("LE TÉMOIN NÉGATIF : UN GRAIN N'EST PAS UNE ALLURE, et la bande les sépare", () => {
    // La frontière est celle que le lot du grain a posée, et elle doit tenir des deux côtés : une
    // modulation à 40 Hz est un grain, et ce critère-ci ne doit rien en dire.
    const grain = bati((t) => (0.7 + 0.3 * Math.sin(2 * Math.PI * 40 * t)) * porteuse(t), 4);
    const a = allure(grain, SR);
    expect(a.espece, `grain à 40 Hz : ${a.espece}, débit ${a.debit?.toFixed(1)}`).toBe("aucune");
    expect(ALLURE_MAX, "la bande de l'allure s'arrête où celle du grain commence").toBeLessThanOrEqual(20);
    expect(ALLURE_MIN, "et elle commence sous le hertz").toBeLessThan(1);
  });

  it("LE CONTRÔLE : LA PROFONDEUR SEULE CONFOND LES TROIS ESPÈCES, qui sont à profondeur égale", () => {
    // Les trois sons d'essai ondulent d'autant : ce qui les sépare est la RÉGULARITÉ de leur
    // ondulation, non son ampleur. Sans ce contrôle, le critère ne serait qu'un profondimètre.
    const m = allure(mecanique(), SR);
    const v = allure(vivante(), SR);
    const d = allure(desordonnee(), SR);
    const dit = `profondeurs : ${m.profondeur.toFixed(3)}, ${v.profondeur.toFixed(3)}, ${d.profondeur.toFixed(3)}`;
    expect(Math.abs(m.profondeur - v.profondeur), dit).toBeLessThan(0.1);
    const dit2 = `irrégularités : ${m.irregularite.toFixed(4)}, ${v.irregularite.toFixed(4)}, ${d.irregularite.toFixed(4)}`;
    expect(m.irregularite, dit2).toBeLessThan(v.irregularite);
    expect(v.irregularite, dit2).toBeLessThan(d.irregularite);
  });

  it("UNE MACHINE EST MÉCANIQUE À TOUT DÉBIT DE LA BANDE, et c'est le plancher de la mesure", () => {
    // DEUX PLANCHERS ONT ÉTÉ ABAISSÉS ICI, et aucun des deux ne se voyait sur un seul débit.
    //
    // LE PREMIER EST LE RÉSIDU DE LA PORTEUSE, qui déplace les sommets : près d'un sommet la pente
    // de l'ondulation est nulle, de sorte qu'une trace même infime y déplace le maximum. Une
    // porteuse de 440 Hz en laisse une à 37,6 Hz dans l'enveloppe, et une machine ressortait à
    // 0,0229 au lieu de zéro. L'enveloppe est donc lissée à la borne de la bande.
    //
    // LE SECOND EST LA QUANTIFICATION DU RANG, et il MONTE AVEC LE DÉBIT, ce qu'un témoin à 5 Hz ne
    // pouvait pas montrer : relevé sans affiner le sommet entre trois points, le plancher vaut
    // 0,0061 à 2 Hz mais 0,0212 à 11 Hz et 0,0395 à 19 Hz, de sorte qu'une machine y ressortait
    // VIVANTE. La parabole qui passe par les trois points du sommet le tient à 0,0077 au pire.
    const releves: string[] = [];
    let pire = 0;
    for (const fm of [2, 3, 4, 5, 6, 8, 11, 15, 19]) {
      const m = allure(mecanique(fm), SR);
      releves.push(`${fm} Hz : ${m.irregularite.toFixed(5)} ${m.espece}`);
      pire = Math.max(pire, m.irregularite);
      expect(m.espece, releves.join(" · ")).toBe("mecanique");
      expect(m.debit, releves.join(" · ")).toBeCloseTo(fm, 0);
    }
    expect(pire, `le pire plancher relevé : ${releves.join(" · ")}`).toBeLessThan(0.01);
    expect(allure(mecanique(5), SR).ondulations, "vingt ondulations sur quatre secondes à 5 Hz").toBe(20);
  });

  it("LE DÉBIT DE L'ALLURE EST CELUI DE L'ONDULATION, et il se vérifie à la valeur près", () => {
    for (const fm of [2, 5, 8, 12]) {
      const a = allure(mecanique(fm), SR);
      expect(a.debit, `${fm} Hz : relevé ${a.debit?.toFixed(2)}`).toBeCloseTo(fm, 0);
    }
  });
});

// ── Les trois ensemble ──

describe("les trois critères", () => {
  it("UN SEUL PARCOURS DU SON REND LES TROIS, et chacun y retrouve ce qu'il rend seul", () => {
    // Les trois critères partagent l'enveloppe et le spectre : les calculer ensemble ne doit rien
    // changer à aucun d'eux.
    const x = mecanique();
    const tous = criteresSchaefferiens(x, SR);
    expect(tous.masse.espece).toBe(masse(x, SR).espece);
    expect(tous.dynamique.forme).toBe(dynamique(x, SR).forme);
    expect(tous.allure.espece).toBe(allure(x, SR).espece);
  });

  it("UN SILENCE NE PORTE AUCUN DES TROIS, et le dire est préférable à trois espèces au hasard", () => {
    const vide = new Float32Array(echantillons());
    const tous = criteresSchaefferiens(vide, SR);
    expect(tous.masse.espece).toBe("aucune");
    expect(tous.dynamique.forme).toBe("aucune");
    expect(tous.allure.espece).toBe("aucune");
  });
});
