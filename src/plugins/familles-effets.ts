// plugins/familles-effets.ts — Les effets rangés par style dans la palette.
//
// « Traitement › Effets » comptait cent cinquante-huit nœuds sous un seul en-tête : on y cherchait
// une réverbération parmi les compresseurs et les arpégiateurs. Les familles ci-dessous sortent de
// cette liste les ensembles qu'on vient chercher en bloc — toutes les réverbérations, tous les
// échos, tous les étirements —, et laissent dans « Autres effets » ce qui ne forme pas un ensemble.
//
// POURQUOI UNE TABLE PLUTÔT QUE LA FICHE DE CHAQUE NŒUD. Le rangement de la palette est une
// décision d'ensemble : la lire d'un seul endroit permet de la relire et de la changer sans ouvrir
// quarante fichiers, et un nœud déplacé ne touche pas au code qui le calcule. Même motif que les
// notices, rassemblées dans `notices.ts` et posées sur les fiches par `avecDoc`.
//
// Un identifiant inconnu du registre est une faute de frappe qui rangerait un nœud nulle part :
// un test du catalogue le refuse.

import type { FicheAudio } from "../audio/types-domaine";

export const FAMILLES_EFFETS: Record<string, string[]> = {
  // Fabriquer un espace, ou l'enlever.
  "Réverbération": [
    "reverberation", "reverbe-convolution", "reverbe-reseau", "reverb-fractale", "reverbe-hachee",
    "reverb-progressive", "reverberation-velours", "shimmer",
  ],
  // Répéter le son plus tard, une fois ou cent.
  "Écho": [
    "echo", "echo-ping-pong", "echo-inverse", "motif-echo-notes",
    "delay-stereo", "retard-spectral",
  ],
  // Allonger sans transposer.
  "Étirement": ["paulstretch", "etirement-glissant", "etirement-spectre", "continuum-stockhausen"],
  // Le son promené sur une surface refermée sur elle-même.
  "Topologie": ["anneau-moebius", "bouteille-klein", "tore", "ceinture-dirac", "tresse", "tonnetz"],
  // Enlever ce qui n'est pas le son.
  "Débruitage": [
    "debruitage-ia", "reduction-bruit", "profil-bruit", "suppression-clics",
    "restauration-ecretage", "dereverberation",
  ],
  // Changer la durée sans changer la hauteur — ou la vitesse, qui change les deux.
  "Tempo": [
    "changement-tempo", "soundtouch-tempo", "phase-vocoder-tempo", "soundtouch-rate",
    "vitesse-variable", "vitesse-midi", "canon-nancarrow", "dephasage-reich", "rythme-risset",
  ],
  // Changer la hauteur sans changer la durée.
  "Hauteur": [
    "changement-tonalite", "soundtouch-tonalite", "phase-vocoder-tonalite", "correction-hauteur",
    "pitch-progressif", "glissando-tonalite", "harmonizer", "octaver", "glissando-risset",
    "temperament", "transposeur-quantiseur-midi",
  ],
  // Pilotés par la suite logistique : le même chaos règle la profondeur, la vitesse ou le fondu.
  "Logistique": [
    "auto-pan-logistique", "chopper-logistique", "tremolo-logistique", "vibrato-logistique",
    "echo-logistique", "paulstretch-logistique", "melangeur-logistique",
  ],
  // Décider de ce qui passe, et à quel niveau.
  "Égalisation et filtres": [
    "equaliseur", "reponse-filtre", "filtrage-spectre", "de-esser", "peignes-accordes", "resonateurs",
    "compresseur", "compresseur-multibande", "limiteur", "amplificateur", "normaliseur",
    "gate-expandeur", "ducking", "transient-shaper",
  ],
  // Retourner le son, le motif ou le signe — et redistribuer les morceaux.
  "Ordre et inversions": [
    "inverseur-audio", "inversion-polarite", "miroir-inversion", "motif-retrograde",
    "decoupe-aleatoire", "brassage", "serie-dodecaphonique", "motif-repeter-tourner", "harmonie-negative",
    "voicings-accords", "wavesets-wishart",
  ],
  // Fondus et mélange : ce qu on fait en posant les sons les uns après les autres.
  "Montage": ["fondu"],
  // Dessiner le volume dans le temps, ou le prendre à un son pour le poser sur un autre.
  "Contrôle d enveloppe": ["enveloppe-adsr", "transfert-enveloppe"],
  // Ils reçoivent des notes et rendent un son : ce ne sont pas des effets, ce sont des instruments.
  "Instruments": [
    "barre-modale", "secoueurs", "vent-guide-onde", "voyelle-fof", "terrain-onde",
    "synthese-scanning", "drum-synth", "sampler-midi", "sampler-multizones", "banque-clavier",
    "ddsp-tone-transfer",
  ],
  // Ils transforment un motif de notes, sans toucher à un son.
  "Motifs MIDI": ["arpegiateur-midi", "markov-midi", "motif-eclaircir", "motif-imposer-rythme"],
  // Ce qui se passe dans la transformée de Fourier : l analyse est refaite son par son.
  "Spectre": [
    "arpege-spectral", "flou-spectral", "formule-spectrale", "gel-spectral", "melange-fenetres",
    "morphing-spectral", "tracage-spectral", "crible-harmonique", "glissando-interieur",
    "decaleur-frequence", "griffin-lim", "phase-pghi", "remplissage-trou",
    "sms-sinusoides-bruit", "stn-sinus-transitoires-bruit", "separation-harmonique-percussive",
    "separateur-ia", "ondelettes", "decomposition-atomique",
  ],
  // Malmener la forme d onde, ou la faire respirer.
  "Distorsion et modulation": [
    "distorsion", "bitcrusher", "quadrafuzz", "ring-modulator", "magnetophone", "exciter",
    "wahwah", "phaser", "chorus", "flanger", "tremolo", "vibrato", "chopper", "beat-repeat", "suiveur-hauteur",
    "vocoder", "voice-changer", "convolution-deux-sons", "shift-formants",
  ],
  // Où le son se place entre les enceintes, et ce qu'on fait de ses canaux.
  "Stéréo": [
    "largeur-stereo", "spatialisation-stereo", "resonance-audio", "echange-canaux",
    "extraction-centre-cote", "separateur-canaux", "hard-panner", "ambisonique", "auto-pan", "ampleur",
    "doppler",
    "mono-grave", "fusion-stereo",
  ],
};

/** Identifiant → famille, construit une fois. */
const PAR_ID = new Map<string, string>(
  Object.entries(FAMILLES_EFFETS).flatMap(([famille, ids]) => ids.map((id) => [id, famille] as const)),
);

/**
 * La fiche, rangée dans sa famille de style si elle en a une. Ne touche qu'aux traitements — et
 * pas seulement aux effets : « Fusionner en stéréo » était dans le Montage, où personne ne le
 * cherchait, et rejoint les autres outils stéréo.
 */
export function rangerParStyle<T extends FicheAudio>(fiche: T): T {
  const famille = PAR_ID.get(fiche.id);
  if (!famille || fiche.univers !== "Traitement") return fiche;
  return { ...fiche, famille };
}
