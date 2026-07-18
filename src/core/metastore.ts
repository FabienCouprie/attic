// core/metastore.ts — Registre des méta-composants créés par l'utilisateur.
// Chaque méta est aussi enregistré comme plugin (fiche) pour apparaître au
// catalogue et se rendre/relier comme n'importe quel nœud. À l'exécution, il est
// aplati (cf. core/meta.ts), donc son `executer` n'est jamais réellement appelé.
import type { MetaComposant } from "./meta";
import type { PluginDef, TypeValeur } from "./types";
import type { Registre } from "./registre";

// DI : l'adaptateur de domaine configure le registre au démarrage.
let registre: Registre<TypeValeur, AudioContext> | null = null;
export function configurerRegistre(r: Registre<TypeValeur, AudioContext>): void { registre = r; }

const metas = new Map<string, MetaComposant>();

// Notification de changement (le cœur reste sans stockage : c'est la couche hôte
// qui s'abonne pour persister — cf. ui/metasLocaux.ts).
type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
export function surChangementMetas(cb: Ecouteur): () => void {
  ecouteurs.add(cb);
  return () => { ecouteurs.delete(cb); };
}

export function trouverMeta(id: string): MetaComposant | undefined {
  return metas.get(id);
}

export function tousLesMetas(): MetaComposant[] {
  return [...metas.values()];
}

export function estMeta(id: string): boolean {
  return metas.has(id);
}

export function enregistrerMeta(meta: MetaComposant): void {
  metas.set(meta.id, meta);
  const def: PluginDef<TypeValeur, AudioContext> = {
    id: meta.id,
    nom: meta.nom,
    univers: "Méta-composants",
    famille: "Sous-graphes",
    resume: `Sous-graphe : ${meta.sousNoeuds.length} nœud(s), ${meta.entrees.length} entrée(s), ${meta.sorties.length} sortie(s).`,
    notice: `Méta-composant encapsulant ${meta.sousNoeuds.length} nœud(s) et ${meta.sousAretes.length} connexion(s) internes. Aplati automatiquement à l'exécution. « Dégrouper » pour rouvrir son contenu dans le graphe.`,
    entrees: meta.entrees,
    sorties: meta.sorties,
    parametres: [],
    // Jamais appelé (le méta est aplati avant exécution) ; renvoie des sorties nulles par sûreté.
    executer: async () => ({ valeurs: meta.sorties.map(() => null), message: "Méta-composant (aplati à l'exécution)." }),
  };
  if (!registre) { console.error("[attic] metastore : registre non configuré"); return; }
  registre.enregistrer(def); // remplacement en place si le méta est mis à jour
  notifier();
}

// Retire un méta du registre (catalogue) et notifie (→ persistance mise à jour).
export function supprimerMeta(id: string): void {
  if (!metas.delete(id)) return;
  registre?.desenregistrer(id);
  notifier();
}

// Renomme un méta-composant (met à jour le nom + la fiche du catalogue).
export function renommerMeta(id: string, nouveauNom: string): void {
  const meta = metas.get(id);
  if (!meta) return;
  meta.nom = nouveauNom;
  enregistrerMeta(meta); // re-enregistre avec le nouveau nom (met à jour la fiche)
}

function notifier(): void {
  for (const cb of ecouteurs) { try { cb(); } catch { /* un écouteur ne doit pas casser l'opération */ } }
}
