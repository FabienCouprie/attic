// audio/sf2-enveloppe.ts — L'enveloppe de volume d'une zone SoundFont, de ses générateurs à son gain.
//
// ═══ CE QUI MANQUAIT, LU DANS LE SOURCE PUIS MESURÉ SUR FLUIDR3 ═══
//
// Le rendu SoundFont ne lisait AUCUNE enveloppe : le gain venait de la vélocité et de l'atténuation de
// la zone, et chaque note s'éteignait par un fondu de cinq millisecondes à la fin exacte de sa durée
// MIDI. Une nappe de cordes coupait net à chaque accord, une caisse claire s'arrêtait au relâchement
// de sa touche, et le relevé du 2026-11-28 sur FluidR3 donne une queue audible de zéro seconde aux
// cordes, au piano et aux cinq frappes de batterie essayées. Or le fichier les décrit : 867 de ses 2 641
// zones d'instrument écrivent un relâchement, et 132 de ses 193 instruments l'écrivent dans leur ZONE
// GLOBALE, que l'analyseur jetait entière.
//
// ═══ CE QUE DIT LA NORME, ET CE QUE CE MODULE EN FAIT ═══
//
// SoundFont 2.01, générateurs 33 à 40. Les temps sont en timecents absolus, 2^(tc/1200) secondes :
// zéro vaut une seconde, 1200 deux secondes, −12000 une milliseconde, le plus court que la norme
// écrive et le défaut de chacun. Le palier est en centibels sous le niveau plein ; 1000, cent
// décibels, vaut le silence.
//
//   · retard, puis ATTAQUE LINÉAIRE EN AMPLITUDE de zéro au niveau plein ;
//   · maintien au niveau plein ;
//   · CHUTE LINÉAIRE EN DÉCIBELS vers le palier, à raison de mille centibels par temps de chute :
//     le temps écrit est celui d'une course entière, de sorte qu'un palier de trente centibels est
//     atteint en trois centièmes de ce temps ;
//   · palier, tant que la touche est tenue ;
//   · RELÂCHEMENT à la fin MIDI de la note, depuis le niveau où elle en est, LINÉAIRE EN DÉCIBELS à
//     la même raison, jusqu'à cent décibels sous le plein, où la voix s'éteint.
//
// Le maintien et la chute s'allongent vers le grave : chacun reçoit (60 − touche) fois son
// générateur d'échelle, 39 et 40. C'est l'écriture de FluidSynth (`calculate_hold_decay_buffers`).
//
// ═══ DEUX ÉCARTS À LA LETTRE, ET LEUR RAISON ═══
//
// LE RELÂCHEMENT NE DESCEND PAS SOUS −7200 TIMECENTS, environ 15,6 ms. À la lettre, le défaut d'une
// milliseconde fait tomber cent décibels en quarante-quatre échantillons : un claquement à chaque fin
// de note. FluidSynth pose le même plancher, `FLUID_MIN_VOLENVRELEASE`, « to stop clicks ». Il
// remplace le fondu de cinq millisecondes d'avant, qui avait le même rôle.
//
// LE RETARD À −12000, LE DÉFAUT, NE RETARDE PAS. À la lettre il décalerait chaque note d'une
// milliseconde, et toute la pièce avec elle contre ce que rend la synthèse FM du même graphe.
// Au-dessus du plancher, il est lu.

/** Les huit générateurs de l'enveloppe de volume, 33 à 40, dans les unités du fichier. */
export interface GenerateursEnveloppe {
  /** 33, delayVolEnv : timecents. */
  retard: number;
  /** 34, attackVolEnv : timecents. */
  attaque: number;
  /** 35, holdVolEnv : timecents. */
  maintien: number;
  /** 36, decayVolEnv : timecents, pour une course de mille centibels. */
  chute: number;
  /** 37, sustainVolEnv : centibels sous le niveau plein. */
  palier: number;
  /** 38, releaseVolEnv : timecents, pour une course de mille centibels. */
  relachement: number;
  /** 39, keynumToVolEnvHold : timecents par touche, comptés depuis la touche 60. */
  toucheMaintien: number;
  /** 40, keynumToVolEnvDecay : timecents par touche, comptés depuis la touche 60. */
  toucheChute: number;
}

const CHAMPS: Readonly<Record<number, keyof GenerateursEnveloppe>> = {
  33: "retard", 34: "attaque", 35: "maintien", 36: "chute",
  37: "palier", 38: "relachement", 39: "toucheMaintien", 40: "toucheChute",
};

/** Les défauts de la norme, pour une zone d'instrument dont ni elle ni sa zone globale n'écrit rien. */
export const ENVELOPPE_PAR_DEFAUT: Readonly<GenerateursEnveloppe> = {
  retard: -12000, attaque: -12000, maintien: -12000, chute: -12000,
  palier: 0, relachement: -12000, toucheMaintien: 0, toucheChute: 0,
};

/** Une zone de preset DÉCALE ce que l'instrument écrit, et ne décale rien par défaut. */
export const AUCUN_DECALAGE: Readonly<GenerateursEnveloppe> = {
  retard: 0, attaque: 0, maintien: 0, chute: 0, palier: 0, relachement: 0, toucheMaintien: 0, toucheChute: 0,
};

/**
 * Range un générateur lu dans `cible` s'il est de l'enveloppe de volume, et dit s'il l'était.
 *
 * Les huit sont signés sur seize bits : un relâchement de −1586 s'écrit 63950 dans le fichier.
 */
export function lireGenerateurEnveloppe(cible: Partial<GenerateursEnveloppe>, type: number, brut: number): boolean {
  const champ = CHAMPS[type];
  if (!champ) return false;
  cible[champ] = brut & 0x8000 ? brut - 65536 : brut;
  return true;
}

/**
 * Les générateurs d'une zone : les siens, sinon ceux de la zone globale, sinon `defaut`.
 *
 * La norme le dit pour les deux niveaux : un générateur local REMPLACE celui de la zone globale, il
 * ne s'y ajoute pas. Une zone d'instrument part de `ENVELOPPE_PAR_DEFAUT`, une zone de preset de
 * `AUCUN_DECALAGE`.
 */
export function enveloppeDeZone(
  globale: Partial<GenerateursEnveloppe>, locale: Partial<GenerateursEnveloppe>, defaut: Readonly<GenerateursEnveloppe>,
): GenerateursEnveloppe {
  return { ...defaut, ...globale, ...locale };
}

/** Ce que joue une zone d'instrument sous une zone de preset : la somme, générateur par générateur. */
export function additionnerEnveloppes(
  instrument: Readonly<GenerateursEnveloppe>, preset: Readonly<GenerateursEnveloppe> | undefined,
): GenerateursEnveloppe {
  const somme = { ...instrument };
  if (!preset) return somme;
  for (const champ of Object.values(CHAMPS)) somme[champ] += preset[champ];
  return somme;
}

/** L'enveloppe d'une note, en secondes, et son palier en centibels. */
export interface EnveloppeEnSecondes {
  retard: number;
  attaque: number;
  maintien: number;
  /** Le temps d'une course de mille centibels pendant la chute. */
  chute: number;
  /** Centibels sous le niveau plein, ramenés à [0, 1000] : au-delà, c'est encore le silence. */
  palier: number;
  /** Le temps d'une course de mille centibels pendant le relâchement. */
  relachement: number;
}

/** −7200 timecents, 15,6 ms : le plancher de FluidSynth, contre le claquement. Voir l'en-tête. */
export const PLANCHER_RELACHEMENT = -7200;

const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const secondes = (tc: number, min: number, max: number) => 2 ** (borne(tc, min, max) / 1200);

/**
 * L'enveloppe que joue la touche `note`, les plages de la norme appliquées APRÈS la somme du preset
 * et de l'échelle de touche, comme la norme le demande.
 */
export function enveloppeEnSecondes(g: Readonly<GenerateursEnveloppe>, note: number): EnveloppeEnSecondes {
  const versLeGrave = 60 - note;
  return {
    retard: g.retard <= -12000 ? 0 : secondes(g.retard, -12000, 5000),
    attaque: secondes(g.attaque, -12000, 8000),
    maintien: secondes(g.maintien + borne(g.toucheMaintien, -1200, 1200) * versLeGrave, -12000, 5000),
    chute: secondes(g.chute + borne(g.toucheChute, -1200, 1200) * versLeGrave, -12000, 8000),
    palier: borne(g.palier, 0, 1000),
    relachement: secondes(g.relachement, PLANCHER_RELACHEMENT, 8000),
  };
}

const enAmplitude = (cb: number) => 10 ** (-cb / 200);

/**
 * −2000 timecents, 0,31 s pour cent décibels : le relâchement d'une voix étouffée par une note plus
 * jeune de sa classe exclusive. C'est la valeur de FluidSynth (`fluid_voice_kill_excl`), dont le
 * commentaire dit que l'ancienne, −200, coupait trop lentement « dans la plupart des cas ».
 */
export const RELACHEMENT_ETOUFFE = 2 ** (-2000 / 1200);

/** Ce qui étouffe une voix : l'échantillon, compté depuis son attaque, où une note plus jeune part. */
export interface Etouffement {
  debut: number;
  /** Le temps d'une course de mille centibels, en secondes : `RELACHEMENT_ETOUFFE`. */
  relachement: number;
}

const AVANT_LA_CHUTE = 0, CHUTE = 1, PALIER = 2, RELACHE = 3, ETOUFFE = 4, ETEINTE = 5;

/**
 * Le gain d'une note, échantillon par échantillon, de son attaque à son extinction.
 *
 * `tenue` est le nombre d'échantillons entre l'attaque et la fin MIDI de la note. `longueur` dit
 * combien d'échantillons la voix sonne en tout, relâchement compris : c'est ce qui allonge le
 * tampon au-delà de la dernière note. Une voix dont la chute atteint le silence avant la fin MIDI
 * s'éteint là, et n'a pas de relâchement.
 *
 * UNE VOIX ÉTOUFFÉE relâche depuis l'instant de l'étouffement, à la plus rapide de deux raisons, la
 * sienne et celle de l'étouffement, qu'elle soit encore tenue ou déjà relâchée.
 *
 * `amplitude(i)` est la définition, calculée ; `suivant()` rend la même suite en avançant d'un
 * échantillon, par multiplication dans les phases en décibels, ce qui évite une puissance par
 * échantillon dans la boucle du rendu.
 */
export class CourseEnveloppe {
  readonly longueur: number;
  private readonly debutAttaque: number;
  private readonly finAttaque: number;
  private readonly finMaintien: number;
  private readonly finChute: number;
  /** La fin MIDI, ou l'étouffement s'il vient avant : là où le relâchement commence. */
  private readonly debutRelache: number;
  private readonly etouffe: number;
  private readonly cbParEchantillonChute: number;
  private readonly cbParEchantillonRelache: number;
  private readonly cbParEchantillonEtouffe: number;
  private readonly cbAuRelache: number;
  private readonly ampPalier: number;
  private readonly facteurs: Readonly<Record<number, number>>;
  private i = 0;
  private phase = -1;
  private amp = 0;

  constructor(e: EnveloppeEnSecondes, sr: number, tenue: number, etouffement?: Etouffement) {
    this.debutAttaque = e.retard * sr;
    this.finAttaque = this.debutAttaque + e.attaque * sr;
    this.finMaintien = this.finAttaque + e.maintien * sr;
    this.cbParEchantillonChute = 1000 / (e.chute * sr);
    this.finChute = this.finMaintien + e.palier / this.cbParEchantillonChute;
    this.ampPalier = enAmplitude(e.palier);
    this.cbParEchantillonRelache = 1000 / (e.relachement * sr);
    this.etouffe = etouffement ? etouffement.debut : Infinity;
    this.cbParEchantillonEtouffe = etouffement
      ? Math.max(this.cbParEchantillonRelache, 1000 / (etouffement.relachement * sr))
      : this.cbParEchantillonRelache;
    this.debutRelache = Math.min(tenue, this.etouffe);
    this.facteurs = {
      [CHUTE]: enAmplitude(this.cbParEchantillonChute),
      [RELACHE]: enAmplitude(this.cbParEchantillonRelache),
      [ETOUFFE]: enAmplitude(this.cbParEchantillonEtouffe),
    };

    const auRelache = this.tenu(this.debutRelache);
    if (e.palier >= 1000 && this.finChute <= this.debutRelache) {
      this.cbAuRelache = 1000;
      this.longueur = Math.ceil(this.finChute);
    } else if (auRelache <= 0) {
      this.cbAuRelache = 1000;
      this.longueur = this.debutRelache;
    } else {
      this.cbAuRelache = Math.min(1000, -200 * Math.log10(auRelache));
      const cbALEtouffement = this.cbRelache(this.etouffe);
      this.longueur = this.etouffe <= this.debutRelache
        ? this.debutRelache + Math.ceil((1000 - this.cbAuRelache) / this.cbParEchantillonEtouffe)
        : !(cbALEtouffement < 1000)
          ? this.debutRelache + Math.ceil((1000 - this.cbAuRelache) / this.cbParEchantillonRelache)
          : this.etouffe + Math.ceil((1000 - cbALEtouffement) / this.cbParEchantillonEtouffe);
    }
  }

  /** Le niveau d'une note qu'on tiendrait sans fin, au temps `t` en échantillons. */
  private tenu(t: number): number {
    if (t < this.debutAttaque) return 0;
    if (t < this.finAttaque) return (t - this.debutAttaque) / (this.finAttaque - this.debutAttaque);
    if (t < this.finMaintien) return 1;
    if (t < this.finChute) return enAmplitude(this.cbParEchantillonChute * (t - this.finMaintien));
    return this.ampPalier;
  }

  /** L'atténuation pendant le relâchement : à sa raison, puis à celle de l'étouffement. */
  private cbRelache(i: number): number {
    if (this.etouffe <= this.debutRelache) return this.cbAuRelache + this.cbParEchantillonEtouffe * (i - this.debutRelache);
    if (i < this.etouffe) return this.cbAuRelache + this.cbParEchantillonRelache * (i - this.debutRelache);
    return this.cbAuRelache + this.cbParEchantillonRelache * (this.etouffe - this.debutRelache)
      + this.cbParEchantillonEtouffe * (i - this.etouffe);
  }

  /** Le gain de l'échantillon `i`, compté depuis l'attaque. */
  amplitude(i: number): number {
    if (i >= this.longueur) return 0;
    if (i < this.debutRelache) return this.tenu(i);
    return enAmplitude(this.cbRelache(i));
  }

  /** Le gain de l'échantillon suivant : la même valeur qu'`amplitude`, sans puissance à chaque pas. */
  suivant(): number {
    const i = this.i++;
    const phase = i >= this.longueur ? ETEINTE
      : i >= this.debutRelache ? (i >= this.etouffe ? ETOUFFE : RELACHE)
      : i < this.finMaintien ? AVANT_LA_CHUTE
      : i < this.finChute ? CHUTE
      : PALIER;
    if (phase === CHUTE || phase === RELACHE || phase === ETOUFFE) {
      // Chaque phase en décibels part de sa valeur calculée, puis avance par multiplication.
      this.amp = phase === this.phase ? this.amp * this.facteurs[phase] : this.amplitude(i);
    } else {
      this.amp = phase === ETEINTE ? 0 : phase === PALIER ? this.ampPalier : this.tenu(i);
    }
    this.phase = phase;
    return this.amp;
  }
}
