// ui/hooks/useSauvegardeAutomatique.ts — Écrire le projet tout seul, et une dernière fois en partant.
//
// Extrait de `App.tsx` au découpage de l'atelier, sans qu'une ligne change. Le sujet se tient de
// lui-même : un minuteur, une écriture à la fermeture, et trois valeurs venues de l'appelant.
import { useEffect, useRef } from "react";
import { PERIODE_SAUVEGARDE_MS } from "../sauvegarde-auto";

export interface OptionsSauvegardeAutomatique {
  /** Le fichier ouvert, ou `null` : sans fichier, rien ne s'écrit. */
  currentFilePath: string | null;
  /** La bascule de l'interface. */
  sauvegardeAutoActive: boolean;
  /** Ce qui écrit vraiment. Le paramètre a un défaut, comme dans `usePersistance` : la ref qui
   *  retient cette fonction est ensuite réaffectée à une variante sans argument. */
  sauvegarderAuto: (active?: boolean) => Promise<unknown>;
}

export function useSauvegardeAutomatique(o: OptionsSauvegardeAutomatique) {
  const { currentFilePath, sauvegardeAutoActive, sauvegarderAuto } = o;

  // Toutes les 30 secondes, en silence, tant qu'un fichier de projet est ouvert — et
  // seulement si le graphe a changé depuis la dernière écriture.
  //
  // Le minuteur est monté UNE FOIS par fichier. Il dépendait auparavant de `sauvegarder`,
  // dont l'identité change à chaque rendu : chaque modification du graphe démontait
  // l'effet et relançait le compte à zéro, si bien que la sauvegarde n'avait lieu qu'au
  // repos. Mesuré dans l'application avant correction : dix changements de paramètre
  // espacés de dix secondes, cent une secondes de travail, aucune écriture. Elle
  // sauvegardait quand on ne faisait rien, et pas quand on travaillait.
  //
  // La fonction appelée est lue dans une ref, pour que le minuteur garde le graphe à
  // jour sans avoir à se remonter.
  //
  // La bascule est lue dans une ref elle aussi : le minuteur n'a pas à se remonter quand
  // on la change, et `sauvegarderAuto` s'abstient d'écrire si elle est coupée.
  const sauvegardeAutoActiveRef = useRef(sauvegardeAutoActive);
  sauvegardeAutoActiveRef.current = sauvegardeAutoActive;
  const sauvegarderAutoRef = useRef(sauvegarderAuto);
  sauvegarderAutoRef.current = () => sauvegarderAuto(sauvegardeAutoActiveRef.current);
  useEffect(() => {
    if (!currentFilePath) return;
    const id = setInterval(() => {
      sauvegarderAutoRef.current().catch((err) => console.error("[attic] Sauvegarde automatique échouée", err));
    }, PERIODE_SAUVEGARDE_MS);
    return () => clearInterval(id);
  }, [currentFilePath]);

  // Et une dernière fois à la fermeture : entre deux battements, jusqu'à trente secondes
  // de travail ne tiennent qu'en mémoire. Le processus principal interrompt la fermeture,
  // envoie cette demande et attend la réponse — puis ferme, quoi qu'il arrive : une
  // fenêtre qui refuserait de se fermer serait pire que la perte qu'on évite. La réponse
  // part donc dans tous les cas, y compris si la sauvegarde échoue ou n'a pas lieu d'être.
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.fermetureDemandeSauvegarde) return;
    api.fermetureDemandeSauvegarde(async () => {
      try {
        await sauvegarderAutoRef.current();
      } catch (err) {
        console.error("[attic] Sauvegarde à la fermeture échouée", err);
      } finally {
        api.fermeturePrete?.();
      }
    });
  }, []);
}
