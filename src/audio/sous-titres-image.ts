// audio/sous-titres-image.ts — Poser un sous-titre sur une image.
//
// TROIS DÉCISIONS, ET ELLES VIENNENT DE CE QU'UN SOUS-TITRE DOIT SURVIVRE À N'IMPORTE QUELLE IMAGE.
//
//  1. LE CORPS ET LES MARGES SE DISENT EN PART DE LA HAUTEUR, jamais en pixels. Le même réglage
//     doit tenir sur une image de 480 lignes et sur une de 2160 ; un corps en pixels serait
//     illisible sur l'une et énorme sur l'autre.
//
//  2. LE TEXTE BLANC NE SUFFIT PAS. Posé sur un ciel ou sur une page, il disparaît. Le contour
//     noir le détache de tout, et le bandeau le détache plus encore quand l'image est chargée.
//     C'est pourquoi « aucun » existe mais n'est pas le défaut.
//
//  3. LE BLOC EST ANCRÉ PAR SON BORD, pas par sa première ligne. Un sous-titre de deux lignes posé
//     en bas doit finir à la même hauteur qu'un sous-titre d'une ligne, sans quoi le texte sautille
//     d'une réplique à l'autre.

/** Ce dont le dessin a besoin, et rien de plus : un contexte 2D en satisfait la forme. */
export interface ContexteTexte {
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, largeur: number, hauteur: number): void;
  fillText(texte: string, x: number, y: number): void;
  strokeText(texte: string, x: number, y: number): void;
  measureText(texte: string): { width: number };
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export interface StyleSousTitre {
  /** Corps du texte, en pour cent de la hauteur de l'image. */
  corpsPourCent: number;
  /** Distance au bord, en pour cent de la hauteur de l'image. */
  margePourCent: number;
  position: "bas" | "haut";
  fond: "contour" | "bandeau" | "aucun";
}

export interface MetriquesSousTitre {
  /** Corps du texte, en pixels. */
  corps: number;
  /** Distance d'une ligne de base à la suivante, en pixels. */
  interligne: number;
  /** Distance au bord, en pixels. */
  marge: number;
  /** Ligne de base de la première ligne, en pixels depuis le haut. */
  premiereLigne: number;
}

/** Le plus petit corps qui reste lisible, en pixels. */
const CORPS_MIN = 8;

export function metriquesSousTitre(
  hauteur: number, nombreDeLignes: number, s: StyleSousTitre,
): MetriquesSousTitre {
  const h = Math.max(1, hauteur);
  const corps = Math.max(CORPS_MIN, Math.round((h * Math.max(1, s.corpsPourCent)) / 100));
  const interligne = Math.round(corps * 1.25);
  const marge = Math.round((h * Math.max(0, s.margePourCent)) / 100);
  const lignes = Math.max(1, Math.round(nombreDeLignes));
  const premiereLigne = s.position === "haut"
    ? marge + corps
    : h - marge - (lignes - 1) * interligne;
  return { corps, interligne, marge, premiereLigne };
}

/** Pose les lignes d'un sous-titre sur l'image, centrées horizontalement. */
export function dessinerSousTitre(
  cx: ContexteTexte, largeur: number, hauteur: number,
  lignes: readonly string[], s: StyleSousTitre,
): void {
  if (lignes.length === 0) return;
  const m = metriquesSousTitre(hauteur, lignes.length, s);
  cx.save();
  cx.font = `bold ${m.corps}px sans-serif`;
  cx.textAlign = "center";
  cx.textBaseline = "alphabetic";

  if (s.fond === "bandeau") {
    const large = Math.max(...lignes.map((l) => cx.measureText(l).width));
    const marge = Math.round(m.corps * 0.4);
    cx.fillStyle = "rgba(0, 0, 0, 0.55)";
    cx.fillRect(
      Math.round(largeur / 2 - large / 2) - marge,
      Math.round(m.premiereLigne - m.corps) - marge,
      Math.round(large) + marge * 2,
      Math.round((lignes.length - 1) * m.interligne + m.corps) + marge * 2,
    );
  }

  lignes.forEach((ligne, i) => {
    const y = m.premiereLigne + i * m.interligne;
    if (s.fond === "contour") {
      cx.strokeStyle = "#000";
      cx.lineWidth = Math.max(2, Math.round(m.corps / 8));
      cx.lineJoin = "round";
      cx.strokeText(ligne, largeur / 2, y);
    }
    cx.fillStyle = "#fff";
    cx.fillText(ligne, largeur / 2, y);
  });
  cx.restore();
}
