// audio/abc-gravure.ts — Ce que le graveur reçoit d'un texte ABC.
//
// LA REVUE DES NOTATIONS EN TEXTE, quatrième format, 2026-11-22. Le lecteur ABC de Verovio lit faux
// des écritures justes. Ce module écrit autrement, avant la gravure, celles qui ont une écriture
// équivalente qu'il lit juste. La partition dessinée dit alors ce que dit le texte.
//
// Le texte n'est touché que dans le corps des airs, hors des champs, des commentaires, des chaînes
// entre guillemets, des ornements entre points d'exclamation ou entre plus, et des notes d'ornement
// entre accolades.

/** Une durée ABC, « 2 », « / », « 3/2 », « // », en fraction de l'unité L. */
function lireDuree(texte: string): [number, number] {
  const m = /^(\d*)(\/*)(\d*)$/.exec(texte);
  if (!m || !texte) return [1, 1];
  const num = m[1] ? Number(m[1]) : 1;
  if (!m[2]) return [num, 1];
  return [num, m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length];
}

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));
function ecrireDuree([n, d]: [number, number]): string {
  const g = pgcd(n, d);
  n /= g; d /= g;
  return `${n === 1 ? "" : n}${d === 1 ? "" : `/${d}`}`;
}

/** Les morceaux d'une ligne du corps : ce qui se lit comme musique, et ce qui se recopie tel quel. */
const HORS_MUSIQUE = /("[^"]*"|![^!\n]*!|\+[^+\n]*\+|\{[^}]*\}|\[[A-Za-z]:[^\]]*\]|%.*$)/;

/**
 * UN ACCORD DONT LA DURÉE SUIT LE CROCHET : « [CEG]2 » s'écrit « [C2E2G2] ».
 *
 * La norme ABC 2.1 (§4.17) applique la durée qui suit le crochet à chaque note de l'accord : « [CEG]2 »
 * est un accord de blanches en L:1/4. Verovio le gravait à l'unité, en noires, et c'est la forme
 * qu'écrit « MIDI → ABC » : deux blanches y devenaient deux croches. Une note qui a déjà sa durée la
 * voit multipliée, « [C2E]2 » valant « [C4E2] ».
 */
export function dureesDansLesAccords(texte: string): string {
  let corps = false;
  return texte.split(/(\r?\n)/).map((ligne) => {
    if (/^\r?\n$/.test(ligne)) return ligne;
    if (ligne.startsWith("X:")) corps = false;
    if (/^[A-Za-z+]:/.test(ligne) || /^\s*%/.test(ligne)) {
      if (ligne.startsWith("K:")) corps = true;
      return ligne;
    }
    if (!corps) return ligne;
    return ligne.split(HORS_MUSIQUE).map((morceau, i) => (i % 2 === 1 ? morceau
      // Un accord ne contient que des hauteurs, leurs durées, leurs liaisons et leurs points ; le
      // crochet d'une fin, « [2 E |] », n'en est pas un.
      : morceau.replace(/\[([\^=_A-Ga-g,'0-9/.~-]+)\](\d*\/*\d*)/g, (tout, notes: string, duree: string) => {
        if (!duree) return tout;
        const facteur = lireDuree(duree);
        const dedans = notes.replace(/([\^=_]*[A-Ga-g][,']*)(\d*\/*\d*)/g, (_n, hauteur: string, propre: string) => {
          const [a, b] = lireDuree(propre);
          return hauteur + ecrireDuree([a * facteur[0], b * facteur[1]]);
        });
        return `[${dedans}]`;
      }))).join("");
  }).join("");
}

/** Le texte ABC tel que le graveur doit le recevoir. */
export function abcPourGravure(texte: string): string {
  return dureesDansLesAccords(texte);
}
