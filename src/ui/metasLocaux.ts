// ui/metasLocaux.ts — Persistance locale des méta-composants (localStorage).
// Rend le catalogue de métas PERMANENT sur la machine : ils survivent aux
// redémarrages, sans dépendre d'un workflow exporté. Le cœur reste sans stockage
// (cf. core/metastore : on s'abonne à surChangementMetas pour sauvegarder).
import { tousLesMetas, enregistrerMeta, type MetaComposant } from "../core";
import { registre } from "../audio/adaptateur";

const CLE = "attic-metas";

// Rend un méta sérialisable (retire File/Blob des sous-nœuds — mêmes règles que
// l'export de workflow ; source unique de vérité de la sérialisation d'un méta).
export function serialiserMeta(m: MetaComposant) {
  return {
    id: m.id, nom: m.nom, entrees: m.entrees, sorties: m.sorties,
    mapEntrees: m.mapEntrees, mapSorties: m.mapSorties,
    sousNoeuds: m.sousNoeuds.map((n) => ({
      id: n.id, position: n.position, width: n.width, height: n.height,
      data: {
        ficheId: n.data.ficheId,
        parametres: n.data.parametres,
        audioNom: (n.data as Record<string, unknown>).audioNom,
        midiNom: (n.data as Record<string, unknown>).midiNom,
        sf2InstrumentIdx: (n.data as Record<string, unknown>).sf2InstrumentIdx,
        zonesSelectionnees: (n.data as Record<string, unknown>).zonesSelectionnees,
      },
    })),
    sousAretes: m.sousAretes.map((a) => ({ id: a.id, source: a.source, target: a.target, sourceHandle: a.sourceHandle, targetHandle: a.targetHandle })),
  };
}

// Sauvegarde tous les métas courants dans localStorage.
export function sauvegarderMetasLocaux(): void {
  try { localStorage.setItem(CLE, JSON.stringify(tousLesMetas().map(serialiserMeta))); } catch { /* quota/indispo : on ignore */ }
}

// Recharge les métas persistés et les ré-enregistre. GARDE : un méta n'est
// restauré que si chacun de ses sous-nœuds référence un plugin connu (ou un autre
// méta persisté — cas des métas imbriqués). Sinon il est ignoré (mais conservé en
// stockage, au cas où le plugin reviendrait). Renvoie le nombre restauré.
export function chargerMetasLocaux(): number {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return 0;
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return 0;
    const idsPersistes = new Set(liste.map((m: any) => m?.id));
    let n = 0;
    for (const m of liste) {
      if (!m?.id || !m?.nom || !Array.isArray(m.sousNoeuds)) continue;
      const valide = m.sousNoeuds.every((sn: any) => {
        const fid = sn?.data?.ficheId;
        return typeof fid === "string" && (!!registre.trouverDef(fid) || idsPersistes.has(fid));
      });
      if (valide) { enregistrerMeta(m as MetaComposant); n++; }
    }
    return n;
  } catch { return 0; }
}
