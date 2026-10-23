// plugins/appariement-reference.ts — Nœud « Apparier sur une référence » : donner à un son le
// niveau, la couleur, la largeur et la crête d'un autre.
// Voir audio/appariement-reference.ts pour le principe et pour la borne.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { apparierSurReference } from "../audio/appariement-reference";
import { choixFenetre } from "../audio/fenetres-analyse";
import { choixOuiNon } from "../core/oui-non";

export const fiches: FicheAudio[] = ([
  {
    id: "apparier-reference", nom: "Apparier sur une référence", nomEn: "Match a Reference",
    univers: "Traitement", famille: "Effets",
    resume: "Donne au son le niveau, la couleur, la largeur et la crête d'un autre son.",
    resumeEn: "Gives the sound the level, colour, width and peak of another sound.",
    notice: "Rapproche un son d'un autre pris pour modèle, sur quatre grandeurs mesurées : le niveau efficace, la réponse en fréquence, la largeur stéréo et la crête.\n\nLe son à traiter se branche sur l'entrée « Audio », le modèle sur l'entrée « Référence ». Les deux doivent partager la même fréquence d'échantillonnage ; sinon le composant le dit et s'arrête.\n\n« Niveau », « Spectre », « Largeur » et « Crête » décident de ce qui est recopié. Chacun s'applique séparément : on peut prendre la couleur d'un disque sans en prendre le niveau.\n\n« Correction maximale » borne l'écart appliqué à chaque bande de fréquence. Un son qui s'arrête à dix kilohertz, comparé à un modèle qui monte à dix-huit, demande dans l'aigu un gain que rien ne peut fournir : il n'y a rien à amplifier que le plancher. La borne arrête cette demande, et le message dit quelle part du spectre a buté contre elle. Une part élevée signale un modèle hors de portée du son traité.\n\n« Bandes par octave » règle la finesse de la correction. Trois bandes suivent la couleur générale ; douze suivent le détail, jusqu'à recopier les résonances propres au modèle.\n\n« Taille de la transformée » fixe la résolution de l'analyse : grande, elle distingue les graves ; petite, elle suit mieux les changements rapides.\n\nLa correction de fréquence se fait à phase nulle : aucune bande n'est retardée par rapport à une autre.\n\nUne entrée mono ne s'élargit pas, son côté valant zéro. Le message donne le niveau appliqué, les corrections extrêmes, la part de spectre bornée, la largeur avant et après, et la crête obtenue.",
    noticeEn: "Brings a sound closer to another taken as a model, on four measured quantities: the RMS level, the frequency response, the stereo width and the peak.\n\nThe sound to process connects to the « Audio » input, the model to the « Reference » input. Both must share the same sampling rate; otherwise the node says so and stops.\n\n« Level », « Spectrum », « Width » and « Peak » decide what is copied. Each applies separately: one can take a record's colour without taking its level.\n\n« Maximum correction » bounds the amount applied to each frequency band. A sound that stops at ten kilohertz, compared with a model that reaches eighteen, asks in the treble for a gain nothing can supply: there is nothing to amplify but the floor. The bound stops that request, and the message gives what share of the spectrum hit it. A high share signals a model out of the processed sound's reach.\n\n« Bands per octave » sets how fine the correction is. Three bands follow the general colour; twelve follow the detail, down to copying the model's own resonances.\n\n« Transform size » sets the analysis resolution: large, it tells low frequencies apart; small, it follows fast changes better.\n\nThe frequency correction is zero phase: no band is delayed with respect to another.\n\nA mono input does not widen, its side being zero. The message gives the applied level, the extreme corrections, the bounded share of the spectrum, the width before and after, and the peak obtained.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Référence", nomEn: "Reference", type: "audio", sousType: "stereo" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Niveau", nomEn: "Level", type: "choix", ...choixOuiNon(), defaut: "Oui", defautEn: "Yes",
        doc: "Recopier le niveau efficace de la référence.",
        docEn: "Copy the reference's RMS level." },
      { nom: "Spectre", nomEn: "Spectrum", type: "choix", ...choixOuiNon(), defaut: "Oui", defautEn: "Yes",
        doc: "Recopier la réponse en fréquence de la référence, à phase nulle.",
        docEn: "Copy the reference's frequency response, with zero phase." },
      { nom: "Largeur", nomEn: "Width", type: "choix", ...choixOuiNon(), defaut: "Oui", defautEn: "Yes",
        doc: "Recopier la largeur stéréo de la référence, mesurée en rapport du côté au milieu. Sans effet sur une entrée mono.",
        docEn: "Copy the reference's stereo width, measured as the side to mid ratio. No effect on a mono input." },
      { nom: "Crête", nomEn: "Peak", type: "choix", ...choixOuiNon(), defaut: "Oui", defautEn: "Yes",
        doc: "Aligner la crête sur celle de la référence, une fois le reste appliqué. Le message dit ce que cet alignement a coûté au niveau.",
        docEn: "Align the peak on the reference's, once the rest is applied. The message gives what that alignment cost in level." },
      { nom: "Correction maximale", nomEn: "Maximum correction", type: "curseur", plage: [1, 24], pas: 1, defaut: 12, unite: "dB",
        doc: "Écart maximal appliqué à une bande de fréquence, dans les deux sens. Bas, la correction reste une teinte ; haut, elle recopie la référence de plus près et amplifie d'autant le plancher là où le son traité n'a rien. Le message dit quelle part du spectre a buté contre cette borne.",
        docEn: "Largest amount applied to a frequency band, in either direction. Low, the correction stays a tint; high, it copies the reference more closely and amplifies the floor accordingly where the processed sound has nothing. The message gives what share of the spectrum hit this bound." },
      { nom: "Bandes par octave", nomEn: "Bands per octave", type: "curseur", plage: [1, 12], pas: 1, defaut: 3,
        doc: "Finesse de la correction. Trois bandes suivent la couleur générale ; douze suivent le détail, jusqu'aux résonances propres à la référence.",
        docEn: "How fine the correction is. Three bands follow the general colour; twelve follow the detail, down to the reference's own resonances." },
      // LA FORME EST CELLE QUE LE DÉPÔT EMPLOIE DÉJÀ LE PLUS, et non une écriture de plus du même
      // concept : le garde des nomenclatures compte les formes de « fenêtre d'analyse », et une
      // liste neuve en aurait fait une onzième.
      { nom: "Taille de la transformée", nomEn: "Transform size", type: "choix",
        ...choixFenetre([512, 1024, 2048, 4096]), defaut: "4096", defautEn: "4096",
        doc: "Résolution de l'analyse. Grande, elle distingue les graves ; petite, elle suit mieux les changements rapides.",
        docEn: "Analysis resolution. Large, it tells low frequencies apart; small, it follows fast changes better." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      const reference = ctx.entree(1);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      if (!(reference instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.apparier.sans_reference") };
      }
      const oui = (nom: string) => ctx.paramTexte(nom, "oui") !== "non";
      let rendu;
      try {
        rendu = apparierSurReference(audio, reference, {
          niveau: oui("Niveau"),
          spectre: oui("Spectre"),
          largeur: oui("Largeur"),
          crete: oui("Crête"),
          correctionMaxDb: ctx.paramNombre("Correction maximale", 12),
          bandesParOctave: ctx.paramNombre("Bandes par octave", 3),
          fftSize: Number(ctx.paramTexte("Taille de la transformée", "4096")) || 4096,
        });
      } catch (e) {
        return { valeurs: [null], message: String((e as Error).message) };
      }
      const r = rendu.releve;
      const signe = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);
      const bouts = [
        traduire("msg.apparier.niveau", signe(r.gainNiveauDb)),
        traduire("msg.apparier.spectre", signe(r.correctionBasseDb), signe(r.correctionHauteDb)),
        traduire("msg.apparier.largeur", r.largeurAvant.toFixed(3), r.largeurApres.toFixed(3)),
        traduire("msg.apparier.crete", r.creteDb.toFixed(1)),
      ];
      if (r.partBorneePct > 0) {
        bouts.push(traduire("msg.apparier.bornee", r.partBorneePct.toFixed(0)));
      }
      return { valeurs: [rendu.audio], message: bouts.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);
