// plugins/dither.ts — Nœud « Dither » : réduire la profondeur d'un son, avec dither et mise en forme du bruit.
//
// Demandé par Fabien le 2026-11-15 : « dither avec noise shaping ». Les six choix sont les siens,
// pris le même jour sur un relevé chiffré des filtres : un composant neuf plutôt qu'un « Bitcrusher »
// étendu, qui reste tel quel ; cinq mises en forme, « E 5 coef. » par défaut ; les courbes calculées
// pour 44,1 kHz s'appliquent à toute fréquence, et le message dit quand on s'en écarte ; graine à un ;
// une seule sortie ; et la notice dit ce que l'export en seize bits ajoute.
//
// LE CALCUL EST DANS `audio/dither-mise-en-forme.ts`, testé ; ce fichier lit les réglages, les lui
// passe et dit ce qu'il a fait. IL RESTE DANS LE FIL : neuf multiplications par échantillon au plus.
import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import {
  FILTRES, ditherer, horsConception, type FormeDither, type MiseEnForme,
} from "../audio/dither-mise-en-forme";
import { resoudreGraine } from "../core/hasard";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";

const FORMES = {
  options: ["Aucun", "Rectangulaire", "Triangulaire", "Triangulaire passe-haut"],
  optionsEn: ["None", "Rectangular", "Triangular", "High-pass triangular"],
  optionIds: ["aucun", "rectangulaire", "triangulaire", "triangulaire-passe-haut"] as FormeDither[],
};
const MISES_EN_FORME = {
  options: ["Aucune", "Premier ordre", "Second ordre", "E 5 coef.", "F 9 coef."],
  optionsEn: ["None", "First order", "Second order", "E 5 coef.", "F 9 coef."],
  optionIds: ["aucune", "premier-ordre", "second-ordre", "e-5", "f-9"] as MiseEnForme[],
};

/** Le libellé d'une option dans la langue de l'interface, pour le message. */
function libelle(table: { options: string[]; optionsEn: string[]; optionIds: string[] }, id: string): string {
  const k = Math.max(0, table.optionIds.indexOf(id));
  return (langueCourante() === "en" ? table.optionsEn : table.options)[k];
}

const nombre = (x: number, decimales: number) =>
  x.toLocaleString(langueCourante() === "en" ? "en-US" : "fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export const fiches: FicheAudio[] = ([
  fiche({
    id: "dither", nomDicte: "arrondi avec bruit", nom: "Dither", nomEn: "Dither",
    univers: "Traitement", famille: "Effets",
    resume: "Réduit la profondeur du son, avec un bruit de dither et une mise en forme de ce bruit.",
    resumeEn: "Reduces the sound's bit depth, with dither noise and shaping of that noise.",
    etiquettes: ["dither", "TPDF", "noise shaping", "mise en forme du bruit", "quantification", "bits", "mastering"],
    notice: "Ce composant réduit la profondeur d'un son. Chaque échantillon est ramené sur la grille d'une profondeur de 2 à 24 bits, après l'ajout d'un bruit de dither, et l'erreur commise est renvoyée sur les échantillons suivants par un filtre qui met le bruit en forme. Le son rendu reste en virgule flottante, mais chacune de ses valeurs est un code de la profondeur choisie divisé par la pleine échelle, soit 2^(b−1) − 1 codes de part et d'autre de zéro. Le LSB est l'écart entre deux codes voisins.\n\n"
      + "« Bits » fixe la profondeur. À 16 bits, les valeurs rendues sont exactement les codes d'un fichier WAV seize bits.\n\n"
      + "« Dither » choisit le bruit ajouté avant l'arrondi (S. P. Lipshitz, R. A. Wannamaker et J. Vanderkooy, « Quantization and Dither: A Theoretical Survey », Journal of the Audio Engineering Society 40(5), 1992, p. 355-375) :\n"
      + "• « Aucun » : l'arrondi seul. L'erreur suit le signal, et un son faible devient un escalier riche en harmoniques.\n"
      + "• « Rectangulaire » : un bruit uniforme d'un LSB crête à crête. La moyenne de l'erreur ne dépend plus du signal ; sa variance en dépend encore, et le souffle varie avec lui.\n"
      + "• « Triangulaire » : la différence de deux bruits uniformes, de densité triangulaire sur ±1 LSB. Ni la moyenne ni la variance de l'erreur ne dépendent plus du signal : l'erreur devient un bruit blanc constant d'un quart de LSB carré, soit −96,3 dBFS d'efficace à 16 bits.\n"
      + "• « Triangulaire passe-haut » : la différence de deux tirages successifs, de même densité triangulaire, dont le spectre est nul au continu et maximal à la moitié de la fréquence d'échantillonnage.\n\n"
      + "« Mise en forme » choisit le filtre de rétroaction de l'erreur. L'erreur de la sortie est l'erreur commise à l'arrondi, dither compris, passée par la fonction de transfert 1 − Σ hₖ z⁻ᵏ : le bruit est retiré des fréquences où l'oreille est la plus sensible et reporté vers l'aigu, au prix d'un bruit total plus fort. Pour ces cinq filtres, la moyenne du bruit en décibels sur la bande ne change pas (M. A. Gerzon et P. G. Craven, « Optimal Noise Shaping and Dither of Digital Signals », 87e convention de l'AES, prépublication 2822, 1989).\n"
      + "• « Aucune » : le bruit reste plat.\n"
      + "• « Premier ordre » : 1 − z⁻¹, bruit total +3,0 dB, nul au continu et croissant jusqu'à la moitié de la fréquence d'échantillonnage.\n"
      + "• « Second ordre » : (1 − z⁻¹)², bruit total +7,8 dB.\n"
      + "• « E 5 coef. » : la courbe pondérée E à cinq coefficients de S. P. Lipshitz, J. Vanderkooy et R. A. Wannamaker (« Minimally Audible Noise Shaping », Journal of the Audio Engineering Society 39(11), 1991, p. 836-852). Bruit total +12,2 dB, à −27 dB du bruit plat vers 4 kHz.\n"
      + "• « F 9 coef. » : la courbe pondérée F à neuf coefficients de R. A. Wannamaker (« Psychoacoustically Optimal Noise Shaping », Journal of the Audio Engineering Society 40(7/8), 1992, p. 611-620). Bruit total +18,4 dB, à −25 dB du bruit plat vers 3 kHz.\n"
      + "Les deux courbes pondérées sont calculées pour 44,1 kHz. À une autre fréquence d'échantillonnage, elles s'étirent avec elle : à 48 kHz, le creux de « E 5 coef. » passe à 4,4 kHz. Au-delà de 5 % d'écart, le message le signale.\n\n"
      + "Un échantillon qui sortirait de la pleine échelle y est ramené. L'erreur renvoyée est prise avant cette borne, de sorte que le filtre reste stable sur un son saturé ; les échantillons bornés sont comptés dans le message.\n\n"
      + "« Graine » fixe la suite du bruit de dither : une même graine rend les mêmes échantillons. À zéro, une graine est tirée au sort, et le message la donne. Elle est sans effet quand « Dither » vaut « Aucun », rien n'étant tiré. Les canaux reçoivent des bruits indépendants.\n\n"
      + "La sortie « Audio » rend le son quantifié, avec la durée, la fréquence d'échantillonnage et les canaux reçus. Un fichier que l'application écrit en 16 bits reçoit un second dither triangulaire, blanc, d'un quart de LSB carré, qui comble les creux de la mise en forme ; écrit en 24 bits, il reçoit ce second bruit à −144,5 dBFS, et la mise en forme demeure. Le message donne la profondeur, le dither, la mise en forme, la valeur efficace de l'écart entre la sortie et l'entrée en dBFS, hors échantillons bornés, et la graine.",
    noticeEn: "This component reduces the bit depth of a sound. Each sample is brought onto the grid of a depth from 2 to 24 bits, after dither noise is added, and the error made is fed back onto the following samples through a filter that shapes the noise. The returned sound stays in floating point, but each of its values is a code of the chosen depth divided by full scale, that is 2^(b−1) − 1 codes on either side of zero. The LSB is the step between two neighbouring codes.\n\n"
      + "« Bits » sets the depth. At 16 bits, the returned values are exactly the codes of a sixteen-bit WAV file.\n\n"
      + "« Dither » chooses the noise added before rounding (S. P. Lipshitz, R. A. Wannamaker and J. Vanderkooy, « Quantization and Dither: A Theoretical Survey », Journal of the Audio Engineering Society 40(5), 1992, pp. 355-375):\n"
      + "• « None »: rounding alone. The error follows the signal, and a quiet sound turns into a staircase rich in harmonics.\n"
      + "• « Rectangular »: uniform noise one LSB peak to peak. The mean of the error no longer depends on the signal; its variance still does, and the hiss varies with it.\n"
      + "• « Triangular »: the difference of two uniform noises, with a triangular density over ±1 LSB. Neither the mean nor the variance of the error depends on the signal any more: the error becomes a constant white noise of a quarter of an LSB squared, that is −96.3 dBFS RMS at 16 bits.\n"
      + "• « High-pass triangular »: the difference of two successive draws, with the same triangular density, whose spectrum is zero at DC and largest at half the sample rate.\n\n"
      + "« Shaping » chooses the error feedback filter. The output error is the error made at rounding, dither included, passed through the transfer function 1 − Σ hₖ z⁻ᵏ: the noise is removed from the frequencies where the ear is most sensitive and moved towards the treble, at the cost of a stronger total noise. For these five filters, the mean of the noise in decibels over the band does not change (M. A. Gerzon and P. G. Craven, « Optimal Noise Shaping and Dither of Digital Signals », 87th AES Convention, preprint 2822, 1989).\n"
      + "• « None »: the noise stays flat.\n"
      + "• « First order »: 1 − z⁻¹, total noise +3.0 dB, zero at DC and rising up to half the sample rate.\n"
      + "• « Second order »: (1 − z⁻¹)², total noise +7.8 dB.\n"
      + "• « E 5 coef. »: the five-coefficient E-weighted curve of S. P. Lipshitz, J. Vanderkooy and R. A. Wannamaker (« Minimally Audible Noise Shaping », Journal of the Audio Engineering Society 39(11), 1991, pp. 836-852). Total noise +12.2 dB, 27 dB below the flat noise around 4 kHz.\n"
      + "• « F 9 coef. »: the nine-coefficient F-weighted curve of R. A. Wannamaker (« Psychoacoustically Optimal Noise Shaping », Journal of the Audio Engineering Society 40(7/8), 1992, pp. 611-620). Total noise +18.4 dB, 25 dB below the flat noise around 3 kHz.\n"
      + "Both weighted curves are designed for 44.1 kHz. At another sample rate they stretch with it: at 48 kHz, the dip of « E 5 coef. » moves to 4.4 kHz. Beyond a 5 % difference, the message says so.\n\n"
      + "A sample that would leave full scale is brought back into it. The error fed back is taken before that bound, so the filter stays stable on a saturated sound; the bounded samples are counted in the message.\n\n"
      + "« Seed » sets the sequence of the dither noise: the same seed returns the same samples. At zero, a seed is drawn at random, and the message gives it. It has no effect when « Dither » is « None », nothing being drawn. The channels receive independent noises.\n\n"
      + "The « Audio » output returns the quantized sound, with the received length, sample rate and channels. A file the application writes at 16 bits receives a second white triangular dither of a quarter of an LSB squared, which fills the dips of the shaping; written at 24 bits, it receives that second noise at −144.5 dBFS, and the shaping remains. The message gives the depth, the dither, the shaping, the RMS value of the difference between output and input in dBFS, bounded samples excluded, and the seed.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Bits", nomEn: "Bits", type: "curseur", plage: [2, 24], pas: 1, defaut: 16,
        doc: "La profondeur visée. Chaque valeur rendue est un code de cette profondeur ; à 16 bits, ceux d'un fichier WAV seize bits.",
        docEn: "The target depth. Each returned value is a code of this depth; at 16 bits, those of a sixteen-bit WAV file." },
      { nom: "Dither", nomEn: "Dither", type: "choix", ...FORMES, defaut: "Triangulaire", defautEn: "Triangular",
        doc: "Le bruit ajouté avant l'arrondi. « Triangulaire » rend la moyenne et la variance de l'erreur indépendantes du signal ; « Rectangulaire » la moyenne seule ; « Aucun » laisse l'erreur suivre le signal. « Triangulaire passe-haut » penche ce bruit vers l'aigu.",
        docEn: "The noise added before rounding. « Triangular » makes the mean and variance of the error independent of the signal; « Rectangular » the mean alone; « None » lets the error follow the signal. « High-pass triangular » tilts that noise towards the treble." },
      { nom: "Mise en forme", nomEn: "Shaping", type: "choix", ...MISES_EN_FORME, defaut: "E 5 coef.", defautEn: "E 5 coef.",
        doc: "Le filtre qui renvoie l'erreur sur les échantillons suivants, et reporte le bruit vers l'aigu. « E 5 coef. » et « F 9 coef. » sont des courbes pondérées calculées pour 44,1 kHz ; « Premier ordre » et « Second ordre » chassent le bruit du grave à toute fréquence.",
        docEn: "The filter that feeds the error back onto the following samples, and moves the noise towards the treble. « E 5 coef. » and « F 9 coef. » are weighted curves designed for 44.1 kHz; « First order » and « Second order » drive the noise out of the bass at any rate." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "La graine du bruit de dither. Une même graine rend les mêmes échantillons ; à zéro, une graine est tirée au sort et annoncée. Sans effet quand « Dither » vaut « Aucun » : rien n'est tiré.",
        docEn: "The seed of the dither noise. The same seed returns the same samples; at zero, a seed is drawn at random and announced. No effect when « Dither » is « None »: nothing is drawn." },
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0);
      if (sansEntree(entree)) return entree;
      const forme = ctx.paramTexte("Dither", "triangulaire") as FormeDither;
      const miseEnForme = ctx.paramTexte("Mise en forme", "e-5") as MiseEnForme;
      const graine = resoudreGraine(ctx.paramNombre("Graine", 1));
      const canaux = Array.from({ length: entree.numberOfChannels }, (_, c) => entree.getChannelData(c));
      const r = ditherer(canaux, { bits: ctx.paramNombre("Bits", 16), forme, miseEnForme, graine });

      const sortie = new AudioBuffer({ numberOfChannels: entree.numberOfChannels, length: entree.length, sampleRate: entree.sampleRate });
      r.canaux.forEach((c, i) => sortie.copyToChannel(c, i));
      const filtre = FILTRES[miseEnForme] ?? FILTRES.aucune;
      const bruit = r.erreurEfficace > 0 ? nombre(20 * Math.log10(r.erreurEfficace), 1) : "-∞";
      const message = traduire("msg.dither.fait", r.bits, libelle(FORMES, forme), libelle(MISES_EN_FORME, miseEnForme), bruit, graine)
        + (r.bornes > 0 ? traduire("msg.dither.bornes", r.bornes.toLocaleString(langueCourante() === "en" ? "en-US" : "fr-FR")) : "")
        + (horsConception(filtre, entree.sampleRate) ? traduire("msg.dither.hors_conception", nombre((filtre.frequenceConception ?? 0) / 1000, 1)) : "");
      return { valeurs: [sortie], message };
    },
  }),
] as FicheAudio[]).map(avecDoc);
