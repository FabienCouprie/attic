// ui/hooks/useFiletGlissement.ts — Décrocher un nœud resté collé au curseur.
//
// Extrait de `App.tsx` au découpage de l'atelier, sans qu'une ligne change. Il ne dépend que de deux
// références : celle qui dit si le bouton est enfoncé, et celle du conteneur de React Flow.
import { useEffect, type RefObject } from "react";
import { libererGlissement, relachementManque } from "../liberer-glissement";

export interface OptionsFiletGlissement {
  /** Vrai tant que le bouton principal est enfoncé, au su de la fenêtre. */
  pointerDownRef: RefObject<boolean>;
  /** Le conteneur de React Flow : c'est son `view` dont d3-drag a besoin pour se désabonner. */
  rfRef: RefObject<HTMLDivElement | null>;
}

export function useFiletGlissement({ pointerDownRef, rfRef }: OptionsFiletGlissement) {
  // Si le bouton souris est relâché sans que la fenêtre le voie — second écran, Alt-Tab, menu
  // système, fenêtre qui perd le focus pendant le geste —, le nœud reste accroché au curseur : rien
  // ne vient clore le glissement. Le défaut est rare parce qu'il demande ce concours de
  // circonstances, mais il est bien réel.
  //
  // CE FILET A ÉTÉ REFAIT, l'ancien ne pouvant pas fonctionner, pour deux raisons vérifiées dans la
  // source de `d3-drag` — la bibliothèque par laquelle React Flow glisse :
  //
  //  1. il envoyait `pointerup` et `pointercancel`. Or d3-drag ne termine un geste que sur
  //     **mouseup** : `select(event.view).on("mouseup.drag", mouseupped, …)`. On envoyait donc un
  //     événement que personne n'écoutait. Voir `liberer-glissement.ts`, qui envoie le bon, avec le
  //     `view` dont d3 a besoin pour se désabonner.
  //  2. il s'armait sur un `pointerdown` écouté en phase de BULLE. Une quinzaine de vues d'Attic
  //     arrêtent la propagation de cet événement pour ne pas déclencher le glissement du nœud ; le
  //     filet restait donc DÉSARMÉ précisément sur les nœuds à forme d'onde, à séquenceur ou à
  //     lecteur audio — ceux sur lesquels on clique le plus. D'où l'écoute en CAPTURE ci-dessous.
  //
  // Deux déclencheurs valent mieux qu'un : le mouvement sans bouton, qui attrape le retour du
  // curseur dans la fenêtre, et la perte de focus, qui libère sans attendre ce retour.
  useEffect(() => {
    const capture = { capture: true } as const;
    const derniere = { clientX: 0, clientY: 0, pointerId: 1, pointerType: "mouse" };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      pointerDownRef.current = true;
      derniere.clientX = e.clientX; derniere.clientY = e.clientY;
      derniere.pointerId = e.pointerId; derniere.pointerType = e.pointerType;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.isPrimary) pointerDownRef.current = false;
    };
    const liberer = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      libererGlissement(rfRef.current ?? window, derniere);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.isPrimary === false) return;
      derniere.clientX = e.clientX; derniere.clientY = e.clientY;
      derniere.pointerId = e.pointerId; derniere.pointerType = e.pointerType;
      if (relachementManque(pointerDownRef.current, e.buttons)) liberer();
    };

    window.addEventListener("pointerdown", onPointerDown, capture);
    window.addEventListener("pointerup", onPointerUp, capture);
    window.addEventListener("pointercancel", onPointerUp, capture);
    window.addEventListener("pointermove", onPointerMove, capture);
    window.addEventListener("blur", liberer);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, capture);
      window.removeEventListener("pointerup", onPointerUp, capture);
      window.removeEventListener("pointercancel", onPointerUp, capture);
      window.removeEventListener("pointermove", onPointerMove, capture);
      window.removeEventListener("blur", liberer);
    };
    // Le tableau vide est celui de l'original : les deux références de `useRef` sont stables d'un
    // rendu à l'autre, donc les nommer ici ne changerait rien, et ce déplacement ne change rien.
  }, []);
}
