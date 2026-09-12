// audio/tonalite.test.ts — L'estimation de tonalité et ce que sa confiance vaut.
//
// `correlerProfil` calculait une similarité COSINUS, c'est-à-dire la corrélation
// de Pearson sans le centrage sur la moyenne. La méthode de
// Krumhansl-Schmuckler est définie avec Pearson, et l'écart n'est pas théorique :
// les deux vecteurs comparés étant strictement positifs, le produit scalaire
// était dominé par leur composante constante, commune aux vingt-quatre
// candidats.
//
// CE QUE LE CENTRAGE CHANGE, ET CE QU'IL NE CHANGE PAS. Mesuré sur vingt cas
// synthétiques, il **ne change aucune réponse** : mêmes tonalités trouvées, mêmes
// erreurs. Ce n'est donc pas un correctif de justesse, et il ne faut pas le
// vendre comme tel. Ce qu'il change, c'est que le score devient une mesure :
// l'étendue des vingt-quatre candidats passe de 0,16–0,22 à 1,43–1,71, et
// l'écart entre le premier et le second de 0,0003 à 0,0101 sur le cas le plus
// serré — sous le cosinus, trois dix-millièmes décidaient du résultat.
//
// Les tests ci-dessous portent donc sur ce qui est réellement devenu vrai, et le
// plus parlant est le dernier : du bruit blanc obtenait 0,963 de confiance,
// indiscernable d'un morceau tonal à 0,993.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { estimerTonalite } from "./accords";

const SR = 44100;

/**
 * Une suite d'accords en sinus purs, la fondamentale renforcée comme le ferait
 * une basse — c'est cette hiérarchie que les profils de Krumhansl décrivent.
 */
function piece(accords: number[][], dureeAccord = 1.5, bruit = 0.2): AudioBuffer {
  const n = Math.ceil(accords.length * dureeAccord * SR);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = buf.getChannelData(0);
  let graine = 20260912;
  const alea = () => { graine = (graine * 1103515245 + 12345) & 0x7fffffff; return graine / 0x3fffffff - 1; };
  accords.forEach((notes, k) => {
    const d0 = Math.floor(k * dureeAccord * SR);
    const d1 = Math.min(n, Math.floor((k + 1) * dureeAccord * SR));
    notes.forEach((midi, idx) => {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const amp = (idx === 0 ? 2.5 : 1) / notes.length;
      for (let i = d0; i < d1; i++) d[i] += amp * Math.sin((2 * Math.PI * f * (i - d0)) / SR);
    });
  });
  if (bruit > 0) for (let i = 0; i < n; i++) d[i] += bruit * alea();
  let pic = 1e-9;
  for (let i = 0; i < n; i++) pic = Math.max(pic, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] *= 0.8 / pic;
  return buf;
}

function bruitBlanc(dureeSec = 4): AudioBuffer {
  const n = Math.ceil(dureeSec * SR);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = buf.getChannelData(0);
  let g = 777;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; d[i] = 0.8 * (g / 0x3fffffff - 1); }
  return buf;
}

describe("tonalités sans ambiguïté", () => {
  it("reconnaît fa majeur", () => {
    // F Bb C F — le fa est posé au début et à la fin, aucune lecture concurrente.
    const r = estimerTonalite(piece([[53, 57, 60], [58, 62, 65], [60, 64, 67], [65, 69, 72]]));
    expect(r.nom).toBe("F major");
    expect(r.confiance).toBeGreaterThan(0.9);
  });

  it("reconnaît ré mineur", () => {
    // Dm Bb A Dm : la dominante majeure ferme la cadence sur le ré.
    const r = estimerTonalite(piece([[50, 53, 57], [46, 50, 53], [57, 61, 64], [50, 53, 57]]));
    expect(r.type).toBe("minor");
    expect(r.nom).toBe("D minor");
  });
});

describe("l'ambiguïté relative n'est pas tranchée, et c'est normal", () => {
  it("lit Am–F–C–G comme do majeur, ce qui est une lecture défendable", () => {
    // Le test existe pour FIXER ce comportement, pas pour le célébrer : ces
    // quatre accords sont vi–IV–I–V en do majeur autant que i–VI–III–VII en la
    // mineur. Les deux tonalités partagent leurs sept notes et ne diffèrent que
    // par la hiérarchie ; une suite qui n'affirme pas sa tonique reste ambiguë,
    // et aucun changement de formule n'y remédie. Le centrage sur la moyenne n'a
    // d'ailleurs rien changé à ce cas.
    const r = estimerTonalite(piece([[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]));
    expect(["C major", "A minor"]).toContain(r.nom);
  });
});

describe("la confiance mesure quelque chose", () => {
  // LE test qui justifie le passage au centrage sur la moyenne. Sous le cosinus,
  // du bruit blanc obtenait 0,963 — au coude à coude avec un vrai morceau tonal
  // à 0,993. Le nœud « Analyse harmonique » affichait donc « 96 % » sur
  // n'importe quoi.
  it("reste basse sur du bruit blanc, qui n'a aucune tonalité", () => {
    const r = estimerTonalite(bruitBlanc());
    expect(r.confiance).toBeLessThan(0.6);
  });

  it("reste basse sur les douze demi-tons joués ensemble", () => {
    const cluster = piece([[60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]], 4, 0);
    expect(estimerTonalite(cluster).confiance).toBeLessThan(0.7);
  });

  it("sépare nettement un morceau tonal d'un signal sans tonalité", () => {
    // C'est l'écart qui compte, plus que les valeurs absolues : sous le cosinus
    // il était de trois centièmes, ce qui ne permettait aucune décision.
    const tonal = estimerTonalite(piece([[53, 57, 60], [58, 62, 65], [60, 64, 67], [65, 69, 72]]));
    const sansTonalite = estimerTonalite(bruitBlanc());
    expect(tonal.confiance - sansTonalite.confiance).toBeGreaterThan(0.3);
  });

  it("rend une corrélation, donc une valeur entre −1 et 1", () => {
    for (const b of [piece([[48, 52, 55]]), bruitBlanc(1)]) {
      const c = estimerTonalite(b).confiance;
      expect(c).toBeGreaterThanOrEqual(-1);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("robustesse", () => {
  it("ne plante pas sur un silence", () => {
    const vide = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const r = estimerTonalite(vide);
    expect(r.nom).toBeTruthy();
    expect(Number.isFinite(r.confiance)).toBe(true);
  });

  it("ne plante pas sur un tampon plus court qu'une fenêtre d'analyse", () => {
    const court = new AudioBuffer({ numberOfChannels: 1, length: 512, sampleRate: SR });
    expect(() => estimerTonalite(court)).not.toThrow();
  });
});
