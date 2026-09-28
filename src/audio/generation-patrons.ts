// audio/generation-patrons.ts — Les patrons de rythme, un par metrique.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.


export type Patron = { kick: number[]; snare: number[]; hat: number[]; hatOuvert: number[] };


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
  House: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [4, 12] },
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
  "Pop ballade": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0, 8] },
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
  "Pop folk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  "Pop R&B": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 3, 8, 11], snare: [8], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  "Pop punk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
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
  Rumba: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  Flamenco: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 10, 12], hat: [2, 6, 10, 14], hatOuvert: [] },
    },
  },
  Merengue: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
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
  "Detroit techno": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [], hat: [2, 6, 10, 14], hatOuvert: [] },
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
  Moombahton: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  Dembow: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  Reggaeton: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  Cumbia: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [2, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
    },
  },
  Bachata: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [8] },
    },
  },
  "Blues shuffle": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [10] },
    },
  },
  Gospel: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [8] },
    },
  },
  Metal: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [] },
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
  Trance: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [4, 12] },
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
  "Boom bap": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [0, 8] },
    },
  },
  Drill: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 8], snare: [4, 12], hat: [3, 7, 11, 15], hatOuvert: [0] },
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
  Highlife: {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  "Baile funk": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 6, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [3, 11] },
    },
  },
  "Tech house": {
    signatures: ["4/4"],
    positions: {
      "4/4": { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatOuvert: [4, 12] },
    },
  },
};


