// audio/couleurs.ts — Décodage couleur → musique (psychologie + chromesthésie).
// Table de correspondance entre couleurs et attributs musicaux (émotion, mode,
// tempo, instruments, styles, voix), + fusion de deux couleurs.

export interface ProfilMusical {
  emotion: { fr: string; en: string };
  mode: { fr: string; en: string };
  tempo: { fr: string; en: string };
  bpm: [number, number];
  instruments: { fr: string; en: string }[];
  styles: { fr: string; en: string }[];
  voix: { fr: string; en: string };
}

export const COULEURS: Record<string, { fr: string; en: string; hex: string; profil: ProfilMusical }> = {
  Rouge: {
    fr: "Rouge", en: "Red", hex: "#e63946",
    profil: {
      emotion: { fr: "Passion, intensité, colère", en: "Passion, intensity, anger" },
      mode: { fr: "Mineur", en: "Minor" },
      tempo: { fr: "Rapide", en: "Fast" },
      bpm: [140, 180],
      instruments: [
        { fr: "Guitare électrique distordue", en: "Distorted electric guitar" },
        { fr: "Percussions puissantes", en: "Powerful percussion" },
        { fr: "Cuivres", en: "Brass" },
        { fr: "Basse driving", en: "Driving bass" },
      ],
      styles: [{ fr: "Rock", en: "Rock" }, { fr: "Métal", en: "Metal" }, { fr: "Drum and bass", en: "Drum and bass" }],
      voix: { fr: "Ténor dramatique", en: "Dramatic tenor" },
    },
  },
  Orange: {
    fr: "Orange", en: "Orange", hex: "#f4a261",
    profil: {
      emotion: { fr: "Chaleur, enthusiasm, énergie", en: "Warmth, enthusiasm, energy" },
      mode: { fr: "Mixte", en: "Mixed" },
      tempo: { fr: "Modéré-rapide", en: "Moderate-fast" },
      bpm: [110, 140],
      instruments: [
        { fr: "Guitare funk", en: "Funk guitar" },
        { fr: "Saxophone", en: "Saxophone" },
        { fr: "Percussions latines", en: "Latin percussion" },
        { fr: "Claviers", en: "Keyboards" },
      ],
      styles: [{ fr: "Funk", en: "Funk" }, { fr: "Latin", en: "Latin" }, { fr: "Pop", en: "Pop" }],
      voix: { fr: "Baryton", en: "Baritone" },
    },
  },
  Jaune: {
    fr: "Jaune", en: "Yellow", hex: "#e9c46a",
    profil: {
      emotion: { fr: "Joie, lumière, optimisme", en: "Joy, brightness, optimism" },
      mode: { fr: "Majeur", en: "Major" },
      tempo: { fr: "Rapide", en: "Fast" },
      bpm: [120, 160],
      instruments: [
        { fr: "Cloches", en: "Bells" },
        { fr: "Ukulélé", en: "Ukulele" },
        { fr: "Flûte", en: "Flute" },
        { fr: "Synthétiseur brillant", en: "Bright synthesizer" },
      ],
      styles: [{ fr: "Pop", en: "Pop" }, { fr: "Sunshine pop", en: "Sunshine pop" }, { fr: "Electro", en: "Electro" }],
      voix: { fr: "Soprano légère", en: "Light soprano" },
    },
  },
  Vert: {
    fr: "Vert", en: "Green", hex: "#2a9d8f",
    profil: {
      emotion: { fr: "Nature, apaisement, croissance", en: "Nature, calm, growth" },
      mode: { fr: "Majeur", en: "Major" },
      tempo: { fr: "Lent-modéré", en: "Slow-moderate" },
      bpm: [70, 110],
      instruments: [
        { fr: "Guitare acoustique", en: "Acoustic guitar" },
        { fr: "Harpe", en: "Harp" },
        { fr: "Vents doux", en: "Soft winds" },
        { fr: "Piano", en: "Piano" },
      ],
      styles: [{ fr: "Folk", en: "Folk" }, { fr: "Ambient", en: "Ambient" }, { fr: "Pastoral", en: "Pastoral" }],
      voix: { fr: "Mezzo-soprano", en: "Mezzo-soprano" },
    },
  },
  Bleu: {
    fr: "Bleu", en: "Blue", hex: "#36a2eb",
    profil: {
      emotion: { fr: "Mélancolie, profondeur, calme", en: "Melancholy, depth, calm" },
      mode: { fr: "Mineur", en: "Minor" },
      tempo: { fr: "Lent", en: "Slow" },
      bpm: [60, 90],
      instruments: [
        { fr: "Piano", en: "Piano" },
        { fr: "Violoncelle", en: "Cello" },
        { fr: "Contrebasse", en: "Double bass" },
        { fr: "Rhodes", en: "Rhodes" },
      ],
      styles: [{ fr: "Blues", en: "Blues" }, { fr: "Jazz", en: "Jazz" }, { fr: "Soul", en: "Soul" }],
      voix: { fr: "Contralto", en: "Contralto" },
    },
  },
  Violet: {
    fr: "Violet", en: "Purple", hex: "#8e6fce",
    profil: {
      emotion: { fr: "Mystère, spiritualité, rêve", en: "Mystery, spirituality, dream" },
      mode: { fr: "Mineur", en: "Minor" },
      tempo: { fr: "Modéré", en: "Moderate" },
      bpm: [80, 120],
      instruments: [
        { fr: "Synthétiseur", en: "Synthesizer" },
        { fr: "Pad", en: "Pad" },
        { fr: "Voix éthérée", en: "Ethereal voice" },
        { fr: "Sitar", en: "Sitar" },
      ],
      styles: [{ fr: "Ambient", en: "Ambient" }, { fr: "Psychédélique", en: "Psychedelic" }, { fr: "Trip-hop", en: "Trip-hop" }],
      voix: { fr: "Soprano colorature", en: "Coloratura soprano" },
    },
  },
  Rose: {
    fr: "Rose", en: "Pink", hex: "#e76f9c",
    profil: {
      emotion: { fr: "Douceur, romance, légèreté", en: "Sweetness, romance, lightness" },
      mode: { fr: "Majeur", en: "Major" },
      tempo: { fr: "Modéré", en: "Moderate" },
      bpm: [90, 130],
      instruments: [
        { fr: "Glockenspiel", en: "Glockenspiel" },
        { fr: "Voix douce", en: "Soft voice" },
        { fr: "Synthé cristallin", en: "Crystal synth" },
        { fr: "Cloches", en: "Bells" },
      ],
      styles: [{ fr: "Dream pop", en: "Dream pop" }, { fr: "Twee pop", en: "Twee pop" }, { fr: "Chillwave", en: "Chillwave" }],
      voix: { fr: "Soprano lyrique", en: "Lyric soprano" },
    },
  },
  Noir: {
    fr: "Noir", en: "Black", hex: "#1a1a2e",
    profil: {
      emotion: { fr: "Obscurité, puissance, angoisse", en: "Darkness, power, dread" },
      mode: { fr: "Mineur", en: "Minor" },
      tempo: { fr: "Variable", en: "Variable" },
      bpm: [60, 200],
      instruments: [
        { fr: "Basses profondes", en: "Deep bass" },
        { fr: "Distorsion", en: "Distortion" },
        { fr: "Chœur grave", en: "Deep choir" },
        { fr: "Batterie lourde", en: "Heavy drums" },
      ],
      styles: [{ fr: "Métal", en: "Metal" }, { fr: "Dark ambient", en: "Dark ambient" }, { fr: "Industriel", en: "Industrial" }],
      voix: { fr: "Basse contrebasse", en: "Basso profondo" },
    },
  },
  Blanc: {
    fr: "Blanc", en: "White", hex: "#f0f0f0",
    profil: {
      emotion: { fr: "Pureté, minimalisme, vide", en: "Purity, minimalism, void" },
      mode: { fr: "Majeur", en: "Major" },
      tempo: { fr: "Lent", en: "Slow" },
      bpm: [50, 80],
      instruments: [
        { fr: "Piano seul", en: "Solo piano" },
        { fr: "Voix blanche", en: "White voice" },
        { fr: "Ondes Martenot", en: "Ondes Martenot" },
        { fr: "Célesta", en: "Celesta" },
      ],
      styles: [{ fr: "Minimaliste", en: "Minimalist" }, { fr: "Contemporain", en: "Contemporary" }, { fr: "Ambient", en: "Ambient" }],
      voix: { fr: "Soprano enfant", en: "Boy soprano" },
    },
  },
  Marron: {
    fr: "Marron", en: "Brown", hex: "#8b5a2b",
    profil: {
      emotion: { fr: "Terre, chaleur, rusticité", en: "Earth, warmth, rusticity" },
      mode: { fr: "Mixte", en: "Mixed" },
      tempo: { fr: "Modéré", en: "Moderate" },
      bpm: [80, 120],
      instruments: [
        { fr: "Banjo", en: "Banjo" },
        { fr: "Contrebasse", en: "Double bass" },
        { fr: "Accordéon", en: "Accordion" },
        { fr: "Violon", en: "Fiddle" },
      ],
      styles: [{ fr: "Country", en: "Country" }, { fr: "Folk", en: "Folk" }, { fr: "Bluegrass", en: "Bluegrass" }],
      voix: { fr: "Baryton Martin", en: "Baritone Martin" },
    },
  },
  Gris: {
    fr: "Gris", en: "Grey", hex: "#9a9a9a",
    profil: {
      emotion: { fr: "Neutralité, ambiguïté, brouillard", en: "Neutrality, ambiguity, fog" },
      mode: { fr: "Mixte", en: "Mixed" },
      tempo: { fr: "Lent", en: "Slow" },
      bpm: [60, 100],
      instruments: [
        { fr: "Pad", en: "Pad" },
        { fr: "Bruit", en: "Noise" },
        { fr: "Piano préparé", en: "Prepared piano" },
        { fr: "Basses modulaires", en: "Modular bass" },
      ],
      styles: [{ fr: "Ambient", en: "Ambient" }, { fr: "Expérimental", en: "Experimental" }, { fr: "Drone", en: "Drone" }],
      voix: { fr: "Voix parlée", en: "Spoken voice" },
    },
  },
};

export const NOMS_COULEURS = Object.keys(COULEURS);

export function profilCouleur(nom: string): ProfilMusical | null {
  return COULEURS[nom]?.profil ?? null;
}

export function fusionnerProfils(p1: ProfilMusical, p2: ProfilMusical, _nom1: string, _nom2: string): ProfilMusical {
  const pick = <T>(a: T, b: T): T => Math.random() < 0.5 ? a : b;
  const mergeArr = <T>(a: T[], b: T[]): T[] => {
    const set = new Set<string>();
    const out: T[] = [];
    for (const x of [...a, ...b]) {
      const key = JSON.stringify(x);
      if (!set.has(key)) { set.add(key); out.push(x); }
    }
    return out.slice(0, 5);
  };

  const bpmMin = Math.round((p1.bpm[0] + p2.bpm[0]) / 2);
  const bpmMax = Math.round((p1.bpm[1] + p2.bpm[1]) / 2);

  const emotionCombine = {
    fr: `${p1.emotion.fr} × ${p2.emotion.fr}`,
    en: `${p1.emotion.en} × ${p2.emotion.en}`,
  };

  return {
    emotion: emotionCombine,
    mode: pick(p1.mode, p2.mode),
    tempo: { fr: "Modéré", en: "Moderate" },
    bpm: [bpmMin, bpmMax],
    instruments: mergeArr(p1.instruments, p2.instruments),
    styles: mergeArr(p1.styles, p2.styles).slice(0, 3),
    voix: pick(p1.voix, p2.voix),
  };
}

export function profilVersScript(
  profil: ProfilMusical,
  couleurs: string[],
  langue: "fr" | "en",
): string {
  const fr = langue === "fr";
  const l = (b: { fr: string; en: string }) => fr ? b.fr : b.en;

  const lignes: string[] = [];
  lignes.push(fr ? "=== Script de génération musicale IA ===" : "=== AI Music Generation Script ===");
  lignes.push("");
  lignes.push(fr ? `Couleur(s) : ${couleurs.join(" + ")}` : `Color(s): ${couleurs.join(" + ")}`);
  lignes.push(fr ? `Émotion : ${l(profil.emotion)}` : `Emotion: ${l(profil.emotion)}`);
  lignes.push(fr ? `Mode : ${l(profil.mode)}` : `Mode: ${l(profil.mode)}`);
  lignes.push(fr ? `Tempo : ${l(profil.tempo)} (${profil.bpm[0]}–${profil.bpm[1]} BPM)` : `Tempo: ${l(profil.tempo)} (${profil.bpm[0]}–${profil.bpm[1]} BPM)`);
  lignes.push(fr ? `Instruments : ${profil.instruments.map(l).join(", ")}` : `Instruments: ${profil.instruments.map(l).join(", ")}`);
  lignes.push(fr ? `Styles : ${profil.styles.map(l).join(", ")}` : `Styles: ${profil.styles.map(l).join(", ")}`);
  lignes.push(fr ? `Voix : ${l(profil.voix)}` : `Vocals: ${l(profil.voix)}`);

  lignes.push("");
  lignes.push(fr ? "--- Prompt ---" : "--- Prompt ---");
  const parts: string[] = [];
  parts.push(fr ? `un morceau ${l(profil.mode).toLowerCase()}` : `a ${l(profil.mode).toLowerCase()} track`);
  if (profil.styles.length > 0) parts.push(fr ? `de style ${profil.styles.map(l).join(" / ")}` : `in ${profil.styles.map(l).join(" / ")}`);
  if (profil.instruments.length > 0) parts.push(fr ? `avec ${profil.instruments.map(l).join(", ")}` : `featuring ${profil.instruments.map(l).join(", ")}`);
  parts.push(fr ? `dégageant ${l(profil.emotion).toLowerCase()}` : `evoking ${l(profil.emotion).toLowerCase()}`);
  parts.push(fr ? `à ${profil.bpm[0]}–${profil.bpm[1]} BPM` : `at ${profil.bpm[0]}–${profil.bpm[1]} BPM`);
  parts.push(fr ? `chanté par ${l(profil.voix)}` : `sung by ${l(profil.voix)}`);

  lignes.push(fr ? `Crée ${parts.join(", ")}.` : `Create ${parts.join(", ")}.`);

  lignes.push("");
  lignes.push(fr ? "--- Tags ---" : "--- Tags ---");
  const tags = [
    ...profil.styles.map((s) => l(s).toLowerCase().replace(/\s+/g, "-")),
    l(profil.emotion).toLowerCase().replace(/[,×]/g, "").split(/\s+/).slice(0, 3).join("-"),
    l(profil.voix).toLowerCase().replace(/\s+/g, "-"),
  ];
  lignes.push(tags.join(", "));

  return lignes.join("\n");
}

// ─── Utilitaires de conversion couleur partagés ───

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const L = (max + min) / 2;
  let H = 0;
  let S = 0;
  if (max !== min) {
    const d = max - min;
    S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R:
        H = ((G - B) / d + (G < B ? 6 : 0)) / 6;
        break;
      case G:
        H = ((B - R) / d + 2) / 6;
        break;
      case B:
        H = ((R - G) / d + 4) / 6;
        break;
    }
  }
  return [H * 360, S, L];
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/);
  if (!match) return null;
  let h = match[1];
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function distanceRgb2(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
}
