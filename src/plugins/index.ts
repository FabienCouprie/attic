// plugins/index.ts — Les fiches de tous les plugins du domaine audio, dans l'ordre du catalogue.
// L'adaptateur (audio/adaptateur.ts) les demande et les enregistre dans le registre. Aucun
// side-effect à l'import — les modules ne font qu'exporter.
//
// ELLES ARRIVENT PAR HUIT CATÉGORIES, rangées dans `categories/`. Ce fichier était un baril de deux
// cent cinquante-cinq imports, en dette de taille ; chaque catégorie en porte maintenant une tranche,
// et ce fichier n'écrit plus que l'ordre des huit.
//
// UNE CATÉGORIE EST UNE TRANCHE CONTIGUË DE L'ORDRE DU CATALOGUE, ET NON UN UNIVERS. Dix-sept
// fichiers de plugins portent des fiches de plusieurs univers (`analyse`, `sorties`, `tonal`…) :
// couper par univers aurait changé l'ordre du registre ou demandé de couper ces fichiers. Le nom
// d'une catégorie dit ce qui y domine ; l'ordre étant historique, chacune a des voisins inattendus.
//
// CHAQUE CATÉGORIE SE CHARGE PAR `import()`, et le catalogue est donc une PROMESSE. Le build en
// fait un morceau par catégorie, que l'adaptateur demande au démarrage ; l'application ne se peint
// qu'une fois le registre rempli (voir `main.tsx`). Ce n'est pas un démarrage plus léger : la
// palette, le projet restauré et les méta-composants veulent tout le catalogue avant la première
// image, et les huit morceaux se chargent donc tous, ensemble. C'est la fin du cycle statique entre
// `audio/adaptateur.ts` et les plugins, qui importent `../audio` en retour.
//
// AUCUN `await` AU NIVEAU D'UN MODULE DE L'APPLICATION. Une catégorie importe des modules qui
// importent l'adaptateur : un module qui attendrait le catalogue pendant sa propre évaluation, et
// que l'une d'elles réimporterait, attendrait sa propre fin. Les tests, qui n'ont pas de démarrage,
// lisent le catalogue chargé dans `catalogue-pret.ts`, et l'application ne l'importe jamais.
//
// TROIS GARDES TIENNENT LA COUTURE : `ordre-du-catalogue.test.ts`, les mêmes fiches dans le même
// ordre que la référence ; `categories-du-catalogue.test.ts`, aucun fichier de fiches oublié ni
// repris deux fois, aucune catégorie chargée ailleurs qu'ici ni autrement que par `import()`, et
// `catalogue-pret.ts` hors de l'application. Un composant neuf s'ajoute à la catégorie qui lui
// convient, puis `npm run docs:components` réécrit la référence.
import type { FicheAudio } from "../audio/types-domaine";
import { rangerParStyle } from "./familles-palette";
import { avecSortieAudio } from "./sortie-audio";

type Categorie = () => Promise<{ fiches: FicheAudio[] }>;

/** Les huit catégories, DANS L'ORDRE DU CATALOGUE : c'est le seul endroit où il s'écrit. */
const CATEGORIES: readonly Categorie[] = [
  () => import("./categories/entrees-effets-sorties"),
  () => import("./categories/generateurs"),
  () => import("./categories/montage-et-spectral"),
  () => import("./categories/sequences-et-cercles"),
  () => import("./categories/electroacoustique"),
  () => import("./categories/voix-et-texte"),
  () => import("./categories/notation-et-moteurs"),
  () => import("./categories/image-et-compositeurs"),
];

let catalogue: Promise<FicheAudio[]> | null = null;

/**
 * Toutes les fiches, dans l'ordre du catalogue. Les huit catégories se demandent ensemble, et
 * `Promise.all` rend leurs listes dans l'ordre où elles ont été demandées, non dans celui où elles
 * arrivent. Une seule promesse pour tout le processus : un second appel rend les mêmes objets.
 */
export function chargerToutesLesFiches(): Promise<FicheAudio[]> {
  catalogue ??= Promise.all(CATEGORIES.map((c) => c())).then((parts) => parts
    .flatMap((p) => p.fiches)
    // TOUT COMPOSANT QUI REND UNE SÉQUENCE REÇOIT UNE SORTIE AUDIO, posée ici plutôt que dans
    // vingt-cinq fiches. Voir `sortie-audio.ts` pour ce que cela suppose et ce que cela coûte.
    .map(rangerParStyle).map(avecSortieAudio));
  return catalogue;
}
