// plugins/banque-sonne-au-degre.test.ts — Ce qu'une touche FAIT ENTENDRE, et non ce qu'on lui demande.
//
// POURQUOI CE GARDE EXISTE, ET CE QU'AUCUN AUTRE NE VOYAIT. Tous les cas écrits autour de « Étaler
// sur le clavier » vérifiaient une DEMANDE : le plan portait-il la bonne hauteur, le transpositeur
// recevait-il le bon nombre de demi-tons, la banque déclarait-elle être accordée. Pas un ne mesurait
// la hauteur du son rendu. Ils étaient tous verts pendant que l'application sonnait faux.
//
// LE DÉFAUT. `preparerBanque` REFAIT le plan de l'autre côté de la frontière du lot : seul le NOMBRE
// de zones y voyage. Le composant calculait donc sa `hauteur` par zone et la jetait, `zoneDuLot`
// lisait `place.hauteur ?? place.racine` sur un plan où `hauteur` était toujours absente, et chaque
// échantillon sonnait à la hauteur TEMPÉRÉE de sa racine pendant que le désaccord de chaque touche
// se comptait depuis la hauteur de son DEGRÉ.
//
// MESURÉ AU HAUT-PARLEUR, dans l'application, sur l'exemple microtonal : zéro cent sur la zone de la
// tonique, puis +58, −13, +26, +34, +42 et +130 cents — plus d'un demi-ton — chaque palier valant
// exactement `racine − hauteurDuDegre(racine)`, constant à l'intérieur d'une zone et sautant à
// chaque frontière. C'est le motif qu'un écart de plan produit, et c'est lui qu'on mesure ici.
//
// L'INSTRUMENT EST UNE SINUSOÏDE, et il le faut : la hauteur d'un son inharmonique ne se mesure pas,
// et un timbre de cloche a fait sauter mes premiers relevés d'un partiel à l'autre. Une sinusoïde se
// compte à ses passages par zéro, au centième de cent près, et la transposition « bande » n'est
// qu'un rééchantillonnage, qui d'une sinusoïde fait une sinusoïde.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { accordageDepuisCents, hauteurDuDegre } from "../audio/accordage";
import { nomNote } from "../audio/nom-note";
import { hauteurJouee, parametresLecture, rendreNotes, voixPourNote, type Banque } from "../audio/clavier-banque";
import { preparerBanque, zoneDuLot, type OptionsLotBanque } from "../audio/clavier-banque-lot";

const SR = 44100;
const TONIQUE = 60;
const HZ_SOURCE = 261.6256; // do4, la hauteur déclarée de la source : MIDI 60 exactement.

/**
 * L'étendue couverte, et pourquoi elle dépasse une période.
 *
 * UN PREMIER JET S'ARRÊTAIT À LA TOUCHE 72, soit les degrés −5 à 12 : une seule période, et le
 * défaut y culminait à 58 cents. Or l'écart mesuré dans l'application valait **130 cents** sur la
 * touche 88, deux périodes plus haut, le palier d'une zone grandissant à chaque tour. Un garde qui
 * ne sort pas de la première période mesure la plus petite moitié du défaut. De 48 à 90 : neuf
 * racines de zone, trois périodes, et les degrés négatifs.
 */
const BASSE = 48, HAUTE = 90;

/**
 * L'échelle d'une cloche, relevée par « Courbe de dissonance » sur l'exemple microtonal.
 *
 * INÉGALE ET SANS OCTAVE, les deux à la fois : treize degrés dont aucun ne tombe sur un demi-ton
 * tempéré, et une période de 1282 cents. Un accordage égal à douze degrés ne prouverait rien, la
 * hauteur d'un degré y étant celle de sa touche.
 */
const CLOCHE = accordageDepuisCents(
  [0, 137, 192, 241, 306, 442, 547, 684, 815, 935, 1013, 1127, 1176], 1282, TONIQUE,
);

/** Une sinusoïde d'une seconde, à la hauteur déclarée de la source. */
function sinus(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * HZ_SOURCE * i) / SR);
  return b;
}

/**
 * La fréquence d'une sinusoïde, par ses passages par zéro montants.
 *
 * On écarte les bords : un rééchantillonnage laisse un demi-échantillon flou à chaque bout, et le
 * suivi de touche pose un fondu de sortie. Le compte entre le premier et le dernier passage retenus
 * donne la période moyenne sur des centaines de tours, donc une précision bien inférieure au cent.
 */
function frequence(audio: AudioBuffer): number {
  const d = audio.getChannelData(0);
  // LE SILENCE S'ÉCARTE AVANT TOUT, ET MON PREMIER JET NE LE FAISAIT PAS. Un tampon rendu se
  // termine par du silence, et au raccord `d[i-1] < 0 && d[i] >= 0` est VRAI sur le premier zéro :
  // un passage fantôme s'ajoute, qui surestimait la fréquence de deux à quatre cents. La preuve que
  // l'instrument était en cause et non le code : la touche 60, dont le rapport de lecture vaut
  // exactement un — aucun écart n'y est possible —, annonçait +1,46 cent.
  let a = 0; while (a < d.length && Math.abs(d[a]) < 1e-4) a++;
  let b = d.length - 1; while (b > a && Math.abs(d[b]) < 1e-4) b--;
  const marge = Math.floor((b - a) * 0.1);
  let premier = -1, dernier = -1, tours = 0;
  for (let i = a + marge + 1; i <= b - marge; i++) {
    if (d[i - 1] < 0 && d[i] >= 0) {
      const t = i - 1 + -d[i - 1] / (d[i] - d[i - 1]);
      if (premier < 0) premier = t;
      else { dernier = t; tours++; }
    }
  }
  if (tours < 50) throw new Error(`sinusoïde illisible : ${tours} tours`);
  return (tours * audio.sampleRate) / (dernier - premier);
}

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * L'inverse de `nomNote`, pour RELIRE ce qui s'écrit : « E4+42 » rend 64,42.
 *
 * Un nom qui ne se relit pas n'est pas un nom, c'est une décoration. Le signe moins de `nomNote`
 * est le vrai moins typographique, U+2212, et non le trait d'union : un parseur qui n'attendrait que
 * le second lirait toutes les hauteurs basses comme des hauteurs justes.
 */
function hauteurDuNom(nom: string): number {
  const m = /^([A-G]#?)(-?\d+)(?:(\+|−)(\d+))?$/.exec(nom);
  if (!m) throw new Error(`nom illisible : ${nom}`);
  let h = NOMS.indexOf(m[1]) + (Number(m[2]) + 1) * 12;
  if (m[3]) h += ((m[3] === "+" ? 1 : -1) * Number(m[4])) / 100;
  return h;
}

/** La hauteur MIDI que la banque FAIT ENTENDRE sur une touche, mesurée sur son tampon. */
function hauteurEntendue(banque: Banque, touche: number): number {
  const voix = voixPourNote(banque, touche);
  if (!voix) throw new Error(`aucune zone pour la touche ${touche}`);
  const p = parametresLecture(voix);
  return 69 + 12 * Math.log2((frequence(p.audio) * p.vitesse) / 440);
}

const REGLAGES = {
  "Compter en": "degres", "Note d'origine": "manuel", "Note manuelle": TONIQUE,
  "Largeur de zone": 2, "Note basse": BASSE, "Note haute": HAUTE,
  // « bande » est un rééchantillonnage pur, et « suivi de touche » à zéro garde le tampon entier :
  // ce qu'on mesure est alors la hauteur, et rien d'autre.
  "Transposition": "bande", "Suivi de touche": 0, "Boucle de maintien": "non",
};

/** Le contexte d'exécution de la fiche. */
function ctx(params: Record<string, string | number>) {
  const entrees: unknown[] = [sinus(), CLOCHE];
  return {
    entree: (rang: number) => entrees[rang] ?? null,
    entrees: () => entrees,
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
  } as never;
}

async function banqueDeLaFiche(params: Record<string, string | number>): Promise<Banque> {
  const f = registre.trouverDef("banque-clavier")!;
  const res = await f.executer(ctx(params)) as never as
    { valeurs: unknown[]; erreur?: boolean; message?: string };
  expect(res.erreur, res.message).toBeFalsy();
  return res.valeurs[0] as Banque;
}

describe("une touche sonne à la hauteur de son degré, mesurée au tampon", () => {
  it("LA FICHE, DE BOUT EN BOUT : les quarante-trois touches sonnent juste, à moins d'un cent", async () => {
    const b = await banqueDeLaFiche(REGLAGES);
    const ecarts: string[] = [];
    for (let touche = BASSE; touche <= HAUTE; touche++) {
      const attendue = hauteurDuDegre(CLOCHE, touche - TONIQUE);
      const cents = (hauteurEntendue(b, touche) - attendue) * 100;
      if (Math.abs(cents) > 1) ecarts.push(`touche ${touche} : ${cents.toFixed(1)} cents`);
    }
    expect(ecarts, "ce que le haut-parleur dit, et non ce que le plan demande").toEqual([]);
  });

  it("et l'échelle mesurée n'est pas le clavier tempéré, sans quoi rien ne serait prouvé", async () => {
    const b = await banqueDeLaFiche(REGLAGES);
    const ecarts: number[] = [];
    for (let touche = BASSE; touche <= HAUTE; touche++) {
      ecarts.push(Math.abs(hauteurEntendue(b, touche) - touche));
    }
    // TRENTE-HUIT DES QUARANTE-TROIS, et non quarante-deux comme je l'avais d'abord écrit : la
    // tonique tombe sur son demi-ton, et quatre degrés en frôlent un par coïncidence — le degré 22,
    // à 2097 cents, passe à trois cents du si bémol 4. Le compte seul serait donc fragile ; c'est
    // l'écart MAXIMAL qui fait le témoin, et il dépasse un tiers de demi-ton.
    expect(ecarts.filter((e) => e > 0.05).length, "une échelle tempérée ne prouverait rien")
      .toBeGreaterThan(35);
    expect(Math.max(...ecarts), "et l'échelle s'écarte franchement, pas d'un cheveu")
      .toBeGreaterThan(0.4);
  });

  it("LE RENDU HORS LIGNE sonne comme le jeu en direct, et non seulement comme lui", async () => {
    // DEUX CHEMINS PARTENT DE LA MÊME BANQUE : la vue joue une voix par `createBufferSource`, et
    // `rendreNotes` la rééchantillonne lui-même vers un tampon, en recevant EN PLUS un taux de
    // sortie. Ce dépôt a déjà payé un rééchantillonnage silencieux ; celui-là se mesure.
    const b = await banqueDeLaFiche(REGLAGES);
    const ecarts: string[] = [];
    for (let touche = BASSE; touche <= HAUTE; touche++) {
      const rendu = rendreNotes([{ note: touche, velocite: 100, debut: 0, fin: 0.5 }], b, { volume: 0.8 });
      const attendue = hauteurDuDegre(CLOCHE, touche - TONIQUE);
      const hz = frequence(rendu);
      const cents = (69 + 12 * Math.log2(hz / 440) - attendue) * 100;
      if (Math.abs(cents) > 1) ecarts.push(`touche ${touche} : ${hz.toFixed(2)} Hz, ${cents.toFixed(2)} cents`);
    }
    expect(ecarts).toEqual([]);
  });

  it("CE QUE LA BANQUE ANNONCE JOUER est ce qu'elle joue, et c'est de là que vient le nom écrit", async () => {
    // `hauteurJouee` est la SOURCE DU NOM que « Clavier SFZ » écrit sur une touche. Si elle se
    // trompait, le clavier écrirait un nom faux sans que rien ne sonne de travers : le défaut
    // serait invisible à toute mesure acoustique. On la confronte donc au tampon, touche par
    // touche, et le nom lui-même se relit pour vérifier qu'il n'a rien perdu en s'écrivant.
    const b = await banqueDeLaFiche(REGLAGES);
    for (let touche = BASSE; touche <= HAUTE; touche++) {
      const annoncee = hauteurJouee(b, touche);
      expect(annoncee, `touche ${touche}`).not.toBeNull();
      expect(Math.abs(annoncee! - hauteurEntendue(b, touche)) * 100, `touche ${touche}`)
        .toBeLessThan(1);
      // Le nom arrondit au cent : relu, il doit retomber sur la hauteur à un demi-cent près.
      expect(Math.abs(hauteurDuNom(nomNote(annoncee!)) - annoncee!) * 100, nomNote(annoncee!))
        .toBeLessThanOrEqual(0.5);
    }
  });

  it("EN DEMI-TONS, la même mesure rend la touche elle-même", async () => {
    const b = await banqueDeLaFiche({ ...REGLAGES, "Compter en": "demi-tons" });
    for (let touche = BASSE; touche <= HAUTE; touche++) {
      expect(Math.abs(hauteurEntendue(b, touche) - touche) * 100, `touche ${touche}`)
        .toBeLessThan(1);
    }
  });

  // ─── Ce qui arrivait avant, mesuré plutôt qu'affirmé ───
  it("UN ACCORDAGE QUI NE FRANCHIT PAS LA FRONTIÈRE DU LOT décale toute la zone", () => {
    const voies = [sinus().getChannelData(0).slice()];
    const base: OptionsLotBanque = {
      voies, frequence: SR, methode: "bande", racineSource: TONIQUE,
      noteBasse: BASSE, noteHaute: HAUTE, largeur: 2, suiviTouche: 0,
      boucle: false, boucleDebut: 0.5, boucleLongueur: 2,
    };
    // La racine 65 porte le degré 5, à 442 cents : son échantillon doit sonner à 64,42.
    const attendue = hauteurDuDegre(CLOCHE, 5);
    expect(attendue).toBeCloseTo(TONIQUE + 4.42, 6);

    const hauteurDe = (o: OptionsLotBanque): number => {
      const p = preparerBanque(o);
      const i = p.plan.findIndex((z) => z.racine === 65);
      expect(i, "le plan couvre bien la racine 65").toBeGreaterThanOrEqual(0);
      const z = zoneDuLot(i, o, p);
      const audio = new AudioBuffer({ numberOfChannels: 1, length: z.voies[0].length, sampleRate: SR });
      audio.copyToChannel(new Float32Array(z.voies[0]), 0);
      return 69 + 12 * Math.log2(frequence(audio) / 440);
    };

    const avec = hauteurDe({ ...base, accordage: CLOCHE, toniqueTouche: TONIQUE });
    expect(Math.abs(avec - attendue) * 100, "l'accordage transmis, l'échantillon est au degré")
      .toBeLessThan(1);

    // Sans lui, l'échantillon reste à la racine TEMPÉRÉE, et l'écart est celui qu'on a entendu.
    const sans = hauteurDe(base);
    expect(Math.abs(sans - attendue) * 100).toBeGreaterThan(50);
    expect(sans).toBeCloseTo(65, 2);
  });
});
