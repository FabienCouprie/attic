// ui/hooks/useSoundFont.ts — Le SoundFont global : chargé seul au démarrage, remplacé par la barre.
//
// Sorti d'`App.tsx` le 2026-11-01. Même chargement automatique quand le dossier de travail change,
// même message d'échec. CE QUI A CHANGÉ LE 2026-11-02 : le cache d'exécution n'est plus vidé à chaque
// arrivée d'un SoundFont, mais selon `ui/soundfont-cache.ts` — seulement si l'instrument a changé,
// et jamais en plein run : le vidage attend alors la fin de l'exécution. Le défaut et sa mesure sont
// écrits là.
//
// `enExecution` est l'état des runs GLOBAUX ; un run ciblé par le ▶ d'un nœud n'y figure pas, et un
// chargement qui aboutirait pendant celui-là viderait tout de suite, comme avant. C'est dit plutôt
// que caché : suivre aussi les runs ciblés demanderait l'ordonnanceur, qui vit dans le moteur.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { autoChargerSF2, chargerSF2Globale, sf2Nom } from "../../plugins/soundfontGlobal";
import { decisionDeVidage } from "../soundfont-cache";

export interface OptionsSoundFont {
  repertoire: string;
  cacheExec: MutableRefObject<Map<string, any>>;
  /** Vrai pendant un run global : un vidage qui tomberait là attend la fin. */
  enExecution: boolean;
}

export function useSoundFont({ repertoire, cacheExec, enExecution }: OptionsSoundFont) {
  const [nom, setNom] = useState<string>(sf2Nom());
  const nomConnuRef = useRef(nom);
  const enExecutionRef = useRef(enExecution);
  enExecutionRef.current = enExecution;
  const vidageEnAttenteRef = useRef(false);

  /** Applique la règle à un instrument qui vient d'arriver, et retient son nom. */
  const accueillir = useCallback((nomApres: string) => {
    const decision = decisionDeVidage({ nomAvant: nomConnuRef.current, nomApres, enExecution: enExecutionRef.current });
    nomConnuRef.current = nomApres;
    setNom(nomApres);
    if (decision === "maintenant") cacheExec.current.clear();
    else if (decision === "a-la-fin-du-run") vidageEnAttenteRef.current = true;
  }, [cacheExec]);

  // LE VIDAGE DIFFÉRÉ PART QUAND LE RUN FINIT, et pas avant : c'est ce qui empêche la passe suivante
  // d'un lot de rejouer ce que la passe d'avant venait de calculer.
  useEffect(() => {
    if (enExecution || !vidageEnAttenteRef.current) return;
    vidageEnAttenteRef.current = false;
    cacheExec.current.clear();
  }, [enExecution, cacheExec]);

  // Auto-load SF2 au démarrage
  useEffect(() => {
    (async () => {
      const sf2 = await autoChargerSF2(repertoire);
      if (sf2) accueillir(sf2Nom());
    })();
  }, [repertoire, accueillir]);

  const chargerSF2 = useCallback(async (f: File) => {
    try {
      await chargerSF2Globale(await f.arrayBuffer(), f.name);
      localStorage.setItem("attic-sf2-nom", f.name);
      accueillir(f.name);
    } catch (e: any) {
      console.error("[attic] Échec chargement SF2 :", e);
      window.alert(`Échec du chargement du SoundFont : ${e?.message ?? e}`);
    }
  }, [accueillir]);

  return { sf2Nom: nom, chargerSF2 };
}
