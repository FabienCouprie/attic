// audio/reecriture-arbre.ts — Simplifier un arbre rythmique sans toucher à ce qu'on entend.
//
// CE QUE C'EST. La dernière ligne que `COMPOSITION-ASSISTEE.md` laissait ouverte sur les arbres :
// « les arbres rythmiques, et Rewrite qui les réécrit ». Un arbre engendré, tiré ou quantifié porte
// des tournures que personne n'écrirait à la main : une division à un seul élément, un temps divisé
// en deux dont la seconde moitié n'est qu'une liaison, quatre silences là où un seul suffit, des
// poids tous multiples de deux. Chacune se lit plus mal que sa forme réduite, et aucune ne change
// le son.
//
// L'INVARIANT EST LE SUJET DU MODULE, non une précaution. Une réécriture qui déplacerait une seule
// attaque ne serait pas une simplification, ce serait une faute silencieuse : le texte paraîtrait
// plus propre et la pièce ne serait plus la même. Toute règle admise ici laisse donc les notes
// SONNANTES exactement où elles sont, avec exactement la même durée.
//
// LES SILENCES, EUX, PEUVENT FUSIONNER, et c'est la seule liberté prise. Deux silences côte à côte
// et un silence deux fois plus long produisent le même vide ; le nombre d'ÉVÉNEMENTS diffère, le son
// non. La distinction est écrite parce qu'un test qui exigerait l'égalité des événements refuserait
// cette règle, et qu'un test qui ne comparerait que le son laisserait passer bien pire.
//
// CE QUI N'EST PAS FAIT, ET POURQUOI. L'aplatissement d'une division dans une autre, qui changerait
// deux croches divisées en deux en quatre doubles. Il est juste quand tous les comptes sont des
// puissances de deux, et faux sinon : une division en trois portant des divisions en deux donne six
// parts, et six n'étant pas une puissance de deux, l'aplatissement écrirait un sextolet là où la
// pièce a des triolets de croches. Le son serait le même, la notation ne le serait pas, et ce module
// ne touche pas à ce qui se lit sans y être forcé.

import { ecrireArbre, type Mesure, type NoeudRythme } from "./arbre-rythmique";

/** Ce qu'une réécriture a fait, règle par règle. */
export interface Reecriture {
  mesures: Mesure[];
  /** Combien de fois chaque règle s'est appliquée. */
  appliquees: Record<string, number>;
  /** Combien de signes le texte a perdus. */
  gagne: number;
}

const estFeuille = (n: NoeudRythme) => !n.enfants || n.enfants.length === 0;

/** Le plus grand commun diviseur de deux entiers positifs. */
function pgcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y > 0) { const r = x % y; x = y; y = r; }
  return x;
}

/**
 * Réécrit un nœud et ses descendants, du bas vers le haut.
 *
 * DU BAS VERS LE HAUT, parce qu'une règle en découvre une autre : réduire `(1 (1 1.0))` en `1`
 * rend son parent susceptible de la même réduction, et l'ordre inverse demanderait de repasser.
 */
function reecrireNoeud(n: NoeudRythme, compte: Record<string, number>): NoeudRythme {
  if (estFeuille(n)) return n;
  const enfants = (n.enfants as NoeudRythme[]).map((e) => reecrireNoeud(e, compte));

  const marquer = (regle: string) => { compte[regle] = (compte[regle] ?? 0) + 1; };

  // 1. UNE DIVISION À UN SEUL ÉLÉMENT N'EN EST PAS UNE. L'enfant prend la place et le poids du
  //    parent ; la durée qu'il occupe ne change pas, puisqu'il occupait déjà tout.
  if (enfants.length === 1) {
    marquer("division-unique");
    const seul = enfants[0];
    return { ...seul, valeur: n.valeur, liee: n.liee ?? seul.liee };
  }

  // 2. TOUT EN SILENCE FAIT UN SILENCE. Le vide est le même, et c'est la seule règle qui change le
  //    nombre d'événements.
  if (enfants.every((e) => estFeuille(e) && e.silence)) {
    marquer("silences-fondus");
    return { valeur: n.valeur, silence: true };
  }

  // 3. UNE NOTE SUIVIE DE SES SEULES LIAISONS EST CETTE NOTE. Une liaison ne réattaque pas : le
  //    déroulement la fond déjà dans l'événement précédent, donc l'événement rendu est identique,
  //    au même instant et de la même durée.
  const premier = enfants[0];
  if (estFeuille(premier) && !premier.silence
    && enfants.slice(1).every((e) => estFeuille(e) && e.liee && !e.silence)) {
    marquer("liaisons-fondues");
    return { valeur: n.valeur, liee: n.liee ?? premier.liee };
  }

  // 4. DES POIDS TOUS MULTIPLES SE DIVISENT. Seul leur RAPPORT décide des durées : 2 2 et 1 1
  //    donnent exactement les mêmes, et le second se lit mieux.
  const poids = enfants.map((e) => Math.abs(e.valeur));
  const commun = poids.reduce((d, p) => pgcd(d, p), 0);
  if (commun > 1 && poids.every((p) => p > 0)) {
    marquer("poids-reduits");
    return { ...n, enfants: enfants.map((e) => ({ ...e, valeur: e.valeur / commun })) };
  }

  return { ...n, enfants };
}

/**
 * Réécrit un arbre jusqu'à ce qu'il ne bouge plus.
 *
 * LA BOUCLE EST BORNÉE, et pas seulement par prudence : une règle mal écrite qui rendrait un arbre
 * différent à chaque passe tournerait sans fin. La borne transforme ce défaut en résultat imparfait,
 * ce qui se voit et se répare, plutôt qu'en application figée.
 */
export function reecrireArbre(mesures: readonly Mesure[], passesMax = 8): Reecriture {
  const appliquees: Record<string, number> = {};
  const avant = ecrireArbre(mesures);
  let courant: Mesure[] = mesures.map((m) => ({ ...m, contenu: [...m.contenu] }));

  for (let passe = 0; passe < passesMax; passe++) {
    const texteAvant = ecrireArbre(courant);
    courant = courant.map((m) => {
      // Le contenu d'une mesure est une liste de nœuds, non un nœud : les règles qui suppriment un
      // niveau ne s'y appliquent donc pas, sauf celle des poids, qui porte sur une fratrie.
      const contenu = m.contenu.map((n) => reecrireNoeud(n, appliquees));
      const poids = contenu.map((e) => Math.abs(e.valeur));
      const commun = poids.reduce((d, p) => pgcd(d, p), 0);
      if (commun > 1 && poids.every((p) => p > 0)) {
        appliquees["poids-reduits"] = (appliquees["poids-reduits"] ?? 0) + 1;
        return { ...m, contenu: contenu.map((e) => ({ ...e, valeur: e.valeur / commun })) };
      }
      return { ...m, contenu };
    });
    if (ecrireArbre(courant) === texteAvant) break;
  }

  return { mesures: courant, appliquees, gagne: avant.length - ecrireArbre(courant).length };
}
