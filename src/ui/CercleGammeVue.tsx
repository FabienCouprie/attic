// ui/CercleGammeVue.tsx — Le cercle qu'un composant a PRODUIT, montré sur son nœud.
//
// CE QU'IL MONTRE VIENT DU CANAL `affichage`, ET C'EST CE QUI LE DISTINGUE DE L'ÉDITEUR. Le cercle
// dessiné ici n'est pas arrivé par une entrée : le composant l'a fabriqué de ses réglages. Une
// remise à zéro l'efface, et un changement de réglage aussi, puisqu'il vient de le rendre faux —
// c'est exactement la règle d'`affichage`, là où un cercle REÇU passe par `designe` et survit au
// réglage.
//
// ELLE NE SE CLIQUE PAS, et c'est voulu. Retoucher ici écrirait par-dessus ce que les réglages
// disent, et le dessin cesserait de décrire la gamme nommée. Le cercle se retouche en aval, où le
// masque est un réglage à part.

import { estCercle, type Cercle } from "../audio/cercle";
import { nomNote } from "../audio/nom-note";
import { useI18n } from "../i18n";

import { CercleDessin } from "./CercleDessin";
import type { VueProps } from "./vues";

/** Le cercle produit par le run, tel que l'exécuteur l'a rendu. */
function cercleProduit(data: unknown): Cercle | undefined {
  const produit = (data as { _affichage?: { cercle?: unknown } })._affichage?.cercle;
  return estCercle(produit) ? produit : undefined;
}

/**
 * Le cercle produit, dessiné.
 *
 * TANT QUE LE COMPOSANT N'A PAS TOURNÉ, IL N'Y A RIEN À MONTRER, et la vue se tait plutôt que de
 * dessiner un cercle vide : un disque sans pastille se lirait comme une gamme dont tous les degrés
 * sont éteints, ce qui n'est pas la même chose qu'un composant en attente.
 */
export function CercleGammeVue({ data }: VueProps) {
  const { t } = useI18n();
  const cercle = cercleProduit(data);
  if (!cercle) return null;

  const sonnent = cercle.sommets.map((s) => s.position).sort((a, b) => a - b);
  // Un cercle de percussion n'a qu'un son pour tout le tour : le nommer sur chaque sommet écrirait
  // la même chose partout.
  const noms = cercle.sorte === "hauteur"
    ? [...cercle.sommets].sort((a, b) => a.position - b.position).map((s) => nomNote(s.valeur))
    : [];

  return (
    <div className="cercle-vue" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="cercle-barre nodrag">
        <span className="cercle-compte">{cercle.positions}</span>
        <span className="cercle-attaques">{sonnent.length} {t("cercle.attaques")}</span>
      </div>

      <CercleDessin positions={cercle.positions} sonnent={sonnent} noms={noms} />
    </div>
  );
}
