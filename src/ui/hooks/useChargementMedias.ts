// ui/hooks/useChargementMedias.ts — Poser un fichier sur un nœud, et il n'y a qu'une façon de le faire.
//
// Sorti d'`App.tsx` le 2026-11-01. CINQ GESTIONNAIRES Y ÉCRIVAIENT LA MÊME CHOSE à un nom de champ
// près : audio, MIDI, image, SVG, PDF. Chacun purgeait le cache, relevait le chemin disque, posait
// le fichier et son nom, écrivait le paramètre « Chemin » et remettait le nœud à zéro. Seul l'audio
// ajoutait une URL écoutable. Les cinq copies étaient identiques, vérifié ligne à ligne avant de les
// réunir ; une règle qui aurait changé dans l'une n'aurait pas suivi dans les quatre autres. Les
// noms de champ sont ceux que `core/saisies.ts` déclare par genre.
//
// CHACUN SE TERMINE PAR `reinitialiserNoeud`, comme `onChangerParametre` : choisir un autre fichier
// est le changement d'entrée le plus lourd qui soit, et sans cette cascade l'aval gardait son
// résultat d'avant, marqué « Terminé ». Sur un sélecteur multi-zones, cela voulait dire dessiner
// des zones sur la forme d'onde de l'ancien fichier pour les appliquer au nouveau. L'incohérence
// tenait en une ligne : ces gestionnaires écrivent aussi le paramètre « Chemin », or le même
// changement passé par l'inspecteur réinitialisait, lui. Les zones et les fichiers chargés survivent
// à la cascade (CHAMPS_UTILISATEUR).
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

/** Les cinq matières qu'un nœud reçoit par son bouton « Charger », avec le paramètre « Chemin ». */
export type SorteDeMedia = "audio" | "midi" | "image" | "svg" | "pdf";

export interface OptionsChargementMedias {
  cacheExec: MutableRefObject<Map<string, any>>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  reinitialiserNoeud: (nid: string) => void;
}

export function useChargementMedias({ cacheExec, setNodes, reinitialiserNoeud }: OptionsChargementMedias) {
  const chargerMedia = useCallback((nid: string, sorte: SorteDeMedia, fichier: File) => {
    cacheExec.current.delete(nid);
    const api = (window as any).api;
    const chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
    // L'URL se crée HORS du réducteur : React le rejoue deux fois en mode strict, et une des
    // deux URL n'était plus tenue par personne.
    const media: Record<string, unknown> = { [`${sorte}Fichier`]: fichier, [`${sorte}Nom`]: fichier.name };
    if (sorte === "audio") media.audioUrl = URL.createObjectURL(fichier);
    setNodes((nds2) => nds2.map((n) => n.id === nid
      ? { ...n, data: { ...n.data, ...media, parametres: { ...n.data.parametres, Chemin: chemin } } }
      : n));
    reinitialiserNoeud(nid);
  }, [cacheExec, setNodes, reinitialiserNoeud]);

  /** Une prise au micro : un blob, et son URL écoutable. Pas de chemin disque, elle n'en a pas. */
  const changerEnregistrement = useCallback((nid: string, blob: Blob) => {
    cacheExec.current.delete(nid);
    const url = URL.createObjectURL(blob);
    setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, enregistrementBlob: blob, enregistrementUrl: url } } : n));
    reinitialiserNoeud(nid);
  }, [cacheExec, setNodes, reinitialiserNoeud]);

  /** La réponse impulsionnelle d'une réverbération : un fichier sans paramètre « Chemin ». */
  const chargerIR = useCallback((nid: string, fichier: File) => {
    cacheExec.current.delete(nid);
    setNodes((nds2) => nds2.map((n) => n.id === nid ? { ...n, data: { ...n.data, irFichier: fichier, irNom: fichier.name } } : n));
    reinitialiserNoeud(nid);
  }, [cacheExec, setNodes, reinitialiserNoeud]);

  return { chargerMedia, changerEnregistrement, chargerIR };
}
