// plugins/sequence-sur-banque.test.ts — Une séquence écrite, jouée par une banque.
//
// CE QUE CE FICHIER DOIT PROUVER. Le composant relie deux moitiés du dépôt qui ne se parlaient pas :
// ce que la composition ÉCRIT, et le timbre qu'« Étaler sur le clavier » FABRIQUE. Trois choses en
// font la valeur, et ce sont elles qu'on vérifie : les hauteurs de la séquence sont bien celles
// qu'on entend, les instants sont respectés, et deux banques différentes sur la MÊME séquence
// donnent deux sons différents. Sans cette dernière, le composant pourrait ignorer sa banque et
// personne ne le verrait.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { fiches } from "./sequence-sur-banque";
import { construireBanque } from "../audio/clavier-banque";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Sequence } from "../audio/sequence";

const SR = 16000;
const RACINE = 57; // La3 = 220 Hz
const hertz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const fiche = fiches.find((f) => f.id === "sequence-sur-banque")!;

/** Un son harmonique à une hauteur donnée, l'étoffe d'une banque. */
function sonSource(dureeSec: number, note = RACINE, partiels = 2): AudioBuffer {
  const n = Math.round(dureeSec * SR);
  const audio = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = audio.getChannelData(0);
  const f = hertz(note);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= partiels; k++) v += Math.sin(2 * Math.PI * f * k * t) / k;
    d[i] = 0.5 * Math.min(1, t / 0.005) * Math.exp(-t * 1.5) * v;
  }
  return audio;
}

const banqueDe = (partiels: number) => construireBanque(sonSource(0.4, RACINE, partiels), {
  racineSource: RACINE, largeur: 6, suiviTouche: 0, transposer: (a) => a,
});

const sequence = (notes: [number, number, number][]): Sequence => ({
  notes: notes.map(([note, debut, fin]) => ({ note, velocite: 100, debut, fin })),
  tempo: 120,
});

const contexte = (entrees: unknown[], params: Record<string, number | string> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "sequence-sur-banque", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const jouer = async (entrees: unknown[], params: Record<string, number | string> = {}) =>
  fiche.executer(contexte(entrees, params) as any);

/** Énergie d'une tranche du rendu, de quoi dire quand une note sonne. */
function energie(b: AudioBuffer, debutSec: number, finSec: number): number {
  const d = b.getChannelData(0);
  let s = 0;
  for (let i = Math.round(debutSec * b.sampleRate); i < Math.min(d.length, Math.round(finSec * b.sampleRate)); i++) {
    s += d[i] * d[i];
  }
  return s;
}

describe("jouer une séquence sur une banque", () => {
  it("REND LA SÉQUENCE, et le message dit ce qu'il a joué", async () => {
    const r: any = await jouer([sequence([[60, 0, 0.3], [64, 0.3, 0.6], [67, 0.6, 0.9]]), banqueDe(2)]);
    expect(r.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(r.message).toMatch(/3 notes/);
    expect((r.valeurs[0] as AudioBuffer).duration).toBeGreaterThan(0.9);
  });

  it("ET CHAQUE NOTE SONNE À SON INSTANT, non pas toutes au début", async () => {
    // Deux notes séparées par un silence : l'énergie doit suivre, sans quoi le composant poserait
    // tout à zéro et le message serait pourtant juste.
    const r: any = await jouer([sequence([[60, 0, 0.2], [72, 0.8, 1]]), banqueDe(2)]);
    const a = r.valeurs[0] as AudioBuffer;
    expect(energie(a, 0, 0.2)).toBeGreaterThan(0);
    expect(energie(a, 0.4, 0.7)).toBeLessThan(energie(a, 0, 0.2) / 100);
    expect(energie(a, 0.8, 1)).toBeGreaterThan(0);
  });

  it("ET LA BANQUE DONNE LE TIMBRE : deux banques, deux sons pour la même séquence", async () => {
    // LA PREUVE QUI COMPTE. Sans elle, un composant qui ignorerait sa banque passerait les deux cas
    // précédents : il rendrait des notes aux bons instants, d'un timbre quelconque.
    const seq = sequence([[60, 0, 0.3]]);
    const un = (await jouer([seq, banqueDe(1)]) as any).valeurs[0] as AudioBuffer;
    const huit = (await jouer([seq, banqueDe(8)]) as any).valeurs[0] as AudioBuffer;
    // LE PASSAGE PAR ZÉRO NE DISTINGUE RIEN ICI, et c'est mesuré : un fondamental fort commande les
    // croisements, et les deux banques en donnaient exactement 176. C'est donc le PARTIEL qu'on
    // regarde, par un Goertzel au triple de la hauteur jouée.
    const partiel = (b: AudioBuffer, hz: number) => {
      const d = b.getChannelData(0);
      const w = (2 * Math.PI * hz) / b.sampleRate;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < d.length; i++) { const s = d[i] + c * s1 - s2; s2 = s1; s1 = s; }
      return s1 * s1 + s2 * s2 - c * s1 * s2;
    };
    const fondamentale = hertz(60);
    const rapport = (b: AudioBuffer) => partiel(b, 3 * fondamentale) / Math.max(1e-12, partiel(b, fondamentale));
    expect(rapport(huit)).toBeGreaterThan(rapport(un) * 10);
  });

  it("ET UNE HAUTEUR FRACTIONNAIRE SONNE JUSTE, ce qu'aucun clavier tempéré ne saurait faire", () => {
    // CE N'EST PAS UN DÉTAIL : les composants spectraux rendent des hauteurs entre les demi-tons,
    // les partiels d'une fondamentale n'étant pas tempérés. Une banque les joue par
    // RÉÉCHANTILLONNAGE, donc le quart de ton est là, exactement. Le rapport de lecture se prend sur
    // la note fractionnaire elle-même, et ce cas l'empêche d'être arrondi un jour.
    // LE PASSAGE PAR ZÉRO NE DISTINGUE PAS UN QUART DE TON, et c'est mesuré : les deux rendus en
    // donnaient exactement le même compte. C'est donc la hauteur qu'on interroge, par un Goertzel
    // aux deux fréquences attendues.
    const banque = banqueDe(1);
    const energieA = (b: AudioBuffer, hz: number) => {
      const d = b.getChannelData(0);
      const w = (2 * Math.PI * hz) / b.sampleRate;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < d.length; i++) { const s = d[i] + c * s1 - s2; s2 = s1; s1 = s; }
      return s1 * s1 + s2 * s2 - c * s1 * s2;
    };
    const rendu = async (note: number) =>
      (await jouer([sequence([[note, 0, 0.5]]), banque]) as any).valeurs[0] as AudioBuffer;
    const tempere = hertz(RACINE) * Math.pow(2, 3 / 12);     // la note 60, sur la grille
    const quartDeTon = hertz(RACINE) * Math.pow(2, 3.5 / 12); // la note 60,5, entre deux touches
    return Promise.all([rendu(60), rendu(60.5)]).then(([entier, quart]) => {
      expect(energieA(entier, tempere)).toBeGreaterThan(energieA(entier, quartDeTon));
      expect(energieA(quart, quartDeTon)).toBeGreaterThan(energieA(quart, tempere));
    });
  });

  it("ET « RAMENÉES AU DEMI-TON » LA POSE SUR LA GRILLE, en disant de combien", async () => {
    // LE CHOIX EST EXPLICITE, demandé par Fabien : ni l'une ni l'autre des deux grilles n'est
    // fausse, c'est le réglage qui dit laquelle. Une note à 60,5 ramenée donne exactement la note
    // 61, et le message compte le déplacement pour qu'il ne se fasse pas en silence.
    const banque = banqueDe(1);
    const grille: any = await jouer(
      [sequence([[60.5, 0, 0.5], [67, 0.5, 1]]), banque], { "Hauteurs": "demi-ton" } as any,
    );
    expect(grille.message).toMatch(/1 ramenées, jusqu'à 50 centièmes/);
    const droit = (await jouer([sequence([[61, 0, 0.5], [67, 0.5, 1]]), banque]) as any).valeurs[0] as AudioBuffer;
    const ramene = grille.valeurs[0] as AudioBuffer;
    // Le rendu ramené est celui de la note entière, échantillon par échantillon.
    const a = droit.getChannelData(0);
    const b = ramene.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeLessThan(1e-6);
  });

  it("ET SANS HAUTEUR FRACTIONNAIRE, LE RÉGLAGE NE CHANGE RIEN, ni le son ni le message", async () => {
    // La condition de sûreté : la plupart des séquences du dépôt sont entières, et elles ne doivent
    // pas s'apercevoir que ce réglage existe.
    const seq = sequence([[60, 0, 0.3], [64, 0.3, 0.6]]);
    const banque = banqueDe(2);
    const ecrites: any = await jouer([seq, banque]);
    const surGrille: any = await jouer([seq, banque], { "Hauteurs": "demi-ton" } as any);
    expect(surGrille.message).toBe(ecrites.message);
    const a = (ecrites.valeurs[0] as AudioBuffer).getChannelData(0);
    const b = (surGrille.valeurs[0] as AudioBuffer).getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart).toBeLessThan(1e-9);
  });

  it("LE VOLUME AGIT, et la nuance avec lui", async () => {
    const seq = sequence([[60, 0, 0.3]]);
    const crete = (b: AudioBuffer) => {
      const d = b.getChannelData(0);
      let c = 0;
      for (let i = 0; i < d.length; i++) c = Math.max(c, Math.abs(d[i]));
      return c;
    };
    const fort = (await jouer([seq, banqueDe(2)], { Volume: 100 }) as any).valeurs[0] as AudioBuffer;
    const faible = (await jouer([seq, banqueDe(2)], { Volume: 20 }) as any).valeurs[0] as AudioBuffer;
    expect(crete(faible)).toBeLessThan(crete(fort) / 2);
  });

  it("ET LE RELÂCHEMENT ALLONGE LA SORTIE au-delà de la dernière note", async () => {
    const seq = sequence([[60, 0, 0.3]]);
    const bref = (await jouer([seq, banqueDe(2)], { "Relâchement": 10 }) as any).valeurs[0] as AudioBuffer;
    const long = (await jouer([seq, banqueDe(2)], { "Relâchement": 900 }) as any).valeurs[0] as AudioBuffer;
    expect(long.duration).toBeGreaterThan(bref.duration + 0.5);
  });

  it("JOUE AUSSI UN FICHIER MIDI, ce qui raccourcit la chaîne d'un composant", async () => {
    // L'ENTRÉE MIDI A ÉTÉ DEMANDÉE PAR FABIEN, le MIDI étant ce que produisent les séquenceurs, les
    // claviers et la notation : « pourquoi ne pas ajouter un composant jouer midi sur une banque ? »
    // Plutôt qu'un nœud de plus, une entrée de plus, et la lecture du format reste unique.
    const fichier = notesVersFichierMidi(
      [{ note: 60, velocite: 100, debut: 0, fin: 0.4 }, { note: 67, velocite: 100, debut: 0.4, fin: 0.8 }],
      120,
    );
    const r: any = await jouer([null, banqueDe(2), fichier]);
    expect(r.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(r.message).toMatch(/2 notes/);
    expect(r.message).toMatch(/depuis le MIDI/);
  });

  it("ET « CANAL » Y SÉPARE LES VOIX, ce qui distribue une partition sur deux banques", async () => {
    const voix = (note: number, canal: number) => notesVersFichierMidi(
      [{ note, velocite: 100, debut: 0, fin: 0.4 }], 120, canal,
    );
    const banque = banqueDe(2);
    const sur0: any = await jouer([null, banque, voix(60, 0)], { "Canal": 0 });
    expect(sur0.message).toMatch(/1 notes/);
    expect(sur0.message).toMatch(/canal 0/);
    // Le même fichier lu sur un autre canal ne donne rien, et le dit au lieu de rendre du silence.
    const sur1: any = await jouer([null, banque, voix(60, 0)], { "Canal": 1 });
    expect(sur1.valeurs[0]).toBeNull();
    expect(sur1.message).toMatch(/canal 1/);
  });

  it("ET LA SÉQUENCE L'EMPORTE QUAND LES DEUX ARRIVENT, le message disant d'où viennent les notes", () => {
    // Une séquence porte plus qu'un fichier MIDI, ses hauteurs pouvant ne pas tomber sur un demi-ton.
    // Le MIDI est la route courte, non la route principale.
    const fichier = notesVersFichierMidi(
      [{ note: 60, velocite: 100, debut: 0, fin: 0.4 }, { note: 64, velocite: 100, debut: 0.4, fin: 0.8 }],
      120,
    );
    return jouer([sequence([[72, 0, 0.3]]), banqueDe(2), fichier]).then((r: any) => {
      expect(r.message).toMatch(/1 notes/);
      expect(r.message).not.toMatch(/MIDI/);
    });
  });

  it("SANS SÉQUENCE OU SANS BANQUE, IL LE DIT et n'invente rien", async () => {
    const sansSeq: any = await jouer([null, banqueDe(2)]);
    expect(sansSeq.valeurs[0]).toBeNull();
    expect(sansSeq.message).toMatch(/[Ss]équence|sequence/);
    const sansBanque: any = await jouer([sequence([[60, 0, 0.3]]), null]);
    expect(sansBanque.valeurs[0]).toBeNull();
    expect(sansBanque.message).toMatch(/[Bb]anque|bank/);
  });

  it("ET UNE NOTE SANS DURÉE EST ÉCARTÉE, en le disant plutôt qu'en la jouant", async () => {
    const r: any = await jouer([sequence([[60, 0, 0.3], [62, 0.5, 0.5]]), banqueDe(2)]);
    expect(r.message).toMatch(/1 notes/);
    expect(r.message).toMatch(/1 sans durée/);
  });
});
