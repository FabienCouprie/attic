// ui/hooks/useEnCours.ts — Le graphe de la séance précédente, remis sur le canevas au démarrage.
//
// Sorti d'`App.tsx` le 2026-11-01 : même effet, mêmes dépendances, même garde contre un second
// passage, et QUATRE CHAMPS DE PLUS, les noms de fichier, que la sortie a révélés manquants (voir
// le commentaire sur place). C'est la pièce d'`App.tsx` que le plus de cas d'application exercent,
// chacun posant son graphe sous `attic-encours` avant d'ouvrir la page ; c'est pourquoi elle sort
// la première.
//
// L'EFFET NE DÉPEND QUE DE LA VERSION DES PLUGINS, et c'est voulu : il attend que le catalogue soit
// là pour retrouver chaque fiche. Les gestionnaires de nœud sont lus par leur référence au moment
// où l'effet tourne, et non à la construction du crochet, parce qu'`App.tsx` les définit après
// l'avoir appelé.
import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Edge } from "@xyflow/react";

import { servicesDomaine } from "../../core/services-domaine";
import { demarrage } from "../fenetre";
import { couleurArete, trouverDef } from "../ports-canevas";
import { rechargerFichiersPersistes } from "../rechargerFichiers";
import { tailleDefaut } from "../tailles-noeuds";
import { filtrerAretesInvalides } from "../validerGraphe";

export interface OptionsEnCours {
  /** Monte quand le catalogue change ; l'en-cours attend qu'il soit là. */
  pluginsVersion: number;
  rfInstance: any;
  /** Les gestionnaires attachés au `data` de chaque nœud, définis une seule fois dans App. */
  callbacksNoeudRef: MutableRefObject<(() => Record<string, unknown>) | null>;
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

export function useEnCours({ pluginsVersion, rfInstance, callbacksNoeudRef, setNodes, setEdges }: OptionsEnCours) {
  const enCoursCharge = useRef(false);
  useEffect(() => {
    if (enCoursCharge.current) return;
    enCoursCharge.current = true;
    (async () => {
      try {
        const brut = demarrage().encours;
        if (!brut) return;
        const data = JSON.parse(brut);
        if (!data.nodes || !Array.isArray(data.nodes)) return;
        const cbs = callbacksNoeudRef.current?.() ?? {};
        const nodesRestaures = data.nodes.map((n: any) => {
          const def = trouverDef(n.data.ficheId);
          const { width, height } = def ? tailleDefaut(def) : { width: 230, height: 200 };
          return {
            id: n.id, type: "atelier", position: n.position, width: n.width ?? width, height: n.height ?? height,
            data: {
              ficheId: n.data.ficheId,
              parametres: n.data.parametres ?? {},
              statut: "attente",
              zonesSelectionnees: n.data.zonesSelectionnees,
              audioChemin: n.data.audioChemin,
              sfzChemin: n.data.sfzChemin,
              sfzNom: n.data.sfzNom,
              sequenceNotes: n.data.sequenceNotes,
              // Le découpage d'un montage et les pistes qu'on y a vidées : une session reprise
              // rendait sinon un montage que personne n'avait découpé.
              morceaux: n.data.morceaux,
              pistesVidees: n.data.pistesVidees,
              nomFichier: n.data.nomFichier,
              // LES QUATRE NOMS DE FICHIER, QUE LA TABLE DIT CONSERVÉS et que l'import garde déjà en
              // recopiant tout `data`. Ils manquaient ici, et le garde de `saisies.test.ts` ne le
              // voyait pas : il lisait `App.tsx` entier, où les gestionnaires de chargement les
              // écrivent. Sorti dans ce fichier, il les a cherchés dans la seule restauration et
              // les a trouvés absents. Sans eux, un en-cours rouvert sans le fichier sur le disque
              // montrait un nœud sans nom, là où le même projet importé le gardait.
              audioNom: n.data.audioNom,
              midiNom: n.data.midiNom,
              imageNom: n.data.imageNom,
              svgNom: n.data.svgNom,
              nom: n.data.nom,
              nomEn: n.data.nomEn,
              couleur: n.data.couleur,
              // Les deux champs d'une bulle. Sans eux, une session reprise rendrait un nœud de bulle
              // sans ports et ses arêtes perdues : la panne silencieuse relevée au relevé des risques.
              bulle: n.data.bulle,
              bulleOuverte: n.data.bulleOuverte,
              // TOUS LES GESTES, ET NON UNE LISTE RECOPIÉE. Douze noms étaient énumérés ici, et
              // douze autres à la génération d'un graphe : trois écritures du même savoir, dont
              // deux silencieuses. Un geste neuf ajouté au seul `callbacksNoeud` manquait donc aux
              // nœuds RESTAURÉS — le même geste marchait sur un nœud posé à la main et pas sur le
              // même nœud rouvert depuis un fichier, ce qui est la pire panne à chercher.
              // Les trois listes étaient identiques, vérifié nom par nom avant de les réunir.
              ...cbs,
            },
          };
        });
        const edgesRestaures = (data.edges ?? []).map((e: any) => ({
          ...e, type: "arete-personnalisee",
          style: { stroke: couleurArete(nodesRestaures, e.source, e.sourceHandle), strokeWidth: 2.5 },
        }));
        const edgesValides = filtrerAretesInvalides(nodesRestaures, edgesRestaures);
        await rechargerFichiersPersistes(nodesRestaures);
        setNodes(nodesRestaures);
        setEdges(edgesValides);
        // Les réglages de domaine de l'en-cours, comme le cadrage : une séance reprise rend ce
        // qu'elle rendait. Côté audio, sa fréquence de travail ; un en-cours sans elle vaut 44 100.
        servicesDomaine().appliquerReglagesDeProjet(data);
        if (data.viewport && rfInstance) queueMicrotask(() => rfInstance.setViewport(data.viewport));
      } catch (e) {
        console.warn("[attic] Restauration de l'en-cours échouée", e);
      }
    })();
  }, [pluginsVersion]); // après chargement des plugins
}
