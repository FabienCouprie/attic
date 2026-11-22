// valeurs-inconnues.ts — La ligne qui dit les valeurs de choix qu'un nœud a lues sans les reconnaître.
//
// LE MOTEUR LA POSE, ET NON CHAQUE NŒUD, décision de Fabien du 2026-11-21, défaut H du contrôle des
// gammes : une valeur qu'aucune option ne reconnaît devient le défaut déclaré du réglage
// (`core/contexte-de-passe.ts`), et le message du nœud le dit. Le cœur ne connaît pas la langue de
// l'interface : le shell lui passe cette fonction, comme il lui passe `canoniser`, et le banc des
// lancers (`lancer-fiche.ts`) l'emploie aussi, pour montrer ce que l'application montre.
//
// ELLE VIT HORS DU DICTIONNAIRE : le garde des clés mortes lit toutes les sources sauf `i18n.tsx`, et
// une clé employée là seulement passerait pour morte. ET HORS DU DOMAINE, à côté du dictionnaire : le
// shell l'importe, et `docs/frontiere-domaine.test.ts` refuse qu'un fichier du shell charge un module
// de `audio/`, où elle était d'abord.

import type { ParametreDef } from "./core/types";
import { langueCourante, traduire } from "./i18n";

/** Une valeur inconnue, telle que le contexte de passe la retient. */
type Inconnue = { parametre: Pick<ParametreDef, "nom" | "nomEn" | "options" | "optionsEn" | "optionIds">; valeur: string; repli: string | number };

/** Une ligne par valeur : le réglage, la valeur lue, et le libellé du défaut employé à sa place. */
export function direValeursInconnues(inconnues: readonly Inconnue[]): string {
  const en = langueCourante() === "en";
  return inconnues.map(({ parametre: p, valeur, repli }) => {
    const ids = p.optionIds?.length ? p.optionIds : p.options ?? [];
    const rang = ids.indexOf(String(repli));
    const libelle = (rang >= 0 ? (en ? p.optionsEn?.[rang] : p.options?.[rang]) : undefined) ?? String(repli);
    return traduire("msg.choix.inconnu", en ? p.nomEn ?? p.nom : p.nom, valeur, libelle);
  }).join("\n");
}
