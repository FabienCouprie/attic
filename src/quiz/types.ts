// quiz/types.ts — Ce qu'est une question, et les deux décisions qui tiennent tout le reste.
//
// PREMIÈRE DÉCISION : LA BONNE RÉPONSE EST TOUJOURS ÉCRITE EN PREMIER. Un champ `bonne: 2` à
// côté d'une liste de quatre propositions est une faute qui ne se voit pas — on relit la liste,
// on compte, on se trompe d'un rang, et le quiz enseigne le faux sans que rien ne le signale.
// La convention supprime la classe d'erreur entière : `choix[0]` est vrai par construction, et
// c'est vérifiable d'un coup d'œil sur n'importe quelle ligne de la banque. L'ordre PRÉSENTÉ,
// lui, est tiré au sort à chaque tirage (cf. `tour.ts`) : la bonne réponse n'est jamais en A.
//
// SECONDE DÉCISION : CERTAINES PROPOSITIONS NE SE TRADUISENT PAS. « Mel-Frequency Cepstral
// Coefficients » est la réponse dans les deux langues, comme « 1200 · log₂(f₂/f₁) » ou
// « Trevor Wishart ». `choixEn` est donc OPTIONNEL : absent, les propositions valent pour les
// deux langues. Traduire un sigle anglais en français aurait été une faute de fond, et non une
// économie — la moitié du métier s'apprend en anglais, y compris dans une interface française.
//
// L'énoncé et l'explication, eux, sont toujours dans les deux langues : c'est là que le quiz
// enseigne, et un utilisateur qui a mis l'interface en anglais n'a pas à lire du français.

/**
 * Les six familles de questions.
 *
 * ELLES NE SONT PAS UN CLASSEMENT DÉCORATIF : le tirage prend à tour de rôle dans chacune
 * (cf. `serie`), et c'est ce qui empêche une série de vingt questions de sonner comme un
 * interrogatoire sur les sigles. Le thème est donc la mécanique anti-lassitude, pas une
 * étiquette.
 */
export type ThemeQuiz = "sigles" | "notions" | "formules" | "chiffres" | "sources" | "catalogue";

export const THEMES: ThemeQuiz[] = ["sigles", "notions", "formules", "chiffres", "sources", "catalogue"];

/** 1 : ce qu'on croise en ouvrant le logiciel. 2 : ce qu'il faut être allé chercher. */
export type NiveauQuiz = 1 | 2;

export interface Question {
  /** Stable et unique : il sert de clé de correction et d'identité dans les tests. */
  id: string;
  theme: ThemeQuiz;
  niveau: NiveauQuiz;
  enonce: string;
  enonceEn: string;
  /** LA BONNE RÉPONSE EN TÊTE, les leurres ensuite. Au moins deux propositions. */
  choix: string[];
  /** Absent quand les propositions sont les mêmes dans les deux langues. */
  choixEn?: string[];
  /** Pourquoi c'est cette réponse — la seule partie qui apprend quelque chose. */
  pourquoi: string;
  pourquoiEn: string;
}

/** Les propositions dans la langue demandée, la bonne toujours en tête. */
export function choixLangue(q: Question, en: boolean): string[] {
  return en ? (q.choixEn ?? q.choix) : q.choix;
}

export function enonceLangue(q: Question, en: boolean): string {
  return en ? q.enonceEn : q.enonce;
}

export function pourquoiLangue(q: Question, en: boolean): string {
  return en ? q.pourquoiEn : q.pourquoi;
}

/** Le nom d'un thème, pour l'afficher. */
export const NOM_THEME: Record<ThemeQuiz, { fr: string; en: string }> = {
  sigles: { fr: "Sigles", en: "Acronyms" },
  notions: { fr: "Notions", en: "Concepts" },
  formules: { fr: "Formules", en: "Formulas" },
  chiffres: { fr: "Chiffres", en: "Figures" },
  sources: { fr: "Sources", en: "Sources" },
  catalogue: { fr: "Catalogue", en: "Catalog" },
};
