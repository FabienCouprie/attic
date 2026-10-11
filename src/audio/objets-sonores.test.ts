// audio/objets-sonores.test.ts — Découper, décrire, réordonner, monter.
//
// Chaque matériau est fabriqué pour que la bonne réponse soit connue d'avance : des attaques à des
// instants écrits, des silences de longueurs écrites, un changement de timbre à un instant écrit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { decouperEnObjets, decrireZones, monter, reordonnerObjets } from "./objets-sonores";
import { creerAleatoire } from "../core/hasard";

const SR = 44100;
const tampon = (n: number, f: (i: number) => number) => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  b.copyToChannel(Float32Array.from({ length: n }, (_, i) => f(i)), 0);
  return b;
};
const hasard = (g: number) => { let e = g; return () => { e = (e * 1664525 + 1013904223) >>> 0; return e / 4294967296 * 2 - 1; }; };

/** Des notes frappées aux instants donnés, qui décroissent, sur un fond presque muet. */
function frappes(instants: number[], dureeS: number, hz = (k: number) => 440 + 110 * k) {
  const fond = hasard(1);
  return tampon(Math.round(dureeS * SR), (i) => {
    let v = 0.001 * fond();
    instants.forEach((t, k) => {
      const d = i / SR - t;
      if (d >= 0) v += 0.6 * Math.exp(-d * 8) * Math.sin(2 * Math.PI * hz(k) * d);
    });
    return v;
  });
}

const OPTS = { sensibilite: 50, dureeMinMs: 80, seuilSilenceDb: -40 };

describe("découper en objets", () => {
  it("PAR LES ATTAQUES : cinq frappes, cinq objets, chacun commencé à 5 ms près", () => {
    const instants = [0.2, 0.7, 1.3, 1.8, 2.5];
    const objets = decouperEnObjets(frappes(instants, 3.2), { critere: "attaques", ...OPTS });
    expect(objets.map((o) => o.debut.toFixed(2))).toHaveLength(5);
    objets.forEach((o, k) => expect(Math.abs(o.debut - instants[k]), `objet ${k} à ${o.debut.toFixed(4)} s`).toBeLessThan(0.005));
    // Chaque objet va jusqu'à l'attaque suivante : sa résonance lui appartient.
    expect(Math.abs(objets[0].debut + objets[0].duree - objets[1].debut)).toBeLessThan(1e-9);
  });

  it("PAR LES SILENCES : trois sons séparés, trois objets ; un trou de 30 ms ne coupe pas un objet", () => {
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      const dedans = (t > 0.3 && t < 0.8 && !(t > 0.5 && t < 0.53)) || (t > 1.2 && t < 1.6) || (t > 2.1 && t < 2.7);
      return dedans ? 0.5 * Math.sin(2 * Math.PI * 330 * t) : 0;
    });
    const objets = decouperEnObjets(son, { critere: "silences", ...OPTS });
    expect(objets).toHaveLength(3);
    const attendus = [[0.3, 0.8], [1.2, 1.6], [2.1, 2.7]];
    objets.forEach((o, k) => {
      expect(Math.abs(o.debut - attendus[k][0]), `début ${k}`).toBeLessThan(0.03);
      expect(Math.abs(o.debut + o.duree - attendus[k][1]), `fin ${k}`).toBeLessThan(0.03);
    });
  });

  it("PAR LE TIMBRE : un bruit qui devient une note, sans silence ni attaque, se coupe au changement", () => {
    const h = hasard(4);
    const son = tampon(2 * SR, (i) => (i < SR ? 0.3 * h() : 0.42 * Math.sin(2 * Math.PI * 440 * i / SR)));
    const objets = decouperEnObjets(son, { critere: "timbre", ...OPTS, sensibilite: 30 });
    expect(objets.length).toBeGreaterThanOrEqual(2);
    const frontiere = objets[1].debut;
    expect(Math.abs(frontiere - 1), `frontière à ${frontiere.toFixed(3)} s`).toBeLessThan(0.05);
  });

  it("LES DESCRIPTEURS DISENT CE QU'ON ENTEND : la note est tonique, le bruit bruité ; l'aigu est brillant", () => {
    const h = hasard(7);
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      if (t < 0.9) return 0.4 * Math.sin(2 * Math.PI * 300 * t);
      if (t > 1 && t < 1.9) return 0.4 * h();
      if (t > 2) return 0.1 * Math.sin(2 * Math.PI * 3000 * t);
      return 0;
    });
    const [note, bruit, aigu] = decouperEnObjets(son, { critere: "silences", ...OPTS, seuilSilenceDb: -50 });
    expect(note.bruit).toBeLessThan(0.05);
    expect(bruit.bruit).toBeGreaterThan(0.5);
    expect(Math.abs(note.brillance / 300 - 1)).toBeLessThan(0.15);
    expect(aigu.brillance).toBeGreaterThan(2500);
    // Et la sonie suit le niveau : 0,1 d'amplitude, c'est 12 dB sous 0,4.
    expect(Math.abs(note.sonie - aigu.sonie - 12)).toBeLessThan(1.5);
  });

  it("PAR LA MASSE : un bruit qui devient une note se coupe au changement", () => {
    // La masse au sens du Traité est la part du champ des hauteurs que le son occupe. Un bruit
    // l'occupe tout entier, une note n'en occupe qu'un point : c'est le plus grand écart de masse
    // que l'échelle du Traité porte, du bruit blanc au son tonique.
    const h = hasard(4);
    const son = tampon(2 * SR, (i) => (i < SR ? 0.3 * h() : 0.42 * Math.sin((2 * Math.PI * 440 * i) / SR)));
    const objets = decouperEnObjets(son, { critere: "masse", ...OPTS, sensibilite: 40 });
    expect(objets.length, `${objets.length} objet(s) : ${objets.map((z) => z.debut.toFixed(2)).join(" ")}`).toBe(2);
    expect(Math.abs(objets[1].debut - 1), `frontière à ${objets[1].debut.toFixed(3)} s`).toBeLessThan(0.05);
    // ET LES DEUX OBJETS PORTENT LES DEUX MASSES, ce qui est le même critère lu par objet.
    expect(objets[0].masse).toBe("blanc");
    expect(objets[1].masse).toBe("pur");
  });

  it("LE CONTRÔLE : UN SAUT DE NIVEAU SEUL NE DÉPLACE PAS LA MASSE, et le timbre l'y voit", () => {
    // SANS CE CAS, LE CRITÈRE DE MASSE POURRAIT N'ÊTRE QUE CELUI DU TIMBRE RENOMMÉ, et c'est la
    // faute que ce dépôt a déjà payée deux fois, le passe-bas déguisé des ondelettes et le
    // compresseur de Di Scipio.
    //
    // LE NIVEAU EST L'AXE OÙ LES DEUX DIFFÈRENT PAR CONSTRUCTION : le timbre le compte parmi ses
    // trois descripteurs, l'occupation du champ ne le voit pas, son plancher étant relatif au sommet
    // de chaque trame. Un son qui gagne six décibels sans rien changer d'autre est donc une
    // frontière de timbre et PAS une frontière de masse. C'est aussi ce que dirait le Traité : un
    // changement de niveau relève de la dynamique, non de la matière.
    //
    // LA MARCHE EST LISSÉE SUR CENT MILLISECONDES, et il a fallu le relever : une marche brutale est
    // un CLIC, dont le spectre large remplit le champ pendant quelques trames. La masse y voyait donc
    // une frontière, et elle avait raison — c'était le témoin qui était faux.
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      let v = 0;
      for (let h = 1; h <= 4; h++) v += (0.2 / h) * Math.sin(2 * Math.PI * 330 * h * t);
      return v * (t < 1.45 ? 1 : t > 1.55 ? 2 : 1 + (t - 1.45) * 10);
    });
    const parMasse = decouperEnObjets(son, { critere: "masse", ...OPTS, sensibilite: 40 });
    const parTimbre = decouperEnObjets(son, { critere: "timbre", ...OPTS, sensibilite: 40 });
    const dit = `masse : ${parMasse.length} objet(s) ; timbre : ${parTimbre.length}`
      + ` à ${parTimbre.map((z) => z.debut.toFixed(2)).join(" ")}`;
    expect(parMasse.length, dit).toBe(1);
    expect(parTimbre.length, dit).toBe(2);
    expect(Math.abs(parTimbre[1].debut - 1.5), dit).toBeLessThan(0.1);
  });

  it("LE TÉMOIN NÉGATIF : UN SON TENU NE SE COUPE PAS, et les deux critères l'inventaient", () => {
    // DÉFAUT PRÉEXISTANT, trouvé en écrivant le critère de masse et corrigé pour les deux. La
    // nouveauté divisait chaque descripteur par son écart type sur le son entier : sur un son qui NE
    // CHANGE PAS, cet écart type est presque nul, de sorte que la moindre ondulation de mesure
    // ressortait à plusieurs écarts types. Relevé sur cette tenue harmonique de deux secondes, qui
    // ne change pas d'un bout à l'autre : le timbre y trouvait ONZE objets et la masse DOUZE.
    //
    // Chaque descripteur porte désormais l'écart qu'on ENTEND sur lui, et une frontière doit passer
    // un plancher absolu. `pics` ne pouvait pas le faire : il ne juge que des rapports au maximum de
    // la courbe, donc un son sans frontière voyait ses plus grosses ondulations devenir des sommets.
    const son = tampon(2 * SR, (i) => {
      const t = i / SR;
      let v = 0;
      for (let h = 1; h <= 3; h++) v += (0.3 / h) * Math.sin(2 * Math.PI * 330 * h * t);
      return v;
    });
    for (const critere of ["masse", "timbre"] as const) {
      const objets = decouperEnObjets(son, { critere, ...OPTS, sensibilite: 40 });
      expect(objets.length, `${critere} : ${objets.length} objet(s) sur un son qui ne change pas`).toBe(1);
    }
    // ET À TOUTE SENSIBILITÉ, le plancher étant absolu là où la sensibilité est un rapport.
    for (const sensibilite of [0, 20, 60, 100]) {
      for (const critere of ["masse", "timbre"] as const) {
        const n = decouperEnObjets(son, { critere, ...OPTS, sensibilite }).length;
        expect(n, `${critere} à sensibilité ${sensibilite} : ${n} objet(s)`).toBe(1);
      }
    }
  });

  it("LES TROIS CRITÈRES DU TRAITÉ SONT RELEVÉS PAR OBJET, et un objet trop court le dit", () => {
    const h = hasard(11);
    const son = tampon(5 * SR, (i) => {
      const t = i / SR;
      // Une tenue harmonique de deux secondes, un silence, puis un bruit blanc de deux secondes.
      if (t < 2) {
        let v = 0;
        for (let k = 1; k <= 4; k++) v += (0.3 / k) * Math.sin(2 * Math.PI * 330 * k * t);
        return v;
      }
      return t > 2.5 ? 0.3 * h() : 0;
    });
    const [tenue, bruit] = decouperEnObjets(son, { critere: "silences", ...OPTS, seuilSilenceDb: -50 });
    const dit = `tenue : ${tenue.masse}/${tenue.forme}/${tenue.allure} ;`
      + ` bruit : ${bruit.masse}/${bruit.forme}/${bruit.allure}`;
    expect(tenue.masse, dit).toBe("tonique");
    expect(bruit.masse, dit).toBe("blanc");
    expect(tenue.degreMasse, dit).toBeLessThan(bruit.degreMasse);
    // Ni l'un ni l'autre n'ondule : tous deux reçoivent « aucune », et leur irrégularité est nulle.
    expect(tenue.allure, dit).toBe("aucune");
    expect(tenue.irregularite, dit).toBeNull();
    // Et la forme dynamique de la tenue est bien une tenue, celle du bruit aussi.
    expect(tenue.forme, dit).toBe("tenue");
  });

  it("la sensibilité décide du nombre d'objets", () => {
    const son = frappes([0.2, 0.5, 0.8, 1.1, 1.4, 1.7], 2.2, (k) => 300 * (1 + (k % 2)));
    const peu = decouperEnObjets(son, { critere: "attaques", ...OPTS, sensibilite: 0 }).length;
    const beaucoup = decouperEnObjets(son, { critere: "attaques", ...OPTS, sensibilite: 100 }).length;
    expect(beaucoup).toBeGreaterThanOrEqual(peu);
    expect(beaucoup).toBeGreaterThanOrEqual(6);
  });
});

describe("réordonner les objets", () => {
  const troisNotes = () => {
    const f = [880, 220, 440];
    return {
      son: tampon(3 * SR, (i) => 0.4 * Math.sin(2 * Math.PI * f[Math.floor(i / SR)] * (i / SR))),
      objets: f.map((hz, k) => ({ debut: k, duree: 1, brillance: hz, sonie: -10, bruit: 0 })),
    };
  };
  const frequence = (x: Float32Array, de: number, a: number) => {
    let n = 0;
    for (let i = de + 1; i < a; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
    return (n * SR) / (a - de);
  };

  it("PAR BRILLANCE CROISSANTE : 220, 440, 880 — et à l'envers en décroissant", () => {
    const { son, objets } = troisNotes();
    const y = reordonnerObjets(son, objets, { critere: "brillance", decroissant: false, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    const f = [0, 1, 2].map((k) => frequence(y, k * SR + 2000, (k + 1) * SR - 2000));
    expect(f.map((v) => Math.round(v / 10) * 10)).toEqual([220, 440, 880]);
    const z = reordonnerObjets(son, objets, { critere: "brillance", decroissant: true, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    expect(Math.round(frequence(z, 2000, SR - 2000) / 10) * 10).toBe(880);
  });

  it("L'ESPACE SÉPARE OU FAIT CHEVAUCHER, et les fondus ouvrent et ferment chaque objet", () => {
    const { son, objets } = troisNotes();
    expect(reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: 500, fonduMs: 10 }).length).toBe(Math.round(4 * SR));
    expect(reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: -250, fonduMs: 10 }).length).toBe(Math.round(2.5 * SR));
    const y = reordonnerObjets(son, objets, { critere: "origine", decroissant: false, espaceMs: 0, fonduMs: 10 }).getChannelData(0);
    expect(y[0]).toBe(0);
    expect(Math.abs(y[SR - 1])).toBeLessThan(1e-3);
  });

  it("PAR MASSE CROISSANTE : du son pur au bruit blanc, dans l'ordre de l'échelle du Traité", () => {
    // L'ÉCHELLE DU TRAITÉ EST ORDONNÉE, et c'est elle qui ordonne : du plus tonique au plus
    // complexe. Les quatre objets sont mis dans le son à contre-ordre, et le tri les remet.
    const h = hasard(21);
    const son = tampon(4 * SR, (i) => {
      const t = i / SR;
      if (t < 1) return 0.3 * h();
      if (t < 2) {
        let v = 0;
        for (let k = 1; k <= 3; k++) v += (0.25 / k) * Math.sin(2 * Math.PI * 220 * k * t) + (0.25 / k) * Math.sin(2 * Math.PI * 311 * k * t);
        return v;
      }
      if (t < 3) {
        let v = 0;
        for (let k = 1; k <= 4; k++) v += (0.3 / k) * Math.sin(2 * Math.PI * 330 * k * t);
        return v;
      }
      return 0.4 * Math.sin(2 * Math.PI * 440 * t);
    });
    const objets = decrireZones(son, [0, 1, 2, 3].map((d) => ({ debut: d + 0.02, duree: 0.9 })));
    const vus = objets.map((o) => o.masse);
    expect(vus, `relevé : ${vus.join(" ")}`).toEqual(["blanc", "groupe", "tonique", "pur"]);
    const range = reordonnerObjets(son, objets, { critere: "masse", decroissant: false, espaceMs: 0, fonduMs: 0 });
    const apres = decrireZones(range, [0, 1, 2, 3].map((d) => ({ debut: d + 0.02, duree: 0.85 })));
    expect(apres.map((o) => o.masse), `après tri : ${apres.map((o) => o.masse).join(" ")}`)
      .toEqual(["pur", "tonique", "groupe", "blanc"]);
  });

  it("PAR ATTAQUE : du plus mordant au plus progressif, et c'est la grandeur qui ordonne la dynamique", () => {
    // UNE FORME DYNAMIQUE NE SE TRIE PAS : « crescendo » ne vient ni avant ni après « impulsion ».
    // La grandeur qui l'ordonne est l'attaque, du dixième aux neuf dixièmes du sommet.
    const son = tampon(3 * SR, (i) => {
      const t = i / SR;
      const dans = t % 1;
      // Trois objets d'une seconde : attaque lente, immédiate, moyenne.
      const montee = [0.8, 0.002, 0.25][Math.floor(t)];
      const g = Math.min(1, dans / montee);
      return 0.4 * g * Math.sin(2 * Math.PI * 440 * t);
    });
    const objets = decrireZones(son, [0, 1, 2].map((d) => ({ debut: d, duree: 0.98 })));
    const attaques = objets.map((o) => o.attaqueMs);
    expect(attaques[1], `attaques : ${attaques.map((a) => a.toFixed(0)).join(" ")} ms`).toBeLessThan(attaques[2]);
    expect(attaques[2], `attaques : ${attaques.map((a) => a.toFixed(0)).join(" ")} ms`).toBeLessThan(attaques[0]);
    const range = reordonnerObjets(son, objets, { critere: "attaque", decroissant: false, espaceMs: 0, fonduMs: 0 });
    const apres = decrireZones(range, [0, 1, 2].map((d) => ({ debut: d, duree: 0.95 })));
    const triees = apres.map((o) => o.attaqueMs);
    expect(triees[0], `après tri : ${triees.map((a) => a.toFixed(0)).join(" ")} ms`).toBeLessThan(triees[1]);
    expect(triees[1], `après tri : ${triees.map((a) => a.toFixed(0)).join(" ")} ms`).toBeLessThan(triees[2]);
  });

  it("PAR ALLURE : de la machine au désordre, et un objet sans allure se range d'un seul côté", () => {
    // Trois objets de deux secondes, assez longs pour qu'une allure s'y observe : une ondulation de
    // période immuable, une dont la cadence s'écarte de vingt pour cent, et une tenue qui n'ondule
    // pas du tout. L'ordre attendu est celui de l'échelle, et la tenue va au bout.
    const porteuse = (t: number) => {
      let v = 0;
      for (let h = 1; h <= 3; h++) v += (0.3 / h) * Math.sin(2 * Math.PI * 440 * h * t);
      return v;
    };
    const son = tampon(6 * SR, (i) => {
      const t = i / SR, dans = t % 2;
      if (t < 2) return porteuse(t);
      if (t < 4) {
        // La cadence s'écarte de vingt pour cent : une allure désordonnée.
        const phase = 5 * dans + ((0.2 * 5) / (2 * Math.PI * 0.6)) * Math.sin(2 * Math.PI * 0.6 * dans);
        return (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(2 * Math.PI * phase))) * porteuse(t);
      }
      return (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5 * dans))) * porteuse(t);
    });
    const objets = decrireZones(son, [0, 2, 4].map((d) => ({ debut: d + 0.01, duree: 1.95 })));
    const vus = objets.map((o) => `${o.allure}/${o.irregularite === null ? "—" : o.irregularite.toFixed(3)}`);
    expect(objets[0].allure, `relevé : ${vus.join(" ")}`).toBe("aucune");
    expect(objets[0].irregularite, `relevé : ${vus.join(" ")}`).toBeNull();
    expect(objets[2].allure, `relevé : ${vus.join(" ")}`).toBe("mecanique");
    expect(objets[1].allure, `relevé : ${vus.join(" ")}`).toBe("desordonnee");
    // LE TRI MET LA MACHINE EN TÊTE ET LA TENUE AU BOUT : une irrégularité absente vaut l'infini.
    const range = reordonnerObjets(son, objets, { critere: "allure", decroissant: false, espaceMs: 0, fonduMs: 0 });
    const apres = decrireZones(range, [0, 2, 4].map((d) => ({ debut: d + 0.01, duree: 1.9 })));
    expect(apres.map((o) => o.allure), `après tri : ${apres.map((o) => o.allure).join(" ")}`)
      .toEqual(["mecanique", "desordonnee", "aucune"]);
  });

  it("au hasard, à graine égale, le même ordre", () => {
    const { son, objets } = troisNotes();
    const a = reordonnerObjets(son, objets, { critere: "hasard", decroissant: false, espaceMs: 0, fonduMs: 5, hasard: creerAleatoire(9) });
    const b = reordonnerObjets(son, objets, { critere: "hasard", decroissant: false, espaceMs: 0, fonduMs: 5, hasard: creerAleatoire(9) });
    expect(a.getChannelData(0).every((v, i) => v === b.getChannelData(0)[i])).toBe(true);
  });
});

describe("monter", () => {
  const clic = (n = 100) => tampon(n, (i) => (i === 0 ? 1 : 0));
  const plan = (son: AudioBuffer, debut: number, gainDb = 0, fonduEntreeMs = 0, fonduSortieMs = 0) => ({ son, debut, gainDb, fonduEntreeMs, fonduSortieMs });

  it("CHAQUE SON À SON INSTANT ET À SON NIVEAU", async () => {
    const y = (await monter([plan(clic(), 0.5), plan(clic(), 1.2, -6)])).getChannelData(0);
    expect(y[Math.round(0.5 * SR)]).toBeCloseTo(1, 6);
    expect(y[Math.round(1.2 * SR)]).toBeCloseTo(Math.pow(10, -6 / 20), 5);
    expect(y.length).toBe(Math.round(1.2 * SR) + 100);
  });

  it("les sons se superposent, un début négatif rogne, et une autre fréquence est ramenée à la première", async () => {
    const un = tampon(SR, () => 0.25);
    const y = (await monter([plan(un, 0), plan(un, 0.5), plan(un, -0.75)])).getChannelData(0);
    expect(y[Math.round(0.1 * SR)]).toBeCloseTo(0.5, 5);
    expect(y[Math.round(0.6 * SR)]).toBeCloseTo(0.5, 5);
    const lent = new AudioBuffer({ numberOfChannels: 1, length: 22050, sampleRate: 22050 });
    const z = await monter([plan(clic(), 0), plan(lent, 0)]);
    expect(z.sampleRate).toBe(SR);
    expect(Math.abs(z.length - SR)).toBeLessThan(5);
  });

  it("CHAQUE PISTE A SES PROPRES FONDUS, d'entrée et de sortie", async () => {
    const un = tampon(SR, () => 0.5);
    const y = (await monter([plan(un, 0, 0, 100, 0), plan(un, 2, 0, 0, 400)])).getChannelData(0);
    // Première piste : fondu d'entrée de 100 ms, aucun fondu de sortie.
    expect(y[0]).toBe(0);
    expect(y[Math.round(0.05 * SR)]).toBeCloseTo(0.5 * Math.sin(Math.PI / 4), 3);
    expect(y[SR - 1]).toBeCloseTo(0.5, 6);
    // Seconde : entrée franche, sortie sur 400 ms.
    expect(y[2 * SR]).toBeCloseTo(0.5, 6);
    expect(y[3 * SR - Math.round(0.2 * SR)]).toBeCloseTo(0.5 * Math.sin(Math.PI / 4), 2);
    expect(Math.abs(y[3 * SR - 1])).toBeLessThan(1e-3);
  });

  it("LE FONDU EST À PUISSANCE CONSTANTE : deux sons qui se croisent gardent leur énergie", async () => {
    // Deux bruits indépendants croisés sur une seconde : sans perte au milieu, contrairement à deux
    // rampes droites, qui creuseraient de 3 dB.
    const a = tampon(2 * SR, hasard(11)), b = tampon(2 * SR, hasard(12));
    const y = (await monter([plan(a, 0, 0, 0, 1000), plan(b, 1, 0, 1000, 0)])).getChannelData(0);
    const puissance = (de: number, n: number) => { let e = 0; for (let i = de; i < de + n; i++) e += y[i] * y[i]; return e / n; };
    const avant = puissance(Math.round(0.2 * SR), SR / 10), milieu = puissance(Math.round(1.45 * SR), SR / 10);
    expect(Math.abs(10 * Math.log10(milieu / avant))).toBeLessThan(0.6);
  });

  it("des fondus plus longs que le son sont réduits dans la même proportion", async () => {
    const y = (await monter([plan(tampon(SR / 10, () => 0.5), 0, 0, 1000, 1000)])).getChannelData(0);
    expect(y.every(Number.isFinite)).toBe(true);
    const milieu = y[Math.round(SR / 20)];
    expect(milieu).toBeGreaterThan(0.45);
  });
});

// ── Une partie d'un son, et la coupe qui ne s'entend pas ─────────────────────────────────────
//
// `dans` ET `duree` SONT CE QUI REND UNE COUPE POSSIBLE. Un montage sait maintenant porter plusieurs
// morceaux par piste ; couper l'un d'eux en deux ne doit rien changer à ce qu'on entend, le second
// reprenant dans le son exactement là où le premier s'arrête. C'est une égalité échantillon par
// échantillon, et c'est la seule preuve qui vaille : une coupe fausse d'un seul échantillon fait un
// clic, et un clic sur une pièce de cinquante secondes ne se distingue pas d'un défaut du son.
describe("monter une partie d'un son", () => {
  /** Un son dont chaque échantillon dit son propre rang : toute erreur de fenêtre se lit dessus. */
  const rampe = (n: number) => tampon(n, (i) => i / n);

  it("`dans` saute le commencement du son", async () => {
    const son = rampe(1000);
    const y = (await monter([{ son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, dans: 400 / SR }]))
      .getChannelData(0);
    expect(y.length).toBe(600);
    expect(y[0]).toBeCloseTo(400 / 1000, 6);
    expect(y[599]).toBeCloseTo(999 / 1000, 6);
  });

  it("`duree` arrête le son avant sa fin", async () => {
    const son = rampe(1000);
    const y = (await monter([{ son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, duree: 250 / SR }]))
      .getChannelData(0);
    expect(y.length).toBe(250);
    expect(y[249]).toBeCloseTo(249 / 1000, 6);
  });

  it("une durée plus longue que ce qui reste ne lit pas au-delà du son", async () => {
    const son = rampe(1000);
    const y = (await monter([{ son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, dans: 900 / SR, duree: 10 }]))
      .getChannelData(0);
    expect(y.length).toBe(100);
    expect(y.every(Number.isFinite)).toBe(true);
  });

  it("UNE COUPE NE S'ENTEND PAS : les deux moitiés rendent exactement le son entier", async () => {
    const son = rampe(1000);
    const t = 400 / SR;
    const entier = (await monter([{ son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0 }])).getChannelData(0);
    const coupe = (await monter([
      { son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, duree: t },
      { son, debut: t, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, dans: t, duree: (1000 - 400) / SR },
    ])).getChannelData(0);
    expect(coupe.length).toBe(entier.length);
    let ecartMax = 0;
    for (let i = 0; i < entier.length; i++) ecartMax = Math.max(ecartMax, Math.abs(coupe[i] - entier[i]));
    expect(ecartMax).toBe(0);
  });

  it("ET CELA TIENT SUR TOUTE COUPE, pas seulement sur celle qu'on a choisie", async () => {
    const son = rampe(1000);
    const entier = (await monter([{ son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0 }])).getChannelData(0);
    for (const ech of [1, 137, 500, 899, 999]) {
      const t = ech / SR;
      const coupe = (await monter([
        { son, debut: 0, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, duree: t },
        { son, debut: t, gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0, dans: t, duree: (1000 - ech) / SR },
      ])).getChannelData(0);
      let ecartMax = 0;
      for (let i = 0; i < entier.length; i++) ecartMax = Math.max(ecartMax, Math.abs(coupe[i] - entier[i]));
      expect(ecartMax, `coupe a l'echantillon ${ech}`).toBe(0);
    }
  });

  it("un plan sans `dans` ni `duree` pose le son entier, comme avant cette notion", async () => {
    const son = rampe(500);
    const avec = (await monter([{ son, debut: 0.25, gainDb: -3, fonduEntreeMs: 5, fonduSortieMs: 5 }])).getChannelData(0);
    const memeAvecZeros = (await monter([
      { son, debut: 0.25, gainDb: -3, fonduEntreeMs: 5, fonduSortieMs: 5, dans: 0, duree: 0 },
    ])).getChannelData(0);
    expect(avec.length).toBe(memeAvecZeros.length);
    for (let i = 0; i < avec.length; i++) expect(memeAvecZeros[i]).toBe(avec[i]);
  });
});
