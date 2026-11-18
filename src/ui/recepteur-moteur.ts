// ui/recepteur-moteur.ts — Le récepteur : ce que le moteur dit, appliqué aux magasins de l'interface.
//
// POURQUOI. Pièce P4a du plan de l'architecture par messages entre l'interface et le moteur. La boucle
// d'une passe recevait trois fonctions qui écrivaient dans les magasins : la pose d'un statut, celle
// d'une ombre et `quandUnNoeudAFini`. Elle ne reçoit plus qu'`emettre`, et dit des événements du
// protocole (`EvenementDeLaBoucle` dans `core/execution.ts`) ; c'est ce module qui les applique, un
// événement pour un appel, dans le même ordre et avec la même attente.
//
// SEUL LE RÉCEPTEUR ÉCRIT LES POSES, et `docs/frontiere-moteur.test.ts` le tient : hors de lui, du
// correctif d'affichage qu'il appelle et de la réparation des aperçus, rien n'importe `poserStatut`,
// `poserStatutOmbre`, `poserResultat` ni `poserApercu`. Ce que le ménage d'après passe écrit encore
// lui-même, les statuts des conteneurs, les temps, les écarts et les lecteurs, il le reçoit d'ici. La
// pièce P4b en fera des événements, et P5 donnera le récepteur au moteur à sa construction.
//
// UN RÉCEPTEUR PAR PASSE. Ce qu'une passe a posé et ce qui lui reste à poser sont à elle : la pose
// finale du ménage les lit. Les passes se suivent, l'ordonnanceur n'en fait jamais tourner deux.
import type { EvenementDeLaBoucle } from "../core/execution";
import type { StatutAPoser } from "../core/preparation-passe";
import { calculerCorrectifResultat } from "./correctif-resultat";
import type { EtatDePasse } from "./etat-de-passe";
import { poserResultat } from "./resultats";
import { poserApercu, poserStatut, poserStatutOmbre } from "./statuts";

// `progressionDuNoeud` distingue ce que le NŒUD dit de son avancement (son `onProgress`) de ce que
// le MOTEUR pose — « Étape i/total », qui est sa position dans le lot. L'anneau de progression ne
// lit que le premier : sans cette distinction, il prenait « Étape 1/1 » pour 100 %.
// L'ÉTAT VA DANS SON MAGASIN, PAS DANS LE TABLEAU DES NŒUDS. Le faire passer par `setNodes`
// obligeait React Flow à repasser sur les N nœuds à chaque changement — 7 ms par nœud présent,
// deux fois par nœud exécuté, soit un gel en N² : 0,6 s sur cinq nœuds, 4,9 s sur vingt. Le
// magasin ne prévient que le composant concerné. Voir `ui/statuts.ts`.
const definirStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
  poserStatut(nodeId, statut, progression, progressionDuNoeud);
};

/** Les statuts que la préparation pose, dans l'ordre où elle les rend : ce que portera `passeCommencee`. */
export function poserLesStatutsDeLaPreparation(statuts: readonly StatutAPoser[]): void {
  for (const s of statuts) definirStatut(s.id, s.statut, s.progression);
}

export interface PretsDuRecepteur {
  passe: EtatDePasse;
  /** Les nœuds visibles, lus au moment de la pose : un nœud ajouté pendant la passe y est vu. */
  noeudsVisibles: () => readonly any[];
  /** Ce nœud est-il celui qu'on regarde : sélectionné ou terminal. Lu au moment où il finit. */
  estRegarde: (id: string) => boolean;
}

export interface RecepteurDeLaPasse {
  /** Ce que `emettre` appelle. Ne rend une promesse que pour la pose d'un nœud regardé. */
  recevoir: (evenement: EvenementDeLaBoucle) => Promise<void> | void;
  /** La pose des correctifs, que le ménage lit : ce qui est déjà posé, ce qui attend, et la pose de ce qui attend. */
  dejaPoses: Set<string>;
  aPoser: Set<string>;
  poserCeQuiEstPret: () => Promise<void>;
  /** Ce que le ménage et les lecteurs écrivent encore eux-mêmes, jusqu'à la pièce P4b. */
  definirStatut: (nodeId: string, statut: string, progression?: string) => void;
  poserResultat: (id: string, correctif: Record<string, unknown>) => void;
  poserApercu: (id: string, fraction: number | undefined) => void;
}

export function creerRecepteurDeLaPasse({ passe, noeudsVisibles, estRegarde }: PretsDuRecepteur): RecepteurDeLaPasse {
  const aPoser = new Set<string>();
  /**
   * Pose dans le magasin les correctifs des nœuds en attente.
   *
   * UN IDENTIFIANT QUI N'EST PAS CELUI D'UN NŒUD VISIBLE EST SAUTÉ, et c'est voulu : la boucle
   * tourne sur le graphe APLATI, où un membre de méta s'appelle « outil1::cd ». Son méta, lui,
   * agrège les résultats de ses internes et ne peut donc être posé qu'à la fin ; c'est la pose
   * forcée, après la boucle, qui s'en charge.
   */
  const dejaPoses = new Set<string>();
  const poserUnNoeud = async (id: string) => {
    aPoser.delete(id);
    const n = noeudsVisibles().find((x) => x.id === id);
    if (!n) return;
    const patch = await calculerCorrectifResultat(n, passe);
    if (patch) poserResultat(id, patch);
    dejaPoses.add(id);
  };
  const poserCeQuiEstPret = async () => { for (const id of [...aPoser]) await poserUnNoeud(id); };

  const recevoir = (e: EvenementDeLaBoucle): Promise<void> | void => {
    switch (e.genre) {
      case "statut":
        definirStatut(e.id, e.statut, e.progression, e.progressionDuNoeud);
        return;
      case "statutOmbre":
        poserStatutOmbre(e.id, e.visible, e.statut);
        return;
      case "noeudFini":
        // CE NŒUD-CI A FINI, ET C'EST MAINTENANT QU'IL A QUELQUE CHOSE À MONTRER : il rejoint ce qui
        // est à poser, et il est posé aussitôt s'il est regardé.
        aPoser.add(e.id);
        // SEUL LE NŒUD QU'ON REGARDE EST POSÉ PENDANT LE RUN, et les autres à la fin.
        //
        // POURQUOI CE PARTAGE, ET CE QU'IL COÛTE. Montrer un résultat coûte le rendu de ce résultat :
        // mesuré en A/B alterné sur douze nœuds, poser chacun pendant le run portait le run de 4 103
        // à 4 920 ms, soit +20 %. Ce n'est pas une inefficacité à corriger — `setNodes`, le double
        // calcul du correctif, le souffle et le parcours du tampon par l'indicateur de niveau ont été
        // éliminés tour à tour, et le coût est resté. C'est le prix du dessin, que l'ancien moteur ne
        // payait pas parce qu'il dessinait tout après le dernier nœud.
        //
        // ON NE LE PAIE DONC QUE POUR CE QU'ON REGARDE. Le nœud sélectionné ou terminal est posé
        // aussitôt, les autres à la fin de la boucle : le coût tombe de N nœuds à un ou deux, et l'on
        // voit sans attendre ce que l'on avait sous les yeux. Relevé par Fabien : « les lecteurs
        // apparaissent longtemps après que les nœuds soient notés comme terminés dans les workflows
        // longs ». La promesse n'est rendue, et attendue, que pour le nœud regardé.
        if (estRegarde(e.id)) return poserUnNoeud(e.id);
        return;
    }
  };

  return { recevoir, dejaPoses, aPoser, poserCeQuiEstPret, definirStatut, poserResultat, poserApercu };
}
