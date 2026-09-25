// plugins/modifier-texte.ts — Nœud « Modifier le texte ».
//
// LE TEXTE REÇU S'AFFICHE, ET ON LE CORRIGE À LA MAIN. C'est tout ce que ce composant fait : il se
// place derrière n'importe quelle sortie texte, montre ce qui arrive comme le ferait une sortie
// texte, laisse écrire dedans, et rend à l'exécution ce que la zone contient. Demandé ainsi par
// Fabien, en remplacement des transformations par réglages qui occupaient ce nœud auparavant.
//
// LA ZONE VIDE LAISSE PASSER. Un nœud fraîchement posé n'a rien dans sa zone : il rend alors le
// texte d'entrée sans y toucher, et c'est ce qui permet de le brancher d'abord et de corriger
// ensuite. Dès qu'on écrit, c'est l'écrit qui sort.
//
// LE TEXTE ÉCRIT EST UN PARAMÈTRE, et non une donnée de passage : c'est la seule forme que la
// sauvegarde du projet conserve. Une correction faite à la main doit se retrouver à la réouverture.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "modifier-texte", nom: "Modifier le texte", nomEn: "Edit Text",
    univers: "Autres", famille: "Texte",
    resume: "Affiche le texte reçu, le laisse corriger à la main, et rend ce que contient la zone.",
    resumeEn: "Displays incoming text, lets it be edited by hand, and returns what the area contains.",
    notice: "Ce composant affiche le texte reçu sur son entrée et le rend sur sa sortie après correction à la main.\n\nLe texte s'écrit directement dans la zone du composant, qui se redimensionne par ses bords. À l'exécution, c'est le contenu de la zone qui part sur la sortie « Texte ».\n\nUne zone vide laisse passer le texte d'entrée sans y toucher : un composant qu'on vient de poser se branche donc sans rien changer, et l'exécution y dépose le texte reçu, qu'on corrige ensuite.\n\nLe bouton « Reprendre l'entrée » vide la zone et rend la main au texte d'entrée, ce qui défait les corrections.\n\nLe réglage « Texte » porte ce qui est écrit dans la zone ; il est enregistré avec le projet et se retrouve à la réouverture.\n\nLa sortie « Texte » rend le contenu de la zone, ou le texte d'entrée si la zone est vide. Le message indique le nombre de caractères rendus et si le texte a été corrigé.",
    noticeEn: "This node displays the text received on its input and returns it on its output after hand editing.\n\nThe text is written directly in the node's area, which is resized by its edges. On a run, the content of the area is what goes out on the « Text » output.\n\nAn empty area lets the input text through untouched: a node just placed can therefore be connected without changing anything, and a run drops the received text into it, to be edited afterwards.\n\nThe « Take the input back » button empties the area and gives the input text back, which undoes the edits.\n\nThe « Text » setting holds what is written in the area; it is saved with the project and comes back when it is reopened.\n\nThe « Text » output returns the content of the area, or the input text if the area is empty. The message gives the number of characters returned and whether the text was edited.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Texte", nomEn: "Text", type: "texte", defaut: "", defautEn: "",
        placeholder: "le texte reçu s'affiche ici", placeholderEn: "the received text appears here",
        doc: "Le texte rendu sur la sortie. Vide, le texte d'entrée passe sans changement.",
        docEn: "The text returned on the output. Empty, the input text passes through unchanged." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const data = ctx.noeud.data as Record<string, unknown>;
      // La vue montre ce qui arrive avant toute correction : sans cela, la zone resterait vide et
      // l'on corrigerait un texte qu'on ne voit pas.
      if (typeof entree === "string") data._texteRecu = entree;

      const ecrit = ctx.paramTexte("Texte", "");
      const sortie = ecrit !== "" ? ecrit : (typeof entree === "string" ? entree : null);
      if (sortie === null) return { valeurs: [null], message: traduire("msg.aucun_texte_en_entr_e") };

      const etat = ecrit !== "" ? traduire("modifierTexte.corrige") : traduire("modifierTexte.inchange");
      return {
        valeurs: [sortie],
        message: `${traduire("msg.var_0_caract_res", sortie.length)} · ${etat}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
