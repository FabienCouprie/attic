// ui/hooks/useDepot.ts — Ce qu'un dépôt sur le canevas devient : un composant tiré de la palette, ou
// des fichiers venus du système.
//
// Sorti d'`App.tsx` le 2026-11-01, à l'identique : mêmes coordonnées, mêmes sortes reconnues, même
// cascade de positions. Les décisions sur les fichiers, quelle sorte et où les poser, vivent dans
// `ui/fichiers-deposes.ts` ; ce crochet ne fait que les relier à React.
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { defautCanoniqueChoix, defautParametre, type Langue } from "../../i18n";
import { positionsEnCascade, sorteDeposee, type SorteDeposee } from "../fichiers-deposes";
import { idUnique } from "../ids";
import { trouverDef } from "../ports-canevas";
import { tailleDefaut } from "../tailles-noeuds";

export interface OptionsDepot {
  rfInstance: any;
  ajouterNoeud: (ficheId: string, position: { x: number; y: number }) => void;
  setNodes: Dispatch<SetStateAction<any[]>>;
  /** Les gestionnaires attachés au `data` de chaque nœud, définis une seule fois dans App. */
  callbacksNoeud: () => Record<string, unknown>;
  pushHistorique: () => void;
  lang: Langue;
}

export function useDepot({ rfInstance, ajouterNoeud, setNodes, callbacksNoeud, pushHistorique, lang }: OptionsDepot) {
  /**
   * Un son lâché sur le canevas devient une entrée audio, déjà remplie.
   *
   * LE NŒUD NAÎT AVEC SON FICHIER, en une seule écriture. Le poser puis le remplir demanderait de
   * connaître son identifiant entre les deux, or il est tiré à l'intérieur de la mise à jour ; et
   * deux écritures de suite laisseraient un nœud vide le temps d'un rendu.
   *
   * Le chemin disque est relevé au passage, comme le fait le chargement par le sélecteur : c'est
   * lui qui permettra de retrouver le fichier à la réouverture du projet.
   */
  const deposerSons = useCallback((fichiers: { fichier: File; sorte: SorteDeposee }[], depart: { x: number; y: number }) => {
    const reconnus = fichiers.filter((f) => trouverDef(f.sorte === "midi" ? "lecteur-midi" : "entree-audio"));
    if (reconnus.length === 0) return;
    pushHistorique();
    const api = (window as any).api;
    const positions = positionsEnCascade(depart, reconnus.length);
    setNodes((nds) => {
      const ajoutes: any[] = [];
      for (const [i, { fichier, sorte }] of reconnus.entries()) {
        const ficheId = sorte === "midi" ? "lecteur-midi" : "entree-audio";
        const def = trouverDef(ficheId)!;
        const parametres: Record<string, number | string> = {};
        for (const p of def.parametres) {
          parametres[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p) : defautParametre(p, lang);
        }
        parametres.Chemin = api?.cheminFichier ? api.cheminFichier(fichier) : "";
        // Chaque sorte a ses champs, et ce sont ceux que les vues et le rechargement de session
        // attendent : les inventer ici ferait un nœud qui paraît rempli et ne lit rien.
        const media = sorte === "midi"
          ? { midiFichier: fichier, midiNom: fichier.name }
          : { audioFichier: fichier, audioNom: fichier.name, audioUrl: URL.createObjectURL(fichier) };
        const { width, height } = tailleDefaut(def);
        ajoutes.push({
          id: idUnique([...nds, ...ajoutes]),
          type: "atelier",
          position: positions[i],
          width, height,
          data: { ficheId, parametres, statut: "attente", ...media, ...callbacksNoeud() },
        });
      }
      return [...nds, ...ajoutes];
    });
  }, [setNodes, callbacksNoeud, pushHistorique, lang]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!rfInstance) return;
    // `screenToFlowPosition` ATTEND DES COORDONNÉES CLIENT : elle retire elle-même la position du
    // canevas à l'écran. Lui retirer d'avance le rectangle de l'enveloppe le comptait donc deux
    // fois, et le nœud tombait à 240 px à gauche et 118 px au-dessus du pointeur — mesuré à 1600 px
    // en visant le milieu du canevas. Le correctif enlève la soustraction ; il rend aussi le dépôt
    // INDÉPENDANT de la mise en page, ce qui compte depuis que la barre d'outils n'est plus dans
    // l'enveloppe du canevas et que son rectangle ne commence plus au même endroit.
    const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ficheId = e.dataTransfer.getData("application/attic-fiche-id");
    if (ficheId) { ajouterNoeud(ficheId, position); return; }
    // Pas de composant tiré de la palette : peut-être des fichiers venus du système. Ceux dont
    // aucun composant ne sait quoi faire sont laissés de côté, comme avant — le canevas ne les
    // refuse pas, il ne sait simplement pas encore les lire.
    const connus = [...(e.dataTransfer.files ?? [])]
      .map((fichier) => ({ fichier, sorte: sorteDeposee(fichier.name, fichier.type) }))
      .filter((f): f is { fichier: File; sorte: SorteDeposee } => f.sorte !== null);
    if (connus.length > 0) deposerSons(connus, position);
  }, [ajouterNoeud, deposerSons, rfInstance]);

  return { onDrop };
}
