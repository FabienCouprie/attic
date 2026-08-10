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
        imageNom: (n.data as Record<string, unknown>).imageNom,
        svgNom: (n.data as Record<string, unknown>).svgNom,
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

// Un méta non restauré (sous-nœud référençant un plugin introuvable) — de quoi
// afficher un avertissement compréhensible plutôt que de le perdre en silence.
export interface MetaNonRestaure { nom: string; manquants: string[] }

// Recharge les métas persistés et les ré-enregistre. GARDE : un méta n'est
// restauré que si chacun de ses sous-nœuds référence un plugin connu (ou un autre
// méta persisté — cas des métas imbriqués). Sinon il est ignoré (mais conservé en
// stockage, au cas où le plugin reviendrait — ex. le renommage d'un plugin, à
// réparer via l'ALIAS de core/registre.ts plutôt qu'en resignalant sans cesse le
// même méta comme perdu). Renvoie les métas non restaurés (tableau vide si tout
// va bien), pour que l'appelant puisse prévenir l'utilisateur au lieu de laisser
// des méta-composants disparaître du catalogue sans explication.
export function chargerMetasLocaux(): MetaNonRestaure[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) {
      console.log("[attic] chargerMetasLocaux: aucun méta en localStorage");
      return [];
    }
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    console.log(`[attic] chargerMetasLocaux: ${liste.length} méta(s) trouvé(s) en localStorage`);
    const idsPersistes = new Set(liste.map((m: any) => m?.id));
    const valides: any[] = [];
    const nonRestaures: MetaNonRestaure[] = [];
    for (const m of liste) {
      if (!m?.id || !m?.nom || !Array.isArray(m.sousNoeuds)) continue;
      const invalide = m.sousNoeuds.filter((sn: any) => {
        const fid = sn?.data?.ficheId;
        const connu = typeof fid === "string" && (!!registre.trouverDef(fid) || idsPersistes.has(fid));
        if (!connu) console.warn(`[attic] chargerMetasLocaux: ficheId « ${fid} » non trouvé dans le registre`);
        return !connu;
      });
      if (invalide.length === 0) {
        enregistrerMeta(m as MetaComposant);
        valides.push(m);
      } else {
        const manquants = [...new Set(invalide.map((s: any) => s?.data?.ficheId))] as string[];
        console.warn(`[attic] Méta « ${m.id} » non restauré : sous-nœud(s) inconnu(s) : ${manquants.join(", ")}`);
        nonRestaures.push({ nom: m.nom, manquants });
      }
    }
    if (valides.length !== liste.length) {
      localStorage.setItem(CLE, JSON.stringify(valides.map(serialiserMeta)));
    }
    return nonRestaures;
  } catch { return []; }
}
