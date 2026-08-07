// audio/emotion.ts — Analyse émotionnelle purement musicale.
// Aucun texte ni parole n'est utilisé : uniquement des indices acoustiques
// structurels (tempo, mode majeur/mineur, énergie, brillance spectrale),
// qui sont les signaux les plus déterminants de l'émotion perçue d'après la
// littérature en psychologie de la musique (Gabrielsson & Lindström, 2001).
// Ces indices sont combinés en deux axes — valence (négatif/positif) et
// arousal (calme/énergique) — selon le modèle circomplex de Russell (1980),
// puis reprojetés sur 8 émotions nommées réparties tous les 45° autour du
// cercle, plus un état neutre au centre.
import { analyserAudio, calculerRMS_Meyda, calculerCentroidSpectralMeyda } from "./analyse";
import { traduire } from "../i18n";

export interface AnalyseEmotionnelle {
  valence: number; // -1 (négatif) .. +1 (positif)
  arousal: number; // -1 (calme) .. +1 (énergique)
  intensite: number; // 0..1, distance au centre du cercle (force du signal émotionnel)
  emotion: string;
  emotionEn: string;
  confiance: number; // 0..1
  tempo: number;
  mode: "majeur" | "mineur";
  energieDb: number;
  brillanceHz: number;
  description: string;
}

interface EtiquetteEmotion {
  angleDeg: number;
  cle: string;
  en: string;
}

// Réparties tous les 45° sur le cercle valence(x)/arousal(y).
const ETIQUETTES: EtiquetteEmotion[] = [
  { angleDeg: 0, cle: "emotion.content", en: "Content" },
  { angleDeg: 45, cle: "emotion.joyeux", en: "Happy" },
  { angleDeg: 90, cle: "emotion.energique", en: "Energetic" },
  { angleDeg: 135, cle: "emotion.tendu", en: "Tense" },
  { angleDeg: 180, cle: "emotion.triste", en: "Sad" },
  { angleDeg: 225, cle: "emotion.melancolique", en: "Melancholic" },
  { angleDeg: 270, cle: "emotion.calme", en: "Calm" },
  { angleDeg: 315, cle: "emotion.serein", en: "Peaceful" },
];
const ETIQUETTE_NEUTRE = { cle: "emotion.neutre", en: "Neutral" };

// En dessous de ce rayon, le signal (valence, arousal) est trop proche du
// centre pour désigner une émotion précise : on retombe sur « Neutre ».
const RAYON_NEUTRE = 0.12;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normaliser(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return clamp01((v - min) / (max - min));
}

function etiquetteDepuisAngle(valence: number, arousal: number): { cle: string; en: string } {
  const magnitude = Math.hypot(valence, arousal);
  if (magnitude < RAYON_NEUTRE) return ETIQUETTE_NEUTRE;
  let angle = (Math.atan2(arousal, valence) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  let meilleure = ETIQUETTES[0];
  let meilleurEcart = Infinity;
  for (const e of ETIQUETTES) {
    let ecart = Math.abs(angle - e.angleDeg);
    if (ecart > 180) ecart = 360 - ecart;
    if (ecart < meilleurEcart) {
      meilleurEcart = ecart;
      meilleure = e;
    }
  }
  return meilleure;
}

export function analyserEmotion(buffer: AudioBuffer): AnalyseEmotionnelle {
  const base = analyserAudio(buffer);
  const rms = calculerRMS_Meyda(buffer);
  const centroide = calculerCentroidSpectralMeyda(buffer);

  // Indices bruts normalisés en [0,1].
  const tempoNorm = normaliser(base.tempo, 50, 180); // lent → rapide
  const energieNorm = normaliser(rms.valeur, -35, -8); // calme → fort (dBFS)
  const brillanceNorm = normaliser(centroide.valeur, 500, 4000); // sombre → brillant

  // Arousal : le tempo domine (signal le plus fiable d'énergie perçue),
  // l'énergie sonore et la brillance affinent.
  const arousalNorm = clamp01(0.5 * tempoNorm + 0.35 * energieNorm + 0.15 * brillanceNorm);
  const arousal = arousalNorm * 2 - 1;

  // Valence : le mode majeur/mineur est le signal dominant établi par la
  // recherche (Gagnon & Peretz, 2003), pondéré par la confiance de la
  // détection de tonalité ; la brillance affine (timbre clair perçu comme
  // plus positif, timbre sombre comme plus mélancolique).
  const modeSigne = base.mode === "majeur" ? 1 : -1;
  const modePoids = 0.5 + 0.5 * base.modeConfiance;
  const valenceBrute = 0.7 * modeSigne * modePoids + 0.3 * (brillanceNorm * 2 - 1);
  const valence = Math.max(-1, Math.min(1, valenceBrute));

  const intensite = Math.min(1, Math.hypot(valence, arousal) / Math.SQRT2);
  const etiquette = etiquetteDepuisAngle(valence, arousal);
  const confiance = clamp01(0.5 * intensite + 0.5 * base.modeConfiance);
  const emotion = traduire(etiquette.cle);

  const descr: string[] = [
    traduire("emotion.titre"),
    traduire("analyse.tempo_label", `${base.tempo} BPM`),
    traduire(
      "analyse.tonalite_label",
      traduire(base.mode === "mineur" ? "analyse.nom_mineur" : "analyse.nom_majeur", base.tonalites[0]?.tonalite.split(" ")[0] ?? "?"),
      Math.round(base.modeConfiance * 100),
    ),
    traduire("emotion.energie", Number.isFinite(rms.valeur) ? rms.valeur.toFixed(1) : "−∞"),
    traduire("emotion.brillance", centroide.valeur.toFixed(0)),
    "",
    traduire("emotion.va", valence >= 0 ? `+${valence.toFixed(2)}` : valence.toFixed(2), arousal >= 0 ? `+${arousal.toFixed(2)}` : arousal.toFixed(2)),
    traduire("emotion.verdict", emotion, Math.round(confiance * 100)),
    "",
    traduire("emotion.avertissement"),
  ];

  return {
    valence,
    arousal,
    intensite,
    emotion,
    emotionEn: etiquette.en,
    confiance,
    tempo: base.tempo,
    mode: base.mode,
    energieDb: rms.valeur,
    brillanceHz: centroide.valeur,
    description: descr.join("\n"),
  };
}
