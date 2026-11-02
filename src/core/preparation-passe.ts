// core/preparation-passe.ts — Tout ce qu'une passe décide AVANT d'exécuter le premier nœud, rendu pur.
//
// Sorti d'`ui/hooks/useExecutionGraphe.ts` le 2026-11-02, à l'identique (sortie 5 du plan
// `work/plan-useExecutionGraphe-2026-11-01.md`). Aplatir les métas, publier le graphe à documenter,
// déplier les instruments puis les boucles, nommer les conteneurs, choisir la priorité et le
// périmètre, ordonner, valider, relever les cycles, écarter les décoratifs : rien de tout cela ne
// touche React ni un magasin. Ce que le moteur POSAIT en chemin — des statuts, des avertissements,
// une trace — est rendu en listes, dans l'ordre où il les posait, et c'est lui qui les applique.
// Le cœur ne connaît ni le registre ni la langue : la fiche, la compatibilité des flux et la
// traduction lui sont prêtées.
//
// LA PRÉPARATION EST LE PLUS GROS GEL DU LANCEMENT, mesuré à 286 ms sur un graphe de cinq nœuds
// qui ne font rien ; c'est pour cela que le moteur respire juste après. Elle ne change pas ici.
import { deplierBoucles } from "./boucle-graphe";
import { conteneurs, type Conteneurs } from "./conteneurs";
import { grapheSansConteneurs, type GrapheSansConteneurs } from "./formes-graphe";
import { noeudsEnCycle, ordreTopologique, perimetreCible, placerEnDernier } from "./graphe";
import { deplierInstruments } from "./instrument-graphe";
import { estBulle, estSubstitution } from "./bulles";
import { aplatirGraphe, type AreteG, type MetaComposant, type NoeudG } from "./meta";
import { validerGraphe } from "./validation";

type DefPourValidation = NonNullable<ReturnType<Parameters<typeof validerGraphe>[2]>>;
/** Ce que le moteur sait d'une fiche, et dont la préparation a besoin : ses ports, et si elle passe en dernier. */
export type FicheDePreparation = (DefPourValidation & { executerEnDernier?: boolean }) | undefined;

export interface EntreesDePreparation {
  /** Les nœuds VISIBLES du canevas. */
  noeuds: NoeudG[];
  /** Toutes les arêtes, substitutions de bulles comprises : elles sont écartées ici. */
  aretes: AreteG[];
  /** Le nœud visé par un run ciblé, ou la priorité posée sur un nœud ; `null` pour un run global. */
  prioriteDemandee: string | null | undefined;
  /** Vrai pour une relance automatique après réglage : l'aval entre dans le périmètre. */
  versLAval: boolean;
  trouverMeta: (ficheId: string) => MetaComposant | undefined;
  trouverDef: (ficheId: string) => FicheDePreparation;
  fluxCompatibles: (sourceId: string, cibleId: string, sousTypeSource?: string, sousTypeCible?: string) => boolean;
  /** La traduction, pour les statuts qui parlent : `boucle.depliee`, `erreur.cycle`. */
  t: (cle: string) => string;
}

export interface StatutAPoser { id: string; statut: string; progression?: string }

export interface PlanDePasse {
  aretesReelles: AreteG[];
  plat: { noeuds: NoeudG[]; aretes: AreteG[]; expansions: Map<string, string> };
  aDocumenter: GrapheSansConteneurs;
  deplie: ReturnType<typeof deplierBoucles>;
  nds: NoeudG[];
  aretesG: AreteG[];
  tousNoeudsG: NoeudG[];
  boites: Conteneurs;
  priorite: string | null | undefined;
  ordonnees: string[];
  ordreFiltre: string[];
  ancPriorite: Set<string> | null;
  noeudsEnErreur: Set<string>;
  idsDecoratifs: Set<string>;
  estMetaEnScope: (nodeId: string) => boolean;
  /** Les statuts à poser, dans l'ordre où le moteur les posait. */
  statuts: StatutAPoser[];
  /** Les avertissements à écrire dans la console, dans l'ordre. */
  avertissements: string[];
  /** La trace de l'ordre réel, pour diagnostiquer les exécutions avant les branches amont. */
  traceOrdre: string;
}

export function preparerLaPasse({
  noeuds, aretes, prioriteDemandee, versLAval, trouverMeta, trouverDef, fluxCompatibles, t,
}: EntreesDePreparation): PlanDePasse {
  const statuts: StatutAPoser[] = [];
  const avertissements: string[] = [];
  const definirStatut = (id: string, statut: string, progression?: string) => { statuts.push({ id, statut, progression }); };

  // LES ARÊTES DE SUBSTITUTION NE CALCULENT PAS. Replier une bulle cache les arêtes qui la
  // traversent et en dessine des substituts vers ses poignées : ce sont des objets d'affichage, et
  // les vraies arêtes sont toujours là. Les laisser entrer ici changerait l'empreinte des entrées
  // d'un nœud, donc invaliderait son résultat au moindre repli — or ne RIEN invalider est la
  // propriété qui justifie de replier plutôt que d'extraire. Voir `core/bulles.ts`.
  const aretesReelles = aretes.filter((a) => !estSubstitution(a));
  // Aplatit les méta-composants (sous-graphes) en leur contenu réel avant
  // d'exécuter : le moteur DAG tourne sur un graphe sans méta-nœud. Les
  // résultats des nœuds internes sont remontés au méta-nœud via `expansions`.
  const plat = aplatirGraphe(noeuds, aretesReelles, trouverMeta);
  // LE GRAPHE MIS À DISPOSITION DES NŒUDS QUI LE DOCUMENTENT EST CELUI QUI CALCULE : les
  // conteneurs dépliés, leur contenu à leur place, les boucles et les instruments PAS ENCORE
  // recopiés. Il était publié avant l'aplatissement, si bien qu'un méta-composant se documentait
  // lui-même par la notice que son magasin lui fabrique, et que ses oscillateurs n'étaient
  // documentés nulle part. Le contrat d'exécution du cœur ne porte pas le graphe et n'a pas à le
  // porter ; voir plugins/grapheGlobal.ts et core/formes-graphe.ts.
  const aDocumenter = grapheSansConteneurs(noeuds, aretesReelles, trouverMeta, estBulle);
  for (const id of aDocumenter.conteneursRetires) {
    avertissements.push(`[attic] Documentation : conteneur non dépliable retiré (${id})`);
  }
  // Puis DÉPLIE les instruments : tout ce qui est branché entre « Note d'instrument » et
  // « Fin d'instrument » est recopié une fois PAR NOTE du clavier, la note étant injectée dans
  // chaque copie. C'est ainsi qu'une recette devient un instrument : rien n'est transposé, chaque
  // note est calculée à sa hauteur. Avant le dépliage des boucles, de sorte qu'une chaîne
  // d'instrument puisse elle-même contenir une boucle — chaque copie en porte alors une, et le
  // dépliage suivant les traite comme autant de boucles indépendantes.
  // Voir `core/instrument-graphe.ts`, testé.
  const instruments = deplierInstruments(plat.noeuds, plat.aretes);
  for (const [copie, origine] of instruments.origines) {
    plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
  }
  for (const p of instruments.problemes) {
    avertissements.push(`[attic] Instrument de graphe : ${p.code} sur ${p.noeudId}`);
  }
  plat.noeuds = instruments.noeuds;
  plat.aretes = instruments.aretes;

  // Puis DÉPLIE les boucles de graphe : une boucle est un cycle, et le moteur n'exécute
  // que des graphes acycliques. Les nœuds compris entre « Début de boucle » et « Fin de
  // boucle » sont recopiés autant de fois qu'il y a de tours, chaque copie recevant le
  // résultat de la précédente — c'est ainsi que les effets s'accumulent d'un tour à
  // l'autre. Voir `core/boucle-graphe.ts`, testé.
  const deplie = deplierBoucles(plat.noeuds, plat.aretes);
  for (const [copie, origine] of deplie.origines) {
    plat.expansions.set(copie, plat.expansions.get(origine) ?? origine);
  }
  for (const p of deplie.problemes) {
    avertissements.push(`[attic] Boucle de graphe : ${p.code} sur ${p.noeudId}`);
  }
  // UN DÉBUT DE BOUCLE DIT CE QU'IL EST DEVENU. Il est RETIRÉ du graphe exécuté — c'est la chaîne
  // recopiée qui tourne à sa place —, donc il ne rend rien et restait « En attente » pour
  // toujours, ce qui ne dit rien de ce qui s'est passé. Relevé par Fabien. Le statut est posé ici
  // plutôt qu'après l'exécution : ce n'est pas le compte rendu d'un calcul, c'est ce que le
  // dépliage vient de décider, et cela vaut même si le run est interrompu ensuite.
  for (const d of deplie.depliees) {
    // ET LES TRAVERSÉES AVEC, parce que leur sens ne se devine pas. Une entrée venue du dehors
    // alimente CHAQUE tour à l'identique, une sortie prise ailleurs que par la fin ne sort QU'UNE
    // FOIS, au dernier tour : un seul câble, et trente et une valeurs sur trente-deux qui ne
    // sortent jamais. Elles ne se disent que lorsqu'il y en a, pour ne pas encombrer le cas simple.
    const dits = [t("boucle.depliee").replace("{n}", String(d.tours))];
    if (d.entreesDuDehors > 0) dits.push(t("boucle.entrees").replace("{n}", String(d.entreesDuDehors)));
    if (d.sortiesVersDehors > 0) dits.push(t("boucle.sorties").replace("{n}", String(d.sortiesVersDehors)));
    definirStatut(d.debutId, "attente", dits.join(" · "));
  }
  const nds = deplie.noeuds;
  const aretesG = deplie.aretes;
  // LES BULLES ET LES MÉTAS, ET CE QUE CHACUN CONTIENT parmi les nœuds exécutés. Voir `core/conteneurs.ts`.
  const tousNoeudsG = noeuds;
  const boites = conteneurs(tousNoeudsG, (id) => plat.expansions.get(id) ?? id, (f) => !!trouverMeta(f));
  // Un nœud qui passe en dernier rend compte du graphe entier : le lancer seul n'aurait pas de
  // sens, il n'a pas d'amont. Un run ciblé sur lui devient donc un run global.
  const estDernier = (id: string) => trouverDef((deplie.noeuds.find((n) => n.id === id)?.data as { ficheId?: string } | undefined)?.ficheId as string)?.executerEnDernier === true;
  const priorite = prioriteDemandee && estDernier(prioriteDemandee) ? undefined : prioriteDemandee;

  // Topologie (logique pure testée — cf. core/graphe.ts)
  const ordonnees = placerEnDernier(ordreTopologique(nds.map((n) => n.id), aretesG), estDernier, aretesG);
  let ordreFiltre = ordonnees;
  // Périmètre d'un run ciblé (nœud prioritaire) : null = run global (tout le graphe).
  let ancPriorite: Set<string> | null = null;
  if (priorite) {
    // UN CONTENEUR SE LANCE PAR TOUT SON CONTENU. Un méta n'existe pas dans le graphe aplati, une
    // bulle n'y a aucune arête : viser leur seul identifiant ne lançait rien, et ne cibler que les
    // nœuds qui alimentent les sorties d'un méta laissait de côté le reste. Voir `core/conteneurs.ts`.
    const contenu = boites.contenu(priorite, ordonnees);
    const cibles = contenu.length > 0 ? contenu : [priorite];
    // LE PÉRIMÈTRE EST CALCULÉ PAR `core/graphe.ts`, pur et éprouvé à part. L'AVAL Y ENTRE QUAND
    // C'EST UNE RELANCE APRÈS RÉGLAGE, et pas autrement.
    //
    // RELEVÉ PAR FABIEN : « j'ai l'impression que le gain de la table de montage ne fonctionne
    // pas ». Il fonctionnait : le montage se recalculait bien, cache rafraîchi, mais **rien en
    // aval n'était refait**, alors que le moteur venait d'en effacer les résultats. Mesuré sur
    // une chaîne générateur → montage → rotation ambisonique : aussitôt le gain changé, le nœud
    // d'aval passait à « En attente » sans lecteur, et une relance GLOBALE donnait le bon niveau,
    // 0,05931 contre 0,5931, soit le rapport de dix attendu pour −20 dB. Le calcul était donc
    // juste ; c'est la propagation qui manquait. Depuis l'aval — où l'on écoute et où l'on
    // exporte — le gain paraissait mort.
    //
    // ET UN RUN CIBLÉ DEMANDÉ PAR LA PERSONNE N'EMBRASSE TOUJOURS QUE L'AMONT. Les deux chemins
    // passent par ici, et leur intention diffère : cliquer le ▶ d'un nœud veut dire « calcule
    // jusqu'ici », et y ajouter l'aval ferait tourner ce qu'on n'a pas demandé. Une relance
    // automatique, elle, n'a pas été demandée du tout : elle répare l'effacement qu'un réglage
    // vient de causer, et doit donc refaire tout ce qui a été effacé.
    const anc = perimetreCible(cibles, aretesG, versLAval);
    ancPriorite = anc;
    ordreFiltre = ordonnees.filter((id) => anc.has(id));
  }
  // Debug : tracer l'ordre topologique réel pour diagnostiquer les exécutions avant
  // les branches amont (ex. mélangeur terminal avant SpeechT5).
  const traceOrdre = "[ordre] priorite=" + priorite + " ordreFiltre=" + ordreFiltre.map((id) => id + "(" + (nds.find((n) => n.id === id)?.data?.ficheId ?? "?") + ")").join(", ");
  // Résout les types depuis les PluginDef et rejette les arêtes incompatibles.
  // Les nœuds cibles passent en statut « erreur » et ne sont pas exécutés.
  // `validerGraphe` inspecte TOUT le graphe (entrées obligatoires non connectées
  // comprises) : sur un run ciblé (nœud prioritaire), un nœud hors périmètre —
  // même totalement déconnecté du nœud lancé — se faisait donc marquer « erreur »
  // alors qu'il n'a ni lien ni exécution avec le nœud sur lequel on a cliqué
  // « lancer ». On restreint donc l'application des résultats de validation au
  // périmètre du run (`ancPriorite`), comme le fait déjà `ordreFiltre` plus bas.
  // LA VALIDATION PORTE SUR LE GRAPHE RÉELLEMENT EXÉCUTÉ, nœuds ET arêtes venant du même état.
  //
  // Elle lisait les nœuds d'AVANT le dépliage et les arêtes d'APRÈS. Or déplier une boucle RETIRE
  // son « Début de boucle » et recâble ses arêtes vers les copies : le validateur voyait donc ce
  // nœud sans la moindre arête, lui reprochait son entrée requise non branchée, et le marquait en
  // erreur. Relevé sur deux boucles de trente-deux tours qui avaient parfaitement abouti : les
  // 256 copies exécutées, les deux fins de boucle terminées, et les deux débuts en rouge.
  const validation = validerGraphe(nds, aretesG, (ficheId) => trouverDef(ficheId), fluxCompatibles);
  const noeudsEnErreur = new Set<string>();
  for (const [nodeId, msgs] of validation.noeudsAffectes) {
    if (ancPriorite && !ancPriorite.has(nodeId)) continue;
    noeudsEnErreur.add(nodeId);
    definirStatut(nodeId, "erreur", msgs[0]);
  }
  // UN CYCLE NE DOIT PAS ÊTRE UNE PANNE MUETTE. Kahn n'émet jamais un nœud pris dans un cycle :
  // ce qui manque à l'ordre EST le cycle, et ces nœuds ne sont donc pas exécutés. Jusqu'ici ils
  // l'étaient en silence — ni statut, ni message —, et une branche entière restait sans résultat
  // sans que rien ne dise pourquoi. La pose d'une arête refuse désormais de refermer un cycle,
  // mais un projet enregistré avant ce contrôle peut en porter un, et l'aplatissement d'un méta
  // ou d'un instrument pourrait en fabriquer un : le relevé se fait donc ici aussi, sur le graphe
  // RÉELLEMENT exécuté, avec les mêmes entrées que le tri lui-même.
  for (const id of noeudsEnCycle(nds.map((n) => n.id), aretesG)) {
    if (ancPriorite && !ancPriorite.has(id)) continue;
    if (noeudsEnErreur.has(id)) continue;
    noeudsEnErreur.add(id);
    definirStatut(id, "erreur", t("erreur.cycle"));
  }
  // Un méta est « dans le périmètre » du run ssi au moins un de ses nœuds internes
  // aplatis (`${id}::…`) y figure. Un run prioritaire ne doit PAS toucher les métas
  // hors périmètre (branches déconnectées) — sinon ils passaient « en cours » puis
  // « erreur », donnant l'illusion d'un run global.
  // Une bulle rejoint le commentaire et le cadre : elle ne calcule rien, ses membres si.
  const idsDecoratifs = new Set(nds.filter((n) =>
    n.data?.ficheId === "comment" || n.data?.ficheId === "frame" || estBulle(n.data?.ficheId),
  ).map((n) => n.id));
  ordreFiltre = ordreFiltre.filter((id) => !idsDecoratifs.has(id));
  const ordreFinal = ordreFiltre;
  const estMetaEnScope = (nodeId: string) => ordreFinal.some((id) => id.startsWith(`${nodeId}::`));

  for (const id of ordreFiltre) {
    if (!noeudsEnErreur.has(id)) definirStatut(id, "attente");
  }

  // UN CONTENEUR DIT CE QUE FAIT SON CONTENU. Une bulle ou un méta ne calcule rien, mais un
  // conteneur muet pendant que son contenu travaille laisserait croire qu'il ne se passe rien. Il
  // est en cours dès que ce run touche à l'un de ses nœuds ; son statut final se pose après le run.
  for (const c of boites.ids) {
    if (!noeudsEnErreur.has(c) && boites.contenu(c, ordreFiltre).length > 0) definirStatut(c, "en_cours");
  }

  return {
    aretesReelles, plat, aDocumenter, deplie, nds, aretesG, tousNoeudsG, boites, priorite,
    ordonnees, ordreFiltre, ancPriorite, noeudsEnErreur, idsDecoratifs, estMetaEnScope,
    statuts, avertissements, traceOrdre,
  };
}
