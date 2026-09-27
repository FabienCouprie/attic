// plugins/separation-voix.ts — Retrouver les lignes dans un flux qui les mêle.
//
// LA PLACE DE CE NŒUD DANS LA CHAÎNE. Il rend une séquence dont chaque note porte sa voix, c'est-à-
// dire l'objet que le reste sait déjà traiter : la gravure en tire une portée par voix, et une voix
// s'en extrait pour être retouchée seule. Il est l'inverse de la réunion des voix.
//
// LE CALCUL EST DANS `audio/separation-voix.ts`, éprouvé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type InfoVoix, type Sequence } from "../audio/sequence";
import { separerVoix } from "../audio/separation-voix";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "separer-voix",
    nom: "Séparer les voix", nomEn: "Separate Voices",
    univers: "Traitement", famille: "Conversion",
    resume: "Retrouve les lignes d'une séquence qui les mêle, et donne sa voix à chaque note.",
    resumeEn: "Recovers the lines of a sequence that mixes them, and gives each note its voice.",
    notice: "Retrouve les lignes d'une séquence qui les mêle, et rend une séquence dont chaque note porte sa voix.\n\nC'est ce qu'on appelle la séparation de voix. Un fichier reçu, une improvisation enregistrée ou une réduction de partition donnent un ensemble de notes datées ; rien dans les données ne dit quelle note appartient à quelle ligne. Le procédé découpe la pièce là où le nombre de notes qui sonnent change, ordonne par hauteur à l'intérieur de chaque tranche, puis recolle les tranches en déplaçant le moins possible. Les tranches les plus fournies servent de point de départ, l'ordre par hauteur y ayant le plus de chances d'être le bon. D'après Elaine Chew et Xiaodan Wu, « Separating Voices in Polyphonic Music: A Contig Mapping Approach », Computer Music Modeling and Retrieval, 2004.\n\n« Voix au maximum » borne le nombre de lignes rendues. À zéro, il est celui que la pièce demande, c'est-à-dire le plus grand nombre de notes qui sonnent ensemble.\n\n« Coût d'entrée et de sortie » se compare à un déplacement de hauteur, en demi-tons. Bas, une ligne se coupe en morceaux dès qu'elle fait un saut. Haut, deux lignes distinctes se soudent en une plutôt que d'admettre qu'une voix s'est tue.\n\n« Tolérance » est l'écart en deçà duquel deux instants sont tenus pour le même.\n\nLes voix sont numérotées du plus aigu au plus grave, sans trou dans la numérotation.\n\nDeux lignes qui se traversent laissent exactement les mêmes hauteurs que deux lignes qui se touchent et rebroussent chemin : l'information n'est pas dans le flux, et c'est la seconde lecture qui est rendue. Le message compte en revanche les instants où deux voix sonnent à la même hauteur, où l'ordre ne décide plus rien et où le résultat est à relire.\n\nLa sortie « Séquence » porte les mêmes notes, chacune sachant sa voix. La sortie « Analyse » liste les voix avec leur nombre de notes et leur étendue.\n\nLe message donne le nombre de voix trouvées, le nombre de tranches et le nombre d'unissons.",
    noticeEn: "Recovers the lines of a sequence that mixes them, and returns a sequence in which each note carries its voice.\n\nThis is what is called voice separation. A received file, a recorded improvisation or a reduction of a score give a set of dated notes; nothing in the data says which note belongs to which line. The procedure cuts the piece where the number of sounding notes changes, orders by pitch within each slice, then reconnects the slices with as little movement as possible. The fullest slices serve as the starting point, the pitch ordering being most likely correct there. After Elaine Chew and Xiaodan Wu, « Separating Voices in Polyphonic Music: A Contig Mapping Approach », Computer Music Modeling and Retrieval, 2004.\n\n« Maximum voices » bounds the number of lines returned. At zero, it is the number the piece calls for, that is, the largest number of notes sounding together.\n\n« Entry and exit cost » compares with a pitch displacement, in semitones. Low, a line breaks into pieces as soon as it leaps. High, two distinct lines weld into one rather than admit that a voice has fallen silent.\n\n« Tolerance » is the gap below which two instants are taken as the same.\n\nVoices are numbered from the highest to the lowest, with no gap in the numbering.\n\nTwo lines that cross leave exactly the same pitches as two lines that touch and turn back: the information is not in the stream, and it is the second reading that is returned. The message does count the instants where two voices sound at the same pitch, where the ordering decides nothing and the result is to be read again.\n\nThe « Sequence » output carries the same notes, each knowing its voice. The « Analysis » output lists the voices with their note count and their range.\n\nThe message gives the number of voices found, the number of slices and the number of unisons.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Voix au maximum", nomEn: "Maximum voices", plage: [0, 8], pas: 1, defaut: 0,
        doc: "Le nombre de lignes rendues au plus. À zéro, celui que la pièce demande.",
        docEn: "The largest number of lines returned. At zero, the number the piece calls for." },
      { nom: "Coût d'entrée et de sortie", nomEn: "Entry and exit cost", plage: [0, 48], pas: 1, defaut: 12,
        doc: "Ce que coûte une voix qui commence ou s'arrête, en demi-tons. Bas, une ligne se coupe à chaque saut ; haut, deux lignes se soudent en une.",
        docEn: "What a voice starting or stopping costs, in semitones. Low, a line breaks at every leap; high, two lines weld into one." },
      { nom: "Tolérance", nomEn: "Tolerance", plage: [0.001, 0.2], pas: 0.001, defaut: 0.01, unite: "s",
        doc: "Écart en deçà duquel deux instants sont tenus pour le même.",
        docEn: "Gap below which two instants are taken as the same." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }

      const res = separerVoix(entree.notes, {
        voixMax: Math.round(ctx.paramNombre("Voix au maximum", 0)),
        coutEntreeSortie: ctx.paramNombre("Coût d'entrée et de sortie", 12),
        tolerance: ctx.paramNombre("Tolérance", 0.01),
      });

      const infos: InfoVoix[] = Array.from({ length: res.voix }, (_, v) => ({
        numero: v, nom: `${en() ? "Voice" : "Voix"} ${v + 1}`,
      }));
      // L'ÉCRITURE MESURÉE DE L'ENTRÉE NE SUIT PAS. Elle décrivait toutes les notes ensemble ; une
      // fois réparties, aucune voix n'a plus ce rythme, et la porter serait la promettre fausse.
      const sequence: Sequence = {
        notes: res.notes, tempo: entree.tempo, duree: entree.duree, voix: infos,
      };

      const lignes = infos.map((info) => {
        const siennes = res.notes.filter((n) => (n.voix ?? 0) === info.numero);
        const hauteurs = siennes.map((n) => n.note);
        const etendue = hauteurs.length > 0
          ? `${nomNote(Math.min(...hauteurs))} ${en() ? "to" : "à"} ${nomNote(Math.max(...hauteurs))}`
          : (en() ? "empty" : "vide");
        return `${info.nom}  ${siennes.length} notes  ${etendue}`;
      });
      const entete = `${res.voix} ${en() ? "voices" : "voix"} · ${res.notes.length} notes · `
        + `${res.contigs} ${en() ? "slices" : "tranches"} · ${dureeSequence(sequence).toFixed(2)} s`;

      return {
        valeurs: [sequence, [entete, "", ...lignes].join("\n")],
        message: entete + (res.unissons > 0
          ? ` · ${res.unissons} ${en() ? "unisons, to be read again" : "unissons, à relire"}`
          : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
