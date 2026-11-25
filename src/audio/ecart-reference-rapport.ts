// audio/ecart-reference-rapport.ts — Le rapport de « Écart à une référence », en français ou en anglais.
//
// UNE LIGNE PAR AXE, TROIS COLONNES : la valeur de l'audio, celle de la référence, l'écart. Un axe qui
// est une distance entre deux formes (la couleur, le timbre, l'harmonie) n'a pas de valeur de chaque
// côté : sa ligne ne porte que l'écart.
//
// CE QUI N'EST PAS MESURÉ NE S'ÉCRIT PAS EN CHIFFRES. Un côté mono n'a ni corrélation ni rapport côté
// sur milieu, et la ligne dit « mono » plutôt que d'annoncer une corrélation de 1,000 qui ne ferait que
// répéter qu'il n'y a qu'un canal. Deux canaux identiques ont un côté nul, et la ligne dit −∞. Une
// plage de sonie sous trois secondes de son, une DTW sous une demi-seconde, rendent un tiret.

import { REGISTRES } from "./ecart-reference-couleur";
import { BLOCS_DTW_MAX, BLOC_CHROMA_S, type EcartReference } from "./ecart-reference-ecart";
import type { DescriptionSon } from "./ecart-reference-mesures";

const NL = String.fromCharCode(10);

/** Un nombre à `decimales` chiffres : virgule et signe moins typographique en français. */
export function nombre(v: number, decimales: number, en: boolean): string {
  if (Number.isNaN(v)) return "—";
  if (v === Infinity) return "+∞";
  if (v === -Infinity) return "−∞";
  // Un zéro arrondi ne porte pas de signe : « −0,0 » se lirait comme un écart.
  const t = (Math.abs(v) < 0.5 * 10 ** -decimales ? 0 : v).toFixed(decimales);
  return en ? t : t.replace(".", ",").replace("-", "−");
}

/** Un écart : le signe dit de quel côté est l'audio. */
export function signe(v: number, decimales: number, en: boolean): string {
  const t = nombre(v, decimales, en);
  return v > 0 && Number.isFinite(v) && Math.abs(v) >= 0.5 * 10 ** -decimales ? "+" + t : t;
}

/** Une fréquence de bande : « 31,5 Hz », « 1,25 kHz ». */
const frequence = (f: number, en: boolean): string => {
  const t = f < 1000 ? `${f} Hz` : `${f / 1000} kHz`;
  return en ? t : t.replace(".", ",");
};

const ligne = (quoi: string, audio: string, reference: string, ecart: string): string =>
  `${quoi.padEnd(40)}${audio.padEnd(15)}${reference.padEnd(15)}${ecart}`.trimEnd();

/** Le rapport complet : une ligne par axe. */
export function rapportEcart(d: DescriptionSon, r: DescriptionSon, e: EcartReference, en: boolean): string {
  const n = (v: number, dec: number, unite = "") => nombre(v, dec, en) + (unite && Number.isFinite(v) ? " " + unite : "");
  const s = (v: number, dec: number, unite = "") => signe(v, dec, en) + (unite && Number.isFinite(v) ? " " + unite : "");
  const l: string[] = [];
  const titre = (fr: string, anglais: string) => { l.push(""); l.push(en ? anglais : fr); };
  const axe = (fr: string, anglais: string, a: string, b: string, ecart: string) =>
    l.push(ligne(en ? anglais : fr, a, b, ecart));
  const seul = (fr: string, anglais: string, ecart: string) => l.push(ligne(en ? anglais : fr, "", "", ecart));

  l.push(en ? "DISTANCE TO A REFERENCE" : "ÉCART À UNE RÉFÉRENCE");
  l.push("");
  l.push(ligne("", "Audio", en ? "Reference" : "Référence", en ? "Difference" : "Écart"));
  axe("Durée", "Duration", n(d.duree, 2, "s"), n(r.duree, 2, "s"), s(e.duree, 2, "s"));
  axe("Fréquence d'échantillonnage", "Sample rate", n(d.fe, 0, "Hz"), n(r.fe, 0, "Hz"), "");

  titre("NIVEAU", "LEVEL");
  axe("Sonie intégrée", "Integrated loudness", n(d.sonie, 1, "LUFS"), n(r.sonie, 1, "LUFS"), s(e.sonie, 1, "LU"));
  axe("Plage de sonie", "Loudness range", n(d.plageSonie, 1, "LU"), n(r.plageSonie, 1, "LU"), s(e.plageSonie, 1, "LU"));
  axe("Crête vraie", "True peak", s(d.creteVraie, 2, "dBTP"), s(r.creteVraie, 2, "dBTP"), s(e.creteVraie, 2, "dB"));
  axe("Facteur de crête", "Crest factor", n(d.facteurCrete, 1, "dB"), n(r.facteurCrete, 1, "dB"), s(e.facteurCrete, 1, "dB"));
  axe("Plancher (5e centile sur 50 ms)", "Floor (5th percentile over 50 ms)",
    n(d.plancher, 1, "dBFS"), n(r.plancher, 1, "dBFS"), s(e.plancher, 1, "dB"));

  titre("STÉRÉO", "STEREO");
  const mono = (x: DescriptionSon, texte: string) => (x.mono ? "mono" : texte);
  axe("Corrélation gauche/droite", "Left/right correlation",
    mono(d, n(d.correlation, 3)), mono(r, n(r.correlation, 3)), s(e.correlation, 3));
  axe("Côté sur milieu", "Side over mid",
    mono(d, n(d.coteSurMilieu, 1, "dB")), mono(r, n(r.coteSurMilieu, 1, "dB")), s(e.coteSurMilieu, 1, "dB"));

  titre("COULEUR", "COLOR");
  seul("Écart efficace des tiers d'octave", "RMS third-octave difference", n(e.couleur, 2, "dB"));
  l.push(en ? "Third-octave bands, audio minus reference (dB)" : "Tiers d'octave, audio moins référence (dB)");
  for (let i = 0; i < e.tiers.length; i += 7) {
    l.push("  " + e.tiers.slice(i, i + 7).map((t) => `${frequence(t.f, en)} ${signe(t.ecart, 1, en)}`).join(" · "));
  }
  l.push(en ? "Energy share per register" : "Part de l'énergie par registre");
  REGISTRES.forEach((reg, i) => {
    const bornes = `${frequence(reg.bas, en)} ${en ? "to" : "à"} ${frequence(reg.haut, en)}`;
    axe(`  ${reg.fr}, ${bornes}`, `  ${reg.en}, ${bornes}`,
      n(d.couleur.registres[i], 1, "%"), n(r.couleur.registres[i], 1, "%"), s(e.registres[i], 1, "points"));
  });
  axe("Centroïde médian", "Median centroid", n(d.centroide, 0, "Hz"), n(r.centroide, 0, "Hz"), s(e.centroide, 0, "Hz"));
  axe("Platitude médiane", "Median flatness", n(d.platitude, 4), n(r.platitude, 4), s(e.platitude, 4));

  titre("TIMBRE", "TIMBRE");
  seul("MFCC 1 à 12, distance des moyennes", "MFCC 1 to 12, distance of the means", n(e.mfcc, 2));
  seul("MFCC 1 à 12, distance des écarts types", "MFCC 1 to 12, distance of the deviations", n(e.mfccEcart, 2));

  titre("HARMONIE", "HARMONY");
  seul("Profil chroma, cosinus", "Chroma profile, cosine", n(e.chromaCos, 3));
  const bloc = nombre(BLOC_CHROMA_S, 1, en);
  seul(`DTW du chroma, blocs de ${bloc} s`, `Chroma DTW, ${bloc} s blocks`, n(e.dtw, 3));
  if (Number.isFinite(e.dtw)) {
    const t = e.transposition;
    const demiTons = t === 0 ? (en ? "none" : "aucune")
      : en ? `+${t} semitone${t > 1 ? "s" : ""}` : `+${t} demi-ton${t > 1 ? "s" : ""}`;
    l.push(en
      ? `  best transposition of the audio: ${demiTons}; reversed audio: ${n(e.temoinRenverse, 3)}`
      : `  meilleure transposition de l'audio : ${demiTons} ; audio renversé : ${n(e.temoinRenverse, 3)}`);
  }
  if (e.dtwTronquee) {
    const minutes = (BLOCS_DTW_MAX * BLOC_CHROMA_S) / 60;
    l.push(en ? `  computed on the first ${minutes} minutes of each side` : `  calculée sur les ${minutes} premières minutes de chaque côté`);
  }

  titre("RYTHME", "RHYTHM");
  axe("Tempo", "Tempo", n(d.tempo, 1, "BPM"), n(r.tempo, 1, "BPM"), s(e.tempo, 1, "BPM"));
  axe("Attaques par seconde", "Onsets per second", n(d.attaques, 2), n(r.attaques, 2), s(e.attaques, 2));
  return l.join(NL);
}

/** Le message du nœud : les quatre écarts qui disent le plus vite si deux sons se ressemblent. */
export function resumeEcart(e: EcartReference, en: boolean): string {
  return en
    ? `Color ${nombre(e.couleur, 2, en)} dB · MFCC ${nombre(e.mfcc, 2, en)} · loudness ${signe(e.sonie, 1, en)} LU · DTW ${nombre(e.dtw, 3, en)}`
    : `Couleur ${nombre(e.couleur, 2, en)} dB · MFCC ${nombre(e.mfcc, 2, en)} · sonie ${signe(e.sonie, 1, en)} LU · DTW ${nombre(e.dtw, 3, en)}`;
}
