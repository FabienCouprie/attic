// plugins/familles-palette.ts — Les familles de la palette, pour les traitements et pour les entrées.
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
  "Topologie": ["anneau-moebius", "bouteille-klein", "tore", "ceinture-dirac", "tresse", "tonnetz",
    "spirale-quintes", "spirale-logarithmique", "spirale-spatiale"],
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
    "gate-expandeur", "ducking", "transient-shaper", "recaler-niveau",
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

/**
 * Les familles de « Entrées › Génération ».
 *
 * Cinquante-six nœuds sous un seul en-tête : on y cherchait un synthétiseur parmi les cribles et les
 * métronomes. Le découpage suit ce que le nœud FABRIQUE, non la technique qu'il emploie — un rythme
 * reste un rythme qu'il vienne d'un crible euclidien ou d'un ensemble de Cantor, et c'est par « je
 * veux un rythme » qu'on le cherche.
 *
 * Ce qui n'est pas ici reste dans « Génération » : les sources élémentaires (oscillateur, bruit,
 * fréquence, courbe), les modèles de synthèse qui ne sont pas des instruments (pulsars,
 * caractéristiques, SSP), les générateurs par apprentissage (MusicGen, Stable Audio) et la théorie
 * harmonique.
 */
export const FAMILLES_GENERATION: Record<string, string[]> = {
  // Les instruments joués par le graphe, un timbre chacun.
  "Synthétiseurs": ["fm-synth", "membrane-synth", "metal-synth", "pluck-synth", "poly-synth"],
  // Ce qui se joue en posant des notes.
  "Claviers": ["clavier-melodie", "clavier-sfz", "frontiere-note", "banque-sfz"],
  // L'autosimilarité géométrique, et elle seule. Un L-système réécrit une chaîne, la série de Nørgård
  // se déduit de proche en proche : ni l'un ni l'autre ne fabrique une fractale, et ils rejoignent
  // les autres générateurs. Les rythmes autosimilaires sont rangés avec les rythmes — c'est par là
  // qu'on les cherche.
  "Fractales": ["generateur-fractal", "arpege-koch", "l-systeme", "mappeur-mandelbrot",
    "spectrogramme-fractal", "serie-infinie", "attracteur-ifs"],
  // Ce qui produit tout seul, de proche en proche ou au tirage.
  "Réservoirs et aléatoire": ["boite-groove", "generateur-musical", "melodie-aleatoire",
    "reservoir-musical", "multi-reservoirs"],
  // Les correspondances entre les sens : la couleur, l'odeur, le goût, le geste visible.
  "Résonance sensorielle": ["couleur-rgb", "color-looper", "spectre-visible", "parfum-motif",
    "accord-mets-musique", "cercle-pulsant", "camelot"],
  // Ce qui déroule une suite dans le temps. Le séquenceur de batterie est avec les rythmes.
  "Séquenceurs": ["sequenceur-accords", "sequenceur-melodique"],
  // Les trois nœuds d'après Xenakis, qui forment un corpus à eux seuls.
  "Xenakis": ["crible-xenakis", "ecrans-xenakis", "gendyn-xenakis"],
  // Tout ce qui produit une figure rythmique, quelle qu'en soit la mécanique.
  "Rythmes": ["boite-rythmes", "rythme-euclidien", "rythme-cantor", "metronome",
    "sequenceur-batterie-avance", "canon-pavage", "resultante-schillinger"],
  // Ce qui écrit de la musique par un modèle appris.
  "Générateurs AI": ["musicgen", "stable-audio-3"],
  // Ce qui ne sonne pas mais pilote : la sortie est une courbe, non un son. Un seul nœud à ce jour,
  // et la rubrique existe pour recevoir les suivants.
  "Contrôle": ["generateur-courbe"],
};

/**
 * Les familles de « Visualisation ».
 *
 * Trente nœuds tenaient sous « Analyse », du vu-mètre au classificateur de genre. Le découpage
 * sépare ce qu'on REGARDE — une forme d'onde, un spectre, une matrice — de ce qui rend un CHIFFRE
 * ou un mot sur le son, et de ce qui répond à une question fermée : quel accord, quel tempo.
 *
 * Seul ce qui change de famille figure ici ; le reste demeure dans « Analyse ».
 */
export const FAMILLES_VISUALISATION: Record<string, string[]> = {
  // La bibliothèque Meyda et ses descripteurs, qui vont par quatre.
  "Meyda": ["centroide-spectral", "rms-meyda", "zcr-meyda", "rolloff-spectral-meyda"],
  // Ce qui dit QUOI du son plutôt que de le montrer : un chiffre, un mot, une couleur.
  "Descripteurs": ["gout-du-son", "analyse-emotionnelle", "classificateur-genre", "score-esthetique",
    "comparaison-esthetique", "colorsynth", "rugosite"],
  // Ce qui répond à une question fermée.
  "Détecteurs": ["detecteur-accords", "detecteur-tempo"],
  // Une partition en XML se lit avec les autres notations.
  "Notation": ["musicxml"],
};

/**
 * Les deux tables, chacune dans son univers.
 *
 * L'univers fait partie de la clé : un même identifiant ne se range pas au hasard du fichier où il
 * est écrit, et une table ne peut pas déplacer un nœud d'un univers qu'elle ne concerne pas.
 */
export const TABLES_PAR_UNIVERS: Record<string, Record<string, string[]>> = {
  "Traitement": FAMILLES_EFFETS,
  "Entrées": FAMILLES_GENERATION,
  "Visualisation": FAMILLES_VISUALISATION,
};

/** Univers → identifiant → famille, construit une fois. */
const PAR_UNIVERS = new Map<string, Map<string, string>>(
  Object.entries(TABLES_PAR_UNIVERS).map(([univers, table]) => [
    univers,
    new Map(Object.entries(table).flatMap(([famille, ids]) => ids.map((id) => [id, famille] as const))),
  ]),
);

/**
 * La fiche, rangée dans sa famille si elle en a une.
 *
 * Ne touche qu'aux traitements et aux entrées — et, parmi les traitements, pas seulement aux effets :
 * « Fusionner en stéréo » était dans le Montage, où personne ne le cherchait, et rejoint les autres
 * outils stéréo.
 */
export function rangerParStyle<T extends FicheAudio>(fiche: T): T {
  const famille = PAR_UNIVERS.get(fiche.univers)?.get(fiche.id);
  return famille ? { ...fiche, famille } : fiche;
}
