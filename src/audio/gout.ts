// audio/gout.ts — Les cinq dimensions par lesquelles un son se rapproche d'un goût.
//
// D'OÙ CELA VIENT. Mesz, Trevisan et Sigman (« The Taste of Music », Perception 40, 2011) ont fait
// improviser des musiciens sur les quatre mots de goût, puis ont placé chaque improvisation dans un
// espace à cinq dimensions — hauteur, intensité, durée, articulation et consonance (gradus
// suavitatis d'Euler). Les régions y sont assez distinctes pour qu'un classifieur retrouve le mot à
// partir de la mélodie huit fois sur dix. Leur algorithme de composition (Frontiers in Human
// Neuroscience 6, 2012) ne vise pas des valeurs absolues mais LA RÉGION de chaque goût.
//
// Ce que la littérature dit de chaque goût, et que les régions ci-dessous traduisent :
//   sucré  — consonant, lent, doux, lié ;
//   acide  — aigu, dissonant, rapide ;
//   amer   — grave, lié, un peu dissonant ;
//   salé   — piqué, des silences entre les notes.
// S'y ajoutent, pour la hauteur et le timbre, Crisinel et Spence (2010) : aigu pour le sucré et
// l'acide, grave pour l'amer et l'umami.
//
// CE QUE CE FICHIER NE PRÉTEND PAS ÊTRE. Les auteurs n'ont pas publié les moyennes et écarts-types
// de leurs régions : celles d'ici sont notre lecture, chiffrée, de leurs descriptions — une
// hypothèse explicite, qu'on peut relire et corriger, et non une mesure reprise d'un article. Et
// aucune mesure de ce fichier ne change le goût de quoi que ce soit : elle situe un son dans un
// espace de correspondances, ce qui est déjà beaucoup et n'est que cela.

import { creerFenetreHann, tramesDepuisBuffer } from "./commun";
import { partielsDepuisModules, dissonanceSpectre } from "./dissonance";
import { suivreHauteur, hauteurMediane, partVoisee } from "./hauteur";

/** Les cinq dimensions, ramenées à [0, 1] — 0 pour un extrême, 1 pour l'autre. */
export interface DimensionsGout {
  /**
   * Où se tient le son : 0 pour très grave (55 Hz), 1 pour très aigu (1760 Hz), en octaves.
   *
   * C'EST LE REGISTRE, ET NON LA FONDAMENTALE. Un accord de do majeur — 262, 330, 392 Hz — a pour
   * période commune 65 Hz, et un détecteur de périodicité y entend donc 65 Hz : c'est juste, et
   * c'est la fondamentale absente. Mais ce n'est pas là que l'accord SONNE, et le prendre pour le
   * registre rangeait un accord clair et doux du côté de l'amer. On mesure donc la fréquence
   * médiane de l'énergie, qui dit où le son se tient quoi qu'il contienne.
   */
  hauteur: number;
  /** 0 : piqué, des silences entre les notes ; 1 : lié, le son ne s'interrompt jamais. */
  articulation: number;
  /** 0 : lent, une attaque toutes les deux secondes ; 1 : rapide, huit par seconde. */
  vitesse: number;
  /** 0 : rugueux ; 1 : consonant. */
  consonance: number;
  /** 0 : doux (−40 dB) ; 1 : fort (0 dB). */
  intensite: number;
}

export type Gout = "sucré" | "acide" | "amer" | "salé";

/**
 * Les quatre régions, dans ce même espace.
 *
 * Une dimension absente de la description publiée d'un goût prend 0,5 : c'est dire qu'elle ne
 * décide de rien pour ce goût-là, et le poids ci-dessous lui retire son influence.
 */
export const REGIONS: Record<Gout, DimensionsGout> = {
  // Consonant, lent, doux, lié.
  "sucré": { hauteur: 0.6, articulation: 0.85, vitesse: 0.2, consonance: 0.9, intensite: 0.3 },
  // Aigu, dissonant, rapide.
  "acide": { hauteur: 0.9, articulation: 0.5, vitesse: 0.85, consonance: 0.15, intensite: 0.6 },
  // Grave, lié, à peine moins consonant que le sucré. « Un peu dissonant » est tout ce que la
  // littérature dit de l'amer sur cet axe : lui donner 0,4 en faisait un son rugueux, et un
  // bourdon grave et lisse — l'amer même — se retrouvait rangé du côté du sucré.
  "amer": { hauteur: 0.1, articulation: 0.8, vitesse: 0.35, consonance: 0.55, intensite: 0.5 },
  // Piqué, des silences entre les notes.
  "salé": { hauteur: 0.55, articulation: 0.1, vitesse: 0.7, consonance: 0.55, intensite: 0.6 },
};

/**
 * Ce qui compte pour chaque goût, dimension par dimension.
 *
 * Sans ces poids, une dimension dont la littérature ne dit rien — l'intensité du salé — pèserait
 * autant que celle qui définit le goût — son articulation piquée —, et deux sons éloignés sur la
 * seule dimension qui compte se retrouveraient à égale distance de la région.
 */
export const POIDS: Record<Gout, DimensionsGout> = {
  "sucré": { hauteur: 1, articulation: 1, vitesse: 1, consonance: 1.5, intensite: 1 },
  "acide": { hauteur: 1.5, articulation: 0.5, vitesse: 1, consonance: 1.5, intensite: 0.5 },
  "amer": { hauteur: 2, articulation: 1, vitesse: 0.5, consonance: 0.5, intensite: 0.5 },
  "salé": { hauteur: 0.5, articulation: 2, vitesse: 1, consonance: 0.5, intensite: 0.5 },
};

const DIMENSIONS: (keyof DimensionsGout)[] = ["hauteur", "articulation", "vitesse", "consonance", "intensite"];

const borner = (x: number) => Math.max(0, Math.min(1, x));

/** Les valeurs brutes, avant normalisation : c'est ce qu'on montre à qui veut vérifier. */
export interface MesuresGout {
  dimensions: DimensionsGout;
  /** Hauteur médiane des trames voisées, en hertz. 0 si le son n'a pas de hauteur. */
  hertz: number;
  /** Part des trames qui ont une hauteur : sous 10 %, la hauteur détectée ne veut rien dire. */
  partVoisee: number;
  /** Fréquence médiane de l'énergie, en hertz : le registre, d'où sort la dimension « hauteur ». */
  registre: number;
  /** Attaques par seconde. */
  attaques: number;
  /** Part du temps où le son est audible, au-dessus de −35 dB de sa crête. */
  duree: number;
  /** Rugosité moyenne, normalisée par l'énergie des partiels. */
  rugosite: number;
  /** Niveau efficace, en dB pleine échelle. */
  db: number;
}

/**
 * Mesure les cinq dimensions d'un son.
 *
 * L'articulation se lit sur l'ENVELOPPE et non sur les attaques : ce qui sépare un jeu lié d'un jeu
 * piqué n'est pas le nombre de notes mais le silence entre elles. On mesure donc la part du temps
 * passée au-dessus d'un seuil rapporté à la crête — un trémolo continu reste lié, une série de
 * clics ne l'est pas, quel que soit leur nombre.
 */
export function mesurer(buffer: AudioBuffer): MesuresGout {
  const n = buffer.length;
  const sr = buffer.sampleRate;
  const x = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += d[i] / buffer.numberOfChannels;
  }

  // ── Enveloppe, par fenêtres de 10 ms ──
  const pas = Math.max(1, Math.round(sr * 0.01));
  const env: number[] = [];
  for (let i = 0; i + pas <= n; i += pas) {
    let s = 0;
    for (let k = i; k < i + pas; k++) s += x[k] * x[k];
    env.push(Math.sqrt(s / pas));
  }
  const crete = env.reduce((m, v) => Math.max(m, v), 0);
  const seuil = crete * Math.pow(10, -35 / 20);
  const audibles = env.filter((v) => v > seuil).length;
  const duree = env.length ? audibles / env.length : 0;

  // UNE ATTAQUE EST UNE MONTÉE FRANCHE, et se compare à ce qui précède, pas à la seule fenêtre
  // d'avant. Le battement de deux partiels voisins fait onduler l'enveloppe d'une fenêtre à
  // l'autre : compté comme attaque, un accord tenu passait pour quatre attaques par seconde, donc
  // pour un son rapide. On exige donc une montée au-dessus de la moyenne des cinq fenêtres
  // précédentes, un niveau qui compte vraiment, et un temps mort de 60 ms après chaque attaque —
  // deux notes plus rapprochées que cela ne s'entendent plus comme deux attaques.
  const mort = Math.max(1, Math.round(0.06 / 0.01));
  let attaques = 0, derniere = -mort;
  for (let i = 5; i < env.length; i++) {
    if (i - derniere < mort) continue;
    const fond = (env[i - 5] + env[i - 4] + env[i - 3] + env[i - 2] + env[i - 1]) / 5;
    const franche = env[i] > Math.max(fond * 1.8, crete * 0.1);
    if (franche && env[i] > seuil) { attaques++; derniere = i; }
  }
  const secondes = n / sr;
  const parSeconde = secondes > 0 ? attaques / secondes : 0;

  // ── Niveau efficace ──
  let somme = 0;
  for (let i = 0; i < n; i++) somme += x[i] * x[i];
  const rms = Math.sqrt(somme / Math.max(1, n));
  const db = rms > 0 ? 20 * Math.log10(rms) : -120;

  // ── Hauteur ──
  const suivi = suivreHauteur(x, sr, { cadence: 50 });
  const hertz = hauteurMediane(suivi);
  const voisee = partVoisee(suivi);

  // ── Rugosité et registre, sur la même analyse ──
  const taille = 2048;
  const trames = tramesDepuisBuffer(x, taille, taille / 2, creerFenetreHann(taille));
  let rugosite = 0, comptees = 0;
  const spectre = new Float64Array(taille / 2);
  for (const t of trames) {
    const modules = new Float64Array(taille / 2);
    for (let i = 0; i < taille / 2; i++) {
      modules[i] = Math.hypot(t.re[i], t.im[i]);
      spectre[i] += modules[i] * modules[i];
    }
    const partiels = partielsDepuisModules(modules, sr, taille, 12);
    if (partiels.length < 2) continue;
    const energie = partiels.reduce((s, p) => s + p.amplitude * p.amplitude, 0);
    if (energie <= 0) continue;
    rugosite += dissonanceSpectre(partiels) / energie;
    comptees++;
  }
  if (comptees) rugosite /= comptees;

  // La fréquence médiane de l'énergie : la moitié de l'énergie est en dessous, la moitié au-dessus.
  // La MÉDIANE et non le centre de gravité : un rien de souffle dans l'aigu tire un centre de
  // gravité vers le haut, alors qu'il ne déplace pas ce qu'on entend.
  let total = 0;
  for (let i = 1; i < spectre.length; i++) total += spectre[i];
  let cumul = 0, registre = 0;
  for (let i = 1; i < spectre.length && total > 0; i++) {
    cumul += spectre[i];
    if (cumul >= total / 2) { registre = (i * sr) / taille; break; }
  }

  // ── Normalisation ──
  // Le registre se parcourt en octaves : de 55 à 1760 Hz, cinq octaves, l'étendue d'un piano sans
  // ses extrêmes. Un son sans énergie mesurable ne décide de rien : la dimension vaut 0,5.
  const hauteur = registre > 0 ? borner(Math.log2(registre / 55) / 5) : 0.5;
  // La rugosité utile va de 0 à 0,35 : au-delà, tout est déjà franchement rugueux.
  const consonance = borner(1 - rugosite / 0.35);
  // De deux secondes entre deux attaques à huit attaques par seconde, en logarithme : c'est ainsi
  // qu'on entend le tempo — le pas de 1 à 2 attaques vaut celui de 4 à 8.
  const vitesse = parSeconde <= 0 ? 0 : borner((Math.log2(parSeconde) + 1) / 4);

  return {
    dimensions: {
      hauteur,
      articulation: borner(duree),
      vitesse,
      consonance,
      intensite: borner((db + 40) / 40),
    },
    hertz, partVoisee: voisee, registre, attaques: parSeconde, duree, rugosite, db,
  };
}

export interface PartGout { gout: Gout; part: number; distance: number }

/**
 * La part de chaque goût, d'après la distance aux quatre régions.
 *
 * Les parts se répartissent par l'INVERSE des distances, au carré : deux régions également proches
 * se partagent le son, et une région deux fois plus proche qu'une autre l'emporte quatre fois. Un
 * son ne « se classe » donc jamais tout à fait — ce qui est fidèle à ce que la littérature montre,
 * des correspondances graduelles et non des catégories.
 */
export function profil(d: DimensionsGout): PartGout[] {
  const distances = (Object.keys(REGIONS) as Gout[]).map((gout) => {
    const region = REGIONS[gout], poids = POIDS[gout];
    let somme = 0, total = 0;
    for (const dim of DIMENSIONS) {
      const w = poids[dim];
      somme += w * (d[dim] - region[dim]) ** 2;
      total += w;
    }
    return { gout, distance: Math.sqrt(somme / total) };
  });
  const poidsInverse = distances.map((x) => 1 / Math.max(0.05, x.distance) ** 2);
  const total = poidsInverse.reduce((s, v) => s + v, 0);
  return distances
    .map((x, i) => ({ ...x, part: poidsInverse[i] / total }))
    .sort((a, b) => b.part - a.part);
}

/** Le rapport lisible : les parts, puis ce qui les a produites. */
export function rapport(m: MesuresGout, parts: PartGout[], anglais = false): string {
  const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
  const pc = (x: number) => `${Math.round(x * 100)} %`;
  const noms: Record<Gout, string> = anglais
    ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" }
    : { "sucré": "sucré", "acide": "acide", "amer": "amer", "salé": "salé" };
  const d = m.dimensions;
  return [
    anglais ? "Taste profile" : "Profil de goût",
    ...parts.map((p) => `  ${noms[p.gout].padEnd(8)} ${pc(p.part).padStart(5)}   ${anglais ? "distance" : "distance"} ${v(p.distance)}`),
    "",
    anglais ? "Measured" : "Mesuré",
    `  ${(anglais ? "register" : "registre").padEnd(14)} ${v(d.hauteur)}   ${Math.round(m.registre)} Hz${m.partVoisee >= 0.1 && m.hertz > 0 ? ` · ${anglais ? "pitch" : "hauteur"} ${Math.round(m.hertz)} Hz` : ""}`,
    `  ${(anglais ? "articulation" : "articulation").padEnd(14)} ${v(d.articulation)}   ${pc(m.duree)} ${anglais ? "of the time above -35 dB" : "du temps au-dessus de −35 dB"}`,
    `  ${(anglais ? "speed" : "vitesse").padEnd(14)} ${v(d.vitesse)}   ${v(m.attaques, 1)} ${anglais ? "attacks per second" : "attaques par seconde"}`,
    `  ${(anglais ? "consonance" : "consonance").padEnd(14)} ${v(d.consonance)}   ${anglais ? "roughness" : "rugosité"} ${v(m.rugosite, 3)}`,
    `  ${(anglais ? "loudness" : "intensité").padEnd(14)} ${v(d.intensite)}   ${v(m.db, 1)} dB`,
  ].join("\n");
}
