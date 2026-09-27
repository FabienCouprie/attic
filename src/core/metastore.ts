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

/** Ce qu'on sait dire d'un méta sans son auteur : sa forme. */
function resumeCalcule(meta: MetaComposant, langue: "fr" | "en"): string {
  return langue === "en"
    ? `Subgraph: ${meta.sousNoeuds.length} node(s), ${meta.entrees.length} input(s), ${meta.sorties.length} output(s).`
    : `Sous-graphe : ${meta.sousNoeuds.length} nœud(s), ${meta.entrees.length} entrée(s), ${meta.sorties.length} sortie(s).`;
}

/**
 * La notice d'un méta : ce que son auteur en dit, puis ce qu'on mesure sur lui.
 *
 * LE COMPTE RESTE ÉCRIT même quand une description existe. Il dit ce que la description ne dira
 * pas : combien de nœuds on déplie en dégroupant, et donc ce qu'on trouvera derrière.
 */
function noticeDeMeta(meta: MetaComposant, langue: "fr" | "en"): string {
  const ecrite = meta.description?.trim();
  const forme = langue === "en"
    ? `Meta-component wrapping ${meta.sousNoeuds.length} node(s) and ${meta.sousAretes.length} internal connection(s). Flattened automatically at run time. Use « Ungroup » to reopen its contents in the graph.`
    : `Méta-composant encapsulant ${meta.sousNoeuds.length} nœud(s) et ${meta.sousAretes.length} connexion(s) internes. Aplati automatiquement à l'exécution. « Dégrouper » pour rouvrir son contenu dans le graphe.`;
  return ecrite ? `${ecrite}\n\n${forme}` : forme;
}

/**
 * Écrit ce que l'auteur dit de son méta-composant, ou l'efface quand le texte est vide.
 *
 * LE MÉTA EST RÉENREGISTRÉ, comme au renommage : c'est l'enregistrement qui refait la fiche du
 * catalogue, et sans lui la description vivrait sur le méta sans jamais se lire nulle part.
 */
export function decrireMeta(id: string, description: string): void {
  const meta = metas.get(id);
  if (!meta) return;
  const texte = description.trim();
  if (texte) meta.description = texte; else delete meta.description;
  enregistrerMeta(meta);
}

export function enregistrerMeta(meta: MetaComposant): void {
  metas.set(meta.id, meta);
  const def: PluginDef<TypeValeur, AudioContext> = {
    id: meta.id,
    nom: meta.nom,
    // La fiche n'avait aucun champ anglais : un méta-composant gardait son nom et son
    // résumé français dans le catalogue anglais, jusque dans l'infobulle — alors même
    // que le méta, lui, porte un `nomEn`, qui était simplement perdu ici.
    nomEn: meta.nomEn,
    univers: "Méta-composants",
    famille: "Sous-graphes",
    // LA DESCRIPTION DE L'AUTEUR PASSE DEVANT LE COMPTE DES NŒUDS, et le compte n'est pas perdu
    // pour autant : il descend dans la notice. Un résumé calculé dit la forme du sous-graphe et
    // jamais ce qu'il fait, alors que c'est la première chose qu'on cherche dans un catalogue.
    // Le même texte dans les deux langues : voir `MetaComposant.description`.
    resume: meta.description?.trim() || resumeCalcule(meta, "fr"),
    resumeEn: meta.description?.trim() || resumeCalcule(meta, "en"),
    notice: noticeDeMeta(meta, "fr"),
    noticeEn: noticeDeMeta(meta, "en"),
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
