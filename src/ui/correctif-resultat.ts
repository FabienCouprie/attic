// ui/correctif-resultat.ts — Ce que le magasin des résultats reçoit pour un nœud, après son calcul.
//
// SORTI DU MOTEUR D'EXÉCUTION, sortie 6 du plan de simplification de `useExecutionGraphe.ts`, et
// SHELL ET NON CŒUR : cette fonction crée des adresses d'objet, lit le magasin des résultats et pose
// un statut. Elle vivait en fermeture dans `lancerUnePasse`, et le corps est celui du moteur, ligne
// pour ligne.
//
// ELLE NE CHOISIT PLUS LES VALEURS, depuis la pièce P4b du plan de l'architecture par messages. Ce
// que le nœud visible montre, les sorties exposées d'un méta, la seule sortie d'une bulle, l'échec
// d'une branche, se lit dans les tables de la passe, et c'est le cœur qui le choisit
// (`core/rendu-du-visible.ts`) ; le moteur le dit au récepteur dans ses événements, et il arrive ici
// tout choisi. Ce module ne reçoit aucune table du moteur, et `docs/frontiere-moteur.test.ts` le
// tient : il ne lit que le graphe de la passe, ses lecteurs promis et trois références vivantes.
//
// CE QU'ELLE DÉCIDE, c'est l'affichage : un lecteur PROMIS plutôt qu'écrit, une adresse réutilisée
// tant que le tampon et la profondeur sont les mêmes, rien de lourd quand une bulle repliée le cache,
// et l'erreur d'un méta dont la branche n'a rien rendu.
import type { Edge } from "@xyflow/react";
import { estCacheParBulle, trouverMeta, type NoeudG } from "../core";
import { urlsLachees } from "../core/cycle-de-vie";
import { noeudRegarde, resultatRetenu } from "../core/memoire";
import type { RenduDuVisible } from "../core/protocole-moteur";
import type { Respiration } from "../core/respirer";
import { poserApercu, poserStatut } from "./statuts";
import { resultatDe } from "./resultats";
import { servicesApercu, valeursLourdes, type ApercuRefaisable } from "./services-apercu";
import { lireProfondeurExport } from "./profondeur-export";
import { apercuPerdu } from "./refaire-apercus";
import type { RegistreUI } from "./registre-actif";

/** Une référence lue au moment de la pose, comme le moteur la lisait. */
export interface Lecture<T> { readonly current: T }

/**
 * Ce que l'affichage d'un rendu lit, et rien de plus : aucune table du moteur n'y est.
 *
 * LES TROIS RÉFÉRENCES SONT PASSÉES TELLES QUELLES, et non leur valeur du moment. Le moteur lisait
 * `aretesRef.current` au moment de POSER un nœud, pas au début de la passe ; un câble tiré pendant
 * un run long compte donc pour dire si un nœud est regardé. Donner la valeur figerait ce que le
 * moteur lisait vivant. Même raison pour l'économie de mémoire et la pile des métas ouverts.
 */
export interface PretsDeLAffichage {
  /** Les nœuds visibles de la passe, bulles comprises : un membre de bulle repliée ne retient rien. */
  tousNoeudsG: readonly NoeudG[];
  trouverDef: RegistreUI["trouverDef"];
  /** Les lecteurs promis, écrits après que tout est posé. */
  lecteursAEcrire: Map<string, () => Promise<string | undefined>>;
  souffle: Respiration;
  aretesRef: Lecture<Edge[]>;
  economieMemoireRef?: Lecture<boolean>;
  pileMetaRef?: Lecture<{ metaId: string; nom: string }[]>;
  t: (cle: string) => string;
}

/**
 * Deux canaux d'affichage portent-ils les mêmes valeurs, champ par champ ?
 *
 * PAR CHAMP ET NON PAR OBJET : un nœud sauté rend l'affichage de son entrée de cache, et rien ne
 * promet que ce soit le même objet que celui que le correctif d'avant a vu. Ses valeurs, elles, le
 * sont. Deux absences sont égales, de sorte qu'un nœud qui n'en rend aucun garde son adresse.
 */
function memesChamps(a?: Readonly<Record<string, unknown>>, b?: Readonly<Record<string, unknown>>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const cles = Object.keys(a);
  return cles.length === Object.keys(b).length && cles.every((k) => Object.is(a[k], b[k]));
}

/**
 * Les types d'image dont un nœud montre l'aperçu.
 *
 * LE WEBP, LE GIF ET LE BMP Y MANQUAIENT, et Chromium les décode comme les trois autres. Une « Entrée
 * image » chargée d'un de ces fichiers ne montrait rien. Rechargée avec son projet, elle le montrait,
 * mais par accident : `ui/rechargerFichiers.ts` la déclarait JPEG. Le type rendu juste le
 * 2026-11-16, l'aperçu des relus disparaissait aussi ; Fabien a demandé celui des trois formats,
 * chargés comme relus. LA LISTE RESTE FERMÉE : l'AVIF, que `core/type-image.ts` sait reconnaître,
 * n'y est pas, son affichage n'ayant pas été mesuré.
 */
const TYPES_IMAGE_APERCU: ReadonlySet<string> = new Set([
  "image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif", "image/bmp",
]);

/**
 * Champs à mettre à jour sur un nœud après le run, ou `null` s'il n'y a rien à changer.
 *
 * LE RENDU ARRIVE TOUT CHOISI, par `noeudFini` ou par le bilan de la passe, et il manque quand le
 * nœud n'a rien à montrer : un méta hors du périmètre, ni valeur ni message. Voir
 * `core/rendu-du-visible.ts`. LA FONCTION RESTE ASYNCHRONE, sans rien attendre en elle-même : la pose
 * l'attend, et un tour de moins changerait ce que la boucle voit entre deux nœuds.
 */
export async function calculerCorrectifResultat(
  n: any, rendu: RenduDuVisible<unknown> | undefined, prets: PretsDeLAffichage,
): Promise<Record<string, unknown> | null> {
  const { tousNoeudsG, trouverDef, lecteursAEcrire, souffle, aretesRef, economieMemoireRef, pileMetaRef, t } = prets;
  if (!rendu) return null;
  const meta = trouverMeta(n.data.ficheId as string);
  const defNode = trouverDef(n.data.ficheId as string);
  // Le nœud pilote son propre affichage depuis `data` : ne rien écraser.
  //
  // SAUF LES DEUX CANAUX DÉCLARÉS ET SON MESSAGE. « Autonome » veut dire que le moteur ne lui
  // fabrique ni lecteur audio, ni aperçu, ni URL d'image : il montre ce qu'il a lui-même
  // désigné. Cela ne veut pas dire qu'il n'a rien à recevoir. Deux composants sont dans ce cas,
  // « Carte sonore » et « Coordonnées sur carte » : tous deux rendent `affichage` et leur vue
  // lit `_affichage.htmlPath`, or ce retour anticipé le jetait, si bien que la carte ne
  // pouvait pas s'afficher. Les canaux passent donc, et rien d'autre.
  if (defNode?.affichageAutonome) {
    const canaux = {
      audioResultatMessage: rendu.message ?? undefined,
      _affichage: rendu.affichage ?? undefined,
      _designe: rendu.designe ?? undefined,
    };
    return canaux._affichage || canaux._designe || canaux.audioResultatMessage ? lacherAffichage(n.id, canaux) : null;
  }
  const valsSafe = rendu.valeurs;
  // LA SORTIE QUI REPRÉSENTE CE QUE LE NŒUD A PRODUIT, et c'est le domaine qui la désigne.
  // Les nœuds dont les sorties sont des pairs — les six pistes d'un séparateur — le disent par
  // `sansApercuAudio`, et l'on ne demande alors rien.
  //
  // UN BLOC DE DIAGNOSTIC A DISPARU D'ICI, et il tenait de la fuite autant que de la trace :
  // il testait `ficheId === "griffin-lim"`, c'est-à-dire un identifiant de composant du domaine
  // écrit dans le shell, pour journaliser deux crêtes dans la console.
  const audio = defNode?.sansApercuAudio ? null : servicesApercu().valeurRepresentative(valsSafe);
  const fichier = valsSafe.find((v): v is File => v instanceof File);
  const imageFile = fichier && TYPES_IMAGE_APERCU.has(fichier.type) ? fichier : null;
  const midiFile = fichier && fichier.type.includes("midi") ? fichier : null;
  const texte = valsSafe.find((v): v is string => typeof v === "string");
  // Ce qu'une courbe produite donne à dessiner. Combien de points y suffisent, et ce qu'est une
  // courbe, relèvent du domaine : voir `plugins/apercu-domaine.ts`.
  const apercuCourbe = servicesApercu().apercuCourbe(valsSafe as unknown[]);
  // Réutilise l'URL existante si le buffer audio n'a pas changé — évite de
  // démonter/remonter le lecteur à chaque run (cache) et empêche le
  // rechargement gris/0:00 sur les nœuds déjà terminés.
  // Sur une valeur longue, un intermédiaire ne reçoit pas d'aperçu : personne ne l'ouvre, et
  // il sera construit le jour où l'on clique sur ce nœud — la valeur, elle, reste là. Ce que
  // cela pèse et à partir de quand cela compte relèvent du domaine, qui porte son seuil et son
  // arithmétique (cf. `audio/memoire-audio.ts`).
  // UN MEMBRE DE BULLE REPLIÉE NE RETIENT RIEN : ni aperçu, ni référence au tampon. Le premier
  // ne s'écouterait pas, le second annulerait la libération faite plus haut — un tampon qui
  // reste accroché aux données du nœud n'est pas libéré parce que le cache l'a lâché. SOUS LE
  // SEUIL, IL GARDE LES DEUX, comme le cache garde sa valeur : rien n'est libéré qu'il annulerait,
  // et « Développer » le montre aussitôt avec son lecteur.
  const membreReplie = !resultatRetenu({
    cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
    economie: economieMemoireRef?.current ?? true,
    lourd: valeursLourdes(valsSafe),
  });
  const garderApercu = !audio || (!membreReplie && servicesApercu().apercuUtile(audio, {
    regarde: noeudRegarde({
      id: n.id, selectionne: !!n.selected, aretes: aretesRef.current,
      dansUnMeta: (pileMetaRef?.current?.length ?? 0) > 0,
      // Un membre de bulle repliée n'est pas regardé : la bulle, elle, garde son aperçu.
      cacheParBulle: estCacheParBulle(tousNoeudsG, n.id),
    }),
    economie: economieMemoireRef?.current ?? true,
  }));
  // LE LECTEUR NE S'ÉCRIT PLUS ICI, IL SE PROMET. Son encodage dure 2,3 s pour cinq minutes de
  // son et 46 s pour une heure, mesuré, et il avait lieu AVANT que le résultat soit posé. Le
  // tampon, le message et tout le reste partent donc tout de suite — le bouton « Écouter » est
  // là immédiatement — et le lecteur les rejoint quand il est prêt.
  // CE QUE CE NŒUD PORTE DÉJÀ SE LIT DANS LE MAGASIN DES RÉSULTATS, et non dans ses données :
  // un résultat n'y vit plus. La réutilisation d'une adresse et sa révocation ont besoin de
  // l'état d'avant, et c'est là qu'il est.
  const dejaLa = resultatDe(n.id) as {
    audioResultatUrl?: string; audioResultatBuffer?: AudioBuffer;
    audioResultatRefaisable?: ApercuRefaisable;
    imageResultatUrl?: string; imageResultatFile?: File;
  };
  const bitsVoulus = lireProfondeurExport();
  // CE QUE LE FICHIER LIVRÉ DOIT PORTER EN PLUS DU SON, et seul un nœud dont l'aperçu est le
  // fichier en a : la pochette de « Sortie audio » arrive par là. Le shell ne la nomme pas.
  const affichageDuFichier = defNode?.apercuEstLeFichier ? rendu.affichage : undefined;
  let url: string | undefined, refaisable: ApercuRefaisable | undefined;
  if (audio && garderApercu) {
    // LA PROFONDEUR ENTRE DANS LA CONDITION DE RÉUTILISATION, et c'est un défaut mesuré :
    // l'adresse était gardée tant que le tampon était le même OBJET — bonne idée, elle évite
    // de démonter le lecteur à chaque run —, mais elle ne regardait pas à quelle profondeur
    // l'aperçu avait été écrit. Le sélecteur de profondeur était donc inopérant même en
    // relançant. Voir `ui/refaire-apercus.ts`, qui porte le relevé.
    // ET UNE ADRESSE DONT LE LECTEUR A PERDU LES OCTETS N'EST PLUS RÉEMPLOYÉE : sans cela, relancer
    // un nœud venu du cache rendait le même lecteur grisé. Voir `ui/refaire-apercus.ts`.
    // ET CE QUE LE FICHIER PORTE EN PLUS DU SON Y ENTRE AUSSI. À « Volume » 100 %, « Sortie audio »
    // rend le tampon de l'amont lui-même : brancher une pochette après un premier run laissait le
    // même objet, donc la même adresse, et le fichier enregistré sortait sans elle.
    if (audio === dejaLa.audioResultatBuffer && dejaLa.audioResultatUrl
      && dejaLa.audioResultatRefaisable?.bits === bitsVoulus && !apercuPerdu(dejaLa.audioResultatUrl)
      && memesChamps(dejaLa.audioResultatRefaisable?.reecriture.affichage, affichageDuFichier)) {
      // L'ADRESSE EST GARDÉE, DONC SON COMPAGNON AUSSI. Le correctif rendu plus bas pose TOUS
      // les champs, si bien que l'omettre ici l'effacerait : l'aperçu deviendrait
      // irréécrivable, et le sélecteur de profondeur inopérant sur ce nœud-là seulement.
      url = dejaLa.audioResultatUrl; refaisable = dejaLa.audioResultatRefaisable;
    } else {
      if (dejaLa.audioResultatUrl) URL.revokeObjectURL(dejaLa.audioResultatUrl);
      // LE NŒUD DÉCLARE QUE SA SORTIE PEUT SORTIR DE LA PLAGE, le shell ne tient plus la
      // liste : elle y était écrite en cinq identifiants de composants du domaine.
      const securiser = trouverDef(n.data.ficheId as string)?.sortieHorsPlagePossible === true;
      // Ce blob est à la fois l'aperçu écoutable et le fichier sauvegardé : la profondeur
      // choisie s'applique donc ici, et non au moment de la sauvegarde. Les séparer aurait
      // demandé de réencoder à l'enregistrement, donc de reconstruire les métadonnées que
      // seule cette boucle connaît. Ce qu'écrire veut dire — repliement d'un multicanal,
      // métadonnées, tranches qui rendent la main — appartient au domaine.
      const ficheId = n.data.ficheId as string;
      // LE NŒUD DÉCLARE QUE SON APERÇU EST LE FICHIER, le shell ne tient plus la liste. Elle
      // y était écrite en dur, sous la forme d'identifiants de composants du domaine, sur le
      // chemin d'exécution de tous les domaines. Les autres n'ont pas de métadonnées : leur
      // calcul parcourt la valeur entière, et un aperçu intermédiaire n'est jamais livré.
      const def = trouverDef(ficheId);
      const aEcouter = audio;
      // CE QU'IL FAUDRAIT POUR LE RÉÉCRIRE EST DÉPOSÉ À CÔTÉ, et c'est nécessaire : le nom
      // pour les métadonnées ne se redérive pas d'un nœud. `ui/refaire-apercus.ts` le relit
      // pour refaire l'aperçu à une autre profondeur sans rejouer le nœud.
      refaisable = { bits: bitsVoulus, reecriture: { securiser,
        nomPourMetadonnees: def?.apercuEstLeFichier ? (def.nom ?? ficheId) : undefined,
        ...(affichageDuFichier ? { affichage: affichageDuFichier } : {}) } };
      lecteursAEcrire.set(n.id, async () => {
        const blob = await servicesApercu().blobApercu(aEcouter, {
          ...refaisable!.reecriture, bits: bitsVoulus, souffle,
          onAvance: (part) => poserApercu(n.id, part),
        });
        return blob ? URL.createObjectURL(blob) : undefined;
      });
    }
  } else if (dejaLa.audioResultatUrl) {
    URL.revokeObjectURL(dejaLa.audioResultatUrl);
  }
  // Même logique pour l'image (Songsee, etc.) : réutilise l'URL si le File est identique.
  let imageUrl: string | undefined;
  if (imageFile) {
    if (imageFile === dejaLa.imageResultatFile && dejaLa.imageResultatUrl) {
      imageUrl = dejaLa.imageResultatUrl;
    } else {
      if (dejaLa.imageResultatUrl) URL.revokeObjectURL(dejaLa.imageResultatUrl);
      imageUrl = URL.createObjectURL(imageFile);
    }
  } else if (dejaLa.imageResultatUrl) {
    URL.revokeObjectURL(dejaLa.imageResultatUrl);
  }
  // Pour un méta-nœud : ne marquer "terminé" que si un résultat a été produit. Le cœur a vu que sa
  // chaîne interne n'a rien rendu, et nommé le premier interne resté vide ; marquer « erreur » —
  // surtout PAS le laisser « en_cours » (le run est fini, la branche ne tourne plus). Corrige le
  // méta figé « en cours » quand une branche parallèle n'aboutit pas alors que l'aval (mixeur) est
  // « terminé ». Le fautif est affiché pour qu'on le voie sans ouvrir le méta.
  if (rendu.brancheEnEchec) {
    const { fautif } = rendu.brancheEnEchec;
    poserStatut(n.id, "erreur");
    return { audioResultatMessage: fautif
        ? t("execution.brancheEchecSansResultat").replace("{fautif}", fautif)
        : t("execution.brancheEchecAucunResultat") };
  }
  // Un méta-composant n'est pas exécuté lui-même : ce sont ses nœuds internes qui tournent. Il ne
  // se déclare pas terminé ici, sur une sortie produite : c'est après le run, d'après TOUT son
  // contenu, qu'il l'est ou non. Voir `core/conteneurs.ts`.
  return lacherAffichage(n.id, {
    audioResultatUrl: url ?? undefined,
    audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
    audioResultatBuffer: membreReplie ? undefined : (audio ?? undefined),
    audioResultatRefaisable: refaisable,
    audioResultatMessage: rendu.message ?? (meta && audio ? t("execution.termine") : undefined),
    scriptGenere: texte ?? undefined,
    apercuCourbe,
    midiFichierSortie: midiFile ?? undefined,
    imageResultatUrl: imageUrl ?? undefined,
    imageResultatFile: imageFile ?? undefined,
    // LE CANAL DÉCLARÉ, posé sous deux clés réservées. Le `?? undefined` compte : un composant
    // qui ne rend plus rien à montrer doit effacer ce qu'il montrait au run précédent, sinon
    // l'écran décrirait une exécution qui n'a plus lieu.
    _affichage: rendu.affichage ?? undefined,
    _designe: rendu.designe ?? undefined,
  });
}

/**
 * Révoque les films que l'affichage d'avant tenait et que ce correctif ne tient plus, puis le rend.
 *
 * ICI, COMME L'URL DU SON ET CELLE DE L'IMAGE plus haut : le correctif est la seule pièce qui voit à
 * la fois l'affichage d'avant, dans le magasin, et celui qui le remplace. Le canal seul : `designe`
 * nomme ce que le nœud a reçu, et ce qui le porte n'est pas à lui. Voir `urlsLachees`.
 */
function lacherAffichage<T extends { _affichage?: unknown }>(id: string, correctif: T): T {
  const avant = (resultatDe(id) as { _affichage?: unknown })._affichage;
  for (const url of urlsLachees(avant, correctif._affichage)) URL.revokeObjectURL(url);
  return correctif;
}
