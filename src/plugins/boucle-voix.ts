// plugins/boucle-voix.ts — Les deux nœuds qui encadrent une boucle sur les voix.
//
// LA FORME EST CELLE DES TROIS AUTRES RÉPÉTITIONS DU PROJET, et ce n'est pas un hasard : un début
// et une fin qui encadrent une chaîne quelconque. Ce qui change est la SOURCE du compte. La boucle
// de graphe et l'instrument le lisent dans un paramètre, la boucle de collection dans un dossier ;
// celle-ci le lit dans ce qui arrive par un câble, ce qui ne se connaît qu'après l'exécution de
// l'amont. Voir `plugins/boucleSequencesGlobal.ts` pour la façon dont le pilote s'y prend.
//
// POURQUOI LES VOIX EN PREMIER. Parce que la polyphonie existe désormais et que rien ne permettait
// d'y traiter une ligne autrement qu'une autre : il fallait extraire, transformer, réunir, une
// branche par voix, en sachant leur nombre d'avance. Le mécanisme, lui, ne sait rien des voix : il
// itère sur une liste de séquences, et un autre début de boucle découperait par mesure ou par
// accord sans qu'il y ait une ligne à changer ici.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type InfoVoix, type Sequence } from "../audio/sequence";
import { extraireVoix, reunirVoix, voixDe } from "../audio/voix";
import {
  boucleDeLaFin, boucleDuDebut, decouvrirPour, FICHE_BOUCLE_DEBUT, FICHE_BOUCLE_FIN, morceauPour, recolterPour,
} from "./boucleSequencesGlobal";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: FICHE_BOUCLE_DEBUT,
    nom: "Début de boucle par voix", nomEn: "Voice Loop Start",
    univers: "Traitement", famille: "Conversion",
    resume: "Ouvre une boucle : le graphe est exécuté une fois par voix, et ce composant rend la voix de la passe en cours.",
    resumeEn: "Opens a loop: the graph is run once per voice, and this node returns the voice of the current pass.",
    notice: "Ouvre une boucle sur les voix de la séquence reçue : le graphe est exécuté une fois par voix, et ce composant rend la voix de la passe en cours, sous la forme d'une séquence ordinaire.\n\nCe qui est posé entre ce composant et « Fin de boucle par voix » s'applique donc à chaque voix séparément, et la fin les réunit. Sans cette boucle, il faudrait extraire chaque voix, la traiter sur sa propre branche et les réunir, en connaissant leur nombre d'avance.\n\nLe nombre de passes n'est pas réglé : il est celui des voix de la séquence reçue, et il n'est connu qu'une fois l'amont exécuté. La première passe le découvre, les suivantes le répètent.\n\nLa voix rendue est une séquence d'une seule voix : ses notes perdent leur numéro, qui n'aurait plus de sens hors de la polyphonie d'où elles viennent, et son écriture mesurée la suit quand elle en porte une.\n\nUne séquence qui ne déclare aucune voix en compte une, et la boucle fait alors une seule passe.\n\nLa sortie « Séquence » rend la voix de la passe en cours. Le message donne le rang de la passe et le nombre de voix.",
    noticeEn: "Opens a loop over the voices of the received sequence: the graph is run once per voice, and this node returns the voice of the current pass, as an ordinary sequence.\n\nWhat is laid between this node and « Voice Loop End » therefore applies to each voice separately, and the end reunites them. Without this loop, one would have to extract each voice, treat it on its own branch and reunite them, knowing their number in advance.\n\nThe number of passes is not set: it is that of the voices of the received sequence, and it is known only once the upstream has run. The first pass discovers it, the following ones repeat it.\n\nThe voice returned is a single-voice sequence: its notes lose their number, which would no longer mean anything outside the polyphony they come from, and its written rhythm follows it when it carries one.\n\nA sequence that declares no voice counts as one, and the loop then makes a single pass.\n\nThe « Sequence » output returns the voice of the current pass. The message gives the rank of the pass and the number of voices.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }

      // LA DÉCOUVERTE SE FAIT ICI, à la première passe : c'est le seul endroit du graphe qui voie
      // la séquence entière, et le pilote lit ensuite ce qui a été trouvé.
      const morceaux = voixDe(entree)
        .map((v) => extraireVoix(entree, v.numero))
        .filter((s): s is Sequence => s !== null);
      decouvrirPour(ctx.noeud.id, morceaux);

      const b = boucleDuDebut(ctx.noeud.id);
      const courant = morceauPour(ctx.noeud.id) ?? morceaux[0] ?? null;
      if (!courant) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No voice found." : "Aucune voix trouvée.",
        };
      }
      const combien = b?.morceaux.length ?? morceaux.length;
      const rang = b?.index ?? 0;
      return {
        valeurs: [courant],
        message: `${en() ? "voice" : "voix"} ${rang + 1}/${combien} · ${courant.notes.length} notes`
          + (courant.titre ? ` · ${courant.titre}` : ""),
      };
    },
  },
  {
    id: FICHE_BOUCLE_FIN,
    nom: "Fin de boucle par voix", nomEn: "Voice Loop End",
    univers: "Traitement", famille: "Conversion",
    resume: "Referme une boucle par voix et réunit ce que chaque passe a produit.",
    resumeEn: "Closes a voice loop and reunites what each pass produced.",
    notice: "Referme une boucle par voix et rend une séquence où ce que chaque passe a produit devient une voix.\n\nChaque passe dépose ici sa séquence ; à la dernière, toutes sont réunies et numérotées dans l'ordre des passes. Une passe qui ne rend rien laisse sa place vide, et la voix correspondante disparaît plutôt que de faire une portée muette.\n\nLes passes intermédiaires rendent ce qu'elles ont reçu, non la réunion : tant que la boucle tourne, la réunion n'existe pas encore. Ce qui est branché en aval ne voit donc la polyphonie entière qu'à la dernière passe.\n\nLe tempo retenu est celui de la première voix qui en déclare un, et la durée est la plus longue des durées reçues.\n\nLa sortie « Séquence » porte la réunion. Le message donne le rang de la passe, et à la dernière le nombre de voix réunies.",
    noticeEn: "Closes a voice loop and returns a sequence in which what each pass produced becomes a voice.\n\nEach pass deposits its sequence here; at the last one, all are reunited and numbered in the order of the passes. A pass that returns nothing leaves its place empty, and the corresponding voice disappears rather than making a silent staff.\n\nThe intermediate passes return what they received, not the reunion: as long as the loop runs, the reunion does not yet exist. What is connected downstream therefore sees the whole polyphony only at the last pass.\n\nThe tempo retained is that of the first voice to declare one, and the length is the longest of those received.\n\nThe « Sequence » output carries the reunion. The message gives the rank of the pass, and at the last one the number of voices reunited.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [],
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
        // HORS D'UNE BOUCLE, ce nœud laisse passer ce qu'il reçoit. C'est le cas d'un graphe où la
        // fin est posée sans son début : mieux vaut une séquence intacte qu'un nœud muet dont la
        // cause se chercherait en aval.
        return {
          valeurs: [entree],
          message: en() ? "no loop open, passed through" : "aucune boucle ouverte, laissé tel quel",
        };
      }

      const derniere = b.index >= b.morceaux.length - 1;
      if (!derniere) {
        return {
          valeurs: [entree],
          message: `${en() ? "pass" : "passe"} ${b.index + 1}/${b.morceaux.length}`,
        };
      }

      const recueillies = b.recoltes.filter((s): s is Sequence => !!s && s.notes.length > 0);
      if (recueillies.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Every pass came back empty." : "Toutes les passes sont revenues vides.",
        };
      }
      const { sequence, tempoDivergent } = reunirVoix(recueillies.map((s) => ({ sequence: s })));
      const infos: InfoVoix[] = (sequence.voix ?? []).map((v, i) => ({
        ...v, nom: v.nom ?? `${en() ? "Voice" : "Voix"} ${i + 1}`,
      }));
      return {
        valeurs: [{ ...sequence, voix: infos } as Sequence],
        message: `${recueillies.length} ${en() ? "voices reunited" : "voix réunies"} · `
          + `${sequence.notes.length} notes · ${dureeSequence(sequence).toFixed(2)} s`
          + (tempoDivergent > 0
            ? ` · ${tempoDivergent} ${en() ? "at another tempo" : "à un autre tempo"}`
            : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
