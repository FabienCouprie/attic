// plugins/cercle-retouche.ts — Le cercle reçu, montré et retouché à la main.
//
// LE CALCUL EST DANS `audio/cercle-retouche.ts`, ÉPROUVÉ, et l'en-tête de ce fichier-là dit
// pourquoi la retouche est un masque et non une copie. Ce fichier n'est que la prise.
//
// LE CERCLE REÇU PASSE PAR `designe`, ET C'EST TOUTE LA RAISON POUR LAQUELLE CE COMPOSANT MARCHE.
// Cliquer une place change un réglage ; si le dessin venait de `affichage`, ce changement
// l'effacerait, et la place s'allumerait puis disparaîtrait. `designe` dit que le cercle vient
// d'une entrée : une remise à zéro l'efface, un réglage le garde.

import type { FicheAudio } from "../audio/types-domaine";
import { enSuite, type Cercle } from "../audio/cercle";
import { cercleRetouche, differenceDeRetouche } from "../audio/cercle-retouche";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-retouche", nom: "Cercle à retoucher", nomEn: "Circle Editor",
    univers: "Autres", famille: "Circle",
    resume: "Montre le cercle reçu, laisse allumer ou éteindre ses places, et rend le cercle retouché.",
    resumeEn: "Shows the circle it receives, lets its positions be turned on or off, and returns the edited circle.",
    notice: `Montre sur le nœud le cercle qui arrive à son entrée, et le rend à sa sortie. Un clic sur une place l'allume ou l'éteint.

Le dessin porte le cercle tel qu'il est arrivé, et non un cercle déduit de réglages : posé après une transformation, il montre donc ce qu'elle a fait.

« Retouche » porte le masque, une suite de zéros et de uns, un par place. Vide, le cercle reçu passe tel quel, et c'est l'état d'un composant que personne n'a cliqué. Le masque se saisit aussi à la main, et il se recopie d'un nœud à l'autre.

Le masque ne fige pas l'entrée. Il décide de ce qui sonne, et de rien d'autre : le nombre de places, la sorte et les hauteurs viennent du cercle reçu à chaque passage. Tourner le cercle en amont change donc les hauteurs sous un masque qui, lui, ne bouge pas.

Un cercle qui change de taille en amont ne fait ni perdre ni inventer de places : le masque est tronqué s'il devient trop long, et complété par ce que le cercle porte déjà s'il devient trop court.

Une place que l'entrée n'allumait pas peut s'allumer. Elle prend alors la hauteur de l'attaque qui la précède sur le tour, le tour se refermant : une place avant la première attaque prend la dernière du cercle. Sur un cercle de percussion, un seul son valant pour tout le tour, toute place peut s'allumer sans rien changer d'autre.

Une suite de cercles reçue sur l'entrée est retouchée cercle par cercle, et le dessin montre le premier.

Le message dit combien de places ont été éteintes et combien allumées.`,
    noticeEn: `Shows on the node the circle arriving at its input, and returns it at its output. A click on a position turns it on or off.

The drawing carries the circle as it arrived, and not a circle derived from settings: placed after a transformation, it therefore shows what that transformation did.

« Edit » carries the mask, a string of zeros and ones, one per position. Empty, the received circle passes through as it is, and that is the state of a node nobody has clicked. The mask can also be typed by hand, and it copies from one node to another.

The mask does not freeze the input. It decides what sounds, and nothing else: the number of positions, the kind and the pitches come from the circle received on each pass. Turning the circle upstream therefore changes the pitches under a mask that itself does not move.

A circle that changes size upstream neither loses nor invents positions: the mask is truncated if it becomes too long, and completed by what the circle already carries if it becomes too short.

A position the input did not light can be lit. It then takes the pitch of the onset preceding it on the turn, the turn closing back on itself: a position before the first onset takes the last of the circle. On a rhythm circle, a single sound standing for the whole turn, any position can be lit without changing anything else.

A series of circles received on the input is edited circle by circle, and the drawing shows the first.

The message states how many positions were turned off and how many turned on.`,
    entrees: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Retouche", nomEn: "Edit", type: "texte", defaut: "", defautEn: "",
        placeholder: "101010",
        doc: "Le masque, une suite de zéros et de uns, un par place. Vide, le cercle reçu passe tel quel.",
        docEn: "The mask, a string of zeros and ones, one per position. Empty, the received circle passes through as it is." },
    ],
    async executer(ctx: any) {
      const suite: Cercle[] = enSuite(ctx.entree(0));
      if (suite.length === 0) {
        return { valeurs: [null], erreur: true,
          message: en() ? "No circle at the input." : "Aucun cercle à l'entrée." };
      }
      const masque = ctx.paramTexte("Retouche", "");
      const retouches = suite.map((c) => cercleRetouche(c, masque));
      const { eteintes, allumees } = differenceDeRetouche(suite[0], masque);

      const change = eteintes + allumees === 0
        ? (en() ? "untouched" : "non retouché")
        : [
          eteintes > 0 ? `${eteintes} ${en() ? "off" : "éteinte(s)"}` : "",
          allumees > 0 ? `${allumees} ${en() ? "on" : "allumée(s)"}` : "",
        ].filter(Boolean).join(" · ");
      const variations = suite.length > 1 ? ` · ${suite.length} ${en() ? "variations" : "variations"}` : "";
      return {
        // UNE SUITE D'UN CERCLE SE RAMÈNE AU CERCLE SEUL : le cas ordinaire ne change pas, et une
        // boucle de variation peut traverser ce composant sans que ses cercles se perdent.
        valeurs: [retouches.length === 1 ? retouches[0] : retouches],
        // CE QUE LE DESSIN MONTRE VIENT DE L'ENTRÉE, donc de ce canal : un réglage ne le périme pas,
        // et cliquer une place ne fait donc pas disparaître le cercle qu'on est en train de cliquer.
        designe: { cercle: suite[0] },
        message: `${suite[0].positions} ${en() ? "positions" : "places"} · `
          + `${retouches[0].sommets.length} ${en() ? "onsets" : "attaques"} · ${change}${variations}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
