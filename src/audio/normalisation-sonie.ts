// audio/normalisation-sonie.ts — Normaliser à la SONIE, et non à la crête.
//
// D'après la recommandation ITU-R BS.1770 et EBU R 128 : la sonie intégrée d'un programme se
// mesure en LUFS, sur un signal filtré en K — un plateau haut au-dessus de 1,5 kHz et une coupure
// sous 40 Hz, qui approchent la sensibilité de l'oreille — puis moyenné avec une porte qui écarte
// les silences.
//
// POURQUOI LA CRÊTE NE SUFFIT PAS, et c'est le fond du sujet. Normaliser à la crête aligne le plus
// grand échantillon de deux morceaux, ce qui ne dit rien de leur force : une batterie sèche et une
// nappe compressée peuvent culminer toutes deux à 0 dBFS et différer de quinze décibels à
// l'oreille. C'est la raison pour laquelle toutes les plateformes de diffusion ont cessé de
// normaliser à la crête vers 2015 — et c'est aussi ce qui a mis fin à la guerre du volume, qui
// consistait précisément à gagner en sonie ce que la crête ne mesurait pas.
//
// CE QUE CE MODULE REFUSE DE FAIRE, ET IL FAUT LE DIRE. Quand le gain demandé ferait dépasser le
// plafond de crête, trois réponses sont possibles : écrêter, limiter, ou ne pas atteindre la
// cible. Écrêter abîmerait le son en silence. Limiter glisserait un traitement de dynamique
// derrière un bouton qui dit « normaliser », c'est-à-dire changerait le son sans le dire. Ce
// module choisit la troisième et l'ANNONCE : le gain est réduit, la cible n'est pas atteinte, et
// le nœud l'écrit. À l'utilisateur de mettre un limiteur devant s'il veut les deux.
//
// LA SONIE OBTENUE EST REMESURÉE, jamais prédite. Le gain en décibels décale la sonie d'autant, en
// théorie ; le vérifier sur le résultat est ce qui attraperait une faute dans la pondération ou
// dans la porte, qu'aucun calcul de gain ne peut révéler.

import { mesurerNiveau } from "./vumetre";

export interface ResultatNormalisationSonie {
  audio: AudioBuffer;
  /** Sonie intégrée mesurée avant, en LUFS. */
  lufsAvant: number;
  /** Sonie intégrée REMESURÉE sur le résultat, en LUFS. */
  lufsApres: number;
  /** Gain appliqué, en décibels. */
  gainDb: number;
  /** Vrai pic du résultat, en dBTP. */
  vraiPicDb: number;
  /** Vrai : le plafond a empêché d'atteindre la cible. */
  plafonne: boolean;
}

export interface OptionsNormalisationSonie {
  /** Vrai pic à ne pas dépasser, en dBTP. −1 est la convention de diffusion. */
  plafondDb?: number;
}

const LINEAIRE = (db: number) => Math.pow(10, db / 20);

/**
 * Amène la sonie intégrée à la cible, sans dépasser le plafond de vrai pic.
 *
 * Un son silencieux est rendu tel quel : il n'a pas de sonie à déplacer, et le gain infini que
 * demanderait un −∞ LUFS n'aurait aucun sens.
 */
export function normaliserSonie(
  buffer: AudioBuffer, cibleLufs: number, o: OptionsNormalisationSonie = {},
): ResultatNormalisationSonie {
  const plafondDb = o.plafondDb ?? -1;
  const avant = mesurerNiveau(buffer);
  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  // LE PLANCHER DU VU-MÈTRE EST −120 EXACTEMENT (cf. `vumetre.ts`), et non moins l'infini : la
  // comparaison doit l'inclure, faute de quoi un silence demanderait un gain de cent décibels.
  // C'est ce qu'un test a montré : 106 dB proposés sur un tampon vide.
  const muet = !Number.isFinite(avant.lufs) || avant.lufs <= -120 || !Number.isFinite(avant.vraiPicDb);
  // Le gain que la sonie demande, et celui que le plafond autorise : on garde le plus petit.
  const gainSonie = muet ? 0 : cibleLufs - avant.lufs;
  const gainPlafond = muet ? 0 : plafondDb - avant.vraiPicDb;
  const gainDb = muet ? 0 : Math.min(gainSonie, gainPlafond);
  const gain = LINEAIRE(gainDb);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain;
  }

  const apres = mesurerNiveau(sortie);
  return {
    audio: sortie,
    lufsAvant: avant.lufs,
    lufsApres: apres.lufs,
    gainDb,
    vraiPicDb: apres.vraiPicDb,
    plafonne: !muet && gainPlafond < gainSonie - 0.01,
  };
}
