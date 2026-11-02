// ui/correctif-resultat.ts — Ce que le magasin des résultats reçoit pour un nœud, après son calcul.
//
// SORTI DU MOTEUR D'EXÉCUTION, sortie 6 du plan de simplification de `useExecutionGraphe.ts`, et
// SHELL ET NON CŒUR : cette fonction crée des adresses d'objet, lit le magasin des résultats et pose
// un statut. Elle vivait en fermeture dans `lancerUnePasse`, où elle lisait seize tables ; elles lui
// arrivent par `EtatDePasse`, et le corps est celui du moteur, ligne pour ligne.
//
// CE QU'ELLE DÉCIDE, en trois branches que les commentaires du corps détaillent : un méta montre ce
// que ses internes ont rendu sur ses sorties exposées, et passe en erreur s'ils n'ont rien rendu ;
// une bulle montre la seule sortie qui la représente ; un nœud montre ce qu'il a produit, avec un
// lecteur PROMIS plutôt qu'écrit, une adresse réutilisée tant que le tampon et la profondeur sont
// les mêmes, et rien de lourd quand une bulle repliée le cache.
import { estBulle, estCacheParBulle, sortieDeBulle, trouverMeta } from "../core";
import { noeudRegarde, resultatRetenu } from "../core/memoire";
import { poserApercu, poserStatut } from "./statuts";
import { resultatDe } from "./resultats";
import { servicesApercu, type ApercuRefaisable } from "./services-apercu";
import { lireProfondeurExport } from "./profondeur-export";
import type { EtatDePasse } from "./etat-de-passe";

/**
 * Ces valeurs atteignent-elles le seuil où un membre de bulle repliée les lâche ? Voir `resultatRetenu`.
 *
 * C'EST LA QUESTION DES APERÇUS, POSÉE POUR UN INTERMÉDIAIRE ET SANS LA BASCULE : une valeur dont le
 * domaine ne garderait pas l'aperçu d'un nœud non regardé est lourde. Le seuil reste donc écrit une
 * seule fois, dans le domaine ; la bascule, elle, est lue par `resultatRetenu`. Une seule sortie
 * lourde suffit : l'entrée de cache les retient toutes.
 */
export const valeursLourdes = (valeurs: readonly unknown[] | undefined): boolean =>
  (valeurs ?? []).some((v) => v != null && !servicesApercu().apercuUtile(v, { regarde: false, economie: true }));

/** Champs à mettre à jour sur un nœud après le run, ou `null` s'il n'y a rien à changer. */
export async function calculerCorrectifResultat(n: any, passe: EtatDePasse): Promise<Record<string, unknown> | null> {
  const {
    resultats, messages, affichageParNoeud, designeParNoeud, tousNoeudsG, aretesReelles, ordreFiltre,
    noeudsPlats, estMetaEnScope, trouverDef, lecteursAEcrire, souffle, aretesRef, economieMemoireRef, pileMetaRef, t,
  } = passe;
  const meta = trouverMeta(n.data.ficheId as string);
  // Méta hors du périmètre du run (branche non exécutée) : ne pas y toucher —
  // il garde son statut précédent au lieu de passer « en cours »/« erreur ».
  if (meta && !estMetaEnScope(n.id)) return null;
  // Pour un méta-nœud, on récupère les résultats de ses nœuds internes
  // aplatis (préfixés par l'id du méta-nœud) via ses ports de sortie exposés.
  // UNE BULLE MONTRE LE RÉSULTAT DE CE QUI EN SORT. Elle ne calcule rien, mais elle expose les
  // sorties de tous ses membres : donner la liste entière à l'aperçu lui ferait jouer la
  // première venue, c'est-à-dire le plus souvent le DÉBUT de la chaîne repliée. On ne lui donne
  // donc que la sortie qui représente la bulle, et rien si aucune ne la représente à elle seule.
  // Aucun préfixe d'identifiant ici, contrairement au méta-nœud : replier ne renomme personne.
  const sortie = estBulle(n.data.ficheId as string)
    ? sortieDeBulle(tousNoeudsG, aretesReelles, n.id, trouverDef)
    : null;
  const vals = meta
    ? meta.sorties.map((_, i) => {
        const m = meta.mapSorties[i];
        return resultats.get(`${n.id}::${m.noeudInterne}`)?.[m.portIndex] ?? null;
      })
    : estBulle(n.data.ficheId as string)
      ? (sortie ? [resultats.get(sortie.noeudInterne)?.[sortie.portIndex] ?? null] : [])
      : resultats.get(n.id);
  const defNode = trouverDef(n.data.ficheId as string);
  if ((!vals || vals.length === 0) && !messages.has(n.id)) return null;
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
      audioResultatMessage: messages.get(n.id) ?? undefined,
      _affichage: affichageParNoeud.get(n.id) ?? undefined,
      _designe: designeParNoeud.get(n.id) ?? undefined,
    };
    return canaux._affichage || canaux._designe || canaux.audioResultatMessage ? canaux : null;
  }
  const valsSafe = vals ?? [];
  // LA SORTIE QUI REPRÉSENTE CE QUE LE NŒUD A PRODUIT, et c'est le domaine qui la désigne.
  // Les nœuds dont les sorties sont des pairs — les six pistes d'un séparateur — le disent par
  // `sansApercuAudio`, et l'on ne demande alors rien.
  //
  // UN BLOC DE DIAGNOSTIC A DISPARU D'ICI, et il tenait de la fuite autant que de la trace :
  // il testait `ficheId === "griffin-lim"`, c'est-à-dire un identifiant de composant du domaine
  // écrit dans le shell, pour journaliser deux crêtes dans la console.
  const audio = defNode?.sansApercuAudio ? null : servicesApercu().valeurRepresentative(valsSafe);
  const fichier = valsSafe.find((v): v is File => v instanceof File);
  const imageFile = fichier && (fichier.type === "image/png" || fichier.type === "image/jpeg" || fichier.type === "image/svg+xml") ? fichier : null;
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
  let url: string | undefined, refaisable: ApercuRefaisable | undefined;
  if (audio && garderApercu) {
    // LA PROFONDEUR ENTRE DANS LA CONDITION DE RÉUTILISATION, et c'est un défaut mesuré :
    // l'adresse était gardée tant que le tampon était le même OBJET — bonne idée, elle évite
    // de démonter le lecteur à chaque run —, mais elle ne regardait pas à quelle profondeur
    // l'aperçu avait été écrit. Le sélecteur de profondeur était donc inopérant même en
    // relançant. Voir `ui/refaire-apercus.ts`, qui porte le relevé.
    if (audio === dejaLa.audioResultatBuffer && dejaLa.audioResultatUrl
      && dejaLa.audioResultatRefaisable?.bits === bitsVoulus) {
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
        nomPourMetadonnees: def?.apercuEstLeFichier ? (def.nom ?? ficheId) : undefined } };
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
  // Pour un méta-nœud : ne marquer "terminé" que si un résultat a été produit
  if (meta) {
    const aResultat = valsSafe.some((v) => v != null);
    if (meta.sorties.length > 0 && !aResultat && !messages.has(n.id)) {
      // Le run est terminé et le méta n'a rien produit sur ses sorties : sa
      // chaîne interne a échoué. Marquer « erreur » — surtout PAS le laisser
      // « en_cours » (le run est fini, la branche ne tourne plus). Corrige le
      // méta figé « en cours » quand une branche parallèle n'aboutit pas alors
      // que l'aval (mixeur) est « terminé ».
      // On identifie en plus le premier nœud interne (ordre topo) resté sans
      // résultat — la cause de l'échec, souvent une entrée manquante (fichier
      // audio non sérialisé à la sauvegarde) — pour l'afficher sans ouvrir le méta.
      const prefixe = `${n.id}::`;
      let fautif = "";
      for (const fid of ordreFiltre) {
        if (!fid.startsWith(prefixe)) continue;
        const r = resultats.get(fid);
        if (!r || r.every((v) => v == null)) {
          fautif = ((noeudsPlats.find((pn) => pn.id === fid)?.data as { ficheId?: string })?.ficheId) ?? "";
          break;
        }
      }
      poserStatut(n.id, "erreur");
      return { audioResultatMessage: fautif
          ? t("execution.brancheEchecSansResultat").replace("{fautif}", fautif)
          : t("execution.brancheEchecAucunResultat") };
    }
  }
  // Un méta-composant n'est pas exécuté lui-même : ce sont ses nœuds internes qui tournent. Il ne
  // se déclare pas terminé ici, sur une sortie produite : c'est après le run, d'après TOUT son
  // contenu, qu'il l'est ou non. Voir `core/conteneurs.ts`.
  return {
    audioResultatUrl: url ?? undefined,
    audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
    audioResultatBuffer: membreReplie ? undefined : (audio ?? undefined),
    audioResultatRefaisable: refaisable,
    audioResultatMessage: messages.get(n.id) ?? (meta && audio ? t("execution.termine") : undefined),
    scriptGenere: texte ?? undefined,
    apercuCourbe,
    midiFichierSortie: midiFile ?? undefined,
    imageResultatUrl: imageUrl ?? undefined,
    imageResultatFile: imageFile ?? undefined,
    // LE CANAL DÉCLARÉ, posé sous deux clés réservées. Le `?? undefined` compte : un composant
    // qui ne rend plus rien à montrer doit effacer ce qu'il montrait au run précédent, sinon
    // l'écran décrirait une exécution qui n'a plus lieu.
    _affichage: affichageParNoeud.get(n.id) ?? undefined,
    _designe: designeParNoeud.get(n.id) ?? undefined,
  };
}
