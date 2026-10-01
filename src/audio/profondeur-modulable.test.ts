// audio/profondeur-modulable.test.ts — Les trois profondeurs ouvertes à la courbe tiennent-elles ?
//
// CE QUE CE FICHIER DOIT PROUVER, ET POURQUOI IL EXISTE. L'auto-pan, le chopper et le vibrato ont
// reçu une entrée qui fait varier leur profondeur, en remplacement des composants logistiques
// retirés. Ouvrir un réglage à la modulation, c'est toucher au cœur de l'effet : deux choses
// peuvent mal tourner, et l'une des deux ne s'entend pas.
//
//   — LE CHEMIN SANS COURBE PEUT CHANGER. C'est le danger silencieux : tous les graphes déjà
//     enregistrés rendraient autre chose qu'avant, et personne ne réécoute un graphe qui marchait.
//     Les cas d'invariance comparent donc le nombre et le tableau plat ÉCHANTILLON PAR ÉCHANTILLON.
//   — LA COURBE PEUT NE RIEN COMMANDER. Un réglage lu puis oublié passe tous les cas de forme :
//     durée, canaux, absence de NaN. Les cas de commande vérifient donc que le début et la fin d'un
//     son diffèrent quand la profondeur monte de zéro à cent.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { chopper } from "./effets-decoupe";
import { autoPan } from "./effets-espace";
import { vibrato } from "./effets-modulation";

const SR = 8000;

/** Une source qui remplit la durée : un silence ne dirait rien d'une profondeur. */
function source(secondes: number, canaux = 2): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * 440 * (i / SR)) * 0.5;
  }
  return b;
}

/** Une rampe de zéro à un, l'allure la plus simple d'une profondeur qui s'installe. */
const rampe = (n: number) => Float32Array.from({ length: n }, (_, i) => (100 * i) / (n - 1));

/** La valeur efficace d'une tranche, pour comparer le début d'un son et sa fin. */
function rms(b: AudioBuffer, canal: number, debut: number, fin: number): number {
  const d = b.getChannelData(canal);
  let s = 0;
  for (let i = debut; i < fin; i++) s += d[i] * d[i];
  return Math.sqrt(s / (fin - debut));
}

/** Chaque échantillon des deux rendus, comparé sans tolérance. */
function memeSon(a: AudioBuffer, b: AudioBuffer, ou: string): void {
  expect(b.length, `${ou} : longueur`).toBe(a.length);
  expect(b.numberOfChannels, `${ou} : canaux`).toBe(a.numberOfChannels);
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < x.length; i += 13) expect(y[i], `${ou} : canal ${c}, échantillon ${i}`).toBe(x[i]);
  }
}

describe("l'auto-pan", () => {
  it("REND EXACTEMENT CE QU'IL RENDAIT quand la profondeur ne varie pas", async () => {
    const b = source(0.4);
    memeSon(await autoPan(b, 2, 80), await autoPan(b, 2, new Float32Array(b.length).fill(80)), "auto-pan");
  });

  it("ET SON BALANCEMENT S'OUVRE QUAND LA COURBE MONTE", () => {
    // LA MESURE SE PREND SUR LA DIFFÉRENCE DES DEUX CANAUX, et non sur leurs niveaux. Comparer le
    // niveau MOYEN de chaque canal ne dit rien : sur un cycle entier du balayage, les deux valent
    // la même chose par symétrie, quelle que soit la profondeur. C'est ce que la première version
    // de ce cas mesurait, et elle trouvait 0,013 au début pour 0,003 à la fin, soit l'inverse de
    // ce qui se passe. La différence gauche moins droite, elle, vaut la profondeur fois le LFO.
    return autoPan(source(1), 4, rampe(SR)).then((out) => {
      const quart = Math.floor(out.length / 4);
      const ecartDesCanaux = (debut: number, fin: number) => {
        const g = out.getChannelData(0);
        const d = out.getChannelData(1);
        let s = 0;
        for (let i = debut; i < fin; i++) s += (g[i] - d[i]) * (g[i] - d[i]);
        return Math.sqrt(s / (fin - debut));
      };
      const auDebut = ecartDesCanaux(0, quart);
      const aLaFin = ecartDesCanaux(out.length - quart, out.length);
      expect(aLaFin).toBeGreaterThan(auDebut * 5);
    });
  });
});

describe("le chopper", () => {
  it("REND EXACTEMENT CE QU'IL RENDAIT, la profondeur pleine étant son ancien comportement", () => {
    // LA PREUVE QUI PROTÈGE L'EXISTANT, et elle porte sur le défaut du réglage : le chopper coupait
    // toujours tout, et son nouveau réglage vaut cent pour cette raison. La forme du gain est
    // choisie pour que cent rende le gain intact au bit près.
    const b = source(0.4);
    const sansReglage = chopper(b, 4, 50, 0);
    memeSon(sansReglage, chopper(b, 4, 50, 0, undefined, undefined, 100), "chopper à 100");
    memeSon(sansReglage, chopper(b, 4, 50, 0, undefined, undefined, new Float32Array(b.length).fill(100)),
      "chopper au tableau plat");
  });

  it("ET UNE PROFONDEUR NULLE LAISSE LE SON INTACT", () => {
    const b = source(0.3, 1);
    const out = chopper(b, 4, 50, 0, undefined, undefined, 0);
    const x = b.getChannelData(0);
    const y = out.getChannelData(0);
    for (let i = 0; i < x.length; i += 7) expect(y[i], `échantillon ${i}`).toBe(x[i]);
  });

  it("ET LA COUPE S'INSTALLE QUAND LA COURBE MONTE", () => {
    const b = source(1, 1);
    const out = chopper(b, 8, 50, 0, undefined, undefined, rampe(b.length));
    const quart = Math.floor(out.length / 4);
    expect(rms(out, 0, 0, quart)).toBeGreaterThan(rms(out, 0, out.length - quart, out.length) * 1.3);
  });
});

describe("le vibrato", () => {
  it("REND EXACTEMENT CE QU'IL RENDAIT quand la profondeur ne varie pas", () => {
    const b = source(0.4, 1);
    memeSon(vibrato(b, 5, 60), vibrato(b, 5, new Float32Array(b.length).fill(60)), "vibrato");
  });

  it("ET SON ÉCART DE HAUTEUR S'OUVRE QUAND LA COURBE MONTE", () => {
    // LA MESURE SE PREND SUR LA PORTEUSE, et non sur l'écart au signal d'origine. Cet écart-là
    // SATURE : dès que le vibrato décale la lecture d'une demi-période, à quatre cent quarante
    // hertz c'est un peu plus d'une milliseconde, la différence est bornée par deux fois
    // l'amplitude et cesse de croître. La première version de ce cas trouvait ainsi un rapport de
    // 1,56 là où la profondeur, elle, allait de zéro à cent. Un vibrato profond vide la porteuse
    // au profit de ses bandes latérales, et c'est cela qui se mesure sans borne.
    const b = source(1, 1);
    const out = vibrato(b, 5, rampe(b.length));
    const y = out.getChannelData(0);
    const aLaPorteuse = (debut: number, fin: number) => {
      const w = (2 * Math.PI * 440) / SR;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = debut; i < fin; i++) { const s = y[i] + c * s1 - s2; s2 = s1; s1 = s; }
      return s1 * s1 + s2 * s2 - c * s1 * s2;
    };
    const quart = Math.floor(y.length / 4);
    expect(aLaPorteuse(0, quart)).toBeGreaterThan(aLaPorteuse(y.length - quart, y.length) * 10);
  });

  it("ET L'ENTRÉE QUI REMPLACE L'OSCILLATEUR L'EMPORTE, ce que la documentation annonce", () => {
    // La courbe de position dessine le geste entier : la profondeur n'a plus d'oscillateur dont
    // régler l'écart, et deux profondeurs différentes ne peuvent donc pas s'y distinguer.
    const b = source(0.4, 1);
    const position = { valeurs: Float32Array.from({ length: 200 }, (_, i) => i / 199), cadence: 500 };
    const a = vibrato(b, 5, 20, position);
    const c = vibrato(b, 5, new Float32Array(b.length).fill(20), position);
    memeSon(a, c, "vibrato à courbe de position");
  });
});
