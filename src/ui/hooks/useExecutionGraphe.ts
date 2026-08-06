// ui/hooks/useExecutionGraphe.ts — Exécution du graphe (la boucle `lancer`) +
// réinitialisation d'un nœud (cascade aval) + statuts.
// Extrait d'App.tsx à l'identique (comportement inchangé). L'ordonnancement, le
// cache et la résolution d'entrées reposent sur les fonctions pures testées de
// core/graphe.ts ; ce hook orchestre l'aplatissement des métas, l'appel des
// plugins et la remontée des résultats dans l'état React.
import { useCallback } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { Edge } from "@xyflow/react";
import {
  aplatirGraphe, trouverMeta,
  ordreTopologique, ancetres, empreinteParametres, empreinteEntrees, empreinteValeursEntrantes,
  resoudreEntree, valeursEntrantes, validerGraphe,
  type NoeudG, type AreteG, type TypeValeur,
} from "../../core";
import { estResultatEnErreur } from "../../core/execution";
import { registre } from "../../audio/adaptateur";
import { bufferVersWavBlob } from "../../audio";
import { useI18n, valeurCanoniqueChoix } from "../../i18n";

const trouverDef = (id: string) => registre.trouverDef(id);
const FORMULA_NODE_IDS = ["formule-echantillons", "formule-spectrale", "generateur-audio-mathematique"];
const NOEUDS_AVEC_PLAFOND_PREVIEW = [...FORMULA_NODE_IDS, "julia-processor", "python-processor"];
const AVERTISSEMENT_FORMULE_KEY = "attic-avertissement-formule";

// Champs saisis par l'utilisateur : ils ne doivent JAMAIS être réinitialisés par
// une cascade de reset. Seuls les résultats de calcul (URLs blob, buffers,
// statuts, messages, cache) peuvent être effacés.
// Exporté : sert aussi d'allowlist au copier-coller (App.tsx) — copier UNIQUEMENT
// ces champs plutôt que tout `data` sans filtre, pour ne jamais dupliquer un
// résultat calculé (buffer audio, URL blob…) sur un nœud qui n'a pas encore
// tourné lui-même. Voir le commit qui a introduit ce commentaire pour le détail
// du bug : un nœud collé affichait/jouait le résultat de l'original avant même
// sa première exécution, car `audioResultatBuffer`/`audioResultatUrl` etc.
// étaient copiés par erreur avec le reste de `data`.
export const CHAMPS_UTILISATEUR = new Set([
  "ficheId",
  "nom",
  "parametres",
  "zonesSelectionnees",
  "audioFichier",
  "audioNom",
  "audioUrl",
  "midiFichier",
  "midiNom",
  "midiUrl",
  "imageFichier",
  "imageNom",
  "imageUrl",
  "svgFichier",
  "svgNom",
  "svgUrl",
  "irFichier",
  "irNom",
  "enregistrementBlob",
  "enregistrementUrl",
]);

export interface OptionsExecution {
  noeudsRef: MutableRefObject<any[]>;
  aretesRef: MutableRefObject<any[]>;
  enExecRef: MutableRefObject<boolean>;
  prioritaireRef: MutableRefObject<string | null>;
  audioCtxRef: MutableRefObject<AudioContext | null>;
  cacheExec: MutableRefObject<Map<string, any>>;
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEnExecution: (b: boolean) => void;
  prioritaire: string | null;
  setPrioritaire: (id: string | null) => void;
  repertoire: string;
  onGrapheGenere?: (nodeId: string, spec: { nodes: { ficheId: string; label: string }[]; edges: { source: number; target: number }[] }) => void;
  onNodeInstalle?: () => void;
}

export function useExecutionGraphe(o: OptionsExecution) {
  const { t } = useI18n();
  const {
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec,
    setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    onGrapheGenere, onNodeInstalle,
  } = o;

  async function obtenirAudio() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended") {
      try { await audioCtxRef.current.resume(); } catch { /* ignore */ }
    }
    return audioCtxRef.current;
  }

  const definirStatut = (nodeId: string, statut: string, progression?: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        // Ne recréer l'objet que si le statut a réellement changé
        if (n.data.statut === statut && n.data.progression === progression) return n;
        return { ...n, data: { ...n.data, statut, progression } };
      })
    );
  };

  // ── Réinitialiser un ensemble de nœuds ──
  const reinitialiserIds = useCallback((ids: Set<string>) => {
    setNodes((nds) => nds.map((n) => {
      if (!ids.has(n.id)) return n;
      if (n.data.audioResultatUrl) URL.revokeObjectURL(n.data.audioResultatUrl);
      if ((n.data as any).mp3Url) URL.revokeObjectURL((n.data as any).mp3Url);
      if (n.data.imageResultatUrl) URL.revokeObjectURL(n.data.imageResultatUrl);
      if (n.data.visualisationUrl) URL.revokeObjectURL(n.data.visualisationUrl);
      const nouvelleData: any = {
        ...n.data,
        statut: "attente",
        progression: undefined,
        audioResultatUrl: undefined,
        audioResultatNom: undefined,
        audioResultatBuffer: undefined,
        audioResultatMessage: undefined,
        scriptGenere: undefined,
        mp3Url: undefined,
        imageResultatUrl: undefined,
        imageResultatFile: undefined,
        visualisationUrl: undefined,
        tempsExecution: undefined,
      };
      // Garde-fou : on ne doit jamais effacer un champ utilisateur.
      for (const champ of CHAMPS_UTILISATEUR) {
        if (champ in nouvelleData && nouvelleData[champ] === undefined && (n.data as any)[champ] !== undefined) {
          console.warn(`[reinitialiserIds] Tentative de réinitialisation du champ utilisateur "${champ}" — opération annulée.`);
          nouvelleData[champ] = (n.data as any)[champ];
        }
      }
      return { ...n, data: nouvelleData };
    }));
    for (const id of ids) cacheExec.current.delete(id);
  }, [setNodes]);

  // ── Réinitialiser un nœud (cascade aval) ──
  // Utilise aretesRef pour toujours avoir les arêtes courantes (pas une closure périmée).
  const reinitialiserNoeud = useCallback((nodeId: string) => {
    const edgesCourantes = aretesRef.current;
    const ids = new Set<string>();
    const file = [nodeId];
    while (file.length > 0) {
      const courant = file.pop()!;
      if (ids.has(courant)) continue;
      ids.add(courant);
      for (const e of edgesCourantes) {
        if (e.source === courant && !ids.has(e.target)) file.push(e.target);
      }
    }
    reinitialiserIds(ids);
  }, [reinitialiserIds]);

  // ── Réinitialiser tous les nœuds (reset global) ──
  const reinitialiserTout = useCallback(() => {
    const ids = new Set(noeudsRef.current.map((n) => n.id));
    reinitialiserIds(ids);
  }, [reinitialiserIds]);

  const lancer = useCallback(async (noeudPrioritaireId?: string) => {
    // Ne pas bloquer si on lance un node individuellement (prioritaire)
    // — seul le bouton Run global (sans prioritaire) est bloqué pendant l'exécution
    if (!noeudPrioritaireId && enExecRef.current) return;
    if (noeudsRef.current.length === 0) return;
    if (!noeudPrioritaireId) setEnExecution(true);
    try {
    console.log(`[lancer] priorite=${noeudPrioritaireId} nodes=${noeudsRef.current.length} cacheSize=${cacheExec.current.size}`);
    // Aplatit les méta-composants (sous-graphes) en leur contenu réel avant
    // d'exécuter : le moteur DAG tourne sur un graphe sans méta-nœud. Les
    // résultats des nœuds internes sont remontés au méta-nœud via `expansions`.
    const plat = aplatirGraphe(
      noeudsRef.current as unknown as NoeudG[],
      aretesRef.current as unknown as AreteG[],
      trouverMeta,
    );
    const nds = plat.noeuds as unknown as any[];
    const aretes = plat.aretes as unknown as Edge[];
    const priorite = noeudPrioritaireId ?? prioritaireRef.current;

    // Topologie (logique pure testée — cf. core/graphe.ts)
    const aretesG = aretes as unknown as AreteG[];
    const ordonnees = ordreTopologique(nds.map((n) => n.id), aretesG);
    let ordreFiltre = ordonnees;
    // Périmètre d'un run ciblé (nœud prioritaire) : null = run global (tout le graphe).
    let ancPriorite: Set<string> | null = null;
    if (priorite) {
      // Si le nœud prioritaire est un méta, il n'existe pas dans le graphe aplati
      // (il est expansé) : cibler ses nœuds de sortie internes aplatis, sinon
      // `ancetres` ne renvoie que lui-même et rien ne s'exécute.
      let cibles = [priorite];
      const noeudPrio = noeudsRef.current.find((n) => n.id === priorite);
      const metaPrio = noeudPrio && trouverMeta((noeudPrio.data as { ficheId?: string }).ficheId as string);
      if (metaPrio) cibles = (metaPrio.mapSorties as { noeudInterne: string }[]).map((m) => `${priorite}::${m.noeudInterne}`);
      const anc = new Set<string>();
      for (const c of cibles) for (const a of ancetres(c, aretesG)) anc.add(a);
      ancPriorite = anc;
      ordreFiltre = ordonnees.filter((id) => anc.has(id));
    }

    // ── Garde-fou : valider les types de connexions avant exécution (spec §10) ──
    // Résout les types depuis les PluginDef et rejette les arêtes incompatibles.
    // Les nœuds cibles passent en statut « erreur » et ne sont pas exécutés.
    // `validerGraphe` inspecte TOUT le graphe (entrées obligatoires non connectées
    // comprises) : sur un run ciblé (nœud prioritaire), un nœud hors périmètre —
    // même totalement déconnecté du nœud lancé — se faisait donc marquer « erreur »
    // alors qu'il n'a ni lien ni exécution avec le nœud sur lequel on a cliqué
    // « lancer ». On restreint donc l'application des résultats de validation au
    // périmètre du run (`ancPriorite`), comme le fait déjà `ordreFiltre` plus bas.
    const validation = validerGraphe(
      plat.noeuds,
      aretes as unknown as AreteG[],
      (ficheId) => trouverDef(ficheId),
      registre.fluxCompatibles,
    );
    const noeudsEnErreur = new Set<string>();
    for (const [nodeId, msgs] of validation.noeudsAffectes) {
      if (ancPriorite && !ancPriorite.has(nodeId)) continue;
      noeudsEnErreur.add(nodeId);
      definirStatut(nodeId, "erreur", msgs[0]);
    }
    // Un méta est « dans le périmètre » du run ssi au moins un de ses nœuds internes
    // aplatis (`${id}::…`) y figure. Un run prioritaire ne doit PAS toucher les métas
    // hors périmètre (branches déconnectées) — sinon ils passaient « en cours » puis
    // « erreur », donnant l'illusion d'un run global.
    const idsDecoratifs = new Set(nds.filter((n: any) => n.data?.ficheId === "comment" || n.data?.ficheId === "frame").map((n: any) => n.id));
    ordreFiltre = ordreFiltre.filter((id) => !idsDecoratifs.has(id));
    const estMetaEnScope = (nodeId: string) => ordreFiltre.some((id) => id.startsWith(`${nodeId}::`));

    for (const id of ordreFiltre) {
      if (!noeudsEnErreur.has(id)) definirStatut(id, "attente");
    }

    // Marquer les méta-nœuds visibles comme "en_cours"
    for (const n of noeudsRef.current) {
      const meta = trouverMeta(n.data.ficheId as string);
      if (meta && !noeudsEnErreur.has(n.id) && estMetaEnScope(n.id)) {
        definirStatut(n.id, "en_cours");
      }
    }

    // ── Avertissement de sécurité pour les nœuds de formules mathématiques ──
    // Affiché une seule fois par session utilisateur via localStorage.
    const contientFormule = ordreFiltre.some((id) => {
      const n = nds.find((n: any) => n.id === id);
      return n && FORMULA_NODE_IDS.includes(n.data?.ficheId);
    });
    if (contientFormule) {
      try {
        if (typeof localStorage !== "undefined" && !localStorage.getItem(AVERTISSEMENT_FORMULE_KEY)) {
          const confirmer = window.confirm(t("msg.avertissement_formule"));
          if (!confirmer) {
            if (!noeudPrioritaireId) setEnExecution(false);
            return;
          }
          localStorage.setItem(AVERTISSEMENT_FORMULE_KEY, "1");
        }
      } catch { /* ignore localStorage errors */ }
    }

    const ctx = await obtenirAudio();
    const resultats = new Map<string, TypeValeur[]>();
    const messages = new Map<string, string>();
    const traitesCeRun = new Set<string>();

    // Retour visuel IMMÉDIAT sur le méta propriétaire d'un nœud interne en échec.
    // Sans ça le méta garde son « en cours » (posé en amont) jusqu'à la passe
    // finale — qui n'arrive qu'à la toute fin du run, voire jamais si une autre
    // branche est très lente : le méta semble alors tourner normalement alors que
    // sa chaîne interne a déjà échoué. `expansions` relie un id aplati au
    // méta-nœud visible d'origine.
    const marquerMetaEnEchec = (idAplati: string, detail?: string) => {
      const proprio = plat.expansions.get(idAplati);
      if (proprio && proprio !== idAplati) {
        definirStatut(proprio, "erreur", detail ? t("execution.brancheEnEchecDetail").replace("{detail}", detail) : t("execution.brancheEnEchec"));
      }
    };

    const tempsParVisible = new Map<string, number>();

    for (let i = 0; i < ordreFiltre.length; i++) {
      const nodeId = ordreFiltre[i];
      // Sauter les nœuds en erreur (connexion illégale) — déjà marqués « erreur »
      if (noeudsEnErreur.has(nodeId)) continue;
      // ── Propagation d'erreur ──
      // Si une entrée de ce nœud provient d'un nœud en erreur (validation OU échec
      // d'exécution), il ne peut pas produire un résultat correct : le marquer en
      // erreur au lieu de « réussir » silencieusement avec une entrée manquante —
      // cas d'un mixer/joiner de terminaison en aval de branches parallèles dont
      // une a échoué. L'ordre topologique garantit que la source est déjà traitée.
      const entreeFautive = aretesG.find((a) => a.target === nodeId && noeudsEnErreur.has(a.source));
      if (entreeFautive) {
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        definirStatut(nodeId, "erreur", t("execution.entreeEnErreur").replace("{source}", entreeFautive.source));
        marquerMetaEnEchec(nodeId);
        continue;
      }
      const node = nds.find((n) => n.id === nodeId);
      if (!node) {
 continue; }

      const sourceReprocessee = aretes.some((a) => a.target === nodeId && traitesCeRun.has(a.source));
      const hashParams = empreinteParametres(node.data);
      const monHashEntree = empreinteEntrees(nodeId, aretesG);
      const hashValeursEntree = empreinteValeursEntrantes(nodeId, aretesG, resultats);
      const entreeCache = cacheExec.current.get(nodeId);

      // Certains nodes (sans sortie, avec I/O fichiers) ne doivent jamais être
      // cachés — la fiche le déclare, le moteur ne connaît aucun id en dur.
      const jamaisCache = trouverDef(node.data.ficheId as string)?.jamaisCache === true;

      const cacheIdentique =
        !jamaisCache &&
        !sourceReprocessee &&
        entreeCache &&
        entreeCache.hashParams === hashParams &&
        entreeCache.hashEntree === monHashEntree &&
        entreeCache.hashValeursEntree === hashValeursEntree;

      console.log(`[cache] ${nodeId}(${node.data.ficheId}) sourceReprocessee=${sourceReprocessee} jamaisCache=${jamaisCache} hit=${cacheIdentique} hashParams=${hashParams} hashEntree=${monHashEntree} hashValeursEntree=${hashValeursEntree} cached=${entreeCache ? { hp: entreeCache.hashParams, he: entreeCache.hashEntree, hv: entreeCache.hashValeursEntree } : null}`);

      if (cacheIdentique) {
        resultats.set(nodeId, entreeCache.valeurs);
        definirStatut(nodeId, "termine");
        if (typeof entreeCache.tempsExecution === "number") {
          const visibleId = plat.expansions.get(nodeId) ?? nodeId;
          tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + entreeCache.tempsExecution);
        }
        continue;
      }

      // Le statut « en cours » n'est posé qu'après le test de cache : un nœud
      // déjà en cache ne doit pas flasher « en cours »/« terminé » — ce flash
      // donnait l'impression que le modèle Qwen redémarrait inutilement.
      definirStatut(nodeId, "en_cours", t("execution.etape").replace("{i}", String(i + 1)).replace("{total}", String(ordreFiltre.length)));

      // NE PAS invalider tous les nœuds en aval dans l'ordre topologique plat :
      // cela réexécutait les branches PARALLÈLES (sœurs) d'un nœud rejoué, car
      // elles suivent ce nœud dans l'ordre linéaire sans en dépendre. La
      // réexécution des vrais descendants est déjà assurée par `sourceReprocessee`
      // (propagation transitive via `traitesCeRun`), qui ne touche QUE les
      // nœuds dont une entrée réelle a été recalculée ce run.
      traitesCeRun.add(nodeId);

      const fn = registre.trouverPlugin(node.data.ficheId as string);
      if (!fn) { noeudsEnErreur.add(nodeId); resultats.set(nodeId, [null]); definirStatut(nodeId, "erreur"); marquerMetaEnEchec(nodeId, node.data.ficheId as string); continue; }

      const start = performance.now();
      const ajouterTemps = (ms: number) => {
        const visibleId = plat.expansions.get(nodeId) ?? nodeId;
        tempsParVisible.set(visibleId, (tempsParVisible.get(visibleId) ?? 0) + ms);
      };
      try {
        const res = await fn({
          noeud: node,
          runtime: ctx,
          repertoireTravail: repertoire,
          entree: (idx: number) => resoudreEntree<TypeValeur>(nodeId, idx, aretesG, resultats) as TypeValeur,
          entrees: () => valeursEntrantes<TypeValeur>(nodeId, aretesG, resultats),
          paramNombre: (nom: string, defaut: number) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            if (typeof p === "number") return p;
            const def = trouverDef(node.data.ficheId as string);
            const pDef = def?.parametres.find((p) => p.nom === nom);
            const defautEff = typeof pDef?.defautEn === "number" ? pDef.defautEn : defaut;
            return defautEff;
          },
          paramTexte: (nom: string, defaut: string) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            const def = trouverDef(node.data.ficheId as string);
            const pDef = def?.parametres.find((p) => p.nom === nom);
            if (typeof p === "string" && pDef) {
              return String(valeurCanoniqueChoix(pDef, p));
            }
            const defautEff = typeof pDef?.defautEn === "string" ? pDef.defautEn : defaut;
            return pDef ? String(valeurCanoniqueChoix(pDef, defautEff)) : defautEff;
          },
          onProgress: (msg: string) => definirStatut(nodeId, "en_cours", msg),
        });
        resultats.set(nodeId, res.valeurs as TypeValeur[]);
        if (res.message) messages.set(nodeId, res.message);
        // Un nœud qui A des sorties mais ne renvoie QUE des null n'a pas réussi
        // (entrée manquante, pas assez d'entrées, fichier absent…) : le marquer
        // « erreur » (et donc le propager) au lieu de « terminé ». Sinon un
        // mixer/endpoint en aval « aboutit » alors qu'aucun résultat n'a été
        // produit — la branche n'a rien donné mais le workflow paraît réussi.
        // …SAUF si la fiche déclare qu'une sortie nulle est un résultat valide
        // (sortieNullePermise) : « aucune note détectée » d'un transcripteur ou
        // un nœud-frontière ne sont pas des échecs.
        const defRes = trouverDef(node.data.ficheId as string);
        if (estResultatEnErreur(defRes, res as { valeurs: TypeValeur[]; erreur?: boolean })) {
          noeudsEnErreur.add(nodeId);
          definirStatut(nodeId, "erreur", res.message);
          marquerMetaEnEchec(nodeId, node.data.ficheId as string);
          ajouterTemps(performance.now() - start);
        } else {
          const elapsed = performance.now() - start;
          cacheExec.current.set(nodeId, { valeurs: res.valeurs, hashParams, hashEntree: monHashEntree, hashValeursEntree, tempsExecution: elapsed });
          console.log(`[cache store] ${nodeId}(${node.data.ficheId}) hashParams=${hashParams} hashEntree=${monHashEntree} hashValeursEntree=${hashValeursEntree}`);
          definirStatut(nodeId, "termine");
          ajouterTemps(elapsed);
        }
      } catch (e: any) {
        // Spec §6.5 : toute exception d'un executer est journalisée (console.error)
        // ET remontée sur le nœud (statut « erreur » + message).
        const elapsed = performance.now() - start;
        console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        definirStatut(nodeId, "erreur", e?.message ? String(e.message) : undefined);
        marquerMetaEnEchec(nodeId, node.data.ficheId as string);
        ajouterTemps(elapsed);
      }
    }

    // Mettre à jour les URL audio
    setNodes((nds) =>
      nds.map((n) => {
        const meta = trouverMeta(n.data.ficheId as string);
        // Méta hors du périmètre du run (branche non exécutée) : ne pas y toucher —
        // il garde son statut précédent au lieu de passer « en cours »/« erreur ».
        if (meta && !estMetaEnScope(n.id)) return n;
        // Pour un méta-nœud, on récupère les résultats de ses nœuds internes
        // aplatis (préfixés par l'id du méta-nœud) via ses ports de sortie exposés.
        const vals = meta
          ? meta.sorties.map((_, i) => {
              const m = meta.mapSorties[i];
              return resultats.get(`${n.id}::${m.noeudInterne}`)?.[m.portIndex] ?? null;
            })
          : resultats.get(n.id);
        const defNode = trouverDef(n.data.ficheId as string);
        if ((!vals || vals.length === 0) && !messages.has(n.id)) return n;
        // Le nœud pilote son propre affichage depuis `data` : ne rien écraser.
        if (defNode?.affichageAutonome) return n;
        const valsSafe = vals ?? [];
        // Ne pas créer de lecteur audio générique pour les nodes multi-sorties audio
        // (ex: séparateur IA) — chaque sortie a son propre lecteur via les ports.
        const nbSortiesAudio = defNode?.sorties.filter((s: any) => s.type === "audio").length ?? 0;
        const audio = nbSortiesAudio > 1 ? null : valsSafe.find((v): v is AudioBuffer => v instanceof AudioBuffer);
        const fichier = valsSafe.find((v): v is File => v instanceof File);
        const imageFile = fichier && (fichier.type === "image/png" || fichier.type === "image/jpeg" || fichier.type === "image/svg+xml") ? fichier : null;
        const midiFile = fichier && fichier.type.includes("midi") ? fichier : null;
        const texte = valsSafe.find((v): v is string => typeof v === "string");
        // Embarquer le graphe dans le WAV de prévisualisation si le node l'a demandé
        const grapheExport = (n.data as any)?._grapheExport as string | undefined;
        // Réutilise l'URL existante si le buffer audio n'a pas changé — évite de
        // démonter/remonter le lecteur à chaque run (cache) et empêche le
        // rechargement gris/0:00 sur les nœuds déjà terminés.
        let url: string | undefined;
        if (audio) {
          if (audio === n.data.audioResultatBuffer && n.data.audioResultatUrl) {
            url = n.data.audioResultatUrl;
          } else {
            if (n.data.audioResultatUrl) URL.revokeObjectURL(n.data.audioResultatUrl);
            const securiser = NOEUDS_AVEC_PLAFOND_PREVIEW.includes(n.data.ficheId as string);
            url = URL.createObjectURL(bufferVersWavBlob(audio, grapheExport, securiser));
          }
        } else if (n.data.audioResultatUrl) {
          URL.revokeObjectURL(n.data.audioResultatUrl);
        }
        // Même logique pour l'image (Songsee, etc.) : réutilise l'URL si le File est identique.
        let imageUrl: string | undefined;
        if (imageFile) {
          if (imageFile === n.data.imageResultatFile && n.data.imageResultatUrl) {
            imageUrl = n.data.imageResultatUrl;
          } else {
            if (n.data.imageResultatUrl) URL.revokeObjectURL(n.data.imageResultatUrl);
            imageUrl = URL.createObjectURL(imageFile);
          }
        } else if (n.data.imageResultatUrl) {
          URL.revokeObjectURL(n.data.imageResultatUrl);
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
                fautif = ((plat.noeuds.find((pn) => pn.id === fid)?.data as { ficheId?: string })?.ficheId) ?? "";
                break;
              }
            }
            return { ...n, data: { ...n.data, statut: "erreur" as const,
              audioResultatMessage: fautif
                ? t("execution.brancheEchecSansResultat").replace("{fautif}", fautif)
                : t("execution.brancheEchecAucunResultat") } };
          }
        }
        return {
          ...n,
          data: {
            ...n.data,
            audioResultatUrl: url ?? undefined,
            audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
            audioResultatBuffer: audio ?? undefined,
            audioResultatMessage: messages.get(n.id) ?? (meta && audio ? t("execution.termine") : undefined),
            scriptGenere: texte ?? undefined,
            midiFichierSortie: midiFile ?? undefined,
            imageResultatUrl: imageUrl ?? undefined,
            imageResultatFile: imageFile ?? undefined,
            ...(meta ? { statut: "termine" as const } : {}),
          },
        };
      })
    );

    // Appliquer les temps d'exécution mesurés (cumulés par nœud visible, y compris méta)
    if (tempsParVisible.size > 0) {
      setNodes((nds) =>
        nds.map((n) => {
          if (!tempsParVisible.has(n.id)) return n;
          const t = tempsParVisible.get(n.id)!;
          if (n.data.tempsExecution === t) return n;
          return { ...n, data: { ...n.data, tempsExecution: t } };
        })
      );
    }

    // Vérifier si un node a généré une spec de graphe (prompt → graphe)
    //
    // IMPORTANT : on itère `nds` (l'instantané aplati LOCAL à ce `lancer()`,
    // capturé à la ligne ~166), PAS `noeudsRef.current`. `ctx.noeud` passé au
    // plugin pointe vers les entrées de `nds` ; `definirStatut` (appelé au
    // moins une fois par nœud AVANT même l'appel du plugin, pour passer en
    // "en_cours") crée lui un NOUVEL objet `data` via spread pour l'état React
    // — donc dès ce premier appel, `noeudsRef.current` ne contient déjà plus
    // le MÊME objet `data` que celui que le plugin mute ensuite (`ctx.noeud.data`
    // reste l'ancien objet, maintenant orphelin de l'état React). Toute
    // mutation que le plugin fait sur `ctx.noeud.data` (ex. `_grapheGenere`,
    // `_grapheEmbarque`, `_nodeInstalle` ci-dessous) était donc invisible ici
    // — bug préexistant, vérifié sur le code d'origine (avant l'ajout du mode
    // Ollama), qui rendait la génération de graphe totalement silencieuse :
    // le nœud passait bien à « Terminé » mais rien n'apparaissait sur le
    // canevas. `nds`, lui, référence directement les objets mutés par les
    // plugins — aucune de ces trois fonctionnalités ne peut avoir fonctionné
    // depuis l'introduction de cette optimisation de `definirStatut`.
    if (onGrapheGenere) {
      for (const n of nds) {
        const spec = (n.data as any)?._grapheGenere;
        if (spec && spec.nodes && spec.edges) {
          onGrapheGenere(n.id, { nodes: spec.nodes, edges: spec.edges });
          (n.data as any)._grapheGenere = undefined;
        }
        // Graphe embarqué dans un fichier audio importé
        const embarque = (n.data as any)?._grapheEmbarque;
        if (embarque && embarque.nodes && embarque.edges) {
          onGrapheGenere(n.id, {
            nodes: embarque.nodes.map((nn: any) => ({ ficheId: nn.ficheId, label: nn.ficheId })),
            edges: embarque.edges.map((ee: any) => ({
              source: embarque.nodes.findIndex((nn: any) => nn.id === ee.source),
              target: embarque.nodes.findIndex((nn: any) => nn.id === ee.target),
            })).filter((e: any) => e.source >= 0 && e.target >= 0),
          });
          (n.data as any)._grapheEmbarque = undefined;
        }
      }
    }

    // Vérifier si un node a été installé dynamiquement (import de .zip)
    // Même raison qu'au-dessus : lire `nds`, pas `noeudsRef.current`.
    if (onNodeInstalle) {
      for (const n of nds) {
        const data = n.data as any;
        if (data?._nodeInstalle) {
          onNodeInstalle();
          data._nodeInstalle = undefined;
          break;
        }
      }
    }

    } catch (e: any) {
      console.error("lancer error", e);
    } finally {
      setEnExecution(false);
      // Lire la valeur LIVE (pas la closure, périmée quand onDefinirPrioritaire vient
      // de la fixer) pour toujours effacer la priorité après le run — sinon le run
      // global suivant reste filtré sur l'ancien nœud prioritaire.
      if (prioritaireRef.current) setPrioritaire(null);
    }
  }, [prioritaire, repertoire, t]);

  return { lancer, reinitialiserNoeud, reinitialiserTout };
}
