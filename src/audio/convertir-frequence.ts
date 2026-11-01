// audio/convertir-frequence.ts — Porter un son à la fréquence de travail du projet.
//
// ═══ UN SEUL ENDROIT, ET C'EST LA MOITIÉ DE L'OBJET ═══
//
// Point 5 d'une revue du dépôt : « aucune fréquence d'échantillonnage commune au graphe ; la
// conversion est laissée au navigateur ». La seconde moitié est le vrai problème : la conversion
// AVAIT LIEU, partout où un `OfflineAudioContext` s'en mêlait — 43 sites dans le seul dossier
// `audio` —, sans que personne ne la demande ni n'en choisisse la qualité.
//
// Le moteur la demande désormais, une fois, à la sortie de chaque nœud : tout ce qui circule sur une
// arête est à la fréquence du projet. L'invariant rend le reste simple — aucun nœud ne peut plus
// recevoir deux fréquences, et aucun composant n'a à s'en soucier.
//
// ═══ ET CE N'EST PAS CELUI DU NAVIGATEUR, PARCE QU'IL EST LINÉAIRE ═══
//
// LA MESURE A RENVERSÉ MON PREMIER JET, qui se contentait d'un `OfflineAudioContext` nommé. Relevé
// sur une conversion 44,1 → 48 kHz, en rapport de la raie aux parasites — instrument partagé dans
// `mesure-raie.ts` :
//
//     celui du navigateur    62,26 dB
//     interpolation linéaire 62,27 dB      ← le même chiffre à trois millièmes près
//     interpolation cubique  88,76 dB
//     CE MODULE             89,3  dB       ← +27,0 dB sur ce qui avait lieu
//
// DEUX CANDIDATS AU MÊME CHIFFRE, c'est la leçon que `mesure-raie.ts` porte en en-tête : ou bien
// c'est le plancher de la mesure, ou bien ils font la même chose. Ce n'est pas le plancher, puisque
// le cubique le dépasse de vingt-six décibels avec le MÊME instrument et la MÊME fenêtre. Donc le
// rééchantillonnage d'un `AudioBufferSourceNode` est une interpolation LINÉAIRE — ce que la
// spécification permet, et que Chromium comme `node-web-audio-api` font.
//
// Les quarante-trois conversions implicites du dépôt étaient donc de la pire des trois qualités, et
// passer par un `OfflineAudioContext` « choisi » aurait gardé exactement ce défaut en le nommant.
//
// ═══ LE FILTRE AVANT LA DÉCIMATION, QUI EST L'AUTRE MOITIÉ ═══
//
// `interpolation.test.ts` l'écrivait déjà, et le renvoyait à plus tard : « vers l'aigu, c'est le
// repliement qui domine, et aucun interpolateur n'y peut rien sans un filtre AVANT la décimation.
// C'est un autre chantier. » C'est celui-ci. Descendre de 48 à 44,1 kHz sans filtrer replie tout ce
// qui passe au-dessus de 22 050 Hz dans la bande — un 23 kHz revient à 21 100 Hz, audible, et aucune
// interpolation ne l'enlèvera après coup.
//
// ET `DEPENDANCES-AUDIO.md` CLASSE CE MODULE « RENDU », à cause du seul `OfflineAudioContext` qui y
// reste — celui du changement de NOMBRE DE CANAUX. Le rééchantillonnage, lui, est pur :
// `reechantillonnerCanal` ne touche que des `Float32Array`, et peut donc partir dans un fil
// d'exécution séparé. C'est ce qui compte pour le chantier temps réel, où la conversion est sur le
// chemin de chaque bloc.
//
// LE FILTRE EST DONC ICI, et seulement quand on descend : monter n'a rien à replier. MESURÉ sur
// 48 → 44,1 kHz, un sinus à 23 kHz qui devrait revenir à 21 100 Hz :
//
//     interpolation linéaire nue  −13,2 dB
//     interpolation cubique nue   −11,4 dB      ← les deux replient autant : c'est la DÉCIMATION
//     CE MODULE                  −112,6 dB         qui replie, pas l'interpolateur
//
// Cent un décibels de repliement en moins, et c'est la seule des deux moitiés qu'un interpolateur,
// quelle que soit sa qualité, ne peut pas gagner.

import { echantillonCubique } from "./interpolation";

/** Le nombre de coefficients du passe-bas. Impair, pour une phase linéaire à centre exact. */
const RANGS_FILTRE = 191;

/**
 * La coupure, en fraction de la plus basse des deux fréquences.
 *
 * 0,47 ET NON 0,5 : un filtre à coefficients finis a une transition, et la placer SUR Nyquist
 * laisserait passer la moitié de ce qu'elle couvre. À 0,47 d'une descente vers 44,1 kHz, la coupure
 * tombe à 20,7 kHz — au-dessus de ce que porte un instrument, et au-dessus de ce que la plupart des
 * oreilles entendent. Ce qui est perdu entre 20,7 et 22,05 kHz est le prix du non-repliement, et
 * c'est le bon échange : un repliement est un son qui n'existait pas, une coupure est un son absent.
 */
const COUPURE = 0.47;

/**
 * Les coefficients d'un passe-bas à sinus cardinal, fenêtré en Blackman.
 *
 * Blackman plutôt que Hann : son premier lobe secondaire est à −58 dB au lieu de −31, et c'est ce
 * lobe qui décide de ce qui franchit la coupure. Pour un filtre dont tout l'objet est d'empêcher un
 * repliement, trente décibels de réjection en plus valent la largeur de transition en moins.
 */
function coefficients(coupureNormalisee: number): Float32Array {
  const m = (RANGS_FILTRE - 1) / 2;
  const h = new Float32Array(RANGS_FILTRE);
  let somme = 0;
  for (let i = 0; i < RANGS_FILTRE; i++) {
    const n = i - m;
    const x = 2 * Math.PI * coupureNormalisee * n;
    const sinc = n === 0 ? 2 * coupureNormalisee : Math.sin(x) / (Math.PI * n);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (RANGS_FILTRE - 1))
      + 0.08 * Math.cos((4 * Math.PI * i) / (RANGS_FILTRE - 1));
    h[i] = sinc * w;
    somme += h[i];
  }
  // NORMALISÉ À GAIN UNITÉ EN CONTINU : sans cela le filtre changerait le niveau du son, et une
  // conversion de fréquence qui baisse le niveau est un défaut qu'on cherche ailleurs pendant des
  // heures. `ecartNiveau` du moteur l'aurait d'ailleurs signalé, sur chaque nœud.
  for (let i = 0; i < RANGS_FILTRE; i++) h[i] /= somme;
  return h;
}

/** Convolution à bords réfléchis : un bord à zéro ferait un clic au début et à la fin. */
function filtrer(x: ArrayLike<number>, h: Float32Array): Float32Array {
  const m = (h.length - 1) / 2;
  const y = new Float32Array(x.length);
  const lire = (i: number) => x[i < 0 ? Math.min(-i, x.length - 1) : i >= x.length ? Math.max(0, 2 * x.length - 2 - i) : i];
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (let k = 0; k < h.length; k++) s += h[k] * lire(n + k - m);
    y[n] = s;
  }
  return y;
}

/**
 * Un canal, porté de `depart` à `arrivee`.
 *
 * L'ORDRE EST FILTRER PUIS INTERPOLER, et il ne se renverse pas : filtrer après la décimation
 * n'enlèverait pas un repliement, puisque le repliement est déjà DANS la bande — c'est tout ce que
 * le mot veut dire. Ce qui doit partir doit partir pendant qu'il est encore au-dessus de Nyquist.
 */
export function reechantillonnerCanal(
  x: ArrayLike<number>, depart: number, arrivee: number,
): Float32Array<ArrayBuffer> {
  // LE TYPE DE RETOUR EST EXPLICITE, et ce n'est pas une coquetterie : `copyToChannel` exige un
  // `Float32Array<ArrayBuffer>`, et un tableau venu d'un `getChannelData` est typé sur
  // `ArrayBufferLike` — qui pourrait être partagé. On recopie donc dans un tableau à nous.
  if (depart === arrivee) { const m = new Float32Array(x.length); m.set(x); return m; }
  const source = arrivee < depart ? filtrer(x, coefficients((COUPURE * arrivee) / depart)) : x;
  const lire = (i: number) => source[Math.min(source.length - 1, Math.max(0, i))];
  const pas = depart / arrivee;
  const n = Math.max(1, Math.round((x.length * arrivee) / depart));
  const y = new Float32Array(n);
  for (let j = 0; j < n; j++) y[j] = echantillonCubique(lire, j * pas);
  return y;
}

/** Le calcul d'un canal, dans le fil ou hors de lui. Il reçoit une copie, qu'il peut garder. */
export type PorterCanal = (
  x: Float32Array, depart: number, arrivee: number,
) => Float32Array<ArrayBuffer> | Promise<Float32Array<ArrayBuffer>>;

/**
 * Le son, porté à `frequence` — et le MÊME OBJET quand il y est déjà.
 *
 * L'identité dans le cas ordinaire n'est pas une optimisation accessoire : c'est ce qui rend
 * l'invariant du moteur gratuit. Un graphe entier à 44 100 Hz ne paie rien du tout, et l'économie de
 * mémoire du dépôt compte les tampons — une copie par nœud et par run s'y verrait.
 *
 * `canaux` permet d'en changer le nombre au passage, ce dont la table de montage a besoin : elle
 * mélange des pistes mono et stéréo et doit les amener au même compte. Le nombre de canaux se règle
 * APRÈS la fréquence, et par `OfflineAudioContext` : le mélange de canaux n'a pas de question de
 * qualité, ses règles sont écrites dans la spécification, et le tampon y arrive déjà à la bonne
 * fréquence — donc rien n'y est rééchantillonné en linéaire.
 *
 * `porter` calcule UN canal, et c'est par lui que le moteur sort ce calcul du fil de l'interface :
 * voir `porterALaFrequenceDeTravail` dans `plugins/apercu-domaine.ts`. Le travailleur ne peut pas
 * être créé ICI, parce qu'il importe ce module pour `reechantillonnerCanal` : Vite refuse un
 * travailleur qui se crée lui-même. Sans `porter`, le calcul a lieu dans le fil, comme en test.
 */
export async function convertirVersFrequence(
  buffer: AudioBuffer, frequence: number, canaux = buffer.numberOfChannels,
  porter: PorterCanal = reechantillonnerCanal,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === frequence && buffer.numberOfChannels === canaux) return buffer;
  if (buffer.length < 1) return buffer;

  let porte = buffer;
  if (buffer.sampleRate !== frequence) {
    const voies = await Promise.all(Array.from({ length: buffer.numberOfChannels },
      (_, c) => porter(buffer.getChannelData(c).slice(), buffer.sampleRate, frequence)));
    porte = new AudioBuffer({
      numberOfChannels: buffer.numberOfChannels, length: voies[0].length, sampleRate: frequence,
    });
    voies.forEach((voie, c) => porte.copyToChannel(voie, c));
  }
  if (porte.numberOfChannels === canaux) return porte;

  const offline = new OfflineAudioContext(canaux, porte.length, frequence);
  const source = offline.createBufferSource();
  source.buffer = porte;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

/**
 * Le son porté à `frequence` PAR LE MOTEUR DU NAVIGATEUR, et non par le filtre de ce module.
 *
 * CE SONT DEUX MOTEURS, ET ILS NE RENDENT PAS LES MÊMES ÉCHANTILLONS. `convertirVersFrequence`
 * filtre et interpole ici même, pour que l'invariant de fréquence du projet ne dépende pas de ce que
 * Chromium fait d'un `OfflineAudioContext`. Mais six modules rééchantillonnaient par le navigateur
 * — une réponse impulsionnelle à amener à la fréquence du son, un tampon à porter aux 16 kHz d'un
 * modèle, un MP3 à écrire — et chacun écrivait le même bloc de huit lignes (relevé du 2026-10-31,
 * lot 4 de la revue : `concret`, `convolution`, `io`, `objets-sonores`, `debruitage-ia`,
 * `melangeur-logistique`, plus `isoler-voix`, `sherpa-asr` et `vosk-asr`). Les faire passer par le
 * filtre d'ici aurait changé leur son ; ce bloc est donc écrit une fois, et c'est tout.
 *
 * `longueur` SE DONNE PARCE QUE LES COPIES NE LA CALCULAIENT PAS TOUTES PAREIL : `Math.ceil` de la
 * durée pour six, `Math.round` pour une, `length × arrivée ÷ départ` pour deux, et un flottant ne
 * tombe pas toujours du même côté de l'entier selon le chemin. Le défaut est la formule des six ;
 * un appelant qui en avait une autre la passe, et ses échantillons restent les mêmes au bit près.
 */
export async function reechantillonnerParLeNavigateur(
  buffer: AudioBuffer, frequence: number,
  { canaux = buffer.numberOfChannels, longueur = Math.max(1, Math.ceil(buffer.duration * frequence)) } = {},
): Promise<AudioBuffer> {
  const hors = new OfflineAudioContext(canaux, longueur, frequence);
  const source = hors.createBufferSource();
  source.buffer = buffer;
  source.connect(hors.destination);
  source.start(0);
  return hors.startRendering();
}

/**
 * Une voie rééchantillonnée en LINÉAIRE : le repli des transcripteurs quand le navigateur manque.
 *
 * Deux d'entre eux l'écrivaient chacun, à l'identique. Ce n'est pas le filtre de
 * `reechantillonnerCanal`, et ce n'est pas voulu pour le son : un transcripteur veut des mots, et il
 * l'a choisi pour sa vitesse.
 */
export function reechantillonnerLineaire(x: Float32Array, depart: number, arrivee: number): Float32Array {
  if (depart === arrivee) return x;
  const ratio = arrivee / depart;
  const nb = Math.floor(x.length * ratio);
  const out = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = idx + 1 < x.length ? x[idx] * (1 - frac) + x[idx + 1] * frac : x[Math.min(idx, x.length - 1)];
  }
  return out;
}
