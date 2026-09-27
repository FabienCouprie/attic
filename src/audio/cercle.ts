// audio/cercle.ts — Un rythme, ou une mélodie, posé sur un cercle de positions égales.
//
// CE QUE CET OBJET EST. Les positions d'un cycle sont réparties également sur un cercle, et celles
// qui sonnent en sont les sommets d'un polygone inscrit. C'est la représentation circulaire, celle
// que Godfried Toussaint emploie dans « The Geometry of Musical Rhythm » et sur laquelle toutes les
// mesures de ce dépôt se calculent (voir `audio/cercle-mesures.ts`).
//
// IL EST PUREMENT COMBINATOIRE, ET C'EST LA DÉCISION QUI TIENT TOUT LE RESTE. Aucune seconde,
// aucun tempo, aucune nuance n'entre ici : un cercle ne dit que combien de positions il porte et
// lesquelles sonnent. La durée d'un tour, celle d'un événement et la nuance sont fournies au rendu,
// qui en fait une `Sequence`. Sans cela, la rotation, le complémentaire et la réflexion perdraient
// leur sens dès qu'une attaque serait datée en secondes.
//
// UN SEUL TYPE POUR LE RYTHME ET POUR LA MÉLODIE, parce que ce sont le même objet : un
// sous-ensemble de positions, étiqueté. Ce qui les sépare est l'étage où l'étiquette vit. Une
// percussion en porte une pour tout le cercle, une mélodie une par sommet. Le type garde donc une
// valeur par sommet — un seul mécanisme — et c'est l'éditeur rythmique qui les écrit toutes
// pareilles. Conséquence à connaître : permuter les étiquettes d'un cercle de percussion ne change
// rien, et un composant qui l'offrirait mentirait.

import { nomNoteRond } from "./nom-note";
import { mulberry32 } from "./reservoir";

/**
 * Le nombre de positions au plus.
 *
 * DEUX RAISONS INDÉPENDANTES TOMBENT SUR CE NOMBRE. Le réservoir de hauteurs d'où le complémentaire
 * mélodique tire ses notes plafonne vers cinquante-trois, les quintes justes repliées finissant par
 * se serrer sous le seuil d'audibilité ; le complémentaire ne pouvant compter plus de `positions`
 * sommets, rester sous ce plafond suffit. Et quarante-huit est le plus petit commun multiple de
 * seize et de douze, c'est-à-dire la grille que deux cercles usuels partagent.
 */
export const POSITIONS_MAX = 48;

/** Ce qu'un sommet porte : sa place sur le cercle, et le son qu'on y entend. */
export interface Sommet {
  /** De zéro à `positions - 1`. */
  position: number;
  /**
   * La note du kit pour une percussion, la hauteur en demi-tons pour une mélodie.
   *
   * ELLE EST À VIRGULE, et le microton voyage donc gratuitement. Rester tempéré est une propriété
   * de l'éditeur, pas du tuyau : c'est ce qui évite d'avoir à ajouter un second type le jour où le
   * quart de ton sera voulu.
   */
  valeur: number;
}

export interface Cercle {
  /** Le nombre de positions du cycle, c'est-à-dire de pastilles sur le cercle. */
  positions: number;
  /** Comment lire la valeur d'un sommet. Un cercle est de l'une ou de l'autre sorte, jamais des deux. */
  sorte: "percussion" | "hauteur";
  /** Les positions qui sonnent, dans l'ordre croissant après normalisation. */
  sommets: Sommet[];
}

/**
 * Reconnaît un cercle à l'entrée d'un nœud.
 *
 * UN PORT REND `unknown`, ET IL FAUT VÉRIFIER. La vérification est stricte sur ce dont la suite
 * dépend : un nombre de positions entier et utilisable, une sorte connue, et des sommets dont la
 * place et la valeur sont des nombres finis. Une position qui serait `NaN` passerait un contrôle
 * plus lâche et casserait au premier calcul d'angle.
 */
export function estCercle(valeur: unknown): valeur is Cercle {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return false;
  const c = valeur as Cercle;
  if (!Number.isInteger(c.positions) || c.positions < 1) return false;
  if (c.sorte !== "percussion" && c.sorte !== "hauteur") return false;
  if (!Array.isArray(c.sommets)) return false;
  return c.sommets.every((s) =>
    s !== null && typeof s === "object"
    && Number.isInteger(s.position) && s.position >= 0 && s.position < c.positions
    && Number.isFinite(s.valeur));
}

/**
 * Plusieurs cercles qui se suivent dans le temps, un par tour.
 *
 * POURQUOI LE PORT PORTE UNE SUITE ET NON UN CERCLE SEUL. Une boucle de transformation rend autant
 * de cercles qu'elle a fait de passes, et ils ne sonnent pas ensemble : ils se suivent. Un port qui
 * ne porterait qu'un cercle obligerait à les rendre un par un, et le rendu ne pourrait plus décider
 * d'une base de temps commune à toutes les voix, qui est sa raison d'être.
 *
 * UN CERCLE SEUL EST UNE SUITE D'UN, et c'est ce qui rend le changement invisible partout ailleurs :
 * les deux éditeurs rendent un cercle, les transformations en rendent un, et tout continue.
 */
export type Suite = Cercle[];

/** Vrai pour une suite non vide de cercles. */
export function estSuite(valeur: unknown): valeur is Suite {
  return Array.isArray(valeur) && valeur.length > 0 && valeur.every(estCercle);
}

/** Ce qui arrive sur un port `cercle`, ramené à une suite. Rend une suite vide si ce n'en est pas un. */
export function enSuite(valeur: unknown): Suite {
  if (estSuite(valeur)) return valeur;
  if (estCercle(valeur)) return [valeur];
  return [];
}

/** Le reste positif d'une division, là où `%` rend un négatif sur un négatif. */
const modulo = (a: number, n: number): number => ((a % n) + n) % n;

/**
 * Remet un cercle en ordre : positions croissantes, une seule par place, rien hors du cycle.
 *
 * DEUX SOMMETS SUR LA MÊME PLACE N'ONT PAS DE SENS — une position sonne ou ne sonne pas. Le premier
 * est gardé, ce qui rend l'opération stable : la rejouer ne change plus rien.
 */
export function normaliser(c: Cercle): Cercle {
  const vues = new Set<number>();
  const sommets: Sommet[] = [];
  for (const s of c.sommets) {
    const position = modulo(Math.round(s.position), c.positions);
    if (vues.has(position)) continue;
    vues.add(position);
    sommets.push({ position, valeur: s.valeur });
  }
  sommets.sort((a, b) => a.position - b.position);
  return { positions: c.positions, sorte: c.sorte, sommets };
}

/** Les places du cercle que rien n'occupe, dans l'ordre croissant. */
export function placesLibres(c: Cercle): number[] {
  const prises = new Set(c.sommets.map((s) => modulo(s.position, c.positions)));
  const libres: number[] = [];
  for (let p = 0; p < c.positions; p++) if (!prises.has(p)) libres.push(p);
  return libres;
}

// ── Les opérations sur les positions ────────────────────────────────────────────────────────────
//
// ELLES CHANGENT LE RYTHME, DONC TOUTES LES MESURES. Les étiquettes voyagent rigidement avec leurs
// points : un sommet emporte son son là où il va.

/** Fait tourner le cercle de `pas` places. L'étiquette suit son point. */
export function tourner(c: Cercle, pas: number): Cercle {
  return normaliser({
    ...c,
    sommets: c.sommets.map((s) => ({ ...s, position: modulo(s.position + Math.round(pas), c.positions) })),
  });
}

/**
 * Réfléchit le cercle autour d'un axe, la place `axe` restant en place.
 *
 * L'AXE EST DONNÉ EN PLACES ET NON EN DEGRÉS : la réflexion qui fixe la place `a` envoie `p` sur
 * `a - p`. Avec un axe nul, c'est le miroir autour de l'origine, celui qu'on attend par défaut.
 */
export function reflechir(c: Cercle, axe = 0): Cercle {
  return normaliser({
    ...c,
    sommets: c.sommets.map((s) => ({ ...s, position: modulo(Math.round(axe) - s.position, c.positions) })),
  });
}

/**
 * Tire un cercle au sort : `combien` places parmi `positions`, la même graine rendant le même tirage.
 *
 * LE TIRAGE EST SANS REMISE, par mélange partiel de la liste des places. Tirer avec remise puis
 * écarter les doublons rendrait moins de sommets que demandé, sans le dire.
 */
export function cercleAleatoire(
  positions: number, combien: number, sorte: Cercle["sorte"], valeur: number, graine: number,
): Cercle {
  const n = Math.max(1, Math.min(POSITIONS_MAX, Math.round(positions)));
  const k = Math.max(0, Math.min(n, Math.round(combien)));
  const hasard = mulberry32(graine);
  const places = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(hasard() * (n - i));
    [places[i], places[j]] = [places[j], places[i]];
  }
  return normaliser({
    positions: n, sorte,
    sommets: places.slice(0, k).map((position) => ({ position, valeur })),
  });
}

// ── Les opérations sur les étiquettes ───────────────────────────────────────────────────────────
//
// ELLES NE CHANGENT AUCUNE MESURE, l'ensemble des positions restant le même. C'est un axe de
// composition entier que les scores ne voient pas, et il vaut mieux le savoir avant de poser un
// chiffre à côté d'un bouton « permuter ».

/** Les sons lus à rebours le long du cercle, les places ne bougeant pas. */
export function inverserOrdre(c: Cercle): Cercle {
  const n = normaliser(c);
  const valeurs = n.sommets.map((s) => s.valeur).reverse();
  return { ...n, sommets: n.sommets.map((s, i) => ({ ...s, valeur: valeurs[i] })) };
}

/**
 * Mélange les sons entre les places, les places ne bougeant pas.
 *
 * ON TIRE, ON N'ÉNUMÈRE PAS. Les permutations de k étiquettes sont k! — cinq mille pour sept notes,
 * trois millions et demi pour dix —, très au-delà de ce qu'une boucle du dépôt parcourt. Une
 * permutation demandée est donc une permutation tirée, et la graine la rend reproductible.
 */
export function permuterEtiquettes(c: Cercle, graine: number): Cercle {
  const n = normaliser(c);
  const hasard = mulberry32(graine);
  const valeurs = n.sommets.map((s) => s.valeur);
  for (let i = valeurs.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [valeurs[i], valeurs[j]] = [valeurs[j], valeurs[i]];
  }
  return { ...n, sommets: n.sommets.map((s, i) => ({ ...s, valeur: valeurs[i] })) };
}

/**
 * Renverse les intervalles autour d'un axe : la hauteur `v` devient `2·axe - v`.
 *
 * CE N'EST PAS LA MÊME CHOSE QUE D'INVERSER L'ORDRE, et les deux s'appellent « inversion » en
 * musique. Celle-ci agit sur les hauteurs elles-mêmes, l'autre sur leur rang. Sans axe donné, c'est
 * la note la plus grave qui sert, comme pour le complémentaire : la mélodie se déplie alors
 * vers l'aigu à partir de son propre pied.
 */
export function inverserIntervalles(c: Cercle, axe?: number): Cercle {
  const n = normaliser(c);
  if (n.sommets.length === 0) return n;
  const pivot = axe ?? Math.min(...n.sommets.map((s) => s.valeur));
  return { ...n, sommets: n.sommets.map((s) => ({ ...s, valeur: 2 * pivot - s.valeur })) };
}

// ── Le complémentaire ───────────────────────────────────────────────────────────────────────────

/** L'écart en cents en deçà duquel deux hauteurs sont tenues pour la même. */
export const TOLERANCE_CENTS = 20;

/** La quinte juste, en cents. Le générateur par défaut de la chaîne des hauteurs. */
export const QUINTE_JUSTE_CENTS = 1200 * Math.log2(3 / 2);

/**
 * Les hauteurs qu'une chaîne de générateurs pose dans l'octave d'une fondamentale.
 *
 * COMMENT ELLE REMPLACE UNE TONALITÉ. Nommer une tonalité suppose douze cases ; dès qu'une hauteur
 * ne tombe pas sur un demi-ton, le nom ne désigne plus rien. Un intervalle, lui, est un rapport et
 * reste valable partout. On empile donc le générateur depuis la fondamentale et l'on replie chaque
 * pas dans son octave. Avec sept cents de moins, exactement sept cents, la chaîne se referme au
 * douzième pas et l'on retrouve l'ordre du cycle des quintes ; avec la quinte juste elle ne se
 * referme jamais.
 *
 * ELLE N'EST POURTANT PAS INÉPUISABLE UNE FOIS REPLIÉE. Les quintes justes repliées se posent à
 * `i × 701,955 modulo 1200` cents : elles s'égalisent à douze pas, puis quarante-et-un, puis
 * cinquante-trois, où l'écart vaut encore vingt-deux cents et demi. Au pas suivant un écart tombe
 * vers trois cents et demi, et la tolérance le rejette — puis rejette tout le reste, les écarts ne
 * faisant que se resserrer. `POSITIONS_MAX` est choisi pour rester sous ce plafond.
 */
export function chaineDeHauteurs(
  fondamentale: number,
  combien: number,
  o: { generateurCents?: number; deja?: readonly number[]; toleranceCents?: number } = {},
): number[] {
  const generateur = o.generateurCents ?? QUINTE_JUSTE_CENTS;
  const tolerance = o.toleranceCents ?? TOLERANCE_CENTS;
  const prises = [...(o.deja ?? [])];
  const sorties: number[] = [];
  // LA BORNE D'ESSAIS N'EST PAS UNE PRÉCAUTION DE STYLE. Passé le plafond, la chaîne ne rend plus
  // que des hauteurs trop proches de celles déjà posées, et la boucle tournerait sans fin.
  const essaisMax = 4096;
  for (let i = 0, essais = 0; sorties.length < combien && essais < essaisMax; i++, essais++) {
    // Replié dans l'octave de la fondamentale : le complémentaire chante dans le registre du pied
    // de la mélodie, et non six octaves plus haut.
    const hauteur = fondamentale + ((i * generateur / 100) % 12 + 12) % 12;
    const tropProche = prises.some((v) => Math.abs(v - hauteur) * 100 < tolerance);
    if (tropProche) continue;
    prises.push(hauteur);
    sorties.push(hauteur);
  }
  return sorties;
}

/**
 * Le cercle des places que le motif laisse libres.
 *
 * LE COMPLÉMENTAIRE SE PREND DANS LE TEMPS, non dans les hauteurs : ce sont les places inoccupées
 * du cycle. Ce qu'elles jouent dépend de la sorte.
 *
 * SUR UNE PERCUSSION, tous les sommets d'un cercle portent le même son : le complémentaire est un
 * cercle de plus, et il reçoit le sien en réglage. C'est le hoquet, où un second instrument remplit
 * les silences du premier.
 *
 * SUR UNE MÉLODIE, les places libres n'ont aucune étiquette, et il faut les tirer d'un réservoir.
 * Il vient d'une fondamentale et d'un générateur, la fondamentale étant la note la plus grave du
 * cercle reçu. Une conséquence heureuse : la fondamentale ne dépendant ni du rang ni de la place,
 * le complémentaire ne change ni sous rotation ni sous permutation des étiquettes — les deux
 * opérations qui laissent l'ensemble des hauteurs intact.
 *
 * UN CERCLE MÉLODIQUE VIDE N'A PAS DE FONDAMENTALE, et son complémentaire est donc refusé plutôt
 * que rempli d'un repli arbitraire.
 */
export function complementaire(
  c: Cercle,
  o: { son?: number; generateurCents?: number; toleranceCents?: number } = {},
): Cercle | null {
  const n = normaliser(c);
  const libres = placesLibres(n);
  if (n.sorte === "percussion") {
    const son = o.son ?? n.sommets[0]?.valeur ?? 38;
    return { positions: n.positions, sorte: "percussion", sommets: libres.map((position) => ({ position, valeur: son })) };
  }
  if (n.sommets.length === 0) return null;
  const fondamentale = Math.min(...n.sommets.map((s) => s.valeur));
  const hauteurs = chaineDeHauteurs(fondamentale, libres.length, {
    generateurCents: o.generateurCents,
    deja: n.sommets.map((s) => s.valeur),
    toleranceCents: o.toleranceCents,
  });
  // La chaîne peut rendre moins de hauteurs que de places quand la tolérance les rejette toutes :
  // on ne remplit alors que ce qu'on peut, plutôt que de répéter une note.
  return {
    positions: n.positions, sorte: "hauteur",
    sommets: hauteurs.map((valeur, i) => ({ position: libres[i], valeur })),
  };
}

/**
 * Deux cercles bout à bout : le second suit le premier, et le cycle fait la somme.
 *
 * LA MÊME SORTE EST EXIGÉE. Joindre une percussion et une mélodie donnerait un cercle dont on ne
 * saurait plus lire les valeurs, la sorte vivant sur le cercle et non sur le sommet.
 */
export function joindre(a: Cercle, b: Cercle): Cercle | null {
  if (a.sorte !== b.sorte) return null;
  const x = normaliser(a), y = normaliser(b);
  return normaliser({
    positions: x.positions + y.positions,
    sorte: x.sorte,
    sommets: [...x.sommets, ...y.sommets.map((s) => ({ ...s, position: s.position + x.positions }))],
  });
}

/**
 * Plusieurs cercles superposés en un seul, sur la grille que leurs tailles partagent.
 *
 * LA GRILLE EST LE PLUS PETIT COMMUN MULTIPLE des nombres de places : seize et douze se posent tous
 * deux sur quarante-huit, et chaque attaque y garde l'instant qu'elle avait dans son cycle. Sans
 * cela il faudrait rapprocher les attaques de la place la plus proche, ce qui déplacerait le rythme
 * sans le dire.
 *
 * ELLE PEUT REFUSER, et c'est préférable à un cercle qu'aucun éditeur ne saurait montrer. Seize et
 * dix donneraient quatre-vingts places, au-delà du maximum ; la fonction rend alors `null`.
 *
 * LA MÊME SORTE EST EXIGÉE, comme pour la jointure : superposer une percussion et une mélodie
 * donnerait un cercle dont on ne saurait plus lire les valeurs, la sorte vivant sur le cercle.
 *
 * DEUX ATTAQUES SUR LA MÊME PLACE N'EN FONT QU'UNE, celle du premier cercle reçu. Les garder toutes
 * deux donnerait un sommet par valeur sur une même position, ce que le type n'admet pas.
 */
export function melanger(cercles: readonly Cercle[], plafond = POSITIONS_MAX): Cercle | null {
  const valides = cercles.filter(estCercle).map(normaliser);
  if (valides.length === 0) return null;
  if (valides.some((c) => c.sorte !== valides[0].sorte)) return null;
  let n = 1;
  for (const c of valides) {
    n = (n / pgcd(n, c.positions)) * c.positions;
    if (n > plafond) return null;
  }
  const prises = new Map<number, number>();
  for (const c of valides) {
    const facteur = n / c.positions;
    for (const s of c.sommets) {
      const place = s.position * facteur;
      if (!prises.has(place)) prises.set(place, s.valeur);
    }
  }
  return normaliser({
    positions: n,
    sorte: valides[0].sorte,
    sommets: [...prises.entries()].map(([position, valeur]) => ({ position, valeur })),
  });
}

/** Le plus grand commun diviseur, pour la grille que deux cercles partagent. */
const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));

// ── Les hauteurs qu'un cercle mélodique porte ───────────────────────────────────────────────────
//
// ELLES SE DÉDUISENT DE LA FONDAMENTALE ET DE LA PLACE, et ne se saisissent plus une à une. Un
// cercle n'a alors qu'une hauteur à régler, et ce qu'on entend suit le dessin : allumer une place
// donne la note de cette place, et rien à saisir ailleurs ne peut la contredire.
//
// TROIS FAÇONS, PARCE QU'ELLES NE DISENT PAS LA MÊME CHOSE. Les deux premières font de l'angle une
// hauteur, la troisième du rang une hauteur ; la première divise l'octave par le cercle, la seconde
// garde le demi-ton tempéré et laisse le tour dépasser l'octave.

/** Comment une place du cercle décide de sa hauteur. */
export type Repartition = "octave" | "demi-tons" | "quintes";

/** La plus grave et la plus aiguë qu'un numéro de note MIDI puisse porter. */
const NOTE_MIN = 0, NOTE_MAX = 127;

/**
 * Les hauteurs des places qui sonnent, dans l'ordre du tour.
 *
 * « octave » : LE TOUR ENTIER VAUT UNE OCTAVE, quel que soit le nombre de places. La place k sonne
 * la fondamentale plus douze fois k sur n demi-tons : douze places rendent la gamme chromatique,
 * seize en rendent seize divisions égales. L'angle est donc la hauteur, et tourner le motif le
 * transpose. Le microton vient tout seul dès que le nombre de places ne divise pas douze.
 *
 * « demi-tons » : UN DEMI-TON TEMPÉRÉ PAR PLACE. Le tour couvre alors plus ou moins d'une octave
 * selon le nombre de places, et rien ne tombe entre deux touches. Sur un grand cercle parti d'une
 * fondamentale aiguë, le haut du tour bute contre la note 127 et plusieurs places s'y rejoignent.
 *
 * « quintes » : LE RANG DE L'ATTAQUE DÉCIDE, ET NON SA PLACE. Le k-ième sommet qui sonne prend le
 * k-ième degré de la chaîne de quintes justes repliée dans l'octave de la fondamentale, celle dont
 * se sert déjà le complémentaire mélodique. Deux motifs de même nombre d'attaques donnent donc les
 * mêmes notes, dans le même ordre, quelles que soient leurs places.
 */
export function hauteursDuCercle(
  positions: number,
  places: readonly number[],
  fondamentale: number,
  repartition: Repartition,
): number[] {
  const n = Math.max(1, Math.round(positions));
  const borner = (h: number) => Math.min(NOTE_MAX, Math.max(NOTE_MIN, h));
  if (repartition === "quintes") return chaineDeHauteurs(fondamentale, places.length).map(borner);
  const pas = repartition === "octave" ? 12 / n : 1;
  return places.map((place) => borner(fondamentale + place * pas));
}

/**
 * Les fondamentales offertes au choix, de do 1 à do 6, une par demi-ton.
 *
 * L'IDENTIFIANT EST LE NUMÉRO DE NOTE, comme partout où un réglage à choix porte une valeur
 * numérique : c'est lui qui est enregistré dans un projet, et il ne dépend d'aucune langue. Le
 * libellé porte la fréquence, puisque c'est elle que l'on vient chercher dès qu'une place du cercle
 * ne tombe pas sur une touche.
 */
export const FONDAMENTALES: readonly { note: number; nom: string; hertz: number }[] =
  Array.from({ length: 61 }, (_, i) => {
    const note = 24 + i;
    return { note, nom: nomNoteRond(note), hertz: 440 * 2 ** ((note - 69) / 12) };
  });
