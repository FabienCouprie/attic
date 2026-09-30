// audio/arc-en-ciel.ts — Le son trié par fréquence dans l'espace, et retenu là où il s'arrête.
//
// D'OÙ VIENT CE CALCUL. Le piégeage en arc-en-ciel a d'abord été proposé en optique par Kosmas L.
// Tsakmakidis, Allan D. Boardman et Ortwin Hess, « 'Trapped rainbow' storage of light in
// metamaterials », Nature 450, 2007, p. 397-401 : dans un guide d'onde effilé, chaque longueur
// d'onde s'immobilise à une profondeur différente. Son analogue acoustique est démontré par Jie Zhu,
// Yong Chen, Xuefeng Zhu et al., « Acoustic rainbow trapping », Scientific Reports 3, 2013, 1728,
// avec un réseau GRADUÉ de résonateurs dont la fréquence propre varie le long de la structure ;
// Noé Jiménez, Vicent Romero-García, Vincent Pagneux et Jean-Philippe Groby, « Rainbow-trapping
// absorbers », Scientific Reports 7, 2017, 13595, en tirent un absorbeur large bande.
//
// CE QUE LE DISPOSITIF FAIT, ET QU'AUCUN AUTRE COMPOSANT NE FAIT ICI. Il établit une carte entre la
// FRÉQUENCE et la POSITION. Une onde large bande entre, ralentit, et chaque bande s'arrête là où la
// résonance locale la rattrape : les aigus tôt, les graves loin. Trois conséquences tiennent au même
// gradient, et c'est ce qui distingue l'arc-en-ciel d'un banc de filtres panoramiqué :
//   — chaque bande sort d'une DIRECTION qui lui est propre, ce qu'une métasurface à gradient de
//     phase obtient par déviation angulaire, comme un réseau de diffraction ;
//   — chaque bande arrive à un INSTANT qui lui est propre, le trajet étant d'autant plus long que
//     la bande s'arrête loin ;
//   — chaque bande DEMEURE là où elle s'est arrêtée, le temps que sa résonance se dissipe.
//
// CE QUI EST CALCULÉ, ET CE QUI NE L'EST PAS. Ce n'est pas une simulation de métamatériau : une
// différence finie sur un réseau gradué coûterait des heures et n'apporterait rien à l'oreille.
// C'est la LOI du dispositif, appliquée à un banc de résonateurs à deux pôles, comme les modèles
// physiques du dépôt appliquent la leur.
//
// LE BANC EST À Q CONSTANT, ET CE N'EST PAS UN DÉTAIL. Un résonateur à deux pôles n'a qu'un seul
// réglage : sa largeur de bande et son temps de décroissance sont la même chose. À Q constant, le
// temps de résonance décroît donc quand la fréquence monte, si bien que la bande qui va le plus loin
// est aussi celle qui demeure le plus longtemps. Le réglage se donne en secondes sur la bande la
// plus grave, parce que c'est ce qu'une oreille sait juger.
import { picTampon } from "./mixage";

export interface OptionsArcEnCiel {
  /** Nombre de bandes du banc. */
  bandes: number;
  /** Bord grave du banc, en hertz. */
  grave: number;
  /** Bord aigu du banc, en hertz. */
  aigu: number;
  /** Le grave sort-il à gauche ou à droite ? */
  sens: "grave-gauche" | "grave-droite";
  /** Part de l'étendue stéréo employée, de 0 (tout au centre) à 100. */
  ouverture: number;
  /**
   * Courbure du gradient, de −100 à 100. À zéro, la position suit le rang de la bande ; au-dessus,
   * les graves se resserrent d'un côté ; en dessous, ce sont les aigus.
   */
  courbure: number;
  /** Trajet de la bande la plus lente, en secondes. Les autres arrivent plus tôt. */
  dispersion: number;
  /** Temps de résonance de la bande la plus grave, en secondes. */
  piegeage: number;
  /** Part du son trié, de 0 à 100. */
  mix: number;
}

/** Ce qu'une bande du banc devient : où elle sort, quand, et combien de temps elle demeure. */
export interface BandeArcEnCiel {
  /** Fréquence propre, en hertz. */
  frequence: number;
  /** Retard du trajet, en secondes. */
  retard: number;
  /** Temps de décroissance de 60 dB, en secondes. */
  t60: number;
  /** Position stéréo, de −1 à gauche à +1 à droite. */
  position: number;
}

const borne = (v: number, bas: number, haut: number) => Math.max(bas, Math.min(haut, v));

/**
 * Le pôle qui donne la décroissance demandée, POUR DEUX SECTIONS EN CASCADE.
 *
 * DEUX SECTIONS NE DÉCROISSENT PAS COMME UNE SEULE. L'enveloppe d'une seule est en e^(−αt), et il
 * lui faut 6,91/α pour tomber de 60 dB ; celle de deux est en t·e^(−αt), dont le sommet passé il
 * faut 10,23/α. Calculer le pôle sur 6,91 faisait donc annoncer une demeure de moitié plus courte
 * que celle qu'on entend : MESURÉ 0,442 seconde pour 0,3 demandée, et 1,476 pour 1,0, soit le
 * rapport 10,23/6,91 = 1,48 des deux côtés.
 */
const POLE_DEUX_SECTIONS = 10.23;
const poleDe = (t60: number, sr: number): number =>
  Math.exp(-POLE_DEUX_SECTIONS / (Math.max(0.001, t60) * sr));

/**
 * La carte de l'arc-en-ciel : une bande par rang, avec sa fréquence, son trajet, sa demeure et sa
 * place.
 *
 * ELLE EST SÉPARÉE DU RENDU PARCE QU'ELLE EST LA PIÈCE QU'ON VÉRIFIE. Tout ce que le composant
 * promet tient dans ce tableau : que les fréquences se rangent, que les trajets s'ordonnent, que les
 * places se répartissent. Un test qui doit rendre du son pour le constater ne constaterait rien.
 */
export function bandesArcEnCiel(o: OptionsArcEnCiel): BandeArcEnCiel[] {
  const n = Math.max(2, Math.round(o.bandes));
  const grave = Math.max(1, Math.min(o.grave, o.aigu));
  const aigu = Math.max(grave * 1.01, Math.max(o.grave, o.aigu));
  const etendue = borne(o.ouverture, 0, 100) / 100;
  // L'exposant du gradient : un à plat, plus grand quand on resserre vers le grave.
  const gamma = Math.pow(4, borne(o.courbure, -100, 100) / 100);
  const dispersion = Math.max(0, o.dispersion);
  const piegeage = Math.max(0.005, o.piegeage);

  return Array.from({ length: n }, (_, k) => {
    const rang = k / (n - 1);
    const frequence = grave * Math.pow(aigu / grave, rang);
    const g = Math.pow(rang, gamma);
    // LE GRAVE VA LE PLUS LOIN, donc il arrive le dernier : le trajet décroît quand la bande monte.
    const retard = dispersion * (1 - g);
    // À Q CONSTANT, le temps de résonance suit l'inverse de la fréquence.
    const t60 = piegeage * (grave / frequence);
    const place = (g * 2 - 1) * etendue;
    return { frequence, retard, t60, position: o.sens === "grave-droite" ? -place : place };
  });
}

/** La longueur du rendu : le son, plus le trajet le plus long, plus la demeure la plus longue. */
export function dureeArcEnCiel(entree: number, bandes: BandeArcEnCiel[]): number {
  const queue = bandes.reduce((m, b) => Math.max(m, b.retard + Math.min(20, b.t60)), 0);
  return entree + queue;
}

/**
 * Le rendu.
 *
 * L'ENTRÉE EST SOMMÉE EN MONO, et il le faut : ce composant REFAIT l'image stéréo à partir de la
 * fréquence. Garder celle qu'il reçoit ferait tenir deux cartes à la fois sur la même sortie, dont
 * l'une contredirait l'autre.
 */
export function arcEnCiel(buffer: AudioBuffer, o: OptionsArcEnCiel): AudioBuffer {
  const sr = buffer.sampleRate;
  const nyquist = sr / 2;
  const bandes = bandesArcEnCiel(o).filter((b) => b.frequence < nyquist * 0.98);
  const n = Math.round(dureeArcEnCiel(buffer.length / sr, bandes) * sr);

  // Le son reçu, ramené à une voie : c'est lui que le banc trie.
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) mono[i] += x[i] / buffer.numberOfChannels;
  }

  const humide = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  const gauche = humide.getChannelData(0);
  const droite = humide.getChannelData(1);

  for (const b of bandes) {
    // DEUX SECTIONS, ET LA PREMIÈRE VERSION N'EN AVAIT QU'UNE : c'était la faute.
    //
    // Un résonateur tout-pôles, celui du banc de résonateurs du dépôt, n'a AUCUN ZÉRO au continu :
    // sa réponse au grave ne descend pas, elle vaut (1 − r) fois son sommet. Chaque bande aiguë
    // laissait donc passer le grave, et ces fuites s'ajoutent EN PHASE : mesuré sur une sinusoïde de
    // 100 Hz dans un banc de vingt-quatre bandes, la bande accordée rendait une énergie de 5 921 et
    // chacune des dix-huit bandes aiguës encore 160, dont la somme cohérente l'emportait. Le son
    // grave sortait du côté de l'aigu, c'est-à-dire l'inverse de ce que le composant promet.
    //
    // La forme employée ici porte ses zéros à zéro et à Nyquist, ce qui donne une vraie pente de
    // part et d'autre, et DEUX sections en cascade doublent cette pente : la fuite retombe assez bas
    // pour que la somme cohérente ne puisse plus renverser le tri.
    const r = poleDe(b.t60, sr);
    const w = (2 * Math.PI * b.frequence) / sr;
    const coefB = 2 * r * Math.cos(w);
    const r2 = r * r;
    const gain = (1 - r2) / 2;
    // Loi de panoramique à puissance constante : la somme des carrés vaut un sur toute l'étendue.
    const angle = ((b.position + 1) * Math.PI) / 4;
    const gG = Math.cos(angle);
    const gD = Math.sin(angle);
    const retard = Math.round(b.retard * sr);
    let ux1 = 0, ux2 = 0, uy1 = 0, uy2 = 0;
    let vx1 = 0, vx2 = 0, vy1 = 0, vy2 = 0;
    for (let i = 0; i < n; i++) {
      const j = i - retard;
      const u = j >= 0 && j < mono.length ? mono[j] : 0;
      const s = gain * (u - ux2) + coefB * uy1 - r2 * uy2;
      ux2 = ux1; ux1 = u; uy2 = uy1; uy1 = s;
      const v = gain * (s - vx2) + coefB * vy1 - r2 * vy2;
      vx2 = vx1; vx1 = s; vy2 = vy1; vy1 = v;
      gauche[i] += v * gG;
      droite[i] += v * gD;
    }
  }

  const pic = picTampon(humide);
  const niveau = pic > 0 ? picTampon(buffer) / pic : 0;
  const mix = borne(o.mix, 0, 100) / 100;
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const h = humide.getChannelData(c);
    const s = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
    const d = sortie.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = h[i] * niveau * mix + (i < s.length ? s[i] : 0) * (1 - mix);
  }
  return sortie;
}
