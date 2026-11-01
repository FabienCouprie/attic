// ui/hooks/useMenuContextuel.ts — Le clic droit sur le canevas : ouvrir, développer ou clarifier une bulle.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même garde-fou contre le glissement, mêmes
// entrées, même seuil de quatre pixels. Les gestes eux-mêmes sont ceux de `useBulles` ; ce crochet
// ne fait que décider quelles entrées montrer et où.
//
// LE CLIC DROIT DÉPLACE DÉJÀ LE CANEVAS (`panOnDrag={[2]}`), et l'événement de menu arrive aussi au
// relâchement d'un glissement : sans ce garde-fou, déplacer la vue ouvrirait un menu à l'arrivée.
// On note où le bouton est descendu, et on n'ouvre que si rien n'a bougé.
//
// TROIS ENDROITS REÇOIVENT LE CLIC DROIT, et chacun a son entrée ici. Le nœud, par `onNodeContextMenu`.
// Le rectangle qu'un cadre de sélection pose DEVANT les nœuds pris, par `onSelectionContextMenu` : sans
// lui, ce clic n'allait nulle part, et « Clarifier » ne s'atteignait qu'après un Ctrl+clic. Le fond
// vide, par l'événement natif remonté jusqu'au canevas, et non par `onPaneContextMenu` : React Flow
// n'appelle celui-ci qu'au bout d'un déplacement de vue resté nul, et le moindre `mousemove` entre la
// descente et le relâchement en est un. Relevé le 2026-11-01 : sur le fond, aucun menu dès qu'un
// mouvement s'intercale, fût-il de zéro pixel, quand le nœud en tolère trois. Les trois passent
// désormais par le même seuil.
import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Node } from "@xyflow/react";

import { estBulle } from "../../core";
import { useI18n } from "../../i18n";
import type { EntreeMenu, EtatMenu } from "../MenuContextuel";

export interface OptionsMenuContextuel {
  noeudsRef: MutableRefObject<readonly { selected?: boolean }[]>;
  basculerRepli: (id: string) => void;
  developper: (id: string) => void;
  clarifier: () => void;
}

export function useMenuContextuel({ noeudsRef, basculerRepli, developper, clarifier }: OptionsMenuContextuel) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<EtatMenu | null>(null);
  const origineClicDroit = useRef<{ x: number; y: number } | null>(null);
  const surPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) origineClicDroit.current = { x: e.clientX, y: e.clientY };
  }, []);

  const surClicDroit = useCallback((e: React.MouseEvent, noeud?: Node) => {
    e.preventDefault();
    const o0 = origineClicDroit.current;
    origineClicDroit.current = null;
    if (o0 && Math.hypot(e.clientX - o0.x, e.clientY - o0.y) > 4) { setMenu(null); return; }
    const entrees: EntreeMenu[] = [];
    const bulle = noeud && estBulle((noeud.data as { ficheId?: string }).ficheId) ? noeud : undefined;
    if (bulle) {
      const replie = (bulle.data as { bulleOuverte?: boolean }).bulleOuverte !== true;
      entrees.push({
        cle: "ouvrir", libelle: t(replie ? "bulle.ouvrir" : "bulle.refermer"),
        titre: t("bulle.ouvrirTitle"), action: () => basculerRepli(bulle.id),
      });
      entrees.push({
        cle: "developper", libelle: t("bulle.developper"),
        titre: t("bulle.developperTitle"), action: () => developper(bulle.id),
      });
    } else if (noeudsRef.current.filter((n) => n.selected).length >= 2) {
      entrees.push({
        cle: "clarifier", libelle: t("bulle.clarifier"),
        titre: t("bulle.clarifierTitle"), action: clarifier,
      });
    }
    setMenu(entrees.length ? { x: e.clientX, y: e.clientY, entrees } : null);
  }, [t, basculerRepli, developper, clarifier]);

  /**
   * Le clic droit sur le rectangle d'une sélection faite au cadre : le même menu que sur le nœud que
   * le rectangle cache sous le pointeur, et celui du fond entre deux nœuds. Une bulle prise au cadre
   * s'ouvre donc encore.
   */
  const surClicDroitSelection = useCallback((e: React.MouseEvent, selection: Node[]) => {
    const ids = new Set(selection.map((n) => n.id));
    const vise = document.elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest(".react-flow__node")?.getAttribute("data-id"))
      .find((id) => id && ids.has(id));
    surClicDroit(e, selection.find((n) => n.id === vise));
  }, [surClicDroit]);

  /** Le fond vide, par l'événement natif : le nœud et le rectangle ont déjà leur entrée. */
  const surClicDroitFond = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).classList?.contains("react-flow__pane")) surClicDroit(e);
  }, [surClicDroit]);

  const fermerMenu = useCallback(() => setMenu(null), []);

  return { menu, fermerMenu, surPointerDown, surClicDroit, surClicDroitSelection, surClicDroitFond };
}
