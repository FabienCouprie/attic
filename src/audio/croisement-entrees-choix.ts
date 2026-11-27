// audio/croisement-entrees-choix.ts — Les entrées propres que les réglages à choix ont demandées.
//
// LE LOT 3e DE LA PASSE DE COMPLÉTUDE (2026-11-15) : tout réglage à choix gouverne, et la passe a vu
// sous eux des réglages inertes parce que l'entrée commune ne leur donnait aucune prise. Un son sans
// silence ne laisse rien à rogner, un MIDI sur un seul canal rien à répartir, une séquence d'une seule
// vélocité aucune nuance à profiler. Chaque entrée est la plus simple qui fasse agir le réglage, avec
// sa raison, sur la décision de Fabien du 2026-11-14 : « une entrée propre par nœud si c'est simple ».
// Sorti de `croisement-entrees.ts` à la taille ; `croisement-reglages.ts` lit les deux tables.

import { construireBanque } from "./clavier-banque";
import { DEUX_NOTES, midiParCanal, notesDesAccords, sonDe, sonSecond } from "./croisement-entrees";
import { sonDEssai } from "./lancer-fiche";
import { notesVersFichierMidi } from "./midi-ecriture";

type Entrees = Record<string, Record<string, { valeur: () => unknown; raison: string }>>;

const FIN = String.fromCharCode(10);
const deuxPi = 2 * Math.PI;

/** Le son d'essai de `secondes`, mis à zéro sur chaque intervalle `[debut, fin[`, en secondes. */
function sonCreuse(secondes: number, creux: readonly [number, number][]): AudioBuffer {
  const son = sonDEssai(secondes);
  for (let c = 0; c < son.numberOfChannels; c++) {
    for (const [a, b] of creux) son.getChannelData(c).fill(0, Math.round(a * son.sampleRate), Math.round(b * son.sampleRate));
  }
  return son;
}

/** Un accord de notes MIDI, de `debut` à `fin`, sur un canal. */
const accord = (notes: readonly number[], debut: number, fin: number, canal: number, velocite = 90) =>
  notes.map((note) => ({ note, velocite, debut, fin, canal }));

/** Huit frappes à 440 Hz sur un fond faible, à intervalles irréguliers, toutes à moins d'une demi-seconde. */
const FRAPPES = [0.1, 0.3, 0.6, 0.75, 1.15, 1.4, 1.55, 1.85];
const sonFrappe = (t: number) =>
  0.03 * Math.sin(deuxPi * 220 * t) + FRAPPES.filter((k) => k <= t).reduce((s, k) => s + 0.3 * Math.exp(-(t - k) / 0.03) * Math.sin(deuxPi * 440 * t), 0);

/** Cinq objets déjà décrits, dont chaque descripteur donne un ordre propre. */
const ZONES_DECRITES = [
  { debut: 0, duree: 0.3, sonie: -25, brillance: 1500, bruit: 0.4, degreMasse: 1, attaqueMs: 80, irregularite: 0.5 },
  { debut: 0.35, duree: 0.1, sonie: -15, brillance: 2500, bruit: 0.3, degreMasse: 5, attaqueMs: 10, irregularite: 0.3 },
  { debut: 0.5, duree: 0.4, sonie: -30, brillance: 1000, bruit: 0.5, degreMasse: 4, attaqueMs: 40, irregularite: 0.1 },
  { debut: 0.95, duree: 0.2, sonie: -10, brillance: 2000, bruit: 0.1, degreMasse: 3, attaqueMs: 5, irregularite: 0.4 },
  { debut: 1.2, duree: 0.5, sonie: -20, brillance: 500, bruit: 0.2, degreMasse: 2, attaqueMs: 20, irregularite: 0.2 },
];

/**
 * Les huit entrées du mélangeur MIDI, chacune deux notes à elle sur les canaux 1 et 2.
 *
 * DEUX CANAUX ET NON UN : sur une entrée d'un seul canal, « Automatique » et « Garder » rendent chacun
 * ce que rend un numéro écrit, et chaque « Canal » aurait porté deux coïncidences ; sur deux canaux,
 * il ne reste qu'« Automatique » et « Garder », qui gardent tous deux les canaux d'un arrangement.
 */
function entreesDuMelangeurMidi(): Entrees[string] {
  const raison = "le mélangeur ne rend rien sans entrée, et ses huit ports sont facultatifs : chacun reçoit deux notes à lui, sur les canaux 1 et 2, pour que les réglages de chaque entrée aient prise";
  return Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`MIDI ${k + 1}`, {
    valeur: () => midiParCanal([...accord([60 + k], 0, 0.5, 0), ...accord([48 + k], 0.5, 1, 1)]), raison,
  }]));
}

/** Par fiche, les ports que la passe nourrit d'une entrée propre, et pourquoi. */
export const ENTREES_DES_CHOIX: Entrees = {
  "melangeur-midi": entreesDuMelangeurMidi(),
  "correction-pleurage": {
    Audio: {
      valeur: () => sonDe(3, (t) => 0.3 * Math.sin(deuxPi * 50.5 * t - 0.125 * Math.cos(deuxPi * 4 * t)) + 0.2 * Math.sin(deuxPi * 440 * 1.01 * t)),
      raison: "le son commun n'a pas de ton à 50 Hz : la référence était introuvable, et le son ressortait tel quel quels que soient les réglages ; un ton de référence qui scintille donne une horloge à suivre, et une vitesse moyenne à corriger",
    },
  },
  "doser-effet": {
    Zones: {
      valeur: () => [{ debut: 0.5, duree: 0.5 }],
      raison: "sans zone, l'enveloppe vaut un partout, et le complément de rien est le tout : l'application, les fondus et la loi n'avaient rien à régler ; une zone au milieu du son leur donne deux frontières",
    },
  },
  morphologie: {
    Séquence: {
      valeur: () => ({
        notes: [100, 96, 100, 96, 100, 70, 100, 96].map((velocite, i) => ({
          note: 60 + [0, 2, 4, 5, 7, 9, 11, 12][i], velocite, debut: i * 0.5, fin: i * 0.5 + [0.45, 0.25, 0.45, 0.25, 0.45, 0.1, 0.45, 0.25][i], canal: 0,
        })),
        tempo: 120,
      }),
      raison: "la séquence commune n'a qu'une vélocité et qu'une durée : le profil des nuances et celui des durées étaient plats, et la tolérance n'avait rien à aplanir ; des vélocités et des durées qui alternent donnent des figures qui reviennent et des écarts sous la tolérance",
    },
  },
  "clavier-apprentissage": {
    MIDI: {
      valeur: () => midiParCanal([
        ...notesDesAccords().map((n) => ({ ...n, canal: 1 })), ...accord([48, 57, 60, 69], 4, 4.5, 1), ...accord([110], 5, 5.4, 1),
        ...accord([48, 57, 60, 69], 6, 6.5, 0), ...accord([15], 7, 7.4, 0),
        ...accord([36, 45, 48, 57], 8, 8.3, 9), ...accord([38], 9, 9.2, 9),
      ]),
      raison: "le MIDI commun n'a qu'un canal, aucune percussion, aucune note hors des 88 touches, et aucun accord que l'écart de main départage : trois canaux, dont la batterie, deux notes hors du clavier et un accord qui tient à douze demi-tons et non à huit",
    },
  },
  "decoupage-objets": {
    Audio: {
      valeur: () => {
        const son = sonCreuse(2.6, [[0, 0.3], [1.3, 1.6]]);
        const autre = sonSecond(), depuis = Math.round(1.8 * son.sampleRate);
        for (let c = 0; c < son.numberOfChannels; c++) son.getChannelData(c).set(autre.getChannelData(c).subarray(0, son.length - depuis), depuis);
        return son;
      },
      raison: "le son commun sonne sans silence ni attaque franche ni changement de timbre, et chaque critère n'y trouvait qu'un objet, le son entier : deux silences le coupent, et le son second, posé sur ses huit dernières dixièmes, lui donne un autre timbre",
    },
  },
  "montage-grains": {
    Audio: {
      valeur: () => sonDe(2, sonFrappe),
      raison: "le son commun n'a d'attaques que les remontées d'un battement lent, à une seconde d'écart : huit frappes irrégulières, toutes à moins d'une demi-seconde l'une de l'autre, donnent à l'écart minimal des départs à écarter",
    },
  },
  "repartiteur-midi": {
    MIDI: {
      valeur: () => midiParCanal([
        ...notesDesAccords().map((n) => ({ ...n, canal: 1 })), ...DEUX_NOTES.map((n) => ({ ...n, canal: 4 })),
        ...accord([36], 5, 5.2, 9, 100), ...accord([38], 5.5, 5.7, 9, 100),
      ]),
      raison: "le MIDI commun tient sur un canal et une piste, que les trois façons mettent en Partie 1 : des canaux 2, 5 et 10 dans une seule piste séparent la règle automatique, les canaux écrits et les pistes",
    },
  },
  "sequence-sur-banque": {
    Séquence: {
      valeur: () => undefined,
      raison: "la séquence passe devant le MIDI, et le canal ne se lit que sur l'entrée MIDI : sans séquence, la passe emprunte la route où il agit",
    },
    Banque: {
      valeur: () => construireBanque(sonDEssai(), { racineSource: 60, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 72, boucle: true, boucleDebut: 0.1, boucleLongueur: 0.2 }),
      raison: "la banque commune n'a pas de boucle de maintien, et le fondu de boucle n'avait rien à fondre : une boucle de 0,2 à 0,4 s, que chaque note traverse, lui en donne une",
    },
    MIDI: {
      valeur: () => midiParCanal([...notesDesAccords(), ...DEUX_NOTES.map((n) => ({ ...n, canal: 4 }))]),
      raison: "le MIDI commun n'a qu'un canal, où choisir un canal ne choisit rien : les deux notes seules passent sur un second",
    },
  },
  "vitesse-midi": {
    MIDI: {
      valeur: () => notesVersFichierMidi([...notesDesAccords(), ...DEUX_NOTES, { note: 76, velocite: 90, debut: 5, fin: 5.05, canal: 0 }], 120, 0),
      raison: "le MIDI commun n'a pas de note plus courte que cent millisecondes, et le plancher n'avait rien à allonger : une note de cinquante millisecondes lui en donne une",
    },
  },
  "abc-vers-midi": {
    ABC: {
      valeur: () => ["X:1", "T:Un", "M:4/4", "L:1/8", "K:G", '"G"GABG DGBG|"C"cBcd "G"efge|]', "", "X:2", "T:Deux", "M:3/4", "L:1/8", "Q:1/4=90", "K:D", '"D"DEF A2d|"A"cBA E2A|]'].join(FIN),
      raison: "l'exemple par défaut n'a qu'un morceau et porte son tempo : deux morceaux, le premier sans tempo et avec ses accords chiffrés, donnent prise au numéro de morceau et au tempo",
    },
  },
  "aligneur-piste": {
    Piste: {
      valeur: () => sonDe(1, (t) => 0.1 * Math.sin(deuxPi * 330 * t)),
      raison: "le son second a la longueur du son d'essai, et à longueur égale avant et après font la même copie : une piste d'une seconde contre une référence de deux pose son silence en tête ou en fin",
    },
  },
  "caler-coupes": {
    Audio: {
      valeur: () => sonDe(1, (t) => 0.5 * Math.sin(deuxPi * 220 * t)),
      raison: "un sinus sans souffle, dont les passages par zéro se calculent : avec les zones propres, chaque pente retient une frontière différente",
    },
    Zones: {
      valeur: () => [{ debut: 0.2025, duree: 0.398 }],
      raison: "les zones communes tombent sur des zéros montants du son d'essai, où montante et indifférente retiennent le même passage : ces frontières suivent l'une un zéro descendant, l'autre un zéro montant",
    },
  },
  "classificateur-genre": {
    Audio: {
      valeur: () => sonDe(12, (t) => 0.3 * Math.sin(deuxPi * (t < 6 ? 220 : 880) * t)),
      raison: "le son d'essai dure deux secondes, moins que la plus courte durée offerte : douze secondes qui changent de hauteur à six font voir chaque durée analysée",
    },
  },
  "gate-expandeur": {
    Audio: {
      valeur: () => sonDe(2, (t) => (t % 1 < 0.25 ? 0.5 : 0.001) * Math.sin(deuxPi * 220 * t)),
      raison: "le son d'essai ne descend jamais sous le seuil, et le relâchement n'avait rien à faire retomber : des salves suivies de creux à moins soixante décibels font fermer le gate plus ou moins tôt",
    },
  },
  "remplissage-trou": {
    Audio: {
      valeur: () => sonCreuse(1, [[0.5, 0.515]]),
      raison: "le son commun n'a aucun silence, et la détection automatique ne trouvait rien à boucher : un décrochage de 15 ms, plus court que la plus longue durée minimale offerte, donne prise à chaque réglage",
    },
    Zones: {
      valeur: () => [{ debut: 0.2, duree: 0.01 }],
      raison: "sans zone branchée, les zones branchées rendaient l'entrée telle quelle : une zone de 10 ms, ailleurs que le décrochage, pour que les deux sources de trous ne bouchent pas le même",
    },
  },
  "rendu-cercles": {
    "Cercle 1": {
      valeur: () => ({ positions: 8, sorte: "percussion", sommets: [{ position: 0, valeur: 36 }, { position: 3, valeur: 38 }, { position: 6, valeur: 36 }] }),
      raison: "la relance nourrie donne le même cercle de huit places à chaque port, et à tailles égales le cycle et la pulsation sont la même chose : un cercle de huit et un de douze les séparent",
    },
    "Cercle 2": {
      valeur: () => ({ positions: 12, sorte: "percussion", sommets: [{ position: 0, valeur: 42 }, { position: 5, valeur: 42 }, { position: 9, valeur: 46 }] }),
      raison: "un cercle de douze places à côté du cercle de huit : sous la pulsation partagée, il tourne plus lentement et se décale",
    },
  },
  "classes-hauteurs": {
    Séquence: {
      valeur: () => ({ notes: notesDesAccords(), tempo: 120 }),
      raison: "sans séquence ni MIDI, le nœud analyse les notes saisies comme un seul ensemble, et le découpage n'avait aucun accord à séparer : quatre accords qui partent ensemble lui en donnent",
    },
  },
  creneau: {
    Fond: {
      valeur: () => sonDe(4, (t) => (t >= 0.37 && t < 2.37 ? 0.02 : 0.3) * Math.sin(deuxPi * 220 * t)),
      raison: "le fond et le son communs durent tous deux deux secondes, et le son n'avait qu'une place, à zéro, quelle que soit la trame ; un fond de quatre secondes, creusé de 0,37 à 2,37 s, lui en offre plusieurs, et chaque fenêtre la trouve sur sa propre grille",
    },
    Son: {
      valeur: () => sonSecond(),
      raison: "une entrée propre ne passe pas par le compteur des ports audio de `entreesRiches` : le son posé reçoit donc le son second, pour rester autre que le fond",
    },
  },
  "matrice-parametres": {
    "Courbe du champ piloté": {
      valeur: () => ({ valeurs: Float32Array.from({ length: 16 }, (_, k) => k / 15), cadence: 4 }),
      raison: "sans courbe, le champ piloté et ses bornes n'avaient rien à remplacer ; une rampe de seize points leur en donne une, et le port ne prend la main sur un champ que si « Champ piloté » le demande",
    },
  },
  micromontage: {
    "Source 2": {
      valeur: () => sonSecond(),
      raison: "une seule source branchée, tout numéro de source retombait sur la première : une seconde source lui donne un choix, et ce port ne prend la main sur aucun réglage",
    },
  },
  "reordonner-objets": {
    Zones: {
      valeur: () => ZONES_DECRITES.map((z) => ({ ...z })),
      raison: "deux zones ne font que deux ordres, et sept descripteurs rendaient le premier ; cinq zones décrites d'avance, dont chaque descripteur donne un ordre propre, les séparent",
    },
  },
  "rogner-silences": {
    Audio: {
      valeur: () => sonDe(4, (t) => ((t >= 0.5 && t < 1.5) || (t >= 1.8 && t < 2.6) || (t >= 3.4 && t < 3.6) ? 0.3 : t >= 3.6 && t < 3.8 ? 0.003 : 0) * Math.sin(deuxPi * 220 * t)),
      raison: "le son commun ne se tait jamais, et rien n'était rogné : un son qui commence et finit par un silence, en porte deux à l'intérieur, de 0,3 et 0,8 s, et finit par une traîne vers −50 dB, donne prise au seuil, à la marge, à la durée minimale, à la pause et au fondu",
    },
  },
  vague: {
    Audio: {
      valeur: () => sonDEssai(10),
      raison: "le son commun, de deux secondes, ne voit que la montée du premier cycle, de sept : la vague ne s'y brise jamais ; dix secondes la font se briser",
    },
  },
};
