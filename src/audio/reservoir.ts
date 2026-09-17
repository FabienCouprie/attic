// audio/reservoir.ts — Générateur musical par réseau de neurones aléatoires
// (Reservoir Computing / Random Neural Networks), inspiré du concept Allendia/EVY.
//
// Principe : un "réservoir" de N neurones à poids aléatoires fixes (non entraînés).
// Une entrée (impulsion rythmique) fait circuler l'activation dans le réseau.
// Les activations sont projetées sur une grille de notes (gamme) pour produire
// une mélodie émergente. Les paramètres contrôlent la dynamique du réseau
// (connectivité, leaking, gain) et le mapping musical (gamme, octave, rythme).
//
// Aucun entraînement, aucun dataset, aucun copyright — les motifs émergent
// de la structure aléatoire du réseau, comme un kaléidoscope.

import { formeOndeDepuisTimbre } from "./timbres";

export interface ConfigReservoir {
  taille: number;          // nombre de neurones (10-50)
  connectivite: number;    // probabilité de connexion (0-1)
  leaking: number;         // taux de fuite mémoire (0-1, ~0.3 = motifs courts)
  gain: number;            // gain d'entrée (0.5-3)
  spectre: number;         // rayon spectral (0.5-1.5, contrôle la stabilité)
  cle: string;             // fondamentale
  gamme: string;           // nom de la gamme
  octave: number;          // octave de départ
  tempo: number;           // BPM
  pasParBeat: number;      // divisions par beat (1=noire, 2=croche, 4=double croche)
  mesures: number;         // nombre de mesures
  volume: number;          // 0-100
  timbre: string;          // forme d'onde
  graine: number;          // graine aléatoire (0 = aléatoire)
  probaNote: number;       // probabilité de produire une note à chaque pas (0-1)
  repetition: number;      // tendance à répéter la note précédente (0-1)
  silence: number;         // probabilité de silence (0-1)
}

const GAMMES: Record<string, number[]> = {
  "majeur": [0, 2, 4, 5, 7, 9, 11],
  "mineur": [0, 2, 3, 5, 7, 8, 10],
  "pentatonique majeur": [0, 2, 4, 7, 9],
  "pentatonique mineur": [0, 3, 5, 7, 10],
  "blues": [0, 3, 5, 6, 7, 10],
  "chromatique": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// PRNG déterministe (mulberry32) — pour reproductibilité avec graine.
export function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Reservoir {
  n: number;
  poidsIn: Float32Array;      // poids entrée → réservoir (N)
  poidsRes: Float32Array;     // poids récurrents (N×N)
  etats: Float32Array;        // état courant (N)
  leaking: number;
  gain: number;
}

/**
 * Rayon spectral de la matrice récurrente, par itération de la puissance.
 *
 * Moyenne géométrique des facteurs de croissance plutôt que le dernier : avec une paire
 * de valeurs propres complexes conjuguées — le cas courant sur une matrice aléatoire —,
 * la norme oscille d'une itération à l'autre et le dernier facteur serait faux. ‖W^k v‖^(1/k)
 * converge vers le rayon dans les deux cas.
 *
 * Rend 1 pour une matrice nulle (aucune connexion), pour ne pas diviser par zéro : le
 * réseau est alors sans récurrence, et l'échelle n'a plus d'objet.
 */
export function rayonSpectral(poids: Float32Array, n: number, iterations = 120): number {
  let v = new Float64Array(n).fill(1 / Math.sqrt(n));
  let sommeLog = 0, compte = 0;
  for (let it = 0; it < iterations; it++) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let somme = 0;
      for (let j = 0; j < n; j++) somme += poids[i * n + j] * v[j];
      w[i] = somme;
    }
    let norme = 0;
    for (let i = 0; i < n; i++) norme += w[i] * w[i];
    norme = Math.sqrt(norme);
    if (norme < 1e-12) return 1;
    for (let i = 0; i < n; i++) w[i] /= norme;
    v = w;
    // Les premières itérations portent le transitoire : on ne moyenne que la suite.
    if (it >= iterations / 4) { sommeLog += Math.log(norme); compte++; }
  }
  const rayon = Math.exp(sommeLog / compte);
  return rayon > 1e-9 ? rayon : 1;
}

/**
 * Construit le réseau. Exporté pour que le test puisse mesurer le rayon spectral
 * RÉELLEMENT obtenu : c'est la seule façon de voir que le réglage « Spectre » arrive
 * à destination, la mélodie produite ne le disant pas — sa conversion en notes étant
 * rapportée à la distribution du morceau, elle reste étalée même sur un réseau inerte.
 */
export function creerReservoir(config: ConfigReservoir, rng: () => number): Reservoir {
  const n = config.taille;
  const poidsIn = new Float32Array(n);
  const poidsRes = new Float32Array(n * n);

  // Poids d'entrée : aléatoires, centrés
  for (let i = 0; i < n; i++) {
    poidsIn[i] = (rng() * 2 - 1) * config.gain;
  }

  // Poids récurrents : matrice creuse aléatoire
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rng() < config.connectivite) {
        poidsRes[i * n + j] = (rng() * 2 - 1);
      }
    }
  }

  // Mise à l'échelle au rayon spectral DEMANDÉ.
  //
  // La norme de Frobenius servait d'approximation ; elle vaut plusieurs fois le rayon
  // spectral et grandit avec la taille du réseau, si bien que le réglage n'arrivait
  // jamais à destination : mesuré, « Spectre 90 % » donnait 0,23 sur 15 neurones et
  // 0,16 sur 40, et « 150 % », censé être chaotique, 0,39. Le réservoir ne résonnait
  // pas — il suivait l'impulsion rythmique — et rendait 3 à 4 hauteurs en tout, déjà
  // répétées à 88 % : de quoi faire croire que « Répétition » ne servait à rien.
  const facteur = config.spectre / rayonSpectral(poidsRes, n);
  for (let i = 0; i < n * n; i++) poidsRes[i] *= facteur;

  return {
    n,
    poidsIn,
    poidsRes,
    etats: new Float32Array(n),
    leaking: config.leaking,
    gain: config.gain,
  };
}

// Une étape du réservoir : entrée scalaire → mise à jour des états
function stepReservoir(res: Reservoir, entree: number): void {
  const n = res.n;
  const nouveaux = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let somme = res.poidsIn[i] * entree;
    for (let j = 0; j < n; j++) {
      somme += res.poidsRes[i * n + j] * res.etats[j];
    }
    // Activation tanh + leaking (mémoire)
    nouveaux[i] = (1 - res.leaking) * res.etats[i] + res.leaking * Math.tanh(somme);
  }
  res.etats = nouveaux;
}

/** Lecture de sortie : moyenne des activations pondérée par leur amplitude. */
function lectureReservoir(res: Reservoir): number {
  let somme = 0;
  let poids = 0;
  for (let i = 0; i < res.n; i++) {
    const a = Math.abs(res.etats[i]);
    somme += res.etats[i] * a;
    poids += a;
  }
  return poids > 0 ? somme / poids : 0;
}

/**
 * Lecture → note, RAPPORTÉE à ce que le réservoir a produit sur ce morceau.
 *
 * La conversion supposait que la lecture occupe [-1, 1] ; mesurée, elle tient dans
 * ±0,1 environ, et d'autant plus serré que le réseau est grand — une moyenne sur
 * plus de neurones. Sur 14 degrés disponibles, 1 à 2 étaient atteints : la mélodie
 * tenait sur une ou deux notes, et « Répétition » n'avait plus rien à répéter.
 *
 * L'écart à la moyenne, en unités d'écart-type, replace la mélodie sur toute la
 * gamme sans rien inventer : un réservoir qui ne bouge pas donne un écart-type nul,
 * donc une note fixe — c'est ce qu'il joue. Un classement par rang aurait garanti
 * toute la gamme même là, en fabriquant une variété que le réseau n'a pas produite ;
 * mesuré à dynamique égale, le rang utilisait 14 degrés sur 14 quoi qu'il arrive,
 * l'écart-type 9 à 11.
 */
function noteDepuisLecture(lecture: number, moyenne: number, ecartType: number,
                           cle: string, gamme: string, octave: number): number {
  const intervalles = GAMMES[gamme] ?? GAMMES["majeur"];
  const cleIdx = NOTES.indexOf(cle);
  const baseMidi = (octave + 1) * 12 + (cleIdx >= 0 ? cleIdx : 0);

  // tanh borne les valeurs extrêmes sans écraser le centre : 2 écarts-types couvrent
  // l'essentiel de la gamme, au-delà on sature plutôt que de dépasser l'ambitus.
  const z = ecartType > 1e-9 ? Math.tanh((lecture - moyenne) / (2 * ecartType)) : 0;

  // [-1, 1] → deux octaves de la gamme, bornes comprises (et non modulo, qui faisait
  // repasser l'extrême grave juste au-dessus de l'extrême aigu).
  const plage = intervalles.length * 2;
  const idx = Math.max(0, Math.min(plage - 1, Math.round(((z + 1) / 2) * (plage - 1))));
  const degre = idx % intervalles.length;
  const octDecal = Math.floor(idx / intervalles.length);

  return baseMidi + intervalles[degre] + octDecal * 12;
}

// Mappe l'énergie du réservoir vers une vélocité
function etatVersVelocite(res: Reservoir): number {
  let energie = 0;
  for (let i = 0; i < res.n; i++) energie += res.etats[i] * res.etats[i];
  energie = Math.sqrt(energie / res.n); // RMS des activations
  return Math.max(20, Math.min(127, Math.round(energie * 100)));
}

export interface NoteGeneree {
  note: number;
  velocite: number;
  debut: number;
  duree: number;
  silence: boolean;
}

export function genererReservoirMusical(config: ConfigReservoir): { notes: NoteGeneree[]; graineUtilisee: number } {
  const graine = config.graine > 0 ? config.graine : Math.floor(Math.random() * 99999) + 1;
  const rng = mulberry32(graine);

  const res = creerReservoir(config, rng);

  const stepDur = (60 / config.tempo) / config.pasParBeat;
  const totalPas = config.mesures * 4 * config.pasParBeat; // 4 beats par mesure
  const notes: NoteGeneree[] = [];

  // PREMIÈRE PASSE : faire tourner le réseau et relever sa lecture à chaque pas.
  // Elle précède l'écriture des notes parce que la conversion en hauteurs se fait par
  // rapport à la distribution du morceau entier (voir noteDepuisLecture).
  const lectures: number[] = [];
  const velocites: number[] = [];
  for (let pas = 0; pas < totalPas; pas++) {
    // Impulsion rythmique : 1 aux temps, 0,3 ailleurs
    stepReservoir(res, pas % config.pasParBeat === 0 ? 1.0 : 0.3);
    lectures.push(lectureReservoir(res));
    velocites.push(etatVersVelocite(res));
  }
  const moyenne = lectures.reduce((a, b) => a + b, 0) / Math.max(1, lectures.length);
  const variance = lectures.reduce((a, b) => a + (b - moyenne) ** 2, 0) / Math.max(1, lectures.length);
  const ecartType = Math.sqrt(variance);

  // SECONDE PASSE : les tirages — silence, répétition, densité — dans le même ordre
  // qu'avant, pour qu'une graine donne toujours le même morceau.
  let notePrec: number | null = null;
  for (let pas = 0; pas < totalPas; pas++) {
    const estBeat = pas % config.pasParBeat === 0;
    const estSilence = rng() < config.silence;

    // Tendance à répéter la note précédente
    if (!estSilence && notePrec !== null && rng() < config.repetition) {
      notes.push({
        note: notePrec,
        velocite: Math.max(20, velocites[pas] - 10),
        debut: pas * stepDur,
        duree: stepDur * (estBeat ? 1.5 : 1),
        silence: false,
      });
      continue;
    }

    if (!estSilence && rng() < config.probaNote) {
      const note = noteDepuisLecture(lectures[pas], moyenne, ecartType, config.cle, config.gamme, config.octave);
      notes.push({
        note,
        velocite: velocites[pas],
        debut: pas * stepDur,
        duree: stepDur * (estBeat ? 1.5 : 1),
        silence: false,
      });
      notePrec = note;
    } else if (estSilence) {
      notePrec = null;
    }
  }

  return { notes, graineUtilisee: graine };
}

// Rendu audio des notes générées (synthèse oscillator + enveloppe ADSR simple)
export function rendreReservoirAudio(
  notes: NoteGeneree[],
  config: ConfigReservoir,
): AudioBuffer {
  const sr = 44100;
  const dureeTotale = notes.length > 0
    ? Math.max(...notes.map((n) => n.debut + n.duree)) + 0.3
    : 1;
  const len = Math.ceil(dureeTotale * sr);
  const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  const vol = Math.max(0, Math.min(1, config.volume / 100)) * 0.5;

  // Repli « sine » conservé à l'identique (différent des autres nœuds).
  const typeOsc: OscillatorType = formeOndeDepuisTimbre(config.timbre) ?? "sine";

  const gauche = buf.getChannelData(0);
  const droite = buf.getChannelData(1);

  for (const n of notes) {
    if (n.silence) continue;
    const freq = 440 * Math.pow(2, (n.note - 69) / 12);
    const debutEch = Math.floor(n.debut * sr);
    const finEch = Math.min(debutEch + Math.ceil(n.duree * sr), len);
    const dureeNote = (finEch - debutEch) / sr;

    // Enveloppe ADSR simple
    const a = 0.005, d = 0.05, s = 0.7, r = 0.05;

    for (let i = debutEch; i < finEch; i++) {
      const t = (i - debutEch) / sr;
      const phase = 2 * Math.PI * freq * t;
      let echantillon: number;
      switch (typeOsc) {
        case "square": echantillon = Math.sign(Math.sin(phase)); break;
        case "sawtooth": echantillon = 2 * ((freq * t) % 1) - 1; break;
        case "triangle": echantillon = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1; break;
        default: echantillon = Math.sin(phase);
      }
      let env: number;
      if (t < a) env = t / a;
      else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
      else if (t < dureeNote - r) env = s;
      else env = s * Math.max(0, 1 - (t - (dureeNote - r)) / r);

      const v = echantillon * vol * env * (n.velocite / 127);
      // Panning stéréo subtil selon la hauteur
      const pan = Math.max(-0.4, Math.min(0.4, (n.note - 60) / 60));
      gauche[i] += v * (1 - pan);
      droite[i] += v * (1 + pan);
    }
  }

  // Normalisation au pic
  let pic = 1e-9;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > pic) pic = a; }
  }
  const g = 0.9 / pic;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] *= g;
  }

  return buf;
}
