// audio/reich.test.ts — Le déphasage a une propriété exactement calculable : les
// voix reviennent à l'unisson au bout de L/e secondes. C'est elle qu'on teste,
// plutôt qu'une impression de « ça bouge ».
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { dephasage, periodeReunion, longueurBoucleEffectiveSec, ecartPourPeriode } from "./reich";

const SR = 8000;

/**
 * Motif à enveloppe CONTINUE : une porteuse à 440 Hz modulée par une cloche à
 * 4 Hz. L'enveloppe est alors une sinusoïde propre, dont le décalage se mesure
 * sans ambiguïté tant qu'il reste sous la demi-période (1000 échantillons).
 *
 * Une première version employait des impulsions en exp(-30·φ), éteintes au bout
 * de 10 % de la période : les fenêtres de mesure tombaient dans le silence et la
 * corrélation ne portait plus que sur du bruit numérique.
 */
function motif(dureeSec = 0.5, sr = SR): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  // UNE seule cloche sur toute la boucle, et non quatre. Avec un motif dont
  // l'enveloppe se répète quatre fois par boucle, un décalage d'une demi-boucle
  // vaut deux périodes d'enveloppe entières : les voix semblent alors réalignées
  // à mi-chemin, et le test de réunion mesure une coïncidence du matériau au
  // lieu de la propriété du procédé.
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    d[i] = 0.5 * (1 - Math.cos(2 * Math.PI * ph)) * Math.sin((2 * Math.PI * 440 * i) / sr);
  }
  return b;
}

/**
 * Décalage (en échantillons) qui maximise la corrélation entre deux fenêtres,
 * mesuré sur les ENVELOPPES et non sur les formes d'onde.
 *
 * Corréler les formes d'onde ne marche pas ici : la porteuse à 440 Hz rend la
 * corrélation périodique tous les 18 échantillons, si bien que des dizaines de
 * décalages obtiennent un score équivalent et que le maximum tombe au hasard —
 * une première version renvoyait -400, la borne de recherche, pour deux signaux
 * pourtant identiques. L'enveloppe, elle, ne présente qu'un maximum par
 * pulsation.
 */
function enveloppe(x: Float32Array, debut: number, taille: number): Float64Array {
  const lissage = 32;
  const env = new Float64Array(taille);
  for (let i = 0; i < taille; i++) {
    let s = 0;
    for (let j = 0; j < lissage; j++) {
      const k = debut + i + j;
      s += k >= 0 && k < x.length ? Math.abs(x[k]) : 0;
    }
    env[i] = s / lissage;
  }
  const moy = env.reduce((p, q) => p + q, 0) / taille;
  for (let i = 0; i < taille; i++) env[i] -= moy;
  return env;
}

describe("periodeReunion", () => {
  it("vaut la longueur de boucle divisée par l'écart", () => {
    expect(periodeReunion(2, 0.01)).toBeCloseTo(200, 6);
    expect(periodeReunion(0.5, 0.005)).toBeCloseTo(100, 6);
  });

  it("est infinie sans écart : sans dérive, pas de déphasage", () => {
    expect(periodeReunion(2, 0)).toBe(Infinity);
  });
});

describe("dephasage", () => {
  const CAS = { dureeSec: 2, ecart: 0.02, voix: 2, stereo: 1 };

  it("produit la durée demandée, en stéréo", () => {
    const out = dephasage(motif(), CAS);
    expect(out.length).toBe(2 * SR);
    expect(out.numberOfChannels).toBe(2);
  });

  it("la voix rapide lit exactement en avance sur la lente", () => {
    // La relation est EXACTE, pas statistique : la voix k lit la source à la
    // vitesse 1+k·e, donc à l'instant i elle rend l'échantillon que la voix 0
    // rendra à l'instant (1+e)·i. On le vérifie point par point plutôt que
    // d'estimer un décalage par corrélation — une première version s'y était
    // essayée et se heurtait à l'ambiguïté de la porteuse, puis à la largeur du
    // pic de corrélation, pour finalement mesurer 305 là où la théorie donne 128.
    const ecart = 0.02;
    const out = dephasage(motif(), { ...CAS, ecart, dureeSec: 1 });
    const g = out.getChannelData(0), d = out.getChannelData(1);
    for (const i of [500, 1500, 3000, 5000]) {
      const j = Math.round(i * (1 + ecart));
      expect(Math.abs(d[i] - g[j]), `à l'échantillon ${i}`).toBeLessThan(0.02);
    }
  });

  it("sans écart, les deux canaux sont rigoureusement identiques", () => {
    // Garde-fou du test précédent : il doit tomber si l'on retire le procédé.
    const out = dephasage(motif(), { ...CAS, ecart: 0 });
    const g = out.getChannelData(0), d = out.getChannelData(1);
    let pire = 0;
    for (let i = 0; i < g.length; i++) pire = Math.max(pire, Math.abs(g[i] - d[i]));
    expect(pire).toBe(0);
  });

  it("les voix se retrouvent à l'unisson au bout d'une période", () => {
    // LA propriété qui distingue le déphasage d'une dérive quelconque : à
    // t = L/e le décalage vaut une boucle entière, donc zéro modulo la boucle.
    //
    // On mesure la SIMILITUDE des deux canaux à décalage nul, et non le décalage
    // lui-même : à mi-période l'avance atteint une demi-boucle, bien au-delà de
    // toute fenêtre de recherche raisonnable, et une estimation de décalage y
    // saturerait sans rien dire.
    const src = motif(0.5);
    const ecart = 0.05;
    // La longueur EFFECTIVE, fondu de raccord déduit : c'est elle qui gouverne
    // la réunion. Prendre 0,5 s donnerait 10 s au lieu des 9 s réelles, et le
    // test échouerait sur une propriété pourtant respectée.
    const periode = periodeReunion(longueurBoucleEffectiveSec(src), ecart);
    const out = dephasage(src, { ...CAS, dureeSec: periode + 0.5, ecart });
    const g = out.getChannelData(0), d = out.getChannelData(1);
    const taille = Math.round(0.2 * SR);
    const similitude = (tSec: number) => {
      const debut = Math.round(tSec * SR);
      const ea = enveloppe(g, debut, taille), eb = enveloppe(d, debut, taille);
      let s = 0;
      for (let i = 0; i < taille; i++) s += ea[i] * eb[i];
      return s / ((Math.hypot(...ea) || 1) * (Math.hypot(...eb) || 1));
    };
    const debut = similitude(0.05);
    const miChemin = similitude(periode / 2);
    const retour = similitude(periode);
    expect(debut).toBeGreaterThan(0.9);        // à l'unisson
    expect(miChemin).toBeLessThan(0.5);        // au plus loin
    expect(retour).toBeGreaterThan(0.9);       // de nouveau à l'unisson
  });

  it("l'étalement stéréo sépare réellement les voix", () => {
    const serre = dephasage(motif(), { ...CAS, stereo: 0 });
    const large = dephasage(motif(), { ...CAS, stereo: 1 });
    const diff = (b: AudioBuffer) => {
      const g = b.getChannelData(0), d = b.getChannelData(1);
      let s = 0;
      for (let i = 0; i < g.length; i++) s += Math.abs(g[i] - d[i]);
      return s / g.length;
    };
    // À étalement nul les deux canaux sont identiques ; à étalement maximal, non.
    expect(diff(serre)).toBeLessThan(1e-6);
    expect(diff(large)).toBeGreaterThan(diff(serre) + 1e-3);
  });

  it("accepte plus de deux voix", () => {
    const out = dephasage(motif(), { ...CAS, voix: 4 });
    expect(out.length).toBe(2 * SR);
    let energie = 0;
    const g = out.getChannelData(0);
    for (let i = 0; i < g.length; i++) energie += g[i] * g[i];
    expect(Math.sqrt(energie / g.length)).toBeGreaterThan(0.001);
  });
});

describe("ecartPourPeriode", () => {
  it("donne l'écart qui produit exactement la période voulue", () => {
    // Le réglage musical du nœud : on choisit la durée du cycle, pas un
    // pourcentage de vitesse qui ne dit rien à l'oreille.
    const src = motif(0.5);
    const boucle = longueurBoucleEffectiveSec(src);
    for (const voulue of [5, 20, 60]) {
      const e = ecartPourPeriode(src, voulue);
      expect(periodeReunion(boucle, e)).toBeCloseTo(voulue, 6);
    }
  });

  it("tient compte du fondu, qui raccourcit la boucle", () => {
    const src = motif(0.5);
    // 0,5 s de source, 50 ms de fondu : la boucle effective vaut 0,45 s.
    expect(longueurBoucleEffectiveSec(src, 0.05)).toBeCloseTo(0.45, 6);
    // Sans en tenir compte, la période visée serait manquée de 10 %.
    expect(ecartPourPeriode(src, 9, 0.05)).toBeCloseTo(0.05, 6);
  });
});
