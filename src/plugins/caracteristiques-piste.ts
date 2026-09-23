// plugins/caracteristiques-piste.ts — Les quarante mesures que la classification emploie, pour
// une seule piste.
//
// CE QUI MANQUAIT, ET CE QUE C'EST EXACTEMENT. « Classification de pistes » réduit chaque piste
// d'un dossier à un vecteur de quarante nombres, puis les compare. Le calcul de ce vecteur est une
// fonction qui prend UN tampon — `extraireVecteurFeatures`, dans `audio/features-piste.ts` — et
// rien ne l'exposait pour une piste seule. On pouvait donc lire qu'une piste appartenait au
// groupe 2 avec 84 % de probabilité, sans jamais voir ce qui avait produit ce jugement.
//
// LE NŒUD N'AJOUTE AUCUN CALCUL. Il appelle la même fonction, sur le même extrait, avec les mêmes
// réglages. C'est sa raison d'être : les nombres qu'il montre sont, au bit près, ceux que la
// classification a employés. Un nœud qui aurait analysé la piste entière plutôt que l'extrait de
// trente secondes, ou choisi un autre nombre de coefficients, aurait donné des valeurs plausibles
// et incomparables — ce qui est la pire des deux options, puisque rien ne l'aurait signalé.
//
// POURQUOI IL N'Y A PAS DE RÉGLAGE DE DURÉE. C'est la même raison, dite autrement : le plafond de
// trente secondes vient de la classification, où il existe pour qu'une collection de plusieurs
// centaines de pistes reste calculable. L'offrir en réglage ici permettrait d'obtenir un vecteur
// que la classification ne reconnaîtrait pas.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { extraireVecteurFeatures } from "../audio/features-piste";

/** Les étiquettes traduites : le module les écrit en français, l'inspecteur peut être en anglais. */
const EN = new Map<string, string>([
  ["Tempo (BPM)", "Tempo (BPM)"],
  ["Centroïde spectral", "Spectral centroid"],
]);
const etiquetteEn = (fr: string): string => {
  const direct = EN.get(fr);
  if (direct) return direct;
  // « Chroma » et « (variance) » s'écrivent pareil dans les deux langues : les remplacer par
  // eux-mêmes donnait l'illusion d'une traduction et ne faisait rien — relèvé par l'analyse
  // statique, qui a raison. Seule la moyenne change de nom.
  return fr.replace(" (moyenne)", " (mean)");
};

/** Les quatre familles du vecteur, dans l'ordre où le module les écrit. */
function famille(etiquette: string): string {
  if (etiquette.startsWith("Tempo")) return "tempo";
  if (etiquette.startsWith("Centroïde")) return "timbre";
  if (etiquette.startsWith("Chroma")) return "chroma";
  return "mfcc";
}

export const fiches: FicheAudio[] = ([
  {
    id: "caracteristiques-piste", nom: "Caractéristiques de piste", nomEn: "Track Features",
    univers: "Visualisation", famille: "Analyse",
    resume: "Les quarante mesures dont la classification de pistes se sert, pour une seule piste.",
    resumeEn: "The forty measurements track classification uses, for a single track.",
    notice: "Rend le vecteur de quarante nombres qui décrit une piste, celui-là même qu'une classification de collection emploie pour comparer les pistes entre elles.\n\nCe que contient le vecteur. Le tempo, en battements par minute. Le centroïde spectral moyen, qui dit où se tient le centre de gravité du son ; c'est la mesure qui sépare le sourd du brillant. Les douze classes de hauteur du chromagramme, qui disent quelles notes reviennent, tonalité comprise. Et la moyenne et la variance de treize coefficients cepstraux, qui décrivent le timbre : la moyenne dit sa couleur, la variance dit s'il bouge.\n\nLe composant n'ajoute aucun calcul : il appelle la même fonction, sur le même extrait, avec les mêmes réglages, de sorte que les nombres qu'il montre sont ceux que la classification emploie. C'est aussi pourquoi il n'offre pas de réglage de durée, le plafond de trente secondes vient de la classification, où il existe pour qu'une collection de plusieurs centaines de pistes reste calculable, et le changer ici donnerait un vecteur que la classification ne reconnaîtrait pas.\n\nLa seconde sortie rend le même vecteur en JSON, pour qu'un autre composant ou un autre logiciel s'en serve.",
    noticeEn: "Returns the vector of forty numbers that describes a track, the very one a collection classification uses to compare tracks with one another.\n\nWhat the vector holds. The tempo, in beats per minute. The mean spectral centroid, which says where the sound's centre of gravity sits, the measurement that separates dull from bright. The twelve pitch classes of the chromagram, which say which notes recur, key included. And the mean and variance of thirteen cepstral coefficients, which describe timbre: the mean gives its colour, the variance says whether it moves.\n\nThe node adds no computation: it calls the same function, on the same excerpt, with the same settings, so the numbers it shows are those the classification uses. It is also why it offers no duration setting, the thirty-second cap comes from the classification, where it exists so that a collection of several hundred tracks stays computable, and changing it here would give a vector the classification would not recognise.\n\nThe second output returns the same vector as JSON, for another node or another program to use.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
      { nom: "Vecteur", nomEn: "Vector", type: "texte" },
    ],
    parametres: [
      { nom: "Détail", nomEn: "Detail", type: "choix",
        options: ["Tout le vecteur", "Résumé par famille"], optionsEn: ["Whole vector", "Summary by family"],
        optionIds: ["tout", "resume"], defaut: "Tout le vecteur", defautEn: "Whole vector",
        doc: "« Tout le vecteur » écrit les quarante valeurs, une par ligne. « Résumé par famille » regroupe le chroma et les coefficients cepstraux pour donner d'abord la tonalité dominante et l'allure du timbre, plus lisible quand on compare deux pistes à l'œil.",
        docEn: "« Whole vector » writes the forty values, one per line. « Summary by family » groups the chroma and cepstral coefficients to give the dominant key and the shape of the timbre first, easier to read when comparing two tracks by eye." },
      { nom: "Décimales", nomEn: "Decimals", type: "curseur", plage: [0, 6], pas: 1, defaut: 3,
        doc: "Chiffres après la virgule. Les coefficients cepstraux se jouent sur des dixièmes, les variances sur des unités : trois décimales conviennent aux deux.",
        docEn: "Digits after the decimal point. Cepstral coefficients play out in tenths, variances in units: three decimals suit both." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const e = ctx.entree(0);
      if (!(e instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };

      const { vecteur, etiquettes } = extraireVecteurFeatures(e);
      const d = Math.round(ctx.paramNombre("Décimales", 3));
      const nom = (i: number) => (en ? etiquetteEn(etiquettes[i]) : etiquettes[i]);

      let lignes: string[];
      if (ctx.paramTexte("Détail", "tout") === "resume") {
        const indices = (f: string) => etiquettes.map((l, i) => (famille(l) === f ? i : -1)).filter((i) => i >= 0);
        const chroma = indices("chroma");
        const dominante = chroma.reduce((a, b) => (vecteur[b] > vecteur[a] ? b : a), chroma[0]);
        const mfccMoyennes = indices("mfcc").filter((_, k) => k % 2 === 0);
        const mfccVariances = indices("mfcc").filter((_, k) => k % 2 === 1);
        const somme = (idx: number[]) => idx.reduce((s, i) => s + vecteur[i], 0);
        lignes = [
          `${nom(0)} : ${vecteur[0].toFixed(d)}`,
          `${nom(1)} : ${vecteur[1].toFixed(d)}`,
          `${en ? "Dominant pitch class" : "Classe de hauteur dominante"} : ${nom(dominante).replace(/^Chroma /, "")} (${vecteur[dominante].toFixed(d)})`,
          `${en ? "Cepstral mean, summed" : "Moyennes cepstrales, cumulées"} : ${somme(mfccMoyennes).toFixed(d)}`,
          `${en ? "Cepstral variance, summed" : "Variances cepstrales, cumulées"} : ${somme(mfccVariances).toFixed(d)}`,
          "",
          `${en ? "A high summed variance means a timbre that moves; a low one, a held sound." : "Une variance cumulée élevée signale un timbre qui bouge ; une faible, un son tenu."}`,
        ];
      } else {
        lignes = vecteur.map((v, i) => `${String(i + 1).padStart(3)}. ${nom(i).padEnd(22)} ${v.toFixed(d)}`);
      }

      // Le JSON porte les étiquettes FRANÇAISES, celles du module : c'est la clé qui permet de
      // rapprocher ce vecteur de celui qu'une classification a calculé, et une clé traduite ne
      // se rapprocherait de rien.
      const json = JSON.stringify({ etiquettes, vecteur }, null, 0);
      return {
        valeurs: [lignes.join("\n"), json],
        message: traduire("msg.caracteristiques.resume",
          String(vecteur.length), vecteur[0].toFixed(0), vecteur[1].toFixed(0)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
