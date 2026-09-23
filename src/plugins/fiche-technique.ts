// plugins/fiche-technique.ts — Le nœud « Fiche technique ». La matière est dans
// `src/parcours/fiche-son.ts`, éprouvée ; ici, la prise.
//
// POURQUOI CE NŒUD EST NÉ D'UN DÉFAUT DU PARCOURS. Les épreuves mesurent neuf choses qu'aucun nœud
// du catalogue ne disait : la part d'énergie sous 200 hertz, la corrélation des canaux, l'équilibre
// gauche-droite, l'écart au demi-ton. Un élève lisait donc « corrélation 0,24 » sans pouvoir le
// vérifier ailleurs — l'examinateur voyait plus que l'utilisateur. Ce nœud rend les mêmes chiffres
// par les mêmes fonctions, ce qui ferme la boucle : la fiche et l'épreuve ne peuvent pas se
// contredire, puisqu'il n'y a qu'une seule mesure.
//
// IL LAISSE PASSER LE SON, comme le vu-mètre : on le pose au milieu d'une chaîne sans rien casser,
// et sans avoir à dédoubler une arête pour l'écouter.
//
// L'ANALYSE DE HAUTEUR SE DÉBRANCHE, et c'est le seul réglage de coût du nœud. Le suiveur pYIN
// demande une transformée par trame — quelques dizaines de millisecondes par seconde de son, bornées
// aux huit premières secondes. C'est négligeable sur une prise, sensible sur une collection de deux
// cents fichiers, et inutile sur de la percussion, qui n'a pas de hauteur à trouver.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { mesurerCopie } from "../parcours/mesures";
import { CIBLES_DIFFUSION, ficheSon, resumeSon } from "../parcours/fiche-son";

export const fiches: FicheAudio[] = ([
  {
    id: "fiche-technique", nom: "Fiche technique", nomEn: "Spec Sheet",
    univers: "Visualisation", famille: "Analyse",
    resume: "Rend en texte tout ce qui se mesure d'un son : durée, sonie, vrai pic, facteur de crête, parts de bande, corrélation, équilibre, hauteur et justesse, avec un verdict de conformité.",
    resumeEn: "Returns everything measurable about a sound as text: duration, loudness, true peak, crest factor, band shares, correlation, balance, pitch and tuning, with a compliance verdict.",
    notice: "Une seule page qui dit tout ce que le logiciel sait mesurer d'un son, et le laisse passer inchangé. On le pose au milieu d'une chaîne comme un vu-mètre, sans rien débrancher.\n\nLa fiche donne les grandeurs qu'un verdict d'épreuve emploie (la part d'énergie sous 200 hertz, la corrélation des deux canaux, l'équilibre gauche-droite, l'écart au demi-ton le plus proche) par les mêmes fonctions, de sorte qu'un chiffre annoncé ailleurs se retrouve ici.\n\nLes mesures de niveau viennent des mêmes fonctions que le vu-mètre, la hauteur d'un suiveur pYIN : la fiche ne peut donc contredire ni l'un ni l'autre.\n\nTrois cibles de diffusion sont proposées avec leurs vraies valeurs, les plateformes à −14 LUFS, le balado à −16, la radio et la télévision à −23 selon la norme EBU R 128, toutes avec un plafond de vrai pic à −1 dBTP. Le verdict passe par la même fonction que les épreuves : deux calculs de conformité écrits séparément finiraient par diverger d'un dixième de décibel.\n\nCe qui n'est pas affiché compte autant. Sur un son mono, la rubrique stéréo est absente au lieu d'annoncer une corrélation de 1,000 et un équilibre de 0,00 dB : deux chiffres exacts qui laisseraient croire à une mesure alors qu'ils répètent seulement qu'il n'y a qu'un canal. Sans hauteur tenue, la fiche le dit en un mot plutôt que d'aligner des cents sur du bruit.\n\nUn intitulé porte sa réserve : la plage de sonie compte les silences, et un blanc y suffit à annoncer cent décibels. C'est la valeur qu'affiche le vu-mètre, donc juste ; elle est donc écrite « silences compris ».\n\nL'analyse de hauteur se débranche. Elle demande une transformée par trame, bornée aux huit premières secondes : négligeable sur une prise, sensible sur une collection de deux cents fichiers, inutile sur de la percussion qui n'a aucune hauteur à trouver.",
    noticeEn: "One page saying everything the software can measure about a sound, and passing it through unchanged. It drops into the middle of a chain like a VU-meter, with nothing to unplug.\n\nThis node was born of a flaw. The « Journey » node's trials measure things no node was stating: the share of energy below 200 hertz, the correlation of the two channels, left-right balance, the deviation from the nearest semitone. A learner therefore read a verdict, « correlation 0.24 », without being able to find it anywhere. The examiner saw more than the user, and a judgement you cannot reproduce teaches nothing: it intimidates. The sheet returns exactly the same figures, through the same functions.\n\nThe level measurements come from the catalog's VU-meter, the pitch from the pYIN follower: the sheet therefore cannot contradict either.\n\nThree delivery targets are offered with their real values, platforms at -14 LUFS, podcast at -16, radio and television at -23 under the EBU R 128 standard, all with a true-peak ceiling at -1 dBTP. The verdict goes through the same function as the journey's trials: a compliance written separately would eventually drift by a tenth of a decibel, and that is precisely the gap that makes one doubt a measuring tool.\n\nWhat is not shown matters as much. On a mono sound the stereo section is absent instead of announcing a correlation of 1.000 and a balance of 0.00 dB: two exact figures that would suggest a measurement when they only repeat that there is one channel. With no sustained pitch, the sheet says so in a word rather than lining up cents on noise.\n\nOne label carries its own caveat: the loudness spread counts silences, and one blank is enough for it to announce a hundred decibels. It is the value the VU-meter shows, hence correct; it is written « silence included » because a figure that is correct and misleading is worse than one that is absent.\n\nPitch analysis can be switched off. It needs one transform per frame, bounded to the first eight seconds: negligible on a take, noticeable over a collection of two hundred files, pointless on percussion, which has no pitch to find.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Fiche", nomEn: "Sheet", type: "texte" },
    ],
    parametres: [
      { nom: "Cible de diffusion", nomEn: "Delivery target", type: "choix",
        options: CIBLES_DIFFUSION.map((c) => c.fr), optionsEn: CIBLES_DIFFUSION.map((c) => c.en),
        optionIds: CIBLES_DIFFUSION.map((c) => c.id), defaut: "Aucune", defautEn: "None",
        doc: "Ajoute un verdict de conformité à la fiche. Les valeurs sont celles des usages : −14 LUFS pour les plateformes de diffusion, −16 pour le balado, −23 pour la radio et la télévision selon EBU R 128, avec un plafond de vrai pic à −1 dBTP dans les trois cas. Le verdict est rendu par la même fonction que les épreuves du composant « Parcours », si bien que les deux ne peuvent pas se contredire.",
        docEn: "Adds a compliance verdict to the sheet. The values are the ones in use: -14 LUFS for streaming platforms, -16 for podcasts, -23 for radio and television under EBU R 128, with a true-peak ceiling of -1 dBTP in all three cases. The verdict is produced by the same function as the « Journey » node's trials, so the two cannot contradict each other." },
      { nom: "Analyse de hauteur", nomEn: "Pitch analysis", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "La hauteur et la justesse demandent un suivi pYIN : une transformée par trame, bornée aux huit premières secondes du son. C'est négligeable sur une prise, sensible sur une collection de deux cents fichiers, et sans objet sur de la percussion, qui n'a pas de hauteur à trouver. Débranchée, la rubrique Hauteur disparaît de la fiche.",
        docEn: "Pitch and tuning need a pYIN track: one transform per frame, bounded to the sound's first eight seconds. That is negligible on a take, noticeable over a collection of two hundred files, and moot on percussion, which has no pitch to find. Switched off, the Pitch section disappears from the sheet." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const diffusion = ctx.paramTexte("Cible de diffusion", "aucune");
      const avecHauteur = ctx.paramTexte("Analyse de hauteur", "oui") !== "non";
      const mesure = mesurerCopie(audio, { hauteur: avecHauteur });
      return {
        valeurs: [audio, ficheSon(mesure, en, diffusion, avecHauteur)],
        message: resumeSon(mesure, en, diffusion),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
