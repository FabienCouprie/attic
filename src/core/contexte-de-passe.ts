// core/contexte-de-passe.ts — Ce que le moteur donne à un exécuteur : ses entrées, ses réglages lus
// comme le contrat le dit, la question « cette sortie est-elle branchée ? », et un `onProgress`
// qui lève après annulation.
//
// Sorti d'`ui/hooks/useExecutionGraphe.ts` le 2026-11-02, à l'identique (sortie 4 du plan
// `work/plan-useExecutionGraphe-2026-11-01.md`). C'est le contrat `ContexteExecution` que
// `core/contexte-essai.ts` imite au banc ; les deux lecteurs de réglage n'ont plus qu'une écriture à
// imiter. Le cœur ne connaît ni le registre ni la langue : la fiche et la canonisation d'un choix
// lui sont prêtées.
import { ErreurAnnulation } from "./annulation";
import { resoudreEntree, valeursEntrantes } from "./graphe";
import type { AreteG } from "./meta";
import type { ContexteExecution, ParametreDef } from "./types";

/** Ce que le moteur sait d'une fiche, et dont les deux lecteurs de réglage ont besoin. */
export type FicheLue = { parametres: readonly ParametreDef[] } | undefined;

/** Une valeur de choix qu'aucune option du réglage ne reconnaît, et le défaut déclaré qui la remplace. */
export interface ValeurInconnue { parametre: ParametreDef; valeur: string; repli: string | number }

/**
 * Le retour d'un nœud, son message augmenté de ce que `dire` écrit des valeurs inconnues lues.
 *
 * LE MOTEUR LE DIT, ET NON CHAQUE NŒUD, décision de Fabien du 2026-11-21, défaut H du contrôle des
 * gammes : une gamme que la table ignore faisait jouer le majeur sans un mot, et la Gamme jouée
 * annonçait « Do dorienne-inconnue » en jouant do majeur. Le texte vient de qui monte la passe, le
 * cœur ne connaissant pas la langue de l'interface.
 */
export function annoterValeursInconnues<R>(
  res: R, inconnues: readonly ValeurInconnue[], dire: ((i: readonly ValeurInconnue[]) => string) | undefined,
): R {
  if (!inconnues.length || !dire || !res || typeof res !== "object") return res;
  const ligne = dire(inconnues);
  const message = (res as { message?: unknown }).message;
  return { ...res, message: typeof message === "string" && message ? `${message}\n${ligne}` : ligne };
}

export interface OptionsContexteDePasse<TValeur, TRuntime> {
  noeud: { id: string; data: Record<string, unknown> };
  aretes: AreteG[];
  resultats: ReadonlyMap<string, TValeur[]>;
  runtime: TRuntime;
  repertoireTravail: string;
  trouverDef: (ficheId: string) => FicheLue;
  /** La forme canonique d'un « choix », indépendante de la langue : `valeurCanoniqueChoix` d'i18n. */
  canoniser: (p: ParametreDef, valeur: string | number) => string | number;
  /** La graine d'un réglage de graine, résolue au centre : voir `core/graines-de-passe.ts`. */
  graineDuNoeud: (nodeId: string, nom: string, brut: number) => number;
  signal: AbortSignal;
  /** Ce que le nœud dit de son avancement, posé sur son statut. */
  poserProgression: (msg: string) => void;
}

export function contexteDePasse<TValeur, TRuntime>({
  noeud, aretes, resultats, runtime, repertoireTravail, trouverDef, canoniser, graineDuNoeud, signal, poserProgression,
}: OptionsContexteDePasse<TValeur, TRuntime>): {
  ctx: ContexteExecution<TValeur, TRuntime>; aConsulteSesSorties: () => boolean; valeursInconnues: () => readonly ValeurInconnue[];
} {
  const nodeId = noeud.id;
  const inconnues: ValeurInconnue[] = [];
  // CE NŒUD A-T-IL DEMANDÉ SI SES SORTIES ÉTAIENT BRANCHÉES ? La réponse se constate pendant son
  // run, et décide si son câblage aval entre dans sa clé de cache. Déclaré par contexte : c'est une
  // propriété de CE nœud, et la porter au-delà les mélangerait.
  let aConsulteSesSorties = false;
  const ctx: ContexteExecution<TValeur, TRuntime> = {
    noeud,
    runtime,
    repertoireTravail,
    entree: (idx: number) => resoudreEntree<TValeur>(nodeId, idx, aretes, resultats as Map<string, TValeur[]>) as TValeur,
    entrees: () => valeursEntrantes<TValeur>(nodeId, aretes, resultats as Map<string, TValeur[]>),
    // Les arêtes sont ici, et elles disent si un câble part de cette sortie. Un nœud peut
    // alors ne calculer une sortie chère que lorsqu'elle sert.
    //
    // ET POSER LA QUESTION EST RETENU. C'est ce fait — non une liste de composants — qui
    // décide si le câblage aval entre dans la clé de cache de ce nœud. Voir
    // `core/cache-execution.ts` : un nœud qui ne demande jamais si ses sorties sont branchées
    // ne peut pas en dépendre, et un câble ajouté derrière lui ne doit pas le faire rejouer.
    sortieBranchee: (idx: number) => {
      aConsulteSesSorties = true;
      return aretes.some((a) => a.source === nodeId && a.sourceHandle === `out:${idx}`);
    },
    paramNombre: (nom: string, defaut: number) => {
      const p = (noeud.data.parametres as Record<string, number | string>)?.[nom];
      const def = trouverDef(noeud.data.ficheId as string);
      const pDef = def?.parametres.find((p) => p.nom === nom);
      // LE REPLI EST LE DÉFAUT DÉCLARÉ, et c'est la racine d'une famille entière de défauts.
      //
      // CE QU'IL Y AVAIT ICI ÉTAIT UNE BRANCHE MORTE. Le repli consultait `defautEn`, qui est
      // le champ du défaut TEXTUEL traduit, typé sur une chaîne : relevé sur le registre,
      // AUCUN des 1983 réglages numériques du catalogue n'en déclare un qui soit un nombre.
      // La condition était donc toujours fausse, et le repli retombait toujours sur le
      // littéral de l'appel.
      //
      // CE QUE CELA COÛTAIT. Un nœud CRÉÉ reçoit chaque réglage déclaré ; un graphe
      // ENREGISTRÉ AVANT qu'un réglage existe ne le porte pas, ni le chargeur ni la
      // sérialisation ne complétant les manquants. Le littéral décidait donc seul du sort de
      // ces nœuds, et il pouvait différer du défaut que l'inspecteur affiche : seize appels
      // de bornes de modulation lisaient ainsi zéro et cent à la place de leur course, et le
      // kit de batterie d'un projet ancien sortait sur un preset mélodique.
      //
      // MESURÉ AVANT DE CHANGER : sur 1402 appels portant un littéral, 1399 donnaient déjà la
      // valeur déclarée. Des trois qui divergeaient, deux étaient des littéraux périmés,
      // corrigés avec ce changement ; le troisième lit un réglage que sa fiche ne déclare
      // plus, une lecture de migration que `pDef` indéfini laisse passer au littéral.
      const brut = typeof p === "number" ? p
        : typeof pDef?.defaut === "number" ? pDef.defaut
        : defaut;
      // UNE GRAINE EST RÉSOLUE ICI, ET NON DANS CHACUN DES SOIXANTE-CINQ COMPOSANTS QUI EN
      // PORTENT UNE. C'est la correction de la décentralisation relevée par Fabien : la
      // convention du projet — zéro ou moins veut dire « tire au sort » — n'était appliquée
      // que par treize d'entre eux, et ailleurs une graine à zéro était une graine FIXE
      // valant zéro. Le rôle est DÉCLARÉ sur le réglage, jamais cherché dans son libellé.
      return pDef?.graine ? graineDuNoeud(nodeId, nom, brut) : brut;
    },
    paramTexte: (nom: string, defaut: string) => {
      const p = (noeud.data.parametres as Record<string, number | string>)?.[nom];
      const def = trouverDef(noeud.data.ficheId as string);
      const pDef = def?.parametres.find((p) => p.nom === nom);
      if (typeof p === "string" && pDef) {
        const c = canoniser(pDef, p);
        // UNE VALEUR QU'AUCUNE OPTION NE RECONNAÎT DEVIENT LE DÉFAUT DÉCLARÉ, ET LE NŒUD LE DIT, décision
        // de Fabien du 2026-11-21 : elle passait telle quelle, et chaque composant retombait en
        // silence sur son propre repli, le majeur ici, la chromatique là. Le défaut est celui que
        // l'inspecteur montre ; le message se compose à la fin du nœud (`annoterValeursInconnues`).
        // Connue sous l'une de ses trois formes : l'identifiant, le libellé français, l'anglais. La
        // canonisation rend l'une d'elles, et laisse une valeur inconnue telle quelle.
        const connues = pDef.type === "choix" ? [...(pDef.optionIds ?? []), ...(pDef.options ?? []), ...(pDef.optionsEn ?? [])] : [];
        if (connues.length && !connues.map(String).includes(String(c))) {
          const repli = canoniser(pDef, pDef.defaut as string | number);
          if (!inconnues.some((x) => x.parametre.nom === nom)) inconnues.push({ parametre: pDef, valeur: p, repli });
          return String(repli);
        }
        return String(c);
      }
      // Repli sur le défaut DÉCLARÉ PAR LA FICHE (`defaut`, français),
      // jamais `defautEn` : la forme canonique d'un « choix » est celle
      // de la liste `options`, et un plugin compare la valeur reçue à ses
      // propres termes français (ex. profilCouleur("Bleu")). Préférer
      // `defautEn` renvoyait "Blue" quand le paramètre était absent de
      // `parametres` (ancien workflow, JSON écrit à la main) et faisait
      // échouer le nœud sur « Couleur 1 inconnue : Blue » — alors que
      // l'inspecteur, lui, affichait bien « Bleu ». Cf. defautCanoniqueChoix.
      return pDef ? String(canoniser(pDef, pDef.defaut as string | number)) : defaut;
    },
    // UN onProgress APRÈS ANNULATION LÈVE, et c'est ce qui rend 74 exécuteurs
    // interruptibles d'un seul geste : deux seulement lisaient `signal.aborted`.
    // Il ignorait auparavant l'appel, ce qui réglait le symptôme — un « en cours »
    // réaffiché par dessus l'« attente » que le reset venait de poser — sans arrêter
    // le travail. Le `catch` de la boucle du moteur reconnaît déjà le cas : il sort sans
    // marquer le nœud en erreur. Voir `core/annulation.ts`.
    onProgress: (msg: string) => { if (signal.aborted) throw new ErreurAnnulation(); poserProgression(msg); },
    signal,
  };
  return { ctx, aConsulteSesSorties: () => aConsulteSesSorties, valeursInconnues: () => inconnues };
}
