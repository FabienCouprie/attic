// audio/sf2-filtre.ts — Le filtre passe-bas d'une voix SoundFont, et l'enveloppe de modulation qui le meut.
//
// ═══ CE QUI MANQUAIT, MESURÉ SUR FLUIDR3 ═══
//
// Le rendu ne lisait aucun filtre : chaque zone sonnait ouverte en grand. Or 792 des 17 215 zones
// jouables de FluidR3 coupent sous 2 kHz, et l'enveloppe de modulation déplace la coupure de 4 858
// zones jouables. « Synth Bass 1 » coupe à 120 Hz, et son enveloppe l'ouvre de 6 723 cents à
// l'attaque puis la referme en deux dixièmes de seconde : c'est tout son timbre. Rendu sans filtre,
// son centroïde restait à 2 690 Hz du début à la fin. « Chiffer Lead » règle sa brillance par dix
// zones de vélocité, de 16 Hz à 8 kHz de coupure : sans filtre, la vélocité 40 et la vélocité 100
// rendaient le même centroïde.
//
// ═══ CE QUE FAIT CE MODULE, NORME SF2 2.01 ET FLUIDSYNTH ═══
//
// Le filtre est le passe-bas résonant à deux pôles de la norme, écrit comme FluidSynth l'écrit
// (`fluid_iir_filter_impl.cpp`, les formules de Robert Bristow-Johnson) :
//
//   · la coupure, générateur 8, en cents absolus (8,176 Hz pour zéro), bornée de 1 500 à 13 500
//     cents, plus l'enveloppe de modulation multipliée par le générateur 11, puis bornée de 5 Hz à
//     0,45 fois la fréquence d'échantillonnage ;
//   · la résonance, générateur 9, en centibels au-dessus du gain continu : Q = 10^((dB − 3,01) / 20),
//     zéro centibel donnant un Butterworth sans bosse, et le gain du filtre divisé par √Q, la moitié de
//     la bosse en décibels, comme la norme le demande page 59 ; ramené à un pour une résonance nulle,
//     voir plus bas.
//
// L'enveloppe de modulation, générateurs 25 à 32, a les phases de l'enveloppe de volume, mais en
// VALEUR, de zéro à un, et non en décibels : attaque convexe, chute et relâchement linéaires à raison
// d'une course entière par temps écrit, palier en millièmes sous le plein. Ni plancher de
// relâchement, ni d'autre destination ici que la coupure : sa part vers la hauteur, générateur 7,
// n'est pas lue.
//
// ═══ TROIS ÉCARTS À FLUIDSYNTH, ET LEUR RAISON ═══
//
// UN FILTRE OUVERT N'EST PAS APPLIQUÉ : coupure à 13 500 cents ou plus, résonance nulle, et aucune
// enveloppe qui la ferait descendre. FluidSynth l'applique quand même, Butterworth à 0,45 fois la
// fréquence d'échantillonnage ; ici, ces zones rendent exactement ce qu'elles rendaient.
//
// LE GAIN DU FILTRE VAUT UN POUR UNE RÉSONANCE NULLE : √(Q₀ / Q), Q₀ étant le Q de zéro centibel.
// FluidSynth divise par √Q, ce qui monte de 1,5 dB toute voix sans résonance, et toutes ses voix
// passent par le filtre. Ici, les zones au filtre ouvert n'y passent pas : leur laisser ce gain que les
// autres auraient les mettrait 1,5 dB sous elles. Mesuré sur la nappe de cordes de FluidR3, coupée à
// 10 kHz : elle montait de 1,5 dB sur un instrument sans filtre. La bosse garde la règle de la norme,
// la moitié en décibels au-dessus de la coupure, la moitié sous le continu.
//
// LES COEFFICIENTS SE RECALCULENT TOUS LES 32 ÉCHANTILLONS, par paliers, quand l'enveloppe de
// modulation déplace la coupure. FluidSynth fait glisser la coupure sur un tampon de 64.

import { additionner, borne, deZone, lireDans, secondes, type Champs } from "./sf2-generateurs";
import type { Etouffement } from "./sf2-enveloppe";

/** Le filtre et l'enveloppe de modulation d'une zone, dans les unités du fichier. */
export interface GenerateursFiltre {
  /** 8, initialFilterFc : cents absolus. */
  coupure: number;
  /** 9, initialFilterQ : centibels au-dessus du gain continu. */
  resonance: number;
  /** 11, modEnvToFilterFc : cents, pour l'enveloppe de modulation au plein. */
  versCoupure: number;
  /** 25 à 28, delayModEnv, attackModEnv, holdModEnv, decayModEnv : timecents. */
  retard: number;
  attaque: number;
  maintien: number;
  chute: number;
  /** 29, sustainModEnv : millièmes sous le plein. */
  palier: number;
  /** 30, releaseModEnv : timecents, pour une course entière. */
  relachement: number;
  /** 31 et 32, keynumToModEnvHold et keynumToModEnvDecay : timecents par touche depuis la 60. */
  toucheMaintien: number;
  toucheChute: number;
}

const CHAMPS: Champs<GenerateursFiltre> = {
  8: "coupure", 9: "resonance", 11: "versCoupure", 25: "retard", 26: "attaque", 27: "maintien",
  28: "chute", 29: "palier", 30: "relachement", 31: "toucheMaintien", 32: "toucheChute",
};

/** Les défauts de la norme : un filtre ouvert, et une enveloppe qui n'a rien à mouvoir. */
export const FILTRE_PAR_DEFAUT: Readonly<GenerateursFiltre> = {
  coupure: 13500, resonance: 0, versCoupure: 0, retard: -12000, attaque: -12000, maintien: -12000,
  chute: -12000, palier: 0, relachement: -12000, toucheMaintien: 0, toucheChute: 0,
};

/** Une zone de preset décale ce que l'instrument écrit, et ne décale rien par défaut. */
export const AUCUN_DECALAGE_FILTRE: Readonly<GenerateursFiltre> = {
  coupure: 0, resonance: 0, versCoupure: 0, retard: 0, attaque: 0, maintien: 0,
  chute: 0, palier: 0, relachement: 0, toucheMaintien: 0, toucheChute: 0,
};

export const lireGenerateurFiltre = (cible: Partial<GenerateursFiltre>, type: number, brut: number): boolean =>
  lireDans(CHAMPS, cible, type, brut);
export const filtreDeZone = (globale: Partial<GenerateursFiltre>, locale: Partial<GenerateursFiltre>, defaut: Readonly<GenerateursFiltre>) =>
  deZone(globale, locale, defaut);
export const additionnerFiltres = (instrument: Readonly<GenerateursFiltre>, preset: Readonly<GenerateursFiltre> | undefined) =>
  additionner(CHAMPS, instrument, preset);

/** Un filtre que rien ne fermerait : il n'est pas appliqué. Voir l'en-tête. */
export const filtreOuvert = (f: Readonly<GenerateursFiltre>) => f.coupure >= 13500 && f.resonance <= 0 && f.versCoupure >= 0;

/** L'enveloppe de modulation d'une note, en secondes, et son palier en fraction du plein. */
export interface ModulationEnSecondes {
  retard: number;
  attaque: number;
  maintien: number;
  chute: number;
  palier: number;
  relachement: number;
}

export function modulationEnSecondes(g: Readonly<GenerateursFiltre>, note: number): ModulationEnSecondes {
  const versLeGrave = 60 - note;
  return {
    retard: g.retard <= -12000 ? 0 : secondes(g.retard, -12000, 5000),
    attaque: secondes(g.attaque, -12000, 8000),
    maintien: secondes(g.maintien + borne(g.toucheMaintien, -1200, 1200) * versLeGrave, -12000, 5000),
    chute: secondes(g.chute + borne(g.toucheChute, -1200, 1200) * versLeGrave, -12000, 8000),
    palier: 1 - borne(g.palier, 0, 1000) / 1000,
    relachement: secondes(g.relachement, -12000, 8000),
  };
}

/** La convexe de la norme, 1 + 20/96 · log10(x²), bornée de zéro à un. */
export const convexe = (x: number) => (x <= 0 ? 0 : borne(1 + (40 / 96) * Math.log10(x), 0, 1));

/**
 * La valeur de l'enveloppe de modulation à l'échantillon `i`, compté depuis l'attaque.
 *
 * Elle ne décide pas de la longueur d'une voix, que l'enveloppe de volume décide : on ne la lit qu'à
 * chaque recalcul du filtre, d'où une valeur calculée plutôt qu'une course pas à pas. Étouffée par une
 * note plus jeune de sa classe exclusive, elle relâche comme l'enveloppe de volume, à la plus rapide
 * des deux raisons.
 */
export class CourseModulation {
  private readonly debutAttaque: number;
  private readonly finAttaque: number;
  private readonly finMaintien: number;
  private readonly finChute: number;
  private readonly parEchantillonChute: number;
  private readonly palier: number;
  private readonly debutRelache: number;
  private readonly etouffe: number;
  private readonly parEchantillonRelache: number;
  private readonly parEchantillonEtouffe: number;
  private readonly auRelache: number;

  constructor(m: ModulationEnSecondes, sr: number, tenue: number, etouffement?: Etouffement) {
    this.debutAttaque = m.retard * sr;
    this.finAttaque = this.debutAttaque + m.attaque * sr;
    this.finMaintien = this.finAttaque + m.maintien * sr;
    this.parEchantillonChute = 1 / (m.chute * sr);
    this.palier = m.palier;
    this.finChute = this.finMaintien + (1 - m.palier) / this.parEchantillonChute;
    this.parEchantillonRelache = 1 / (m.relachement * sr);
    this.etouffe = etouffement ? etouffement.debut : Infinity;
    this.parEchantillonEtouffe = etouffement
      ? Math.max(this.parEchantillonRelache, 1 / (etouffement.relachement * sr)) : this.parEchantillonRelache;
    this.debutRelache = Math.min(tenue, this.etouffe);
    this.auRelache = this.tenue(this.debutRelache);
  }

  private tenue(t: number): number {
    if (t < this.debutAttaque) return 0;
    if (t < this.finAttaque) return convexe((t - this.debutAttaque) / (this.finAttaque - this.debutAttaque));
    if (t < this.finMaintien) return 1;
    if (t < this.finChute) return 1 - this.parEchantillonChute * (t - this.finMaintien);
    return this.palier;
  }

  valeur(i: number): number {
    if (i < this.debutRelache) return this.tenue(i);
    const descente = this.etouffe <= this.debutRelache
      ? this.parEchantillonEtouffe * (i - this.debutRelache)
      : i < this.etouffe
        ? this.parEchantillonRelache * (i - this.debutRelache)
        : this.parEchantillonRelache * (this.etouffe - this.debutRelache) + this.parEchantillonEtouffe * (i - this.etouffe);
    return Math.max(0, this.auRelache - descente);
  }
}

/** Cents absolus en hertz, 8,176 Hz pour zéro, comme `fluid_ct2hz`. */
export const enHertz = (cents: number) => 8.176 * 2 ** (cents / 1200);
const enCents = (hz: number) => 1200 * Math.log2(hz / 8.176);

/** Les échantillons entre deux recalculs des coefficients, quand la coupure bouge. */
export const BLOC_FILTRE = 32;

/** Le Q d'une résonance de zéro centibel, celui d'un Butterworth : 10^(−3,01 / 20). */
export const Q_SANS_RESONANCE = 10 ** (-3.01 / 20);

/**
 * Le passe-bas résonant d'une voix, échantillon par échantillon.
 *
 * `traiter` se prend une fois par échantillon de sortie de la voix, dans l'ordre : c'est l'index
 * qu'il tient qui lit l'enveloppe de modulation.
 */
export class FiltreVoix {
  private readonly base: number;
  private readonly portee: number;
  private readonly q: number;
  private readonly gain: number;
  private readonly min: number;
  private readonly max: number;
  private readonly sr: number;
  private readonly modulation: CourseModulation | null;
  private cents = NaN;
  private b0 = 0; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private i = 0;

  constructor(f: Readonly<GenerateursFiltre>, sr: number, modulation: CourseModulation | null) {
    this.base = borne(f.coupure, 1500, 13500);
    this.portee = borne(f.versCoupure, -12000, 12000);
    this.q = 10 ** ((borne(f.resonance / 10, 0, 96) - 3.01) / 20);
    this.gain = Math.sqrt(Q_SANS_RESONANCE / this.q);
    this.min = enCents(5);
    this.max = enCents(0.45 * sr);
    this.sr = sr;
    this.modulation = this.portee !== 0 ? modulation : null;
    this.regler(0);
  }

  /** La coupure à l'échantillon `i`, en cents, bornée. */
  coupureEnCents(i: number): number {
    return borne(this.base + (this.modulation ? this.portee * this.modulation.valeur(i) : 0), this.min, this.max);
  }

  private regler(i: number): void {
    const cents = this.coupureEnCents(i);
    if (cents === this.cents) return;
    this.cents = cents;
    const w = (2 * Math.PI * enHertz(cents)) / this.sr;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * this.q), a0 = 1 + alpha;
    this.b1 = ((1 - cos) / a0) * this.gain;
    this.b0 = this.b2 = this.b1 / 2;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  traiter(x: number): number {
    if (this.modulation && this.i > 0 && this.i % BLOC_FILTRE === 0) this.regler(this.i);
    this.i++;
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
