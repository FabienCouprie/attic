// plugins/spectrogramme-operations.ts — Ce qu'on fait à un spectrogramme en mels, entre deux câbles.
//
// CES DEUX-LÀ ET PAS D'AUTRES, parce que la famille « Spectre » en compte déjà dix-neuf sur la
// transformée linéaire : refaire ici un flou temporel ou un gel n'apporterait rien. Ce qui est
// écrit ici est ce que l'échelle des mels rend différent, et la raison de chaque choix est dans
// `audio/spectrogramme-operations.ts`.
//
// LES RÉGLAGES SE DISENT DANS LEURS UNITÉS, et c'est ce que le type de flux permet : le
// paramétrage voyage avec la matrice, donc un flou peut se demander en millisecondes plutôt qu'en
// colonnes. Sans lui, chaque composant compterait en cases et l'on devrait convertir de tête.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { melVersHz, hzVersMel } from "../audio/mel";
import { bandesDe, colonnesDe, type SpectrogrammeMel } from "../audio/spectrogramme-mel";
import { decalerBandes, flouterSpectrogramme } from "../audio/spectrogramme-operations";

const en = () => langueCourante() === "en";
const nb = (v: number, d = 1) => (en() ? v.toFixed(d) : v.toFixed(d).replace(".", ","));

const estSpectrogramme = (v: unknown): v is SpectrogrammeMel =>
  !!v && typeof v === "object" && Array.isArray((v as SpectrogrammeMel).canaux)
  && !!(v as SpectrogrammeMel).parametres;
const sansSpectrogramme = () => (en() ? "No spectrogram input" : "Aucune entrée spectrogramme");

/** Où tombe une fréquence après un décalage de `bandes` rangs, sur l'échelle de ce spectrogramme. */
function apresDecalage(s: SpectrogrammeMel, hz: number, bandes: number): number {
  const p = s.parametres;
  const mMin = hzVersMel(p.fMin), mMax = hzVersMel(Math.min(p.fMax, p.echantillonnage / 2));
  const parBande = (mMax - mMin) / (bandesDe(s) + 1);
  return melVersHz(hzVersMel(hz) + bandes * parBande);
}

export const fiches: FicheAudio[] = ([
  {
    id: "flou-spectrogramme", nom: "Flou du spectrogramme", nomEn: "Spectrogram Blur",
    univers: "Traitement", famille: "Mels",
    resume: "Étale un spectrogramme dans le temps et dans la fréquence, par une gaussienne.",
    resumeEn: "Spreads a spectrogram in time and in frequency, by a Gaussian.",
    notice: "Ce composant étale un spectrogramme en mels, dans le temps et dans la fréquence, par une moyenne pondérée en cloche. Les deux sens se règlent séparément et l'un des deux peut rester à zéro.\n\nLe flou en fréquence est celui que l'échelle des mels rend particulier. Une bande de mels couvre d'autant plus de hertz qu'elle est haute : moyenner six bandes voisines revient donc à moyenner quelques hertz dans le grave et des centaines dans l'aigu. L'étalement est le même pour l'oreille d'un bout à l'autre du spectre, ce qu'un noyau de largeur fixe en hertz ne donnerait pas. Il émousse les partiels, rapproche un son d'un bruit à bande étroite, et sur une voix il efface la finesse des harmoniques en laissant la forme du timbre.\n\nLe flou dans le temps étale les attaques sans changer la durée. Il se règle en millisecondes parce que le paramétrage voyage avec le spectrogramme : le composant sait de combien de colonnes il s'agit.\n\n« Temps » est l'écart-type de la cloche dans le sens du temps. Le noyau s'étend à trois écarts-types de part et d'autre.\n\n« Fréquence » est son écart-type dans le sens des bandes.\n\nLes bords se prolongent par leur dernière valeur plutôt que de s'annuler : border de zéros creuserait un fondu au début et à la fin du son, et effacerait les bandes extrêmes.\n\nLa sortie « Spectrogramme » porte la matrice étalée et le même paramétrage. Le message donne les deux largeurs retenues, en millisecondes et en bandes.",
    noticeEn: "This node spreads a mel spectrogram, in time and in frequency, by a bell-weighted average. The two directions are set separately and either may stay at zero.\n\nThe frequency blur is the one the mel scale makes particular. A mel band covers the more hertz the higher it sits: averaging six neighbouring bands therefore averages a few hertz in the low end and hundreds in the high end. The spreading is the same for the ear from one end of the spectrum to the other, which a kernel of fixed width in hertz would not give. It dulls the partials, brings a sound closer to a narrow band noise, and on a voice it rubs out the fineness of the harmonics while leaving the shape of the timbre.\n\nThe time blur spreads attacks without changing the duration. It is set in milliseconds because the parameters travel with the spectrogram: the node knows how many columns that makes.\n\n« Time » is the standard deviation of the bell in the time direction. The kernel reaches three standard deviations on each side.\n\n« Frequency » is its standard deviation in the band direction.\n\nThe edges continue with their last value rather than falling to zero: padding with zeros would hollow out a fade at the start and end of the sound, and would erase the outermost bands.\n\nThe « Spectrogram » output carries the spread matrix and the same parameters. The message gives the two widths retained, in milliseconds and in bands.",
    entrees: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    sorties: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [0, 1000], pas: 5, defaut: 0, unite: "ms",
        doc: "L'étalement dans le sens du temps, en écart-type. Zéro ne touche pas à ce sens. Il émousse les attaques sans changer la durée.",
        docEn: "The spreading in the time direction, as a standard deviation. Zero leaves that direction alone. It dulls attacks without changing the duration." },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [0, 64], pas: 0.5, defaut: 6, unite: "bandes",
        doc: "L'étalement dans le sens des bandes, en écart-type. Il émousse les partiels ; sur l'échelle des mels, il couvre la même largeur pour l'oreille du grave à l'aigu.",
        docEn: "The spreading in the band direction, as a standard deviation. It dulls the partials; on the mel scale it covers the same width for the ear from low to high." },
    ],
    async executer(ctx: any) {
      const s = ctx.entree(0);
      if (!estSpectrogramme(s)) return { valeurs: [null], message: sansSpectrogramme() };
      const tempsMs = ctx.paramNombre("Temps", 0);
      const bandes = ctx.paramNombre("Fréquence", 6);
      // LE RÉGLAGE EST EN MILLISECONDES, LE CALCUL EN COLONNES, et la conversion n'est possible que
      // parce que le pas voyage avec la matrice.
      const colonnes = tempsMs / Math.max(0.001, s.parametres.pasMs);
      ctx.onProgress(en() ? "blur" : "flou");
      const out = flouterSpectrogramme(s, colonnes, bandes);
      return {
        valeurs: [out],
        message: en()
          ? `${nb(tempsMs, 0)} ms (${nb(colonnes)} col.) · ${nb(bandes)} bands`
          : `${nb(tempsMs, 0)} ms (${nb(colonnes)} col.) · ${nb(bandes)} bandes`,
      };
    },
  },
  {
    id: "decalage-bandes", nom: "Décalage des bandes", nomEn: "Band Shift",
    univers: "Traitement", famille: "Mels",
    resume: "Monte ou descend un spectrogramme d'un nombre de bandes de mels, ce qui n'est pas une transposition.",
    resumeEn: "Moves a spectrogram up or down by a number of mel bands, which is not a transposition.",
    notice: "Ce composant déplace tout le contenu d'un spectrogramme d'un nombre entier de bandes de mels, vers l'aigu ou vers le grave.\n\nCe n'est ni une transposition ni un décalage de fréquence, et c'est là tout son intérêt. Une transposition multiplie toutes les fréquences par le même nombre ; un décalage de fréquence ajoute le même nombre de hertz à toutes. Un décalage de bandes de mels ajoute la même hauteur perçue à toutes, ce qui ne fait ni l'un ni l'autre. Au paramétrage par défaut, monter de douze bandes porte cent hertz à 152,7, soit un facteur 1,527, et cinq mille hertz à 5375, soit 1,075 : en hertz l'aigu bouge beaucoup plus, en intervalle c'est le grave. Les rapports entre partiels ne sont donc pas conservés, et un son harmonique en ressort inharmonique, d'autant plus que le décalage est grand.\n\nLe silence entre par le bord plutôt que le contenu ne s'enroule : un son qui monte laisse son grave vide, et ce qui sort par le haut est perdu.\n\n« Bandes » est le nombre de rangs, positif vers l'aigu et négatif vers le grave.\n\nLa sortie « Spectrogramme » porte la matrice déplacée et le même paramétrage. Le message donne, pour deux fréquences de repère, où elles se retrouvent.",
    noticeEn: "This node moves the whole content of a spectrogram by a whole number of mel bands, up or down.\n\nIt is neither a transposition nor a frequency shift, and that is the whole point of it. A transposition multiplies every frequency by the same number; a frequency shift adds the same number of hertz to all of them. A shift of mel bands adds the same perceived height to all of them, which does neither. With the default settings, going up twelve bands takes a hundred hertz to 152.7, a factor of 1.527, and five thousand hertz to 5375, a factor of 1.075: in hertz the high end moves far more, in interval it is the low end. The ratios between partials are therefore not kept, and a harmonic sound comes out inharmonic, the more so the larger the shift.\n\nSilence comes in from the edge rather than the content wrapping round: a sound going up leaves its low end empty, and what leaves by the top is lost.\n\n« Bands » is the number of rows, positive towards the high end and negative towards the low end.\n\nThe « Spectrogram » output carries the moved matrix and the same parameters. The message gives, for two reference frequencies, where they end up.",
    entrees: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    sorties: [{ nom: "Spectrogramme", nomEn: "Spectrogram", type: "spectrogramme" }],
    parametres: [
      { nom: "Bandes", nomEn: "Bands", type: "curseur", plage: [-256, 256], pas: 1, defaut: 12, unite: "",
        doc: "Le nombre de rangs dont tout le contenu se déplace, positif vers l'aigu. Ce n'est pas une transposition : au défaut, cent hertz montent d'un facteur 1,527 et cinq mille d'un facteur 1,075.",
        docEn: "The number of rows the whole content moves by, positive towards the high end. This is not a transposition: at the default, a hundred hertz go up by a factor of 1.527 and five thousand by 1.075." },
    ],
    async executer(ctx: any) {
      const s = ctx.entree(0);
      if (!estSpectrogramme(s)) return { valeurs: [null], message: sansSpectrogramme() };
      const bandes = Math.round(ctx.paramNombre("Bandes", 12));
      const out = decalerBandes(s, bandes);
      // LE RAPPORT DIT OÙ DEUX REPÈRES SE RETROUVENT, et non seulement de combien de rangs on a
      // bougé : un nombre de bandes ne dit rien à l'oreille tant qu'on ne l'a pas traduit.
      const cent = apresDecalage(s, 100, bandes);
      const mille = apresDecalage(s, 1000, bandes);
      return {
        valeurs: [out],
        message: `${bandes > 0 ? "+" : ""}${bandes} · 100 → ${nb(cent, 0)} Hz · 1000 → ${nb(mille, 0)} Hz`,
      };
    },
  },
] as unknown as FicheAudio[]).map(avecDoc);
