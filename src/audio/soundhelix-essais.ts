// audio/soundhelix-essais.ts — Ce que les gardes du chantier SoundHelix lisent dans un XML d'essai du
// banc : l'harmonie, passée par son fichier, et ce que dit chaque piste.
//
// LES ESSAIS SONT ÉCRITS POUR ATTIC (décision D8, 2026-11-28), dans `audio/temoins-soundhelix/`, et
// rendus par le programme original (`npm run temoins-soundhelix`). Les voix d'un graphe reçoivent
// l'harmonie en fichier ; les gardes la font donc passer par l'écriture et la relecture, et éprouvent
// les deux en même temps que le moteur.
//
// UNE LECTURE À LA MESURE DES ESSAIS, ET NON UN LECTEUR D'XML : chaque champ se cherche par sa balise,
// ce que les essais, écrits à la main, permettent. Un champ absent prend la valeur par défaut que
// SoundHelix lui donne.

import { calculerHarmonie } from "./soundhelix-harmonie";
import { type HarmonieLue, VELOCITE_MAX, lireHarmonie, morceauEnMidi } from "./soundhelix-midi";

/** Le contenu de la première balise de ce nom, ou `undefined`. */
export const champ = (texte: string, balise: string): string | undefined =>
  new RegExp(`<${balise}>([^<]*)</${balise}>`).exec(texte)?.[1];

/** L'harmonie d'un essai, calculée, écrite en MIDI puis relue, comme une voix la reçoit. */
export function harmonieDeLEssai(xml: string): HarmonieLue {
  const tpb = Number(champ(xml, "ticksPerBeat"));
  const tics = Number(champ(xml, "bars")) * Number(champ(xml, "beatsPerBar")) * tpb;
  const harmonie = /<harmonyEngine[\s\S]*?<\/harmonyEngine>/.exec(xml)![0];
  const h = calculerHarmonie({
    motif: champ(harmonie, "chordPattern")!, ticsParTemps: tpb, tics,
    registre: Number(champ(harmonie, "crossoverPitch") ?? 3),
    rapprocher: (champ(harmonie, "minimizeChordDistance") ?? "true") === "true",
  });
  const notes = h.accords.flatMap((a) => a.hauteurs.map((p) => ({ tic: a.tic, tics: a.tics, hauteur: p, velocite: 800 })));
  return lireHarmonie(morceauEnMidi(notes, { ticsParTemps: tpb, tics, tempo: 120, tempsParMesure: 4, sections: h.sections }));
}

/** Un motif d'une piste : son texte, et sa résolution quand il en écrit une. */
export interface ChaineDEssai { texte: string; ticsParTemps?: number }

/** Ce que dit une piste d'un essai. */
export interface PisteDEssai {
  moteur: string;
  chaines: ChaineDEssai[];
  /** Le bloc du moteur de séquence, pour les champs propres à un moteur. */
  moteurXml: string;
  transposition: number;
  velocite: number;
  voix: string;
}

/** Lit la piste d'un instrument dans un essai. */
export function pisteDeLEssai(xml: string, instrument: string): PisteDEssai {
  const bloc = [...xml.matchAll(/<track>[\s\S]*?<\/track>/g)].map((m) => m[0])
    .find((b) => b.includes(`<instrument>${instrument}</instrument>`));
  if (!bloc) throw new Error(`l'essai n'a pas de piste « ${instrument} »`);
  const moteurXml = /<sequenceEngine[\s\S]*<\/sequenceEngine>/.exec(bloc)![0];
  const horsMoteur = bloc.replace(moteurXml, "");
  return {
    moteur: /<sequenceEngine class="(\w+)"/.exec(bloc)![1],
    chaines: [...moteurXml.matchAll(/<string(?: ticksPerBeat="(\d+)")?>([^<]*)<\/string>/g)]
      .map((m) => ({ texte: m[2], ...(m[1] ? { ticsParTemps: Number(m[1]) } : {}) })),
    moteurXml,
    transposition: Number(champ(horsMoteur, "transposition") ?? 0),
    velocite: Number(champ(horsMoteur, "velocity") ?? VELOCITE_MAX),
    voix: champ(bloc, "activityVector")!,
  };
}
