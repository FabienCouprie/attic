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
import { morceauxAEcrire, morceauxCompletes, type Morceau } from "../audio/montage-morceaux";
import type { VueProps } from "../ui/registre-vues";

export function VueMontage({ id, data }: VueProps) {
  // `useReactFlow().setNodes` N'EST PLUS ICI, et c'est le fond de la correction : une vue n'écrit
  // plus elle-même dans le graphe. Elle demande, et la porte unique fait les trois gestes qu'un
  // réglage fait — purge du cache, péremption de l'aval, relance.
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
    /**
     * Pose un découpage sur le nœud, PAR LA MÊME PORTE QU'UN RÉGLAGE.
     *
     * C'est-à-dire : purge l'entrée de cache, périme l'aval en gardant ce que le nœud a désigné de
     * ses entrées — sans quoi le graphe vivant du montage n'aurait plus rien à jouer —, et déclenche
     * la relance automatique vers l'aval. Un `setNodes` nu ne faisait aucune des trois.
     */
    onChangerDecoupe?: (id: string, decoupe: Record<string, unknown>) => void;
    /** Les morceaux posés, quand le nœud en porte. Absents sur un graphe enregistré avant eux. */
    morceaux?: Morceau[];
    /** Les pistes que l'on a vidées : elles ne se redéduisent pas de leurs réglages. */
    pistesVidees?: number[];
  };

  // LA MAQUETTE GARDE SON MODÈLE : une boîte y EST un port, avec sa durée réglée, et rien n'a été
  // demandé pour elle. Les morceaux ne concernent que le montage, où l'on coupe du son.
  const estMaquette = d.ficheId === "maquette";

  // LES MORCEAUX SE DÉDUISENT DES RÉGLAGES PISTE PAR PISTE, et non tous ou aucun. Un graphe
  // enregistré avant eux s'ouvre avec un morceau par piste branchée, donc exactement ce qu'il
  // montrait ; et une piste branchée APRÈS un premier découpage reçoit le sien, au lieu de rester
  // invisible. Rien n'est écrit sur le disque tant qu'on ne touche à rien.
  const morceaux = estMaquette ? undefined
    : morceauxCompletes(d.morceaux ?? [], branchees, d.parametres ?? {}, d.pistesVidees ?? []);

  // ON ÉCRIT DANS LES DONNÉES DU NŒUD, comme le clavier y écrit ce qu'on vient de jouer. Une vue a le
  // droit de poser ce que L'UTILISATEUR a fait ; ce qu'elle n'a pas le droit de poser, ce sont les
  // canaux d'un run. L'empreinte de cache les regarde, si bien qu'un morceau déplacé fait rejouer.
  //
  // ET L'ON N'ÉCRIT QUE LES PISTES TOUCHÉES. La ligne de temps travaille sur la liste complétée, donc
  // elle la rend complétée : écrire telle quelle ferait de toutes les pistes des pistes découpées au
  // premier geste sur l'une d'elles, et leurs quatre réglages cesseraient d'agir d'un coup. Voir
  // `morceauxAEcrire`.
  //
  // ═══ ET L'ÉCRITURE PASSE PAR LA MÊME PORTE QU'UN RÉGLAGE ═══
  //
  // ELLE SE FAISAIT PAR UN `setNodes` NU, et c'était la cause du relevé du 2026-10-26 : « de nouveau
  // les gains et fondus des pistes qui ne sont pas les premières sont totalement inopérants ».
  //
  // Le commentaire ci-dessus pariait sur l'empreinte de cache — elle regarde bien `morceaux`, c'est
  // vérifié —, mais une empreinte qui change ne LANCE rien. Il ne se purgeait aucun cache, ne se
  // périmait aucun aval, ne se relançait rien : le morceau déplacé n'était entendu qu'au prochain
  // run déclenché par AUTRE CHOSE.
  //
  // CE QUE CELA DONNAIT À L'USAGE, et c'est exactement ce que Fabien décrit. Tirer une barre : rien
  // ne change. Tirer ensuite la glissière de cette piste : elle est éteinte, puisqu'un morceau y est
  // désormais posé — mais son changement, lui, déclenche une relance, qui rend enfin le morceau
  // déplacé. On voit donc le son changer d'une façon qui n'a rien à voir avec la glissière qu'on
  // vient de tirer. Et sur la première piste, jamais découpée, la glissière marche. D'où « tout sauf
  // la première piste ne fonctionne pas ».
  //
  // ET LES RÉGLAGES SUIVENT LE GESTE, ce qui est la seconde moitié de la correction. Une piste qui
  // reste descriptible par ses quatre réglages les reçoit : déplacer la barre déplace « Début 1 »,
  // tirer la poignée de niveau déplace « Gain 1 ». L'inspecteur montre donc ce que la ligne de temps
  // fait, et il n'y a plus deux sources de vérité à départager. Relevé par Fabien : « il n'y a aucun
  // lien entre les éléments graphiques et leur équivalent dans l'inspecteur ».
  const ecrireMorceaux = (ms: Morceau[]) => {
    const ecriture = morceauxAEcrire(ms, branchees, d.parametres ?? {}, d.pistesVidees ?? []);
    d.onChangerDecoupe?.(id, {
      morceaux: ecriture.morceaux,
      pistesVidees: ecriture.videes,
      // LES RÉGLAGES SE FUSIONNENT, ils ne se remplacent pas : le nœud en porte d'autres que ceux
      // des pistes — le calage sur l'heure d'enregistrement, par exemple.
      ...(Object.keys(ecriture.reglages).length
        ? { parametres: { ...(d.parametres ?? {}), ...ecriture.reglages } } : {}),
    });
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
