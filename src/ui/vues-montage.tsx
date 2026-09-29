// ui/vues-montage.tsx — La ligne de temps du Montage et de la Maquette, sur le nœud.
//
// POURQUOI SUR LE NŒUD, ET NON DANS L'INSPECTEUR OÙ ELLE ÉTAIT. Deux raisons, l'une de largeur et
// l'autre d'écoute. Le volet fait 280 pixels et ne s'élargit pas, dont 182 utiles : comme l'échelle y
// faisait tenir tout le montage, le plus petit déplacement possible au glissement valait 0,32 seconde
// sur une pièce de cinquante secondes, là où le réglage accepte le centième. Un nœud, lui, se
// redimensionne. Et surtout le son se jouait sur le nœud pendant que le dessin se regardait dans le
// volet : on ne pouvait pas suivre des yeux où l'on en était. C'est ce qui rendait le dessin décoratif.
//
// `porteLecteur: true` DANS LE REGISTRE fait taire le lecteur générique du nœud : deux jeux de
// commandes pour un même son se contrediraient, et la tête de lecture ne saurait plus lequel suivre.
import { NodeResizer, useNodeConnections, useReactFlow } from "@xyflow/react";
import { LigneDeTemps, type PisteMontage } from "./LigneDeTemps";
import { MODELE_MAQUETTE, MODELE_MONTAGE } from "./ligne-temps-calcul";
import { morceauxDepuisParametres, type Morceau } from "../audio/montage-morceaux";
import type { VueProps } from "./vues";

export function VueMontage({ id, data }: VueProps) {
  const { setNodes } = useReactFlow();
  // Les rangs branchés, lus comme le nœud les lit : c'est la poignée qui porte le numéro du port.
  const entrees = useNodeConnections({ handleType: "target", id });
  const branchees = [...new Set(
    entrees
      .map((c) => Number(String(c.targetHandle ?? "in:0").split(":")[1]))
      .filter(Number.isFinite),
  )].sort((a, b) => a - b);

  // CE QUE LA VUE MONTRE VIENT DU CANAL DÉCLARÉ, `_designe`, et non plus de champs posés un à un
  // dans le sac de l'interface. L'exécuteur dit ce qu'il désigne de ses entrées ; le moteur le pose
  // sous cette clé ; une remise à zéro l'efface et un réglage le garde, par construction.
  const d = data as unknown as {
    ficheId?: string;
    parametres?: Record<string, unknown>;
    audioResultatUrl?: string;
    _designe?: {
      /** Les durées réelles des pistes ou des boîtes, que seule l'exécution connaît. */
      durees?: PisteMontage[];
      /** Les tampons des pistes du Montage : l'onde s'y lit, et l'écoute vivante y joue. */
      sons?: Record<number, AudioBuffer>;
      /** Les notes des boîtes de la Maquette, en fractions de leur durée propre. */
      notes?: Record<number, { debut: number; duree: number; note: number }[]>;
    };
    onChangerParametre?: (id: string, nom: string, valeur: string | number) => void;
    /** Les morceaux posés, quand le nœud en porte. Absents sur un graphe enregistré avant eux. */
    morceaux?: Morceau[];
  };

  // LA MAQUETTE GARDE SON MODÈLE : une boîte y EST un port, avec sa durée réglée, et rien n'a été
  // demandé pour elle. Les morceaux ne concernent que le montage, où l'on coupe du son.
  const estMaquette = d.ficheId === "maquette";

  // LES MORCEAUX SE DÉDUISENT DES RÉGLAGES TANT QU'IL N'Y EN A PAS, et c'est toute la migration : un
  // graphe enregistré avant eux s'ouvre avec un morceau par piste branchée, le son entier, donc
  // exactement ce qu'il montrait. Rien n'est écrit sur le disque tant qu'on ne touche à rien.
  const morceaux = estMaquette ? undefined
    : (d.morceaux && d.morceaux.length > 0
      ? d.morceaux
      : morceauxDepuisParametres(branchees, d.parametres ?? {}));

  // ON ÉCRIT DANS LES DONNÉES DU NŒUD, comme le clavier y écrit ce qu'on vient de jouer. Une vue a le
  // droit de poser ce que L'UTILISATEUR a fait ; ce qu'elle n'a pas le droit de poser, ce sont les
  // canaux d'un run. L'empreinte de cache les regarde, si bien qu'un morceau déplacé fait rejouer.
  const ecrireMorceaux = (ms: Morceau[]) => setNodes((nds) => nds.map((n) => (
    n.id === id ? { ...n, data: { ...n.data, morceaux: ms } } : n
  )));

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()}>
      {/* LA LIGNE DE TEMPS SE RÈGLE EN LARGEUR, parce que c'est la largeur qui fait la précision du
          glissement : un pixel vaut l'étendue visible divisée par elle. Le minimum garde la règle, les
          étiquettes de piste et le transport lisibles. */}
      <NodeResizer minWidth={360} minHeight={200} />
      <LigneDeTemps
        pistes={d._designe?.durees ?? []}
        branchees={branchees}
        params={d.parametres ?? {}}
        onChanger={(nom, valeur) => d.onChangerParametre?.(id, nom, valeur)}
        modele={estMaquette ? MODELE_MAQUETTE : MODELE_MONTAGE}
        audioUrl={d.audioResultatUrl}
        sons={d._designe?.sons}
        notes={d._designe?.notes}
        noeudId={id}
        morceaux={estMaquette ? undefined : morceaux}
        onMorceaux={estMaquette ? undefined : ecrireMorceaux}
      />
    </div>
  );
}
