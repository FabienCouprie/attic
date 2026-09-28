// quiz/notion-question.ts — Le constructeur d'une question de notion.
//
// POURQUOI IL VIT SEUL. La banque des notions tient dans deux fichiers, et tous deux s'en servent.
// Le laisser dans l'un des deux créait un CYCLE À L'EXÉCUTION : le premier importe la suite pour la
// concaténer, la suite importait le constructeur du premier, et l'ordre d'évaluation des modules
// laissait `notion` indéfini au moment où la suite l'appelait. L'erreur était nette, « notion is not
// a function », et aucun `import type` ne l'aurait effacée : ce sont deux valeurs.
import type { Question } from "./types";

export const notion = (
  id: string,
  enonce: string, enonceEn: string,
  choix: [string, string, string, string], choixEn: [string, string, string, string],
  pourquoi: string, pourquoiEn: string, niveau: 1 | 2 = 1,
): Question => ({
  id: `notion-${id}`, theme: "notions", niveau,
  enonce, enonceEn, choix, choixEn, pourquoi, pourquoiEn,
});
