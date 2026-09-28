// ui/CercleRetoucheVue.tsx — Le cercle qu'un composant a REÇU, montré et retouché.
//
// CE QU'IL MONTRE VIENT DU CANAL `designe`, ET IL LE FAUT. Le cercle dessiné ici n'est pas déduit
// des réglages du nœud : il est arrivé par une entrée. `designe` est le canal de ce qui vient des
// entrées, et sa règle est exactement celle qu'il faut ici — une remise à zéro l'efface, un
// changement de réglage le GARDE. C'est ce qui permet de cliquer une place sans que le dessin
// disparaisse au clic suivant : le clic change un réglage, et le cercle reçu reste.
//
// LA RETOUCHE EST UN RÉGLAGE, DONC ELLE SE SAUVEGARDE. Elle s'écrit comme un motif, une suite de
// zéros et de uns, un par place. Le calcul qui l'applique est dans `audio/cercle-retouche.ts`, avec
// ses cas : la vue ne fait que le montrer et le retoucher.

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

import { estCercle, type Cercle } from "../audio/cercle";
import { cercleRetouche, masqueAjuste } from "../audio/cercle-retouche";
import { nomNote } from "../audio/nom-note";
import { useI18n } from "../i18n";

import { CercleDessin } from "./CercleDessin";
import type { VueProps } from "./vues";

/** Le cercle reçu, tel que le run l'a désigné de ses entrées. */
function cercleRecu(data: unknown): Cercle | undefined {
  const recu = (data as { _designe?: { cercle?: unknown } })._designe?.cercle;
  return estCercle(recu) ? recu : undefined;
}

/**
 * Le cercle reçu, cliquable.
 *
 * TANT QUE RIEN N'EST ARRIVÉ, IL N'Y A RIEN À MONTRER, et la vue se tait plutôt que de dessiner un
 * cercle vide : un disque sans pastille se lirait comme un cercle dont toutes les places sont
 * éteintes, ce qui n'est pas la même chose qu'un composant qui n'a pas encore tourné.
 */
export function CercleRetoucheVue({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();

  const recu = cercleRecu(data);
  const parametres = (data as { parametres?: Record<string, unknown> }).parametres ?? {};
  const masque = String(parametres["Retouche"] ?? "");

  const ecrire = useCallback((valeur: string) => {
    const changer = (data as { onChangerParametre?: (n: string, p: string, v: string | number) => void })
      .onChangerParametre;
    changer?.(id, "Retouche", valeur);
    // Sans le rappel de l'application — vue isolée —, on écrit dans le nœud directement, sans quoi
    // le dessin reviendrait à son état d'avant le clic.
    setNodes((nds) => nds.map((n) => n.id === id
      ? { ...n, data: { ...n.data, parametres: { ...(n.data.parametres as object), Retouche: valeur } } }
      : n));
  }, [data, id, setNodes]);

  if (!recu) return null;

  const montre = cercleRetouche(recu, masque);
  const sonnent = montre.sommets.map((s) => s.position).sort((a, b) => a - b);
  // Un cercle de percussion n'a qu'un son pour tout le tour : le nommer sur chaque sommet écrirait
  // la même chose partout.
  const noms = montre.sorte === "hauteur"
    ? [...montre.sommets].sort((a, b) => a.position - b.position).map((s) => nomNote(s.valeur))
    : [];

  const basculer = (place: number) => {
    const suivant = [...masqueAjuste(masque, recu)];
    suivant[place] = suivant[place] === "1" ? "0" : "1";
    ecrire(suivant.join(""));
  };

  return (
    <div className="cercle-vue" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cercle-barre nodrag">
        <span className="cercle-compte">{recu.positions}</span>
        <span className="cercle-attaques">{sonnent.length} {t("cercle.attaques")}</span>
      </div>

      <CercleDessin positions={recu.positions} sonnent={sonnent} noms={noms} surPlace={basculer} />
    </div>
  );
}
