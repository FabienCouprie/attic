// plugins/boucle-creneau.ts — Une boîte qui CALCULE sa valeur en connaissant sa place.
//
// CE QUE C'EST : LA SECONDE MOITIÉ DE LA MAQUETTE. Le nœud « Maquette » pose des séquences déjà
// calculées sur une ligne de temps, et une boîte s'y ADAPTE à sa place sans s'y recalculer. La
// difficulté restante, que `COMPOSITION-ASSISTEE.md` donnait pour le point le plus dur, était qu'une
// boîte calcule sa valeur en connaissant sa place : dans un graphe acyclique, une valeur remonte
// d'amont en aval sans jamais consulter l'aval, donc le contenu d'une boîte ne peut pas savoir où
// il sera posé.
//
// LA BOUCLE LE RÉSOUT, ET SANS RIEN CHANGER AU MOTEUR. Ce qui est posé entre le début et la fin est
// le CONTENU d'une boîte, et il est exécuté une fois par créneau. Le début publie le créneau de la
// passe en cours, que la chaîne peut lire ; la fin plie ce qu'elle reçoit à ce créneau et réunit
// tout. Le contenu ne consulte donc pas l'aval : il reçoit sa place en amont, ce qui est la même
// chose vue du bon côté.
//
// LA FIN PLIE, ET C'EST CE QUI FAIT LA MAQUETTE. La largeur d'une boîte s'impose à ce qu'elle
// porte : une chaîne qui produit deux secondes de musique pour un créneau de six sort étirée trois
// fois. Sans cela, le créneau ne serait qu'une étiquette et la boîte n'aurait pas de largeur.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type InfoVoix, type Sequence } from "../audio/sequence";
import { poserMaquette, type Bloc } from "../audio/maquette";
import { deployer, lireChamp } from "../audio/matrice-parametres";
import {
  boucleDeLaFin, boucleDuDebut, decouvrirPour, FICHE_CRENEAU_DEBUT, FICHE_CRENEAU_FIN, morceauPour, recolterPour,
} from "./boucleSequencesGlobal";

const en = () => langueCourante() === "en";

/** Un créneau voyage comme une séquence d'une note : le mécanisme de boucle n'en connaît qu'une. */
const creneauEnSequence = (debut: number, duree: number, tempo: number): Sequence => ({
  notes: [{ note: 60, velocite: 90, debut, fin: debut + Math.max(1e-6, duree) }],
  tempo, duree: debut + Math.max(1e-6, duree),
});

export const fiches: FicheAudio[] = ([
  {
    id: FICHE_CRENEAU_DEBUT,
    nom: "Début de boucle par créneau", nomEn: "Slot Loop Start",
    univers: "Traitement", famille: "Montage",
    resume: "Ouvre une boucle : ce qui suit est calculé une fois par créneau, et connaît la place qu'il occupera.",
    resumeEn: "Opens a loop: what follows is computed once per slot, and knows the place it will occupy.",
    notice: "Ouvre une boucle sur des créneaux : ce qui est posé entre ce composant et « Fin de boucle par créneau » est calculé une fois par créneau, et rend une séquence que la fin pose à sa place.\n\nCe composant rend une séquence d'une seule note qui couvre le créneau de la passe en cours : son début est celui du créneau et sa durée celle du créneau. C'est par elle que la chaîne apprend où elle sera posée, et une formule sur séquence y lit « debut », « duree », « i » le rang du créneau et « n » leur nombre.\n\n« Créneaux » fixe leur nombre. « Départs » et « Durées » les décrivent, de trois façons : un nombre seul vaut pour tous, une suite de nombres donne les premières valeurs et la dernière se répète, et deux nombres séparés par deux points font une rampe droite du premier au second.\n\n« Tempo » est porté par la séquence rendue, pour que la chaîne en dispose.\n\nLa sortie « Créneau » rend la note qui couvre le créneau en cours. Le message donne le rang du créneau, son instant et sa durée.",
    noticeEn: "Opens a loop over slots: what is laid between this node and « Slot Loop End » is computed once per slot, and returns a sequence that the end lays in its place.\n\nThis node returns a single-note sequence covering the slot of the current pass: its onset is that of the slot and its length that of the slot. It is by that note that the chain learns where it will be laid, and a formula on sequence reads « debut », « duree », « i » the rank of the slot and « n » their number.\n\n« Slots » sets their number. « Onsets » and « Lengths » describe them, in three ways: a single number holds for all, a series of numbers gives the first values and the last repeats, and two numbers separated by a colon make a straight ramp from the first to the second.\n\n« Tempo » is carried by the returned sequence, so that the chain has it.\n\nThe « Slot » output returns the note covering the current slot. The message gives the rank of the slot, its instant and its length.",
    entrees: [],
    sorties: [{ nom: "Créneau", nomEn: "Slot", type: "sequence" }],
    parametres: [
      { nom: "Créneaux", nomEn: "Slots", plage: [1, 32], pas: 1, defaut: 4,
        doc: "Combien de créneaux, donc combien de fois la chaîne est calculée.",
        docEn: "How many slots, hence how many times the chain is computed." },
      { nom: "Départs", nomEn: "Onsets", type: "texte", defaut: "0:6", defautEn: "0:6",
        doc: "Les instants des créneaux. Un nombre, une suite, ou une rampe écrite « de:à ».",
        docEn: "The instants of the slots. A number, a series, or a ramp written « from:to »." },
      { nom: "Durées", nomEn: "Lengths", type: "texte", defaut: "2", defautEn: "2",
        doc: "Les durées des créneaux, écrites de la même façon.",
        docEn: "The lengths of the slots, written the same way." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo porté par la séquence rendue.",
        docEn: "The tempo carried by the returned sequence." },
    ],
    async executer(ctx: any) {
      const combien = Math.max(1, Math.round(ctx.paramNombre("Créneaux", 4)));
      const tempo = ctx.paramNombre("Tempo", 120);
      const depart = lireChamp(ctx.paramTexte("Départs", "0:6"));
      const duree = lireChamp(ctx.paramTexte("Durées", "2"));
      const debuts = depart ? deployer(depart, combien) : new Array(combien).fill(0);
      const durees = duree ? deployer(duree, combien) : new Array(combien).fill(1);

      // LA DÉCOUVERTE SE FAIT ICI, comme pour les voix : le pilote lance une passe et lit ce qui a
      // été trouvé. Les créneaux viennent de réglages, mais le pilote ne lit pas les réglages des
      // nœuds ; c'est le nœud qui les lui dit, et le chemin est le même pour toutes les boucles.
      decouvrirPour(ctx.noeud.id, debuts.map((d, i) => creneauEnSequence(d, durees[i], tempo)));

      const b = boucleDuDebut(ctx.noeud.id);
      const courant = morceauPour(ctx.noeud.id) ?? creneauEnSequence(debuts[0], durees[0], tempo);
      const rang = b?.index ?? 0;
      const total = b?.morceaux.length ?? combien;
      const note = courant.notes[0];
      return {
        valeurs: [courant],
        message: `${en() ? "slot" : "créneau"} ${rang + 1}/${total} · `
          + `${note.debut.toFixed(2)} s · ${(note.fin - note.debut).toFixed(2)} s`,
      };
    },
  },
  {
    id: FICHE_CRENEAU_FIN,
    nom: "Fin de boucle par créneau", nomEn: "Slot Loop End",
    univers: "Traitement", famille: "Montage",
    resume: "Referme une boucle par créneau : chaque passe est pliée à son créneau, puis toutes sont réunies.",
    resumeEn: "Closes a slot loop: each pass is folded to its slot, then all are reunited.",
    notice: "Referme une boucle par créneau et rend une séquence où ce que chaque passe a produit occupe son créneau.\n\nCe que la passe rend est posé au début du créneau et, quand « Plier » le demande, étiré ou resserré pour en occuper exactement la durée. Les départs et les longueurs des notes sont multipliés par un même facteur, donc les rapports du rythme sont gardés et c'est la pulsation qui change.\n\nC'est ce pliage qui donne une largeur à la boîte. Sans lui le créneau ne serait qu'une étiquette, et ce que la chaîne a produit déborderait ou laisserait un vide.\n\n« Plier » à « Non » laisse chaque passe à sa durée propre, posée au début de son créneau ; deux passes peuvent alors se recouvrir.\n\n« Une voix par créneau » donne à chaque passe son propre numéro de voix, ce qui grave autant de portées qu'il y a de créneaux. Sans ce réglage, tout se fond en une seule ligne.\n\nLes passes intermédiaires rendent ce qu'elles ont reçu, non la réunion : tant que la boucle tourne, la réunion n'existe pas encore.\n\nLa sortie « Séquence » porte la réunion. Le message donne le rang de la passe, et à la dernière le nombre de créneaux remplis et la durée totale.",
    noticeEn: "Closes a slot loop and returns a sequence in which what each pass produced occupies its slot.\n\nWhat the pass returns is laid at the start of the slot and, when « Fold » asks for it, stretched or compressed to occupy exactly its length. The onsets and lengths of the notes are multiplied by one same factor, so the ratios of the rhythm are kept and it is the pulse that changes.\n\nIt is this folding that gives the box a width. Without it the slot would be a mere label, and what the chain produced would overflow or leave a gap.\n\n« Fold » set to « No » leaves each pass at its own length, laid at the start of its slot; two passes may then overlap.\n\n« One voice per slot » gives each pass its own voice number, which engraves as many staves as there are slots. Without this setting, everything merges into a single line.\n\nThe intermediate passes return what they received, not the reunion: as long as the loop runs, the reunion does not yet exist.\n\nThe « Sequence » output carries the reunion. The message gives the rank of the pass, and at the last one the number of slots filled and the total length.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [
      { nom: "Plier", nomEn: "Fold", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Étire ou resserre ce que la passe rend pour qu'il occupe exactement la durée de son créneau.",
        docEn: "Stretches or compresses what the pass returns so that it occupies exactly the length of its slot." },
      { nom: "Une voix par créneau", nomEn: "One voice per slot", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Donne à chaque passe son propre numéro de voix, ce qui grave autant de portées qu'il y a de créneaux.",
        docEn: "Gives each pass its own voice number, which engraves as many staves as there are slots." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree)) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }
      recolterPour(ctx.noeud.id, entree);

      const b = boucleDeLaFin(ctx.noeud.id);
      if (!b) {
        return {
          valeurs: [entree],
          message: en() ? "no loop open, passed through" : "aucune boucle ouverte, laissé tel quel",
        };
      }
      if (b.index < b.morceaux.length - 1) {
        return {
          valeurs: [entree],
          message: `${en() ? "pass" : "passe"} ${b.index + 1}/${b.morceaux.length}`,
        };
      }

      const plier = ctx.paramTexte("Plier", "oui") !== "non";
      const enVoix = ctx.paramTexte("Une voix par créneau", "non") === "oui";
      const blocs: Bloc[] = [];
      b.morceaux.forEach((creneau, i) => {
        const produite = b.recoltes[i];
        if (!produite || produite.notes.length === 0) return;
        const note = creneau.notes[0];
        blocs.push({
          sequence: produite,
          debut: note.debut,
          // LE CRÉNEAU IMPOSE SA LARGEUR, et c'est là que la boîte prend son sens : `poserMaquette`
          // étire dans le rapport de la durée demandée sur la durée propre.
          duree: plier ? note.fin - note.debut : 0,
          nom: `${en() ? "Slot" : "Créneau"} ${i + 1}`,
        });
      });
      if (blocs.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Every pass came back empty." : "Toutes les passes sont revenues vides.",
        };
      }

      const { sequence, blocs: poses } = poserMaquette(blocs, { enVoix });
      const infos: InfoVoix[] = enVoix
        ? poses.map((p, i) => ({ numero: i, nom: blocs[i].nom }))
        : [];
      const sortie: Sequence = enVoix ? { ...sequence, voix: infos } : sequence;
      const etires = poses.filter((p) => Math.abs(p.facteur - 1) > 1e-9).length;
      return {
        valeurs: [sortie],
        message: `${blocs.length} ${en() ? "slots filled" : "créneaux remplis"} · `
          + `${sortie.notes.length} notes · ${dureeSequence(sortie).toFixed(2)} s`
          + (etires > 0 ? ` · ${etires} ${en() ? "folded" : "pliés"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
