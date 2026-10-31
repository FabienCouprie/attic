// audio/descripteurs-comparaison.test.ts — Des reponses connues d'avance, sur des sons fabriques.
//
// POURQUOI CES CAS SONT LA FORME JUSTE. Le verbe `comparer` rend un tableau : huit composants, dix
// colonnes, des chiffres a une decimale. Un tel tableau est CREDIBLE quoi qu'il contienne — un canal
// confondu, une entree et une sortie echangees, un logarithme en base dix la ou il fallait deux
// rendraient exactement la meme belle sortie, et personne ne le verrait jamais. La seule facon de
// le savoir est de donner au calcul des sons dont on connait deja la reponse.
//
// CHAQUE CAS EST DONC UNE QUESTION A REPONSE UNIQUE : un son compare a lui-meme ne s'ecarte pas ;
// un son double sonne six decibels plus fort ; une sinusoide une octave au-dessus deplace le
// centroide de douze demi-tons. Ce sont des verites d'arithmetique, pas des opinions sur l'audio,
// et c'est ce qui les rend utilisables comme gardes.
import { describe, expect, it } from "vitest";

import { PLANCHER_DB, descripteursComparaison, ecartRelatifDb } from "./descripteurs-comparaison";

const SR = 48000;
const SECONDES = 1;

/** Un son d'essai : une sinusoide, eventuellement decorrelee entre ses deux canaux. */
function sinus(hz: number, o: { secondes?: number; gain?: number; canaux?: number; phaseDroite?: number } = {}): AudioBuffer {
  const secondes = o.secondes ?? SECONDES;
  const canaux = o.canaux ?? 2;
  const n = Math.round(SR * secondes);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    const phase = c === 1 ? (o.phaseDroite ?? 0) : 0;
    for (let i = 0; i < n; i++) d[i] = (o.gain ?? 0.5) * Math.sin(2 * Math.PI * hz * (i / SR) + phase);
  }
  return b;
}

/** Deux canaux de bruit independants, a partir d'un generateur congruentiel : jamais Math.random. */
function bruitDecorrele(): AudioBuffer {
  const n = SR * SECONDES;
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let x = 7919 + c * 104729;
    for (let i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (x / 0x7fffffff - 0.5) * 0.8;
    }
  }
  return b;
}

describe("l'ecart a l'entree", () => {
  it("UN SON COMPARE A LUI-MEME tombe au plancher, et non a zero decibel", () => {
    // Zero decibel voudrait dire « la difference pese autant que l'entree », c'est-a-dire un son
    // entierement refait : exactement le contraire. Les deux se confondent si l'on oublie le cas
    // de la difference nulle.
    const x = sinus(440).getChannelData(0);
    expect(ecartRelatifDb(x, x)).toBe(PLANCHER_DB);
  });

  it("UN SON DOUBLE rend exactement zero decibel, la difference valant l'entree", () => {
    const e = sinus(440).getChannelData(0);
    const s = sinus(440, { gain: 1.0 }).getChannelData(0);
    expect(ecartRelatifDb(e, s)).toBeCloseTo(0, 6);
  });

  it("UN SON INVERSE rend six decibels : la difference vaut deux fois l'entree", () => {
    const e = sinus(440).getChannelData(0);
    const s = Float32Array.from(e, (v) => -v);
    expect(ecartRelatifDb(e, s)).toBeCloseTo(20 * Math.log10(2), 5);
  });

  it("UN SILENCE EN SORTIE rend zero decibel : toute l'entree a disparu, c'est tout l'ecart", () => {
    const e = sinus(440).getChannelData(0);
    expect(ecartRelatifDb(e, new Float32Array(e.length))).toBeCloseTo(0, 6);
  });

  it("LA QUEUE D'UNE REVERBERATION NE SE COMPTE PAS : seule la partie commune est lue", () => {
    // Sans cette borne, la reverberation la plus longue passerait pour la plus transformante par
    // construction, ce qui est un classement produit par l'instrument et non par les composants.
    const e = sinus(440).getChannelData(0);
    const s = sinus(440, { secondes: 3 }).getChannelData(0);
    expect(ecartRelatifDb(e, s)).toBe(PLANCHER_DB);
  });
});

describe("les descripteurs d'un rendu", () => {
  it("UN RENDU IDENTIQUE A SON ENTREE : rien ne bouge, sur aucun axe", () => {
    const e = sinus(440);
    const d = descripteursComparaison(sinus(440), e);
    expect(d.rapportDuree).toBeCloseTo(1, 9);
    expect(d.centroideDemiTons).toBeCloseTo(0, 9);
    expect(d.ecartEntreeDb).toBe(PLANCHER_DB);
    expect(d.secondes).toBeCloseTo(SECONDES, 9);
  });

  it("UNE OCTAVE AU-DESSUS deplace la couleur de douze demi-tons", () => {
    // LE CAS QUI ATTRAPE UNE ENTREE ET UNE SORTIE ECHANGEES : le signe compte autant que la valeur,
    // et un echange rendrait moins douze avec la meme assurance.
    const d = descripteursComparaison(sinus(880), sinus(440));
    expect(d.centroideDemiTons).toBeGreaterThan(11);
    expect(d.centroideDemiTons).toBeLessThan(13);
    expect(d.centroideHz).toBeGreaterThan(700);
  });

  it("ET UNE OCTAVE EN DESSOUS la deplace d'autant, dans l'autre sens", () => {
    const d = descripteursComparaison(sinus(220), sinus(440));
    expect(d.centroideDemiTons).toBeLessThan(-11);
    expect(d.centroideDemiTons).toBeGreaterThan(-13);
  });

  it("UN RENDU DEUX FOIS PLUS LONG rend un rapport de deux", () => {
    const d = descripteursComparaison(sinus(440, { secondes: 2 }), sinus(440));
    expect(d.rapportDuree).toBeCloseTo(2, 9);
    expect(d.secondes).toBeCloseTo(2, 9);
  });

  it("LE NIVEAU : six decibels de crete en plus quand le gain double, et la sonie suit", () => {
    const bas = descripteursComparaison(sinus(440, { gain: 0.25 }), sinus(440));
    const haut = descripteursComparaison(sinus(440, { gain: 0.5 }), sinus(440));
    expect(haut.creteDb - bas.creteDb).toBeCloseTo(20 * Math.log10(2), 3);
    expect(haut.sonieLufs - bas.sonieLufs).toBeCloseTo(20 * Math.log10(2), 1);
  });

  it("UN SILENCE ne rend ni moins l'infini ni NaN, mais le plancher", () => {
    const silence = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
    const d = descripteursComparaison(silence, sinus(440));
    // UN SEUL INFINI CONTAMINE TOUT LE TABLEAU : l'etendue d'un axe deviendrait infinie, et cet axe
    // passerait en tete du classement en annoncant qu'il separe mieux que tous les autres.
    expect(Number.isFinite(d.sonieLufs)).toBe(true);
    expect(Number.isFinite(d.creteDb)).toBe(true);
    expect(d.creteDb).toBe(PLANCHER_DB);
  });

  it("LA CORRELATION : un vaut mono, moins un vaut l'opposition de phase, zero l'independance", () => {
    expect(descripteursComparaison(sinus(440), sinus(440)).correlation).toBeCloseTo(1, 6);
    expect(descripteursComparaison(sinus(440, { phaseDroite: Math.PI }), sinus(440)).correlation)
      .toBeCloseTo(-1, 5);
    expect(Math.abs(descripteursComparaison(bruitDecorrele(), sinus(440)).correlation))
      .toBeLessThan(0.1);
  });

  it("UN RENDU MONO SE MESURE, la ou lire un second canal absent fait tout tomber", () => {
    // LE PIEGE EXACT, ET J'AI D'ABORD ECRIT LE MAUVAIS. J'avais note qu'un canal droit remplace par
    // un tableau vide rendrait « une correlation de zero, c'est-a-dire tres large ». C'est FAUX :
    // `correlation` rend UN quand un canal est silencieux — son denominateur s'annule et elle le
    // declare mono. Le bon code et ce faux-la donnent donc le meme chiffre, et mon cas passait au
    // vert pour une raison qui n'existait pas.
    //
    // CE QUI SE JOUE VRAIMENT EST PLUS BRUTAL : lire le canal 1 d'un tampon a un canal LEVE, et
    // c'est tout le releve du composant qui disparait. Le cas l'exige donc des deux cotes.
    const mono = sinus(440, { canaux: 1 });
    expect(() => mono.getChannelData(1), "c'est bien ce que ce garde empeche").toThrow();
    const d = descripteursComparaison(mono, sinus(440));
    expect(d.correlation).toBeCloseTo(1, 6);
    expect(Number.isFinite(d.sonieLufs)).toBe(true);
  });

  it("LES ESPECES SCHAEFFERIENNES sont celles du module, et non des chaines inventees", () => {
    const d = descripteursComparaison(sinus(440), sinus(440));
    expect(["pur", "tonique", "groupe", "nodal", "blanc", "aucune"]).toContain(d.masse);
    expect(["impulsion", "tenue", "crescendo", "decrescendo", "delta", "aucune"]).toContain(d.dynamique);
    // Une sinusoide tenue d'une seconde : une seule hauteur franche, et aucune enveloppe.
    expect(d.masse).toBe("pur");
    expect(d.dynamique).toBe("tenue");
  });
});
