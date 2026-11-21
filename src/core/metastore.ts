// core/metastore.ts — Registre des méta-composants créés par l'utilisateur.
// Chaque méta est aussi enregistré comme plugin (fiche) pour apparaître au
// catalogue et se rendre/relier comme n'importe quel nœud. À l'exécution, il est
// aplati (cf. core/meta.ts), donc son `executer` n'est jamais réellement appelé.
import type { MetaComposant } from "./meta";
import type { PluginDef } from "./types";
import type { InscriptionInjectee, Registre } from "./registre";

// DI : l'adaptateur de domaine configure le registre au démarrage.
let registre: Registre<unknown, unknown> | null = null;
export function configurerRegistre(r: Registre<unknown, unknown>): void { registre = r; }

const metas = new Map<string, MetaComposant>();

// Notification de changement (le cœur reste sans stockage : c'est la couche hôte
// qui s'abonne pour persister — cf. ui/metasLocaux.ts). L'ÉCOUTEUR REÇOIT LE MÉTA TOUCHÉ : chacun
// s'écrit sous sa propre clé, et réécrire la bibliothèque entière à chaque geste effaçait ce qu'une
// autre fenêtre venait d'y ajouter (mesuré le 2026-10-29).
type Ecouteur = (id: string) => void;
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

/**
 * Inscrit un méta-composant au catalogue, et rend ce que le registre en a dit.
 *
 * ═══ LE REGISTRE DÉCIDE D'ABORD, ET C'ÉTAIT UN DÉTOURNEMENT DU SOCLE ═══
 *
 * Le méta entrait dans cette table AVANT que le registre ne réponde, et l'écouteur le persistait
 * quoi qu'il ait répondu. Or c'est cette table, et non le registre, que lit l'aplatissement :
 * `aplatirGraphe` déplie tout nœud dont `trouverMeta` connaît la fiche. Un projet reçu portant un
 * méta sous l'identifiant d'un natif figé faisait donc refuser la fiche par le registre, puis
 * déplier ce méta à la place du natif, dans chaque graphe et à chaque démarrage : le gel des natifs
 * ne protégeait que la palette. Refusé, le méta n'entre plus dans la table et n'est plus notifié.
 *
 * UN MÉTA DÉJÀ INSCRIT DONT LA NOUVELLE VERSION EST REFUSÉE reste celui que la table tient, et le
 * stockage garde l'ancienne version : un renommage en nom vide, refusé, ne s'écrit plus. Cela ne
 * tient que si la nouvelle version est un autre objet que celui de la table : voir `renommerMeta`.
 */
export function enregistrerMeta(meta: MetaComposant): InscriptionInjectee {
  const def: PluginDef<unknown, unknown> = {
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
  if (!registre) {
    console.error("[attic] metastore : registre non configuré");
    return { inscrite: false, raison: "sans-registre" };
  }
  const inscription = registre.enregistrer(def); // remplacement en place si le méta est mis à jour
  if (!inscription.inscrite) return inscription;
  metas.set(meta.id, meta);
  notifier(meta.id);
  return inscription;
}

// Retire un méta du registre (catalogue) et notifie (→ persistance mise à jour).
export function supprimerMeta(id: string): void {
  if (!metas.delete(id)) return;
  registre?.desenregistrer(id);
  notifier(id);
}

/**
 * Renomme un méta-composant : la fiche du catalogue et la table prennent le nouveau nom.
 *
 * LE NOM VA À UNE COPIE, et non à l'objet de la table. Écrit dans celui-ci avant que le registre ne
 * réponde, il y restait sur un refus : le catalogue gardait l'ancien nom, la table le nouveau, et le
 * prochain projet sauvegardé écrivait celui que le registre avait refusé. Accepté, la copie remplace
 * l'objet dans la table.
 */
export function renommerMeta(id: string, nouveauNom: string): void {
  const meta = metas.get(id);
  if (!meta) return;
  enregistrerMeta({ ...meta, nom: nouveauNom });
}

function notifier(id: string): void {
  for (const cb of ecouteurs) { try { cb(id); } catch { /* un écouteur ne doit pas casser l'opération */ } }
}
