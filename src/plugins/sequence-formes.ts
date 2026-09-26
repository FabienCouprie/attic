// plugins/sequence-formes.ts — Les deux traitements élémentaires d'une suite de notes.
//
// POURQUOI CES DEUX-LÀ. Le flux de séquence avait une entrée, une source et deux sorties, mais un
// seul traitement au milieu. Ce qui fait l'intérêt d'un graphe est pourtant la composition : deux
// fonctions mises à la suite. Filtrer une liste et lui imposer un profil sont les deux opérations
// les plus employées de la composition assistée, et les moins chères à écrire.
//
// LE PROFIL RENCONTRE UN FLUX QUI EXISTAIT DÉJÀ. Le type `courbe` a son générateur et ses suiveurs ;
// la hauteur d'une mélodie peut donc être pilotée par ce qui pilote une fréquence de coupure,
// jusqu'à l'enveloppe relevée sur un son. Aucun troisième type n'a été nécessaire.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe } from "../audio/courbe";
import { estSequence, type Sequence } from "../audio/sequence";
import { filtrerNotes, imposerProfil, profilDeSequence } from "../audio/sequence-formes";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "filtre-sequence",
    nom: "Filtre de séquence", nomEn: "Sequence Filter",
    univers: "Traitement", famille: "Conversion",
    resume: "Sépare les notes d'une séquence selon leur hauteur, leur durée, leur nuance ou leur canal.",
    resumeEn: "Splits the notes of a sequence by pitch, duration, velocity or channel.",
    notice: "Sépare les notes d'une séquence en deux : celles qui satisfont les critères et celles qui ne les satisfont pas.\n\nLes deux sorties existent pour que rien ne disparaisse. « Gardées » rend les notes retenues, « Écartées » rend les autres ; leurs deux comptes font toujours le total reçu. Les deux peuvent être traitées séparément puis réunies, ce qui est le procédé ordinaire pour traiter un registre autrement qu'un autre.\n\n« Hauteur minimale » et « Hauteur maximale » bornent la hauteur, en demi-tons, bornes comprises. Une hauteur peut ne pas tomber sur un demi-ton, et la comparaison en tient compte.\n\n« Durée minimale » et « Durée maximale » bornent la durée en secondes, bornes comprises.\n\n« Nuance minimale » et « Nuance maximale » bornent la vélocité, de zéro à cent vingt-sept.\n\n« Canal » ne retient que les notes du canal choisi. À moins un, tous les canaux passent.\n\nUn critère laissé à sa valeur de départ ne filtre pas : les bornes de départ couvrent toute l'étendue possible.\n\nLe message donne le nombre de notes gardées et écartées.",
    noticeEn: "Splits the notes of a sequence in two: those that satisfy the criteria and those that do not.\n\nBoth outputs exist so that nothing disappears. « Kept » returns the notes retained, « Dropped » returns the others; their two counts always make the total received. Both can be treated separately then reunited, which is the ordinary way of treating one register differently from another.\n\n« Minimum pitch » and « Maximum pitch » bound the pitch in semitones, bounds included. A pitch need not fall on a semitone, and the comparison accounts for that.\n\n« Minimum duration » and « Maximum duration » bound the duration in seconds, bounds included.\n\n« Minimum velocity » and « Maximum velocity » bound the velocity, from zero to one hundred and twenty-seven.\n\n« Channel » keeps only the notes of the chosen channel. At minus one, every channel passes.\n\nA criterion left at its starting value does not filter: the starting bounds cover the whole possible range.\n\nThe message gives the number of notes kept and dropped.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Gardées", nomEn: "Kept", type: "sequence" },
      { nom: "Écartées", nomEn: "Dropped", type: "sequence" },
    ],
    parametres: [
      { nom: "Hauteur minimale", nomEn: "Minimum pitch", plage: [0, 127], pas: 1, defaut: 0,
        doc: "Borne basse de la hauteur, en demi-tons, comprise.",
        docEn: "Lower bound of the pitch, in semitones, included." },
      { nom: "Hauteur maximale", nomEn: "Maximum pitch", plage: [0, 127], pas: 1, defaut: 127,
        doc: "Borne haute de la hauteur, en demi-tons, comprise.",
        docEn: "Upper bound of the pitch, in semitones, included." },
      { nom: "Durée minimale", nomEn: "Minimum duration", plage: [0, 30], pas: 0.01, defaut: 0, unite: "s",
        doc: "Borne basse de la durée, comprise.", docEn: "Lower bound of the duration, included." },
      { nom: "Durée maximale", nomEn: "Maximum duration", plage: [0, 30], pas: 0.01, defaut: 30, unite: "s",
        doc: "Borne haute de la durée, comprise.", docEn: "Upper bound of the duration, included." },
      { nom: "Nuance minimale", nomEn: "Minimum velocity", plage: [0, 127], pas: 1, defaut: 0,
        doc: "Borne basse de la vélocité, comprise.", docEn: "Lower bound of the velocity, included." },
      { nom: "Nuance maximale", nomEn: "Maximum velocity", plage: [0, 127], pas: 1, defaut: 127,
        doc: "Borne haute de la vélocité, comprise.", docEn: "Upper bound of the velocity, included." },
      { nom: "Canal", nomEn: "Channel", plage: [-1, 15], pas: 1, defaut: -1,
        doc: "Le canal retenu. À moins un, tous les canaux passent.",
        docEn: "The channel kept. At minus one, every channel passes." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const { gardees, ecartees } = filtrerNotes(entree.notes, {
        hauteurMin: ctx.paramNombre("Hauteur minimale", 0),
        hauteurMax: ctx.paramNombre("Hauteur maximale", 127),
        dureeMin: ctx.paramNombre("Durée minimale", 0),
        dureeMax: ctx.paramNombre("Durée maximale", 30),
        nuanceMin: ctx.paramNombre("Nuance minimale", 0),
        nuanceMax: ctx.paramNombre("Nuance maximale", 127),
        canal: Math.round(ctx.paramNombre("Canal", -1)),
      });
      const reste = { tempo: entree.tempo, titre: entree.titre };
      return {
        valeurs: [{ notes: gardees, ...reste }, { notes: ecartees, ...reste }],
        message: `${gardees.length} ${en() ? "kept" : "gardées"} · ${ecartees.length} ${en() ? "dropped" : "écartées"}`,
      };
    },
  },
  {
    id: "profil-melodique",
    nom: "Profil mélodique", nomEn: "Melodic Profile",
    univers: "Traitement", famille: "Conversion",
    resume: "Donne à une séquence le profil d'une courbe, et rend aussi le profil qu'elle avait.",
    resumeEn: "Gives a sequence the profile of a curve, and also returns the profile it had.",
    notice: "Donne aux hauteurs d'une séquence le profil d'une courbe, sans toucher à ses rythmes.\n\nLes débuts, les fins et les nuances sont ceux de la séquence reçue ; seules les hauteurs changent. La courbe est lue au milieu de chaque note, c'est-à-dire pendant qu'elle sonne.\n\n« Force » règle le passage de l'une à l'autre. À zéro la séquence sort inchangée. À un elle épouse la courbe et son profil d'origine disparaît. Entre les deux, le profil d'origine se déforme sans disparaître, et c'est le régime où une mélodie garde ses intervalles caractéristiques en suivant une autre ligne.\n\n« Grave » et « Aigu » sont les hauteurs, en demi-tons, que valent zéro et un sur la courbe. Les donner à l'envers retourne le profil.\n\n« Hauteurs » décide de la finesse. « Continues » garde les fractions de demi-ton que la courbe produit, et la gravure en MusicXML les conserve. « Demi-tons » arrondit.\n\nSans courbe branchée, la séquence ressort telle quelle et seul le profil lu est calculé.\n\nLa sortie « Séquence » rend les notes transformées. La sortie « Profil » rend la courbe des hauteurs de la séquence reçue, ramenée entre zéro et un de sa note la plus grave à sa plus aiguë ; elle se branche partout où une courbe se branche.\n\nLe message donne le nombre de notes, la force appliquée et l'étendue parcourue.",
    noticeEn: "Gives the pitches of a sequence the profile of a curve, without touching its rhythms.\n\nStarts, ends and velocities are those of the sequence received; only the pitches change. The curve is read at the middle of each note, that is while it sounds.\n\n« Strength » sets the passage from one to the other. At zero the sequence comes out unchanged. At one it follows the curve and its original profile disappears. Between the two, the original profile bends without disappearing, and that is the range where a melody keeps its characteristic intervals while following another line.\n\n« Low » and « High » are the pitches, in semitones, that zero and one on the curve stand for. Giving them the other way round turns the profile over.\n\n« Pitches » decides the fineness. « Continuous » keeps the fractions of a semitone the curve produces, and MusicXML engraving preserves them. « Semitones » rounds.\n\nWith no curve connected, the sequence comes out as it is and only the profile read is computed.\n\nThe « Sequence » output returns the transformed notes. The « Profile » output returns the curve of the pitches of the sequence received, scaled between zero and one from its lowest note to its highest; it connects wherever a curve connects.\n\nThe message gives the number of notes, the strength applied and the range covered.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false },
    ],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Profil", nomEn: "Profile", type: "courbe" },
    ],
    parametres: [
      { nom: "Force", nomEn: "Strength", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "À zéro la séquence ne change pas ; à cent elle épouse la courbe.",
        docEn: "At zero the sequence does not change; at one hundred it follows the curve." },
      { nom: "Grave", nomEn: "Low", plage: [0, 127], pas: 1, defaut: 48,
        doc: "La hauteur que vaut zéro sur la courbe.", docEn: "The pitch that zero on the curve stands for." },
      { nom: "Aigu", nomEn: "High", plage: [0, 127], pas: 1, defaut: 84,
        doc: "La hauteur que vaut un sur la courbe.", docEn: "The pitch that one on the curve stands for." },
      { nom: "Hauteurs", nomEn: "Pitches", type: "choix",
        options: ["Continues", "Demi-tons"], optionsEn: ["Continuous", "Semitones"],
        optionIds: ["continues", "demi-tons"], defaut: "Continues", defautEn: "Continuous",
        doc: "Continues garde les fractions de demi-ton que la courbe produit ; Demi-tons arrondit.",
        docEn: "Continuous keeps the fractions of a semitone the curve produces; Semitones rounds." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const profil = profilDeSequence(entree.notes);
      const courbe = ctx.entree(1);
      if (!estCourbe(courbe)) {
        return {
          valeurs: [entree, profil],
          message: en()
            ? `No curve connected: ${entree.notes.length} notes passed through, profile read`
            : `Aucune courbe branchée : ${entree.notes.length} notes laissées telles quelles, profil lu`,
        };
      }
      const force = ctx.paramNombre("Force", 100) / 100;
      const grave = ctx.paramNombre("Grave", 48);
      const aigu = ctx.paramNombre("Aigu", 84);
      const notes = imposerProfil(entree.notes, courbe, {
        grave, aigu, force,
        arrondir: ctx.paramTexte("Hauteurs", "continues") === "demi-tons",
      });
      const sortie: Sequence = { notes, tempo: entree.tempo, titre: entree.titre };
      const basse = Math.min(...notes.map((n) => n.note));
      const haute = Math.max(...notes.map((n) => n.note));
      return {
        valeurs: [sortie, profil],
        message: `${notes.length} notes · ${en() ? "strength" : "force"} ${Math.round(force * 100)} % · `
          + `${basse.toFixed(1)} ${en() ? "to" : "à"} ${haute.toFixed(1)}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
