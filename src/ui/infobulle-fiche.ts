// ui/infobulle-fiche.ts — Ce qu'une infobulle de catalogue montre, et où elle se pose.
//
// Le survol d'un nœud de la palette n'avait que l'attribut `title` : une infobulle du
// système, qui met une seconde à venir, s'en va toute seule, et n'affiche qu'un bloc de
// texte brut. On ne pouvait pas y lire les ports, alors que c'est ce qu'on cherche en
// parcourant le catalogue — ce que ce nœud prend, ce qu'il rend.
//
// Le contenu et le placement vivent ici, hors du composant : la suite de tests ne couvre
// pas les `.tsx`, et un panneau qui sort de l'écran ou qui montre un port en français en
// anglais sont exactement les défauts qu'un test attrape.
import type { FicheAudio } from "../audio/types-domaine";
import { nomFiche, resumeFiche } from "./libelles-fiche";

export interface PortInfobulle {
  nom: string;
  type: string;
  libelleType: string;
  couleur: string;
}

export interface ContenuInfobulle {
  nom: string;
  resume: string;
  entrees: PortInfobulle[];
  sorties: PortInfobulle[];
}

/** De quoi habiller un port : la couleur de son flux et le nom de son type. */
export interface SourceTypes {
  couleurFlux: (type: string) => string;
  libelleType: (type: string) => string;
}

type Port = { nom?: string; nomEn?: string; type?: string };

const port = (p: Port, lang: string, types: SourceTypes): PortInfobulle => {
  const type = p.type ?? "";
  return {
    nom: (lang === "en" && p.nomEn ? p.nomEn : p.nom) ?? "",
    type,
    libelleType: types.libelleType(type),
    couleur: types.couleurFlux(type),
  };
};

/** Nom, résumé et ports d'une fiche, dans la langue affichée. */
export function contenuInfobulle(def: FicheAudio, lang: string, types: SourceTypes): ContenuInfobulle {
  return {
    nom: nomFiche(def, lang),
    resume: resumeFiche(def, lang),
    entrees: (def.entrees ?? []).map((p) => port(p as Port, lang, types)),
    sorties: (def.sorties ?? []).map((p) => port(p as Port, lang, types)),
  };
}

export interface Rectangle { left: number; top: number; right: number; bottom: number }
export interface Taille { largeur: number; hauteur: number }

/**
 * Où poser le panneau : à droite de l'entrée survolée, aligné sur son haut.
 *
 * La palette est collée au bord gauche et défile ; un panneau posé sans réfléchir sort
 * par le bas sur les dernières entrées d'une famille, et par la droite quand la fenêtre
 * est étroite — il bascule alors à gauche de l'entrée. Le résultat est toujours dans la
 * fenêtre, avec une marge, même si le panneau est plus grand qu'elle : mieux vaut un
 * panneau rogné en bas qu'un panneau dont le titre est hors champ.
 */
export function positionInfobulle(
  cible: Rectangle,
  panneau: Taille,
  fenetre: Taille,
  marge = 8,
): { left: number; top: number } {
  let left = cible.right + marge;
  if (left + panneau.largeur > fenetre.largeur - marge) {
    const aGauche = cible.left - marge - panneau.largeur;
    left = aGauche >= marge ? aGauche : Math.max(marge, fenetre.largeur - marge - panneau.largeur);
  }
  let top = cible.top;
  if (top + panneau.hauteur > fenetre.hauteur - marge) top = fenetre.hauteur - marge - panneau.hauteur;
  if (top < marge) top = marge;
  return { left: Math.round(left), top: Math.round(top) };
}
