// ui/registre-actif.ts — Le registre que le shell interroge, déposé par la racine de composition.
//
// POURQUOI CE MODULE, ET C'EST « L'ITEM 3 » QUE `PORTING-A-DOMAIN.md` ANNONÇAIT.
//
// Treize fichiers de `src/ui/` écrivaient `import { registre } from "../audio/adaptateur"`. Le shell
// nommait donc le domaine audio en dur : le canevas, la palette, l'inspecteur, la validation et la
// persistance des méta-composants étaient génériques dans leur code et liés à l'audio dans leurs
// imports. Un autre domaine ne pouvait les réutiliser qu'en remplaçant le fichier d'adaptateur à sa
// place, c'est-à-dire en se faisant passer pour l'audio.
//
// LE SHELL DEMANDE, IL N'IMPORTE PLUS. `registreUI()` rend le registre actif ; la racine de
// composition (`main.tsx`) le dépose avant le premier rendu. C'est le même geste que celui par
// lequel l'adaptateur dépose déjà son registre dans les modules du cœur qui en ont besoin.
//
// POURQUOI UN ACCESSEUR ET NON UNE VALEUR EXPORTÉE. Une valeur serait figée au chargement du module,
// donc avant que la racine ait pu la déposer. Un appel, lui, a lieu quand le shell s'en sert.
//
// MAIS « QUAND LE SHELL S'EN SERT » N'EST PAS TOUJOURS APRÈS LE PREMIER RENDU, et j'avais écrit ici
// le contraire. `ui/App.tsx` fait son démarrage AU CHARGEMENT DU MODULE : il restaure une sauvegarde,
// relit les méta-composants locaux, installe les métas d'exemple. Le dépôt doit donc avoir lieu avant
// que `App` soit évalué, et c'est pourquoi il vit dans `src/composition.ts`, importé en premier par
// `main.tsx`. `src/docs/composition.test.ts` tient cet ordre.
//
// POURQUOI `unknown` ET NON LE TYPE DU DOMAINE AUDIO. Le shell ne doit rien savoir de ce qui circule
// sur les arêtes. Il lit des fiches — nom, ports, paramètres, notice —, qui sont génériques, et
// transporte les valeurs sans les regarder. Les deux paramètres du registre restent donc ouverts.
import type { PluginDef, Registre } from "../core";

/** Le registre du domaine branché, vu par le shell : ce qui circule ne le concerne pas. */
export type RegistreUI = Registre<unknown, unknown>;

/**
 * Une fiche de nœud, VUE PAR LE SHELL.
 *
 * POURQUOI CE TYPE REMPLACE CELUI DU DOMAINE DANS `src/ui/`, et c'est la moitié profonde de
 * l'isolation. Dix fichiers du shell annotaient leurs paramètres avec le type du domaine audio,
 * c'est-à-dire
 * `PluginDef<TypeValeur, AudioContext>`. Ces imports ne tiraient aucun code — ils disparaissent à la
 * compilation —, mais ils LIAIENT LES SIGNATURES du shell au domaine audio : une fiche d'un autre
 * domaine ne pouvait pas y entrer, et le compilateur le refusait à juste titre.
 *
 * Le shell lit d'une fiche son nom, ses ports, ses paramètres, sa notice, sa taille : tout cela est
 * générique. Ce qui circule sur les arêtes, il le transporte sans le regarder.
 *
 * `executer` EST RETIRÉ, ET CE N'EST PAS UN CONTOURNEMENT : c'est la règle, écrite dans le type. Le
 * shell LIT une fiche, il ne la fait pas tourner ; un seul endroit exécute un graphe, et il demande
 * le registre exécutant ci-dessous. Toute autre tentative d'appeler `executer` depuis `src/ui/`
 * devient une erreur de compilation.
 *
 * C'est aussi ce qui rend la substitution possible. `executer` est déclaré comme une PROPRIÉTÉ de
 * type fonction, non comme une méthode : sous `strictFunctionTypes`, son paramètre est donc
 * strictement contravariant, et aucune fiche d'un domaine concret n'entrerait dans une fiche
 * générique. Le reste de la fiche, lui, se substitue sans réserve.
 */
export type FicheUI = Omit<PluginDef<unknown, unknown>, "executer">;

let actif: RegistreUI | null = null;

/**
 * Dépose le registre du domaine. Appelé une fois, avant le premier rendu.
 *
 * DEUX DOMAINES DANS UN MÊME PROCESSUS N'EST PAS SERVI ICI, et c'est assumé : `core/cloisonnement.test.ts`
 * prouve que deux registres coexistent, mais le shell n'en affiche qu'un à la fois. Le jour où il en
 * faudrait deux, c'est ce module qui porterait la clé.
 */
export function configurerRegistreUI(r: RegistreUI): void {
  actif = r;
}

/** Le registre actif. Lance si la racine de composition ne l'a pas déposé. */
export function registreUI(): RegistreUI {
  if (!actif) {
    throw new Error(
      "Registre UI non configuré : la racine de composition doit appeler configurerRegistreUI() "
      + "avant le premier rendu (cf. ui/registre-actif.ts et PORTING-A-DOMAIN.md §6.a).",
    );
  }
  return actif;
}

/** Vrai quand un registre a été déposé. Pour un test qui veut vérifier l'absence sans la provoquer. */
export const registreUIConfigure = (): boolean => actif !== null;
