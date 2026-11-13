// ui/SaisieCase.tsx — La case à cocher, genre de paramètre du cœur.
//
// POURQUOI ELLE PASSE PAR LE REGISTRE DES GENRES, ET NON PAR UNE BRANCHE DE L'INSPECTEUR. Le cœur
// connaît la case (`GenreParametreGenerique`), et sa saisie n'importe que React : elle est donc du
// shell, comme `SaisieCouleurs`. Mais `Inspector.tsx` est en dette de taille, à son plafond, et une
// branche de plus l'aurait fait grossir. Le registre de `ui/widgets-parametre.ts` est déjà le chemin
// par lequel l'inspecteur rend un genre qu'il ne nomme pas : la case l'emprunte, déclarée par le
// shell lui-même au lieu du domaine, et l'inspecteur n'a pas une ligne à gagner pour elle.
//
// LA VALEUR EST UN NOMBRE, 0 OU 1, et non un booléen : `parametres` ne range que des nombres et des
// textes. Toute valeur non nulle se lit cochée, de sorte qu'un « 1 » relu en texte d'un fichier
// écrit à la main ne se lit pas décoché.

import type { GenreDomaine, ProprietesWidget } from "./widgets-parametre";

/** Cochée ou non, d'après la valeur saisie, et d'après le défaut quand rien n'a été saisi. */
export const estCochee = (valeur: unknown, defaut: unknown): boolean => {
  const n = Number(valeur ?? defaut ?? 0);
  return !Number.isNaN(n) && n !== 0;
};

export function SaisieCase({ valeur, defaut, libelle, onChanger }: ProprietesWidget) {
  return (
    <input type="checkbox" className="inspecteur-case" aria-label={libelle}
      style={{ width: "auto", margin: "2px 0" }}
      checked={estCochee(valeur, defaut)}
      onChange={(e) => onChanger(e.target.checked ? 1 : 0)} />
  );
}

/** Le genre `case`, tel que le registre le rend : sa valeur se compare comme un nombre. */
export const GENRE_CASE: GenreDomaine = {
  rendre: (props) => <SaisieCase {...props} />,
  numerique: true,
};
