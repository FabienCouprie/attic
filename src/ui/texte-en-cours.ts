// ui/texte-en-cours.ts — Le texte qu'on est en train de taper, et le curseur qui doit rester ou il est.
//
// LE DEFAUT, RELEVE PAR FABIEN SUR LES NOTES PUIS SUR LE CODE PYTHON. On corrige une faute au
// milieu d'un mot : des la premiere frappe, le curseur saute a la fin du texte, et la suite
// s'ecrit la-bas.
//
// POURQUOI. Un champ controle affiche la valeur que React lui donne. Si cette valeur arrive en
// retard d'un rendu, React trouve dans le champ un texte different de celui qu'il croit afficher,
// REECRIT la valeur du champ, et un champ dont on reecrit la valeur place son curseur a la fin.
// Les trois champs touches ecrivaient dans le magasin a chaque touche et relisaient leur valeur
// depuis lui : la note et le titre de cadre par `setNodes`, et tout parametre de type texte par
// `onChangerParametre`, qui passe par `changerReglage`. Celui-la fait trois ecritures par
// caractere, dont une relance differee du noeud, et il suffit qu'une seule reporte un noeud
// capture avant la frappe.
//
// LA REGLE, ET ELLE NE DEMANDE PAS DE SAVOIR LAQUELLE DES TROIS ECRIT EN RETARD : pendant qu'on
// tape, le champ est le proprietaire de son texte et rien venant du magasin ne l'ecrase. Des qu'il
// n'a plus le focus, le magasin reprend la main : une remise a zero, une annulation, un prereglage
// charge ou un changement de langue qui fait lire l'autre champ d'une note sont alors adoptes.
//
// POURQUOI LE FOCUS, ET NON LA SEULE COMPARAISON AVEC CE QU'ON VIENT D'ENVOYER. Comparer suffit
// pour l'echo immediat, pas pour un echo EN RETARD : apres deux frappes, « a » puis « ab », un
// rendu qui reporte encore « a » n'est pas l'echo de la derniere frappe, et une regle qui ne
// compare qu'a celle-la l'adopterait — le champ reviendrait a « a », curseur a la fin, c'est-a-dire
// le defaut d'origine sous une autre forme. Le focus tranche sans rien supposer du retard.
//
// `Inspector.tsx` tenait deja cette idee pour la description d'un meta-composant, avec son etat
// local pose au depart du champ. Elle est ici ecrite une fois, eprouvee a part, et partagee.
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ce qu'un champ decide quand une valeur lui revient du magasin.
 *
 * Rendre `null` veut dire : ne touche a rien. Rendre une chaine veut dire : adopte-la.
 */
export function creerSuiviTexte(initial: string) {
  let dernier = initial;
  return {
    /** La valeur qu'on vient d'envoyer au magasin. */
    frappe(valeur: string): string {
      dernier = valeur;
      return valeur;
    },
    /**
     * Ce qui arrive du magasin.
     *
     * `focalise` dit si l'on est en train de taper dedans. Si oui, rien n'est adopte : le champ est
     * le proprietaire de son texte tant que le curseur y est.
     */
    recu(valeur: string, focalise: boolean): string | null {
      if (focalise) return null;
      if (valeur === dernier) return null;
      dernier = valeur;
      return valeur;
    },
    /** La derniere valeur connue, envoyee ou adoptee. */
    get dernier() {
      return dernier;
    },
  };
}

export type SuiviTexte = ReturnType<typeof creerSuiviTexte>;

/**
 * Le texte d'un champ, de quoi le changer, et les deux ecouteurs de focus a poser dessus.
 *
 * `valeur` est ce que le magasin dit, `pousser` ce qu'il faut appeler pour l'y ecrire. Le champ
 * rend `texte`, qui est local : c'est ce qui garde le curseur.
 */
export function useTexteEnCours(valeur: string, pousser: (v: string) => void) {
  const [texte, setTexte] = useState(valeur);
  const focalise = useRef(false);
  const suivi = useRef<SuiviTexte | null>(null);
  suivi.current ??= creerSuiviTexte(valeur);

  const adopterSiBesoin = useCallback((v: string) => {
    const a = suivi.current!.recu(v, focalise.current);
    if (a !== null) setTexte(a);
  }, []);

  useEffect(() => { adopterSiBesoin(valeur); }, [valeur, adopterSiBesoin]);

  const changer = useCallback((v: string) => {
    setTexte(suivi.current!.frappe(v));
    pousser(v);
  }, [pousser]);

  const onFocus = useCallback(() => { focalise.current = true; }, []);

  // AU DEPART DU CHAMP, LE MAGASIN REPREND LA MAIN. Sans ce rattrapage, ce qui a change ailleurs
  // pendant la frappe resterait invisible : l'effet ne se redeclenche que si `valeur` change, et
  // elle ne change pas au moment ou l'on quitte le champ.
  const onBlur = useCallback(() => {
    focalise.current = false;
    adopterSiBesoin(valeur);
  }, [valeur, adopterSiBesoin]);

  return { texte, changer, onFocus, onBlur } as const;
}
