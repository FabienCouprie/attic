// audio/styles-film.ts — Douze façons de tracer la même figure.
//
// POURQUOI ILS SONT NUMÉROTÉS, relevé par Fabien. Ils portaient d'abord les douze noms du
// générateur de pochette, repris parce que le vocabulaire existait déjà. C'était une erreur, et
// elle était visible : ces noms-là désignent des SUJETS d'image, Bauhaus, brutalisme, pastel, alors
// qu'ici un style ne décide que de la MAIN qui trace un contour. « Bauhaus » ne dit rien d'un
// remplissage à plat. Un numéro ne prétend rien, et la documentation du réglage dit ce que chacun
// fait varier.
//
// CE QU'ILS FONT VARIER, ET RIEN D'AUTRE : la largeur du trait, le nombre de fois qu'il est repassé,
// son décalage, sa continuité, et s'il est rempli. La figure, elle, vient de la superformule et ne
// change pas d'un style à l'autre.
//
// UN SEUL POINT D'ENTRÉE, VOLONTAIREMENT. Anneaux, noyau, contours de toutes sortes passent par
// `trait` : changer de style change donc tout l'aspect d'un coup, sans que chaque élément ait à
// connaître les douze manières.
//
// CE QUE CELA COÛTE : relevé dans l'application, le dessin d'une image entière tient dans deux
// dixièmes de milliseconde quand l'encodeur en prend dix. Un style qui trace cinq contours au lieu
// d'un reste donc invisible au chronomètre.

type Contexte2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface TraitStyle {
  cx: Contexte2D;
  centre: { x: number; y: number };
  /** Les points de la figure, de rayon un, déjà tournés. */
  forme: readonly { x: number; y: number }[];
  /** Le rayon auquel tracer, en pixels. */
  rayon: number;
  couleur: string;
  opacite: number;
  epaisseur: number;
  /** Un tirage reproductible : deux rendus de la même image doivent se ressembler. */
  alea: () => number;
  /** La palette du moment, pour les styles qui s'en servent. */
  palette: readonly string[];
}

export type Style = (t: TraitStyle) => void;

/** Le chemin de la figure à un rayon donné, éventuellement décalé et déformé. */
function chemin(
  t: TraitStyle, rayon: number,
  dx = 0, dy = 0, deforme?: (i: number, n: number) => number,
): void {
  const { cx, centre, forme } = t;
  cx.beginPath();
  for (let i = 0; i <= forme.length; i++) {
    const k = i % forme.length;
    const r = rayon * (deforme ? deforme(k, forme.length) : 1);
    const x = centre.x + dx + forme[k].x * r;
    const y = centre.y + dy + forme[k].y * r;
    if (i === 0) cx.moveTo(x, y); else cx.lineTo(x, y);
  }
  cx.closePath();
}

const avecAlpha = (couleur: string, a: number) => {
  const v = Math.min(1, Math.max(0, a));
  return couleur.startsWith("#") || couleur.startsWith("rgb") || couleur.startsWith("hsl")
    ? `color-mix(in srgb, ${couleur} ${Math.round(v * 100)}%, transparent)`
    : couleur;
};

/**
 * Les douze styles.
 *
 * CHACUN EST UNE MAIN, PAS UN SUJET. Le même contour, tracé douze fois différemment : fin et seul,
 * répété en profondeur, ondulé, pointillé, rempli à plat, rayé, brisé, épaissi, dédoublé en
 * couleurs. C'est ce qui permet d'en changer sans rien reconstruire.
 */
const BRUTS: Record<string, Style> = {
  // Un trait, et rien d'autre. C'est la mesure de tous les autres.
  "Style 1": (t) => {
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = Math.max(0.6, t.epaisseur * 0.5);
    chemin(t, t.rayon);
    t.cx.stroke();
  },

  // Le contour, et les cordes qui joignent les points opposés : la figure montre sa charpente.
  "Style 2": (t) => {
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = t.epaisseur;
    chemin(t, t.rayon);
    t.cx.stroke();
    t.cx.beginPath();
    const n = t.forme.length;
    for (let i = 0; i < n; i += Math.max(1, Math.round(n / 9))) {
      const a = t.forme[i], b = t.forme[(i + Math.floor(n / 2)) % n];
      t.cx.moveTo(t.centre.x + a.x * t.rayon, t.centre.y + a.y * t.rayon);
      t.cx.lineTo(t.centre.x + b.x * t.rayon, t.centre.y + b.y * t.rayon);
    }
    t.cx.stroke();
  },

  // Le rayon respire le long du contour : une onde qui court autour de la figure.
  "Style 3": (t) => {
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = t.epaisseur;
    chemin(t, t.rayon, 0, 0, (i, n) => 1 + 0.16 * Math.sin((i / n) * Math.PI * 14));
    t.cx.stroke();
  },

  // Le contour rendu en poussière : des points semés dessus, jamais deux fois les mêmes.
  "Style 4": (t) => {
    t.cx.fillStyle = avecAlpha(t.couleur, t.opacite);
    for (let i = 0; i < t.forme.length; i += 2) {
      const q = t.forme[i];
      const d = 1 + (t.alea() - 0.5) * 0.08;
      t.cx.beginPath();
      t.cx.arc(t.centre.x + q.x * t.rayon * d, t.centre.y + q.y * t.rayon * d,
        Math.max(0.5, t.epaisseur * 0.4), 0, Math.PI * 2);
      t.cx.fill();
    }
  },

  // Cinq contours emboîtés : la figure gagne une profondeur qu'un trait seul n'a pas.
  "Style 5": (t) => {
    t.cx.lineWidth = Math.max(0.5, t.epaisseur * 0.6);
    for (let k = 0; k < 5; k++) {
      t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite * (1 - k * 0.16));
      chemin(t, t.rayon * (1 - k * 0.17));
      t.cx.stroke();
    }
  },

  // Aplats francs pris dans la palette, et une moitié retranchée : l'école, en somme.
  "Style 6": (t) => {
    t.cx.fillStyle = avecAlpha(t.palette[1] ?? t.couleur, t.opacite * 0.85);
    chemin(t, t.rayon);
    t.cx.fill();
    t.cx.fillStyle = avecAlpha(t.palette[2] ?? t.couleur, t.opacite * 0.9);
    t.cx.beginPath();
    t.cx.arc(t.centre.x, t.centre.y, t.rayon * 0.55, -Math.PI / 2, Math.PI / 2);
    t.cx.fill();
  },

  // Le contour sert de pochoir, et des rayures le remplissent.
  "Style 7": (t) => {
    t.cx.save();
    chemin(t, t.rayon);
    t.cx.clip();
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = Math.max(1, t.epaisseur);
    const pas = Math.max(4, t.rayon / 9);
    t.cx.beginPath();
    for (let y = -t.rayon; y <= t.rayon; y += pas) {
      t.cx.moveTo(t.centre.x - t.rayon, t.centre.y + y);
      t.cx.lineTo(t.centre.x + t.rayon, t.centre.y + y);
    }
    t.cx.stroke();
    t.cx.restore();
  },

  // Le contour brisé en tesselles, avec du vide entre elles.
  "Style 8": (t) => {
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = Math.max(1, t.epaisseur * 1.4);
    const n = t.forme.length;
    const pas = Math.max(4, Math.round(n / 26));
    for (let i = 0; i < n; i += pas * 2) {
      t.cx.beginPath();
      for (let k = 0; k <= pas; k++) {
        const q = t.forme[(i + k) % n];
        const x = t.centre.x + q.x * t.rayon, y = t.centre.y + q.y * t.rayon;
        if (k === 0) t.cx.moveTo(x, y); else t.cx.lineTo(x, y);
      }
      t.cx.stroke();
    }
  },

  // Une croix à chaque sommet, et le contour disparaît derrière ses points.
  "Style 9": (t) => {
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    t.cx.lineWidth = Math.max(0.8, t.epaisseur * 0.7);
    const n = t.forme.length;
    const pas = Math.max(6, Math.round(n / 18));
    t.cx.beginPath();
    for (let i = 0; i < n; i += pas) {
      const q = t.forme[i];
      const x = t.centre.x + q.x * t.rayon, y = t.centre.y + q.y * t.rayon;
      const b = 3 + t.alea() * t.epaisseur * 2;
      t.cx.moveTo(x - b, y); t.cx.lineTo(x + b, y);
      t.cx.moveTo(x, y - b); t.cx.lineTo(x, y + b);
    }
    t.cx.stroke();
  },

  // Un trait très épais, doublé d'une ombre décalée : sans nuance, et c'est le propos.
  "Style 10": (t) => {
    t.cx.strokeStyle = avecAlpha(t.palette[0] ?? "#000000", t.opacite);
    t.cx.lineWidth = Math.max(3, t.epaisseur * 3);
    chemin(t, t.rayon, t.epaisseur * 2, t.epaisseur * 2);
    t.cx.stroke();
    t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite);
    chemin(t, t.rayon);
    t.cx.stroke();
  },

  // Trois copies décalées en cyan, magenta et blanc : l'aberration chromatique d'un mauvais écran.
  "Style 11": (t) => {
    const d = Math.max(1.5, t.epaisseur * 1.2);
    t.cx.lineWidth = Math.max(1, t.epaisseur * 0.8);
    for (const [couleur, dx, dy] of [["#00f5ff", -d, 0], ["#ff00ff", d, 0], ["#ffffff", 0, -d]] as const) {
      t.cx.strokeStyle = avecAlpha(couleur, t.opacite * 0.7);
      chemin(t, t.rayon, dx, dy);
      t.cx.stroke();
    }
  },

  // Plusieurs traits larges et transparents, superposés : le contour devient un halo.
  "Style 12": (t) => {
    for (let k = 3; k >= 1; k--) {
      t.cx.strokeStyle = avecAlpha(t.couleur, t.opacite * 0.22);
      t.cx.lineWidth = Math.max(1, t.epaisseur * k * 1.6);
      chemin(t, t.rayon);
      t.cx.stroke();
    }
  },
};

/**
 * UNE FIGURE VIDE NE DESSINE RIEN, ET NE PLANTE PAS. Relevé par le test : un contour sans un seul
 * point faisait lire `forme[NaN]`. Cela arrive dès qu'un réglage dégénère, et un style n'a pas à
 * s'en défendre douze fois : la garde est posée une fois, ici.
 */
const garde = (s: Style): Style => (t) => { if (t.forme.length > 0) s(t); };

export const STYLES: Record<string, Style> = Object.fromEntries(
  Object.entries(BRUTS).map(([nom, s]) => [nom, garde(s)]),
);

export const NOMS_STYLES = Object.keys(STYLES);

/** Le style demandé, ou le plus sobre si le nom n'en désigne aucun. */
export const styleNomme = (nom: string): Style => STYLES[nom] ?? STYLES["Style 1"];
