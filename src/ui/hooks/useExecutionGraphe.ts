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
import type { PluginDef } from "../../core";

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
    edges, setNodes, setEnExecution, prioritaire, setPrioritaire, repertoire,
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
      const anc = ancetres(priorite, aretesG);
      ordreFiltre = ordonnees.filter((id) => anc.has(id));
    }

    for (const id of ordreFiltre) {
      if (!noeudsEnErreur.has(id)) definirStatut(id, "attente");
    }

    const ctx = obtenirAudio();
    const resultats = new Map<string, TypeValeur[]>();
    const messages = new Map<string, string>();
    const traitesCeRun = new Set<string>();

    for (let i = 0; i < ordreFiltre.length; i++) {
      const nodeId = ordreFiltre[i];
      // Sauter les nœuds en erreur (connexion illégale) — déjà marqués « erreur »
      if (noeudsEnErreur.has(nodeId)) continue;
      definirStatut(nodeId, "en_cours", `etape ${i + 1}/${ordreFiltre.length}`);
      const node = nds.find((n) => n.id === nodeId);
      if (!node) {
 continue; }

      const sourceReprocessee = aretes.some((a) => a.target === nodeId && traitesCeRun.has(a.source));
      const hashParams = empreinteParametres(node.data);
      const monHashEntree = empreinteEntrees(nodeId, aretesG);
      const entreeCache = cacheExec.current.get(nodeId);

      // Certains nodes (sans sortie, avec I/O fichiers) ne doivent jamais être cachés
      const jamaisCache = node.data.ficheId === "galerie-exposition";

      if (!jamaisCache && !sourceReprocessee && entreeCache && entreeCache.hashParams === hashParams && entreeCache.hashEntree === monHashEntree) {
        resultats.set(nodeId, entreeCache.valeurs);
        definirStatut(nodeId, "termine");
        continue;
      }

      for (const id of ordreFiltre.slice(i + 1)) cacheExec.current.delete(id);
      traitesCeRun.add(nodeId);

      const fn = registre.trouverPlugin(node.data.ficheId as string);
      if (!fn) { resultats.set(nodeId, [null]); definirStatut(nodeId, "erreur"); continue; }

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
        if ((res as any).erreur) {
          definirStatut(nodeId, "erreur", res.message);
        } else {
          cacheExec.current.set(nodeId, { valeurs: res.valeurs, hashParams, hashEntree: monHashEntree });
          definirStatut(nodeId, "termine");
        }
      } catch (e: any) {
        resultats.set(nodeId, [null]);
        definirStatut(nodeId, "erreur");
      }
    }

    // Mettre à jour les URL audio
    setNodes((nds) =>
      nds.map((n) => {
        const meta = trouverMeta(n.data.ficheId as string);
        // Pour un méta-nœud, on récupère les résultats de ses nœuds internes
        // aplatis (préfixés par l'id du méta-nœud) via ses ports de sortie exposés.
        const vals = meta
          ? meta.sorties.map((_, i) => {
              const m = meta.mapSorties[i];
              return resultats.get(`${n.id}::${m.noeudInterne}`)?.[m.portIndex] ?? null;
            })
          : resultats.get(n.id);
        if ((!vals || vals.length === 0) && n.data.ficheId !== "entree-audio" && !messages.has(n.id)) return n;
        if (n.data.ficheId === "entree-audio") return n;
        const valsSafe = vals ?? [];
        // Ne pas créer de lecteur audio générique pour les nodes multi-sorties audio
        // (ex: séparateur IA) — chaque sortie a son propre lecteur via les ports.
        const defNode = trouverDef(n.data.ficheId as string);
        const nbSortiesAudio = defNode?.sorties.filter((s: any) => s.type === "audio").length ?? 0;
        const audio = nbSortiesAudio > 1 ? null : valsSafe.find((v): v is AudioBuffer => v instanceof AudioBuffer);
        const fichier = valsSafe.find((v): v is File => v instanceof File);
        const texte = valsSafe.find((v): v is string => typeof v === "string");
        // Embarquer le graphe dans le WAV de prévisualisation si le node l'a demandé
        const grapheExport = (n.data as any)?._grapheExport as string | undefined;
        const url = audio ? URL.createObjectURL(bufferVersWavBlob(audio, grapheExport)) : undefined;
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
      if (prioritaire) setPrioritaire(null);
    }
  }, [prioritaire, repertoire]);

  return { lancer, reinitialiserNoeud };
}
