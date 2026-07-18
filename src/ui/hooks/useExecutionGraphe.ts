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
  ordreTopologique, ancetres, empreinteParametres, empreinteEntrees,
  resoudreEntree, valeursEntrantes, validerGraphe,
  type NoeudG, type AreteG, type TypeValeur,
} from "../../core";
import { registre } from "../../audio/adaptateur";
import { bufferVersWavBlob } from "../../audio";

const trouverDef = (id: string) => registre.trouverDef(id);

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
  const {
    noeudsRef, aretesRef, enExecRef, prioritaireRef, audioCtxRef, cacheExec,
    setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
    onGrapheGenere, onNodeInstalle,
  } = o;

  function obtenirAudio() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
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
    setNodes((nds) => nds.map((n) => {
      if (!ids.has(n.id)) return n;
      if (n.data.audioResultatUrl) URL.revokeObjectURL(n.data.audioResultatUrl);
      if ((n.data as any).mp3Url) URL.revokeObjectURL((n.data as any).mp3Url);
      return {
        ...n,
        data: {
          ...n.data,
          statut: "attente",
          progression: undefined,
          audioResultatUrl: undefined,
          audioResultatNom: undefined,
          audioResultatMessage: undefined,
          scriptGenere: undefined,
          mp3Url: undefined,
        },
      };
    }));
    for (const id of ids) cacheExec.current.delete(id);
  }, [setNodes]);

  const lancer = useCallback(async (noeudPrioritaireId?: string) => {
    // Ne pas bloquer si on lance un node individuellement (prioritaire)
    // — seul le bouton Run global (sans prioritaire) est bloqué pendant l'exécution
    if (!noeudPrioritaireId && enExecRef.current) return;
    if (noeudsRef.current.length === 0) return;
    if (!noeudPrioritaireId) setEnExecution(true);
    try {
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

    // ── Garde-fou : valider les types de connexions avant exécution (spec §10) ──
    // Résout les types depuis les PluginDef et rejette les arêtes incompatibles.
    // Les nœuds cibles passent en statut « erreur » et ne sont pas exécutés.
    const validation = validerGraphe(
      plat.noeuds,
      aretes as unknown as AreteG[],
      (ficheId) => trouverDef(ficheId),
      registre.fluxCompatibles,
    );
    const noeudsEnErreur = new Set<string>();
    for (const [nodeId, msgs] of validation.noeudsAffectes) {
      noeudsEnErreur.add(nodeId);
      definirStatut(nodeId, "erreur", msgs[0]);
    }

    // Topologie (logique pure testée — cf. core/graphe.ts)
    const aretesG = aretes as unknown as AreteG[];
    const ordonnees = ordreTopologique(nds.map((n) => n.id), aretesG);
    let ordreFiltre = ordonnees;
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
      ordreFiltre = ordonnees.filter((id) => anc.has(id));
    }
    // Un méta est « dans le périmètre » du run ssi au moins un de ses nœuds internes
    // aplatis (`${id}::…`) y figure. Un run prioritaire ne doit PAS toucher les métas
    // hors périmètre (branches déconnectées) — sinon ils passaient « en cours » puis
    // « erreur », donnant l'illusion d'un run global.
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

    const ctx = obtenirAudio();
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
        definirStatut(proprio, "erreur", detail ? `branche en échec : ${detail}` : "branche en échec");
      }
    };

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
        definirStatut(nodeId, "erreur", `entrée en erreur : ${entreeFautive.source}`);
        marquerMetaEnEchec(nodeId);
        continue;
      }
      definirStatut(nodeId, "en_cours", `etape ${i + 1}/${ordreFiltre.length}`);
      const node = nds.find((n) => n.id === nodeId);
      if (!node) {
 continue; }

      const sourceReprocessee = aretes.some((a) => a.target === nodeId && traitesCeRun.has(a.source));
      const hashParams = empreinteParametres(node.data);
      const monHashEntree = empreinteEntrees(nodeId, aretesG);
      const entreeCache = cacheExec.current.get(nodeId);

      // Certains nodes (sans sortie, avec I/O fichiers) ne doivent jamais être
      // cachés — la fiche le déclare, le moteur ne connaît aucun id en dur.
      const jamaisCache = trouverDef(node.data.ficheId as string)?.jamaisCache === true;

      if (!jamaisCache && !sourceReprocessee && entreeCache && entreeCache.hashParams === hashParams && entreeCache.hashEntree === monHashEntree) {
        resultats.set(nodeId, entreeCache.valeurs);
        definirStatut(nodeId, "termine");
        continue;
      }

      // NE PAS invalider tous les nœuds en aval dans l'ordre topologique plat :
      // cela réexécutait les branches PARALLÈLES (sœurs) d'un nœud rejoué, car
      // elles suivent ce nœud dans l'ordre linéaire sans en dépendre. La
      // réexécution des vrais descendants est déjà assurée par `sourceReprocessee`
      // (propagation transitive via `traitesCeRun`), qui ne touche QUE les nœuds
      // dont une entrée réelle a été recalculée ce run.
      traitesCeRun.add(nodeId);

      const fn = registre.trouverPlugin(node.data.ficheId as string);
      if (!fn) { noeudsEnErreur.add(nodeId); resultats.set(nodeId, [null]); definirStatut(nodeId, "erreur"); marquerMetaEnEchec(nodeId, node.data.ficheId as string); continue; }

      try {
        const res = await fn({
          noeud: node,
          runtime: ctx,
          repertoireTravail: repertoire,
          entree: (idx: number) => resoudreEntree<TypeValeur>(nodeId, idx, aretesG, resultats) as TypeValeur,
          entrees: () => valeursEntrantes<TypeValeur>(nodeId, aretesG, resultats),
          paramNombre: (nom: string, defaut: number) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            return typeof p === "number" ? p : defaut;
          },
          paramTexte: (nom: string, defaut: string) => {
            const p = (node.data.parametres as Record<string, number|string>)?.[nom];
            return typeof p === "string" ? p : defaut;
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
        const aDesSorties = (trouverDef(node.data.ficheId as string)?.sorties.length ?? 0) > 0;
        const toutNul = Array.isArray(res.valeurs) && res.valeurs.length > 0 && (res.valeurs as unknown[]).every((v) => v == null);
        if ((res as any).erreur || (aDesSorties && toutNul)) {
          noeudsEnErreur.add(nodeId);
          definirStatut(nodeId, "erreur", res.message);
          marquerMetaEnEchec(nodeId, node.data.ficheId as string);
        } else {
          cacheExec.current.set(nodeId, { valeurs: res.valeurs, hashParams, hashEntree: monHashEntree });
          definirStatut(nodeId, "termine");
        }
      } catch (e: any) {
        // Spec §6.5 : toute exception d'un executer est journalisée (console.error)
        // ET remontée sur le nœud (statut « erreur » + message).
        console.error(`[attic] Nœud « ${node.data.ficheId} » (id=${nodeId}) a échoué :`, e);
        noeudsEnErreur.add(nodeId);
        resultats.set(nodeId, [null]);
        definirStatut(nodeId, "erreur", e?.message ? String(e.message) : undefined);
        marquerMetaEnEchec(nodeId, node.data.ficheId as string);
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
        const texte = valsSafe.find((v): v is string => typeof v === "string");
        // Embarquer le graphe dans le WAV de prévisualisation si le node l'a demandé
        const grapheExport = (n.data as any)?._grapheExport as string | undefined;
        const url = audio ? URL.createObjectURL(bufferVersWavBlob(audio, grapheExport)) : undefined;
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
              audioResultatMessage: fautif ? `Branche en échec : « ${fautif} » sans résultat (entrée manquante ?)` : "Branche en échec (aucun résultat)" } };
          }
        }
        return {
          ...n,
          data: {
            ...n.data,
            audioResultatUrl: url ?? undefined,
            audioResultatNom: url ? `${n.data.ficheId}.wav` : undefined,
            audioResultatMessage: messages.get(n.id) ?? (meta && audio ? "Terminé" : undefined),
            scriptGenere: texte ?? undefined,
            midiFichierSortie: (fichier instanceof File && fichier.type.includes("midi")) ? fichier : undefined,
            ...(meta ? { statut: "termine" as const } : {}),
          },
        };
      })
    );

    // Vérifier si un node a généré une spec de graphe (prompt → graphe)
    if (onGrapheGenere) {
      for (const n of noeudsRef.current) {
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
    if (onNodeInstalle) {
      for (const n of noeudsRef.current) {
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
  }, [prioritaire, repertoire]);

  return { lancer, reinitialiserNoeud };
}
