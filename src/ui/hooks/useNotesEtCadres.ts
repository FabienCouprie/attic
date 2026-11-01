// ui/hooks/useNotesEtCadres.ts — Poser une note ou un cadre : un clic sur la barre, puis un clic sur le canevas.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même état d'attente, mêmes dimensions, même
// touche Échap. Les deux éléments décoratifs ne calculent rien et ne se relient à rien ; ce qui
// reste à `App.tsx` est de passer `pendingAdd` au canevas, qui change de curseur tant qu'un
// placement attend.
//
// LE CLIC SUR LE CANEVAS EST LE MÊME GESTE QUE DÉSÉLECTIONNER : `onPaneClick` pose l'élément en
// attente s'il y en a un, et sinon vide la sélection, comme avant la sortie.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { idUnique } from "../ids";

export interface OptionsNotesEtCadres {
  noeudsRef: MutableRefObject<{ id: string }[]>;
  rfInstanceRef: MutableRefObject<any>;
  /** Les gestionnaires attachés au `data` de chaque nœud, définis une seule fois dans App. */
  callbacksNoeudRef: MutableRefObject<(() => Record<string, unknown>) | null>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setSel: (n: null) => void;
}

export function useNotesEtCadres({ noeudsRef, rfInstanceRef, callbacksNoeudRef, setNodes, setSel }: OptionsNotesEtCadres) {
  // Placement des éléments décoratifs (note / cadre) : après un clic sur la barre
  // d'outils, le prochain clic sur le canevas pose l'élément à l'endroit cliqué.
  const [pendingAdd, setPendingAdd] = useState<null | "comment" | "frame">(null);
  const pendingAddRef = useRef(pendingAdd);
  pendingAddRef.current = pendingAdd;

  const ajouterCommentaire = useCallback(() => {
    setPendingAdd("comment");
  }, []);

  const ajouterCadre = useCallback(() => {
    setPendingAdd("frame");
  }, []);

  const creerCommentaire = useCallback((position: { x: number; y: number }) => {
    setNodes((nds) => [...nds, {
      id: idUnique(noeudsRef.current),
      type: "atelier",
      position,
      width: 180,
      height: 100,
      data: {
        ficheId: "comment",
        parametres: {},
        statut: "attente",
        // AUCUN TEXTE POSÉ DANS LA DONNÉE : « Ajouter une note » y était écrit à la création, donc
        // figé dans la langue du moment. L'invite du champ, elle, suit la langue.
        ...(callbacksNoeudRef.current?.()),
      },
    }]);
  }, [setNodes]);

  const creerCadre = useCallback((position: { x: number; y: number }) => {
    setNodes((nds) => {
      const nouveau = {
        id: idUnique(noeudsRef.current),
        type: "atelier" as const,
        position,
        width: 320,
        height: 200,
        data: {
          ficheId: "frame",
          parametres: {},
          statut: "attente",
          // AUCUN NOM POSÉ DANS LA DONNÉE : « Ajouter un cadre » y était écrit à la création, donc
          // figé dans la langue du moment. L'invite du champ, elle, suit la langue.
          couleur: "rgba(120,120,120,0.12)",
          ...(callbacksNoeudRef.current?.()),
        },
      };
      return [nouveau, ...nds];
    });
  }, [setNodes]);

  const onPaneClick = useCallback((e: React.MouseEvent) => {
    const type = pendingAddRef.current;
    if (type && rfInstanceRef.current) {
      // Même correctif qu'au dépôt : des coordonnées client, sans retirer l'enveloppe.
      const position = rfInstanceRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setPendingAdd(null);
      if (type === "comment") {
        creerCommentaire(position);
      } else {
        creerCadre(position);
      }
      return;
    }
    setSel(null);
  }, [creerCommentaire, creerCadre]);

  // Échap annule un placement de note/cadre en attente.
  useEffect(() => {
    if (!pendingAdd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingAdd(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingAdd]);

  return { pendingAdd, ajouterCommentaire, ajouterCadre, onPaneClick };
}
