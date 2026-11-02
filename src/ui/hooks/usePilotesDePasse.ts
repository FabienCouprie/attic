// ui/hooks/usePilotesDePasse.ts — Les deux pilotes de passes : le lot, qui rejoue le graphe une fois
// par fichier, et la boucle sur une valeur, qui le rejoue une fois par morceau de ce qui circule.
//
// Sortis d'`useExecutionGraphe.ts` le 2026-11-01, à l'identique (sortie 1 du plan
// `work/plan-useExecutionGraphe-2026-11-01.md`). Ils ne connaissent ni la topologie, ni les
// résultats, ni rien du moteur : ils rejouent `lancerUnePasse`, qui reste une exécution entière avec
// ses statuts, son cache, son annulation et son `AbortController`. C'est le seul endroit du shell qui
// importe `plugins/lotGlobal` et `plugins/boucleSequencesGlobal`, et c'est un choix écrit : les
// généraliser demanderait de réécrire les deux boucles imbriquées, qui portent l'oubli de cache par
// passe et l'ordre d'emboîtement du lot autour des boucles — deux corrections durement acquises,
// qu'aucun test n'éprouve aujourd'hui ensemble. Voir `ui/services-orchestration.ts`.
//
// LES TROIS RÉPÉTITIONS S'EMBOÎTENT DANS L'ORDRE OÙ ELLES SE LISENT : le lot dehors, les boucles par
// passes dedans, et l'exécution du graphe au fond. Le drapeau d'arrêt du lot reste au moteur, qui le
// lève dans `arreter` ; il est reçu ici par sa référence.
import { useCallback } from "react";
import type { MutableRefObject } from "react";

import { ancetres, aplatirGraphe, descendants, estSubstitution, trouverMeta, type AreteG, type NoeudG } from "../../core";
import type { Sequence } from "../../audio/sequence";
import { planifierLot, publierLot } from "../../plugins/lotGlobal";
// LES BORNES SONT DÉCLARÉES AVEC LE COMPTEUR, ET NON ICI. Recopiées des deux côtés, elles auraient
// dérivé à la première qu'on aurait changée, et le test ne garderait plus que la copie du module.
import { avancerBoucles, planifierBoucles, publierBoucles, PASSES_MAX_TOTAL } from "../../plugins/boucleSequencesGlobal";
import type { JetonDeRun } from "../ordonnanceur-runs";
import { servicesOrchestration } from "../services-orchestration";
import type { PerimetreCible } from "./useExecutionGraphe";

export type LancerUnePasse = (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => Promise<void>;

export interface OptionsPilotesDePasse {
  lancerUnePasse: LancerUnePasse;
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  cacheExec: MutableRefObject<Map<string, any>>;
  /** Levé par « Arrêter » : le lot s'arrête au fichier en cours, et non à la seule passe. */
  arretLotRef: MutableRefObject<boolean>;
}

export function usePilotesDePasse({ lancerUnePasse, noeudsRef, aretesRef, cacheExec, arretLotRef }: OptionsPilotesDePasse) {
  /**
   * La boucle sur une VALEUR : le graphe entier, rejoué une fois par morceau de ce qui circule.
   *
   * CE QU'ELLE AJOUTE AUX TROIS AUTRES RÉPÉTITIONS, ET LE POINT DUR. Les trois connaissent leur
   * compte AVANT d'exécuter quoi que ce soit : un paramètre pour la boucle de graphe et
   * l'instrument, un dossier lu pour le lot. Une liste qui arrive par un câble, elle, ne se connaît
   * qu'une fois l'amont exécuté. D'où la PREMIÈRE PASSE DE DÉCOUVERTE : on lance une passe sans
   * savoir combien il en faudra, le nœud de début publie ce qu'il a trouvé, et l'on poursuit. Elle
   * ne coûte rien, étant la première passe utile et non une passe de plus.
   *
   * ELLE NE TOUCHE PAS AU MOTEUR, et c'est la condition de sa sûreté. Comme le lot, elle rejoue
   * `lancerUnePasse`, qui reste une exécution entière avec ses statuts, son cache, son annulation
   * et son `AbortController`. L'acyclicité du graphe n'est pas entamée : ce que `boucle-graphe.ts`
   * désigne comme ce qu'il ne fallait pas casser reste intact.
   *
   * SANS NŒUD DE BOUCLE, RIEN NE CHANGE : une seule passe, comme avant. Le plan coûte désormais un
   * aplatissement, c'est-à-dire un parcours du graphe qui n'exécute rien ; c'est le prix pour que le
   * contenu d'un méta-composant soit vu, et il se paie une fois par exécution, non une fois par
   * passe.
   */
  const lancerBoucleValeur = useCallback(async (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => {
    // LE PLAN SE FAIT SUR LE GRAPHE APLATI, ET NON SUR CELUI QU'ON VOIT — relevé par Fabien, qui
    // demandait si les changements faits sur les boucles valaient aussi pour les autres.
    //
    // CE QUI CLOCHAIT. Un nœud de boucle par passes s'apparie à sa boucle PAR SON IDENTIFIANT, et
    // c'est celui de son exécution qu'il donne (`ctx.noeud.id`). Dans un méta-composant, cet
    // identifiant est PRÉFIXÉ par celui du méta — `outil1::cd` —, quand le plan, lui, était fait sur
    // les nœuds visibles, où le méta n'est qu'UN nœud. La boucle n'était donc jamais planifiée : la
    // découverte n'avait pas lieu, le graphe tournait une passe, et rien ne prévenait. MESURÉ sur
    // une boucle à quatre créneaux suivie d'un rendu : quatre notes sur quatorze secondes posée sur
    // le canevas, UNE note sur deux secondes une fois les deux mêmes nœuds groupés en outil.
    //
    // ET `oublierLeCorps` SUIT, faute de quoi la moitié du travail serait faite : il efface du cache
    // ce qui doit rejouer, or le cache est rangé sous l'identifiant EXÉCUTÉ. Effacer `outil1` n'y
    // touchait rien, et le début de boucle, servi par le cache, n'aurait pas redécouvert.
    //
    // SANS MÉTA, RIEN NE CHANGE : l'aplatissement rend alors les mêmes nœuds sous les mêmes
    // identifiants. Les arêtes de substitution sont écartées comme le fait l'exécution, de sorte que
    // le plan porte sur le graphe qui va tourner et non sur celui qu'une bulle repliée donne à voir.
    const aretesReelles = (aretesRef.current as unknown as AreteG[]).filter((a) => !estSubstitution(a));
    const aplati = aplatirGraphe(noeudsRef.current as unknown as NoeudG[], aretesReelles, trouverMeta);
    const aretesG = () => aplati.aretes;
    const plan = planifierBoucles(
      aplati.noeuds,
      (id) => [...descendants(id, aretesG())],
      (id) => [...ancetres(id, aretesG())],
    );
    if (!plan) { publierBoucles([]); return lancerUnePasse(noeudPrioritaireId, perimetre, jeton); }
    if (plan.independantes) {
      console.warn("[attic] Deux boucles qui ne s'emboîtent pas : elles seront menées l'une dans l'autre.");
    }

    const etats = plan.boucles.map((b) => ({
      debutId: b.debutId, finsIds: b.finsIds, index: 0,
      morceaux: [] as Sequence[], recoltes: [] as Sequence[],
    }));

    /** Ce qui doit rejouer : le corps de ces boucles, désigné par ses deux bouts. */
    const oublierLeCorps = (depuis: number) => {
      const aRejouer = new Set<string>();
      for (let k = depuis; k < etats.length; k++) {
        aRejouer.add(etats[k].debutId);
        for (const id of descendants(etats[k].debutId, aretesG())) aRejouer.add(id);
        for (const finId of etats[k].finsIds) {
          aRejouer.add(finId);
          for (const id of ancetres(finId, aretesG())) aRejouer.add(id);
        }
      }
      for (const id of aRejouer) cacheExec.current.delete(id);
    };

    try {
      publierBoucles(etats);
      // LE CORPS EST OUBLIÉ AVANT LA DÉCOUVERTE, ET NON SEULEMENT ENTRE LES PASSES. Sans cela, un
      // second lancement du même graphe ne bouclait plus : le nœud de début, dont les réglages et
      // les entrées n'avaient pas changé, était servi par le cache, `decouvrirPour` n'était jamais
      // appelé, la boucle restait à zéro morceau, et la fin annonçait « toutes les passes sont
      // revenues vides ». Le premier lancement marchait, les suivants non, ce qui est le pire des
      // défauts à trouver. Relevé sur une boucle par créneau relancée deux fois de suite.
      oublierLeCorps(0);
      // La passe de découverte : chaque début y remplit ses morceaux.
      await lancerUnePasse(noeudPrioritaireId, perimetre, jeton);

      // LE COMPTEUR EST DANS `boucleSequencesGlobal.ts`, AVEC SES BORNES ET SES TESTS. Une mécanique
      // dont toute la valeur est de s'arrêter ne peut pas vivre dans un composant, où aucun test de
      // ce dépôt ne l'atteint.
      let faites = 1;
      while (avancerBoucles(etats)) {
        if (arretLotRef.current || faites >= PASSES_MAX_TOTAL) break;
        oublierLeCorps(0);
        await lancerUnePasse(noeudPrioritaireId, perimetre, jeton);
        faites++;
      }
    } finally {
      publierBoucles([]);
    }
  }, [lancerUnePasse]);

  /**
   * Le traitement par lot : le graphe entier, rejoué une fois par fichier.
   *
   * POURQUOI DES PASSES ET NON UN DÉPLIAGE. Les deux autres répétitions du projet — la boucle de
   * graphe et l'instrument — recopient la chaîne AVANT l'exécution, si bien que tous les tours
   * vivent ensemble. C'est sans conséquence sur une note de deux secondes ; c'en est une sur un
   * lot, où les fichiers font des minutes. Un morceau de trois minutes en stéréo pèse 63 Mo par
   * nœud : quatre nœuds sur trente fichiers demanderaient 7,5 Go. Ici chaque passe rend sa mémoire
   * avant la suivante — `setNodes` remplace les tampons —, et le nombre de fichiers n'a plus de
   * plafond.
   *
   * CE QUI RESTE DANS `lancerUnePasse`, ET C'EST VOLONTAIRE. Une passe est une exécution entière,
   * avec ses statuts, son cache, son annulation et son `AbortController`. L'enveloppe ne fait que
   * la rejouer : elle ne connaît ni la topologie, ni les résultats, ni rien du moteur. C'est la
   * raison pour laquelle cette mécanique-ci tient en trente lignes là où apprendre au moteur à
   * revenir en arrière aurait demandé de casser le cache, les statuts et l'annulation — ce que
   * `core/boucle-graphe.ts` disait déjà, et qui reste vrai.
   */
  const lancerLeLot = useCallback(async (noeudPrioritaireId?: string, perimetre?: PerimetreCible, jeton?: JetonDeRun) => {
    arretLotRef.current = false;
    // La lecture du dossier est asynchrone, la planification ne l'est pas : on lit d'abord, puis
    // `planifierLot` — pure et testée — décide de tout le reste.
    // QUELS DOSSIERS LIRE EST UNE QUESTION DE DOMAINE, et le moteur ne la tranche plus : il tenait
    // ici l'identifiant du composant qui les porte et le nom de son paramètre.
    const api = (window as any).api;
    const orch = servicesOrchestration();
    const dossiers = new Map<string, readonly unknown[]>();
    for (const d of orch.dossiersALire(noeudsRef.current)) {
      if (dossiers.has(d)) continue;
      dossiers.set(d, api?.lireDossier ? orch.fichiersUtiles(await api.lireDossier(d)) : []);
    }
    const plan = planifierLot(noeudsRef.current, (d) => (dossiers.get(d) ?? []) as never);

    // Le cas courant est celui-ci, et il ne doit rien coûter : pas de lot, une passe, rien de plus.
    if (!plan) {
      publierLot(null);
      return lancerBoucleValeur(noeudPrioritaireId, perimetre, jeton);
    }
    if (plan.plusieursDebuts) {
      console.warn("[attic] Deux débuts de boucle collection : chacun voudrait commander le nombre de passes.");
    }

    const journal: string[] = [];
    const nomsEcrits: string[] = [];
    try {
      for (let index = 0; index < plan.passes; index++) {
        if (arretLotRef.current) break;
        publierLot({ debutId: plan.debutId, index, fichiers: plan.fichiers, journal, nomsEcrits });
        // Le début de boucle et tout son aval doivent rejouer : leur empreinte n'a pas bougé d'une
        // passe à l'autre — le nœud n'a ni entrée ni paramètre qui change —, et le cache les
        // sauterait donc tous, le lot rendant trente fois le premier fichier.
        cacheExec.current.delete(plan.debutId);
        for (const id of descendants(plan.debutId, aretesRef.current as unknown as AreteG[])) {
          cacheExec.current.delete(id);
        }
        // CHAQUE FICHIER PASSE PAR LE PILOTE DES BOUCLES, ET NON PAR UNE PASSE NUE — relevé par
        // Fabien. Cette ligne appelait `lancerUnePasse` directement, si bien qu'une boucle par voix,
        // par créneau ou par cercle posée dans un graphe mené par lot n'était jamais PLANIFIÉE : le
        // pilote qui la mène est celui-là même qu'on sautait. Chaque fichier menait donc une seule
        // passe, la boucle ne bouclait pas, et rien ne le disait. Les trois répétitions s'emboîtent
        // maintenant dans l'ordre où elles se lisent : le lot dehors, les boucles par passes dedans,
        // et l'exécution du graphe au fond.
        await lancerBoucleValeur(noeudPrioritaireId, perimetre, jeton);
      }
    } finally {
      publierLot(null);
    }
  }, [lancerBoucleValeur]);

  return { lancerLeLot };
}
