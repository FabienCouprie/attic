// ui/recepteur-moteur.ts — Le récepteur : ce que le moteur dit, appliqué aux magasins de l'interface.
//
// POURQUOI. Pièces P4a et P4b du plan de l'architecture par messages entre l'interface et le moteur.
// La boucle d'une passe recevait trois fonctions qui écrivaient dans les magasins, la pose d'un
// statut, celle d'une ombre et `quandUnNoeudAFini`, et le ménage d'après passe écrivait lui-même la
// pose finale, les temps, les écarts, les champs autonomes et le statut des conteneurs. Le moteur ne
// fait plus que dire des événements du protocole (`core/protocole-moteur.ts`), et c'est ce module
// qui les applique, un événement pour un appel, dans le même ordre et avec la même attente.
//
// IL NE LIT AUCUNE TABLE DU MOTEUR. Ce que le nœud visible montre arrive tout choisi, dans
// `noeudFini` pendant la boucle et dans le bilan pour la pose finale (`core/rendu-du-visible.ts`) ;
// le récepteur décide de l'affichage, avec le graphe de la passe et les références vivantes de
// `PretsDeLAffichage`. `docs/frontiere-moteur.test.ts` tient les deux côtés : hors du récepteur, du
// correctif qu'il appelle et de la réparation des aperçus, rien n'importe une pose des magasins, et
// aucun des trois n'importe les tables du moteur.
//
// UN RÉCEPTEUR PAR PASSE. Ce qu'une passe a posé, ce qui lui reste à poser et les demandes qu'elle a
// reçues sont à elle : le bilan les lit. Les passes se suivent, l'ordonnanceur n'en fait jamais
// tourner deux. La pièce P5 donnera le récepteur au moteur à sa construction.
import type { Dispatch, SetStateAction } from "react";
import { statutDuContenu } from "../core/conteneurs";
import type { StatutAPoser } from "../core/preparation-passe";
import type { EvenementDuMoteur, RenduDuVisible } from "../core/protocole-moteur";
import type { DemandeAuMoteur } from "../core/types";
import { calculerCorrectifResultat, type PretsDeLAffichage } from "./correctif-resultat";
import { poserResultat } from "./resultats";
import { poserApercu, poserStatut, poserStatutOmbre, statutDe } from "./statuts";

/** Les événements qu'une passe dit au récepteur : ceux de sa boucle, puis ceux de son ménage. */
export type EvenementDeLaPasse = Extract<EvenementDuMoteur<unknown>, { genre: "statut" | "statutOmbre" | "noeudFini" | "demande" | "bilan" }>;
type Bilan = Extract<EvenementDeLaPasse, { genre: "bilan" }>;

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
  /** Ce que l'affichage d'un rendu lit : le graphe de la passe, ses lecteurs promis, trois références vivantes. */
  affichage: PretsDeLAffichage;
  /** Les nœuds visibles, lus au moment de la pose : un nœud ajouté pendant la passe y est vu. */
  noeudsVisibles: () => readonly any[];
  /** Ce nœud est-il celui qu'on regarde : sélectionné ou terminal. Lu au moment où il finit. */
  estRegarde: (id: string) => boolean;
  /** Le report des champs autonomes sur l'état des nœuds. */
  setNodes: Dispatch<SetStateAction<any[]>>;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

export interface RecepteurDeLaPasse {
  /** Ce que le moteur appelle. Ne rend une promesse que pour la pose d'un nœud regardé, et pour le bilan. */
  recevoir: (evenement: EvenementDeLaPasse) => Promise<void> | void;
  /** Les lecteurs promis, écrits un par un une fois le bilan posé. */
  ecrireLesLecteurs: (signal: AbortSignal) => Promise<void>;
}

export function creerRecepteurDeLaPasse(p: PretsDuRecepteur): RecepteurDeLaPasse {
  const { affichage, noeudsVisibles, estRegarde } = p;
  const aPoser = new Set<string>();
  /**
   * Pose dans le magasin le correctif d'un nœud, d'après ce qu'il a rendu.
   *
   * UN IDENTIFIANT QUI N'EST PAS CELUI D'UN NŒUD VISIBLE EST SAUTÉ, et c'est voulu : la boucle
   * tourne sur le graphe APLATI, où un membre de méta s'appelle « outil1::cd ». Son méta, lui,
   * agrège les résultats de ses internes et ne peut donc être posé qu'à la fin ; c'est la pose
   * forcée, après la boucle, qui s'en charge.
   */
  const dejaPoses = new Set<string>();
  const poserUnNoeud = async (id: string, rendu: RenduDuVisible<unknown> | undefined) => {
    aPoser.delete(id);
    const n = noeudsVisibles().find((x) => x.id === id);
    if (!n) return;
    const patch = await calculerCorrectifResultat(n, rendu, affichage);
    if (patch) poserResultat(id, patch);
    dejaPoses.add(id);
  };
  /**
   * LES DEMANDES ATTENDENT LE BILAN. Le moteur les dit à son ménage, avant le bilan ; elles partent
   * vers l'atelier après la pose finale, les temps et les écarts, là où le ménage les transmettait.
   */
  const demandes = new Map<string, DemandeAuMoteur>();

  const appliquerLeBilan = async (b: Bilan) => {
    // CE QUI A EMPÊCHÉ UNE BOUCLE DE SE DÉPLIER SE DIT SUR LE NŒUD, avant la pose : le moteur a mis la
    // raison dans son message, et le nœud passe en erreur. Voir `ui/menage-apres-passe.ts`.
    for (const [visible, dit] of b.problemesDeBoucle) definirStatut(visible, "erreur", dit);

    // LA POSE FINALE, QUI NE LAISSE PERSONNE DE CÔTÉ. Les nœuds ordinaires ont déjà été posés par
    // paquets pendant la boucle ; celle-ci reprend TOUT LE MONDE, et c'est elle qui sert :
    //
    //   — les métas et les bulles, qui agrègent les résultats de leurs internes et ne pouvaient
    //     donc pas être posés plus tôt ;
    //   — les messages complétés APRÈS la boucle, la graine tirée et la cause d'une boucle non
    //     dépliée, qui sont rangés sous l'identifiant VISIBLE et non sous celui d'une copie. Un
    //     nœud posé tôt a donc pu montrer son message sans son tirage de graine pendant un instant,
    //     et cette pose-ci le corrige.
    //
    // ET ELLE NE REFAIT PAS LE TRAVAIL DÉJÀ FAIT. Reprendre tout le monde recalculait le correctif
    // de chaque nœud une seconde fois, et ce n'est pas gratuit : mesuré sur douze nœuds, **540 ms**,
    // soit quarante-cinq par nœud. Seuls repassent ici ceux qui n'ont pas encore été posés, et ceux
    // dont le message a été complété après la boucle. Ce que chacun montre est celui du bilan,
    // choisi une fois les messages complétés.
    const reprendre = new Set(b.messagesCompletes);
    for (const n of noeudsVisibles()) {
      if (!dejaPoses.has(n.id) || reprendre.has(n.id)) aPoser.add(n.id);
    }
    const rendus = new Map(b.rendus);
    for (const id of [...aPoser]) await poserUnNoeud(id, rendus.get(id));

    // LE TEMPS D'EXÉCUTION ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN comme le reste du résultat :
    // ce sont deux comptes rendus du run, cumulés par nœud VISIBLE, méta compris. Le magasin ne
    // prévient pas quand la valeur ne change pas, ce que les deux `setNodes` d'avant faisaient à la
    // main en comparant le champ.
    for (const [id, temps] of b.temps) poserResultat(id, { tempsExecution: temps });
    for (const [id, e] of b.ecarts) poserResultat(id, { ecartNiveau: e });

    // LES DEMANDES SE LISENT DANS LE RETOUR DU RUN, et rien n'est à effacer ensuite : elles ne se
    // sont jamais posées sur un nœud. Le composant rend sa demande au lieu de l'écrire.
    for (const [nodeId, demande] of demandes) {
      if (p.onGrapheGenere && demande.grapheACreer?.nodes && demande.grapheACreer?.edges) {
        p.onGrapheGenere(nodeId, { nodes: demande.grapheACreer.nodes, edges: demande.grapheACreer.edges });
      }
    }
    if (p.onNodeInstalle && [...demandes.values()].some((d) => d.paletteARelire)) p.onNodeInstalle();

    // LES CHAMPS AUTONOMES, préfixés `_`, qu'un composant à `affichageAutonome: true` a écrits sur le
    // nœud de la passe : sans ce report, personne ne les verrait. Un nœud dont aucun champ ne change
    // garde son objet. Les deux canaux déclarés ne passent pas par ici : ils viennent du rendu.
    const champsAutonomesParNoeud = new Map(b.champsAutonomes);
    if (champsAutonomesParNoeud.size > 0) {
      p.setNodes((nds2) =>
        nds2.map((n) => {
          const champs = champsAutonomesParNoeud.get(n.id);
          if (!champs) return n;
          const change = Object.keys(champs).some((cle) => (n.data as any)[cle] !== champs[cle]);
          return change ? { ...n, data: { ...n.data, ...champs } } : n;
        })
      );
    }

    // LE STATUT FINAL D'UN CONTENEUR EST CELUI DE TOUT SON CONTENU : en erreur si l'un a échoué,
    // terminé si tous ont fini, en attente sinon, et il dit alors combien. Il était pris sur les seuls
    // nœuds DE CE RUN : un ▶ posé en aval d'une branche déclarait terminée une bulle dont six membres
    // sur huit n'avaient jamais tourné. Il se lit donc ici, dans le magasin, sur les statuts de toutes
    // les passes. L'erreur qu'un méta s'est vu poser, sorties vides, reste la sienne. La laisser
    // « en cours » après le run ferait croire à un calcul qui n'en finit pas.
    for (const [c, contenu] of b.conteneurs) {
      if (statutDe(c).statut === "erreur") continue;
      const s = statutDuContenu(contenu.map((id) => statutDe(id).statut));
      const partiel = affichage.t("conteneur.partiel").replace("{n}", String(s.faits)).replace("{total}", String(s.total));
      definirStatut(c, s.statut, s.statut === "attente" ? partiel : undefined);
    }
  };

  const recevoir = (e: EvenementDeLaPasse): Promise<void> | void => {
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
        if (estRegarde(e.id)) return poserUnNoeud(e.id, e.rendu);
        return;
      case "demande":
        demandes.set(e.id, e.demande);
        return;
      case "bilan":
        return appliquerLeBilan(e);
    }
  };

  /**
   * Les lecteurs, écrits après que tout est posé.
   *
   * CHACUN PARAÎT DÈS QU'IL EST PRÊT, et non tous ensemble à la fin : sur une chaîne de sept nœuds
   * audio, attendre le dernier encodage pour montrer le premier lecteur était la moitié du défaut
   * relevé. Pendant son écriture, le nœud dit où elle en est : il est déjà terminé, son tampon est
   * posé, il s'écoute déjà par le bouton, et c'est le lecteur qui se fabrique.
   */
  const ecrireLesLecteurs = async (signal: AbortSignal): Promise<void> => {
    const { lecteursAEcrire, souffle } = affichage;
    for (const [id, ecrire] of lecteursAEcrire) {
      if (signal.aborted) break;
      poserApercu(id, 0);
      try {
        const url = await ecrire();
        if (url) {
          const ficheId = noeudsVisibles().find((n) => n.id === id)?.data.ficheId;
          poserResultat(id, { audioResultatUrl: url, audioResultatNom: `${ficheId}.wav` });
        }
      } catch (e) {
        // UN LECTEUR QUI NE S'ÉCRIT PAS N'EMPORTE PAS LE RUN, et c'est le second intérêt de l'avoir
        // sorti de la pose : le résultat est déjà posé, le tampon est là, et le bouton « Écouter »
        // reste la voie d'écoute. Avant, cette exception remontait avant tout `setNodes`, et le nœud
        // perdait jusqu'à son message.
        console.error("[apercu] écriture du lecteur impossible", id, e);
      } finally {
        poserApercu(id, undefined);
      }
      await souffle.tour();
    }
  };

  return { recevoir, ecrireLesLecteurs };
}
