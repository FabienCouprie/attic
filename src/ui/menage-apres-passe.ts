// ui/menage-apres-passe.ts — Ce que le moteur fait une fois le dernier nœud calculé.
//
// SORTI DU MOTEUR D'EXÉCUTION, sortie 7 du plan de simplification de `useExecutionGraphe.ts`. Deux
// fonctions, appelées par le moteur après la boucle, dans cet ordre et sur les mêmes tables :
//
//   — `menageApresPasse` lâche ce qui ne doit pas rester en cache, dit sur le nœud ce qui a empêché
//     une boucle de se déplier, rend la graine tirée dans le message, pose tout ce qui ne l'a pas
//     été, range les temps et les écarts, transmet les demandes au shell, reporte les champs
//     autonomes et donne aux conteneurs le statut de tout leur contenu ;
//   — `ecrireLesLecteurs` écrit chaque lecteur promis, un par un, en rendant la main entre deux.
//
// SHELL ET NON CŒUR : la première pose des statuts et des résultats, appelle `setNodes` et deux
// rappels de l'atelier ; la seconde crée des adresses d'objet. Le corps est celui du moteur, ligne
// pour ligne, et l'ordre des étapes aussi : la cause d'une boucle et la graine tirée doivent être
// dans les messages AVANT la pose finale, qui les lit.
import type { Dispatch, SetStateAction } from "react";
import { estCacheParBulle, type NoeudG } from "../core";
import { COPIES_MAX, type ResultatDepliage } from "../core/boucle-graphe";
import { statutDuContenu, type Conteneurs } from "../core/conteneurs";
import { champsAReporter } from "../core/cycle-de-vie";
import { resultatRetenu } from "../core/memoire";
import { lacherLeCorps } from "../core/saut-de-boucle";
import type { GraineTiree } from "../core/graines-de-passe";
import type { DemandeAuMoteur } from "../core/types";
import { valeursLourdes } from "./correctif-resultat";
import type { EtatDePasse } from "./etat-de-passe";
import { poserResultat } from "./resultats";
import { poserApercu, statutDe as statutDeNoeud } from "./statuts";

/**
 * Ce que le ménage lit en plus des tables communes : ce que la passe a compté et décidé.
 *
 * LES NŒUDS VISIBLES SE LISENT AU MOMENT DU MÉNAGE, par une fonction, et non au début de la passe :
 * le moteur lisait `noeudsRef.current` à cet endroit, et un nœud ajouté pendant un run long doit y
 * être vu comme il l'était.
 */
export interface ApresLaPasse {
  noeudsVisibles: () => any[];
  /** Le graphe aplati et déplié : ses nœuds portent les champs qu'un composant autonome a écrits. */
  nds: NoeudG[];
  cache: Map<string, any>;
  deplie: Pick<ResultatDepliage, "origines" | "problemes">;
  expansions: Map<string, string>;
  grainesTirees: Map<string, GraineTiree[]>;
  tempsParVisible: Map<string, number>;
  ecartsParNoeud: Map<string, number>;
  demandesParNoeud: Map<string, DemandeAuMoteur>;
  ordonnees: string[];
  idsDecoratifs: Set<string>;
  boites: Conteneurs;
  /** La pose des correctifs, que le moteur tient : ce qui est déjà posé, et ce qui attend. */
  dejaPoses: Set<string>;
  aPoser: Set<string>;
  poserCeQuiEstPret: () => Promise<void>;
  definirStatut: (nodeId: string, statut: string, progression?: string) => void;
  setNodes: Dispatch<SetStateAction<any[]>>;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

export async function menageApresPasse(passe: EtatDePasse, a: ApresLaPasse): Promise<void> {
  const { messages, tousNoeudsG, ordreFiltre, economieMemoireRef, t } = passe;
  const {
    noeudsVisibles, nds, cache, deplie, expansions, grainesTirees, tempsParVisible, ecartsParNoeud,
    demandesParNoeud, ordonnees, idsDecoratifs, boites, dejaPoses, aPoser, poserCeQuiEstPret,
    definirStatut, setNodes, onGrapheGenere, onNodeInstalle,
  } = a;
  // ── Mettre à jour les URL audio ──
  //
  // Le calcul se fait ICI, avant `setNodes`, et l'updater ne fait plus
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
  const economie = economieMemoireRef?.current ?? true;
  for (const n of noeudsVisibles()) {
    const garde = resultatRetenu({
      cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
      economie,
      lourd: valeursLourdes(cache.get(n.id)?.valeurs),
    });
    if (!garde) cache.delete(n.id);
  }
  // ET LE CORPS D'UNE BOUCLE DÉPLIÉE, QUE LA BOUCLE CI-DESSUS NE POUVAIT PAS VOIR. Les copies
  // portent des identifiants engendrés — « deb#3::echo » — et ne figurent pas parmi les nœuds
  // visibles : leurs tampons restaient donc accrochés au cache pour toute la session, et rien ne
  // les examinait jamais. Mesuré sur huit tours d'un écho : 134,6 Mo pour le seul corps, le
  // premier tour pesant 5,1 Mo et le huitième 28,6, la chaîne allongeant son signal à chaque
  // passage. Ce que la FIN de boucle rend reste en cache, elle : c'est l'échafaudage qu'on lâche,
  // pas l'ouvrage. Voir `resultatRetenu` pour le prix consenti.
  lacherLeCorps(deplie.origines.keys(), cache, economie);

  // CE QUI A EMPÊCHÉ UNE BOUCLE DE SE DÉPLIER SE DIT SUR LE NŒUD, et non dans la seule console.
  //
  // Un début de boucle non déplié s'exécute lui-même et rend « reliez ce composant à une fin de
  // boucle » — vrai d'un seul des six cas, et trompeur pour les cinq autres : relevé par Fabien
  // sur deux boucles emboîtées, où les deux débuts accusaient un câblage pourtant correct. Le
  // moteur, lui, connaît la raison exacte. Il la pose ICI, avant que les correctifs ne soient
  // calculés, faute de quoi le message de l'exécuteur resterait celui qu'on lit.
  for (const p of deplie.problemes) {
    const visible = expansions.get(p.noeudId) ?? p.noeudId;
    const dit = t(`boucle.probleme.${p.code}`).replace("{max}", String(COPIES_MAX));
    messages.set(visible, dit);
    definirStatut(visible, "erreur", dit);
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
  // dont le message a été complété après la boucle — la graine tirée et la cause d'une boucle non
  // dépliée, rangées sous l'identifiant visible.
  const aRepasser = new Set<string>([...grainesTirees.keys()]);
  for (const p of deplie.problemes) aRepasser.add(expansions.get(p.noeudId) ?? p.noeudId);
  for (const n of noeudsVisibles()) {
    if (!dejaPoses.has(n.id) || aRepasser.has(n.id)) aPoser.add(n.id);
  }
  await poserCeQuiEstPret();

  // LE TEMPS D'EXÉCUTION ET L'ÉCART DE NIVEAU VONT DANS LE MAGASIN comme le reste du résultat :
  // ce sont deux comptes rendus du run, cumulés par nœud VISIBLE, méta compris. Le magasin ne
  // prévient pas quand la valeur ne change pas, ce que les deux `setNodes` d'avant faisaient à la
  // main en comparant le champ.
  for (const [id, temps] of tempsParVisible) poserResultat(id, { tempsExecution: temps });
  for (const [id, e] of ecartsParNoeud) poserResultat(id, { ecartNiveau: e });

  // LES DEMANDES SE LISENT DANS LE RETOUR DU RUN, et rien n'est à effacer ensuite : elles ne se
  // sont jamais posées sur un nœud. Un long commentaire disait ici qu'un champ muté par un plugin
  // restait invisible tant qu'on lisait l'état React au lieu de l'instantané du run ; la question
  // ne se pose plus, puisque le composant rend sa demande au lieu de l'écrire.
  for (const [nodeId, demande] of demandesParNoeud) {
    if (onGrapheGenere && demande.grapheACreer?.nodes && demande.grapheACreer?.edges) {
      onGrapheGenere(nodeId, { nodes: demande.grapheACreer.nodes, edges: demande.grapheACreer.edges });
    }
  }
  if (onNodeInstalle && [...demandesParNoeud.values()].some((d) => d.paletteARelire)) onNodeInstalle();

  // Fusion générique des champs "autonomes" (préfixés `_`, ex. `_carteHtmlUrl`,
  // `_carteSonore`) qu'un plugin à `affichageAutonome: true` écrit sur
  // `ctx.noeud.data` pendant son exécution. `ctx.noeud` pointe vers l'entrée
  // de `nds` (l'instantané local aplati de ce run), pas vers l'état React réel
  // — une mutation faite là ne serait donc jamais vue par personne sans cette
  // passe. Les demandes au moteur, elles, ne passent plus par là du tout : elles
  // arrivent dans le retour de l'exécuteur et ne touchent jamais un nœud.
  //
  // LES DEUX CANAUX DÉCLARÉS NE PASSENT PAS PAR ICI, et c'est `core/cycle-de-vie.ts` qui le
  // tient : ils viennent du retour de l'exécuteur, ou du cache, jamais de l'instantané.
  const champsAutonomesParNoeud = new Map<string, Record<string, unknown>>();
  for (const n of nds) {
    const d = n.data as any;
    if (!d) continue;
    const champs = champsAReporter(d as Record<string, unknown>);
    if (champs) champsAutonomesParNoeud.set(n.id, champs);
  }
  if (champsAutonomesParNoeud.size > 0) {
    setNodes((nds2) =>
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
  // sur huit n'avaient jamais tourné. L'erreur qu'un méta s'est vu poser, sorties vides, reste la
  // sienne. La laisser « en cours » après le run ferait croire à un calcul qui n'en finit pas.
  const executables = ordonnees.filter((id) => !idsDecoratifs.has(id));
  for (const c of boites.ids) {
    if (boites.contenu(c, ordreFiltre).length === 0 || statutDeNoeud(c).statut === "erreur") continue;
    const b = statutDuContenu(boites.contenu(c, executables).map((id) => statutDeNoeud(id).statut));
    const partiel = t("conteneur.partiel").replace("{n}", String(b.faits)).replace("{total}", String(b.total));
    definirStatut(c, b.statut, b.statut === "attente" ? partiel : undefined);
  }
}

/**
 * Les lecteurs, écrits après que tout est posé.
 *
 * CHACUN PARAÎT DÈS QU'IL EST PRÊT, et non tous ensemble à la fin : sur une chaîne de sept nœuds
 * audio, attendre le dernier encodage pour montrer le premier lecteur était la moitié du défaut
 * relevé. Pendant son écriture, le nœud dit où elle en est : il est déjà terminé, son tampon est
 * posé, il s'écoute déjà par le bouton, et c'est le lecteur qui se fabrique.
 */
export async function ecrireLesLecteurs(
  passe: EtatDePasse, { signal, noeudsVisibles }: { signal: AbortSignal; noeudsVisibles: () => any[] },
): Promise<void> {
  const { lecteursAEcrire, souffle } = passe;
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
      // sorti d'ici : le résultat est déjà posé, le tampon est là, et le bouton « Écouter » reste
      // la voie d'écoute. Avant, cette exception remontait avant tout `setNodes`, et le nœud
      // perdait jusqu'à son message.
      console.error("[apercu] écriture du lecteur impossible", id, e);
    } finally {
      poserApercu(id, undefined);
    }
    await souffle.tour();
  }
}
