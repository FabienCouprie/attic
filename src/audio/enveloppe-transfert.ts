// audio/enveloppe-transfert.ts — Prendre le contour d'un son, le poser sur un autre.
//
// D'après Trevor Wishart, « Audible Design » (1994), et les programmes `envel extract` et
// `envel impose` du Composers Desktop Project.
//
// CE QUI MANQUAIT, ET CE QUE CE N'EST PAS. Attic sait fabriquer une enveloppe — « Enveloppe ADSR »
// en dessine une, « Fondu » en applique une aux bords. Aucun nœud ne sait PRENDRE celle d'un son
// pour la poser sur un autre. C'est pourtant l'opération qui fait parler une nappe : le rythme
// d'une phrase parlée, la respiration d'une batterie, l'attaque d'une percussion, transférés sur
// un son qui n'en a aucun.
//
// POURQUOI IL FAUT APLATIR LA CIBLE D'ABORD, et c'est le point qu'on rate en le faisant à la main.
// Multiplier simplement la cible par l'enveloppe du modèle ne donne pas le contour du modèle : il
// donne le PRODUIT des deux. Si la cible a déjà une attaque, elle survit sous celle qu'on impose,
// et le résultat n'a le rythme ni de l'une ni de l'autre. Aplatir d'abord — diviser la cible par
// sa propre enveloppe — la ramène à un son d'amplitude constante, et ce qu'on entend ensuite est
// bien le contour du modèle. C'est une division, donc elle a besoin d'un plancher : sous un certain
// niveau, le silence de la cible n'est pas un creux à corriger mais du silence, et le diviser
// n'amplifierait que du bruit de fond.
//
// LA RÉSOLUTION EST LE SEUL RÉGLAGE QUI COMPTE VRAIMENT. Une fenêtre courte suit les attaques et
// transporte le grain du modèle ; une fenêtre longue ne garde que ses grandes respirations. À
// 5 ms, on transfère presque la forme d'onde ; à 200 ms, la phrase seulement.

/**
 * L'enveloppe d'amplitude d'un signal : sa valeur efficace sur une fenêtre glissante.
 *
 * Valeur efficace plutôt que crête : la crête saute sur un seul échantillon fort et rend une
 * enveloppe hachée, là où l'énergie moyenne suit ce que l'oreille appelle le niveau.
 */
export function enveloppe(x: Float32Array, fenetre: number): Float32Array {
  const n = x.length;
  const w = Math.max(1, Math.round(fenetre));
  // Sommes cumulées des carrés : une passe, et pas de cas particulier aux deux bords.
  const cumul = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cumul[i + 1] = cumul[i] + x[i] * x[i];
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), z = Math.min(n - 1, i + w);
    env[i] = Math.sqrt((cumul[z + 1] - cumul[a]) / (z - a + 1));
  }
  return env;
}

/** Une enveloppe ramenée à une autre longueur, par interpolation linéaire. */
export function reechantillonnerEnveloppe(env: Float32Array, longueur: number): Float32Array {
  const out = new Float32Array(longueur);
  if (env.length === 0 || longueur === 0) return out;
  if (env.length === 1) return out.fill(env[0]);
  for (let i = 0; i < longueur; i++) {
    const p = (i * (env.length - 1)) / Math.max(1, longueur - 1);
    const i0 = Math.floor(p), f = p - i0;
    out[i] = env[i0] * (1 - f) + env[Math.min(env.length - 1, i0 + 1)] * f;
  }
  return out;
}

export interface OptionsTransfert {
  /** Demi-largeur de la fenêtre d'analyse, en échantillons. */
  fenetre: number;
  /** Aplatir la cible avant d'imposer le contour (cf. l'en-tête). */
  aplatir: boolean;
  /** Niveau sous lequel on n'aplatit pas : du silence n'est pas un creux à corriger. */
  plancher: number;
  /** Proportion du contour imposé, entre 0 et 1. */
  melange: number;
}

/**
 * Le contour de `modele`, posé sur `cible`.
 *
 * Les deux sons n'ont pas à faire la même longueur : l'enveloppe du modèle est étirée ou comprimée
 * pour couvrir la cible. C'est un choix, et il est délibéré — plutôt que de couper au plus court,
 * qui aurait fait dépendre le résultat de la durée du modèle sans que rien ne le dise.
 */
export function transfererEnveloppe(
  cible: Float32Array, modele: Float32Array, o: OptionsTransfert,
): Float32Array {
  const envModele = reechantillonnerEnveloppe(enveloppe(modele, o.fenetre), cible.length);
  const envCible = o.aplatir ? enveloppe(cible, o.fenetre) : null;
  // Le niveau moyen du modèle sert de référence : sans lui, aplatir puis imposer rendrait un son
  // dont l'amplitude dépendrait du volume auquel le modèle a été enregistré.
  let reference = 0;
  for (let i = 0; i < cible.length; i++) reference += envModele[i];
  reference = cible.length > 0 ? reference / cible.length : 1;

  const out = new Float32Array(cible.length);
  for (let i = 0; i < cible.length; i++) {
    let v = cible[i];
    if (envCible) {
      const e = envCible[i];
      // Sous le plancher, on laisse tel quel : diviser n'amplifierait que du bruit de fond.
      v = e > o.plancher ? (v / e) * reference : v;
    }
    const traite = v * (envModele[i] / (reference || 1));
    out[i] = cible[i] * (1 - o.melange) + traite * o.melange;
  }
  return out;
}
