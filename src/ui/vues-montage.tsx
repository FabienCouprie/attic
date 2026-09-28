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
import { NodeResizer, useNodeConnections } from "@xyflow/react";
import { LigneDeTemps, type PisteMontage } from "./LigneDeTemps";
import { MODELE_MAQUETTE, MODELE_MONTAGE } from "./ligne-temps-calcul";
import type { VueProps } from "./vues";

export function VueMontage({ id, data }: VueProps) {
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
  };

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
        modele={d.ficheId === "maquette" ? MODELE_MAQUETTE : MODELE_MONTAGE}
        audioUrl={d.audioResultatUrl}
        sons={d._designe?.sons}
        notes={d._designe?.notes}
      />
    </div>
  );
}
