// audio/ssp-sections.test.ts — Ce que les réglages de « SSP (Koenig) » font ENTENDRE, mesuré sur le son
// que rend la fiche, par le chemin du moteur (`lancerFiche`).
//
// RELEVÉ DE FABIEN, LE 2026-11-27 : « avec la plupart des réglages le son reste identique ». La mesure
// lui a donné raison. En « Séquence » aux amplitudes et aux durées, les quatre sections étaient égales à
// l'échantillon : `selectionner("sequence")` ne tire rien, si bien que `construireSegment` rendait quatre
// fois la même section, et que la Graine et le Principe de la forme ne changeaient pas un échantillon.
// Sous les défauts, les sections différaient à l'échantillon mais puisaient toutes dans les mêmes listes
// avec les mêmes principes : Graine, Forme et Sections restaient sous l'étalon, l'écart que fait une
// autre graine à une seule section, qui donne le même bruit à l'oreille.
//
// LES DOUZE CAS ONT ÉTÉ VUS ROUGES SUR L'ANCIEN CODE (origin/master 74f8ff2c), chacun par son assertion ;
// les six empreintes du dernier bloc y passent, puisqu'elles le figent. Celui de la ligne « Onde » ne
// l'était que par le bloc « Sections », qui manquait : la lecture de la seule section 1 tombait juste par
// l'accident même qu'on répare. Décisions de Fabien du 2026-11-27, une à la fois : une sélection
// par section qui garde les deux amplitudes extrêmes ; un rapport qui juge toutes les sections ; une
// tendance qui suit la position dans la section, par parts égales ; « constante » plutôt que « tenue » ;
// une fenêtre de tendance d'au moins deux éléments, aux deux échelles.
import { describe, expect, it } from "vitest";
import { fiches } from "../plugins/ssp";
import { empreinteValeurs, lancerFiche, type Reglages } from "./lancer-fiche";
import { couleurDe } from "./ecart-reference-couleur";
import { centroideHz, selectionner } from "./ssp";

const FICHE = fiches[0];
/** La fréquence de travail hors projet, celle que rend la fiche ici. */
const SR = 44100;
const TRANCHE = 2 * SR;
const TENUE: Reglages = { "Principe des amplitudes": "Séquence", "Principe des durées": "Séquence" };

async function lancer(reglages: Reglages) {
  const r = await lancerFiche(FICHE, reglages);
  expect(r.erreurRendue || r.levee !== null, `${JSON.stringify(reglages)} : ${r.levee ?? r.message}`).toBe(false);
  return {
    son: new Float32Array((r.valeurs[0] as AudioBuffer).getChannelData(0)),
    rapport: String(r.valeurs[1]),
    message: r.message,
  };
}

/** Les tiers d'octave d'une tranche, en dB de son énergie totale, bornés à −90 dB. */
const tiers = (x: Float32Array) => [...couleurDe(x, SR).tiers.values()].map((v) => Math.max(-90, v));

/**
 * L'écart efficace des tiers d'octave, tranche par tranche, moyen sur les tranches. La tranche vaut deux
 * secondes, la longueur d'une section sous les défauts ; plus longue qu'une section, elle mêlerait deux
 * sélections et rapprocherait ce qu'on entend séparé.
 */
function ecart(a: Float32Array, b: Float32Array, tranche = TRANCHE): number {
  const n = Math.floor(Math.min(a.length, b.length) / tranche);
  let somme = 0;
  for (let t = 0; t < n; t++) {
    const ta = tiers(a.subarray(t * tranche, (t + 1) * tranche)), tb = tiers(b.subarray(t * tranche, (t + 1) * tranche));
    somme += Math.sqrt(ta.reduce((s, v, k) => s + (v - tb[k]) ** 2, 0) / ta.length);
  }
  return somme / n;
}

/**
 * L'ÉTALON : deux graines à une seule section, qui garde les listes entières. Ce sont deux tirages du
 * même bruit, et l'oreille ne les sépare pas ; un réglage qui ne fait pas mieux ne s'entend pas. Il est
 * pris à la longueur de tranche de la comparaison, une tranche plus courte étant plus bruitée.
 */
const etalons = new Map<number, number>();
async function seuil(tranche = TRANCHE): Promise<number> {
  if (!etalons.has(tranche)) {
    etalons.set(tranche, ecart((await lancer({ Sections: 1, Graine: 7 })).son, (await lancer({ Sections: 1, Graine: 8 })).son, tranche));
  }
  return Math.max(2, 4 * etalons.get(tranche)!);
}

const ordre = (rapport: string): number[] => {
  const l = rapport.split("\n");
  return l[l.findIndex((x) => /Ordre des sections/.test(x)) + 1].trim().split(" · ").map(Number);
};

describe("les réglages de la forme s'entendent", () => {
  it("EN SÉQUENCE PARTOUT, LES QUATRE SECTIONS NE SONT PLUS LA MÊME", async () => {
    const { son } = await lancer(TENUE);
    const parts = [0, 1, 2, 3].map((t) => son.subarray(t * TRANCHE, (t + 1) * TRANCHE));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      expect(ecart(parts[i], parts[j]), `tranches ${i + 1} et ${j + 1}`).toBeGreaterThan(await seuil());
    }
  });

  it("LA GRAINE S'ENTEND, sous les défauts comme en Séquence", async () => {
    for (const base of [{}, TENUE]) {
      for (const [a, b] of [[7, 8], [11, 12], [21, 22]]) {
        const e = ecart((await lancer({ ...base, Graine: a })).son, (await lancer({ ...base, Graine: b })).son);
        expect(e, `${JSON.stringify(base)}, graines ${a} et ${b} : ${e.toFixed(2)} dB, seuil ${(await seuil()).toFixed(2)}`)
          .toBeGreaterThan(await seuil());
      }
    }
  });

  it("LE PRINCIPE DE LA FORME S'ENTEND : deux ordres différents, deux sons différents", async () => {
    for (const base of [{}, TENUE]) {
      const sequence = await lancer({ ...base, "Principe de la forme": "Séquence" });
      for (const principe of ["Série", "Groupe"]) {
        const autre = await lancer({ ...base, "Principe de la forme": principe });
        // SEULES LES TRANCHES DONT LA SECTION CHANGE SONT COMPARÉES : un ordre peut garder une section à sa place.
        const oa = ordre(sequence.rapport), ob = ordre(autre.rapport);
        const changees = oa.map((_, t) => t).filter((t) => oa[t] !== ob[t]);
        expect(changees.length, `${principe} : ${ob.join(" · ")}`).toBeGreaterThan(0);
        for (const t of changees) {
          const e = ecart(sequence.son.subarray(t * TRANCHE, (t + 1) * TRANCHE), autre.son.subarray(t * TRANCHE, (t + 1) * TRANCHE));
          expect(e, `${JSON.stringify(base)}, ${principe}, tranche ${t + 1}`).toBeGreaterThan(await seuil());
        }
      }
    }
  });

  it("LE NOMBRE DE SECTIONS S'ENTEND, en moyenne sur huit graines", async () => {
    // EN MOYENNE, ET NON GRAINE PAR GRAINE : sous les défauts, deux sections peuvent tirer des sélections
    // voisines et sonner presque pareil. Relevé sur dix graines, 0,79 à 10,33 dB à deux sections contre une
    // seule ; en Séquence, 31,84 à 47,00. L'ancien code restait sous l'étalon à chaque graine.
    // DEUX ET QUATRE SECTIONS, et non huit : la couleur se prend sur des trames de 32 768 points, et une
    // tranche d'une seconde n'en tient qu'une. L'étalon y monte à 1,59 dB, contre 0,64 sur deux secondes.
    for (const base of [{}, TENUE]) {
      for (const sections of [2, 4]) {
        let somme = 0;
        const graines = [7, 8, 9, 10, 11, 12, 13, 14];
        for (const graine of graines) {
          const une = (await lancer({ ...base, Sections: 1, Graine: graine })).son;
          // Chaque section comparée à la même plage du son d'une seule section : une tranche par section.
          somme += ecart(une, (await lancer({ ...base, Sections: sections, Graine: graine })).son, Math.floor(une.length / sections));
        }
        const e = somme / graines.length;
        const tranche = Math.floor((8 * SR) / sections);
        expect(e, `${JSON.stringify(base)}, 1 contre ${sections} sections : ${e.toFixed(2)} dB`).toBeGreaterThan(await seuil(tranche));
      }
    }
  });
});

describe("le rapport dit ce qu'on entend", () => {
  it("LES « PREMIERS POINTS » SONT CEUX QUI OUVRENT LE SON", async () => {
    // EN MARCHES, le son tient l'amplitude de chaque point jusqu'au suivant : on y relit le premier point.
    for (const graine of [7, 8, 9]) {
      const { son, rapport } = await lancer({ Reliure: "Marches", Graine: graine });
      const l = rapport.split("\n");
      const i = l.findIndex((x) => /Premiers points/.test(x));
      const [p1, p2] = [l[i + 1], l[i + 2]].map((x) => x.trim().split(/\s+/)).map((m) => ({ a: Number(m[0]), d: Number(m[2]) }));
      const dit = `graine ${graine} : annoncé ${p1.a}/${p1.d}, entendu ${son[0]}`;
      expect(son[0], dit).toBeCloseTo(p1.a, 6);
      for (let k = 0; k < p1.d; k++) expect(son[k], `${dit}, échantillon ${k}`).toBeCloseTo(p1.a, 6);
      if (p2.a !== p1.a) expect(son[p1.d], dit).toBeCloseTo(p2.a, 6);
      expect(l[i], dit).toContain(`section ${ordre(rapport)[0]}`);
    }
  });

  it("CHAQUE SECTION POSÉE EST JUGÉE SUR SON PROPRE SON, et la ligne « Onde » les compte", async () => {
    // LE CAS MIXTE : Séquence aux amplitudes, Aléa aux durées. Une section qui n'a tiré qu'une durée tient,
    // les autres sont bruitées. Pas rouge sur l'ancien code par le compte : il ne jugeait que la section 1,
    // et toutes étaient bruitées. Il l'est par le bloc « Sections », qui n'existait pas.
    let tenuesVues = 0;
    for (const graine of [7, 8, 9, 10]) {
      const { son, rapport } = await lancer({ "Principe des amplitudes": "Séquence", Graine: graine });
      const l = rapport.split("\n");
      const debut = l.findIndex((x) => /^\s+Sections$/.test(x));
      expect(debut, rapport).toBeGreaterThan(0);
      const o = ordre(rapport);
      let tenues = 0;
      for (let s = 1; s <= 4; s++) {
        const ligne = l[debut + s];
        const pose = o.indexOf(s);
        if (pose < 0) { expect(ligne, `graine ${graine}`).toContain("jamais posée"); continue; }
        // LA FIN DE LA SECTION EST ÉCARTÉE : son dernier point, sans suivant, est tenu plat, et rompt la période.
        const part = son.subarray(pose * TRANCHE, (pose + 1) * TRANCHE - 400);
        const periode = periodeExacte(part);
        expect(ligne.includes("tenue"), `graine ${graine}, section ${s} : période mesurée ${periode} ; ${ligne}`).toBe(periode > 0);
        if (periode > 0) tenues++;
      }
      const posees = new Set(o).size;
      const onde = l.find((x) => /^\s+Onde\s/.test(x)) ?? "";
      expect(onde, `graine ${graine}`).toContain(tenues === posees ? "tenue dans" : tenues === 0 ? "bruitée dans" : `tenue dans ${tenues} des ${posees}`);
      tenuesVues += tenues;
    }
    // Le cas n'éprouve rien s'il ne rencontre aucune section tenue.
    expect(tenuesVues).toBeGreaterThan(0);
  });

  it("UN SIGNAL CONSTANT EST DIT CONSTANT, et non « tenu à 882 Hz »", async () => {
    for (const reglages of [{ Amplitudes: "0.5", "Durées": "50" }, { Amplitudes: "0.5", "Principe des durées": "Séquence" }] as Reglages[]) {
      const { son, rapport, message } = await lancer(reglages);
      expect(son.every((v) => v === son[0]), JSON.stringify(reglages)).toBe(true);
      const onde = rapport.split("\n").find((x) => /^\s+Onde\s/.test(x)) ?? "";
      expect(onde).toContain("constante");
      expect(message).toContain("constante");
      expect(message).not.toContain("tenue");
    }
  });
});

describe("la tendance parcourt sa liste, dans le son", () => {
  const quart = (x: Float32Array, q: number) => x.subarray((q * x.length) / 4, ((q + 1) * x.length) / 4);
  const moyenne = (x: Float32Array) => x.reduce((s, v) => s + v, 0) / x.length;

  it("AUX AMPLITUDES, LE SIGNAL VA DU BAS DE LA LISTE AU HAUT, sans composante continue", async () => {
    // L'ancien code tirait son masque sur 17 648 points et n'en posait que 3 408 : le signal restait
    // entre −1 et −0,6, avec −0,80 de composante continue.
    const { son } = await lancer({ Sections: 1, "Principe des amplitudes": "Tendance" });
    const dit = [0, 1, 2, 3].map((q) => moyenne(quart(son, q)).toFixed(3)).join(" / ");
    expect(moyenne(quart(son, 0)), dit).toBeLessThan(-0.3);
    expect(moyenne(quart(son, 3)), dit).toBeGreaterThan(0.3);
    expect(Math.abs(moyenne(son)), dit).toBeLessThan(0.1);
  });

  it("AUX DURÉES, LE REGISTRE DESCEND JUSQU'AUX PLUS LONGUES", async () => {
    // L'ancien code ne passait pas 17 : l'aigu du dernier quart restait à 0,55 de celui du premier.
    const { son } = await lancer({ Sections: 1, "Principe des durées": "Tendance" });
    const aigus = [0, 1, 2, 3].map((q) => centroideHz(quart(son, q), SR));
    expect(aigus[3] / aigus[0], aigus.map((a) => a.toFixed(0)).join(" / ")).toBeLessThan(0.35);
  });

  it("LE HAUT DE LA LISTE EST TIRÉ : chaque position de la fenêtre tient une part égale", () => {
    const suite = selectionner("tendance", 6, 3419, () => 0.5);
    expect(suite.filter((v) => v === 5).length).toBeGreaterThan(3419 / 10);
  });

  it("UNE FENÊTRE D'AU MOINS DEUX : deux amplitudes en tendance ne rendent plus un signal constant", async () => {
    // L'ancien masque avait un seul élément de large sous cinq éléments : « -1, 1 » en tendance rendait
    // −1 d'un bout à l'autre, et trois ou quatre valeurs des paliers constants.
    for (const amplitudes of ["-1, 1", "-1, 0, 1", "-1, -0.3, 0.3, 1"]) {
      const { son } = await lancer({ Sections: 1, Amplitudes: amplitudes, "Durées": "50", "Principe des amplitudes": "Tendance" });
      let plusLong = 0, courant = 1;
      for (let i = 1; i < son.length; i++) { courant = son[i] === son[i - 1] ? courant + 1 : 1; plusLong = Math.max(plusLong, courant); }
      expect(plusLong, `${amplitudes} : palier constant de ${plusLong} échantillons`).toBeLessThan(son.length / 10);
    }
  });

  it("LA TENDANCE DE LA FORME N'EST PLUS LA SÉQUENCE à quatre sections", async () => {
    let distincts = 0;
    for (const graine of [7, 8, 9]) {
      const t = await lancer({ ...TENUE, Graine: graine, "Principe de la forme": "Tendance" });
      const s = await lancer({ ...TENUE, Graine: graine, "Principe de la forme": "Séquence" });
      if (ordre(t.rapport).join() !== ordre(s.rapport).join()) {
        distincts++;
        expect(t.son.some((v, i) => v !== s.son[i]), `graine ${graine}`).toBe(true);
      }
    }
    expect(distincts).toBeGreaterThan(0);
  });
});

describe("ce qui ne devait pas bouger", () => {
  // TÉMOIN À NE JAMAIS RÉÉCRIRE : le son d'avant le 2026-11-27, à une section et sans tendance. Une section
  // seule garde les listes entières, et les principes autres que la tendance tirent dans le même ordre :
  // ces graphes-là sonnent comme avant. Relevé sur origin/master 74f8ff2c, avant la correction.
  const AVANT: [Reglages, string][] = [
    [{ Sections: 1 }, "a44100:352800:1fhvclr19jydms"],
    [{ Sections: 1, ...TENUE }, "a44100:352800:1vqw49v1mv1aqv"],
    [{ Sections: 1, "Principe des amplitudes": "Séquence", "Durées": "50" }, "a44100:352800:s4k9o1drro5x"],
    [{ Sections: 1, "Principe des amplitudes": "Groupe", "Principe des durées": "Série", Reliure: "Marches" }, "a44100:352800:qqyqus1291k0t"],
    [{ Sections: 1, "Principe des amplitudes": "Série", "Principe des durées": "Groupe", Graine: 99, "Durée": 3 }, "a44100:132300:mikuzz131qte2"],
    [{ Sections: 1, Amplitudes: "-1, 1", "Durées": "2, 3", "Principe de la forme": "Aléa" }, "a44100:352800:b8zfbinnczwx"],
  ];
  it.each(AVANT)("À UNE SECTION ET SANS TENDANCE, LE SON EST CELUI D'AVANT : %j", async (reglages, empreinte) => {
    const r = await lancerFiche(FICHE, reglages);
    expect(await empreinteValeurs([r.valeurs[0]])).toBe(empreinte);
  });
});

/**
 * La plus courte période exacte d'un morceau, en échantillons, ou zéro.
 *
 * C'EST LE SON QUI EST LU, et non la suite des points : un morceau est périodique quand il se répète à
 * l'identique, décalé d'une période, sur toute sa longueur. Les petits décalages sont exclus, une ligne
 * lente pouvant se ressembler d'un échantillon au suivant sans rien répéter.
 */
function periodeExacte(x: Float32Array): number {
  for (let p = 8; p * 2 <= x.length; p++) {
    if (x[p] !== x[0] || x[p + 1] !== x[1]) continue;
    let tient = true;
    for (let i = p; i < x.length; i++) if (Math.abs(x[i] - x[i - p]) > 1e-6) { tient = false; break; }
    if (tient) return p;
  }
  return 0;
}
