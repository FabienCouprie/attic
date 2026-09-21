// audio/multicanal.ts — Composer l'espace : dispositions, panoramique, champ sonore, objets.
//
// POURQUOI UN MODULE ET NON UN EFFET DE PLUS. La spatialisation n'est plus un traitement de fin de
// chaîne ; c'est une dimension d'écriture — des trajectoires, des masses qui se déplacent, un
// espace composé comme on compose des hauteurs. Attic savait faire tourner un champ ambisonique,
// mais le redescendait en stéréo DANS le nœud : le champ n'existait jamais entre deux nœuds, et
// l'on ne pouvait donc rien lui faire. Ce module fait de l'espace un flux.
//
// LE PRINCIPE DONT TOUT DÉCOULE : LE NOMBRE DE CANAUX NE SUFFIT PAS, IL FAUT LA DISPOSITION. Quatre
// canaux, c'est une quadriphonie OU une ambisonie d'ordre un — même nombre, deux mondes : les
// mélanger comme des haut-parleurs rendrait du bruit. Un `AudioBuffer` ne porte que le nombre. La
// disposition est donc attachée au tampon (`etiqueter`), et le moteur la transmet d'un nœud à
// l'autre (`heriterDisposition`) — sans quoi chaque effet ordinaire, qui fabrique un tampon neuf,
// la perdrait au passage.
//
// QUATRE FAMILLES, UNE SEULE CONVENTION D'ANGLES. L'azimut compte en degrés, POSITIF VERS LA
// GAUCHE, zéro devant ; l'élévation en degrés, positive vers le haut. C'est la convention de
// l'ambisonie et de l'UIT, et la tenir partout évite l'erreur classique d'un panoramique qui tourne
// à l'envers d'un décodeur.
//
// Références : Ville Pulkki, « Virtual Sound Source Positioning Using Vector Base Amplitude
// Panning », JAES 45(6), 1997 ; UIT-R BS.2051-3 (dispositions à canaux) ; Nachbar, Zotter, Deleflie
// et Sontacchi, « AmbiX — a suggested ambisonics format », Ambisonics Symposium 2011 (ordre ACN,
// normalisation SN3D) ; Zotter et Frank, « Ambisonics », Springer 2019 (décodage).

// ── Les dispositions ──────────────────────────────────────────────────────────────────────────

export type FamilleDisposition = "canaux" | "anneau" | "ambisonie";

export interface HautParleur {
  /** Nom court du canal, tel qu'un mélangeur l'affiche. */
  nom: string;
  azimut: number;
  elevation: number;
  /** Le caisson de graves ne reçoit aucun panoramique : il n'a pas de direction. */
  lfe?: boolean;
}

export interface Disposition {
  id: string;
  fr: string;
  en: string;
  famille: FamilleDisposition;
  /** Pour les dispositions à haut-parleurs, dans l'ORDRE DES CANAUX du fichier. */
  hautParleurs: HautParleur[];
  /** Pour l'ambisonie : l'ordre, qui fixe le nombre de canaux, (ordre + 1)². */
  ordre?: number;
  /**
   * Le masque de canaux du format WAV étendu, qui dit à tout lecteur quel canal est quel
   * haut-parleur. Zéro quand aucun haut-parleur standard ne correspond — un anneau libre, un champ
   * ambisonique —, ce que le format prévoit explicitement.
   */
  masque: number;
}

// Les bits du masque de canaux (Microsoft, WAVE_FORMAT_EXTENSIBLE). L'ordre des canaux dans le
// fichier DOIT suivre l'ordre croissant de ces bits : c'est la seule règle, et c'est pourquoi les
// dispositions ci-dessous listent leurs haut-parleurs dans cet ordre-là et pas un autre.
const FL = 0x1, FR = 0x2, FC = 0x4, LFE = 0x8, BL = 0x10, BR = 0x20, SL = 0x200, SR = 0x400;
const TFL = 0x1000, TFR = 0x4000, TBL = 0x8000, TBR = 0x20000;

const hp = (nom: string, azimut: number, elevation = 0, lfe = false): HautParleur =>
  ({ nom, azimut, elevation, ...(lfe ? { lfe } : {}) });

/** Un anneau horizontal de N haut-parleurs régulièrement espacés, une paire de part et d'autre de l'axe. */
export function anneau(n: number): HautParleur[] {
  const k = Math.max(3, Math.round(n));
  const pas = 360 / k;
  // Le canal un est à gauche de l'axe, et l'on tourne dans le sens des aiguilles d'une montre vu
  // d'en haut : c'est la numérotation la plus répandue des anneaux de concert. Elle n'est pas
  // universelle, et la notice du nœud le dit.
  return Array.from({ length: k }, (_, i) => {
    const az = pas / 2 - i * pas;
    return hp(String(i + 1), ((az + 540) % 360) - 180);
  });
}

export const DISPOSITIONS: Disposition[] = [
  { id: "stereo", fr: "Stéréo", en: "Stereo", famille: "canaux", masque: FL | FR,
    hautParleurs: [hp("L", 30), hp("R", -30)] },
  { id: "quad", fr: "Quadriphonie", en: "Quad", famille: "canaux", masque: FL | FR | BL | BR,
    hautParleurs: [hp("L", 45), hp("R", -45), hp("Ls", 135), hp("Rs", -135)] },
  { id: "5.1", fr: "5.1", en: "5.1", famille: "canaux", masque: FL | FR | FC | LFE | BL | BR,
    hautParleurs: [hp("L", 30), hp("R", -30), hp("C", 0), hp("LFE", 0, 0, true), hp("Ls", 110), hp("Rs", -110)] },
  { id: "7.1", fr: "7.1", en: "7.1", famille: "canaux", masque: FL | FR | FC | LFE | BL | BR | SL | SR,
    hautParleurs: [hp("L", 30), hp("R", -30), hp("C", 0), hp("LFE", 0, 0, true),
      hp("Lrs", 135), hp("Rrs", -135), hp("Lss", 90), hp("Rss", -90)] },
  { id: "7.1.4", fr: "7.1.4", en: "7.1.4", famille: "canaux",
    masque: FL | FR | FC | LFE | BL | BR | SL | SR | TFL | TFR | TBL | TBR,
    hautParleurs: [hp("L", 30), hp("R", -30), hp("C", 0), hp("LFE", 0, 0, true),
      hp("Lrs", 135), hp("Rrs", -135), hp("Lss", 90), hp("Rss", -90),
      hp("Ltf", 45, 45), hp("Rtf", -45, 45), hp("Ltr", 135, 45), hp("Rtr", -135, 45)] },
  { id: "octo", fr: "Octophonie (anneau de 8)", en: "Octophony (ring of 8)", famille: "anneau", masque: 0,
    hautParleurs: anneau(8) },
  { id: "anneau-16", fr: "Anneau de 16", en: "Ring of 16", famille: "anneau", masque: 0,
    hautParleurs: anneau(16) },
  { id: "foa", fr: "Ambisonie ordre 1 (AmbiX)", en: "Ambisonics order 1 (AmbiX)", famille: "ambisonie", ordre: 1, masque: 0,
    hautParleurs: [] },
  { id: "hoa2", fr: "Ambisonie ordre 2 (AmbiX)", en: "Ambisonics order 2 (AmbiX)", famille: "ambisonie", ordre: 2, masque: 0,
    hautParleurs: [] },
  { id: "hoa3", fr: "Ambisonie ordre 3 (AmbiX)", en: "Ambisonics order 3 (AmbiX)", famille: "ambisonie", ordre: 3, masque: 0,
    hautParleurs: [] },
];

export const dispositionParId = (id: string): Disposition | undefined => DISPOSITIONS.find((d) => d.id === id);

/** Le nombre de canaux qu'une disposition occupe. */
export const nombreDeCanaux = (d: Disposition): number =>
  d.famille === "ambisonie" ? ((d.ordre ?? 1) + 1) ** 2 : d.hautParleurs.length;

// ── La disposition attachée au tampon ─────────────────────────────────────────────────────────

// UNE TABLE FAIBLE ET NON UN CHAMP AJOUTÉ AU TAMPON. Écrire une propriété sur un `AudioBuffer` ne
// survivrait à rien et polluerait un objet du navigateur ; une table faible ne retient pas le
// tampon en mémoire, et disparaît avec lui.
const etiquettes = new WeakMap<object, string>();

/** Attache une disposition à un tampon, et le rend pour qu'on puisse chaîner. */
export function etiqueter<T extends object>(tampon: T, disposition: string): T {
  etiquettes.set(tampon, disposition);
  return tampon;
}

/** La disposition d'un tampon, si quelqu'un l'a déclarée. */
export function dispositionDe(tampon: unknown): Disposition | undefined {
  if (!tampon || typeof tampon !== "object") return undefined;
  const id = etiquettes.get(tampon);
  return id ? dispositionParId(id) : undefined;
}

/**
 * Transmet la disposition des entrées aux sorties qui n'en portent pas.
 *
 * C'EST LA RÈGLE QUI REND LE RESTE POSSIBLE, et elle tient en une ligne : une sortie de même nombre
 * de canaux qu'une entrée étiquetée hérite de son étiquette. Un égaliseur appliqué à un 7.1.4 rend
 * douze canaux ; ce sont les douze mêmes, et ils doivent le rester. Sans cette règle, le premier
 * effet ordinaire — qui fabrique un tampon neuf — effacerait la disposition, et l'export ne saurait
 * plus dire quel canal est le centre.
 *
 * Elle ne devine JAMAIS à partir du seul nombre. Quatre canaux sans étiquette restent sans
 * étiquette : quadriphonie ou ambisonie, personne ne peut le savoir, et le supposer serait pire que
 * l'ignorer.
 */
export function heriterDisposition(sorties: readonly unknown[], entrees: readonly unknown[]): void {
  const candidates = entrees
    .map((e) => ({ e, d: dispositionDe(e) }))
    .filter((x): x is { e: AudioBuffer; d: Disposition } => !!x.d && typeof (x.e as AudioBuffer)?.numberOfChannels === "number");
  if (candidates.length === 0) return;
  for (const s of sorties) {
    if (!s || typeof (s as AudioBuffer).numberOfChannels !== "number" || dispositionDe(s)) continue;
    const n = (s as AudioBuffer).numberOfChannels;
    const source = candidates.find((c) => c.e.numberOfChannels === n);
    if (source) etiqueter(s as object, source.d.id);
  }
}

// ── Les directions ────────────────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;

/** Vecteur unitaire d'une direction : x devant, y à gauche, z en haut. */
export function vecteur(azimut: number, elevation: number): [number, number, number] {
  const a = azimut * RAD, e = elevation * RAD;
  return [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
}

/** Ramène un azimut dans ]−180, 180]. */
export const normaliserAzimut = (a: number): number => {
  const r = ((a % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
};

// ── Le panoramique par vecteurs (VBAP) ────────────────────────────────────────────────────────

/**
 * Les gains d'un plan de haut-parleurs pour une direction horizontale — VBAP à deux dimensions.
 *
 * LA SOURCE N'EXCITE QUE LA PAIRE QUI L'ENCADRE. C'est tout l'intérêt de la méthode de Pulkki, et
 * ce qui la distingue d'un panoramique qui répandrait un peu de chaque source partout : une source
 * posée sur un haut-parleur ne sort que par lui, une source entre deux ne sort que par ces deux.
 * Les gains sont ensuite normalisés en PUISSANCE — la somme de leurs carrés vaut un —, faute de
 * quoi une source perdrait trois décibels en passant entre deux haut-parleurs et en regagnerait
 * trois en arrivant sur l'un d'eux : un « trou au milieu » que l'oreille entend très bien.
 */
export function vbapPlan(azimut: number, plan: readonly { azimut: number }[]): number[] {
  const gains = new Array<number>(plan.length).fill(0);
  if (plan.length === 0) return gains;
  if (plan.length === 1) { gains[0] = 1; return gains; }
  const az = normaliserAzimut(azimut);
  // Les haut-parleurs triés par azimut : chaque paire voisine est un secteur, le dernier refermant
  // le cercle avec le premier.
  const tries = plan.map((p, i) => ({ i, a: normaliserAzimut(p.azimut) })).sort((x, y) => x.a - y.a);
  for (let k = 0; k < tries.length; k++) {
    const g1 = tries[k], g2 = tries[(k + 1) % tries.length];
    const debut = g1.a;
    let fin = g2.a;
    if (fin <= debut) fin += 360;
    let s = az;
    if (s < debut) s += 360;
    if (s < debut - 1e-9 || s > fin + 1e-9) continue;
    const ouverture = fin - debut;
    // Un secteur de plus de 180° n'a pas de base vectorielle : deux haut-parleurs opposés, ou une
    // disposition frontale seulement. On y panoramique alors en puissance constante sur l'angle,
    // ce qui reste continu et ne produit jamais de gain négatif.
    if (ouverture >= 180 - 1e-6) {
      const t = ouverture > 0 ? (s - debut) / ouverture : 0;
      gains[g1.i] = Math.cos((t * Math.PI) / 2);
      gains[g2.i] = Math.sin((t * Math.PI) / 2);
      return gains;
    }
    // La base de Pulkki : la direction de la source, exprimée dans la base des deux haut-parleurs.
    const [x1, y1] = [Math.cos(debut * RAD), Math.sin(debut * RAD)];
    const [x2, y2] = [Math.cos(fin * RAD), Math.sin(fin * RAD)];
    const [px, py] = [Math.cos(s * RAD), Math.sin(s * RAD)];
    const det = x1 * y2 - x2 * y1;
    let a = (px * y2 - py * x2) / det;
    let b = (x1 * py - y1 * px) / det;
    a = Math.max(0, a); b = Math.max(0, b);
    const norme = Math.hypot(a, b) || 1;
    gains[g1.i] += a / norme;
    gains[g2.i] += b / norme;
    return gains;
  }
  return gains;
}

/**
 * Les gains de toute une disposition à haut-parleurs, pour une direction quelconque.
 *
 * LES HAUTEURS SE TRAITENT PAR COUCHES. Une disposition comme le 7.1.4 porte deux plans, l'oreille
 * et le plafond. La source est panoramiquée en azimut dans CHACUN des deux plans par VBAP, puis
 * répartie entre eux selon son élévation, en puissance constante : c'est le panoramique par couches,
 * robuste et continu, qui tient la puissance totale constante où que la source se trouve. Un VBAP
 * en triangles à trois dimensions ferait légèrement mieux entre les couches ; il est plus lourd, et
 * cette version n'en a pas eu besoin pour tenir ses invariants.
 */
export function gainsPourDirection(d: Disposition, azimut: number, elevation: number): number[] {
  const gains = new Array<number>(d.hautParleurs.length).fill(0);
  const actifs = d.hautParleurs.map((h, i) => ({ ...h, i })).filter((h) => !h.lfe);
  if (actifs.length === 0) return gains;
  const hauteurs = [...new Set(actifs.map((h) => h.elevation))].sort((x, y) => x - y);
  const plan = (e: number) => actifs.filter((h) => h.elevation === e);
  const poser = (couche: typeof actifs, poids: number) => {
    const g = vbapPlan(azimut, couche);
    couche.forEach((h, k) => { gains[h.i] += g[k] * poids; });
  };
  if (hauteurs.length === 1) { poser(plan(hauteurs[0]), 1); return gains; }
  const el = Math.max(hauteurs[0], Math.min(hauteurs[hauteurs.length - 1], elevation));
  let k = 0;
  while (k < hauteurs.length - 2 && el > hauteurs[k + 1]) k++;
  const [bas, haut] = [hauteurs[k], hauteurs[k + 1]];
  const t = haut > bas ? (el - bas) / (haut - bas) : 0;
  poser(plan(bas), Math.cos((t * Math.PI) / 2));
  poser(plan(haut), Math.sin((t * Math.PI) / 2));
  return gains;
}

// ── Les harmoniques sphériques (AmbiX : ordre ACN, normalisation SN3D) ────────────────────────

/**
 * Les harmoniques sphériques réelles jusqu'à l'ordre trois, en ACN et SN3D.
 *
 * CES COEFFICIENTS SONT RECOPIÉS D'UNE TABLE, DONC ILS SONT VÉRIFIÉS. La normalisation SN3D a une
 * propriété qui ne tient que si chacun est juste : pour toute direction, la somme des carrés des
 * composantes d'un même degré vaut exactement un. Une racine de trois oubliée à l'ordre deux passe
 * inaperçue à l'oreille — le champ décodé est seulement un peu faux —, et le test l'attrape.
 */
export function harmoniques(azimut: number, elevation: number, ordre: number): number[] {
  const a = azimut * RAD, e = elevation * RAD;
  const ce = Math.cos(e), se = Math.sin(e);
  const y: number[] = [1];
  if (ordre >= 1) y.push(Math.sin(a) * ce, se, Math.cos(a) * ce);
  if (ordre >= 2) {
    const r3 = Math.sqrt(3) / 2;
    y.push(
      r3 * Math.sin(2 * a) * ce * ce,
      r3 * Math.sin(a) * Math.sin(2 * e),
      0.5 * (3 * se * se - 1),
      r3 * Math.cos(a) * Math.sin(2 * e),
      r3 * Math.cos(2 * a) * ce * ce,
    );
  }
  if (ordre >= 3) {
    const c1 = Math.sqrt(5 / 8), c2 = Math.sqrt(15) / 2, c3 = Math.sqrt(3 / 8);
    y.push(
      c1 * Math.sin(3 * a) * ce ** 3,
      c2 * Math.sin(2 * a) * se * ce * ce,
      c3 * Math.sin(a) * ce * (5 * se * se - 1),
      0.5 * se * (5 * se * se - 3),
      c3 * Math.cos(a) * ce * (5 * se * se - 1),
      c2 * Math.cos(2 * a) * se * ce * ce,
      c1 * Math.cos(3 * a) * ce ** 3,
    );
  }
  return y;
}

/** Le degré de la composante ACN n : 0 pour W, 1 pour Y Z X, et ainsi de suite. */
export const degreACN = (n: number): number => Math.floor(Math.sqrt(n));

/**
 * La matrice d'un décodeur échantillonnant : pour chaque haut-parleur, le poids de chaque composante.
 *
 * LE FACTEUR (2l + 1) DÉFAIT LA NORMALISATION SN3D, et l'oublier est la faute classique. Encodée en
 * SN3D, une composante de degré l est plus faible qu'en N3D d'un facteur racine de (2l + 1) ;
 * décoder sans le rétablir donne un champ dominé par l'omnidirectionnelle, où toutes les sources
 * paraissent venir de partout à la fois. Avec lui, le théorème d'addition fait culminer chaque
 * source sur le haut-parleur le plus proche de sa direction — ce qu'un test vérifie.
 *
 * Les poids « max-rE » de Zotter et Frank concentrent en outre l'énergie vers la bonne direction et
 * réduisent les lobes arrière : c'est le décodeur à préférer pour l'écoute, et le défaut ici.
 */
export function matriceDecodage(ordre: number, cibles: readonly HautParleur[], maxRE = true): number[][] {
  const n = (ordre + 1) ** 2;
  const actifs = cibles.filter((h) => !h.lfe);
  // Les poids max-rE : cos(π·l / (2N + 2)) par degré, pour un décodage à trois dimensions de rang N,
  // une approximation standard qui tient remarquablement bien jusqu'à l'ordre trois.
  const poids = Array.from({ length: ordre + 1 }, (_, l) => (maxRE ? Math.cos((Math.PI * l) / (2 * ordre + 2)) : 1));
  return cibles.map((h) => {
    if (h.lfe) return new Array<number>(n).fill(0);
    const y = harmoniques(h.azimut, h.elevation, ordre);
    return y.map((v, k) => ((2 * degreACN(k) + 1) * poids[degreACN(k)] * v) / Math.max(1, actifs.length));
  });
}

/**
 * Des haut-parleurs virtuels répartis sur la sphère, pour écouter un champ ambisonique au casque.
 *
 * VINGT-SIX DIRECTIONS : LES FACES, LES ARÊTES ET LES SOMMETS D'UN CUBE. Un décodeur échantillonnant
 * a besoin de directions à peu près uniformes pour que le champ ne penche d'aucun côté ; celles-ci
 * le sont assez jusqu'à l'ordre trois, et chacune devient ensuite une source HRTF.
 */
export function sphereVirtuelle(): HautParleur[] {
  const out: HautParleur[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    if (x === 0 && y === 0 && z === 0) continue;
    const r = Math.hypot(x, y, z);
    out.push(hp(`v${out.length + 1}`, Math.atan2(y, x) / RAD, Math.asin(z / r) / RAD));
  }
  return out;
}

// ── Le rendu ──────────────────────────────────────────────────────────────────────────────────

/** Une trajectoire : une valeur par échantillon, ou une constante. */
export interface Trajectoire {
  azimut: Float32Array | number;
  elevation: Float32Array | number;
  /** Distance relative : un pour la référence, deux pour deux fois plus loin. */
  distance?: Float32Array | number;
}

const lire = (v: Float32Array | number | undefined, i: number, defaut: number): number =>
  v === undefined ? defaut : typeof v === "number" ? v : (v[Math.min(i, v.length - 1)] ?? defaut);

/**
 * Place un son mono sur une trajectoire, dans une disposition — à haut-parleurs ou ambisonique.
 *
 * LES GAINS SONT RECALCULÉS PAR BLOC DE SOIXANTE-QUATRE ÉCHANTILLONS, ET INTERPOLÉS ENTRE DEUX. Les
 * recalculer à chaque échantillon coûterait cher pour rien — une trajectoire ne tourne pas à
 * quarante-quatre mille tours par seconde —, mais les tenir constants sur un bloc ferait sauter le
 * gain à chaque frontière et s'entendrait comme un grésillement sur les trajectoires rapides.
 *
 * La distance suit la loi en 1/r au-delà de la référence, et s'arrête à un en deçà : une source
 * « plus proche que la référence » ne doit pas devenir infiniment forte.
 */
export function spatialiser(
  mono: Float32Array, d: Disposition, t: Trajectoire,
): Float32Array[] {
  const canaux = nombreDeCanaux(d);
  const out = Array.from({ length: canaux }, () => new Float32Array(mono.length));
  const BLOC = 64;
  const gainsA = (i: number): number[] => {
    const az = lire(t.azimut, i, 0), el = lire(t.elevation, i, 0);
    const dist = Math.max(1, lire(t.distance, i, 1));
    const g = d.famille === "ambisonie"
      ? harmoniques(az, el, d.ordre ?? 1)
      : gainsPourDirection(d, az, el);
    return g.map((v) => v / dist);
  };
  let precedent = gainsA(0);
  for (let debut = 0; debut < mono.length; debut += BLOC) {
    const fin = Math.min(mono.length, debut + BLOC);
    const suivant = gainsA(fin - 1);
    const longueur = fin - debut;
    for (let c = 0; c < canaux; c++) {
      const g0 = precedent[c], g1 = suivant[c];
      if (g0 === 0 && g1 === 0) continue;
      const pente = (g1 - g0) / longueur;
      const dst = out[c];
      for (let i = 0; i < longueur; i++) dst[debut + i] = mono[debut + i] * (g0 + pente * i);
    }
    precedent = suivant;
  }
  return out;
}

/** Décode un champ ambisonique vers une disposition à haut-parleurs. */
export function decoder(champ: readonly Float32Array[], ordre: number, cibles: readonly HautParleur[], maxRE = true): Float32Array[] {
  const m = matriceDecodage(ordre, cibles, maxRE);
  const n = Math.min(champ.length, (ordre + 1) ** 2);
  const longueur = champ[0]?.length ?? 0;
  return m.map((ligne) => {
    const s = new Float32Array(longueur);
    for (let k = 0; k < n; k++) {
      const w = ligne[k];
      if (w === 0) continue;
      const src = champ[k];
      for (let i = 0; i < longueur; i++) s[i] += w * src[i];
    }
    return s;
  });
}

/**
 * Replie une disposition quelconque en stéréo, pour l'aperçu qu'on écoute sous un nœud.
 *
 * L'APERÇU MULTICANAL COÛTAIT TRÈS CHER ET NE SERVAIT À RIEN. Un aperçu à seize canaux d'un champ
 * ambisonique d'ordre trois pèse huit fois celui d'une stéréo — mesuré : 127 Mo par minute et par
 * nœud, retenus par le processus principal —, et le lecteur du navigateur le jouait en prenant ses
 * composantes pour des enceintes, ce qui ne ressemble à rien. Ce repliement est calculé ici, par
 * le même panoramique que le reste de la famille : chaque haut-parleur est replacé dans la paire
 * stéréo selon son azimut, un champ ambisonique étant d'abord décodé vers un anneau virtuel de huit.
 *
 * Ce n'est pas l'écoute juste de l'espace — l'avant et l'arrière s'y confondent, comme dans tout
 * repliement stéréo ; « Écoute binaurale » est là pour cela. C'est un aperçu qui ressemble à la
 * pièce, au sixième de son poids. Le fichier enregistré, lui, reste multicanal.
 */
export function replierEnStereo(canaux: readonly Float32Array[], d: Disposition): Float32Array[] {
  const n = canaux[0]?.length ?? 0;
  const gauche = new Float32Array(n), droite = new Float32Array(n);
  const stereo = dispositionParId("stereo")!;
  const virtuel = d.famille === "ambisonie";
  const hautParleurs = virtuel ? anneau(8) : d.hautParleurs;
  const signaux = virtuel ? decoder(canaux, d.ordre ?? 1, hautParleurs) : canaux;
  hautParleurs.forEach((h, k) => {
    const s = signaux[k];
    if (!s) return;
    const [gL, gR] = h.lfe ? [0.5, 0.5] : gainsPourDirection(stereo, h.azimut, 0);
    for (let i = 0; i < n; i++) { gauche[i] += gL * s[i]; droite[i] += gR * s[i]; }
  });
  return [gauche, droite];
}

/** Réduit n'importe quel tampon à un mono, en moyenne des canaux. */
export function versMono(canaux: readonly Float32Array[]): Float32Array {
  const n = canaux[0]?.length ?? 0;
  const out = new Float32Array(n);
  if (canaux.length === 0) return out;
  for (const c of canaux) for (let i = 0; i < n; i++) out[i] += c[i];
  for (let i = 0; i < n; i++) out[i] /= canaux.length;
  return out;
}

// ── Les objets ────────────────────────────────────────────────────────────────────────────────

/**
 * Un objet sonore : un son et sa trajectoire, sans disposition.
 *
 * C'EST LA FAMILLE LA PLUS COMPOSITIONNELLE, parce qu'elle sépare ce qu'on écrit de l'endroit où on
 * le joue. Un objet ne sait pas s'il finira en 5.1, en anneau de seize ou au casque : il ne porte
 * que son mouvement. La disposition n'est choisie qu'au rendu, une fois pour tous les objets — et la
 * changer rejoue la même pièce dans une autre salle sans rien réécrire.
 */
export interface ObjetSonore {
  genre: "objet-sonore";
  son: Float32Array;
  frequence: number;
  trajectoire: Trajectoire;
  nom?: string;
}

export const estObjet = (v: unknown): v is ObjetSonore =>
  !!v && typeof v === "object" && (v as ObjetSonore).genre === "objet-sonore";

/** Rend une liste d'objets dans une disposition, en les additionnant. */
export function rendreObjets(objets: readonly ObjetSonore[], d: Disposition): Float32Array[] {
  const canaux = nombreDeCanaux(d);
  const longueur = Math.max(0, ...objets.map((o) => o.son.length));
  const out = Array.from({ length: canaux }, () => new Float32Array(longueur));
  for (const o of objets) {
    const rendu = spatialiser(o.son, d, o.trajectoire);
    for (let c = 0; c < canaux; c++) {
      const src = rendu[c], dst = out[c];
      for (let i = 0; i < src.length; i++) dst[i] += src[i];
    }
  }
  return out;
}
