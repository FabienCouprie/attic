// audio/convolution.ts — Réverbération à convolution depuis une réponse impulsionnelle (IR).
// Utilise le ConvolverNode natif du Web Audio via OfflineAudioContext.

export async function reverberationConvolution(
  entree: AudioBuffer,
  ir: AudioBuffer,
  mixPct: number,
): Promise<AudioBuffer> {
  const mix = Math.max(0, Math.min(100, mixPct)) / 100;
  const coda = ir.duration + 0.5;
  const duree = entree.duration + coda;
  const sr = entree.sampleRate;
  const nCh = Math.min(entree.numberOfChannels, 2);

  const offline = new OfflineAudioContext(nCh, Math.ceil(duree * sr), sr);

  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = ir;
  convolueur.normalize = true;

  const gainSec = offline.createGain();
  gainSec.gain.value = 1 - mix;

  const gainHumide = offline.createGain();
  gainHumide.gain.value = mix;

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}

// ─── Générateur de réponse impulsionnelle (IR) synthétique ───
// Produit un AudioBuffer stéréo représentant la signature acoustique d'un
// espace. Modèle : bruit décroissant + réflexions early + queue diffuse,
// avec pre-delay et filtre passe-bas (damping) simulant l'absorption de l'air
// et des matériaux.

export function genererIR(
  type: string,
  taillePct: number,
  decaySec: number,
  preDelayMs: number,
  dampingPct: number,
  sr: number,
  // Source du hasard de la queue diffuse. Le nœud passe le générateur issu de
  // son paramètre « Graine », dont la valeur par défaut est FIXE : une
  // réverbération qui change de pièce à chaque exécution serait un défaut.
  hasard: () => number = Math.random,
): AudioBuffer {
  const taille = Math.max(0, Math.min(100, taillePct)) / 100;
  const decay = Math.max(0.1, Math.min(10, decaySec));
  const preDelay = Math.max(0, Math.round((preDelayMs / 1000) * sr));
  const damping = Math.max(0, Math.min(100, dampingPct)) / 100;

  // Durée totale de l'IR : pre-delay + queue. La taille influe sur la durée
  // de la queue et la densité des réflexions early.
  const dureeQueue = decay * (0.3 + taille * 1.7);
  const dureeEarly = 0.02 + taille * 0.08;
  const dureeTotale = (preDelay / sr) + dureeEarly + dureeQueue;
  const len = Math.max(1, Math.ceil(dureeTotale * sr));

  const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });

  // Fréquence de coupure du damping (passe-bas 1-pôle). Plus damping est
  // élevé, plus les hautes fréquences sont absorbées tôt dans la queue.
  const freqCut = 20000 - damping * 17000;
  const alpha = Math.exp(-2 * Math.PI * freqCut / sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);

    // 1. Pre-delay : silence au début.
    // (le tableau est déjà à zéro)

    // 2. Réflexions early : quelques échos discrets dans les premiers
    //    millisecondes, spécifiques au type de pièce. Chaque réflexion est
    //    une copie brève du signal (dirac) atténuée et décalée.
    const reflexions = getReflexions(type, taille, dureeEarly, sr);
    for (const ref of reflexions) {
      const pos = preDelay + Math.round(ref.delay * sr);
      const amp = ref.gain;
      if (pos < len) d[pos] += amp * (ch === 0 ? 1 : ref.pan);
    }

    // 3. Queue diffuse : bruit décroissant exponentiellement.
    //    L'exposant du decay dépend du type (plate = linéaire, hall = long,
    //    room = court, spring = oscillant).
    const debutQueue = preDelay + Math.round(dureeEarly * sr);
    const finQueue = len;
    const longueurQueue = finQueue - debutQueue;

    for (let i = debutQueue; i < finQueue; i++) {
      const t = (i - debutQueue) / longueurQueue;
      let enveloppe: number;
      switch (type) {
        case "Plate":
          enveloppe = Math.pow(1 - t, 1.5);
          break;
        case "Hall":
          enveloppe = Math.pow(1 - t, 1.0 + decay * 0.3);
          break;
        case "Spring":
          enveloppe = Math.pow(1 - t, 2.0) * (1 + 0.3 * Math.sin(2 * Math.PI * t * 8));
          break;
        case "Cathédrale":
          enveloppe = Math.pow(1 - t, 0.5 + decay * 0.1);
          break;
        default: // Room
          enveloppe = Math.pow(1 - t, 2.5);
      }
      d[i] += (hasard() * 2 - 1) * enveloppe;
    }

    // 4. Damping (passe-bas 1-pôle récursif) sur toute l'IR après le pre-delay.
    let precedent = 0;
    for (let i = preDelay; i < len; i++) {
      precedent = precedent + alpha * (d[i] - precedent);
      d[i] = precedent;
    }

    // 5. Normalisation au pic.
    let pic = 1e-9;
    for (let i = 0; i < len; i++) { const v = Math.abs(d[i]); if (v > pic) pic = v; }
    const g = 0.9 / pic;
    for (let i = 0; i < len; i++) d[i] *= g;
  }

  return buf;
}

interface Reflexion { delay: number; gain: number; pan: number; }

function getReflexions(type: string, taille: number, dureeEarly: number, _sr: number): Reflexion[] {
  const base = dureeEarly;
  switch (type) {
    case "Room":
      return [
        { delay: base * 0.15, gain: 0.6, pan: 0.8 },
        { delay: base * 0.35, gain: 0.5, pan: 1.2 },
        { delay: base * 0.55, gain: 0.4, pan: 0.9 },
        { delay: base * 0.75, gain: 0.3, pan: 1.1 },
      ];
    case "Hall":
      return [
        { delay: base * 0.20, gain: 0.5, pan: 0.7 },
        { delay: base * 0.45, gain: 0.45, pan: 1.3 },
        { delay: base * 0.70, gain: 0.35, pan: 0.85 },
        { delay: base * 0.90, gain: 0.25, pan: 1.15 },
      ];
    case "Plate":
      return [
        { delay: base * 0.05, gain: 0.8, pan: 1.0 },
        { delay: base * 0.15, gain: 0.6, pan: 1.1 },
        { delay: base * 0.30, gain: 0.5, pan: 0.9 },
        { delay: base * 0.50, gain: 0.4, pan: 1.05 },
      ];
    case "Spring":
      return [
        { delay: base * 0.08, gain: 0.9, pan: 1.0 },
        { delay: base * 0.25, gain: 0.5, pan: 0.7 },
      ];
    case "Cathédrale":
      return [
        { delay: base * 0.30, gain: 0.4, pan: 0.6 },
        { delay: base * 0.60, gain: 0.35, pan: 1.4 },
        { delay: base * 0.85, gain: 0.3, pan: 0.8 },
      ];
    default:
      return [
        { delay: base * 0.2, gain: 0.5, pan: 1.0 },
        { delay: base * 0.5, gain: 0.3, pan: 1.0 },
      ];
  }
}

