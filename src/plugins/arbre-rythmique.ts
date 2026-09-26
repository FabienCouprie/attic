// plugins/arbre-rythmique.ts — Écrire un rythme par divisions, puis le poser sur des hauteurs.
//
// DEUX NŒUDS, ET C'EST LA CHAÎNE D'ÉDITION QUI L'IMPOSE. Un seul nœud qui engendrerait et
// appliquerait ne laisserait rien voir entre les deux ; or l'intérêt est précisément de retoucher
// les hauteurs tirées avant de les entendre, avec les composants de texte qui existent déjà. Un
// graphe étant acyclique, on ne peut pas sortir un texte, le modifier et le rentrer dans le même
// nœud : il en faut deux. Demandé par Fabien, pour cette raison.
//
// LE TEXTE RESTE LA SOURCE DE VÉRITÉ, dans les deux sens. Le constructeur écrit la notation en
// listes, le consommateur la relit ; entre les deux, n'importe quoi peut la retoucher, y compris
// un arbre écrit à la main ou collé depuis ailleurs.
//
// POURQUOI UN CATALOGUE ET UN TIRAGE. Le dénombrement tranche : à un étage de division, une mesure
// admet quelques centaines d'arbres, ce qui se feuillette ; à deux étages, douze milliards. Le
// premier étage se recense, au-delà il faut tirer sous surveillance.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core";
import { derouler, dureeArbre, ecrireArbre, lireArbre } from "../audio/arbre-rythmique";
import { catalogueArbres, engendrerArbre, engendrerHauteurs } from "../audio/arbres-catalogue";
import { GAMMES_CORRECTION, degresDe } from "../audio/correction-hauteur";
import { estSequence, type Sequence } from "../audio/sequence";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

const ARBRE_DEFAUT = "(4/4 (1 (1 (1 1 1)) 1 1))";
const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const METRIQUES = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8"];
const SOURCES = [
  { id: "catalogue", nom: "Catalogue", nomEn: "Catalogue" },
  { id: "tirage", nom: "Tirage", nomEn: "Draw" },
  { id: "dessin", nom: "Dessin", nomEn: "Drawing" },
];

/** Lit une suite de hauteurs écrite à la main : « 60 62 64 » ou « 60, 62, 64 ». */
function lireHauteurs(texte: string): number[] {
  return texte.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 127);
}

function lireMetrique(texte: string): [number, number] {
  const m = /^(\d+)\/(\d+)$/.exec(texte.trim());
  return m ? [Number(m[1]), Number(m[2])] : [4, 4];
}

export const fiches: FicheAudio[] = ([
  {
    id: "arbre-rythmique",
    nom: "Arbre rythmique", nomEn: "Rhythm Tree",
    univers: "Entrées", famille: "Génération",
    resume: "Choisit ou tire un rythme écrit par divisions, et les hauteurs qui l'accompagnent.",
    resumeEn: "Picks or draws a rhythm written by divisions, and the pitches that go with it.",
    notice: "Produit un rythme écrit par divisions successives, et une suite de hauteurs de même longueur, tous deux en texte.\n\nUn rythme est décrit comme une mesure divisée, et non comme une liste de durées. Une mesure porte une métrique et une liste de proportions ; chaque proportion est une note, un silence quand elle est négative, ou une division quand elle porte elle-même une liste. Les proportions n'ont pas d'unité : seul leur rapport compte. La liste 1 1 2 donne un temps, un temps et deux temps sur une mesure de quatre temps, et trois quarts, trois quarts et un temps et demi sur une mesure de trois.\n\n« Source » choisit la façon d'obtenir l'arbre.\n\n« Catalogue » parcourt les arbres à un seul étage de division, recensés dans un ordre qui ne change pas d'une version à l'autre. À quatre emplacements et trois parts au plus, silences compris, il y en a 340. « Numéro » désigne celui qui est rendu ; au-delà du dernier, le compte reprend au premier.\n\n« Tirage » engendre un arbre au hasard dans les limites données. « Graine » fixe le tirage : la même graine rend le même rythme.\n\n« Métrique » fixe la mesure. « Mesures » en engendre plusieurs à la suite. « Emplacements » est le nombre de divisions au sommet de chaque mesure.\n\n« Profondeur » est le nombre d'étages de division permis. À zéro, la mesure n'a aucune division.\n\n« Divisions » énumère les nombres de parts autorisés, séparés par des espaces : 2 3 4 permet le binaire, le triolet et la division en quatre.\n\n« Densité » est la chance qu'un emplacement se divise plutôt que de rester une note. C'est l'inégalité entre ce qui se divise et ce qui ne se divise pas qui fait un rythme ; à cent pour cent, la mesure est uniformément hachée.\n\n« Silences » et « Liaisons » sont les parts d'emplacements qui deviennent un silence ou une note liée à la précédente.\n\nLes hauteurs sont tirées en nombre égal à celui des notes de l'arbre, silences exclus.\n\n« Gamme » et « Tonique » restreignent les hauteurs aux degrés d'une gamme. « Grave » et « Aigu » bornent l'étendue. « Écart maximal » borne l'intervalle entre deux notes consécutives ; sans lui, un tirage uniforme saute d'une octave à chaque note et ne s'entend pas comme une ligne.\n\nLa sortie « Arbre » rend la notation en listes. La sortie « Hauteurs » rend les numéros MIDI séparés par des espaces. Les deux se retouchent avec un composant de texte avant d'être reçus par « Rythme sur hauteurs ».\n\nLe message donne la source, le nombre de notes, celui des silences et la durée.",
    noticeEn: "Produces a rhythm written by successive divisions, and a series of pitches of the same length, both as text.\n\nA rhythm is described as a divided measure, not as a list of durations. A measure carries a time signature and a list of proportions; each proportion is a note, a rest when negative, or a division when it carries a list of its own. Proportions have no unit: only their ratio counts. The list 1 1 2 gives one beat, one beat and two beats on a four-beat measure, and three quarters, three quarters and a beat and a half on a three-beat one.\n\n« Source » selects how the tree is obtained.\n\n« Catalogue » runs through the trees with a single level of division, listed in an order that does not change from one version to the next. With four slots and at most three parts, rests included, there are 340 of them. « Number » designates the one returned; beyond the last, the count starts again at the first.\n\n« Draw » generates a tree at random within the given limits. « Seed » fixes the draw: the same seed gives the same rhythm.\n\n« Time signature » sets the measure. « Measures » generates several in a row. « Slots » is the number of divisions at the top of each measure.\n\n« Depth » is the number of division levels allowed. At zero, the measure has no division.\n\n« Divisions » lists the numbers of parts allowed, separated by spaces: 2 3 4 allows binary, triplet and division in four.\n\n« Density » is the chance that a slot divides rather than staying a note. It is the inequality between what divides and what does not that makes a rhythm; at one hundred percent, the measure is uniformly chopped.\n\n« Rests » and « Ties » are the shares of slots that become a rest or a note tied to the previous one.\n\nPitches are drawn in a number equal to that of the notes of the tree, rests excluded.\n\n« Scale » and « Tonic » restrict the pitches to the degrees of a scale. « Low » and « High » bound the range. « Maximum leap » bounds the interval between two consecutive notes; without it, a uniform draw jumps an octave at every note and is not heard as a line.\n\nThe « Tree » output returns the list notation. The « Pitches » output returns the MIDI numbers separated by spaces. Both can be edited with a text component before being received by « Rhythm on Pitches ».\n\nThe message gives the source, the number of notes, the number of rests and the duration.",
    entrees: [],
    sorties: [
      { nom: "Arbre", nomEn: "Tree", type: "texte" },
      { nom: "Hauteurs", nomEn: "Pitches", type: "texte" },
    ],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: SOURCES.map((s) => s.nom), optionsEn: SOURCES.map((s) => s.nomEn),
        optionIds: SOURCES.map((s) => s.id), defaut: SOURCES[0].nom, defautEn: SOURCES[0].nomEn,
        doc: "Catalogue parcourt les arbres recensés ; Tirage en engendre un au hasard.",
        docEn: "Catalogue runs through the listed trees; Draw generates one at random." },
      { nom: "Numéro", nomEn: "Number", plage: [0, 339], pas: 1, defaut: 0,
        doc: "L'arbre du catalogue qui est rendu. Au-delà du dernier, le compte reprend au premier.",
        docEn: "The catalogue tree returned. Beyond the last, the count starts again at the first." },
      { nom: "Arbre", nomEn: "Tree", type: "texte", defaut: ARBRE_DEFAUT, defautEn: ARBRE_DEFAUT,
        doc: "L'arbre dessiné, en notation de listes. Le dessin l'écrit ici, et un arbre venu d'ailleurs s'y colle. Employé quand la source est Dessin.",
        docEn: "The drawn tree, in list notation. The drawing writes it here, and a tree from elsewhere can be pasted into it. Used when the source is Drawing." },
      { nom: "Métrique", nomEn: "Time signature", type: "choix",
        options: METRIQUES, optionsEn: METRIQUES, optionIds: METRIQUES, defaut: "4/4", defautEn: "4/4",
        doc: "La mesure employée.", docEn: "The measure used." },
      { nom: "Mesures", nomEn: "Measures", plage: [1, 8], pas: 1, defaut: 1,
        doc: "Combien de mesures sont engendrées à la suite. Sans effet sur le catalogue.",
        docEn: "How many measures are generated in a row. No effect on the catalogue." },
      { nom: "Emplacements", nomEn: "Slots", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Le nombre de divisions au sommet de chaque mesure tirée.",
        docEn: "The number of divisions at the top of each drawn measure." },
      { nom: "Profondeur", nomEn: "Depth", plage: [0, 3], pas: 1, defaut: 1,
        doc: "Les étages de division permis. À zéro, aucune division.",
        docEn: "The division levels allowed. At zero, no division." },
      { nom: "Divisions", nomEn: "Divisions", type: "texte", defaut: "2 3 4", defautEn: "2 3 4",
        doc: "Les nombres de parts autorisés, séparés par des espaces.",
        docEn: "The numbers of parts allowed, separated by spaces." },
      { nom: "Densité", nomEn: "Density", plage: [0, 100], pas: 1, defaut: 35, unite: "%",
        doc: "La chance qu'un emplacement se divise plutôt que de rester une note.",
        docEn: "The chance that a slot divides rather than staying a note." },
      { nom: "Silences", nomEn: "Rests", plage: [0, 100], pas: 1, defaut: 15, unite: "%",
        doc: "La part des emplacements qui deviennent un silence.",
        docEn: "The share of slots that become a rest." },
      { nom: "Liaisons", nomEn: "Ties", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "La part des notes liées à celle qui précède.",
        docEn: "The share of notes tied to the one before." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 9999], pas: 1, defaut: 1,
        doc: "Fixe le tirage. La même graine rend le même rythme et les mêmes hauteurs.",
        docEn: "Fixes the draw. The same seed gives the same rhythm and the same pitches." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_CORRECTION.map((g) => g.fr), optionsEn: GAMMES_CORRECTION.map((g) => g.en),
        optionIds: GAMMES_CORRECTION.map((g) => g.id), defaut: "Majeure", defautEn: "Major",
        doc: "Les degrés auxquels les hauteurs sont restreintes.",
        docEn: "The degrees the pitches are restricted to." },
      { nom: "Tonique", nomEn: "Tonic", type: "choix",
        options: NOMS, optionsEn: NOMS, optionIds: NOMS, defaut: "C", defautEn: "C",
        doc: "La tonique de la gamme.", docEn: "The tonic of the scale." },
      { nom: "Grave", nomEn: "Low", plage: [0, 127], pas: 1, defaut: 55,
        doc: "La hauteur la plus basse permise.", docEn: "The lowest pitch allowed." },
      { nom: "Aigu", nomEn: "High", plage: [0, 127], pas: 1, defaut: 79,
        doc: "La hauteur la plus haute permise.", docEn: "The highest pitch allowed." },
      { nom: "Écart maximal", nomEn: "Maximum leap", plage: [0, 24], pas: 1, defaut: 7,
        doc: "L'intervalle maximal entre deux notes consécutives. À zéro, aucun frein.",
        docEn: "The maximum interval between two consecutive notes. At zero, no restraint." },
    ],
    async executer(ctx: any) {
      const choisie = ctx.paramTexte("Source", SOURCES[0].id);
      const source = SOURCES.find((s) => s.id === choisie || s.nom === choisie || s.nomEn === choisie) ?? SOURCES[0];
      const metrique = lireMetrique(ctx.paramTexte("Métrique", "4/4"));
      const graine = Math.round(ctx.paramNombre("Graine", 1));
      const hasard = creerAleatoire(graine);

      let mesures;
      let combien = 0;
      if (source.id === "dessin") {
        // LE TEXTE EST LA SOURCE DE VÉRITÉ, MÊME DESSINÉ. La vue écrit ici, et un arbre collé à la
        // main s'y lit pareillement ; une erreur de syntaxe est rendue telle quelle, position
        // comprise, plutôt que de laisser un nœud muet.
        try {
          mesures = lireArbre(ctx.paramTexte("Arbre", ARBRE_DEFAUT));
        } catch (err: any) {
          return { valeurs: [null, null], erreur: true, message: String(err?.message ?? err) };
        }
        if (mesures.length === 0) {
          return {
            valeurs: [null, null], erreur: true,
            message: en() ? "The drawn tree is empty." : "L'arbre dessiné est vide.",
          };
        }
      } else if (source.id === "catalogue") {
        const tous = catalogueArbres({ emplacementsMax: 4, partsMax: 3, metrique });
        const numero = Math.round(ctx.paramNombre("Numéro", 0));
        mesures = [tous[((numero % tous.length) + tous.length) % tous.length]];
        combien = tous.length;
      } else {
        const divisions = ctx.paramTexte("Divisions", "2 3 4").split(/[\s,;]+/)
          .map(Number).filter((n: number) => Number.isFinite(n) && n >= 2 && n <= 16);
        mesures = engendrerArbre({
          metrique,
          mesures: Math.round(ctx.paramNombre("Mesures", 1)),
          emplacements: Math.round(ctx.paramNombre("Emplacements", 4)),
          profondeur: Math.round(ctx.paramNombre("Profondeur", 1)),
          divisions: divisions.length > 0 ? divisions : [2, 3, 4],
          densite: ctx.paramNombre("Densité", 35) / 100,
          silences: ctx.paramNombre("Silences", 15) / 100,
          liaisons: ctx.paramNombre("Liaisons", 0) / 100,
        }, hasard);
      }

      const evenements = derouler(mesures, 120);
      const notes = evenements.filter((e) => !e.silence).length;
      const hauteurs = engendrerHauteurs({
        combien: notes,
        basse: ctx.paramNombre("Grave", 55),
        haute: ctx.paramNombre("Aigu", 79),
        degres: degresDe(ctx.paramTexte("Gamme", "majeure"), NOMS.indexOf(ctx.paramTexte("Tonique", "C"))),
        ecartMax: ctx.paramNombre("Écart maximal", 7),
      }, hasard);

      const arbre = ecrireArbre(mesures);
      const silences = evenements.length - notes;
      const dit = source.id === "catalogue"
        ? `catalogue ${Math.round(ctx.paramNombre("Numéro", 0)) % Math.max(1, combien)}/${combien}`
        : source.id === "dessin"
          ? (en() ? "drawing" : "dessin")
          : `${en() ? "seed" : "graine"} ${graine}`;
      return {
        valeurs: [arbre, hauteurs.join(" ")],
        message: `${dit} · ${notes} notes · ${silences} ${en() ? "rests" : "silences"} · `
          + `${dureeArbre(mesures, 120).toFixed(2)} s ${en() ? "at" : "à"} 120`,
      };
    },
  },
  {
    id: "rythme-sur-hauteurs",
    nom: "Rythme sur hauteurs", nomEn: "Rhythm on Pitches",
    univers: "Traitement", famille: "Conversion",
    resume: "Pose un rythme écrit par divisions sur une suite de hauteurs, et rend une séquence.",
    resumeEn: "Lays a rhythm written by divisions on a series of pitches, and returns a sequence.",
    notice: "Pose un rythme écrit par divisions sur une suite de hauteurs, et rend le résultat sur une sortie « Séquence ».\n\nLe rythme est lu dans la notation en listes. « (4/4 (1 1 1 1)) » est une mesure de quatre noires. « (4/4 (1 (1 (1 1 1)) 1 1)) » divise le deuxième temps en un triolet. « (4/4 (1 -2 1)) » remplace les deux temps du milieu par un silence. « (4/4 (1 1.0 1 1)) » lie la deuxième note à la première, qui dure alors deux temps. Plusieurs mesures s'écrivent l'une après l'autre. Une erreur de syntaxe est signalée avec la position du signe fautif.\n\nL'arbre vient de l'entrée « Arbre » quand elle est branchée, sinon du réglage du même nom.\n\nLes hauteurs viennent de l'entrée « Hauteurs », puis de l'entrée « Séquence », puis du réglage, dans cet ordre. Elles sont lues en boucle si l'arbre demande plus de notes qu'il n'en est fourni. Les rythmes d'une séquence reçue ne sont pas employés : l'arbre seul les décide. Le message dit d'où viennent les hauteurs qui ont servi.\n\n« Tempo » fixe la durée d'une noire. « Répétitions » rejoue l'arbre entier, bout à bout. « Nuance » est la vélocité des notes.\n\nLa sortie « Séquence » rend les notes obtenues. La sortie « Analyse » liste les événements avec leur début, leur durée et la division qui les porte.\n\nLe message donne le nombre de notes, celui des silences, la durée totale et le nombre de groupes qui ne sont pas des divisions binaires.",
    noticeEn: "Lays a rhythm written by divisions on a series of pitches, and returns the result on a « Sequence » output.\n\nThe rhythm is read in list notation. « (4/4 (1 1 1 1)) » is a measure of four quarter notes. « (4/4 (1 (1 (1 1 1)) 1 1)) » divides the second beat into a triplet. « (4/4 (1 -2 1)) » replaces the two middle beats with a rest. « (4/4 (1 1.0 1 1)) » ties the second note to the first, which then lasts two beats. Several measures are written one after another. A syntax error is reported with the position of the offending sign.\n\nThe tree comes from the « Tree » input when connected, otherwise from the setting of the same name.\n\nThe pitches come from the « Pitches » input, then from the « Sequence » input, then from the setting, in that order. They are read in a loop if the tree asks for more notes than are supplied. The rhythms of a received sequence are not used: the tree alone decides them. The message states where the pitches that served came from.\n\n« Tempo » sets the length of a quarter note. « Repeats » plays the whole tree again, end to end. « Velocity » is the velocity of the notes.\n\nThe « Sequence » output returns the notes obtained. The « Analysis » output lists the events with their start, their duration and the division that carries them.\n\nThe message gives the number of notes, the number of rests, the total duration and the number of groups that are not binary divisions.",
    entrees: [
      { nom: "Arbre", nomEn: "Tree", type: "texte", requis: false },
      { nom: "Hauteurs", nomEn: "Pitches", type: "texte", requis: false },
      { nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: false },
    ],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Arbre", nomEn: "Tree", type: "texte", defaut: ARBRE_DEFAUT, defautEn: ARBRE_DEFAUT,
        doc: "Le rythme en notation de listes, employé quand l'entrée du même nom n'est pas branchée.",
        docEn: "The rhythm in list notation, used when the input of the same name is not connected." },
      { nom: "Hauteurs", nomEn: "Pitches", type: "texte", defaut: "60 62 64 65 67", defautEn: "60 62 64 65 67",
        doc: "Les numéros MIDI employés, lus en boucle, quand aucune entrée ne les fournit.",
        docEn: "The MIDI numbers used, read in a loop, when no input supplies them." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une noire.", docEn: "The length of a quarter note." },
      { nom: "Répétitions", nomEn: "Repeats", plage: [1, 16], pas: 1, defaut: 1,
        doc: "Combien de fois l'arbre entier est rejoué, bout à bout.",
        docEn: "How many times the whole tree is played again, end to end." },
      { nom: "Nuance", nomEn: "Velocity", plage: [1, 127], pas: 1, defaut: 90,
        doc: "La vélocité des notes.", docEn: "The velocity of the notes." },
    ],
    async executer(ctx: any) {
      const arbreEntree = ctx.entree(0);
      const texte = typeof arbreEntree === "string" && arbreEntree.trim().length > 0
        ? arbreEntree
        : ctx.paramTexte("Arbre", ARBRE_DEFAUT);
      let mesures;
      try {
        mesures = lireArbre(texte);
      } catch (err: any) {
        return { valeurs: [null, null], erreur: true, message: String(err?.message ?? err) };
      }
      if (mesures.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "The tree is empty." : "L'arbre est vide.",
        };
      }

      // D'OÙ VIENNENT LES HAUTEURS, ET LE MESSAGE LE DIT. Trois sources possibles se recouvrent, et
      // rien à l'écran ne dirait laquelle a servi : c'est exactement la confusion qui a coûté deux
      // écoutes sur le paquet de bruitage et sur la SoundFont.
      const hauteursTexte = ctx.entree(1);
      const sequenceEntree = ctx.entree(2);
      let hauteurs: number[];
      let provenance: string;
      if (typeof hauteursTexte === "string" && lireHauteurs(hauteursTexte).length > 0) {
        hauteurs = lireHauteurs(hauteursTexte);
        provenance = en() ? "pitches input" : "entrée Hauteurs";
      } else if (estSequence(sequenceEntree) && sequenceEntree.notes.length > 0) {
        hauteurs = sequenceEntree.notes.map((n) => n.note);
        provenance = en() ? "sequence input" : "entrée Séquence";
      } else {
        hauteurs = lireHauteurs(ctx.paramTexte("Hauteurs", "60 62 64 65 67"));
        provenance = en() ? "setting" : "réglage";
      }
      if (hauteurs.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable pitch." : "Aucune hauteur exploitable.",
        };
      }

      const tempo = ctx.paramNombre("Tempo", 120);
      const repetitions = Math.max(1, Math.round(ctx.paramNombre("Répétitions", 1)));
      const velocite = Math.round(ctx.paramNombre("Nuance", 90));
      const uneFois = derouler(mesures, tempo);
      const duree = dureeArbre(mesures, tempo);
      const notes: Sequence["notes"] = [];
      const lignes: string[] = [];
      let rang = 0;
      for (let r = 0; r < repetitions; r++) {
        for (const e of uneFois) {
          const debut = e.debut + r * duree;
          if (e.silence) {
            if (r === 0) lignes.push(`${debut.toFixed(3)}  ${e.duree.toFixed(3)}  ${en() ? "rest" : "silence"}`);
            continue;
          }
          const hauteur = hauteurs[rang % hauteurs.length];
          rang++;
          notes.push({ note: hauteur, velocite, debut, fin: debut + e.duree });
          if (r === 0) {
            const division = e.nolet > 0 ? `  ${en() ? "tuplet" : "n-olet"} ${e.nolet}` : "";
            lignes.push(`${debut.toFixed(3)}  ${e.duree.toFixed(3)}  ${nomNote(hauteur)}${division}`);
          }
        }
      }

      const silences = uneFois.filter((e) => e.silence).length * repetitions;
      const nolets = new Set(uneFois.filter((e) => e.nolet > 0).map((e) => e.groupe)).size;
      // LA DURÉE EST DITE, ET NON DÉDUITE DE LA DERNIÈRE NOTE. Un arbre qui se termine par un
      // silence dure plus longtemps que sa dernière note ; sans ce champ, le rendu s'arrêtait à
      // celle-ci et le silence final disparaissait du son.
      const sequence: Sequence = { notes, tempo, duree: duree * repetitions, titre: texte };
      const entete = `${mesures.length} ${en() ? "measures" : "mesures"} · ${(duree * repetitions).toFixed(2)} s · ${tempo} BPM · ${provenance}`;
      return {
        valeurs: [sequence, [entete, "", ...lignes].join("\n")],
        message: `${notes.length} notes · ${silences} ${en() ? "rests" : "silences"} · `
          + `${(duree * repetitions).toFixed(2)} s · ${nolets} ${en() ? "irregular groups" : "groupes irréguliers"} · ${provenance}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
