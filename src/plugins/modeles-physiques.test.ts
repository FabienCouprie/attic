// plugins/modeles-physiques.test.ts — Les trois fiches de `modeles-physiques.ts`, qu'aucun test ne
// nommait.
//
// POURQUOI CE FICHIER. Les trois calculs sont tenus, et bien : `audio/phisem.test.ts`,
// `audio/guides-onde.test.ts` et `audio/barre-modale.test.ts` prouvent les rapports modaux d'une
// barre libre, les harmoniques impairs de la clarinette, la densité de grains d'une cabasa. Ce qui
// n'était tenu par rien, c'est LA PRISE : aucun test ne nommait `secoueurs`, `vent-guide-onde` ni
// `barre-modale`, et les trois exécuteurs ne tournaient donc nulle part. Ce fichier ne refait aucune
// de ces mesures d'acoustique ; il tient ce que la fiche ajoute au calcul — la lecture des réglages,
// les conventions de zéro, les messages, et les déclarations.
//
// LA BRANCHE À SÉQUENCE EST DANS LA BATTERIE SŒUR, `modeles-physiques-midi.test.ts` : les trois
// fiches en font trois choses différentes — une secousse par note, un coup de maillet plus ou moins
// dur, un souffle qui parle ou non — et c'est un second contrat, qui demande d'autres outils.
//
// TROIS MESURES ÉCARTÉES AVANT LA BONNE. Chercher LA RAIE LA PLUS FORTE ne dit pas quel instrument
// la fiche a choisi : une cloche tubulaire n'a pas d'énergie sur sa propre note, et le bloc de bois
// est éteint avant le tiers du son où la fenêtre se pose. Le RAPPORT DES MODES HAUTS AU PREMIER
// n'est pas monotone en dureté de maillet au niveau de la fiche — 1,21·10⁻⁴ à dureté nulle,
// 0,99·10⁻⁴ à 50, 2,82·10⁻⁴ à 100 —, parce qu'une impulsion de quatre millisecondes dure à peu près
// une période à 261 Hz et s'annule en partie elle-même ; la monotonie est une affaire de calcul, et
// `audio/barre-modale.test.ts` la tient déjà. Ce qui est mesuré ici est donc L'ÉNERGIE DANS UNE
// BANDE autour d'un rapport attendu, et le NOMBRE DE MODES que le nœud annonce lui-même — quatre
// pour le glockenspiel, trois pour le marimba —, qui vient de la table et désigne donc la ligne lue.
//
// QUATRE ANGLES MORTS TROUVÉS EN PLANTANT LES DÉFAUTS, et ils expliquent la séparation des deux
// fichiers autant que la forme des cas. Les deux fiches à séquence ont DEUX sorties et DEUX messages
// — celui de la note seule et celui du mélange — et la batterie n'éprouvait que les premiers : un
// volume oublié dans la branche MIDI du vent comme de la barre, et les deux nombres du message de la
// barre échangés là, passaient sans qu'un cas tombe. La batterie sœur les tient désormais.
// SOIXANTE-CINQ PLANTAGES SUR LES DEUX FICHIERS, DONT SOIXANTE-TROIS SONT DES DÉFAUTS ; les
// soixante-trois tombent, dont quatre après correction de la batterie.
//
// ET LES DEUX QUI PASSENT NE SONT PAS DES DÉFAUTS, ce qu'il faut dire plutôt que masquer, parce
// qu'un plantage qui passe ressemble toujours à un garde aveugle.
//
//   PRENDRE LE PREMIER MODE AU LIEU DU PLUS LONG n'est pas observable : les deux lectures donnent la
//   même queue pour toutes les barres de la table, puisqu'aucune n'a son mode le plus long ailleurs
//   qu'en premier. Le cas correspondant, dans la batterie sœur, tient donc la table et non le
//   calcul — c'est elle qui rend les deux écritures indiscernables.
//
//   RETIRER UNE LIGNE DE LA TABLE DES SECOUEURS ne fait rien tomber, et c'est exactement ce qu'on
//   veut : les options du réglage sont DÉRIVÉES de la table, le nœud en propose alors cinq au lieu
//   de six, sans incohérence. Un cas tient cette dérivation, parce qu'une liste recopiée à la main,
//   elle, dériverait en silence.
//
// DEUX RISQUES QUE LE CONTEXTE DE CES CAS COURT-CIRCUITE, et qu'il fallait donc tenir autrement. La
// coquille ne transmet pas à l'exécuteur le libellé déclaré mais son IDENTIFIANT, par
// `defautCanoniqueChoix` ; l'exécuteur, lui, porte son propre repli en dur. Si les deux désignent des
// lignes différentes, un nœud dont le réglage n'a jamais été touché joue autre chose que ce que la
// fiche affiche, sans erreur et sans trace — et le défaut ANGLAIS doit mener à la même ligne que le
// français. Le vent, enfin, n'a pas de table : ses trois identifiants sont le type `Vent`, effacé à
// l'exécution, et une seule lettre fausse ferait prendre la branche du cuivre. Les identifiants sont
// donc lus dans la fiche et non recopiés dans les cas, de sorte qu'une coquille fait se confondre
// deux des trois sons.
//
// TROIS DÉFAUTS TROUVÉS ICI, ET CORRIGÉS DEPUIS. Leur trace reste parce qu'elle explique la forme
// des cas qui les tiennent.
//
//   LE SEUIL DE L'ANCHE N'ÉTAIT PAS CELUI QUI ÉTAIT ANNONCÉ, ET LA VALEUR ANNONCÉE ÉTAIT FAUSSE.
//   La notice de « Pression » disait : « Sous 40 %, l'anche de la clarinette ne s'établit pas. » Le
//   nœud, lui, annonçait « 1 note(s) » dès 4 %, et le bruit de souffle, normalisé à 0,9 de crête
//   comme le serait une note, sortait PLUS FORT que la note établie : 0,85 de valeur efficace à
//   40 % de pression contre 0,53 à 100 %. `parle` ne demandait que s'il sortait du signal, et le
//   souffle en donne ; la constante qui porte le seuil, `SEUILS` de `audio/guides-onde.ts`, n'était
//   importée par rien d'autre que son propre test. La brancher ne suffisait pas : mesuré sur sept
//   notes de 82 à 587 Hz, le premier harmonique vaut un millième de son niveau établi jusqu'à 50 %
//   de pression et la transition ne s'achève qu'à 65 %. Les 40 % tombaient en plein régime de
//   souffle, et s'en contenter aurait laissé le défaut sur vingt-cinq points de réglage. Le seuil
//   est maintenant 0,65, ce que le nœud rend en dessous est le silence qu'il annonce, et TROIS cas
//   le tiennent : deux qui interrogent la table plutôt que de recopier un nombre, et un troisième
//   qui ne passe pas par elle du tout — il balaie la pression et exige de tout rendu déclaré
//   parlant qu'il porte vraiment la note. Sans ce dernier, les deux premiers ne vérifieraient que
//   l'égalité du seuil avec lui-même, et une valeur fausse repasserait.
//
//   PUIS LE RÉGLAGE A ÉTÉ RAMENÉ SUR LA PLAGE UTILE, parce qu'un seuil à 65 % laissait les deux
//   tiers bas du curseur ne rien produire et écrasait tout le timbre de la clarinette sur le
//   dernier tiers, alors qu'il y change : à 220 Hz, le centre de gravité du spectre descend de
//   1234 à 968 Hz entre le seuil et la pleine pression. `PLANCHERS` dit où commence le réglage de
//   chaque modèle : au seuil pour la clarinette, à 0,85 pour la flûte, à zéro pour le cuivre dont
//   la plage utile est large. Conséquence à dire plutôt qu'à taire, LE REFUS DE PARLER NE S'ENTEND
//   PLUS QUE SUR LE CUIVRE. Le modèle refuse toujours ; c'est l'échelle du réglage qui ne descend
//   plus jusque-là. Les cas de mutisme ont donc migré sur lui, ici comme dans la batterie sœur et
//   dans `audio/guides-onde.test.ts`.
//
//   LE VENT N'AVAIT PAS DE DYNAMIQUE. Son exécuteur écrivait pour la vélocité une pression par note,
//   `pression × (0,6 + 0,4 × vélocité / 127)`, et `synthetiserVent` normalisait chaque note à 0,9 de
//   crête : l'écart arrivait au mélange réduit à trois millièmes — 0,7174 de crête à vélocité 127
//   contre 0,7193 à vélocité 1, la plus faible sortant même imperceptiblement plus fort. C'était
//   l'algèbre déjà rencontrée sur « Force » du scanning, et la règle que `versBuffer` énonce : un
//   modèle ne normalise pas, le mélange se normalise une fois. `ConfigVent` porte maintenant un
//   `niveau`, la normalisation vise `0,9 × niveau`, et la fiche y passe la même nuance que la
//   pression. Les deux souffles d'une séquence ne se chevauchant pas, le rapport de leurs crêtes
//   vaut exactement celui des nuances, ce que le cas de la batterie sœur vérifie à quatre
//   décimales. Et une note soufflée sous le seuil n'est plus mêlée du tout : le compte annoncé, le
//   message et le son disent désormais la même chose.
//
//   « SANS EFFET SUR LES AUTRES INSTRUMENTS » ÉTAIT FAUX DU TRÉMOLO : l'enveloppe est appliquée à
//   tous les instruments, et l'écart entre trémolo nul et trémolo plein vaut 0,177 sur un marimba et
//   0,307 sur une cloche. Le code était le bon — rien ne gagnerait à interdire l'essai que la notice
//   invitait à faire dans la même phrase —, c'est la documentation qui disait le contraire de lui, et
//   c'est elle qui a changé. Le cas ci-dessous constate que le trémolo agit partout.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Note } from "../audio/note";
import { BARRES } from "../audio/barre-modale";
import { SECOUEURS } from "../audio/phisem";
import { SEUILS } from "../audio/guides-onde";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";
import { fiches } from "./modeles-physiques";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));
const jouer = async (id: string, reglages: Record<string, number | string> = {}, entrees: unknown[] = [null]) =>
  (await lancer(id, entrees, reglages)).valeurs[0] as AudioBuffer;
const midi = (notes: Note[]) => notesVersFichierMidi(notes, 120);

/** Les nombres d'un message, dans l'ordre où il les écrit. */
const chiffres = (message: unknown): number[] =>
  (String(message).match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/**
 * L'énergie dans une bande autour d'une fréquence, prise au tiers du son.
 *
 * Une bande et non une raie : un mode amorti n'est pas une sinusoïde pure, et le chercher à la
 * fréquence exacte le manque d'autant plus que sa décroissance est rapide.
 */
function bande(b: AudioBuffer, centre: number, largeur = 0.06): number {
  const d = b.getChannelData(0);
  const depart = Math.max(0, Math.min(Math.floor(d.length / 3), d.length - 16384));
  const n = Math.min(16384, d.length - depart);
  let total = 0;
  for (let f = Math.ceil(centre * (1 - largeur)); f <= centre * (1 + largeur); f += 2) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * f * i) / b.sampleRate;
      re += d[depart + i] * Math.cos(a);
      im -= d[depart + i] * Math.sin(a);
    }
    total += (re * re + im * im) / (n * n);
  }
  return total;
}

/** L'amplitude d'un harmonique dans la fenêtre qui suit un instant donné. */
function harmonique(b: AudioBuffer, f: number, depuis: number): number {
  const d = b.getChannelData(0);
  const depart = Math.floor(depuis * b.sampleRate);
  const n = Math.min(8192, d.length - depart);
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * f * i) / b.sampleRate;
    re += d[depart + i] * Math.cos(a);
    im -= d[depart + i] * Math.sin(a);
  }
  return Math.hypot(re, im) / n;
}

function creteEntre(b: AudioBuffer, debut: number, fin: number): number {
  const d = b.getChannelData(0);
  const a = Math.max(0, Math.floor(debut * b.sampleRate));
  const z = Math.min(d.length, Math.floor(fin * b.sampleRate));
  let m = 0;
  for (let i = a; i < z; i++) m = Math.max(m, Math.abs(d[i]));
  return m;
}
const crete = (b: AudioBuffer) => creteEntre(b, 0, b.duration);

/** Dernier instant où le signal dépasse un millième. */
function dernierSon(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let i = d.length - 1;
  while (i > 0 && Math.abs(d[i]) <= 1e-3) i--;
  return i / b.sampleRate;
}

const identiques = (a: AudioBuffer, b: AudioBuffer): boolean => {
  if (a.length !== b.length) return false;
  const x = a.getChannelData(0), y = b.getChannelData(0);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};
function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  const x = a.getChannelData(0), y = b.getChannelData(0);
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  return m;
}

const C4 = 261.6256, C5 = 523.2511, A3 = 220, A4 = 440;

describe("secoueurs", () => {
  it("joue sans rien de branché, et rend un stéréo de la durée demandée", async () => {
    const b = await jouer("secoueurs", { "Durée": 1.5 });
    expect(b.numberOfChannels).toBe(2);
    expect(b.duration).toBeCloseTo(1.5, 3);
  });

  it("annonce les secousses, puis les collisions, puis la graine — à ce rang", async () => {
    const r = await lancer("secoueurs", [null], { "Durée": 2, "Secousses": 16, "Graine": 7 });
    const [secousses, collisions, graine] = chiffres(r.message);
    expect(secousses).toBe(32); // seize par seconde pendant deux secondes
    expect(collisions).toBeGreaterThan(secousses);
    expect(graine).toBe(7);
  });

  it("place une secousse par intervalle demandé, et pas une de plus", async () => {
    const compte = async (parSeconde: number) =>
      chiffres((await lancer("secoueurs", [null], { "Durée": 2, "Secousses": parSeconde, "Graine": 7 })).message)[0];
    expect(await compte(0.5)).toBe(1);
    expect(await compte(4)).toBe(8);
    expect(await compte(16)).toBe(32);
  });

  it("densifie le grain quand on monte l'énergie, et ne produit rien sans énergie", async () => {
    const collisions = async (energie: number) =>
      chiffres((await lancer("secoueurs", [null], { "Durée": 2, "Énergie": energie, "Graine": 7 })).message)[1];
    const compte = [await collisions(0), await collisions(10), await collisions(50), await collisions(100)];
    for (let i = 1; i < compte.length; i++) {
      expect(compte[i], `énergie ${i}`).toBeGreaterThan(compte[i - 1]);
    }
    expect(compte[0]).toBe(0);
    expect(crete(await jouer("secoueurs", { "Durée": 2, "Énergie": 0, "Graine": 7 }))).toBe(0);
  });

  it("prend le nombre de particules de l'instrument quand le réglage est à zéro", async () => {
    // La maraca en a vingt-cinq : le réglage à 25 doit rendre le même son, bit pour bit.
    const sien = await jouer("secoueurs", { "Durée": 1, "Particules": 0, "Graine": 7 });
    expect(identiques(sien, await jouer("secoueurs", { "Durée": 1, "Particules": 25, "Graine": 7 }))).toBe(true);
    expect(identiques(sien, await jouer("secoueurs", { "Durée": 1, "Particules": 4, "Graine": 7 }))).toBe(false);
    const peu = chiffres((await lancer("secoueurs", [null], { "Durée": 2, "Particules": 4, "Graine": 7 })).message)[1];
    const beaucoup = chiffres((await lancer("secoueurs", [null], { "Durée": 2, "Particules": 512, "Graine": 7 })).message)[1];
    expect(beaucoup).toBeGreaterThan(peu * 10);
  });

  it("lit la ligne de l'instrument demandé : son nombre de particules et ses résonances", async () => {
    const compte = async (instrument: string) =>
      chiffres((await lancer("secoueurs", [null], { "Durée": 1, "Instrument": instrument, "Graine": 7 })).message)[1];
    // Cinq cents billes contre vingt-cinq graines : c'est la table qui le dit, et c'est elle qu'on
    // vérifie être lue.
    expect(await compte("cabasa")).toBeGreaterThan((await compte("maracas")) * 10);
    const maraca = await jouer("secoueurs", { "Durée": 1, "Instrument": "maracas", "Graine": 7 });
    const gouttes = await jouer("secoueurs", { "Durée": 1, "Instrument": "gouttes", "Graine": 7 });
    expect(bande(maraca, 3200)).toBeGreaterThan(bande(maraca, 600) * 100);
    expect(bande(gouttes, 600)).toBeGreaterThan(bande(gouttes, 3200) * 100);
  });

  it("retombe sur le premier secoueur quand on en demande un inconnu", async () => {
    const inconnu = await jouer("secoueurs", { "Durée": 1, "Instrument": "ocarina", "Graine": 7 });
    expect(identiques(inconnu, await jouer("secoueurs", { "Durée": 1, "Instrument": "maracas", "Graine": 7 }))).toBe(true);
  });

  it("tire la graine quand elle est à zéro, l'affiche, et rejoue à graine fixée", async () => {
    const a = await lancer("secoueurs", [null], { "Durée": 0.4, "Graine": 0 });
    const b = await lancer("secoueurs", [null], { "Durée": 0.4, "Graine": 0 });
    expect(chiffres(a.message)[2]).not.toBe(0);
    expect(chiffres(a.message)[2]).not.toBe(chiffres(b.message)[2]);
    expect(identiques(a.valeurs[0] as AudioBuffer, b.valeurs[0] as AudioBuffer)).toBe(false);
    const sept = await jouer("secoueurs", { "Durée": 0.4, "Graine": 7 });
    expect(identiques(sept, await jouer("secoueurs", { "Durée": 0.4, "Graine": 7 }))).toBe(true);
    expect(identiques(sept, await jouer("secoueurs", { "Durée": 0.4, "Graine": 8 }))).toBe(false);
  });

  it("met la crête exactement au volume demandé", async () => {
    for (const volume of [0, 40, 80, 100]) {
      const b = await jouer("secoueurs", { "Durée": 0.5, "Graine": 7, "Volume": volume });
      expect(crete(b), `volume ${volume}`).toBeCloseTo(0.9 * (volume / 100), 6);
    }
  });
});

describe("instrument à vent", () => {
  it("joue sans rien de branché, et rend un stéréo de la durée demandée", async () => {
    const b = await jouer("vent-guide-onde", { "Durée": 1 });
    expect(b.numberOfChannels).toBe(2);
    expect(b.duration).toBeCloseTo(1, 3);
  });

  it("joue la note écrite, et retombe sur le la 3 de la fiche quand elle est illisible", async () => {
    const la = await jouer("vent-guide-onde", { "Durée": 0.8, "Vibrato": 0 });
    expect(bande(la, A3)).toBeGreaterThan(bande(la, C4) * 100);
    const ut = await jouer("vent-guide-onde", { "Durée": 0.8, "Vibrato": 0, "Note": "C4" });
    expect(bande(ut, C4)).toBeGreaterThan(bande(ut, A3) * 100);
    expect(identiques(la, await jouer("vent-guide-onde", { "Durée": 0.8, "Vibrato": 0, "Note": "zzz" }))).toBe(true);
    const aigue = await jouer("vent-guide-onde", { "Durée": 0.8, "Vibrato": 0, "Note": "A4" });
    expect(bande(aigue, A4)).toBeGreaterThan(bande(aigue, A3) * 100);
  });

  it("annonce une note et la durée produite", async () => {
    const r = await lancer("vent-guide-onde", [null], { "Durée": 1.5 });
    expect(chiffres(r.message)).toEqual([1, 1.5]);
  });

  it("se tait sous le seuil du cuivre, et rend le silence qu'il annonce", async () => {
    // LE CUIVRE EST LE SEUL À GARDER L'ÉCHELLE ENTIÈRE, donc le seul chez qui le réglage peut
    // descendre sous le seuil. Sous ce seuil, le modèle produit du bruit de souffle ; normalisé, il
    // sortait au niveau d'une vraie note et même plus fort qu'elle, pendant que le nœud annonçait
    // un échec. Le seuil interrogé est celui de la TABLE : un garde qui recopierait 20 % ne dirait
    // plus rien le jour où la mesure changerait.
    const essai = async (instrument: string, pression: number) => {
      const r = await lancer("vent-guide-onde", [null], { "Durée": 0.5, "Instrument": instrument, "Pression": pression });
      return { message: String(r.message), crete: crete(r.valeurs[0] as AudioBuffer) };
    };
    const sous = await essai("cuivre", SEUILS.cuivre * 100 - 1);
    expect(sous.message).toContain("pas parlé");
    expect(sous.crete).toBe(0);
    const juste = await essai("cuivre", SEUILS.cuivre * 100);
    expect(juste.message).not.toContain("pas parlé");
    expect(juste.crete).toBeGreaterThan(0.1);
    // Les deux autres parlent à tout réglage, leur plage commençant où le modèle est juste.
    for (const instrument of ["clarinette", "flute"]) {
      const bas = await essai(instrument, 0);
      expect(bas.message, instrument).not.toContain("pas parlé");
      expect(bas.crete, instrument).toBeGreaterThan(0.1);
    }
  });

  it("ne se déclare parlant que s'il y a une hauteur à la note demandée", async () => {
    // LE GARDE QUI NE PASSE PAS PAR LA TABLE, et sans lequel les deux précédents ne font que
    // vérifier que le seuil est égal à lui-même : un seuil mal réglé se verrait ici, et nulle part
    // ailleurs. On balaie la pression, et on exige de tout rendu déclaré parlant qu'il porte
    // vraiment la note. La séparation est franche : tant que l'anche ne décolle pas, l'énergie à la
    // note vaut un millième de son niveau établi ; dès qu'elle décolle, elle le vaut presque.
    for (const instrument of ["clarinette", "cuivre"]) {
      const commun = { "Durée": 1.2, "Instrument": instrument, "Vibrato": 0, "Souffle": 0 };
      const etabli = bande(await jouer("vent-guide-onde", { ...commun, "Pression": 100 }), A3);
      for (let pression = 5; pression <= 100; pression += 5) {
        const r = await lancer("vent-guide-onde", [null], { ...commun, "Pression": pression });
        if (String(r.message).includes("pas parlé")) continue;
        expect(bande(r.valeurs[0] as AudioBuffer, A3) / etabli, `${instrument} à ${pression} %`)
          .toBeGreaterThan(0.05);
      }
    }
  });

  it("porte chacun de ses réglages jusqu'au modèle", async () => {
    const base = { "Durée": 0.6 } as const;
    const CAS: [string, Record<string, number | string>][] = [
      ["Instrument", { "Instrument": "cuivre" }],
      ["Pression", { "Pression": 100 }],
      ["Souffle", { "Souffle": 60 }],
      ["Vibrato", { "Vibrato": 90 }],
      ["Attaque", { "Attaque": 0.4 }],
    ];
    const defaut = await jouer("vent-guide-onde", base);
    for (const [nom, change] of CAS) {
      expect(identiques(defaut, await jouer("vent-guide-onde", { ...base, ...change })), nom).toBe(false);
    }
    // La fréquence du vibrato ne peut s'entendre qu'avec du vibrato.
    const lent = await jouer("vent-guide-onde", { ...base, "Vibrato": 90, "Fréquence vibrato": 1 });
    const vif = await jouer("vent-guide-onde", { ...base, "Vibrato": 90, "Fréquence vibrato": 11 });
    expect(identiques(lent, vif)).toBe(false);
  });

  it("met la crête exactement au volume demandé", async () => {
    for (const volume of [0, 40, 100]) {
      const b = await jouer("vent-guide-onde", { "Durée": 0.5, "Volume": volume });
      expect(crete(b), `volume ${volume}`).toBeCloseTo(0.9 * (volume / 100), 6);
    }
  });
});

describe("barre modale", () => {
  it("joue sans rien de branché, et rend un stéréo de la durée demandée", async () => {
    const b = await jouer("barre-modale", { "Durée": 1 });
    expect(b.numberOfChannels).toBe(2);
    expect(b.duration).toBeCloseTo(1, 3);
  });

  it("annonce un coup et le nombre de modes de l'instrument choisi", async () => {
    // Le compte vient de la table : c'est lui qui dit quelle ligne la fiche a lue.
    const modes = async (instrument: string) =>
      chiffres((await lancer("barre-modale", [null], { "Durée": 0.5, "Instrument": instrument })).message);
    expect(await modes("glockenspiel")).toEqual([1, 4]);
    expect(await modes("marimba")).toEqual([1, 3]);
    expect(await modes("cloche")).toEqual([1, 4]);
    expect(await modes("bloc")).toEqual([1, 3]);
  });

  it("lit les rapports de l'instrument demandé : la cloche sonne sur deux, pas sur un", async () => {
    const cloche = await jouer("barre-modale", { "Durée": 2, "Instrument": "cloche" });
    expect(bande(cloche, C4 * 2)).toBeGreaterThan(bande(cloche, C4) * 1000);
    const vibra = await jouer("barre-modale", { "Durée": 2, "Instrument": "vibraphone" });
    expect(bande(vibra, C4)).toBeGreaterThan(bande(vibra, C4 * 2) * 100);
  });

  it("frappe la note écrite, et retombe sur l'ut 4 de la fiche — pas sur le la 3 du vent", async () => {
    const ut4 = await jouer("barre-modale", { "Durée": 1 });
    expect(bande(ut4, C4)).toBeGreaterThan(bande(ut4, C5) * 100);
    const ut5 = await jouer("barre-modale", { "Durée": 1, "Note": "C5" });
    expect(bande(ut5, C5)).toBeGreaterThan(bande(ut5, C4) * 100);
    expect(identiques(ut4, await jouer("barre-modale", { "Durée": 1, "Note": "zzz" }))).toBe(true);
    expect(bande(ut4, C4)).toBeGreaterThan(bande(ut4, A3) * 100);
  });

  it("retombe sur la première barre quand on en demande une inconnue", async () => {
    const inconnue = await jouer("barre-modale", { "Durée": 1, "Instrument": "triangle" });
    expect(identiques(inconnue, await jouer("barre-modale", { "Durée": 1, "Instrument": "glockenspiel" }))).toBe(true);
  });

  it("raccourcit toutes les résonances quand on amortit", async () => {
    const fin = async (amortissement: number) =>
      dernierSon(await jouer("barre-modale", { "Durée": 5, "Amortissement": amortissement }));
    const trois = [await fin(0), await fin(50), await fin(100)];
    for (let i = 1; i < trois.length; i++) expect(trois[i], `amortissement ${i}`).toBeLessThan(trois[i - 1]);
    expect(trois[2]).toBeLessThan(trois[0] / 5);
  });

  it("porte la dureté du maillet et le trémolo jusqu'au modèle", async () => {
    const defaut = await jouer("barre-modale", { "Durée": 1 });
    expect(identiques(defaut, await jouer("barre-modale", { "Durée": 1, "Dureté du maillet": 100 }))).toBe(false);
    // Le trémolo agit sur TOUS les instruments, et non sur le seul vibraphone.
    for (const instrument of ["vibraphone", "marimba", "cloche"]) {
      const sans = await jouer("barre-modale", { "Durée": 2, "Instrument": instrument, "Trémolo": 0 });
      const avec = await jouer("barre-modale", { "Durée": 2, "Instrument": instrument, "Trémolo": 100 });
      expect(ecartMax(sans, avec), instrument).toBeGreaterThan(0.05);
    }
    // Sa fréquence, elle, ne s'entend que si le trémolo est ouvert.
    expect(ecartMax(
      await jouer("barre-modale", { "Durée": 1, "Trémolo": 0, "Fréquence trémolo": 1 }),
      await jouer("barre-modale", { "Durée": 1, "Trémolo": 0, "Fréquence trémolo": 11 }),
    )).toBe(0);
    expect(ecartMax(
      await jouer("barre-modale", { "Durée": 1, "Trémolo": 100, "Fréquence trémolo": 1 }),
      await jouer("barre-modale", { "Durée": 1, "Trémolo": 100, "Fréquence trémolo": 11 }),
    )).toBeGreaterThan(0.05);
  });

  it("ignore une entrée qui n'est pas un fichier MIDI", async () => {
    const r = await lancer("barre-modale", ["ceci n'est pas un fichier"], { "Durée": 0.5 });
    expect(chiffres(r.message)[0]).toBe(1);
  });

  it("met la crête exactement au volume demandé", async () => {
    for (const volume of [0, 40, 100]) {
      const b = await jouer("barre-modale", { "Durée": 0.5, "Volume": volume });
      expect(crete(b), `volume ${volume}`).toBeCloseTo(0.9 * (volume / 100), 6);
    }
  });
});

describe("déclarations", () => {
  const trois = ["secoueurs", "vent-guide-onde", "barre-modale"];

  it("acceptent un MIDI facultatif et rendent un audio", () => {
    for (const id of trois) {
      const f = fiche(id);
      expect(f.entrees.map((e) => [e.type, e.requis]), id).toEqual([["midi", false]]);
      expect(f.sorties.map((s) => s.type), id).toEqual(["audio"]);
    }
  });

  it("nomment chacun de leurs réglages dans leur exécuteur", () => {
    for (const id of trois) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres) {
        expect(source.includes(`"${p.nom}"`), `${id} · ${p.nom}`).toBe(true);
      }
    }
  });

  it("sont traduites, libellés, options et défauts compris", () => {
    for (const id of trois) {
      const f = fiche(id);
      expect(f.nomEn, id).toBeTruthy();
      expect(f.resumeEn, id).toBeTruthy();
      for (const p of f.parametres) {
        expect(p.nomEn, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.doc, `${id} · ${p.nom}`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom}`).toBeTruthy();
        if (p.type !== "choix") continue;
        expect(p.optionsEn?.length, `${id} · ${p.nom}`).toBe(p.options?.length);
        expect(p.optionIds?.length, `${id} · ${p.nom}`).toBe(p.options?.length);
        expect(p.defautEn, `${id} · ${p.nom}`).toBeTruthy();
      }
    }
  });

  it("tirent leurs options de leur table, et non d'une liste recopiée", () => {
    const options = (id: string) => fiche(id).parametres.find((p) => p.nom === "Instrument")?.optionIds;
    expect(options("secoueurs")).toEqual(SECOUEURS.map((s) => s.id));
    expect(options("barre-modale")).toEqual(BARRES.map((b) => b.id));
    // Le vent n'a pas de table : ses trois identifiants sont le type `Vent` lui-même, et une seule
    // lettre fausse ferait prendre la branche du cuivre sans rien dire. Les trois doivent donc
    // rendre trois sons distincts.
    expect(options("vent-guide-onde")).toEqual(["clarinette", "flute", "cuivre"]);
  });

  it("rendent trois vents distincts, un par identifiant déclaré", async () => {
    // Les identifiants sont lus dans la FICHE et non recopiés ici : une coquille dans l'un des trois
    // ferait prendre la branche du cuivre, deux des trois sons se confondraient, et ce cas tomberait.
    const ids = fiche("vent-guide-onde").parametres.find((p) => p.nom === "Instrument")?.optionIds ?? [];
    const sons = await Promise.all(ids.map((instrument) =>
      jouer("vent-guide-onde", { "Durée": 0.4, "Instrument": instrument, "Vibrato": 0 })));
    expect(sons).toHaveLength(3);
    for (let i = 0; i < sons.length; i++) {
      for (let j = i + 1; j < sons.length; j++) {
        expect(identiques(sons[i], sons[j]), `${i} contre ${j}`).toBe(false);
      }
    }
  });

  it("font canoniser le défaut de chaque choix sur l'identifiant que l'exécuteur nomme", () => {
    // LE CHEMIN RÉEL, que le contexte de ces cas court-circuite : la coquille ne transmet pas le
    // libellé déclaré mais son identifiant, par `defautCanoniqueChoix`. L'exécuteur, lui, porte son
    // PROPRE repli en dur. Si les deux désignent des lignes différentes, un nœud dont le réglage
    // n'a jamais été touché joue autre chose que ce que la fiche affiche — sans erreur et sans trace.
    for (const id of trois) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres) {
        if (p.type !== "choix") continue;
        const canonique = String(defautCanoniqueChoix(p));
        expect(p.optionIds, `${id} · ${p.nom}`).toContain(canonique);
        const repli = new RegExp(`paramTexte\\("${p.nom}", "([^"]+)"\\)`).exec(source);
        expect(repli?.[1], `${id} · ${p.nom} · repli de l'exécuteur`).toBe(canonique);
        expect(String(valeurCanoniqueChoix(p, String(p.defautEn))), `${id} · ${p.nom} · défaut anglais`)
          .toBe(canonique);
      }
    }
  });

  it("déclarent la graine du secoueur, et elle seule", () => {
    for (const id of trois) {
      const graines = fiche(id).parametres.filter((p) => p.graine).map((p) => p.nom);
      expect(graines, id).toEqual(id === "secoueurs" ? ["Graine"] : []);
    }
  });
});
