// ui/hooks/useMenuContextuel.ts — Le clic droit sur le canevas : ouvrir, développer ou clarifier une bulle.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même garde-fou contre le glissement, mêmes
// entrées, même seuil de quatre pixels. Les gestes eux-mêmes sont ceux de `useBulles` ; ce crochet
// ne fait que décider quelles entrées montrer et où.
//
// LE CLIC DROIT DÉPLACE DÉJÀ LE CANEVAS (`panOnDrag={[2]}`), et l'événement de menu arrive aussi au
// relâchement d'un glissement : sans ce garde-fou, déplacer la vue ouvrirait un menu à l'arrivée.
// On note où le bouton est descendu, et on n'ouvre que si rien n'a bougé.
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

  const fermerMenu = useCallback(() => setMenu(null), []);

  return { menu, fermerMenu, surPointerDown, surClicDroit };
}
