// audio/glissando.ts — Un agrégat qui glisse vers un autre, sans qu'aucune note soit posée.
//
// POURQUOI CE MODULE EXISTE, proposé puis retenu par Fabien : « un composant qui ne contient que
// des glissandos continus basé sur des accords ». Le dépôt avait trois glissandos, et les trois
// sont SANS FIN — l'illusion de Risset, celle de Klein, le glissando intérieur. Aucun ne va d'un
// point nommé à un autre, et c'est ce qui manquait : une harmonie entière qui se déplace, ce que
// Ligeti écrit dans les « Atmosphères » et qu'un ensemble à cordes joue là où un piano ne le peut.
//
// CE N'EST PAS UNE SUITE DE NOTES, ET LA SORTIE EST DONC UN SON. Un fichier MIDI ne sait pas porter
// un glissement : son numéro de note est un octet, et le pitch bend n'a qu'une valeur par canal,
// donc une seule courbe pour toutes les voix d'un même canal. Sept voix qui glissent chacune de son
// côté ne s'y écrivent pas. C'est une décision de Fabien, prise en connaissance de ce qu'elle coûte.
//
// LE GLISSEMENT EST LINÉAIRE EN DEMI-TONS, décidé par Fabien, et ce n'est pas la même musique qu'en
// hertz. Une octave en hertz passe son premier quart de temps dans son premier demi-ton : l'oreille
// entend alors un départ traînant puis une ruée. En demi-tons, chaque instant vaut le même
// intervalle, et le glissement s'entend régulier — c'est ainsi qu'on l'écrit et qu'on le joue.
//
// LES VOIX SURNUMÉRAIRES TIENNENT SUR PLACE, décidé par Fabien. Deux agrégats de tailles
// différentes n'ont pas de correspondance évidente : une voix sans destination garde sa hauteur,
// une voix sans origine part de la sienne. Rien n'est inventé, et le compte des voix est celui du
// plus fourni des deux.
//
// LA SYNTHÈSE EST ADDITIVE, ET HARMONIQUE. Le sujet est l'harmonie qui se déplace, non le timbre :
// des partiels harmoniques glissent avec leur fondamentale sans rien ajouter qu'elle n'ait déjà, là
// où une modulation de fréquence fabriquerait des bandes latérales dont le mouvement ne serait plus
// celui qu'on écrit.

import { nomNote, type Alteration } from "./nom-note";

/** Une voix du glissement : d'où elle part, où elle va, et dans lequel des deux agrégats elle est. */
export interface VoixDeGlissando {
  de: number;
  vers: number;
  /** Vraie quand cette voix appartient à l'agrégat de départ. */
  auDepart: boolean;
  /** Vraie quand elle appartient à celui d'arrivée. */
  aLArrivee: boolean;
}

/**
 * Les voix d'un glissement entre deux agrégats.
 *
 * Le compte est celui du plus fourni. Une voix que l'agrégat d'arrivée n'a pas garde sa hauteur de
 * départ ; une voix que celui de départ n'a pas garde sa hauteur d'arrivée. Dans les deux cas elle
 * tient sur place, et ne glisse pas.
 *
 * MAIS TENIR SA HAUTEUR N'EST PAS SONNER, ET LES DEUX ÉTAIENT CONFONDUS. Relevé par Fabien : « si
 * je fixe un point de départ et que je fais bouger le point d'arrivée, à l'oreille le point de
 * départ bouge ». Une voix sans origine sonnait dès le premier instant, sur sa hauteur d'arrivée :
 * un do majeur qui va vers un mi bémol mineur septième s'entendait donc, PENDANT SA TENUE, comme un
 * do majeur PLUS la quatrième note de l'accord d'arrivée. L'agrégat de départ n'était plus
 * lui-même, et il changeait selon la destination.
 *
 * UNE VOIX SANS ORIGINE ENTRE DONC, ET UNE VOIX SANS DESTINATION SORT. La hauteur tient sur place,
 * comme décidé ; c'est la PRÉSENCE qui se déplace, et elle le fait sur la durée du glissement, là
 * où le nombre de voix change. Un agrégat tenu est ainsi exactement lui-même, quel que soit l'autre.
 */
export function voixDuGlissando(
  depart: readonly number[],
  arrivee: readonly number[],
): VoixDeGlissando[] {
  const n = Math.max(depart.length, arrivee.length);
  const voix: VoixDeGlissando[] = [];
  for (let i = 0; i < n; i++) {
    const de = depart[i];
    const vers = arrivee[i];
    if (de !== undefined && vers !== undefined) voix.push({ de, vers, auDepart: true, aLArrivee: true });
    else if (de !== undefined) voix.push({ de, vers: de, auDepart: true, aLArrivee: false });
    else voix.push({ de: vers, vers, auDepart: false, aLArrivee: true });
  }
  return voix;
}

/**
 * La présence d'une voix à une part du trajet, de zéro à un.
 *
 * ELLE SE DÉPLACE SUR LA DURÉE DU GLISSEMENT, et non d'un coup : une voix qui apparaîtrait d'un
 * seul échantillon ferait un clic, qui contient toutes les fréquences.
 */
export function presenceA(voix: VoixDeGlissando, part: number): number {
  const p = Math.max(0, Math.min(1, part));
  const debut = voix.auDepart ? 1 : 0;
  const fin = voix.aLArrivee ? 1 : 0;
  return debut + (fin - debut) * p;
}

/** La hauteur d'une voix à une part du trajet, de zéro à un. Linéaire en demi-tons. */
export function hauteurA(voix: VoixDeGlissando, part: number): number {
  const p = Math.max(0, Math.min(1, part));
  return voix.de + (voix.vers - voix.de) * p;
}

/**
 * La part du trajet parcourue à l'instant `t`.
 *
 * L'AGRÉGAT DE DÉPART EST TENU AVANT, CELUI D'ARRIVÉE APRÈS : sans cela on n'entendrait que le
 * mouvement, et non ce qui bouge. Un glissement de durée nulle bascule d'un agrégat à l'autre.
 */
export function partDuGlissement(t: number, tenueDepart: number, glissement: number): number {
  if (t <= tenueDepart) return 0;
  if (glissement <= 0) return 1;
  return Math.max(0, Math.min(1, (t - tenueDepart) / glissement));
}

/** La fréquence d'un numéro de note, l'écart à l'entier compris. */
export const frequenceDe = (hauteur: number): number => 440 * 2 ** ((hauteur - 69) / 12);

export interface OptionsGlissando {
  /** Le temps pendant lequel l'agrégat de départ est tenu, en secondes. */
  tenueDepart: number;
  /** La durée du glissement lui-même, en secondes. */
  glissement: number;
  /** Le temps pendant lequel l'agrégat d'arrivée est tenu, en secondes. */
  tenueArrivee: number;
  /** Le nombre de partiels harmoniques par voix. Un seul donne une sinusoïde. */
  richesse: number;
  /** Le niveau de crête visé, de zéro à un. */
  niveau: number;
  sampleRate: number;
}

/** Le fondu des bords, en secondes. Une coupure franche contient toutes les fréquences : un clic. */
const FONDU = 0.02;

/**
 * Les échantillons du glissement, en monophonie.
 *
 * LA PHASE EST ACCUMULÉE, ET NON RECALCULÉE À CHAQUE ÉCHANTILLON. Poser la phase comme le produit
 * de la fréquence par le temps suppose une fréquence constante : sous un glissement, cela replierait
 * la phase à chaque changement, et l'on entendrait un bourdonnement à la place du son. L'intégrale
 * de la fréquence est ce qu'il faut, et l'accumulation la calcule.
 *
 * LE NIVEAU EST DIVISÉ PAR CE QUI SONNE À CET INSTANT, et non par le nombre total de voix. C'est la
 * seconde moitié du défaut relevé par Fabien : un agrégat de trois voix qui va vers un agrégat de
 * quatre était divisé par quatre PENDANT SA TENUE, donc plus faible que le même agrégat seul. Le
 * départ changeait de niveau selon l'arrivée. En divisant par la somme des présences, un agrégat
 * tenu sonne exactement comme s'il était seul.
 */
export function echantillonsDuGlissando(
  voix: readonly VoixDeGlissando[],
  o: OptionsGlissando,
): Float32Array {
  const sr = Math.max(1, Math.round(o.sampleRate));
  const duree = Math.max(0, o.tenueDepart) + Math.max(0, o.glissement) + Math.max(0, o.tenueArrivee);
  const n = Math.max(1, Math.round(duree * sr));
  const sortie = new Float32Array(n);
  if (voix.length === 0) return sortie;

  const partiels = Math.max(1, Math.round(o.richesse));
  const amplitudes = Array.from({ length: partiels }, (_, k) => 1 / (k + 1));
  const somme = amplitudes.reduce((a, b) => a + b, 0);
  const niveau = Math.max(0, Math.min(1, o.niveau));

  // Une phase par voix et par partiel, gardée d'un échantillon à l'autre.
  const phases = voix.map(() => new Float64Array(partiels));

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const part = partDuGlissement(t, o.tenueDepart, o.glissement);
    let melange = 0;
    let presentes = 0;
    for (let v = 0; v < voix.length; v++) {
      const presence = presenceA(voix[v], part);
      presentes += presence;
      const f = frequenceDe(hauteurA(voix[v], part));
      const ph = phases[v];
      // LA PHASE AVANCE MÊME QUAND LA VOIX SE TAIT : une voix qui entre doit reprendre là où son
      // oscillation en serait, faute de quoi elle partirait d'un saut de phase, donc d'un clic.
      for (let k = 0; k < partiels; k++) {
        ph[k] += (2 * Math.PI * f * (k + 1)) / sr;
        if (ph[k] > 2 * Math.PI) ph[k] -= 2 * Math.PI;
        melange += Math.sin(ph[k]) * amplitudes[k] * presence;
      }
    }
    const montee = Math.min(1, t / FONDU);
    const descente = Math.min(1, (duree - t) / FONDU);
    const gain = niveau / (Math.max(1e-9, presentes) * somme);
    sortie[i] = melange * gain * Math.max(0, Math.min(montee, descente));
  }
  return sortie;
}

/** La fréquence d'échantillonnage du rendu. */
export const SR_GLISSANDO = 44100;

/** Le glissement rendu en son, monophonique. */
export function tamponDuGlissando(
  voix: readonly VoixDeGlissando[],
  o: Omit<OptionsGlissando, "sampleRate">,
): AudioBuffer {
  const x = echantillonsDuGlissando(voix, { ...o, sampleRate: SR_GLISSANDO });
  const ctx = new OfflineAudioContext(1, x.length, SR_GLISSANDO);
  const tampon = ctx.createBuffer(1, x.length, SR_GLISSANDO);
  tampon.getChannelData(0).set(x);
  return tampon;
}

/**
 * Le trajet des voix, une par ligne.
 *
 * L'ÉCART EST DIT EN DEMI-TONS, ET NON EN HERTZ : c'est l'unité dans laquelle le glissement est
 * régulier, donc celle qui décrit ce qu'on entend. `nomNote` donne l'écart au tempéré quand il y
 * en a un, ce qui rend lisible un trajet vers un degré mesuré en cents.
 */
export function trajetDesVoix(
  voix: readonly VoixDeGlissando[],
  virgule = true,
  alterationDepart: Alteration = "diese",
  alterationArrivee: Alteration = "diese",
): string[] {
  return voix.map((v, i) => {
    const ecart = v.vers - v.de;
    const signe = ecart > 0 ? "+" : "";
    const nombre = ecart.toFixed(2).replace(".", virgule ? "," : ".");
    // CE QUI ENTRE ET CE QUI SORT SE DIT, parce que cela s'entend. Une voix qui n'appartient qu'à
    // l'un des deux agrégats n'y est pas tenue : elle apparaît, ou elle s'efface.
    const mouvement = !v.auDepart ? (virgule ? "entre" : "enters")
      : !v.aLArrivee ? (virgule ? "sort" : "leaves")
        : ecart === 0 ? (virgule ? "tenue" : "held")
          : `${signe}${nombre}`;
    // CHAQUE NOTE S'ÉCRIT DANS LA GRAPHIE DE L'AGRÉGAT DONT ELLE VIENT, et les deux côtés d'une
    // même ligne peuvent donc différer : un do majeur qui va vers un mi bémol mineur septième se
    // lit « C4 → Gb4 », dièse d'un côté, bémol de l'autre, chacun dans sa tonalité.
    const de = v.auDepart ? nomNote(v.de, alterationDepart) : "—";
    const vers = v.aLArrivee ? nomNote(v.vers, alterationArrivee) : "—";
    return `${String(i + 1).padStart(2)}  ${de.padEnd(9)} → ${vers.padEnd(9)}  ${mouvement}`;
  });
}
