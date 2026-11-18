// core/rendu-du-visible.ts — Ce que le nœud visible a rendu, choisi dans les tables de la passe.
//
// POURQUOI CE MODULE. Pièce P4b du plan de l'architecture par messages entre l'interface et le
// moteur. Le correctif d'affichage (`ui/correctif-resultat.ts`) mêlait deux métiers : CHOISIR les
// valeurs du nœud qu'on voit, en lisant les tables de la passe, et DÉCIDER DE L'AFFICHAGE, adresses
// d'objet, lecteur promis, révocations. Tant que l'interface lisait elle-même la table des résultats
// du moteur, la frontière n'en était pas une. Le choix est donc ici, au cœur, et le moteur l'envoie à
// l'interface dans ses événements : `noeudFini` pour un nœud qui vient de tourner, `bilan` pour la
// pose finale. L'affichage, lui, reste au récepteur.
//
// LE CORPS EST CELUI DU CORRECTIF, ligne pour ligne, dans le même ordre de lecture : ses deux sorties
// sans rien à poser, les trois façons de choisir les valeurs et l'échec d'une branche de méta. Ce
// que ce module ne fait pas, il le laisse : le message « terminé » d'un méta dépend de ce que le
// domaine dit écoutable, et c'est à l'affichage d'en décider.
//
// SANS EFFET DE BORD. Il ne lit que les tables qu'on lui donne et les deux registres du cœur, celui
// des métas et celui des fiches : le choisir pour un nœud qui ne sera pas posé ne coûte que sa
// lecture.
import { estBulle, sortieDeBulle } from "./bulles";
import type { AreteG, DefPorts, NoeudG } from "./meta";
import { trouverMeta } from "./metastore";
import type { RenduDuVisible } from "./protocole-moteur";

/** Ce que le choix lit d'une passe : les tables qu'elle remplit, et le graphe qu'elle a lu. */
export interface TablesDuRendu {
  /** Les valeurs rendues, par nœud du graphe aplati. */
  resultats: ReadonlyMap<string, readonly unknown[]>;
  /** Le message de chaque nœud, quand il en a rendu un. */
  messages: ReadonlyMap<string, string>;
  /** Les deux canaux déclarés de chaque nœud. Voir `affichage` et `designe` dans `core/types.ts`. */
  affichageParNoeud: ReadonlyMap<string, Record<string, unknown>>;
  designeParNoeud: ReadonlyMap<string, Record<string, unknown>>;
  /** Les nœuds visibles, bulles comprises. */
  tousNoeudsG: readonly NoeudG[];
  /** Les arêtes sans les substitutions, celles d'un graphe qu'on lit. */
  aretesReelles: readonly AreteG[];
  /** L'ordre réellement exécuté, sur le graphe aplati. */
  ordreFiltre: readonly string[];
  /** Les nœuds du graphe aplati, où un membre de méta s'appelle « outil1::cd ». */
  noeudsPlats: readonly NoeudG[];
  /** Un méta est-il dans le périmètre de ce run ? */
  estMetaEnScope: (id: string) => boolean;
  trouverDef: (ficheId: string) => DefPorts | undefined;
}

/**
 * Ce que ce nœud visible montre, d'après les tables de la passe, ou rien s'il n'a rien à montrer.
 *
 * RIEN, DANS DEUX CAS : un méta hors du périmètre du run, qui garde ce qu'il montrait, et un nœud qui
 * n'a rendu ni valeur ni message.
 */
export function choisirLeRendu(noeud: Readonly<Pick<NoeudG, "id" | "data">>, tables: TablesDuRendu): RenduDuVisible<unknown> | undefined {
  const {
    resultats, messages, affichageParNoeud, designeParNoeud, tousNoeudsG, aretesReelles, ordreFiltre,
    noeudsPlats, estMetaEnScope, trouverDef,
  } = tables;
  const id = noeud.id;
  const ficheId = noeud.data.ficheId as string;
  const meta = trouverMeta(ficheId);
  // Méta hors du périmètre du run (branche non exécutée) : ne pas y toucher —
  // il garde son statut précédent au lieu de passer « en cours »/« erreur ».
  if (meta && !estMetaEnScope(id)) return undefined;
  // Pour un méta-nœud, on récupère les résultats de ses nœuds internes
  // aplatis (préfixés par l'id du méta-nœud) via ses ports de sortie exposés.
  // UNE BULLE MONTRE LE RÉSULTAT DE CE QUI EN SORT. Elle ne calcule rien, mais elle expose les
  // sorties de tous ses membres : donner la liste entière à l'aperçu lui ferait jouer la
  // première venue, c'est-à-dire le plus souvent le DÉBUT de la chaîne repliée. On ne lui donne
  // donc que la sortie qui représente la bulle, et rien si aucune ne la représente à elle seule.
  // Aucun préfixe d'identifiant ici, contrairement au méta-nœud : replier ne renomme personne.
  const sortie = estBulle(ficheId) ? sortieDeBulle(tousNoeudsG, aretesReelles, id, trouverDef) : null;
  const vals = meta
    ? meta.sorties.map((_, i) => {
        const m = meta.mapSorties[i];
        return resultats.get(`${id}::${m.noeudInterne}`)?.[m.portIndex] ?? null;
      })
    : estBulle(ficheId)
      ? (sortie ? [resultats.get(sortie.noeudInterne)?.[sortie.portIndex] ?? null] : [])
      : resultats.get(id);
  if ((!vals || vals.length === 0) && !messages.has(id)) return undefined;
  const valeurs = vals ?? [];
  const message = messages.get(id);
  const affichage = affichageParNoeud.get(id);
  const designe = designeParNoeud.get(id);
  const rendu: RenduDuVisible<unknown> = {
    valeurs,
    ...(message !== undefined ? { message } : {}),
    ...(affichage ? { affichage } : {}),
    ...(designe ? { designe } : {}),
  };
  // Pour un méta-nœud : il n'est « terminé » que si un résultat a été produit.
  if (meta && meta.sorties.length > 0 && !valeurs.some((v) => v != null) && !messages.has(id)) {
    // Le run est terminé et le méta n'a rien produit sur ses sorties : sa chaîne interne a échoué.
    // L'affichage le marque « erreur » — surtout PAS « en_cours » : le run est fini, la branche ne
    // tourne plus. On identifie en plus le premier nœud interne (ordre topo) resté sans résultat —
    // la cause de l'échec, souvent une entrée manquante (fichier audio non sérialisé à la
    // sauvegarde) — pour l'afficher sans ouvrir le méta.
    const fautif = premierInterneSansResultat(id, ordreFiltre, resultats, noeudsPlats);
    rendu.brancheEnEchec = fautif ? { fautif } : {};
  }
  return rendu;
}

/** La fiche du premier nœud interne de ce méta, dans l'ordre exécuté, resté sans résultat ; vide s'il n'y en a pas. */
function premierInterneSansResultat(
  metaId: string, ordreFiltre: readonly string[], resultats: TablesDuRendu["resultats"], noeudsPlats: readonly NoeudG[],
): string {
  const prefixe = `${metaId}::`;
  for (const fid of ordreFiltre) {
    if (!fid.startsWith(prefixe)) continue;
    const r = resultats.get(fid);
    if (!r || r.every((v) => v == null)) {
      return ((noeudsPlats.find((pn) => pn.id === fid)?.data as { ficheId?: string })?.ficheId) ?? "";
    }
  }
  return "";
}
