// plugins/rouleau-sequence.ts — Voir une séquence, au lieu de la déduire d'un message.
//
// CE QU'IL RÉSOUT. Une vingtaine de nœuds rendent des séquences, et il n'y avait qu'un seul moyen de
// regarder ce qu'ils rendent : les graver. La gravure demande un arbre rythmique pour dire quelque
// chose, elle passe par un graveur, et elle ne montre les hauteurs qu'à la note écrite près. Pour
// vérifier qu'un solveur a bien tenu sa contrainte, ou qu'une formule n'a pas écrasé une ligne, il
// fallait lire un message et le croire.
//
// IL MONTRE CE QUE LA NOTATION NE PEUT PAS MONTRER. L'axe des hauteurs est continu : une note qui ne
// tombe pas sur un demi-ton se pose entre deux rangées. C'est la raison d'être du flux de séquences,
// et c'était la seule chose qu'on ne pouvait pas voir.
//
// IL NE REND RIEN, ET C'EST VOULU. Une sortie peut déjà nourrir plusieurs entrées : on dérive une
// chaîne vers lui, et elle continue son chemin sans qu'il ait à la restituer.
//
// LE DESSIN VIT AILLEURS : `ui/RouleauSequence.tsx` pour les traits, `ui/rouleau-calcul.ts` pour la
// géométrie et ses tests. Ce fichier ne fait que reconnaître une séquence et la poser.

import type { FicheAudio } from "../audio/types-domaine";
import { compterMicrotons, dureeSequence, estSequence } from "../audio/sequence";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "rouleau-sequence",
    nom: "Rouleau de séquence", nomEn: "Sequence Roll",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dessine les notes d'une séquence sur un axe de hauteurs continu, voix par voix.",
    resumeEn: "Draws the notes of a sequence on a continuous pitch axis, voice by voice.",
    notice: "Dessine la séquence branchée sur son entrée : le temps en abscisse, les hauteurs en ordonnée, une barre par note. L'aigu est en haut.\n\nL'axe des hauteurs est continu. Une note qui ne tombe pas sur un demi-ton se pose entre deux rangées et chevauche les deux ; elle porte en outre un liseré, pour qu'on la repère de loin sur un axe de plusieurs octaves. Le nom qui apparaît au survol donne l'écart en centièmes de demi-ton.\n\nLes rangées des touches noires sont teintées, et un filet marque chaque do : c'est de quoi compter les degrés sans étiquettes. La bande de gauche nomme les do, celle du bas gradue le temps en secondes.\n\nChaque voix a sa couleur, et le pied du dessin les nomme avec leur nombre de notes. Les noms de voix sont ceux que la séquence porte, quand elle en porte.\n\nL'opacité d'une barre dit sa nuance, en quatre bandes de la plus faible à la plus forte.\n\nQuand la séquence dure plus longtemps que sa dernière note, la fin est hachurée et le pied donne la longueur de ce silence final.\n\nLe dessin porte deux mille barres au plus. Au-delà, les notes sont prises dans l'ordre du temps, de sorte que le début de toutes les voix reste visible, et le pied dit combien de notes n'ont pas été dessinées.\n\nLe survol d'une barre donne la hauteur, le début et la fin en secondes.\n\nLe nœud ne rend rien. Une sortie peut nourrir plusieurs entrées : on dérive une chaîne vers lui, et elle continue son chemin.\n\nLe message donne le nombre de notes, la durée, le nombre de voix et le nombre de microtons.",
    noticeEn: "Draws the sequence connected to its input: time on the horizontal axis, pitches on the vertical one, one bar per note. High pitches are at the top.\n\nThe pitch axis is continuous. A note that does not fall on a semitone sits between two rows and overlaps both; it also carries an outline, so that it can be spotted from afar on an axis several octaves tall. The name shown on hover gives the deviation in hundredths of a semitone.\n\nThe rows of the black keys are tinted, and a rule marks every C: that is enough to count degrees without labels. The left band names the C's, the bottom one graduates time in seconds.\n\nEach voice has its colour, and the foot of the drawing names them with their note count. Voice names are those the sequence carries, when it carries any.\n\nThe opacity of a bar gives its dynamic, in four bands from the softest to the loudest.\n\nWhen the sequence lasts longer than its last note, the end is hatched and the foot gives the length of that trailing silence.\n\nThe drawing holds two thousand bars at most. Beyond that, notes are taken in time order, so that the beginning of every voice stays visible, and the foot says how many notes were not drawn.\n\nHovering a bar gives the pitch, the start and the end in seconds.\n\nThe node returns nothing. One output can feed several inputs: a chain is tapped towards it and carries on.\n\nThe message gives the number of notes, the duration, the number of voices and the number of microtones.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [],
    parametres: [],
    async executer(ctx: any) {
      const recue = ctx.entree(0);
      if (!estSequence(recue)) {
        // RIEN N'EST DÉSIGNÉ, ET NON LE DESSIN PRÉCÉDENT LAISSÉ TEL QUEL : sans cela, débrancher une
        // entrée laisserait la séquence d'avant affichée comme si elle décrivait encore quelque chose.
        return { valeurs: [], message: en() ? "No sequence at the input." : "Aucune séquence à l'entrée." };
      }
      // La vue le lit par le canal déclaré : seule l'exécution connaît la séquence branchée, et
      // c'est une désignation de l'ENTRÉE, qu'un réglage ne périme pas.
      const designe = { sequence: recue };

      const voix = new Set(recue.notes.map((n: any) => Math.max(0, Math.floor(n.voix ?? 0)))).size;
      const microtons = compterMicrotons(recue);
      const bouts = [
        // « notes » s'écrit de même dans les deux langues ; « voix » est invariable en français.
        `${recue.notes.length} notes`,
        `${dureeSequence(recue).toFixed(2)} s`,
        `${voix} ${en() ? (voix > 1 ? "voices" : "voice") : "voix"}`,
      ];
      if (microtons > 0) bouts.push(`${microtons} ${en() ? "microtones" : "microtons"}`);
      return { valeurs: [], designe, message: bouts.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);
