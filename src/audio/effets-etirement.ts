// audio/effets-etirement.ts — Reverbe progressive, anneau, etirement glissant.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { etirerDuree } from "./commun";
import { CANAUX_CONVOLUEUR } from "./effets-reverbe";
import { traiterParPaires } from "./multicanal";
import { valeurA } from "./courbe";
import { cyclesAccumules } from "./lfo";

export async function appliquerReverbeProgressive(
  entree: AudioBuffer,
  taillePct: number,
  debutPct: number,
  finPct: number,
  dureeFadeSec: number,
  hasard: () => number = Math.random,
): Promise<AudioBuffer> {
  // MÊME LIMITE QUE L'AUTRE RÉVERBÉRATION À CONVOLUTION, et elle jetait de la même façon : le
  // moteur n'accepte une réponse impulsionnelle qu'à un, deux ou quatre canaux, et celle-ci était
  // fabriquée avec le nombre de canaux de l'entrée. `CANAUX_CONVOLUEUR` porte la mesure.
  if (!CANAUX_CONVOLUEUR.includes(entree.numberOfChannels)) {
    return traiterParPaires(entree, (p) => appliquerReverbeProgressive(
      p, taillePct, debutPct, finPct, dureeFadeSec, hasard));
  }
  const dureeImpulsion = 0.5 + (Math.max(0, Math.min(100, taillePct)) / 100) * 3;
  const coda = dureeImpulsion + 1;
  const sr = entree.sampleRate;
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(entree.numberOfChannels, Math.ceil(duree * sr), sr);

  const impulsion = offline.createBuffer(entree.numberOfChannels, Math.ceil(dureeImpulsion * sr), sr);
  for (let c = 0; c < impulsion.numberOfChannels; c++) {
    const donnees = impulsion.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const t = i / donnees.length;
      donnees[i] = (hasard() * 2 - 1) * Math.pow(1 - t, 3);
    }
  }

  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = impulsion;
  convolueur.normalize = true;

  const debut = Math.max(0, Math.min(100, debutPct)) / 100;
  const fin = Math.max(0, Math.min(100, finPct)) / 100;
  const fade = Math.max(0.5, Math.min(duree, dureeFadeSec));

  const gainSec = offline.createGain();
  gainSec.gain.setValueAtTime(1 - debut, 0);
  gainSec.gain.linearRampToValueAtTime(1 - fin, fade);

  const gainHumide = offline.createGain();
  gainHumide.gain.setValueAtTime(debut, 0);
  gainHumide.gain.linearRampToValueAtTime(fin, fade);

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}

// ---------- Classificateur de genre audio ----------

// ---------- Ring modulator ----------

/**
 * La modulation en anneau : le son multiplié par une porteuse.
 *
 * LA FRÉQUENCE DE LA PORTEUSE A DEUX CHEMINS, et c'est délibéré. Le calcul direct pose la phase à
 * `2π · f · t`, ce qui n'est juste que pour une fréquence CONSTANTE : la fréquence instantanée d'un
 * tel sinus vaut `f(t) + t · f'(t)`, de sorte qu'une courbe y rendrait autre chose que ce qu'elle
 * demande, et d'autant plus loin qu'on avance dans le son. Une fréquence qui varie demande donc une
 * phase INTÉGRÉE, ce que `cyclesAccumules` fait. Sans courbe, le calcul direct est recopié tel quel
 * pour ne pas changer un bit. C'est le partage que le trémolo et le vibrato font déjà.
 */
export function ringModulator(
  buffer: AudioBuffer,
  frequence: number | Float32Array,
  // LE MÉLANGE PEUT VARIER AU FIL DU SON, et c'est le seul changement de signature. Un nombre reste
  // un nombre : `valeurA` rend le scalaire tel quel, de sorte qu'il n'y a pas deux chemins de
  // calcul, un « modulé » et un « ordinaire », qui pourraient diverger un jour.
  mix: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const borne = (m: number) => Math.max(0, Math.min(100, m)) / 100;
  // Les cycles ne se calculent qu'une fois pour les deux canaux : la porteuse ne dépend pas du
  // canal, et la refaire coûterait deux fois pour le même résultat.
  const cycles = typeof frequence === "number" ? null : cyclesAccumules(frequence, sr);
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      const t = i / sr;
      const porteuse = cycles
        ? Math.sin(2 * Math.PI * (cycles[i] ?? cycles[cycles.length - 1] ?? 0))
        : Math.sin(2 * Math.PI * (frequence as number) * t);
      const m = borne(valeurA(mix, i));
      dst[i] = src[i] * (1 - m) + src[i] * porteuse * m;
    }
  }

  return resultat;
}

// Étirement glissant : le facteur d'étirement varie progressivement du début à la fin.
export function etirementGlissant(buffer: AudioBuffer, facteurDebut: number, facteurFin: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const facteurMoyen = (facteurDebut + facteurFin) / 2;
  const longueurSortie = Math.max(256, Math.round(buffer.length * facteurMoyen));
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: longueurSortie, sampleRate: sr });

  const nbSegments = Math.max(2, Math.min(50, Math.round(buffer.duration)));
  const segmentLen = Math.floor(buffer.length / nbSegments);
  const fenetreCrossfade = Math.min(1024, Math.floor(segmentLen / 4));

  let posSrc = 0;
  let posDst = 0;

  for (let s = 0; s < nbSegments; s++) {
    const t = s / (nbSegments - 1);
    const facteur = facteurDebut + (facteurFin - facteurDebut) * t;
    const debut = posSrc;
    const fin = Math.min(buffer.length, debut + segmentLen);
    const segment = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: fin - debut, sampleRate: sr });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      segment.getChannelData(c).set(buffer.getChannelData(c).subarray(debut, fin));
    }
    const etire = etirerDuree(segment, facteur);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcEtire = etire.getChannelData(c);
      const dst = resultat.getChannelData(c);
      if (s === 0) {
        for (let i = 0; i < srcEtire.length && posDst + i < longueurSortie; i++) {
          dst[posDst + i] = srcEtire[i];
        }
      } else {
        for (let i = 0; i < srcEtire.length && posDst + i < longueurSortie; i++) {
          if (i < fenetreCrossfade && posDst + i - fenetreCrossfade >= 0) {
            const fade = i / fenetreCrossfade;
            dst[posDst + i - fenetreCrossfade] = dst[posDst + i - fenetreCrossfade] * (1 - fade) + srcEtire[i] * fade;
          } else if (posDst + i < longueurSortie) {
            dst[posDst + i] = srcEtire[i];
          }
        }
      }
    }
    posSrc = fin;
    posDst += Math.max(0, etire.length - fenetreCrossfade);
  }

  return resultat;
}

// Paulstretch : étirement extrême par STFT avec phases aléatoires.
// Basé sur l'algorithme de Paul Nasca (paulstretch_stereo.py).
