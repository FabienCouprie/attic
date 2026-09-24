// ui/hooks/useBulles.ts — Clarifier, développer, ouvrir. Les trois gestes, et rien d'autre.
//
// CE QUI DISTINGUE CES GESTES DE « GROUPER » ET « DÉGROUPER ». Un méta-composant EXTRAIT un sous-graphe
// et le range au catalogue, où il devient un outil réutilisable. Une bulle ne range rien et n'extrait
// rien : elle replie le schéma pour le lire. Les deux jeux de commandes ne se croisent donc jamais, et
// chacun vérifie le magasin qui est le sien — faute de quoi sélectionner une bulle et cliquer
// « Dégrouper » ne ferait rien du tout, sans message, ce qui est le pire des retours.
//
// AUCUN IDENTIFIANT NE CHANGE, NI À LA CLARIFICATION NI AU DÉVELOPPEMENT. C'est la propriété qui fait
// tout tenir : le cache d'exécution est indexé par identifiant de nœud, donc replier et développer ne
// coûtent aucun recalcul. Un geste de lisibilité doit être gratuit.

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import {
  bulleDe, bullesVides, estBulle, ficheDeBulle, membresDe, noeudDeFicheBulle, type NoeudG,
} from "../../core";
import { useI18n } from "../../i18n";

const idUnique = (noeuds: readonly { id: string }[]): string => {
  let n = noeuds.length + 1;
  const pris = new Set(noeuds.map((x) => x.id));
  while (pris.has(`n${n}`)) n++;
  return `n${n}`;
};

/** Le rectangle qui contient des nœuds, avec une marge, pour poser la bulle dessus. */
function cadreDe(noeuds: readonly Node[]): { x: number; y: number; width: number; height: number } {
  const MARGE = 24;
  const xs = noeuds.map((n) => n.position?.x ?? 0);
  const ys = noeuds.map((n) => n.position?.y ?? 0);
  const x2 = noeuds.map((n, i) => (xs[i] ?? 0) + (n.width ?? 230));
  const y2 = noeuds.map((n, i) => (ys[i] ?? 0) + (n.height ?? 200));
  const gx = Math.min(...xs) - MARGE, gy = Math.min(...ys) - MARGE;
  return {
    x: gx, y: gy,
    width: Math.max(...x2) - gx + MARGE,
    height: Math.max(...y2) - gy + MARGE,
  };
}

/**
 * Typage souple, comme `useMetaComposants` : le code d'App castait déjà tout entre les nœuds
 * React-Flow et les nœuds « purs » du cœur. On ne rouvre pas ce chantier ici.
 */
export interface OptionsBulles {
  noeudsRef: { current: any[] };
  aretesRef: { current: any[] };
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSel: (n: any) => void;
  pushHistorique: () => void;
  callbacksNoeud: () => Record<string, unknown>;
}

export function useBulles(o: OptionsBulles) {
  const { t } = useI18n();

  /**
   * CLARIFIER : la sélection entre dans une bulle, repliée.
   *
   * Les nœuds ne bougent pas et ne changent pas d'identifiant : ils reçoivent une appartenance, et la
   * bulle se pose sur leur emprise. Un membre qui appartenait déjà à une autre bulle change de parent,
   * ce qui suffit à imbriquer.
   */
  const clarifier = useCallback(() => {
    const selection = o.noeudsRef.current.filter((n) => n.selected);
    if (selection.length < 2) { window.alert(t("bulle.clarifierSelection")); return; }
    o.pushHistorique();
    const id = idUnique(o.noeudsRef.current);
    const membres = new Set(selection.map((n) => n.id));
    const cadre = cadreDe(selection);
    // La bulle hérite de l'appartenance commune de ses membres, s'ils en ont une : clarifier trois
    // nœuds d'une même bulle fait une bulle DANS celle-là, et non à côté.
    const parents = new Set(selection.map((n) => bulleDe(n as unknown as NoeudG) ?? ""));
    const parent = parents.size === 1 ? [...parents][0] : "";

    o.setNodes((nds) => [
      ...nds.map((n) => (membres.has(n.id)
        ? { ...n, selected: false, data: { ...n.data, bulle: id } }
        : n)),
      {
        id,
        type: "atelier" as const,
        position: { x: cadre.x, y: cadre.y },
        width: cadre.width,
        height: cadre.height,
        data: {
          ficheId: ficheDeBulle(id),
          parametres: {},
          statut: "attente" as const,
          nom: t("bulle.nom"),
          replie: true,
          ...(parent ? { bulle: parent } : {}),
          ...o.callbacksNoeud(),
        },
      },
    ]);
    o.setSel(null);
  }, [o, t]);

  /** Le développement sans instantané ni sélection : ce que partagent le geste et l'automatique. */
  const developperSans = useCallback((bulleId: string) => {
    o.setNodes((nds) => {
      const cible = nds.find((n) => n.id === bulleId);
      const parent = cible ? bulleDe(cible as unknown as NoeudG) : undefined;
      return nds
        .filter((n) => n.id !== bulleId)
        .map((n) => {
          if ((n.data as { bulle?: string }).bulle !== bulleId) return n;
          const data = { ...n.data } as Record<string, unknown>;
          // Le membre remonte d'un cran : il rejoint la bulle qui contenait celle qu'on développe.
          if (parent) data.bulle = parent; else delete data.bulle;
          delete data.cacheParBulle;
          return { ...n, hidden: false, data } as Node;
        });
    });
    // Les substituts de la bulle disparue n'ont plus d'objet ; la normalisation les refera au besoin.
    o.setEdges((eds) => eds.filter((e) => e.source !== bulleId && e.target !== bulleId));
  }, [o]);

  /** DÉVELOPPER : la bulle disparaît, ses membres restent où ils sont. */
  const developper = useCallback((bulleId?: string) => {
    const cible = bulleId
      ? o.noeudsRef.current.find((n) => n.id === bulleId)
      : o.noeudsRef.current.find((n) => n.selected && estBulle((n.data as { ficheId?: string }).ficheId));
    if (!cible) { window.alert(t("bulle.developperSelection")); return; }
    o.pushHistorique();
    developperSans(cible.id);
    o.setSel(null);
  }, [o, t, developperSans]);

  /** OUVRIR ou refermer : la bulle montre ou cache son intérieur, sans disparaître. */
  const basculerRepli = useCallback((bulleId: string) => {
    o.pushHistorique();
    o.setNodes((nds) => nds.map((n) => (n.id === bulleId
      ? { ...n, data: { ...n.data, replie: (n.data as { replie?: boolean }).replie === false } }
      : n)));
  }, [o]);

  /**
   * LES BULLES VIDES SE SUPPRIMENT D'ELLES-MÊMES. Décision de Fabien.
   *
   * Rend la liste de celles qui ont été retirées, pour que l'appelant sache s'il doit remonter d'un
   * niveau — on peut se tenir à l'intérieur de celle qui vient de se vider.
   */
  const retirerBullesVides = useCallback((): string[] => {
    const vides = bullesVides(o.noeudsRef.current as unknown as NoeudG[]);
    if (vides.length === 0) return [];
    const aRetirer = new Set(vides);
    o.setNodes((nds) => nds.filter((n) => !aRetirer.has(n.id)));
    o.setEdges((eds) => eds.filter((e) => !aRetirer.has(e.source) && !aRetirer.has(e.target)));
    return vides;
  }, [o]);

  /**
   * DÉVELOPPE D'OFFICE LES BULLES D'UNE SÉLECTION, récursivement, et rend ce qu'il faut annoncer.
   *
   * Un méta-composant part au catalogue et voyage entre projets ; une bulle reste dans le sien. Un méta
   * bâti sur une sélection contenant une bulle serait donc irrécupérable ailleurs : le chargeur
   * refuserait de le restaurer, en signalant un sous-nœud inconnu, et la cause ne serait pas lisible.
   * On développe donc avant de construire, et on le dit : trois nœuds sélectionnés dont une bulle de
   * cinq donnent un méta de sept.
   */
  const developperAvantMeta = useCallback((): { bulles: number; membres: number } => {
    const selection = o.noeudsRef.current.filter((n) => n.selected);
    const bulles = selection.filter((n) => estBulle((n.data as { ficheId?: string }).ficheId));
    if (bulles.length === 0) return { bulles: 0, membres: 0 };

    let membres = 0;
    const aDevelopper: string[] = bulles.map((n) => n.id);
    const vus = new Set<string>();
    for (let i = 0; i < aDevelopper.length && i < 1000; i++) {
      const id = aDevelopper[i];
      if (vus.has(id)) continue;
      vus.add(id);
      for (const m of membresDe(o.noeudsRef.current as unknown as NoeudG[], id)) {
        membres++;
        if (estBulle(m.data.ficheId)) aDevelopper.push(m.id);
      }
    }
    // Les membres deviennent la sélection, et les bulles s'effacent : ce sont de vrais nœuds que le
    // méta doit contenir, jamais un conteneur.
    const nouveauxNoeuds = o.noeudsRef.current
      .filter((n) => !vus.has(n.id))
      .map((n) => {
        const parent = (n.data as { bulle?: string }).bulle;
        if (!parent || !vus.has(parent)) return n;
        const data = { ...n.data } as Record<string, unknown>;
        delete data.bulle;
        delete data.cacheParBulle;
        return { ...n, hidden: false, selected: true, data } as Node;
      });
    const nouvellesAretes = o.aretesRef.current.filter((e) => !vus.has(e.source) && !vus.has(e.target));

    // LES RÉFÉRENCES SONT ÉCRITES TOUT DE SUITE, et c'est nécessaire. `grouper` lit `noeudsRef.current`,
    // que React ne met à jour qu'au rendu suivant : sans cette écriture, le méta serait construit sur
    // le graphe d'AVANT le développement, donc contiendrait la bulle — exactement ce qu'on évite.
    o.noeudsRef.current = nouveauxNoeuds;
    o.aretesRef.current = nouvellesAretes;
    o.setNodes(() => nouveauxNoeuds);
    o.setEdges(() => nouvellesAretes);
    return { bulles: vus.size, membres };
  }, [o]);

  /** L'identifiant du nœud de bulle que porte cette fiche, ou la chaîne vide. */
  const noeudDeFiche = noeudDeFicheBulle;

  return { clarifier, developper, basculerRepli, retirerBullesVides, developperAvantMeta, noeudDeFiche };
}
