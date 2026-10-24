// audio/sous-types-texte.ts — Les contenus que le flux « texte » transporte, et ce qui va ensemble.
//
// LE TYPE D'UN PORT DIT LE TRANSPORT, PAS LE CONTENU, et c'est la faute que cette table répare.
// Un plan de chanson est un texte. Une notation `C4 0.5` est un texte. Un prompt, des paroles, une
// grille d'accords, une transcription : tous du texte. Le graphe autorisait donc toutes les
// combinaisons, et six seulement veulent dire quelque chose.
//
// LA DÉMONSTRATION A ÉTÉ FAITE À MES DÉPENS : la sortie « Plan » de « Prompt → graphe » branchée
// sur l'entrée « Notation » de « Texte → MIDI ». Le câble était licite, les couleurs de ports
// s'accordaient, et le résultat valait zéro note. Rien dans le graphe ne pouvait le dire.
//
// LE NOM EXISTAIT DÉJÀ, PAS LE TYPE. Le chantier des noms de ports a donné à chaque entrée texte le
// nom de son contenu, et `plugins/noms-de-ports.test.ts` le tient : 1 484 ports, 303 noms distincts.
// Un nom rend la faute VISIBLE ; il ne la rend pas REFUSABLE. Cette table transforme trois de ces
// noms en sous-types, que la pose d'une arête consulte.
//
// RELEVÉ, sur les 271 ports texte du catalogue :
//
//   plan       5 sorties, 6 entrées     le plan d'une chanson, et c'est lui le cas fondateur
//   notation   4 sorties, 3 entrées     la gamme jouée, les accords joués, la grille, la conversion
//   abc        3 sorties, 3 entrées     un format d'écriture entier, qui se relit lui-même
//   paroles    2 sorties, 3 entrées     le texte chanté, qui voyage à côté du plan
//   prompt     0 sortie,  7 entrées     une invite de modèle, qu'aucun port ne produit encore
//
// PROMPT N'A AUCUN PRODUCTEUR, ET IL COMPTE QUAND MÊME. Un sous-type sans sortie ne refuse rien qui
// vienne de lui, mais il refuse ce qui VA vers lui : une notation ou un ABC posés sur l'invite d'un
// modèle sont une faute, et c'en est une fréquente. Un contenu peut donc n'être qu'une destination.
//
// ET LE PLAN FERME LE CAS QUI A OUVERT CE CHANTIER. « Prompt → graphe » rend un plan, « Texte →
// MIDI » attend une notation : le câble était licite et le résultat valait zéro note. Il se refuse
// désormais sous la souris. Les deux contenus qui voyagent ensemble, le plan et les paroles, sont
// aussi ceux qu'on échange le plus facilement : « Rendre la chanson » les reçoit l'un sous l'autre,
// et rien ne disait lequel allait où.

/**
 * Les contenus déclarés, et le nom de port qui les désigne à l'écran.
 *
 * LE NOM ET LE SOUS-TYPE SE TIENNENT L'UN L'AUTRE : `plugins/sous-types-texte.test.ts` exige qu'un
 * port nommé « Notation » porte `sousType: "notation"` et qu'aucun autre ne le porte. Sans cela,
 * les deux dériveraient, et c'est exactement ce qui est arrivé aux libellés de réglage.
 */
export const CONTENUS_TEXTE: Record<string, { nom: string; nomEn: string }> = {
  plan: { nom: "Plan", nomEn: "Plan" },
  notation: { nom: "Notation", nomEn: "Notation" },
  abc: { nom: "ABC", nomEn: "ABC" },
  paroles: { nom: "Paroles", nomEn: "Lyrics" },
  prompt: { nom: "Prompt", nomEn: "Prompt" },
};

/**
 * Deux contenus de texte vont-ils ensemble ?
 *
 * LA RÈGLE EST PERMISSIVE D'UN CÔTÉ, ET IL LE FAUT. Un texte sans contenu déclaré entre partout :
 * c'est le cas de « Sortie texte », d'un modèle de langue, d'une transcription, de tout ce qui
 * produit du texte quelconque, et refuser cela couperait des chaînes justes par dizaines. Deux
 * contenus DÉCLARÉS, en revanche, doivent être le même : une notation n'est pas un ABC.
 */
export function contenusTexteCompatibles(
  sousTypeSource: string | undefined, sousTypeCible: string | undefined,
): boolean {
  if (!sousTypeSource || !sousTypeCible) return true;
  return sousTypeSource === sousTypeCible;
}
