// ui/hooks/useFenetresPartagees.ts — Ce que les fenêtres ouvertes se partagent pendant qu'elles vivent.
//
// ═══ CE QUI MANQUAIT, MESURÉ LE 2026-10-29 ═══
//
// La bibliothèque des méta-composants était bien dans le stockage commun, et l'autre fenêtre en
// recevait bien l'événement `storage` : relevé, `attic-encours` puis `attic-metas`. Mais personne ne
// l'écoutait, et le registre en mémoire n'était lu qu'au chargement du module. Un méta créé dans une
// fenêtre n'apparaissait dans l'autre qu'après rechargement : le compteur de la palette restait à 1
// dans la seconde quand il passait à 2 dans la première.
//
// CE CROCHET ÉCOUTE, et verse : un méta ou un nœud installé écrit par une autre fenêtre entre dans
// le catalogue de celle-ci. Les nœuds de méta du graphe reçoivent une donnée neuve, ce qui leur fait
// relire leur fiche, donc leurs ports. Et il répond à la question des suppressions, que pose
// `ui/fenetres-partagees.ts`.
import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { surChangementMetas, supprimerMeta, trouverMeta, appliquerNodeInstalleDistant } from "../../core";
import { appliquerMetaDistant, sauvegarderMeta } from "../metasLocaux";
import { demanderEmploi, metaEmploye, repondreEmploi } from "../fenetres-partagees";

type Noeud = { id: string; data: Record<string, unknown> };

export interface OptionsFenetresPartagees {
  noeudsRef: MutableRefObject<Noeud[]>;
  grapheRacineRef: MutableRefObject<{ nodes: Noeud[] } | null>;
  pileRef: MutableRefObject<{ metaId: string }[]>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setPluginsVersion: Dispatch<SetStateAction<number>>;
  pushHistorique: () => void;
  supprimerNoeud: (ids: string[]) => void;
  t: (cle: string) => string;
  lang: string;
}

export function useFenetresPartagees(o: OptionsFenetresPartagees) {
  const oRef = useRef(o);
  oRef.current = o;

  const nomDe = (id: string) => {
    const m = trouverMeta(id);
    return (oRef.current.lang === "en" && m?.nomEn ? m.nomEn : m?.nom) ?? id;
  };

  const estEmployeIci = useCallback((id: string) => {
    const { noeudsRef, grapheRacineRef, pileRef } = oRef.current;
    // LE GRAPHE RACINE NE COMPTE QU'À L'INTÉRIEUR D'UN MÉTA. À la racine, `grapheRacineRef` garde
    // l'instantané pris au dernier passage du journal : un nœud supprimé depuis y est encore, et la
    // fenêtre se disait employer un méta qu'elle venait de retirer de son graphe. Vu dans l'épreuve.
    const racine = pileRef.current.length > 0 ? grapheRacineRef.current?.nodes : null;
    return metaEmploye(id, [noeudsRef.current, racine], pileRef.current);
  }, []);

  // Persistance des méta-composants : chacun sous sa clé, à chacun de ses changements (création,
  // édition interne, import). Le chargement se fait au niveau module, dans `App.tsx`.
  useEffect(() => surChangementMetas((id) => {
    sauvegarderMeta(id);
    oRef.current.setPluginsVersion((v) => v + 1);
  }), []);

  useEffect(() => {
    const surStockage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      const meta = appliquerMetaDistant(e.key, e.newValue, estEmployeIci);
      if (meta) {
        if (meta.action !== "enregistre") return;
        const { setNodes, grapheRacineRef, pileRef, t } = oRef.current;
        // UNE DONNÉE NEUVE FAIT RELIRE LA FICHE au nœud, comme au retour d'un méta (`remonterA`).
        const rafraichir = (n: Noeud) => n.data?.ficheId === meta.id ? { ...n, data: { ...n.data } } : n;
        setNodes((nds) => nds.map(rafraichir));
        if (grapheRacineRef.current) grapheRacineRef.current.nodes = grapheRacineRef.current.nodes.map(rafraichir);
        // ON EST DEDANS : l'intérieur affiché n'est pas rechargé sous les mains de la personne. Elle
        // l'apprend, et sait qu'en sortir écrira sa version.
        if (pileRef.current.some((p) => p.metaId === meta.id)) window.alert(t("meta.modifieAilleurs").replace("{nom}", nomDe(meta.id)));
        return;
      }
      if (appliquerNodeInstalleDistant(e.key, e.newValue)) oRef.current.setPluginsVersion((v) => v + 1);
    };
    window.addEventListener("storage", surStockage);
    return () => window.removeEventListener("storage", surStockage);
  }, [estEmployeIci]);

  useEffect(() => repondreEmploi(estEmployeIci), [estEmployeIci]);

  /** Retire un méta du catalogue, SAUF s'il est employé dans une autre fenêtre. */
  const supprimerMetaDuCatalogue = useCallback(async (id: string) => {
    const { t, noeudsRef, pushHistorique, supprimerNoeud } = oRef.current;
    const nom = nomDe(id);
    const ailleurs = await demanderEmploi(id);
    if (ailleurs > 0) {
      window.alert(t("meta.employeAilleurs").replace("{nom}", nom).replace("{nb}", String(ailleurs)));
      return;
    }
    if (!window.confirm(t("meta.confirmSupprimerCatalogue").replace("{nom}", nom))) return;
    // Retire aussi ses instances éventuelles du graphe courant (sinon nœuds orphelins).
    const aRetirer = noeudsRef.current.filter((n) => n.data.ficheId === id).map((n) => n.id);
    supprimerMeta(id);
    pushHistorique();
    supprimerNoeud(aRetirer);
  }, []);

  return { supprimerMetaDuCatalogue };
}
