// plugins/catalogue-pret.ts — Le catalogue chargé et le registre rempli, POUR LES TESTS ET POUR EUX SEULS.
//
// POURQUOI CE MODULE. Le catalogue se charge par catégories, par `import()` (voir `index.ts`), et
// n'est donc plus là au chargement d'un module. L'application l'attend une fois, dans `main.tsx`,
// avant de se peindre. Un test n'a pas de démarrage : il importe ce module, dont l'évaluation attend
// le chargement, et lit ensuite `toutesLesFiches` et le registre comme avant.
//
// L'APPLICATION NE L'IMPORTE JAMAIS, et `categories-du-catalogue.test.ts` le tient. Son `await` au
// niveau du module bloquerait l'évaluation de tout ce qui l'importe, et une catégorie qui
// réimporterait ce qui l'attend attendrait sa propre fin.
import { chargerLeDomaine } from "../audio/adaptateur";
import { chargerToutesLesFiches } from "./index";

await chargerLeDomaine();

/** Toutes les fiches, dans l'ordre du catalogue : les objets mêmes que le registre a enregistrés. */
export const toutesLesFiches = await chargerToutesLesFiches();
