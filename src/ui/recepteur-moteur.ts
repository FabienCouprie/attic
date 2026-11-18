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
// ET LA PASSE LUI DIT QU'ELLE COMMENCE ET QU'ELLE FINIT, depuis la pièce P5a, qui a mis la passe dans
// le dossier du moteur, sans React. Ce qu'elle écrivait elle-même au début et dans son `finally` est
// ici : le drapeau « le moteur tourne » d'une passe globale, les statuts de la préparation, la
// remise des « en cours » après un arrêt et l'effacement de la priorité. Le récepteur dit aussi qui
// est regardé, sur les nœuds de la passe que `passeCommencee` lui donne.
//
// UN RÉCEPTEUR POUR LA VIE DU MOTEUR, UN ÉTAT PAR PASSE, depuis la pièce P5b. Le pont le construit une
// fois et le donne au moteur à sa construction. Ce qu'une passe a posé, ce qui lui reste à poser, les
// demandes qu'elle a reçues, ses lecteurs promis et sa respiration sont à elle, et `passeCommencee`
// les remet à neuf : les passes se suivent, l'ordonnanceur n'en fait jamais tourner deux. Le bilan
// posé, le récepteur écrit les lecteurs, et `passeArretee` interrompt cette écriture.
import type { Dispatch, SetStateAction } from "react";
import { estCacheParBulle } from "../core";
import { statutDuContenu } from "../core/conteneurs";
import { noeudRegarde } from "../core/memoire";
import type { EvenementDuMoteur, RecepteurDuMoteur, RenduDuVisible } from "../core/protocole-moteur";
import { Respiration } from "../core/respirer";
import type { DemandeAuMoteur } from "../core/types";
import { calculerCorrectifResultat, type PretsDeLAffichage } from "./correctif-resultat";
import { definirPrioritaire, noeudPrioritaire } from "./priorite";
import { poserResultat } from "./resultats";
import { poserApercu, poserStatut, poserStatutOmbre, reinitialiserStatuts, statutDe, statutsPoses } from "./statuts";

type Bilan = Extract<EvenementDuMoteur<unknown>, { genre: "bilan" }>;

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

/** Ce que le pont lie au rendu, lu au début de chaque passe : la langue et les deux rappels de l'atelier. */
export interface LiaisonDuRecepteur {
  t: (cle: string) => string;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

/** Les lecteurs qu'une passe promet, par nœud. */
type Lecteurs = PretsDeLAffichage["lecteursAEcrire"];

export interface PretsDuRecepteur {
  /**
   * Ce que l'affichage d'un rendu lit, hors de ce que chaque passe a en propre : le registre et trois
   * références vivantes. Les nœuds de la passe arrivent avec `passeCommencee`, la langue avec la liaison.
   */
  affichage: Omit<PretsDeLAffichage, "tousNoeudsG" | "souffle" | "lecteursAEcrire" | "t">;
  /** Les nœuds visibles, lus au moment de la pose : un nœud ajouté pendant la passe y est vu. */
  noeudsVisibles: () => readonly any[];
  /** Le report des champs autonomes sur l'état des nœuds. */
  setNodes: Dispatch<SetStateAction<any[]>>;
  /** Dire que le moteur tourne, ou ne tourne plus. Seule une passe globale le dit. */
  enExecution: (tourne: boolean) => void;
  /**
   * La langue et les rappels de l'atelier, que le pont tient à jour à chaque rendu. LUS AU DÉBUT DE LA
   * PASSE, et gardés jusqu'à sa fin : une passe ne change pas de langue en route.
   */
  liaison: () => LiaisonDuRecepteur;
  /** La respiration de l'écriture des lecteurs, neuve à chaque passe. Un essai la donne sans délai. */
  respiration?: () => Respiration;
  /** La table des lecteurs promis, neuve à chaque passe. Un essai y met les siens. */
  lecteurs?: () => Lecteurs;
}

export interface RecepteurDuShell {
  /**
   * Ce que le moteur appelle, pour toutes ses passes. Ne rend une promesse que pour la pose d'un nœud
   * regardé, et pour le bilan, qui comprend l'écriture des lecteurs.
   */
  recevoir: RecepteurDuMoteur<unknown>;
}

/** Ce qui est à une passe, et que `passeCommencee` remet à neuf. */
interface EtatDeLaPasse {
  /** Ce que l'affichage lit pendant la passe : ses nœuds, ses lecteurs promis, sa respiration, sa langue. */
  affichage: PretsDeLAffichage;
  liaison: LiaisonDuRecepteur;
  aPoser: Set<string>;
  /**
   * Ce qui a été posé pendant la boucle. UN IDENTIFIANT QUI N'EST PAS CELUI D'UN NŒUD VISIBLE EST
   * SAUTÉ, et c'est voulu : la boucle tourne sur le graphe APLATI, où un membre de méta s'appelle
   * « outil1::cd ». Son méta, lui, agrège les résultats de ses internes et ne peut donc être posé
   * qu'à la fin ; c'est la pose forcée, après la boucle, qui s'en charge.
   */
  dejaPoses: Set<string>;
  /**
   * LES DEMANDES ATTENDENT LE BILAN. Le moteur les dit à son ménage, avant le bilan ; elles partent
   * vers l'atelier après la pose finale, les temps et les écarts, là où le ménage les transmettait.
   */
  demandes: Map<string, DemandeAuMoteur>;
  /** La passe a été arrêtée : l'écriture des lecteurs s'arrête avant le suivant. */
  arretee: boolean;
}

export function creerRecepteurDuMoteur(p: PretsDuRecepteur): RecepteurDuShell {
  const { noeudsVisibles } = p;
  const respiration = p.respiration ?? (() => new Respiration());
  const lecteurs = p.lecteurs ?? ((): Lecteurs => new Map());
  /**
   * L'état d'une passe neuve. LES NŒUDS DE LA PASSE ET SA RESPIRATION ARRIVENT AVEC `passeCommencee` :
   * la respiration part alors, une fois la préparation faite. Elle partait juste avant la boucle,
   * quelques millisecondes plus tard ; elle ne sert qu'à l'écriture des lecteurs.
   */
  const neuve = (tousNoeudsG: PretsDeLAffichage["tousNoeudsG"]): EtatDeLaPasse => {
    // COPIÉE, ET NON PRÊTÉE : le pont la récrit à chaque rendu, et la passe garde la sienne.
    const liaison = { ...p.liaison() };
    return {
      affichage: { ...p.affichage, tousNoeudsG, lecteursAEcrire: lecteurs(), souffle: respiration(), t: liaison.t },
      liaison, aPoser: new Set(), dejaPoses: new Set(), demandes: new Map(), arretee: false,
    };
  };
  let passe = neuve([]);
  /**
   * Ce nœud-ci est-il celui qu'on REGARDE : sélectionné, ou terminal.
   *
   * C'EST LA MÊME NOTION QUE POUR LA GARDE DES DIX MINUTES, et c'est voulu : le nœud qu'on
   * regarde est celui dont l'aperçu mérite d'être construit, et celui dont le résultat mérite
   * d'être montré sans attendre. Un seul endroit décide de ce qu'« être regardé » veut dire. Il se lit
   * au moment où le nœud finit : un câble tiré pendant un run long compte.
   */
  const estRegarde = (id: string) => noeudRegarde({
    id,
    selectionne: !!noeudsVisibles().find((x) => x.id === id)?.selected,
    aretes: passe.affichage.aretesRef.current,
    dansUnMeta: (passe.affichage.pileMetaRef?.current?.length ?? 0) > 0,
    cacheParBulle: estCacheParBulle(passe.affichage.tousNoeudsG, id),
  });
  /** Pose dans le magasin le correctif d'un nœud, d'après ce qu'il a rendu. */
  const poserUnNoeud = async (ici: EtatDeLaPasse, id: string, rendu: RenduDuVisible<unknown> | undefined) => {
    ici.aPoser.delete(id);
    const n = noeudsVisibles().find((x) => x.id === id);
    if (!n) return;
    const patch = await calculerCorrectifResultat(n, rendu, ici.affichage);
    if (patch) poserResultat(id, patch);
    ici.dejaPoses.add(id);
  };

  const appliquerLeBilan = async (ici: EtatDeLaPasse, b: Bilan) => {
    const { aPoser, dejaPoses, demandes, liaison, affichage } = ici;
    // CE QUI A EMPÊCHÉ UNE BOUCLE DE SE DÉPLIER SE DIT SUR LE NŒUD, avant la pose : le moteur a mis la
    // raison dans son message, et le nœud passe en erreur. Voir `ui/moteur/menage-apres-passe.ts`.
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
    for (const id of [...aPoser]) await poserUnNoeud(ici, id, rendus.get(id));

    // LE TEMPS D'EXÉCUTION ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN comme le reste du résultat :
    // ce sont deux comptes rendus du run, cumulés par nœud VISIBLE, méta compris. Le magasin ne
    // prévient pas quand la valeur ne change pas, ce que les deux `setNodes` d'avant faisaient à la
    // main en comparant le champ.
    for (const [id, temps] of b.temps) poserResultat(id, { tempsExecution: temps });
    for (const [id, e] of b.ecarts) poserResultat(id, { ecartNiveau: e });

    // LES DEMANDES SE LISENT DANS LE RETOUR DU RUN, et rien n'est à effacer ensuite : elles ne se
    // sont jamais posées sur un nœud. Le composant rend sa demande au lieu de l'écrire.
    for (const [nodeId, demande] of demandes) {
      if (liaison.onGrapheGenere && demande.grapheACreer?.nodes && demande.grapheACreer?.edges) {
        liaison.onGrapheGenere(nodeId, { nodes: demande.grapheACreer.nodes, edges: demande.grapheACreer.edges });
      }
    }
    if (liaison.onNodeInstalle && [...demandes.values()].some((d) => d.paletteARelire)) liaison.onNodeInstalle();

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

  const recevoir = (e: EvenementDuMoteur<unknown>): Promise<void> | void => {
    switch (e.genre) {
      case "passeCommencee":
        passe = neuve(e.noeuds);
        // SEULE UNE PASSE GLOBALE DIT QUE LE MOTEUR TOURNE : une passe ciblée ne doit pas effacer l'état
        // d'une passe globale encore en cours. La référence est mise à vrai avec l'état, sans attendre
        // React, pour bloquer les doubles clics.
        if (!e.cible) p.enExecution(true);
        // LES STATUTS DE LA PRÉPARATION, dans l'ordre où elle les rend.
        for (const s of e.statuts) definirStatut(s.id, s.statut, s.progression);
        return;
      case "passeTerminee":
        // Le nœud qui tournait à l'instant de l'arrêt garde le statut « en cours » : la
        // boucle sort par un `break` sans jamais statuer sur lui. Une réinitialisation
        // remettait tout à « attente », mais un arrêt simple ne touche à rien — le nœud
        // resterait donc à tourner à l'écran, indéfiniment, sans que rien ne tourne.
        if (e.raison === "arret") {
          for (const id of statutsPoses()) {
            if (statutDe(id).statut === "en_cours") reinitialiserStatuts([id]);
          }
        }
        // Seul le run global a positionné le drapeau ; une exécution ciblée (nœud prioritaire) ne
        // doit PAS effacer l'état d'un run global encore en cours.
        //
        // La référence est remise à faux ICI, et pas seulement par l'effet qui la synchronise sur
        // l'état React : `lancer` la lit pour refuser un second run, et le début de la passe la met à
        // vrai de la même façon, sans attendre React. Sans cela, relancer aussitôt après la fin d'un
        // run — ce qu'on fait naturellement après avoir cliqué sur « Arrêter » — tombait dans le
        // garde-fou anti-double-clic et ne faisait rien du tout. Un test de bout en bout l'a pris sur
        // le fait : après un arrêt, la barre d'espace laissait les quatorze nœuds « en attente ».
        if (!e.cible) p.enExecution(false);
        // Lire la valeur LIVE pour toujours effacer la priorité après le run — sinon le run global
        // suivant reste filtré sur l'ancien nœud prioritaire. Le magasin d'`ui/priorite.ts` la tient
        // vive, et ne prévient que le nœud qui la perd.
        if (noeudPrioritaire()) definirPrioritaire(null);
        return;
      case "passeArretee":
        passe.arretee = true;
        return;
      case "statut":
        definirStatut(e.id, e.statut, e.progression, e.progressionDuNoeud);
        return;
      case "statutOmbre":
        poserStatutOmbre(e.id, e.visible, e.statut);
        return;
      case "noeudFini":
        // CE NŒUD-CI A FINI, ET C'EST MAINTENANT QU'IL A QUELQUE CHOSE À MONTRER : il rejoint ce qui
        // est à poser, et il est posé aussitôt s'il est regardé.
        passe.aPoser.add(e.id);
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
        if (estRegarde(e.id)) return poserUnNoeud(passe, e.id, e.rendu);
        return;
      case "demande":
        passe.demandes.set(e.id, e.demande);
        return;
      case "bilan":
        return poserLeBilanPuisLesLecteurs(passe, e);
    }
  };

  /** Le bilan, puis les lecteurs : la promesse du bilan comprend les deux, et le ménage l'attend. */
  const poserLeBilanPuisLesLecteurs = async (ici: EtatDeLaPasse, b: Bilan) => {
    await appliquerLeBilan(ici, b);
    await ecrireLesLecteurs(ici);
  };

  /**
   * Les lecteurs, écrits après que tout est posé.
   *
   * CHACUN PARAÎT DÈS QU'IL EST PRÊT, et non tous ensemble à la fin : sur une chaîne de sept nœuds
   * audio, attendre le dernier encodage pour montrer le premier lecteur était la moitié du défaut
   * relevé. Pendant son écriture, le nœud dit où elle en est : il est déjà terminé, son tampon est
   * posé, il s'écoute déjà par le bouton, et c'est le lecteur qui se fabrique.
   *
   * UNE PASSE ARRÊTÉE N'ÉCRIT PAS LE SUIVANT : `passeArretee` arrive à l'instant de l'arrêt, là où le
   * signal de la passe était lu avant chaque lecteur.
   */
  const ecrireLesLecteurs = async (ici: EtatDeLaPasse): Promise<void> => {
    const { lecteursAEcrire, souffle } = ici.affichage;
    for (const [id, ecrire] of lecteursAEcrire) {
      if (ici.arretee) break;
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

  return { recevoir };
}
