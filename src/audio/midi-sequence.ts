// audio/midi-sequence.ts — Le rendu d'une sequence de notes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import type { CaractereTimbreId } from "./timbres";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { traduire } from "../i18n";
import type { Note } from "./note";
import { melangerTampons, RESERVE_BATTERIE, separerPercussions, tamponSilencieux } from "./sequence-percussion";
import { rendreAvecSF2 } from "./midi-soundfont";
import { sansRecouvrementDeHauteur } from "./recouvrement-hauteur";
import { frequenceDeTravail } from "./frequence-de-travail";
import { frequenceDeNoteMidi } from "./commun";
import { CANAL_PERCUSSION } from "./batterie-midi";
import { voieDuCanal } from "./midi-canal-percussion";

export type NoteEvenement = Note;


/**
 * Trois caractères de la synthèse FM, et le réglage d'origine. « Brillante » est ce réglage même
 * (rapport 2, indice 3) ; « Douce » ramène l'indice près d'un sinus et adoucit l'attaque ;
 * « Percutante » monte l'indice et laisse la note retomber vite, comme une lame frappée.
 */
/**
 * Les timbres de la synthèse locale. `idxMod` est l'indice de modulation de fréquence.
 *
 * `pur` EST UNE SINUSOÏDE, ET IL A ÉTÉ AJOUTÉ POUR UNE RAISON MESURÉE. Les autres caractères
 * modulent : à l'indice trois du timbre d'origine, chaque note engendre une huitaine de bandes
 * latérales, et ce qu'on entend n'est plus la note mais son cortège. Pour une mélodie c'est un
 * timbre ; pour un AGRÉGAT CALCULÉ, c'est une falsification. Sur une série harmonique de douze
 * partiels à 110 Hz, dont les plus forts sont les plus graves, le timbre d'origine laisse **1,2 %
 * de l'énergie sous 500 Hz et en porte 98,8 % entre 500 Hz et 4 kHz** : le spectre entendu n'est
 * pas celui qui a été calculé. À indice nul, la note est la sinusoïde qu'on lui a demandée.
 */
const CARACTERES_FM: Record<CaractereTimbreId | "origine" | "pur", { ratio: number; idxMod: number; a: number; d: number; sVal: number; r: number }> = {
  origine: { ratio: 2, idxMod: 3, a: 0.005, d: 0.08, sVal: 0.7, r: 0.04 },
  pur: { ratio: 1, idxMod: 0, a: 0.02, d: 0.05, sVal: 1, r: 0.15 },
  brillante: { ratio: 2, idxMod: 3, a: 0.005, d: 0.08, sVal: 0.7, r: 0.04 },
  douce: { ratio: 1, idxMod: 0.7, a: 0.02, d: 0.15, sVal: 0.6, r: 0.1 },
  percutante: { ratio: 2, idxMod: 5, a: 0.001, d: 0.06, sVal: 0.15, r: 0.03 },
};

/** Le fondu qui ferme une séquence coupée : celui qui fermait chaque note avant les enveloppes. */
const FONDU_DE_COUPE = 0.005;

/**
 * Le même son, à la durée de la pièce : le silence qui suit en fait partie, et ce qui la dépasse non.
 *
 * LA DURÉE VOULUE L'EMPORTE, et c'est la règle de `melangerTampons` : une mesure de deux secondes en
 * rend deux, et deux cercles de tailles différentes finissent ensemble. Depuis que le SoundFont rend
 * le relâchement de ses enveloppes, sa voie dépasse la dernière note ; la queue est donc coupée à la
 * durée, et la coupe se ferme sur cinq millisecondes, comme se fermait chaque note avant : sans ce
 * fondu, une note encore tenue à la fin claquerait.
 */
function ajusterA(buffer: AudioBuffer, duree: number): AudioBuffer {
  const longueur = Math.ceil(duree * buffer.sampleRate);
  if (longueur === buffer.length) return buffer;
  const sortie = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels, length: longueur, sampleRate: buffer.sampleRate,
  });
  const coupe = longueur < buffer.length;
  const fondu = Math.min(longueur, Math.floor(FONDU_DE_COUPE * buffer.sampleRate));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const source = buffer.getChannelData(c);
    sortie.copyToChannel(coupe ? source.subarray(0, longueur) : source, c, 0);
    if (!coupe) continue;
    const canal = sortie.getChannelData(c);
    for (let k = 1; k <= fondu; k++) canal[longueur - k] *= (k - 1) / fondu;
  }
  return sortie;
}

/**
 * Une séquence rendue en son : les hauteurs par la synthèse choisie, la batterie par la sienne.
 *
 * LE CANAL DE BATTERIE EST HONORÉ, et il ne l'était pas. Toute note partait en hauteur, canal
 * compris : une grosse caisse écrite en 36 sur le canal dix s'entendait en sinusoïde de trente-trois
 * hertz, alors que le fichier MIDI rendu à côté sonnait juste dans un séquenceur. Les frappes vont
 * désormais, au SoundFont, à un kit de sa banque 128, et en FM ou sans kit au synthétiseur de
 * percussions que partagent les autres rythmes du dépôt : voir `rendreFrappes`.
 *
 * UNE SÉQUENCE SANS CANAL NE CHANGE PAS D'UN ÉCHANTILLON : le canal absent vaut zéro, le partage
 * rend alors toutes les notes du côté des hauteurs, et le chemin est celui d'avant, mot pour mot.
 */
export async function rendreSequence(
  notes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument?: number,
  banque?: number,
  caractere?: CaractereTimbreId | "pur",
  dureeMin?: number,
): Promise<AudioBuffer> {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, Math.ceil(0.5 * frequenceDeTravail()), frequenceDeTravail());
    return ctx.startRendering();
  }
  // LE RENDU JOUE CE QUE LE FICHIER DIRA, et c'est la seule façon de supprimer l'écart relevé par le
  // banc de conformité. Sept composants empilaient deux notes de même hauteur sur un même canal :
  // l'application les tenait toutes, un lecteur conforme relançait la note et le premier note-off
  // éteignait tout. Résoudre ici ET à l'écriture fait que les deux racontent la même chose ; le
  // résoudre d'un seul côté n'aurait fait que déplacer l'écart. Voir `recouvrement-hauteur.ts`.
  notes = sansRecouvrementDeHauteur(notes);

  // UNE PIÈCE NE FINIT PAS FORCÉMENT SUR UNE NOTE. La longueur se prenait sur la dernière ; un
  // rythme qui se termine par un silence perdait donc ce silence, mesuré à 1,5 seconde rendue pour
  // une mesure de 2. L'appelant qui connaît la durée voulue la dit, et elle l'emporte.
  // ELLE SE PREND SUR TOUTES LES NOTES, batterie comprise, avant tout partage : les deux moitiés
  // doivent tomber dans le même tampon, et une séquence n'a qu'une durée.
  const duree = Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), dureeMin ?? 0, 0.5);

  const { frappes, hauteurs } = separerPercussions(notes);
  if (frappes.length > 0) {
    const { tampon, auKit } = await rendreFrappes(frappes, mode, volume, instrument, banque);
    // Un kit du SoundFont rend la queue de ses enveloppes : elle est coupée à la durée, avec le fondu.
    const batterie = auKit ? ajusterA(tampon, duree) : tampon;
    const melodie = hauteurs.length > 0
      ? await rendreHauteurs(hauteurs, mode, volume, instrument, banque, caractere, duree)
      : tamponSilencieux(duree, batterie.sampleRate);
    return melangerTampons(melodie, batterie, duree);
  }

  return rendreHauteurs(notes, mode, volume, instrument, banque, caractere, duree);
}

/**
 * Les frappes du canal dix d'une séquence : un kit du SoundFont, ou le synthétiseur de percussions.
 *
 * LA RÈGLE EST CELLE DU FICHIER MIDI, `voieDuCanal`, et elle ne l'était pas avant le 2026-11-24 : la
 * même batterie sonnait au kit par « Point d'écoute MIDI » et au synthétiseur par « Point d'écoute
 * séquence ». Une séquence ne porte pas de programme par canal ; ce que le fichier dirait vaut donc
 * programme 0, banque 0, et le réglage « Instrument » de l'appelant est ce qui s'impose : un kit y
 * choisit le kit, un preset mélodique laisse le canal dix au Standard.
 *
 * LE KIT N'A PAS DE RÉSERVE. Il est rendu par le même moteur et à la même échelle que les hauteurs
 * SoundFont ; `RESERVE_BATTERIE` corrige le niveau plein du synthétiseur, et lui seul.
 *
 * SANS SOUNDFONT CHARGÉ, UNE BATTERIE SEULE NE LÈVE PAS : elle passe au synthétiseur, comme avant.
 * Ce sont les hauteurs, s'il y en a, qui disent qu'il manque.
 */
async function rendreFrappes(
  frappes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument: number | undefined,
  banque: number | undefined,
): Promise<{ tampon: AudioBuffer; auKit: boolean }> {
  const sf2 = mode === "SoundFont" ? sf2Chargee() : null;
  if (sf2) {
    const voie = voieDuCanal(sf2.presets, CANAL_PERCUSSION, { programme: 0, banque: 0 }, { programme: instrument, banque });
    if (voie.voie === "soundfont") {
      console.log(`[attic] rendreSequence canal ${CANAL_PERCUSSION} -> kit programme ${voie.programme} banque=${voie.banque} (${frappes.length} frappes)`);
      return { tampon: rendreAvecSF2(sf2, frappes, volume, voie.programme, voie.banque), auKit: true };
    }
  }
  const { rendreBatterieMidi } = await import("./tone-synths");
  // LA MÊME RÉSERVE QUE LA SYNTHÈSE DES HAUTEURS, et le niveau est un gain : multiplier le volume
  // revient exactement à multiplier le rendu. Voir `RESERVE_BATTERIE` pour la mesure qui l'exige.
  // Le synthétiseur rend sa demi-seconde de queue, que `melangerTampons` coupe sans fondu, comme avant.
  return { tampon: await rendreBatterieMidi({ notes: frappes, volume: volume * RESERVE_BATTERIE }), auKit: false };
}

/**
 * Le gain d'une note, de sa vélocité et du volume du nœud.
 *
 * POURQUOI CETTE FORMULE SORT DE LA BOUCLE QUI L'EMPLOYAIT. Elle décide du niveau du son RENDU, et
 * un clavier jouable doit sonner comme ce qu'il rendra : c'est la règle que `vues-domaine/
 * clavier-son.ts` énonce, et que la synthèse interne d'un clavier ne tenait pas. Sa touche sonnait à
 * un niveau ÉCRIT EN DUR, qui ignorait « Volume » comme la vélocité de la frappe, quand la même
 * touche jouée au SoundFont passait par ici et les suivait. Recopier la formule la ferait dériver ;
 * la nommer une fois fait que le jeu en direct et le rendu ne peuvent plus diverger.
 *
 * LE VOLUME EST BORNÉ ICI, comme il l'était dans la boucle : un réglage hors bornes vient d'un
 * graphe enregistré à la main, et il ne doit pas produire un gain négatif ni supérieur à l'échelle.
 *
 * LA VÉLOCITÉ, ELLE, NE L'EST PAS, ET C'EST VOULU. La borner serait un changement de comportement
 * du RENDU, que `tests-e2e/empreintes.json` surveille pour soixante-douze composants : une
 * vélocité hors de l'octet déplacerait leur son, et le garde le dirait. La formule extraite rend
 * donc exactement ce que la boucle rendait, au bit près.
 */
export function gainDeNote(velocite: number, volumePourCent: number): number {
  const vol = Math.max(0, Math.min(1, volumePourCent / 100));
  return (velocite / 127) * vol * 0.4;
}

/** La synthèse des hauteurs seules, telle qu'elle a toujours été, la durée étant déjà décidée. */
async function rendreHauteurs(
  notes: NoteEvenement[],
  mode: "FM/Oscillateurs" | "SoundFont",
  volume: number,
  instrument: number | undefined,
  banque: number | undefined,
  caractere: CaractereTimbreId | "pur" | undefined,
  duree: number,
): Promise<AudioBuffer> {
  if (mode === "SoundFont") {
    const sf2Global = sf2Chargee();
    if (!sf2Global) {
      throw new Error(traduire("msg.sf2.non.charge"));
    }
    const prog = instrument !== undefined && instrument >= 0 ? instrument : 0;
    const bq = banque !== undefined && banque >= 0 ? banque : 0;
    const preset = sf2Global.presets.find(p => p.programme === prog && p.banque === bq) ?? sf2Global.presets[0];
    const nomInst = preset ? sf2Global.instruments[preset.zones[0]?.instrumentIdx ?? 0]?.nom ?? "?" : "?";
    console.log(`[attic] rendreSequence utilise SF2 global : ${sf2Global.nom}, programme ${prog}, preset "${preset?.nom ?? "?"}" -> instrument "${nomInst}" (${notes.length} notes)`);
    // La voie SoundFont calcule sa propre longueur sur les notes, relâchement compris : on la ramène
    // à la durée voulue, plutôt que de reprendre ce calcul à deux endroits.
    return ajusterA(rendreAvecSF2(sf2Global, notes, volume, prog, banque ?? 0), duree);
  }

  // FM mode avec suréchantillonnage 2× pour anti-aliasing
  const srInterne = 2 * frequenceDeTravail();
  const length = Math.ceil(duree * srInterne);
  const buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: srInterne });
  const gauche = buffer.getChannelData(0);
  const droite = buffer.getChannelData(1);

  for (const n of notes) {
    const dureeNote = n.fin - n.debut;
    if (dureeNote <= 0.001) continue;
    const freq = frequenceDeNoteMidi(n.note);
    const gain = gainDeNote(n.velocite, volume);
    // Le caractère du timbre, s'il est demandé ; sans lui, le réglage d'origine, inchangé.
    const { ratio, idxMod, a, d, sVal, r } = CARACTERES_FM[caractere ?? "origine"];
    const debutEch = Math.floor(n.debut * srInterne);
    const finEch = Math.min(debutEch + Math.ceil(dureeNote * srInterne), length);

    for (let i = debutEch; i < finEch; i++) {
      const t = (i - debutEch) / srInterne;
      const mod = idxMod * Math.sin(2 * Math.PI * freq * ratio * t);
      const echantillon = Math.sin(2 * Math.PI * freq * t + mod);
      let env: number;
      if (t < a) env = t / a;
      else if (t < a + d) env = 1 - (1 - sVal) * ((t - a) / d);
      else if (t < dureeNote - r) env = sVal;
      else env = sVal * (1 - (t - (dureeNote - r)) / r);
      const val = echantillon * gain * env;
      gauche[i] += val;
      droite[i] += val;
    }
  }

  // Decimation par deux, par moyenne de deux echantillons : le rendu interne est au DOUBLE
  // de la frequence du projet, et non a 88 200 Hz en dur. Un projet a 96 kHz rend donc en
  // interne a 192 kHz, et la moyenne de deux reste une moyenne de deux.
  const srFinal = frequenceDeTravail();
  const lengthFinal = Math.ceil(duree * srFinal);
  const bufferFinal = new AudioBuffer({ numberOfChannels: 2, length: lengthFinal, sampleRate: srFinal });
  const gFinal = bufferFinal.getChannelData(0);
  const dFinal = bufferFinal.getChannelData(1);
  for (let i = 0; i < lengthFinal; i++) {
    const i1 = i * 2;
    const i2 = i1 + 1;
    gFinal[i] = (gauche[i1] + (i2 < length ? gauche[i2] : gauche[i1])) / 2;
    dFinal[i] = (droite[i1] + (i2 < length ? droite[i2] : droite[i1])) / 2;
  }

  return bufferFinal;
}

