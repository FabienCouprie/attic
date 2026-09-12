// audio/pitch-progressif.test.ts — Le montage par paliers.
//
// L'exemple de référence, celui qui a défini le nœud : 3 boucles, 10 s de
// pause, −5 demi-tons. Attendu — quatre passages (l'original, puis −5, −10,
// −15 st), trois pauses, et une sortie de 4 × la source + 30 s.
//
// Ce qui se vérifie ici est l'arithmétique des positions, pas le traitement du
// signal : c'est elle qui se trompe, et elle se trompe d'un cran — une pause
// de trop après le dernier passage, ou un palier calculé sur le précédent.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { planProgression, dureeProgression, rendreProgression } from "./pitch-progressif";

const SR = 44100;
const REFERENCE = { boucles: 3, pauseSec: 10, progression: -5 };

/** Buffer marqué : chaque échantillon vaut 1, pour repérer où il atterrit. */
function bloc(dureeS: number, canaux = 2, valeur = 1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: Math.round(dureeS * SR), sampleRate: SR });
  for (let c = 0; c < canaux; c++) b.getChannelData(c).fill(valeur);
  return b;
}

describe("l'exemple de référence : 3 boucles, 10 s, −5 st", () => {
  const o = { ...REFERENCE, dureeSourceSec: 4 };

  it("donne quatre passages, l'original compris", () => {
    expect(planProgression(o).map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });

  it("descend de 5 demi-tons à chaque cran, cumulés", () => {
    expect(planProgression(o).map((p) => p.demiTons)).toEqual([0, -5, -10, -15]);
  });

  it("place chaque passage après le précédent ET sa pause", () => {
    // 4 s de son + 10 s de pause = un cran toutes les 14 s.
    expect(planProgression(o).map((p) => p.debutSec)).toEqual([0, 14, 28, 42]);
  });

  it("dure 4 × la source + 30 s", () => {
    // Le calcul de l'énoncé : trois pauses, pas quatre.
    expect(dureeProgression(o)).toBe(4 * 4 + 30);
  });
});

describe("la pause finale", () => {
  it("n boucles donnent n pauses, pas n+1", () => {
    // L'erreur d'un cran la plus probable : terminer par un silence.
    for (const boucles of [1, 2, 3, 7]) {
      const o = { boucles, pauseSec: 10, progression: -5, dureeSourceSec: 4 };
      expect(dureeProgression(o), `${boucles} boucles`).toBe((boucles + 1) * 4 + boucles * 10);
    }
  });

  it("le dernier passage finit exactement à la fin de la sortie", () => {
    const o = { ...REFERENCE, dureeSourceSec: 4 };
    const dernier = planProgression(o).at(-1)!;
    expect(dernier.debutSec + o.dureeSourceSec).toBe(dureeProgression(o));
  });
});

describe("cas limites du plan", () => {
  it("zéro boucle rend le seul original, sans pause", () => {
    const o = { boucles: 0, pauseSec: 10, progression: -5, dureeSourceSec: 4 };
    expect(planProgression(o)).toEqual([{ index: 0, demiTons: 0, debutSec: 0 }]);
    expect(dureeProgression(o)).toBe(4);
  });

  it("une pause nulle enchaîne les passages sans silence", () => {
    const o = { boucles: 2, pauseSec: 0, progression: -5, dureeSourceSec: 4 };
    expect(planProgression(o).map((p) => p.debutSec)).toEqual([0, 4, 8]);
    expect(dureeProgression(o)).toBe(12);
  });

  it("une progression positive monte au lieu de descendre", () => {
    const o = { boucles: 3, pauseSec: 10, progression: 2, dureeSourceSec: 4 };
    expect(planProgression(o).map((p) => p.demiTons)).toEqual([0, 2, 4, 6]);
  });

  it("un nombre de boucles fractionnaire est tronqué, pas arrondi", () => {
    const o = { boucles: 2.9, pauseSec: 10, progression: -5, dureeSourceSec: 4 };
    expect(planProgression(o)).toHaveLength(3);
  });
});

describe("rendu", () => {
  /** Espionne les appels au transposeur. */
  function espion() {
    const appels: number[] = [];
    const fn = (src: AudioBuffer, demiTons: number) => { appels.push(demiTons); return src; };
    return { appels, fn };
  }

  it("la sortie a la longueur annoncée par le plan", () => {
    const src = bloc(2);
    const out = rendreProgression(src, REFERENCE, (s) => s);
    expect(out.duration).toBeCloseTo(4 * 2 + 30, 3);
    expect(out.sampleRate).toBe(SR);
    expect(out.numberOfChannels).toBe(2);
  });

  it("appelle le transposeur UNE fois par palier, avec le cumul depuis l'original", () => {
    // Le point qui compte : jamais en chaîne. Ré-appliquer −5 au résultat
    // précédent donnerait la même hauteur mais accumulerait les artefacts du
    // pitch-shift, et la dernière reprise sonnerait nettement moins bien.
    const { appels, fn } = espion();
    rendreProgression(bloc(1), REFERENCE, fn);
    expect(appels).toEqual([-5, -10, -15]);
  });

  it("ne fait PAS passer l'original par le transposeur", () => {
    // Un décalage nul dégraderait le signal pour rien.
    const { appels, fn } = espion();
    rendreProgression(bloc(1), REFERENCE, fn);
    expect(appels).not.toContain(0);
  });

  it("laisse du silence entre les passages, et pas ailleurs", () => {
    const src = bloc(1);
    const out = rendreProgression(src, { boucles: 1, pauseSec: 2, progression: -5 }, (s) => s);
    const d = out.getChannelData(0);
    const a = (sec: number) => d[Math.round(sec * SR)];
    expect(a(0.5), "pendant le premier passage").toBe(1);
    expect(a(2), "pendant la pause").toBe(0);
    expect(a(3.5), "pendant le second passage").toBe(1);
  });

  it("alimente les deux canaux depuis une source mono", () => {
    // Sans cela, un son mono transposé ne sortirait que sur la gauche.
    const mono = bloc(1, 1);
    const out = rendreProgression(mono, { boucles: 1, pauseSec: 0, progression: -5 }, (s) => s);
    expect(out.numberOfChannels).toBe(1);
    const stereo = bloc(1, 2);
    const out2 = rendreProgression(stereo, { boucles: 1, pauseSec: 0, progression: -5 }, () => mono);
    expect(out2.getChannelData(1)[Math.round(1.5 * SR)]).toBe(1);
  });

  it("tronque un passage transposé plus long que prévu, sans déborder", () => {
    // SoundTouch peut rendre quelques échantillons de plus. Le montage ne doit
    // pas écrire hors du buffer ni décaler les paliers suivants.
    const src = bloc(1);
    const plusLong = bloc(1.5);
    const out = rendreProgression(src, { boucles: 1, pauseSec: 1, progression: -5 }, () => plusLong);
    expect(out.duration).toBeCloseTo(3, 3);
  });
});
