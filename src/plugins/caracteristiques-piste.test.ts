// plugins/caracteristiques-piste.test.ts — Le vecteur montré est celui que la classification emploie.
//
// LE TEST QUI JUSTIFIE LE NŒUD. Il n'ajoute aucun calcul : son intérêt tient entièrement à ce que
// ses nombres soient, au bit près, ceux qu'une classification aurait employés. Si cela cessait
// d'être vrai — un extrait plus long, un coefficient de plus — le nœud rendrait des valeurs
// plausibles et incomparables, ce qui est pire que pas de nœud du tout, puisque rien ne le dirait.
// Le polyfill est nécessaire au-delà de trente secondes : `extraitCentre` construit alors un vrai
// `AudioBuffer` pour découper l'extrait, et il n'y en a pas dans l'environnement de test nu.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { extraireVecteurFeatures } from "../audio/features-piste";

const SR = 44100;

/** Un tampon minimal, sans passer par Web Audio. */
function tampon(remplir: (d: Float32Array) => void, dureeS = 2, canaux = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const donnees = Array.from({ length: canaux }, () => new Float32Array(n));
  donnees.forEach(remplir);
  return {
    numberOfChannels: canaux, length: n, sampleRate: SR, duration: dureeS,
    getChannelData: (c: number) => donnees[c],
    copyFromChannel() {}, copyToChannel() {},
  } as unknown as AudioBuffer;
}

const sinus = (freq: number, dureeS = 2) =>
  tampon((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR); }, dureeS);

describe("le vecteur de caractéristiques", () => {
  it("a QUARANTE composantes, et autant d'étiquettes", () => {
    const { vecteur, etiquettes } = extraireVecteurFeatures(sinus(440));
    expect(vecteur.length).toBe(40);
    expect(etiquettes.length).toBe(vecteur.length);
  });

  it("ses quatre familles sont dans l'ordre annoncé par la notice", () => {
    const { etiquettes } = extraireVecteurFeatures(sinus(440));
    expect(etiquettes[0]).toBe("Tempo (BPM)");
    expect(etiquettes[1]).toBe("Centroïde spectral");
    expect(etiquettes.slice(2, 14).every((l) => l.startsWith("Chroma"))).toBe(true);
    expect(etiquettes.slice(14).every((l) => l.startsWith("MFCC"))).toBe(true);
  });

  it("les douze classes de hauteur y sont toutes, une fois chacune", () => {
    const { etiquettes } = extraireVecteurFeatures(sinus(440));
    const chroma = etiquettes.filter((l) => l.startsWith("Chroma"));
    expect(chroma.length).toBe(12);
    expect(new Set(chroma).size).toBe(12);
  });

  it("chaque coefficient cepstral porte sa moyenne ET sa variance", () => {
    const { etiquettes } = extraireVecteurFeatures(sinus(440));
    const moyennes = etiquettes.filter((l) => l.endsWith("(moyenne)"));
    const variances = etiquettes.filter((l) => l.endsWith("(variance)"));
    expect(moyennes.length).toBe(13);
    expect(variances.length).toBe(13);
  });

  it("IL EST DÉTERMINISTE : deux appels sur le même son rendent le même vecteur", () => {
    const b = sinus(440);
    expect(extraireVecteurFeatures(b).vecteur).toEqual(extraireVecteurFeatures(b).vecteur);
  });

  it("aucune composante n'est NaN ni infinie", () => {
    expect(extraireVecteurFeatures(sinus(440)).vecteur.every(Number.isFinite)).toBe(true);
  });

  it("un silence rend un vecteur complet, de quarante valeurs finies", () => {
    const { vecteur } = extraireVecteurFeatures(tampon(() => {}));
    expect(vecteur.length).toBe(40);
    expect(vecteur.every(Number.isFinite)).toBe(true);
  });

  it("une piste plus courte qu'une fenêtre d'analyse ne fait pas raccourcir le vecteur", () => {
    expect(extraireVecteurFeatures(sinus(440, 0.01)).vecteur.length).toBe(40);
  });

  it("deux sons différents donnent deux vecteurs différents", () => {
    const a = extraireVecteurFeatures(sinus(220)).vecteur;
    const b = extraireVecteurFeatures(sinus(1760)).vecteur;
    expect(a).not.toEqual(b);
  });

  it("LE CENTROÏDE SÉPARE LE SOURD DU BRILLANT, comme la notice l'annonce", () => {
    const grave = extraireVecteurFeatures(sinus(200)).vecteur[1];
    const aigu = extraireVecteurFeatures(sinus(4000)).vecteur[1];
    expect(aigu).toBeGreaterThan(grave);
  });

  it("LA CLASSE DE HAUTEUR DOMINANTE EST CELLE QU'ON JOUE", () => {
    // 440 Hz, c'est un la : la onzième des douze classes, l'indice 9 en partant de do.
    const { vecteur, etiquettes } = extraireVecteurFeatures(sinus(440, 4));
    const chroma = etiquettes.map((l, i) => (l.startsWith("Chroma") ? i : -1)).filter((i) => i >= 0);
    const dominante = chroma.reduce((x, y) => (vecteur[y] > vecteur[x] ? y : x), chroma[0]);
    expect(etiquettes[dominante]).toBe("Chroma A");
  });

  it("le stéréo est accepté autant que le mono", () => {
    const stereo = tampon((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / SR); }, 2, 2);
    expect(extraireVecteurFeatures(stereo).vecteur.length).toBe(40);
  });
});

describe("le plafond de trente secondes", () => {
  it("UNE PISTE LONGUE ET SON EXTRAIT CENTRAL DONNENT LE MÊME VECTEUR", () => {
    // C'est la propriété qui rend le nœud comparable à la classification : au-delà de trente
    // secondes, seul l'extrait central compte, et allonger la piste autour ne change rien.
    const trente = extraireVecteurFeatures(sinus(440, 30)).vecteur;
    const soixante = extraireVecteurFeatures(sinus(440, 60)).vecteur;
    // Le même sinus : l'extrait central de l'une et de l'autre portent le même son.
    for (let i = 0; i < trente.length; i++) {
      expect(soixante[i], `composante ${i}`).toBeCloseTo(trente[i], 3);
    }
  });
});
