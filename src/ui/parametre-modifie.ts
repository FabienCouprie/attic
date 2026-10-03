// ui/parametre-modifie.ts — Distinguer une valeur réglée d'une valeur par défaut.
//
// L'inspecteur affichait les deux à l'identique : rien ne disait, devant un nœud à vingt
// paramètres, lesquels avaient été touchés. Ce module répond à la question, et il n'est
// pas aussi simple qu'il en a l'air :
//
//   — la valeur n'est pas toujours stockée dans le même type que le défaut (un curseur
//     relu d'un projet enregistré porte parfois « 110 » et non 110) ;
//   — un choix peut être stocké sous son libellé français, son libellé anglais ou son
//     identifiant, et le défaut sous une autre de ces trois formes — d'où la comparaison
//     sur la forme canonique, celle que `valeurCanoniqueChoix` calcule ;
//   — le défaut lui-même dépend de la langue (`defautEn`) pour les textes ;
//   — un paramètre absent vaut son défaut, et n'est donc pas modifié.
import { defautCanoniqueChoix, defautParametre, valeurCanoniqueChoix } from "../i18n";
import { genresNumeriques } from "./widgets-parametre";

type Parametre = {
  nom: string;
  type?: string;
  defaut?: unknown;
  defautEn?: unknown;
  options?: string[];
  optionsEn?: string[];
  optionIds?: string[];
};

/**
 * Genres dont la valeur se compare comme un nombre.
 *
 * `"sf2instrument"` Y FIGURAIT EN DUR, c'est-à-dire un genre du domaine audio dans le shell. Le fait
 * « ma valeur est un nombre » appartient au genre : le domaine le déclare avec son composant de
 * saisie, et `genresNumeriques()` les rend.
 */
const NUMERIQUES_DU_COEUR = [undefined, "nombre", "curseur"];
const estNumerique = (type: string | undefined): boolean =>
  NUMERIQUES_DU_COEUR.includes(type) || genresNumeriques().includes(type ?? "");

/** La valeur de ce paramètre diffère-t-elle de son défaut ? */
export function parametreModifie(
  p: Parametre,
  params: Record<string, unknown> | undefined,
  lang = "fr",
): boolean {
  const brut = params?.[p.nom];
  if (brut === undefined || brut === null) return false;

  if (p.type === "choix" && p.options) {
    const defaut = String(defautCanoniqueChoix(p as any));
    return String(valeurCanoniqueChoix(p as any, String(brut))) !== defaut;
  }

  const defaut = defautParametre(p as any, lang as any);
  if (estNumerique(p.type)) {
    const a = Number(brut);
    const b = Number(defaut);
    // Deux nombres : comparer comme tels, sinon « 110 » paraîtrait modifié face à 110.
    // La tolérance couvre les arrondis d'un curseur logarithmique (paramètres en Hz).
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) > 1e-9;
  }
  return String(brut) !== String(defaut ?? "");
}

/**
 * Le défaut tel qu'on l'ÉCRIT DANS LE PARAMÈTRE, pour le bouton qui l'y remet.
 *
 * Ce n'est pas la même chose que ce qu'on affiche : un choix se stocke sous son
 * identifiant — la forme que le menu déroulant écrit — et non sous son libellé, et un
 * paramètre numérique se stocke en nombre, sans quoi le point « modifié » resterait
 * allumé après être revenu au défaut.
 */
export function valeurDefaut(p: Parametre, lang = "fr"): number | string {
  if (p.type === "choix" && p.options) return defautCanoniqueChoix(p as any);
  const defaut = defautParametre(p as any, lang as any);
  if (estNumerique(p.type)) {
    const n = Number(defaut);
    if (Number.isFinite(n)) return n;
  }
  return defaut === undefined || defaut === null ? "" : String(defaut);
}

/**
 * Le défaut tel qu'on l'écrit à l'utilisateur — le libellé d'un choix, pas son
 * identifiant. C'est ce que l'infobulle du point de couleur annonce : savoir qu'une
 * valeur a changé sert surtout si l'on sait de quoi elle a changé.
 */
export function libelleDefaut(p: Parametre, lang = "fr"): string {
  if (p.type === "choix" && p.options) {
    const id = String(defautCanoniqueChoix(p as any));
    const i = p.optionIds?.indexOf(id) ?? p.options.indexOf(id);
    if (i >= 0) return (lang === "en" && p.optionsEn?.[i]) || p.options[i] || id;
    return id;
  }
  const defaut = defautParametre(p as any, lang as any);
  return defaut === undefined || defaut === null || defaut === "" ? "—" : String(defaut);
}
