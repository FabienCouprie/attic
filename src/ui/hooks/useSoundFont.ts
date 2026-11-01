// ui/hooks/useSoundFont.ts — Le SoundFont global : chargé seul au démarrage, remplacé par la barre.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : même chargement automatique quand le dossier de
// travail change, même vidage du cache d'exécution quand l'instrument change, même message d'échec.
import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";

import { autoChargerSF2, chargerSF2Globale, sf2Nom } from "../../plugins/soundfontGlobal";

export interface OptionsSoundFont {
  repertoire: string;
  cacheExec: MutableRefObject<Map<string, any>>;
}

export function useSoundFont({ repertoire, cacheExec }: OptionsSoundFont) {
  const [nom, setNom] = useState<string>(sf2Nom());

  // Auto-load SF2 au démarrage
  useEffect(() => {
    (async () => {
      const sf2 = await autoChargerSF2(repertoire);
      if (sf2) {
        setNom(sf2Nom());
        cacheExec.current.clear();
      }
    })();
  }, [repertoire]);

  const chargerSF2 = useCallback(async (f: File) => {
    try {
      await chargerSF2Globale(await f.arrayBuffer(), f.name);
      setNom(f.name);
      localStorage.setItem("attic-sf2-nom", f.name);
      cacheExec.current.clear();
    } catch (e: any) {
      console.error("[attic] Échec chargement SF2 :", e);
      window.alert(`Échec du chargement du SoundFont : ${e?.message ?? e}`);
    }
  }, [cacheExec]);

  return { sf2Nom: nom, chargerSF2 };
}
