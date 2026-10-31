// core/node-essai.ts — Un nœud installé d'essai, pour pouvoir MESURER ce qu'un nœud installé peut faire.
//
// POURQUOI IL EXISTE, ET FABIEN A POSÉ LA QUESTION QUI L'A FAIT NAÎTRE. J'avais écrit que je ne
// pouvais pas éprouver l'isolation d'un nœud installé « faute de nœud installé pour l'éprouver » ;
// il a répondu qu'il suffisait d'en créer un. C'est exact, et c'est la même réponse que pour le PNG
// et la vidéo d'essai : une pièce d'essai se FABRIQUE.
//
// SANS LUI, TOUT CE QU'ON DIT DE LA SÉCURITÉ DES NŒUDS INSTALLÉS EST UNE LECTURE DE CODE. Le dépôt
// a déjà payé six fois, en une journée, d'avoir conclu d'une lecture là où une mesure disait autre
// chose — et le commentaire « Sans window » en est l'exemple parfait : il affirmait une propriété
// de sécurité que personne n'avait éprouvée, et elle était fausse.
//
// CE QU'IL N'EST PAS : un nœud utile. Il ne fait rien d'audio. Son office est de RAPPORTER ce qu'il
// trouve autour de lui, pour qu'un cas puisse en juger.

/** La forme qu'`installerNode` attend, réduite à ce qu'un essai en a besoin. */
export interface NodeDEssai {
  manifest: {
    id: string; nom: string; univers: string; famille: string; resume: string;
    entrees: never[]; sorties: { nom: string; type: string }[];
    parametres: never[];
  };
  executerCode: string;
}

/**
 * Le code d'un nœud qui SONDE son environnement, et rend ce qu'il a trouvé.
 *
 * IL NE FAIT RIEN DE NUISIBLE, et c'est voulu : il n'écrit aucun fichier, n'ouvre rien, ne touche à
 * rien. Il se contente de dire ce qui est à sa portée — `window`, `globalThis`, le pont `api`, le
 * stockage local, le document. C'est tout ce qu'il faut pour que le cas tranche, et rien de plus :
 * un nœud d'essai qui démontrerait l'attaque en la commettant serait une attaque dans le dépôt.
 *
 * LES NOMS SE LISENT PAR `typeof`, qui ne lève pas sur un identifiant absent, là où le nommer
 * directement lèverait une `ReferenceError` — et une erreur ne distingue pas « absent » de
 * « présent mais cassé ».
 */
export const SONDE_ENVIRONNEMENT = `
  module.exports = async function (ctx) {
    const vu = {
      window: typeof window,
      globalThis: typeof globalThis,
      document: typeof document,
      localStorage: typeof localStorage,
      // Le pont d'Electron, par les deux chemins qui y mènent.
      api: typeof api,
      windowApi: (typeof window !== "undefined" && window && typeof window.api),
      // CE QUE LE DOMAINE PRETE, COMPTE ET NON NOMME. Un premier jet sondait le type du domaine par
      // son nom, et le garde de la frontiere du domaine l'a refuse : le coeur ne nomme aucun type du
      // domaine, meme dans une chaine. Il avait raison, et la sonde est meilleure ainsi — elle
      // prouve le MECANISME du pret sans dependre de ce qui est prete, donc elle servira a n'importe
      // quel domaine. (Pas d'accent grave ici : on est dans un litteral gabarit, et il le fermerait.)
      pretsDuDomaine: (typeof attic === "object" && attic ? Object.keys(attic).length : -1),
      // Et la porte de derrière la plus courte, celle qui rend tout masquage illusoire.
      parFonction: (function () { try { return typeof Function("return this")(); } catch (e) { return "refuse"; } })(),
    };
    return { valeurs: [JSON.stringify(vu)], message: "sonde" };
  };
`;

