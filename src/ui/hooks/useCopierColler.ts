// ui/hooks/useCopierColler.ts — Copier, couper, coller des nœuds (Ctrl+C / Ctrl+X / Ctrl+V), et Ctrl+Z.
//
// Extrait d'`App.tsx` le 2026-10-29, au passage du presse-papiers de la fenêtre à celui du système :
// voir `ui/presse-papiers-noeuds.ts` pour ce qui a été mesuré et pour la forme écrite. Ce qui suit
// garde les règles de l'atelier telles qu'elles étaient — l'allowlist de copie, le média gardé par
// la coupe, l'origine du collage — et n'ajoute que le chemin par le système.
import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { estUnChampDeSaisie } from "../champ-de-saisie";
import { CHAMPS_COPIABLES, CHAMPS_UTILISATEUR } from "./useExecutionGraphe";
import { idUnique } from "../ids";
import { tailleDefaut } from "../tailles-noeuds";
import { registreUI } from "../registre-actif";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import {
  ecrireDansLePressePapiers, lireCopie, lireLePressePapiers, nouveauJeton, serialiserCopie,
  type ContenuCopie, type ElementCopie,
} from "../presse-papiers-noeuds";

export interface OptionsCopierColler {
  noeudsRef: MutableRefObject<any[]>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setSel: (n: any) => void;
  pushHistorique: () => void;
  supprimerNoeud: (ids: string[]) => void;
  callbacksNoeud: () => Record<string, unknown>;
  undo: () => void;
  t: (cle: string) => string;
}

/** Les nœuds sélectionnés, mis en forme de copie. `champs` : ce que la copie emporte de `data`. */
function copier(selection: any[], champs: ReadonlySet<string>): ElementCopie[] {
  const origineX = Math.min(...selection.map((n) => n.position?.x ?? 0));
  const origineY = Math.min(...selection.map((n) => n.position?.y ?? 0));
  return selection.map((n) => {
    const d = n.data as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === "function") continue;
      if (!champs.has(k)) continue;
      data[k] = v;
    }
    return {
      ficheId: d.ficheId as string,
      parametres: { ...(d.parametres as Record<string, number | string>) },
      width: n.width ?? 230,
      height: n.height ?? 200,
      data,
      dx: (n.position?.x ?? 0) - origineX,
      dy: (n.position?.y ?? 0) - origineY,
    };
  });
}

export function useCopierColler(o: OptionsCopierColler) {
  const oRef = useRef(o);
  oRef.current = o;
  /** La dernière copie faite ICI, nœuds intacts : c'est elle qu'on colle si le système porte son jeton. */
  const copieLocale = useRef<ContenuCopie | null>(null);

  useEffect(() => {
    const garder = (contenu: ContenuCopie) => {
      copieLocale.current = contenu;
      void ecrireDansLePressePapiers(serialiserCopie(contenu));
    };

    const coller = async () => {
      const texte = await lireLePressePapiers();
      const lu = lireCopie(texte);
      const locale = copieLocale.current;
      // LE SYSTÈME DÉCIDE, et la copie locale ne sert que si elle est encore la sienne — ou s'il est
      // illisible, auquel cas on colle comme avant. Un texte copié ailleurs depuis ne colle rien.
      const contenu = lu ? (locale && lu.jeton === locale.jeton ? locale : lu) : (texte === null ? locale : null);
      if (!contenu || contenu.elements.length === 0) return;
      const { setNodes, setSel, pushHistorique, callbacksNoeud, t } = oRef.current;
      const trouverDef = (id: string) => registreUI().trouverDef(id);
      // UN COMPOSANT QUE CETTE FENÊTRE NE CONNAÎT PAS N'EST PAS POSÉ : il arriverait sous son
      // identifiant brut, sans un port. On le dit, et le reste se colle.
      const inconnus = [...new Set(contenu.elements.filter((e) => !trouverDef(e.ficheId)).map((e) => e.ficheId))];
      const elements = contenu.elements.filter((e) => trouverDef(e.ficheId));
      if (inconnus.length) window.alert(t("pressePapiers.inconnus").replace("{liste}", inconnus.join(", ")));
      if (elements.length === 0) return;
      pushHistorique();
      const cbs = callbacksNoeud();
      const ajoutes: any[] = [];
      // Venus d'une autre fenêtre par une coupe, les médias se relisent depuis leur chemin.
      const aRelire = contenu !== locale && contenu.coupe;
      const poses = elements.map((item) => ({
        item, data: { ficheId: item.ficheId, parametres: { ...item.parametres }, ...item.data },
      }));
      if (aRelire) await rechargerFichiersPersistes(poses.map((p) => ({ data: p.data })));
      setNodes((nds) => {
        const selectionCourante = nds.filter((n) => (n as { selected?: boolean }).selected);
        const origine = (() => {
          if (selectionCourante.length === 0) return { x: 120, y: 80 };
          const cx = selectionCourante.reduce((s, n) => s + (n.position?.x ?? 0), 0) / selectionCourante.length;
          const cy = selectionCourante.reduce((s, n) => s + (n.position?.y ?? 0), 0) / selectionCourante.length;
          return { x: cx + 40, y: cy + 40 };
        })();
        let current = nds.map((n) => n.selected ? { ...n, selected: false } : n);
        for (const { item, data } of poses) {
          const nouvelId = idUnique(current);
          const def = trouverDef(item.ficheId);
          const { width, height } = def ? tailleDefaut(def) : { width: item.width, height: item.height };
          const n: any = {
            id: nouvelId, type: "atelier",
            position: { x: origine.x + item.dx, y: origine.y + item.dy },
            width, height, selected: true,
            data: { ...data, statut: "attente", ...cbs },
          };
          current = [...current, n];
          ajoutes.push(n);
        }
        return current;
      });
      setSel(ajoutes[0] ?? null);
    };

    const onKey = (e: KeyboardEvent) => {
      // Ne pas intercepter si on tape dans un champ : Ctrl+C doit y copier le TEXTE, et non les
      // nœuds sélectionnés derrière. La règle vit dans `champ-de-saisie.ts`, en un seul endroit.
      if (estUnChampDeSaisie(e.target)) return;
      const { noeudsRef, pushHistorique, supprimerNoeud, undo } = oRef.current;
      if (!(e.ctrlKey || e.metaKey)) return;
      const selection = () => noeudsRef.current.filter((n) => (n as { selected?: boolean }).selected);

      if (e.key === "c") {
        const sel = selection();
        if (sel.length === 0) return;
        e.preventDefault();
        // Allowlist de COPIE : les champs saisis par l'utilisateur (ficheId,
        // paramètres…), jamais les résultats calculés (buffer audio, URL blob,
        // message…) — sinon le nœud dupliqué affiche ou joue le résultat de
        // l'original avant d'avoir tourné lui-même — et jamais non plus le média
        // chargé sur l'original (CHAMPS_MEDIA_LOCAL) : un « Entrée audio » collé
        // arrivait avec un lecteur affichant déjà une durée de piste alors qu'il
        // n'avait rien reçu. Le couper-coller, lui, conserve le média (voir Ctrl+X).
        garder({ jeton: nouveauJeton(), coupe: false, elements: copier(sel, CHAMPS_COPIABLES) });
      }

      if (e.key === "x") {
        const sel = selection();
        if (sel.length === 0) return;
        e.preventDefault();
        // Allowlist de COUPE : identique à la copie pour les résultats calculés,
        // mais le média chargé (fichier audio/image/MIDI…) est ici CONSERVÉ. Un
        // couper-coller est un déplacement, pas une duplication : l'original est
        // supprimé juste après, donc laisser le média derrière reviendrait à le
        // détruire.
        garder({ jeton: nouveauJeton(), coupe: true, elements: copier(sel, CHAMPS_UTILISATEUR) });
        // Sauvegarder pour undo puis supprimer
        pushHistorique();
        supprimerNoeud(sel.map((n) => n.id));
      }

      if (e.key === "v") {
        e.preventDefault();
        void coller();
      }

      if (e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
