// ui/hooks/useJournalDeSession.ts — Le journal de session : le travail en cours survit à une fermeture.
//
// SORTI DE `ui/hooks/usePersistance.ts` le 2026-11-09, deuxième pièce de son découpage (lot 2 de la
// revue d'architecture du 2026-10-31). C'est le bloc du journal, recopié ligne pour ligne : la
// référence vers `memoriserEncours`, le journal créé une seule fois, et ses deux effets. Le crochet
// l'appelle à la place exacte du bloc : l'ordre des crochets de React ne change donc pas.
//
// IL NE LIT QUE CE QU'IL REÇOIT : `memoriserEncours`, qui reste au crochet parce que le bouton
// « Recharger » l'appelle aussi, et quatre options. Il n'écrit rien dans React ; l'en-cours passe
// par `memoriserEncours`. La règle qu'il applique vit dans `ui/journal-de-session.ts`, où elle
// s'éprouve.
import { useEffect, useRef } from "react";
import { creerJournalDeSession, type JournalDeSession } from "../journal-de-session";

/** Ce que le journal lit du crochet : le graphe, la racine quand on est dans un méta, et le fichier courant. */
export interface OptionsJournalDeSession {
  nodes: readonly unknown[];
  edges: readonly unknown[];
  grapheRacineRef: { readonly current: { nodes: readonly unknown[] } | null };
  currentFilePath: string | null;
}

export function useJournalDeSession(memoriserEncours: (partage?: boolean) => boolean, o: OptionsJournalDeSession): void {
  // ═══ LE JOURNAL DE SESSION : LE TRAVAIL EN COURS SURVIT À UNE FERMETURE ═══
  //
  // RELEVÉ PAR UNE REVUE DU DÉPÔT, point 9, et vérifié plus grave que décrit. `memoriserEncours`
  // de `usePersistance` n'était appelé QUE par le bouton « Recharger » ; il n'y avait ni
  // `beforeunload`, ni `pagehide`, ni minuteur, et côté Electron `window-all-closed` appelle
  // `app.quit()` sans rien demander au rendu. Ce n'était donc pas seulement un plantage : fermer la
  // fenêtre proprement perdait tout depuis le dernier enregistrement manuel.
  //
  // LA RÈGLE QUI PROTÈGE LA SESSION VIT DANS `ui/journal-de-session.ts`, avec ses neuf cas, et c'est
  // celle de l'ARMEMENT : la restauration de `attic-encours` se fait dans un effet ASYNCHRONE, donc
  // le graphe est vide au montage. Un journal qui écrirait au premier changement remplacerait la
  // session par du vide. Il ne s'arme donc que sur un graphe non vide.
  // `memoriserEncours` change d'identité à chaque rendu ; le journal, lui, est créé une seule fois.
  // Sans cette indirection, il écrirait avec la version de `buildExportData` du premier rendu —
  // c'est-à-dire avec le graphe d'alors.
  const memoriserEncoursRef = useRef(memoriserEncours);
  memoriserEncoursRef.current = memoriserEncours;
  const journalRef = useRef<JournalDeSession | null>(null);
  if (!journalRef.current) {
    journalRef.current = creerJournalDeSession({
      ecrire: () => memoriserEncoursRef.current(),
      ecrirePourSoi: () => { memoriserEncoursRef.current(false); },
      // ON N'ÉCRASE QUE CE QU'ON A ÉCRIT SOI-MÊME, et le module dit pourquoi : une seconde fenêtre,
      // ou une page qui pose un en-cours puis recharge, se faisait écraser par le vidage de
      // fermeture. Une date postérieure à notre dernier changement vient d'ailleurs ; une ABSENCE
      // de date aussi, puisque `memoriserEncours` en pose toujours une.
      ecritPourAutrui: (depuis) => {
        try {
          const brut = localStorage.getItem("attic-encours");
          if (!brut) return false;
          const quand = Date.parse((JSON.parse(brut) as { date?: string }).date ?? "");
          return !Number.isFinite(quand) || quand > depuis;
        } catch { return false; }
      },
    });
  }
  const journal = journalRef.current;

  useEffect(() => {
    const vide = (o.grapheRacineRef.current?.nodes ?? o.nodes).length === 0;
    if (!journal.estArme()) {
      // RIEN À PERDRE SUR UN CANEVAS VIDE, et tout à perdre si l'on écrit avant la restauration.
      if (vide) return;
      journal.armer();
    }
    journal.noter();
    // LE FICHIER COURANT EN EST AUSSI : détacher un projet ne change aucun nœud, et l'en-cours
    // partagé garderait sinon le chemin quitté, que le lancement suivant rattacherait au graphe.
  }, [o.nodes, o.edges, o.grapheRacineRef, journal, o.currentFilePath]);

  useEffect(() => {
    // LES DEUX ÉVÉNEMENTS, et non un seul. `beforeunload` ne part pas toujours quand le processus
    // principal détruit la fenêtre ; `pagehide` est le plus fiable des deux. Vider deux fois ne
    // coûte rien : la seconde ne trouve plus rien en attente.
    const vider = () => journal.vider();
    window.addEventListener("beforeunload", vider);
    window.addEventListener("pagehide", vider);
    return () => {
      window.removeEventListener("beforeunload", vider);
      window.removeEventListener("pagehide", vider);
      journal.annuler();
    };
  }, [journal]);
}
