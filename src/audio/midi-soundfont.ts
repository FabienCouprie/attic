// audio/midi-soundfont.ts — Le rendu par echantillons d'un SoundFont.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances.
//
// ═══ CHAQUE VOIX SUIT L'ENVELOPPE DE VOLUME QUE LE SOUNDFONT DÉCRIT ═══
//
// Avant le 2026-11-28, chaque note s'éteignait par un fondu de cinq millisecondes à la fin exacte de
// sa durée MIDI, quoi que le fichier écrive : une nappe de cordes coupait net, une caisse claire
// s'arrêtait au relâchement de sa touche. La voix suit désormais `CourseEnveloppe` de
// `sf2-enveloppe.ts` : retard, attaque, maintien, chute, palier, puis le RELÂCHEMENT, qui part de la
// fin MIDI et prolonge le son au-delà. Le tampon s'allonge donc de la queue la plus longue, la boucle
// de l'échantillon continue de tourner pendant le relâchement, et un échantillon sans boucle s'arrête
// à sa fin, comme avant.

import type { StructureSF2, ZoneJouee } from "./soundfont";
import { chercherZonesInstrument } from "./soundfont";
import type { NoteEvenement } from "./midi-sequence";
import { echantillonCubique } from "./interpolation";
import { frequenceDeTravail } from "./frequence-de-travail";
import { CourseEnveloppe, ENVELOPPE_PAR_DEFAUT, RELACHEMENT_ETOUFFE, enveloppeEnSecondes } from "./sf2-enveloppe";
import { CourseModulation, FILTRE_PAR_DEFAUT, FiltreVoix, filtreOuvert, modulationEnSecondes } from "./sf2-filtre";

/** Une note jouée par une zone, prête à rendre : tout ce que la boucle d'échantillons lit. */
interface Voix {
  match: ZoneJouee;
  debutEch: number;
  /** Échantillons de sortie qu'elle occupe, relâchement compris et fin d'échantillon comprise. */
  nbEch: number;
  ratio: number;
  gain: number;
  gainGauche: number;
  gainDroite: number;
  boucleActive: boolean;
  enveloppe: CourseEnveloppe;
  /** Le passe-bas de la zone, ou rien quand il est ouvert : voir `sf2-filtre.ts`. */
  filtre: FiltreVoix | null;
}

const panDe = (match: ZoneJouee) => {
  const t = match.echantillon.type;
  return (t === 2 || t === 0x8002) ? 1 : (t === 4 || t === 0x8004) ? -1 : (match.zone.pan ?? 0) / 500;
};

function preparerVoix(match: ZoneJouee, n: NoteEvenement, sr: number, vol: number, etouffe?: number): Voix | null {
  const ech = match.echantillon;
  const zone = match.zone;
  const srcLen = match.finSample - match.debutSample;
  if (srcLen < 2) return null;

  const rootNote = zone.rootKey ?? ech.noteOriginale;
  const noteDiff = n.note - rootNote + (zone.coarseTune ?? 0) + (ech.correction + (zone.fineTune ?? 0)) / 100;
  const sampleRate = ech.taux || sr;
  const ratio = (sampleRate / sr) * (2 ** (noteDiff / 12));
  const attenuation = zone.attenuation ?? 0;
  const gain = (n.velocite / 127) * vol * 0.8 * Math.pow(10, -attenuation / 200);
  const pan = panDe(match);

  const boucleActive = zone.boucleActive && ech.debutBoucle < ech.finBoucle && ech.finBoucle > 0;
  const tenue = Math.floor((n.fin - n.debut) * sr);
  const debutEch = Math.max(0, Math.floor(n.debut * sr));
  const etouffement = etouffe === undefined ? undefined : { debut: etouffe - debutEch, relachement: RELACHEMENT_ETOUFFE };
  const enveloppe = new CourseEnveloppe(enveloppeEnSecondes(zone.enveloppe ?? ENVELOPPE_PAR_DEFAUT, n.note), sr, tenue, etouffement);
  const f = zone.filtre ?? FILTRE_PAR_DEFAUT;
  const filtre = filtreOuvert(f) ? null : new FiltreVoix(f, sr,
    f.versCoupure !== 0 ? new CourseModulation(modulationEnSecondes(f, n.note), sr, tenue, etouffement) : null);
  // Sans boucle, la voix ne dure pas plus que son échantillon, quoi que dise le relâchement : un
  // relâchement de vingt-neuf secondes sur une frappe de trois dixièmes n'allonge pas le tampon.
  const finEchantillon = boucleActive ? Infinity : Math.ceil(srcLen / ratio);
  return {
    match, debutEch, nbEch: Math.min(enveloppe.longueur, finEchantillon),
    ratio, gain, gainGauche: Math.sqrt((1 - pan) / 2), gainDroite: Math.sqrt((1 + pan) / 2), boucleActive, enveloppe, filtre,
  };
}

function jouerVoix(v: Voix, gauche: Float32Array, droite: Float32Array): void {
  const { match, ratio, gain, gainGauche, gainDroite, boucleActive, enveloppe, debutEch, filtre } = v;
  const ech = match.echantillon;
  const donnees = match.donnees;
  const srcDebut = match.debutSample;
  const srcLen = match.finSample - srcDebut;
  const debutBoucle = (ech.debutBoucle - ech.debut);
  const finBoucle = (ech.finBoucle - ech.debut);
  const longueurBoucle = finBoucle - debutBoucle;

  for (let j = 0; j < v.nbEch; j++) {
    const posSortie = debutEch + j;
    if (posSortie >= gauche.length) break;

    let srcPos = j * ratio;

    // ON BOUCLE AVANT DE LIRE, comme avant : la position revient dans la boucle, puis on lit
    // autour d'elle. `dansLaBoucle` retient qu'on y est, et ce drapeau compte — voir plus bas.
    const dansLaBoucle = boucleActive && longueurBoucle > 0
      && srcPos >= debutBoucle + longueurBoucle;
    if (dansLaBoucle) srcPos = debutBoucle + ((srcPos - debutBoucle) % longueurBoucle);

    if (!boucleActive && srcDebut + Math.floor(srcPos) + 1 >= srcDebut + srcLen) {
      break;
    }

    // ═══ CUBIQUE, ET NON PLUS LINÉAIRE, SUR UN SON QUI BOUCLE ═══
    //
    // Ce chemin TRANSPOSE une note d'une banque SF2 : l'interpolateur décide de ce qu'on entend,
    // et il était linéaire. Ce que cela coûtait est mesuré dans `interpolation.test.ts` : vingt
    // décibels de parasites de plus qu'un cubique, 33,7 dB contre 55,8 sur une octave vers le bas.
    //
    // ET LE NOYAU LIT PAR UN ACCESSEUR, ce qui est la seule façon de le faire boucler. Il regarde
    // DEUX points de part et d'autre, là où le linéaire n'en regardait qu'un : les quatre doivent
    // suivre la boucle, sans quoi l'on entendrait un clic à chaque tour — précisément le défaut
    // que quatre points sont censés éviter.
    //
    // LES DEUX SENS DU REBOUCLAGE, ET ILS NE SONT PAS SYMÉTRIQUES. Vers l'avant, un index qui
    // dépasse la fin de la boucle revient à son début : c'est ce que l'ancien code faisait déjà
    // pour son unique voisin. Vers l'arrière, un index antérieur au début de la boucle revient à
    // sa FIN — mais seulement si l'on tourne déjà : pendant l'attaque, les échantillons d'avant
    // sont les vrais, et les reboucler ferait entendre la fin de la boucle avant son début.
    const lire = (i: number) => {
      let rel = i - srcDebut;
      if (boucleActive && longueurBoucle > 0) {
        if (rel >= finBoucle) rel = debutBoucle + ((rel - finBoucle) % longueurBoucle);
        else if (rel < debutBoucle && dansLaBoucle) {
          rel = finBoucle - ((debutBoucle - rel) % longueurBoucle);
        }
      }
      return donnees[srcDebut + Math.min(srcLen - 1, Math.max(0, rel))];
    };
    const lu = echantillonCubique(lire, srcDebut + srcPos);
    const g = filtre ? filtre.traiter(lu) : lu;
    const mono = (g / 32768) * gain * enveloppe.suivant();
    gauche[posSortie] += mono * gainGauche;
    droite[posSortie] += mono * gainDroite;
  }
}

/** Une zone qui joue une note, et l'échantillon de sortie où la note part. */
interface Jouee { match: ZoneJouee; n: NoteEvenement; debutEch: number }

/**
 * ═══ LA CLASSE EXCLUSIVE : UNE NOTE PLUS JEUNE ÉTOUFFE LES VOIX DE SA CLASSE ═══
 *
 * Générateur 57. Le charleston ouvert, le fermé et la pédale d'un kit partagent une classe : une
 * frappe de l'un fait taire l'autre, comme sur une vraie batterie. Avant l'enveloppe de volume,
 * l'absence de cette règle ne s'entendait pas, chaque note s'éteignant à sa fin MIDI ; avec le
 * relâchement, le charleston ouvert de FluidR3 sonnait 2,69 s par-dessus les fermés qui le suivent.
 *
 * Rend, pour chaque zone jouée d'une classe non nulle, l'échantillon où part la note plus jeune la
 * plus proche de la même classe, ou rien. La portée est celle d'un appel, un canal et un preset,
 * comme chez FluidSynth (`fluid_synth_kill_by_exclusive_class_LOCAL`), qui épargne aussi les voix de
 * la note qui part. UN ÉCART, DIT : deux notes de la même classe parties au même échantillon ne
 * s'étouffent pas, là où FluidSynth fait taire celle qu'il a lue la première.
 */
function instantsDEtouffement(jouees: readonly Jouee[]): (number | undefined)[] {
  const parClasse = new Map<number, number[]>();
  jouees.forEach((j, k) => {
    const classe = j.match.zone.classeExclusive ?? 0;
    if (classe === 0) return;
    const rangs = parClasse.get(classe);
    if (rangs) rangs.push(k); else parClasse.set(classe, [k]);
  });
  const instants: (number | undefined)[] = new Array(jouees.length).fill(undefined);
  for (const rangs of parClasse.values()) {
    rangs.sort((a, b) => jouees[a].debutEch - jouees[b].debutEch);
    // En remontant depuis la plus jeune : l'attaque du groupe suivant est celle qui étouffe.
    let enCours: number | undefined, plusJeune: number | undefined;
    for (let k = rangs.length - 1; k >= 0; k--) {
      const t = jouees[rangs[k]].debutEch;
      if (t !== enCours) { plusJeune = enCours; enCours = t; }
      instants[rangs[k]] = plusJeune;
    }
  }
  return instants;
}

export function rendreAvecSF2(
  sf: StructureSF2,
  notes: NoteEvenement[],
  volume: number,
  programme = 0,
  banque = 0,
): AudioBuffer {
  if (notes.length === 0) {
    const ctx = new OfflineAudioContext(2, 22050, frequenceDeTravail());
    return ctx.startRendering() as unknown as AudioBuffer;
  }

  const sr = frequenceDeTravail();
  const vol = Math.max(0, Math.min(1, volume / 100));

  // PREMIÈRE PASSE : chaque zone qui joue chaque note, puis l'étouffement de chacune, puis les voix et
  // leur longueur, pour que le tampon tienne la queue la plus longue.
  const jouees: Jouee[] = [];
  notes.forEach((n, rang) => {
    if (n.fin - n.debut <= 0.001) return;
    const matches = chercherZonesInstrument(sf, n.note, n.velocite, programme, banque);
    if (matches.length === 0) return;
    if (rang < 5) {
      const first = matches[0];
      const ech = first.echantillon;
      const zone = first.zone;
      const root = zone.rootKey ?? ech.noteOriginale;
      const env = enveloppeEnSecondes(zone.enveloppe ?? ENVELOPPE_PAR_DEFAUT, n.note);
      console.log(`[attic] SF2 note ${n.note} vel=${n.velocite} -> inst=${first.instrumentIdx} zones=${matches.length} sample="${ech.nom}" root=${root} sr=${ech.taux || 44100} loop=${zone.boucleActive} att=${zone.attenuation ?? 0} type=${ech.type} pan=${zone.pan ?? 0} effPan=${panDe(first).toFixed(2)} palier=${env.palier}cB rel=${env.relachement.toFixed(3)}s`);
    }
    for (const match of matches) jouees.push({ match, n, debutEch: Math.max(0, Math.floor(n.debut * sr)) });
  });
  const etouffements = instantsDEtouffement(jouees);
  const voix: Voix[] = [];
  let length = Math.ceil(Math.max(notes.reduce((m, n) => Math.max(m, n.fin), 0), 0.5) * sr);
  jouees.forEach((j, k) => {
    const v = preparerVoix(j.match, j.n, sr, vol, etouffements[k]);
    if (!v) return;
    voix.push(v);
    length = Math.max(length, v.debutEch + v.nbEch);
  });

  const resultat = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: sr });
  const gauche = resultat.getChannelData(0);
  const droite = resultat.getChannelData(1);
  for (const v of voix) jouerVoix(v, gauche, droite);

  normaliserBuffer(resultat);
  return resultat;
}

/**
 * Une couche ajoutée à un mélange, qui S'ALLONGE s'il le faut, et le mélange rendu.
 *
 * Le relâchement d'une enveloppe dépasse la fin MIDI de la dernière note : un mélange taillé à la
 * durée du fichier coupait cette queue net, et faisait claquer la fin de la pièce. Le mélange garde
 * donc la couche la plus longue. Rend `melange` lui-même quand il suffit.
 */
export function mixerCouche(melange: AudioBuffer, couche: AudioBuffer): AudioBuffer {
  let cible = melange;
  if (couche.length > melange.length) {
    cible = new AudioBuffer({ numberOfChannels: melange.numberOfChannels, length: couche.length, sampleRate: melange.sampleRate });
    for (let c = 0; c < melange.numberOfChannels; c++) cible.copyToChannel(melange.getChannelData(c), c, 0);
  }
  // Canaux sortis de la boucle : appeler `getChannelData` par échantillon coûtait 40× le temps du
  // même calcul, pour un résultat identique.
  const mixL = cible.getChannelData(0), mixR = cible.getChannelData(1);
  const srcL = couche.getChannelData(0), srcR = couche.getChannelData(1);
  for (let i = 0; i < couche.length; i++) { mixL[i] += srcL[i]; mixR[i] += srcR[i]; }
  return cible;
}

export function normaliserBuffer(buffer: AudioBuffer, ceiling = 1): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak > ceiling) {
    const s = ceiling / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < ch.length; i++) ch[i] *= s;
    }
  }
}
