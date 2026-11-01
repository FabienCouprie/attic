// ui/hooks/useCommandesBarre.ts — Trois commandes de la barre d'outils qui ont besoin de l'atelier :
// choisir le dossier de travail, lancer puis recadrer, recharger la page.
//
// Sorties d'`App.tsx` le 2026-11-01, où elles étaient écrites en ligne dans le JSX. À l'identique,
// à ceci près qu'elles sont mémoïsées : la barre ne reçoit plus trois fonctions neuves à chaque
// rendu de l'atelier.
import { useCallback } from "react";

import { useI18n } from "../../i18n";

export interface OptionsCommandesBarre {
  changerRepertoire: (r: string) => void;
  lancer: () => Promise<unknown>;
  rfInstance: any;
  enExecution: boolean;
  memoriserEncours: () => void;
}

export function useCommandesBarre({ changerRepertoire, lancer, rfInstance, enExecution, memoriserEncours }: OptionsCommandesBarre) {
  const { t } = useI18n();

  const choisirDossier = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.onchange = (e: any) => {
      const files = e.target.files;
      if (files?.length) changerRepertoire(files[0].webkitRelativePath.split("/")[0]);
    };
    input.click();
  }, [changerRepertoire]);

  const lancerEtRecadrer = useCallback(async () => {
    await lancer();
    rfInstance?.fitView?.({ duration: 200, padding: 0.2 });
  }, [lancer, rfInstance]);

  const recharger = useCallback(() => {
    // Le graphe d'abord, le rechargement ensuite : l'en-cours n'est autrement écrit qu'à
    // l'enregistrement, et recharger rendrait le graphe du dernier enregistrement.
    //
    // PAS DÉSACTIVÉ PENDANT UNE EXÉCUTION, contrairement à la réinitialisation. Recharger
    // est justement le recours quand une exécution ne rend plus la main, ou quand
    // l'application s'est mise dans un état qu'aucun autre bouton ne répare ; le griser à
    // ce moment-là le rendrait inutilisable précisément quand on en a besoin. On demande
    // seulement confirmation, puisque le calcul en cours sera perdu.
    if (enExecution && !window.confirm(t("barre.recharger.confirmer"))) return;
    memoriserEncours();
    window.location.reload();
  }, [enExecution, memoriserEncours, t]);

  return { choisirDossier, lancerEtRecadrer, recharger };
}
