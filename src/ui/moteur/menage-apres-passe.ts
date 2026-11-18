// ui/moteur/menage-apres-passe.ts — Ce que le moteur fait une fois le dernier nœud calculé.
//
// SORTI DU MOTEUR D'EXÉCUTION, sortie 7 du plan de simplification de `useExecutionGraphe.ts`, et
// COUPÉ EN DEUX par la pièce P4b du plan de l'architecture par messages. Ce module est la moitié du
// moteur : il lâche ce qui ne doit pas rester en cache, complète les messages, la cause d'une boucle
// qui ne s'est pas dépliée et la graine tirée, puis dit au récepteur ce que la passe a compté et
// choisi, par deux événements du protocole : une `demande` pour chaque demande d'un composant, et le
// `bilan`. L'autre moitié, celle qui écrit, est au récepteur (`ui/recepteur-moteur.ts`) : la pose
// finale, les temps et les écarts, les demandes transmises à l'atelier, les champs autonomes reportés
// sur l'état et le statut des conteneurs, dans cet ordre, et les lecteurs après.
//
// IL N'ÉCRIT NI NE LIT LES MAGASINS, et `docs/frontiere-moteur.test.ts` le tient. Il écrit le cache
// et les messages de la passe, qui sont au moteur.
//
// L'ORDRE COMPTE : la cause d'une boucle et la graine tirée doivent être dans les messages AVANT que
// les rendus de la pose finale ne soient choisis, puisque ceux-ci les lisent.
import { estCacheParBulle, type NoeudG } from "../../core";
import { COPIES_MAX, type ResultatDepliage } from "../../core/boucle-graphe";
import type { Conteneurs } from "../../core/conteneurs";
import { champsAReporter } from "../../core/cycle-de-vie";
import { resultatRetenu } from "../../core/memoire";
import type { EvenementDuMoteur, Generation, RenduDuVisible } from "../../core/protocole-moteur";
import { choisirLeRendu } from "../../core/rendu-du-visible";
import { lacherLeCorps } from "../../core/saut-de-boucle";
import type { GraineTiree } from "../../core/graines-de-passe";
import type { DemandeAuMoteur } from "../../core/types";
import { valeursLourdes } from "../services-apercu";
import type { EtatDePasse } from "./etat-de-passe";
import type { CacheDuMoteur } from "./cache";

/** Les événements que le ménage dit au récepteur. */
export type EvenementDuMenage = Extract<EvenementDuMoteur<unknown>, { genre: "demande" | "bilan" }>;

/**
 * Ce que le ménage lit en plus des tables communes : ce que la passe a compté et décidé.
 *
 * LES NŒUDS VISIBLES SE LISENT AU MOMENT DU MÉNAGE, par une fonction, et non au début de la passe :
 * le moteur lisait `noeudsRef.current` à cet endroit, et un nœud ajouté pendant un run long doit y
 * être vu comme il l'était.
 */
export interface ApresLaPasse {
  noeudsVisibles: () => readonly any[];
  /** Le graphe aplati et déplié : ses nœuds portent les champs qu'un composant autonome a écrits. */
  nds: NoeudG[];
  cache: CacheDuMoteur;
  deplie: Pick<ResultatDepliage, "origines" | "problemes">;
  expansions: Map<string, string>;
  grainesTirees: Map<string, GraineTiree[]>;
  tempsParVisible: Map<string, number>;
  ecartsParNoeud: Map<string, number>;
  demandesParNoeud: Map<string, DemandeAuMoteur>;
  ordonnees: string[];
  idsDecoratifs: Set<string>;
  boites: Conteneurs;
  /** La génération de la passe, que porte chaque événement : celle de son jeton, ou 0. */
  generation: Generation;
  /** Dire un événement au récepteur. Le bilan rend la promesse de tout ce qu'il pose, et le ménage l'attend. */
  emettre: (evenement: EvenementDuMenage) => Promise<void> | void;
}

export async function menageApresPasse(passe: EtatDePasse, a: ApresLaPasse): Promise<void> {
  const { messages, tousNoeudsG, ordreFiltre, t } = passe;
  const {
    noeudsVisibles, nds, cache, deplie, expansions, grainesTirees, tempsParVisible, ecartsParNoeud,
    demandesParNoeud, ordonnees, idsDecoratifs, boites, generation, emettre,
  } = a;
  // ── Mettre à jour les URL audio ──
  //
  // Le calcul se fait au récepteur, avant `setNodes`, et l'updater ne fait plus
  // qu'appliquer le résultat. La raison n'est pas cosmétique : un updater de
  // `setNodes` doit être PUR, et celui-ci appelait `URL.createObjectURL` et
  // `URL.revokeObjectURL`. React double-invoque les updaters en développement
  // (StrictMode), si bien que chaque exécution créait DEUX URL pour un même
  // blob — la seconde allait dans l'état, la première restait orpheline et
  // n'était jamais révoquée. Tracé sur un graphe de cinq minutes : deux URL de
  // 53 Mo par nœud audio et par run.
  //
  // Ce n'est pas une fuite anodine sur ce type de graphe. Mesuré dans l'app :
  // le tas JavaScript atteignait 3027 Mo pour une limite de 4192 Mo, et le
  // sixième lecteur audio refusait de charger son WAV — pourtant intact — avec
  // « MEDIA_ELEMENT_ERROR: Format error », que Chromium émet aussi par manque
  // de mémoire. C'est le symptôme « lecteur gris à 0:00 » : il frappe le
  // dernier nœud de la chaîne, quel qu'il soit, et non celui qui aurait un
  // défaut.
  // CE QUI EST LOURD DANS UNE BULLE REPLIÉE N'EST PAS GARDÉ, et le ménage se fait ICI, à la fin du run,
  // et non au moment où un nœud range son résultat. La raison est qu'un membre qui TROUVE son
  // résultat en cache n'exécute pas, donc ne range rien, donc ne déclenchait aucun ménage : les
  // tampons restaient accrochés au cache alors que les données des nœuds les avaient lâchés, et
  // l'on croyait avoir libéré. Relevé à l'écran, deux exécutions de suite.
  //
  // À LA FIN PLUTÔT QU'AU DÉBUT : le run courant garde ses raccourcis de cache, et c'est le
  // suivant qui refera la bulle. On paie le recalcul une fois par exécution, pas deux.
  // Voir `resultatRetenu` dans `core/memoire.ts` pour l'échange consenti, et son seuil : sous lui,
  // un membre se garde, et « Développer » ne refait rien.
  const economie = passe.economieMemoire();
  for (const n of noeudsVisibles()) {
    const garde = resultatRetenu({
      cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
      economie,
      lourd: valeursLourdes(cache.lire(n.id)?.valeurs),
    });
    if (!garde) cache.oublier([n.id]);
  }
  // ET LE CORPS D'UNE BOUCLE DÉPLIÉE, QUE LA BOUCLE CI-DESSUS NE POUVAIT PAS VOIR. Les copies
  // portent des identifiants engendrés — « deb#3::echo » — et ne figurent pas parmi les nœuds
  // visibles : leurs tampons restaient donc accrochés au cache pour toute la session, et rien ne
  // les examinait jamais. Mesuré sur huit tours d'un écho : 134,6 Mo pour le seul corps, le
  // premier tour pesant 5,1 Mo et le huitième 28,6, la chaîne allongeant son signal à chaque
  // passage. Ce que la FIN de boucle rend reste en cache, elle : c'est l'échafaudage qu'on lâche,
  // pas l'ouvrage. Voir `resultatRetenu` pour le prix consenti.
  lacherLeCorps(deplie.origines.keys(), (id) => cache.oublier([id]), economie);

  // CE QUI A EMPÊCHÉ UNE BOUCLE DE SE DÉPLIER SE DIT SUR LE NŒUD, et non dans la seule console.
  //
  // Un début de boucle non déplié s'exécute lui-même et rend « reliez ce composant à une fin de
  // boucle » — vrai d'un seul des six cas, et trompeur pour les cinq autres : relevé par Fabien
  // sur deux boucles emboîtées, où les deux débuts accusaient un câblage pourtant correct. Le
  // moteur, lui, connaît la raison exacte. Il la range ICI, avant que les rendus ne soient choisis,
  // faute de quoi le message de l'exécuteur resterait celui qu'on lit ; le récepteur pose le nœud
  // en erreur, avant la pose finale.
  const problemesDeBoucle: [string, string][] = [];
  for (const p of deplie.problemes) {
    const visible = expansions.get(p.noeudId) ?? p.noeudId;
    const dit = t(`boucle.probleme.${p.code}`).replace("{max}", String(COPIES_MAX));
    messages.set(visible, dit);
    problemesDeBoucle.push([visible, dit]);
  }

  // LA GRAINE TIRÉE SE REND, faute de quoi un rendu qu'on voudrait garder resterait introuvable :
  // le réglage à zéro ne dit pas ce qui a été joué. Treize composants le faisaient déjà eux-mêmes ;
  // on ne le répète donc que si le NOMBRE n'est pas déjà là — le nombre, et non le mot, qui
  // s'écrit de trop de façons pour qu'on le cherche.
  //
  // ET C'EST ICI, APRÈS TOUTE L'EXÉCUTION, plutôt que dans la boucle des nœuds : `grainesTirees`
  // est rangée sous l'identifiant VISIBLE, quand la boucle, elle, tourne sur des copies. Ajouter
  // le tirage au message d'une copie l'aurait perdu, la vue lisant `messages` sous l'identifiant
  // qu'elle affiche.
  for (const [visible, tirees] of grainesTirees) {
    const dit = messages.get(visible) ?? "";
    const aDire = tirees.filter((g) => !dit.includes(String(g.valeur)));
    if (!aDire.length) continue;
    const bout = aDire.map((g) => `${g.nom.toLowerCase()} ${g.valeur}`).join(" · ");
    messages.set(visible, dit ? `${dit} · ${bout}` : bout);
  }

  // CE QUE LA POSE FINALE REPRENDRA, MÊME DÉJÀ POSÉ : les nœuds dont le message a été complété après
  // la boucle, la graine tirée et la cause d'une boucle non dépliée. Tout nœud qui a tiré une graine
  // y est, que son message ait changé ou non.
  const messagesCompletes = new Set<string>([...grainesTirees.keys()]);
  for (const p of deplie.problemes) messagesCompletes.add(expansions.get(p.noeudId) ?? p.noeudId);

  // CE QUE CHAQUE NŒUD VISIBLE MONTRE, CHOISI MAINTENANT, une fois les messages complétés : c'est ce
  // que la pose finale lisait. Le choix ne coûte que des lectures, et le récepteur ne pose que ce
  // qui n'a pas été posé ou dont le message a changé.
  const rendus: [string, RenduDuVisible<unknown>][] = [];
  for (const n of noeudsVisibles()) {
    const rendu = choisirLeRendu(n, passe);
    if (rendu) rendus.push([n.id, rendu]);
  }

  // LES DEMANDES SE LISENT DANS LE RETOUR DU RUN, et rien n'est à effacer ensuite : elles ne se
  // sont jamais posées sur un nœud. Un long commentaire disait ici qu'un champ muté par un plugin
  // restait invisible tant qu'on lisait l'état React au lieu de l'instantané du run ; la question
  // ne se pose plus, puisque le composant rend sa demande au lieu de l'écrire. Le récepteur les garde
  // jusqu'au bilan, et les transmet à l'atelier après la pose finale.
  for (const [id, demande] of demandesParNoeud) emettre({ genre: "demande", generation, id, demande });

  // Fusion générique des champs "autonomes" (préfixés `_`, ex. `_carteHtmlUrl`,
  // `_carteSonore`) qu'un plugin à `affichageAutonome: true` écrit sur
  // `ctx.noeud.data` pendant son exécution. `ctx.noeud` pointe vers l'entrée
  // de `nds` (l'instantané local aplati de ce run), pas vers l'état React réel
  // — une mutation faite là ne serait donc jamais vue par personne sans cette
  // passe, que le récepteur applique. Les demandes au moteur, elles, ne passent
  // plus par là du tout : elles arrivent dans le retour de l'exécuteur et ne
  // touchent jamais un nœud.
  //
  // LES DEUX CANAUX DÉCLARÉS NE PASSENT PAS PAR ICI, et c'est `core/cycle-de-vie.ts` qui le
  // tient : ils viennent du retour de l'exécuteur, ou du cache, jamais de l'instantané.
  const champsAutonomes: [string, Record<string, unknown>][] = [];
  for (const n of nds) {
    const d = n.data as any;
    if (!d) continue;
    const champs = champsAReporter(d as Record<string, unknown>);
    if (champs) champsAutonomes.push([n.id, champs]);
  }

  // LES CONTENEURS QUE LA PASSE A TOUCHÉS, et ceux de leurs membres qui s'exécutent. Un conteneur
  // dont rien n'a tourné dans ce run n'y est pas ; les décoratifs ne comptent pas. Son statut, lui,
  // se lit au récepteur, sur les statuts de toutes les passes.
  const executables = ordonnees.filter((id) => !idsDecoratifs.has(id));
  const conteneurs: [string, string[]][] = [];
  for (const c of boites.ids) {
    if (boites.contenu(c, ordreFiltre).length === 0) continue;
    conteneurs.push([c, boites.contenu(c, executables)]);
  }

  await emettre({
    genre: "bilan", generation, problemesDeBoucle, messagesCompletes: [...messagesCompletes], rendus,
    temps: [...tempsParVisible], ecarts: [...ecartsParNoeud], champsAutonomes, conteneurs,
  });
}
