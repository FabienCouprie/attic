// audio/generation-patrons.ts — Les patrons de rythme, un par metrique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.
//
// CHAQUE STYLE A SA GRILLE, et ce n'etait pas le cas : la passe de croisement des nomenclatures a
// trouve le 2026-11-14 dix groupes de patrons identiques a l'octet (Rock = Pop folk, House = Trance
// = Tech house, Rumba = Reggaeton = Highlife...), soit vingt-deux noms pour dix grilles. Les patrons
// de ces groupes ont ete reecrits d'apres la figure qu'on attribue d'ordinaire a chaque style, sur
// decision de Fabien, qui les a ecoutes et retenus le meme jour. `plugins/patrons-rythme.test.ts`
// tient chaque grille distincte.


export type Patron = { kick: number[]; snare: number[]; hat: number[]; hatOuvert: number[] };

/**
 * La métrique où jouer un patron : 4/4 s'il s'y écrit, sinon la première des siennes.
 *
 * LA BOÎTE À RYTHMES JOUAIT TOUT EN 4/4, et la valse et le boléro, qui ne s'écrivent qu'en 3/4,
 * retombaient sur le patron de secours : ils sonnaient pareil, et rien de ce qui fait une valse
 * (passe de croisement, 2026-11-14).
 */
export function signatureJouee(patronNom: string): [number, number] {
  const signatures = PATRONS_RYTHME[patronNom]?.signatures ?? ["4/4"];
  const [temps, unite] = (signatures.includes("4/4") ? "4/4" : signatures[0]).split("/").map(Number);
  return [temps || 4, unite || 4];
}


export const PATRONS_RYTHME: Record<string, { signatures: string[]; positions: Record<string, Patron> }> = {
  Rock: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Four-on-the-floor": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Funk: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [2, 4, 6, 8, 10, 12, 14], hatOuvert: [0] },
    },
  },
  "Hip-hop": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [3, 7, 11, 15], hatOuvert: [0] },
    },
  },
  Jazz: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0] },
    },
  },
  Reggae: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [8], snare: [8], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  Ska: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [4, 12], snare: [0, 8], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Bossa Nova": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Samba: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatOuvert: [] },
    },
  },
  // La grosse caisse à chaque temps, le clap sur 2 et 4, le charley ouvert sur chaque contretemps.
  House: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [], hatOuvert: [2, 6, 10, 14] },
    },
  },
  Techno: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  "Drum & Bass": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Trap: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8, 12], snare: [8], hat: [0, 3, 6, 9, 12, 15], hatOuvert: [] },
    },
  },
  Disco: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [12] },
    },
  },
  Tango: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 12], snare: [0, 4, 8, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  Calypso: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Marche militaire": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [0, 2, 4, 6, 8, 10, 12, 14], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  // Peu de frappes : la grosse caisse sur 1 et sur le « et » de 3, le charley à la noire.
  "Pop ballade": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 10], snare: [4, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  "Pop dance": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatOuvert: [0, 4, 8, 12] },
    },
  },
  "Pop latino": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  // Le « boum-tchac » acoustique : la grosse caisse pousse sur le « et » de 2, le tambourin à la noire.
  "Pop folk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 8], snare: [4, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  "Pop R&B": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 3, 8, 11], snare: [8], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  // Le temps rapide du punk mélodique : la grosse caisse sur 1, le « et » de 2, 3 et le « et » de 4.
  "Pop punk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Valse: {
    signatures: ["3/4"],
    positions: {
      "3/4": { kick: [0], snare: [4, 8], hat: [0, 4, 8], hatOuvert: [] },
    },
  },
  Bolero: {
    signatures: ["3/4"],
    positions: {
      "3/4": { kick: [0, 4], snare: [8], hat: [0, 4, 8], hatOuvert: [] },
    },
  },
  Afrobeat: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  // La clave de rumba 3-2 sur la caisse claire (1, le « a » de 1, le « a » de 2, le « et » de 3, 4),
  // la basse du tumbao sur le « et » de 2 et sur 4.
  Rumba: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [6, 12], snare: [0, 3, 7, 10, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  Flamenco: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 10, 12], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  // La güira en doubles croches continues, la tambora qui frappe et roule en fin de mesure.
  Merengue: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [7, 14, 15], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatOuvert: [] },
    },
  },
  Breakbeat: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [11] },
    },
  },
  Electro: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatOuvert: [0, 8] },
    },
  },
  // Le clap sur 2 et 4 et le charley en doubles croches, là où la techno n'a que ses contretemps.
  "Detroit techno": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatOuvert: [] },
    },
  },
  Minimal: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8, 10], snare: [4, 12], hat: [0, 4, 8, 12], hatOuvert: [2, 10] },
    },
  },
  Dubstep: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [14] },
    },
  },
  // LES TROIS DU DEMBOW partagent la figure 3-3-2 de la caisse claire (le « a » de 1, le « et » de 2,
  // le « a » de 3, le « et » de 4) sur une grosse caisse à chaque temps, et se séparent par le
  // charley : ouvert sur deux contretemps au moombahton, plus lent ; en doubles croches au dembow
  // dominicain ; en croches au reggaeton.
  Moombahton: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [0, 4, 8, 12], hatOuvert: [2, 10] },
    },
  },
  Dembow: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hatOuvert: [] },
    },
  },
  Reggaeton: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  // Le güiro long-brève-brève sur chaque temps, la grosse caisse sur 1 et 3.
  Cumbia: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], hatOuvert: [] },
    },
  },
  // La güira, la basse sur 1, le « et » de 2 et 3, la frappe du bongo sur 4.
  Bachata: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 8], snare: [12], hat: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 15], hatOuvert: [14] },
    },
  },
  "Blues shuffle": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [10] },
    },
  },
  // Le contretemps appuyé et les notes fantômes de caisse claire autour du temps fort.
  Gospel: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 10], snare: [4, 6, 12, 15], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [8] },
    },
  },
  // La double grosse caisse en doubles croches, la cymbale à la noire.
  Metal: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], snare: [4, 12], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  Punk: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 4, 6, 8, 10, 12, 14], hat: [0, 4, 8, 12], hatOuvert: [] },
    },
  },
  Grunge: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0] },
    },
  },
  // La house en plus dense : le charley fermé en doubles croches autour du charley ouvert.
  Trance: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], hatOuvert: [2, 6, 10, 14] },
    },
  },
  Hardstyle: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Lo-fi hip hop": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0, 8] },
    },
  },
  // La grosse caisse sur 1, le « a » de 2 et le « et » de 3, sous une caisse claire lourde sur 2 et 4.
  "Boom bap": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  // En demi-mesure : la caisse claire sur 3 seulement, une grosse caisse qui glisse, un charley en rafales.
  Drill: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 11], snare: [8], hat: [0, 2, 3, 6, 8, 10, 11, 14], hatOuvert: [] },
    },
  },
  "Trip hop": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [8] },
    },
  },
  Amapiano: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [10] },
    },
  },
  Salsa: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [8] },
    },
  },
  // La cloche de l'highlife, qui avance d'une double croche sur deux temps, au-dessus d'une basse sur
  // 1, le « et » de 2 et 3.
  Highlife: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 5, 7, 8, 10, 13, 15], hatOuvert: [] },
    },
  },
  "Baile funk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  // La house et ses contretemps ouverts, plus le « a » de chaque temps au charley fermé, qui la balance.
  "Tech house": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [3, 7, 11, 15], hatOuvert: [2, 6, 10, 14] },
    },
  },
};


