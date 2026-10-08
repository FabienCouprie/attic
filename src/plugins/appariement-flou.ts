// plugins/appariement-flou.ts — Retrouver un composant dans un texte qui l'écorche.
//
// POURQUOI CE MODULE EXISTE, et ce que la mesure a montré. Une consigne dictée arrive déformée : la
// reconnaissance vocale ne peut rendre que des mots de son lexique, et les noms techniques n'y sont
// pas. Relevé sur trois prises, transcrites par Vosk en vocabulaire libre :
//
//   « spectrogramme »              rendu « spectre grammes »
//   « vocodeur de phase »          rendu « vos codeur de face »
//   « réverbération à convolution » rendu « réverbération à qu'on volution »
//
// L'APPARIEMENT MOT À MOT N'EN RETROUVAIT AUCUN. `matchMot` cherche une sous-chaîne exacte une fois
// les accents retirés : « spectre grammes » ne ressemble à rien pour lui, et les trois composants
// visés étaient perdus, 0 sur 3.
//
// CE QUI A ÉTÉ ESSAYÉ AVANT, ET QUI A MOINS BIEN MARCHÉ. Un modèle de langue local, à qui l'on
// donnait le catalogue entier et la transcription, en retrouvait 0 sur 6 ; en lui donnant les DEUX
// lectures du même son, la libre et celle contrainte au catalogue, 2 sur 6. Et une table des formes
// réellement entendues, construite en faisant dire chaque nom par la synthèse vocale puis en le
// réécoutant, n'apportait rien : la forme entendue n'est pas stable, « spectrogramme » rendant
// « spectre graham » isolé et « spectre grammes » dans une phrase, là où une distance d'édition
// absorbe les deux.
//
// La distance d'édition sur des fenêtres glissantes retrouve les trois, en 34 millisecondes contre
// cinq secondes, et sans rien appeler.
//
// AUCUNE DÉPENDANCE AU DOMAINE : ce fichier ne manipule que des chaînes.

/** Un composant tel que l'appariement le voit : un identifiant et un nom. */
export interface NommeParSonNom {
  id: string;
  nom: string;
}

export interface Trouvaille {
  id: string;
  /** Entre zéro et un. Un vaut identique une fois la forme comparable prise. */
  score: number;
  /** Le passage du texte qui l'a désigné, tel qu'il y était écrit. */
  fenetre: string;
}

/**
 * Le seuil au-dessous duquel une ressemblance ne désigne rien.
 *
 * RELEVÉ SUR TROIS CAS ET TROIS TÉMOINS. À 0,75, les trois composants visés ressortent et deux
 * phrases de parole ordinaire, « je voudrais savoir si le train de huit heures est à l'heure » et
 * « bonjour comment allez vous », n'en désignent aucun. Plus haut, 0,80, le vocodeur se perd, sa
 * meilleure ressemblance valant 0,78.
 */
export const SEUIL_RESSEMBLANCE = 0.75;

/**
 * La plus longue fenêtre examinée, en mots.
 *
 * Les noms du catalogue vont jusqu'à cinq mots, mais au-delà de quatre une fenêtre attrape des mots
 * voisins et la ressemblance se dilue. Quatre couvre « réverbération à qu'on volution », qui est le
 * plus long des cas relevés.
 */
export const MOTS_PAR_FENETRE = 4;

/** La forme sous laquelle deux textes se comparent : minuscules, sans marque ni ponctuation. */
export const forme = (s: string): string =>
  String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");

/** La distance d'édition de Levenshtein, en une seule ligne de travail. */
export function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return Math.max(m, n);
  let precedente = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const courante = [i];
    for (let j = 1; j <= n; j++) {
      courante[j] = Math.min(
        precedente[j] + 1,
        courante[j - 1] + 1,
        precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    precedente = courante;
  }
  return precedente[n];
}

/** La ressemblance de deux formes, entre zéro et un. */
export function ressemblance(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

/**
 * Les composants qu'un texte désigne, par ressemblance.
 *
 * UN SEUL COMPOSANT PAR FENÊTRE, ET LE MEILLEUR. Garder tous ceux qui passent le seuil ramenait des
 * voisins : « spectre grammes » désignait aussi `spectrogramme-son`, et « réverbération » aussi
 * `dereverberation`. Ne garder que le meilleur de chaque fenêtre les écarte sans rien perdre des
 * cibles, relevé sur les trois cas.
 *
 * LES FENÊTRES PEUVENT SE RECOUVRIR, et c'est voulu. Deux règles de non-recouvrement ont été
 * éprouvées, l'une donnant la priorité à la fenêtre la plus longue, l'autre à la mieux notée :
 * chacune perd une cible. Par longueur, le vocodeur disparaît sous une fenêtre plus large ; par
 * score, « réverbération à convolution » disparaît sous « réverbération ». Le recouvrement est donc
 * admis, au prix connu d'un faux ami : sur une phrase propre, la fenêtre « audio réverbération »
 * désigne `dereverberation` à 0,78. Un composant de trop se retire d'un clic ; un composant manquant
 * se cherche à la main.
 */
export function apparierFlou(
  texte: string,
  catalogue: readonly NommeParSonNom[],
  seuil = SEUIL_RESSEMBLANCE,
): Trouvaille[] {
  const mots = String(texte).split(/\s+/).filter(Boolean);
  // Les noms sont mis en forme une fois pour toutes : le texte en change, le catalogue non.
  const cibles = catalogue.map((d) => ({ id: d.id, forme: forme(d.nom) })).filter((d) => d.forme.length > 0);
  const meilleures = new Map<string, Trouvaille>();

  for (let i = 0; i < mots.length; i++) {
    for (let longueur = 1; longueur <= MOTS_PAR_FENETRE && i + longueur <= mots.length; longueur++) {
      const brute = mots.slice(i, i + longueur).join(" ");
      const f = forme(brute);
      if (f.length === 0) continue;
      let meilleur: Trouvaille | null = null;
      for (const c of cibles) {
        // ÉCART DE LONGUEUR : UNE BORNE SÛRE, ET NON UNE ASTUCE. La distance d'édition vaut au moins
        // l'écart des longueurs, donc la ressemblance vaut au plus 1 − écart / plus longue. Quand
        // cette borne passe déjà sous le seuil, le calcul complet ne peut pas le franchir.
        const plusLongue = Math.max(f.length, c.forme.length);
        if (1 - Math.abs(f.length - c.forme.length) / plusLongue < seuil) continue;
        const score = ressemblance(f, c.forme);
        if (!meilleur || score > meilleur.score) meilleur = { id: c.id, score, fenetre: brute };
      }
      if (!meilleur || meilleur.score < seuil) continue;
      const deja = meilleures.get(meilleur.id);
      if (!deja || meilleur.score > deja.score) meilleures.set(meilleur.id, meilleur);
    }
  }
  return [...meilleures.values()].sort((a, b) => b.score - a.score);
}
