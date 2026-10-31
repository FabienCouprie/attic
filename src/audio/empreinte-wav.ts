// audio/empreinte-wav.ts — L'empreinte d'un WAV, lue dans ses octets.
//
// POURQUOI LIRE LES OCTETS, ET NON `decodeAudioData`. Celui-ci RÉÉCHANTILLONNE sur le taux du
// contexte : un fichier à 44 100 Hz décodé dans un contexte à 48 000 change de longueur et de
// valeurs, et deux empreintes du MÊME fichier cessent de se comparer. Ce dépôt l'a déjà payé en
// annonçant huit pour cent d'écart entre deux tours identiques d'une boucle.
//
// POURQUOI CE N'EST PAS DANS LE SPEC QUI S'EN SERT. Il s'en sert dans un `page.evaluate`, donc hors
// d'atteinte de tout cas. Or une empreinte sert à détecter un CHANGEMENT : un analyseur qui ne
// lirait qu'une partie des données rendrait un chiffre stable et insensible — un faux vert parfait,
// qui ne tomberait jamais et ne prouverait rien. C'est le défaut le plus coûteux qu'un garde puisse
// avoir, et il ne se voit qu'en relisant un fichier dont on connaît déjà le contenu.
//
// LES MORCEAUX SE PARCOURENT, ils ne se supposent pas. Un WAV d'Attic porte un `LIST`/`INFO` avant
// ses données quand un graphe y est embarqué : sauter à un décalage fixe de quarante-quatre octets
// lirait l'en-tête du graphe comme du son.

export interface MesureWav {
  /** 1 pour l'entier, 3 pour le flottant. */
  format: number;
  canaux: number;
  taux: number;
  bits: number;
  /** Le nombre de trames, c'est-à-dire d'échantillons PAR canal. */
  trames: number;
  /** La valeur efficace sur tous les canaux, comme la base d'empreintes la compte. */
  rms: number;
  crete: number;
}

const quatre = (dv: DataView, o: number): string =>
  String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

/**
 * Les deux morceaux qui comptent, trouvés en PARCOURANT et non en sautant à un décalage.
 *
 * EXTRAIT PLUTÔT QUE RECOPIÉ le jour où un second lecteur en a eu besoin. Ce parcours porte une
 * correction qu'un second exemplaire aurait perdue : la taille déclarée de `data` est bornée par ce
 * qui reste du fichier, parce qu'un WAV tronqué déclare encore sa taille d'origine et que la lire
 * ferait sortir du tampon au lieu de dire qu'il manque du son.
 */
function morceauxDuWav(dv: DataView, longueur: number): {
  fmt: { format: number; canaux: number; taux: number; bits: number };
  data: { debut: number; taille: number };
} {
  let o = 12;
  let fmt: { format: number; canaux: number; taux: number; bits: number } | null = null;
  let data: { debut: number; taille: number } | null = null;
  while (o + 8 <= longueur) {
    const nom = quatre(dv, o);
    const taille = dv.getUint32(o + 4, true);
    if (nom === "fmt ") {
      fmt = {
        format: dv.getUint16(o + 8, true), canaux: dv.getUint16(o + 10, true),
        taux: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true),
      };
    } else if (nom === "data") {
      data = { debut: o + 8, taille: Math.min(taille, longueur - o - 8) };
      break;
    }
    o += 8 + taille + (taille % 2);
  }
  if (!fmt || !data) throw new Error("WAV incomplet : morceau « fmt » ou « data » introuvable");
  if (fmt.canaux <= 0 || fmt.bits <= 0) throw new Error(`WAV illisible : ${fmt.canaux} canaux, ${fmt.bits} bits`);
  return { fmt, data };
}

/**
 * Lit un WAV PCM — seize, vingt-quatre ou trente-deux bits, entier ou flottant.
 *
 * LES VINGT-QUATRE BITS NE SONT PAS UNE OPTION : c'est la profondeur que l'application exporte par
 * défaut, donc celle de tout aperçu qu'on voudrait empreindre. Un lecteur qui ne connaîtrait que
 * seize et trente-deux bits refuserait précisément les fichiers qu'il est fait pour lire.
 */
export function lireWav(octets: ArrayBuffer): MesureWav {
  const dv = new DataView(octets);
  if (octets.byteLength < 12 || quatre(dv, 0) !== "RIFF" || quatre(dv, 8) !== "WAVE") {
    throw new Error("ce n'est pas un WAV : en-tête RIFF/WAVE absent");
  }
  const { fmt, data } = morceauxDuWav(dv, octets.byteLength);

  const octetsParEchantillon = fmt.bits / 8;
  const n = Math.floor(data.taille / octetsParEchantillon);
  const lire = lecteurDEchantillon(fmt.format, fmt.bits);
  let somme = 0, crete = 0;
  for (let i = 0; i < n; i++) {
    const v = lire(dv, data.debut + i * octetsParEchantillon);
    somme += v * v;
    const a = Math.abs(v);
    if (a > crete) crete = a;
  }
  return {
    ...fmt, trames: Math.floor(n / fmt.canaux),
    rms: n > 0 ? Math.sqrt(somme / n) : 0, crete,
  };
}

/** Un niveau par tranche de temps : l'instant où elle commence, et son niveau en dBFS. */
export interface Tranche {
  secondes: number;
  /** La valeur efficace de la tranche, en dBFS. `-Infinity` sur une tranche strictement nulle. */
  db: number;
}

/**
 * Le niveau d'un WAV TRANCHE PAR TRANCHE, et c'est la seule façon honnête de mesurer une évolution.
 *
 * ÉCRIT DE DEUX ERREURS EN SENS CONTRAIRE, le 2026-10-25, en cherchant ce que retirait vraiment la
 * déréverbération. Les deux portaient sur une valeur efficace calculée d'un bloc :
 *
 *   UNE FENÊTRE PLEINE DE SILENCE REND UN GRAND NOMBRE QUI NE VEUT RIEN DIRE. Mesurée « de deux à
 *   six secondes » sur un fichier qui n'en portait que trois et demie, l'atténuation annonçait
 *   38 dB — en atténuant du silence numérique.
 *
 *   ET UNE FENÊTRE SUR UNE RÉGION DÉCROISSANTE EST DOMINÉE PAR SON INSTANT LE PLUS FORT, donc elle
 *   ne voit pas ce qu'on retire à la fin. La même mesure, recadrée sur le début de la queue,
 *   annonçait moins d'un demi-décibel.
 *
 * Les deux chiffres étaient faux, et de part et d'autre de la vérité : par tranches d'une
 * demi-seconde, la réalité était -18,8 dB puis -24,0 dB dans la région qui s'entend, pour deux
 * dixièmes sur le son direct. AUCUN NOMBRE UNIQUE NE POUVAIT LE DIRE.
 *
 * LES CANAUX SONT SOMMÉS comme `lireWav` les somme, pour qu'un niveau de tranche et une empreinte
 * parlent de la même chose.
 */
export function niveauxParTranche(octets: ArrayBuffer, secondesParTranche = 0.5): Tranche[] {
  if (!(secondesParTranche > 0)) throw new Error("une tranche dure plus que zéro seconde");
  const m = lireWav(octets);
  const dv = new DataView(octets);
  const { data } = morceauxDuWav(dv, octets.byteLength);
  const pas = m.bits / 8;
  const lire = lecteurDEchantillon(m.format, m.bits);
  const parTranche = Math.max(1, Math.round(secondesParTranche * m.taux));
  const out: Tranche[] = [];
  for (let t = 0; t < m.trames; t += parTranche) {
    const fin = Math.min(m.trames, t + parTranche);
    let somme = 0, n = 0;
    for (let i = t * m.canaux; i < fin * m.canaux; i++) {
      const v = lire(dv, data.debut + i * pas);
      somme += v * v; n++;
    }
    const rms = n > 0 ? Math.sqrt(somme / n) : 0;
    out.push({ secondes: t / m.taux, db: rms > 0 ? 20 * Math.log10(rms) : -Infinity });
  }
  return out;
}

/** Comment un échantillon se lit, selon la profondeur. Une seule fois, pour les deux lecteurs. */
function lecteurDEchantillon(format: number, bits: number): (dv: DataView, p: number) => number {
  if (format === 3 && bits === 32) return (dv, p) => dv.getFloat32(p, true);
  if (bits === 16) return (dv, p) => dv.getInt16(p, true) / 32768;
  if (bits === 24) {
    return (dv, p) => {
      const u = dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getUint8(p + 2) << 16);
      return ((u & 0x800000) ? u - 0x1000000 : u) / 8388608;
    };
  }
  if (bits === 32) return (dv, p) => dv.getInt32(p, true) / 2147483648;
  throw new Error(`profondeur non lue : ${bits} bits, format ${format}`);
}

/**
 * Le tampon audio d'un WAV, à SON PROPRE taux d'échantillonnage.
 *
 * POURQUOI PAS `decodeAudioData`, ET LE DÉPÔT L'A DÉJÀ PAYÉ. Celui-ci rééchantillonne sur le taux du
 * contexte : un fichier à 44 100 Hz décodé dans un contexte à 48 000 change de longueur et de
 * valeurs. Deux descripteurs du même fichier cessent alors de se comparer, et l'on attribue au son
 * ce qui n'est qu'une conversion.
 *
 * À QUOI IL SERT : à relever un descripteur qui suit la HAUTEUR, là où la valeur efficace n'en dit
 * rien. Mesuré le 2026-10-25 en replantant le défaut des cent trente cents : la valeur efficace du
 * même aperçu bougeait de quatre MILLIÈMES de pour cent, et sa crête de six. Transposer un
 * échantillon change le spectre sans changer l'énergie — une empreinte de niveau est donc presque
 * aveugle à une faute de hauteur, qui est pourtant la faute que ce dépôt vient de payer.
 */
export function tamponDepuisWav(octets: ArrayBuffer, AudioBufferCtor: typeof AudioBuffer = AudioBuffer): AudioBuffer {
  const dv = new DataView(octets);
  const m = lireWav(octets);
  // On refait le parcours des morceaux : `lireWav` ne rend pas la position des données, et la lui
  // faire rendre obligerait tous ses appelants à connaître une position dont ils n'ont que faire.
  let o = 12, debut = -1;
  while (o + 8 <= octets.byteLength) {
    const nom = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    const t = dv.getUint32(o + 4, true);
    if (nom === "data") { debut = o + 8; break; }
    o += 8 + t + (t % 2);
  }
  if (debut < 0) throw new Error("WAV incomplet : morceau « data » introuvable");

  const octetsParEchantillon = m.bits / 8;
  const lire = lecteurDEchantillon(m.format, m.bits);
  const buf = new AudioBufferCtor({
    numberOfChannels: m.canaux, length: Math.max(1, m.trames), sampleRate: m.taux,
  });
  for (let c = 0; c < m.canaux; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < m.trames; i++) {
      d[i] = lire(dv, debut + (i * m.canaux + c) * octetsParEchantillon);
    }
  }
  return buf;
}

/**
 * L'empreinte d'un WAV, dans la forme de la base des composants : `rms/crête`, neuf décimales.
 *
 * LA FORME ET LES DÉCIMALES SONT CELLES DE `tests-e2e/empreintes.json`, et ce n'est pas une
 * coquetterie : deux bases qui diraient la même chose de deux façons se compareraient mal, et neuf
 * décimales est ce qui a été éprouvé comme stable d'une passe à l'autre sur ce dépôt.
 *
 * LE NOMBRE DE TRAMES EN FAIT PARTIE. Un rendu qui perdrait sa queue, ou la doublerait, garderait à
 * peu près la même valeur efficace : c'est le même raisonnement que les paliers d'une courbe dans
 * `banc-mesure.ts`. Le taux et les canaux suivent, pour qu'un rééchantillonnage se voie.
 */
export function empreinteWav(octets: ArrayBuffer): string {
  const m = lireWav(octets);
  return `${m.rms.toFixed(9)}/${m.crete.toFixed(9)}`
    + ` · ${m.trames} trames · ${m.canaux}ch · ${m.taux} Hz`;
}
