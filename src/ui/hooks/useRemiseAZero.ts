// ui/hooks/useRemiseAZero.ts — Remettre des nœuds à zéro : le bouton, le réglage, l'aval seul, tout.
//
// Sorti d'`useExecutionGraphe.ts` le 2026-11-02, à l'identique (sortie 2 du plan
// `work/plan-useExecutionGraphe-2026-11-01.md`). Les règles de ce qui s'efface et de ce qui se garde
// vivent dans `core/cycle-de-vie.ts` et `core/classes-de-champs.ts` ; la traversée dans
// `core/graphe.ts` ; les conteneurs dans `core/conteneurs.ts`. Ce crochet ne fait que les relier aux
// magasins et à l'état de React, et envoyer au moteur la commande qui abat le run en cours s'il y en a
// un, puis lâche ces nœuds de son cache.
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { descendants, type NoeudG } from "../../core";
import { CHAMPS_GARDES_AU_REGLAGE, CLASSES } from "../../core/classes-de-champs";
import { aRemettreAZero, avecLeursBulles } from "../../core/conteneurs";
import { apresEffacement, urlsARevoquer } from "../../core/cycle-de-vie";
import type { EnvoiDuCache } from "../moteur";
import { effacerResultats, resultatDe } from "../resultats";
import { reinitialiserStatuts } from "../statuts";

export interface OptionsRemiseAZero {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  envoyer: EnvoiDuCache;
  setNodes: Dispatch<SetStateAction<any[]>>;
}

export function useRemiseAZero({ noeudsRef, aretesRef, envoyer, setNodes }: OptionsRemiseAZero) {
  // ── Réinitialiser un ensemble de nœuds ──
  //
  // `garder` nomme les champs de résultat à laisser en place, et n'est employé que par le changement
  // de réglage : voir `CHAMPS_GARDES_AU_REGLAGE`. Le bouton de remise à zéro, lui, n'en passe pas.
  const reinitialiserIds = useCallback((demandes: Set<string>, garder?: ReadonlySet<string>) => {
    // Les bulles qui contiennent ces nœuds repartent avec eux : voir `avecLeursBulles`.
    const ids = avecLeursBulles(noeudsRef.current as unknown as NoeudG[], demandes);
    // Un reset pendant un run en cours signale l'annulation : sans ça, le nœud
    // en cours de calcul (ex. extraction de features piste par piste sur une
    // grosse collection) continue en arrière-plan et écrase l'état qu'on vient
    // de réinitialiser dès son prochain onProgress ou sa fin d'exécution.
    //
    // C'EST LA COMMANDE `remettreAZero` QUI L'ABAT, depuis la pièce P5b, et elle lâche du même coup ces
    // nœuds du cache, les internes de leurs métas et leurs copies de boucle ou d'instrument (`ui/moteur/cache.ts`).
    // L'annulation était un appel à part, ici, et la purge venait en dernier : le moteur les fait
    // ensemble, avant que rien ne soit effacé. Rien ne lit le cache entre les deux, l'ensemble étant
    // synchrone. Un méta dont on n'effaçait que l'identifiant visible voyait le run suivant reprendre
    // tout son contenu du cache : mesuré, ses quatre nœuds internes repris et seule l'aval refaite.
    envoyer({ genre: "remettreAZero", ids: [...ids] });
    // Les révocations AVANT `setNodes`, et non dans son updater : celui-ci doit
    // être pur. Double-invoqué par StrictMode, il révoquait deux fois — sans
    // conséquence ici, la révocation étant idempotente — mais c'est le même motif
    // qui, à la création d'URL, laissait un blob orphelin par nœud et par run.
    //
    // ON RÉVOQUE CE QUI EST UNE URL D'OBJET, ET NON UNE LISTE DE NOMS. Quatre champs y étaient
    // énumérés à la main, et c'était la même divergence que celle qui a fait survivre des résultats à
    // la remise à zéro : les films du montage vidéo, de l'extrait, du muet et de la démonstration
    // sont eux aussi des `createObjectURL`, et aucun n'y figurait — un blob par nœud et par run
    // restait donc en mémoire. La seule liste qui décide est `CHAMPS_RESULTAT`, et la valeur dit
    // d'elle-même si elle est à révoquer.
    //
    // ET LES URL SE CHERCHENT DANS LE MAGASIN DES RÉSULTATS, où elles vivent désormais. Les
    // chercher encore dans `node.data` n'aurait rien trouvé, et un blob par nœud et par run serait
    // resté en mémoire — le défaut même que le commentaire ci-dessus raconte, à l'endroit suivant.
    for (const n of noeudsRef.current) {
      if (!ids.has(n.id)) continue;
      for (const url of urlsARevoquer(resultatDe(n.id) as any, CLASSES, garder)) URL.revokeObjectURL(url);
    }
    // L'ÉTAT D'EXÉCUTION ET LE RÉSULTAT VIVENT DANS LEURS MAGASINS : les effacer ne passe plus par
    // le tableau des nœuds. `garder` y vaut comme ici, pour qu'un réglage laisse en place ce que le
    // run avait DÉSIGNÉ de ses entrées. Voir `ui/statuts.ts` et `ui/resultats.ts`.
    reinitialiserStatuts(ids);
    effacerResultats(ids, garder);
    setNodes((nds) => nds.map((n) => {
      if (!ids.has(n.id)) return n;
      // LA RÈGLE EST DANS `core/cycle-de-vie.ts`, ce crochet ne fait que l'appliquer : c'est ce qui
      // permet à un banc d'éprouver la transition sur les 448 fiches sans monter React.
      const { etat, saisiesSauvees } = apresEffacement(n.data as any, CLASSES, garder);
      for (const champ of saisiesSauvees) {
        console.warn(`[reinitialiserIds] Tentative de réinitialisation du champ utilisateur "${champ}" — opération annulée.`);
      }
      return { ...n, data: etat as typeof n.data };
    }));
  }, [setNodes]);

  // ── Les deux réinitialisations ──
  //
  // Elles ne diffèrent que sur le nœud de départ, et ce détail décide de ce que
  // l'utilisateur voit :
  //
  //   `reinitialiserNoeud` — le nœud ET son aval. Pour un changement qui rend
  //   FAUSSE la sortie du nœud : un autre fichier, un autre paramètre.
  //
  //   `reinitialiserAval` — son aval SEUL. Pour un changement qui périme ce que
  //   l'aval en a tiré sans toucher ce que le nœud affiche. Effacer le nœud
  //   ferait disparaître sa forme d'onde et son lecteur à chaque zone ajoutée,
  //   alors qu'on ajoute justement les zones les unes après les autres en
  //   regardant l'onde.
  //
  // La traversée vit dans core/graphe.ts (testée) ; `aretesRef` garantit des
  // arêtes à jour plutôt qu'une closure périmée. UNE BULLE SE REMET À ZÉRO PAR SES MEMBRES, et
  // chacun avec son aval : voir `aRemettreAZero` dans `core/conteneurs.ts`.
  const reinitialiserNoeud = useCallback((nodeId: string) => {
    const departs = aRemettreAZero(noeudsRef.current as unknown as NoeudG[], nodeId);
    reinitialiserIds(new Set(departs.flatMap((id) => [id, ...descendants(id, aretesRef.current)])));
  }, [reinitialiserIds]);

  /**
   * La remise à zéro d'un changement de RÉGLAGE, et non du bouton.
   *
   * DEUX PORTÉES, ET C'EST TOUT L'OBJET. L'aval est effacé entièrement : ses entrées viennent de
   * changer, donc tout ce qu'il en a tiré est faux, tampons compris. Le nœud réglé, lui, garde ce
   * qu'il avait désigné de SES entrées — un réglage ne les touche pas — et c'est ce qui permet de
   * continuer à entendre son montage pendant qu'on le règle.
   */
  const reinitialiserPourReglage = useCallback((nodeId: string) => {
    reinitialiserIds(descendants(nodeId, aretesRef.current));
    reinitialiserIds(new Set([nodeId]), CHAMPS_GARDES_AU_REGLAGE);
  }, [reinitialiserIds]);

  const reinitialiserAval = useCallback((nodeId: string) => {
    reinitialiserIds(descendants(nodeId, aretesRef.current));
  }, [reinitialiserIds]);

  // ── Réinitialiser tous les nœuds (reset global) ──
  const reinitialiserTout = useCallback(() => {
    const ids = new Set(noeudsRef.current.map((n) => n.id));
    reinitialiserIds(ids);
  }, [reinitialiserIds]);

  /**
   * Les zones choisies sur un nœud ont changé : son AVAL SEUL est remis à zéro, et c'est la seule
   * cascade qui le soit.
   *
   * Le nœud garde son résultat : sa sortie audio est l'entrée transmise telle quelle, que les zones ne
   * changent pas, et l'effacer ferait disparaître sa forme d'onde et son lecteur à chaque zone
   * ajoutée, alors qu'on les pose justement les unes après les autres en regardant l'onde. Son aval,
   * lui, est bien périmé : un « Masque de zones » restait affiché « Terminé » avec le trou de
   * l'ancienne zone dans son WAV, alors que le sélecteur n'en montrait plus aucune.
   *
   * LE GESTE ÉTAIT ÉCRIT DANS `App.tsx`, en ligne, jusqu'au 2026-11-19 : l'oubli du cache, l'écriture
   * des zones et la remise à zéro de l'aval, hors de ce crochet. Le point 3 du diagnostic
   * d'`ARCHITECTURE.md` le reprochait, et `plugins/cycle-de-vie-noeuds.test.ts` refuse désormais
   * qu'`App.tsx` remette lui-même un aval à zéro.
   *
   * L'OUBLI DU NŒUD DANS LE CACHE N'EST PLUS CE QUI LE FAIT RECALCULER : depuis la PR 390, les zones
   * entrent dans l'empreinte de ses réglages (`core/graphe.ts`), et la clé change avec elles. Il reste
   * pour lâcher tout de suite les tampons d'un résultat qui ne servira plus.
   */
  const changerZones = useCallback((nodeId: string, zones: { debut: number; duree: number }[]) => {
    envoyer({ genre: "oublier", ids: [nodeId] });
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, zonesSelectionnees: zones } } : n));
    reinitialiserAval(nodeId);
  }, [envoyer, setNodes, reinitialiserAval]);

  return { reinitialiserNoeud, reinitialiserPourReglage, reinitialiserAval, reinitialiserTout, changerZones };
}
