// audio/deplacement.ts — Une ligne à retard variable, et les deux effets qui en sortent.
//
// CE QUE CES DEUX EFFETS ONT EN COMMUN, ET QUI NE SE VOIT PAS. L'effet Doppler et le magnétophone
// n'ont rien à voir l'un avec l'autre — l'un est une ambulance qui passe, l'autre une bande qui
// s'use. Ils sont pourtant le MÊME calcul : lire le signal à une distance qui change. Quand cette
// distance croît, on lit plus lentement et le son baisse ; quand elle décroît, il monte. Une
// ambulance qui approche raccourcit la distance ; un galet de magnétophone qui tourne mal
// l'allonge et la raccourcit tour à tour. D'où un seul lecteur, éprouvé une fois.
//
// POURQUOI LE RETARD PLUTÔT QU'UN RAPPORT DE FRÉQUENCE. On lit souvent l'effet Doppler écrit
// comme `f' = f·c/(c−v)`, et l'on est tenté de transposer le son de ce rapport. C'est faux dès que
// la vitesse radiale change — c'est-à-dire tout le temps, puisqu'une source qui passe voit sa
// composante radiale s'inverser. Poser le retard égal au TEMPS DE PROPAGATION, et laisser le
// décalage de hauteur en sortir tout seul, donne le bon résultat sans qu'on ait à écrire la
// formule : la hauteur mesurée à l'arrivée est celle que la physique impose, y compris pendant le
// passage où elle bascule.

/**
 * Lecture à retard variable, par interpolation linéaire.
 *
 * `retards[i]` est le retard, EN ÉCHANTILLONS, à appliquer pour produire la sortie `i`. Un retard
 * fractionnaire est la règle et non l'exception : c'est lui qui porte le changement de hauteur, et
 * l'arrondir rendrait un son granuleux au lieu d'un glissement.
 */
export function lireAvecRetard(x: Float32Array, retards: Float32Array): Float32Array {
  const y = new Float32Array(retards.length);
  for (let i = 0; i < retards.length; i++) {
    const p = i - retards[i];
    const i0 = Math.floor(p);
    if (i0 < 0 || i0 + 1 >= x.length) continue;
    const f = p - i0;
    y[i] = x[i0] * (1 - f) + x[i0 + 1] * f;
  }
  return y;
}

// ── DOPPLER ────────────────────────────────────────────────────────────────────────────────────

export interface OptionsDoppler {
  /** Vitesse de la source, en mètres par seconde. 30 m/s valent 108 km/h. */
  vitesse: number;
  /** Distance au plus près, en mètres. Zéro ferait passer la source à travers l'auditeur. */
  distance: number;
  /** Célérité du son, en mètres par seconde. 343 à 20 °C au niveau de la mer. */
  celerite: number;
  /** Appliquer l'atténuation en 1/distance. */
  attenuer: boolean;
  frequence: number;
}

/** La distance source-auditeur à chaque instant, pour une trajectoire rectiligne. */
export function distances(n: number, o: OptionsDoppler): Float32Array {
  const d = new Float32Array(n);
  const duree = n / o.frequence;
  for (let i = 0; i < n; i++) {
    // Le passage au plus près est placé au milieu : la source arrive, passe, s'éloigne.
    const t = i / o.frequence - duree / 2;
    const x = o.vitesse * t;
    d[i] = Math.hypot(x, Math.max(0.01, o.distance));
  }
  return d;
}

/** Position latérale, entre -1 (à gauche, avant le passage) et 1 (à droite, après). */
export function lateralite(n: number, o: OptionsDoppler): Float32Array {
  const p = new Float32Array(n);
  const duree = n / o.frequence;
  for (let i = 0; i < n; i++) {
    const t = i / o.frequence - duree / 2;
    const x = o.vitesse * t;
    // L'angle vu par l'auditeur, ramené entre -1 et 1. C'est l'angle qui compte, et non la
    // distance parcourue : une source lointaine traverse le champ lentement, une source proche
    // le balaie d'un coup — et c'est bien ce qu'on entend d'une voiture qui frôle.
    p[i] = Math.atan2(x, Math.max(0.01, o.distance)) / (Math.PI / 2);
  }
  return p;
}

/**
 * Pour chaque échantillon ÉMIS, l'instant où il arrive à l'oreille — en échantillons.
 *
 * C'EST ICI QUE SE JOUE LA JUSTESSE DE L'EFFET, et le premier jet s'y est trompé. Il évaluait la
 * distance à l'instant d'ARRIVÉE, ce qui revient à faire bouger l'auditeur plutôt que la source :
 * on obtient alors `f·(1 + v/c)` au lieu de `f/(1 − v/c)`. Mesuré sur une source à 40 m/s :
 * **491,2 Hz rendus pour 498,1 attendus**, soit vingt-quatre centièmes de demi-ton — de quoi
 * s'entendre sur un son tenu, et sans excuse pour un nœud qui invoque la physique.
 *
 * La suite est CROISSANTE tant que la source est plus lente que le son, ce qui permet de
 * l'inverser d'un seul parcours.
 */
export function arrivees(n: number, d: Float32Array, o: OptionsDoppler): Float32Array {
  return Float32Array.from({ length: n }, (_, j) => j + (d[j] / o.celerite) * o.frequence);
}

/**
 * L'inverse de cette suite : pour chaque instant d'écoute, l'instant d'émission correspondant.
 *
 * Parcours unique, les deux suites étant croissantes. Hors de la plage couverte, on rend -1 :
 * rien n'a encore été émis, ou tout est déjà passé.
 */
export function emissions(arr: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n).fill(-1);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j + 1 < arr.length && arr[j + 1] <= i) j++;
    if (arr[j] > i) continue;
    // Le tout dernier instant d'arrivée n'a pas de suivant entre lequel interpoler : il vaut
    // exactement sa propre émission. Sans ce cas, le dernier échantillon émis n'était jamais
    // entendu — ce que le test a montré en rendant -1 là où l'on attendait 3.
    if (j + 1 >= arr.length) { out[i] = j; continue; }
    const ecart = arr[j + 1] - arr[j];
    out[i] = ecart > 1e-9 ? j + (i - arr[j]) / ecart : j;
  }
  return out;
}

/** Le son d'une source qui passe : deux canaux, hauteur, niveau et position compris. */
export function doppler(x: Float32Array, o: OptionsDoppler): [Float32Array, Float32Array] {
  const n = x.length;
  const d = distances(n, o);
  const lat = lateralite(n, o);
  const emis = emissions(arrivees(n, d, o), n);
  const gauche = new Float32Array(n);
  const droite = new Float32Array(n);
  const dRef = Math.max(0.01, o.distance);
  for (let i = 0; i < n; i++) {
    const p = emis[i];
    if (p < 0 || p + 1 >= n) continue;
    const j = Math.floor(p), f = p - j;
    const v = x[j] * (1 - f) + x[j + 1] * f;
    // Niveau et direction sont ceux de l'instant d'ÉMISSION : c'est là que la source était quand
    // elle a produit ce qu'on entend maintenant. Les prendre à l'arrivée ferait précéder l'image
    // sonore du son lui-même.
    const dist = d[j] * (1 - f) + d[j + 1] * f;
    const cote = lat[j] * (1 - f) + lat[j + 1] * f;
    const gain = o.attenuer ? dRef / dist : 1;
    // Panoramique à puissance constante : un son qui traverse ne doit pas faiblir au centre.
    const angle = ((cote + 1) / 2) * (Math.PI / 2);
    gauche[i] = v * gain * Math.cos(angle);
    droite[i] = v * gain * Math.sin(angle);
  }
  return [gauche, droite];
}

/** La hauteur qu'une source approchant à `vitesse` fait entendre, pour une hauteur émise `f`. */
export function hauteurApprochee(f: number, vitesse: number, celerite: number): number {
  return (f * celerite) / Math.max(1e-6, celerite - vitesse);
}

/** La hauteur d'une source qui s'éloigne. */
export function hauteurEloignee(f: number, vitesse: number, celerite: number): number {
  return (f * celerite) / (celerite + vitesse);
}

// ── MAGNÉTOPHONE ───────────────────────────────────────────────────────────────────────────────
//
// QUATRE DÉFAUTS, ET AUCUN N'EST DÉCORATIF. Le PLEURAGE vient de l'excentricité de la bobine : une
// oscillation lente, sous deux hertz, qui fait dériver la hauteur. Le SCINTILLEMENT vient du
// cabestan et des galets : la même chose, mais entre cinq et vingt hertz, et l'oreille l'entend
// comme un tremblement plutôt que comme une dérive. La SATURATION vient de l'oxyde, qui cesse de
// répondre linéairement avant de rendre les armes — d'où une compression douce des crêtes, et des
// harmoniques qui n'étaient pas là. Les DÉCROCHAGES viennent des trous dans la couche magnétique :
// le son disparaît un instant, sans prévenir.

export interface OptionsBande {
  /** Amplitude du pleurage, en pour cent de variation de hauteur. */
  pleurage: number;
  /** Fréquence du pleurage, en hertz. */
  pleurageHz: number;
  /** Amplitude du scintillement, en pour cent. */
  scintillement: number;
  /** Fréquence du scintillement, en hertz. */
  scintillementHz: number;
  /** Attaque de la saturation. Zéro : aucune. */
  saturation: number;
  /** Décrochages par seconde. */
  decrochages: number;
  /** Niveau du souffle, entre 0 et 1. */
  souffle: number;
  graine: number;
  frequence: number;
}

/** Le retard, en échantillons, que le pleurage et le scintillement imposent à chaque instant. */
export function retardsBande(n: number, o: OptionsBande): Float32Array {
  const r = new Float32Array(n);
  // Un retard moyen d'un centième de seconde : la modulation doit pouvoir descendre SOUS lui sans
  // devenir négative, ce qui reviendrait à lire le futur.
  const base = 0.01 * o.frequence;
  for (let i = 0; i < n; i++) {
    const t = i / o.frequence;
    const p = (o.pleurage / 100) * Math.sin(2 * Math.PI * o.pleurageHz * t);
    const s = (o.scintillement / 100) * Math.sin(2 * Math.PI * o.scintillementHz * t + 1.7);
    // LE RETARD DOIT RESTER POSITIF. Les deux modulations s'ajoutent : à 90 % chacune, leur somme
    // descend à −1,8 et le retard devenait NÉGATIF, c'est-à-dire qu'on lisait le futur — ce que la
    // lecture interprète comme un index hors bornes, donc du silence. Le plancher garde un
    // vingtième du retard de base, assez pour que la modulation continue d'agir.
    r[i] = base * Math.max(0.05, 1 + p + s);
  }
  return r;
}

/**
 * Saturation douce de la bande : `tanh`, normalisée pour garder le niveau.
 *
 * Sans la normalisation, monter l'attaque ferait BAISSER le son — `tanh(3x)/1` écrase les crêtes
 * et l'on croirait à un défaut. Diviser par `tanh(attaque)` rend l'unité à l'unité, si bien que le
 * réglage ne change que la forme, pas le volume.
 */
export function saturerBande(v: number, attaque: number): number {
  if (attaque <= 0) return v;
  return Math.tanh(attaque * v) / Math.tanh(attaque);
}

export function bande(x: Float32Array, o: OptionsBande): Float32Array {
  const n = x.length;
  const y = lireAvecRetard(x, retardsBande(n, o));
  let g = (o.graine | 0) || 1;
  const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };

  // Les décrochages : des creux courts, avec un fondu, sinon on entendrait des clics.
  const creux = new Float32Array(n).fill(1);
  const combien = Math.round((o.decrochages * n) / o.frequence);
  const longueur = Math.max(2, Math.round(0.02 * o.frequence));
  for (let k = 0; k < combien; k++) {
    const debut = Math.floor(alea() * Math.max(1, n - longueur));
    const profondeur = 0.2 + alea() * 0.75;
    for (let i = 0; i < longueur; i++) {
      const forme = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (longueur - 1));
      creux[debut + i] *= 1 - profondeur * forme;
    }
  }

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = saturerBande(y[i], o.saturation) * creux[i] + (alea() * 2 - 1) * o.souffle;
  }
  return out;
}
