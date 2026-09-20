// docs/style-documentation.test.ts — Le ton des documentations montrées par l'inspecteur.
//
// CE QUE CE TEST TIENT. Les notices et les documentations de paramètres sont lues dans un panneau
// étroit, à côté d'un curseur qu'on est en train de régler. Un mot en capitales y est une voix qui
// monte : sur une phrase c'est une insistance, sur trois cents c'est un texte qui crie, et le
// lecteur cesse de distinguer ce qui compte vraiment de ce qui est simplement écrit en gras.
//
// La règle est donc simple et vérifiable : DANS UNE DOCUMENTATION, un mot ne s'écrit pas en
// capitales — sauf s'il n'existe qu'ainsi. `MIDI`, `SFZ`, `RT60` sont des noms ; `PAS`, `DEUX`,
// `MÊME` sont des haussements de ton. La liste des premiers est explicite ci-dessous : un sigle
// nouveau s'y ajoute en une ligne, et ce geste est ce qui empêche la liste de tout absoudre.
//
// Ce test ne dit rien du style démonstratif, qui ne se mesure pas. Il tient le seul symptôme qui
// se mesure, et c'est déjà ce qui se voit en premier.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "../plugins/index";

/** Ce qui n'existe qu'en capitales : des noms, pas des insistances. */
const SIGLES = new Set([
  // Formats et fichiers
  "MIDI", "SF2", "SFZ", "WAV", "MP3", "OGG", "FLAC", "AAC", "M4A", "WMA", "PNG", "JPG", "SVG",
  "PDF", "JSON", "CSV", "TXT", "XML", "YAML", "HTML", "CSS", "ZIP", "GIF", "WEBP", "ASCII", "UTF",
  // Audio, traitement du signal
  "FFT", "IFFT", "STFT", "DSP", "LFO", "ADSR", "RMS", "EQ", "BPF", "LPF", "HPF", "FIR", "IIR",
  "RT60", "FDN", "PGHI", "ZCR", "MFCC", "YIN", "HPSS", "STN", "SNR", "THD", "DC", "AM", "FM",
  "PM", "PWM", "CV", "BPM", "GM", "IR", "VST", "DAW", "OSC", "SMS", "MMS",
  // Apprentissage automatique
  "ONNX", "LLM", "RNN", "VAE", "GAN", "CNN", "PCA", "TTS", "ASR", "STT", "VAD", "DDSP", "SA3",
  "SDXS", "GTCRN", "MDX", "UVR", "WASM", "CPU", "GPU", "RAM",
  // Musique et notation
  "ABC", "BWV", "IPA", "I", "II", "III", "IV", "V", "VI", "VII",
  // Divers
  "API", "URL", "URI", "ID", "UI", "IA", "SHA", "IEEE", "ISO", "UTC", "LSB", "MSB", "HZ", "KHZ",
  "DB", "MS", "NSIS", "ENV", "PID", "TCP", "UDP", "HTTP", "HTTPS", "OK", "USB", "HRTF",
  "LPC", "MSE", "NRT", "SSB", "PLL", "LSTM", "GRU", "SIMD", "GTZAN", "NSGT", "CQT", "EMD", "IFS", "ACM", "AES", "ARIMA", "AWB", "BDL", "CCRMA", "CDN", "CLB", "CMU",
  "DTW", "GMM", "GPT", "GUI", "HSL", "IBM", "ICA", "ICASSP", "IRCAM", "ITU", "JMK", "KSP",
  "LRA", "LUFS", "LVA", "MIT", "NLP", "OCR", "RGB", "RRGGBB", "SDK", "SLT", "TAESD", "TASLP",
  "OPUS", "EVY", "PLPLPL", "CPS", "PCH", "OCT", "FOF", "ARGS", "PPCM", "JPEG",
]);

/**
 * Un mot de trois lettres ou plus, tout en capitales.
 *
 * PAS DE `\b` : en JavaScript, la limite de mot se définit sur `[A-Za-z0-9_]`, si bien qu'il n'y
 * en a pas entre une espace et un « É ». « ÉVÉNEMENT » se faisait ainsi relever comme
 * « VÉNEMENT », et « L'IR » comme un mot entier. Les bornes sont donc posées à la main, sur la
 * lettre accentuée comme sur l'apostrophe. La ligature « Œ » est ajoutée aux classes pour la même
 * raison : hors de la plage « À-ÿ », elle coupait « NŒUD » en deux morceaux trop courts pour compter.
 */
const MOT_CRIE = /(?<![A-Za-zÀ-ÿŒœŸ])[A-ZÀ-ÖØ-ÞŒŸ]{3,}(?![A-Za-zÀ-ÿŒœŸ])/g;

/** Un chiffre romain — un siècle, un degré — n'est pas un mot crié. */
const ROMAIN = /^[IVXLCDM]+$/;

/** Les mots criés d'un texte, sigles et chiffres romains écartés. */
function crie(texte: string | undefined): string[] {
  if (!texte) return [];
  return [...texte.matchAll(MOT_CRIE)].map((m) => m[0])
    .filter((m) => !SIGLES.has(m) && !ROMAIN.test(m));
}

/** Toutes les documentations qu'un inspecteur peut montrer, avec de quoi les retrouver. */
function documentations(): { ou: string; texte: string }[] {
  const out: { ou: string; texte: string }[] = [];
  for (const f of toutesLesFiches) {
    for (const [champ, texte] of [["notice", f.notice], ["noticeEn", (f as any).noticeEn]] as const) {
      if (texte) out.push({ ou: `${f.id} · ${champ}`, texte });
    }
    for (const p of f.parametres ?? []) {
      for (const [champ, texte] of [["doc", p.doc], ["docEn", p.docEn]] as const) {
        if (texte) out.push({ ou: `${f.id} · ${p.nom} · ${champ}`, texte });
      }
    }
  }
  return out;
}

describe("le ton des documentations", () => {
  const docs = documentations();

  it("en trouve assez pour que le contrôle ait un sens", () => {
    expect(docs.length).toBeGreaterThan(500);
  });

  it("n'écrit aucun mot ordinaire en capitales — une documentation ne hausse pas la voix", () => {
    const fautives = docs
      .map((d) => ({ ...d, mots: [...new Set(crie(d.texte))] }))
      .filter((d) => d.mots.length > 0);
    const rapport = fautives.slice(0, 40)
      .map((d) => `  ${d.ou} — ${d.mots.join(", ")}`)
      .join("\n");
    expect(fautives.map((d) => d.ou), fautives.length === 0 ? "" :
      `${fautives.length} documentation(s) écrivent en capitales :\n${rapport}`
      + (fautives.length > 40 ? `\n  … et ${fautives.length - 40} autres` : "")).toEqual([]);
  });
});
