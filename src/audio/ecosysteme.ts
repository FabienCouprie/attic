// audio/ecosysteme.ts — Un système qui s'écoute et règle ses propres paramètres.
//
// D'après Agostino Di Scipio, « "Sound is the interface" : from interactive to ecosystemic signal
// processing », Organised Sound 8(3), 2003, et la série « Audible Ecosystemics » (2003-2005) ; le
// moteur non linéaire vient de « Iterated Nonlinear Functions as a Sound-Generating Engine »,
// Leonardo 34(3), 2001.
//
// CE QUI CHANGE PAR RAPPORT À TOUT LE RESTE DU CATALOGUE. Partout ailleurs, l'utilisateur règle un
// effet et l'effet obéit : une densité de grains, un seuil, une durée. Ici, personne ne règle le
// résultat. L'utilisateur règle le COUPLAGE — la force avec laquelle le système s'entend lui-même —
// et le reste est décidé par le système, à partir de ce qu'il mesure de sa propre sortie et du son
// qu'on lui donne pour monde. La densité des grains, leur durée, l'endroit du passé où il va les
// chercher : tout cela sort de la boucle, pas des curseurs. C'est ce que Di Scipio appelle faire du
// son l'interface, et c'est très exactement l'inverse de la façon dont un effet se règle.
//
// LA BOUCLE EST DANS LE NŒUD, PARCE QUE LE GRAPHE EST ACYCLIQUE. Attic ne permet pas à un nœud de
// se réinjecter dans lui-même, et c'est une bonne chose — un graphe cyclique n'aurait plus d'ordre
// d'exécution. L'écosystème est donc entier à l'intérieur d'un seul nœud, ce qui est d'ailleurs
// fidèle : les dispositifs de Di Scipio sont des boucles fermées, un seul appareil qui s'écoute.
//
// CE QUI EMPÊCHE QUE CE SOIT UN SIMPLE CONTRÔLE AUTOMATIQUE DE GAIN. Un compresseur aussi régule un
// niveau ; la différence est que l'observation, ici, ne commande pas un gain mais la STRUCTURE de
// la synthèse. À niveau de sortie égal, un monde agité et un monde calme donnent deux textures
// différentes — plus de grains, plus courts, puisés plus près du présent dans le premier cas. Un
// test le vérifie à niveau égalisé, faute de quoi le nœud ne serait qu'un compresseur bavard.

/** Un instant de la vie du système, relevé une fois par période de contrôle. */
export interface Point {
  secondes: number;
  /** Niveau de sa propre voix, en décibels : ce que l'homéostat régule. */
  niveauDb: number;
  /** Niveau de la pièce entière — sa voix et le monde —, en décibels : ce qu'il entend. */
  entenduDb: number;
  /** De combien le son bouge : l'écart entre l'observation courte et la longue. */
  agitation: number;
  /** La poussée que l'homéostat applique pour rejoindre son point d'équilibre. */
  poussee: number;
  /** Grains par seconde décidés à cet instant. */
  densite: number;
  /** Durée de grain décidée à cet instant, en millisecondes. */
  dureeMs: number;
}

export type Regime = "insuffisant" | "regule" | "oscille" | "bride";

export interface OptionsEcosysteme {
  frequence: number;
  /** Durée de sortie, en secondes. Le système continue après la fin du monde qu'on lui donne. */
  duree: number;
  /** La force avec laquelle le système s'entend lui-même. C'est le seul réglage qui compte. */
  couplage: number;
  /** Le niveau que l'homéostat cherche à tenir, en décibels. */
  cibleDb: number;
  /** Vitesse de correction de l'homéostat, de 0 à 1. */
  reactivite: number;
  /** Longueur de la mémoire où les grains sont puisés, en secondes. */
  memoireS: number;
  /** Densité de grains à pleine poussée, par seconde. */
  densiteMax: number;
  /** Faux pour débrancher l'homéostat — sert de témoin, et de rien d'autre. */
  homeostat: boolean;
  graine: number;
}

export interface Resultat {
  son: Float32Array;
  trajectoire: Point[];
  regime: Regime;
  /** Niveau intégré de la sortie, en décibels. */
  niveauFinalDb: number;
  /** Densité médiane sur la seconde moitié, une fois le système installé. */
  densiteMediane: number;
  /** Durée de grain médiane sur la seconde moitié, en millisecondes. */
  dureeMedianeMs: number;
}

/** La période de contrôle : le système se réexamine tous les 256 échantillons, soit 5,8 ms. */
export const PERIODE = 256;

const DB_PLANCHER = -120;

/**
 * Le bruit de fond de la pièce, à −100 dB environ.
 *
 * Inaudible, et indispensable : c'est ce qui empêche le zéro d'être un état absorbant, et ce à
 * partir de quoi le système peut toujours repartir.
 */
export const BRUIT_DE_FOND = 1e-5;

const enDb = (energie: number): number =>
  energie > 1e-12 ? 10 * Math.log10(energie) : DB_PLANCHER;

/** Un générateur à graine : sans lui, aucun des tests de régime n'aurait de sens. */
function alea(graine: number): () => number {
  let e = (graine >>> 0) || 1;
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0;
    return e / 4294967296;
  };
}

const fenetreHann = (n: number): Float32Array => {
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
  return f;
};

const mediane = (x: number[]): number => {
  if (x.length === 0) return 0;
  const t = [...x].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

/**
 * Le système, période par période.
 *
 * L'ORDRE DES OPÉRATIONS EST TOUT. Le système observe ce qu'il VIENT de produire, décide à partir
 * de cette observation, puis produit. Observer la période qu'on est en train d'écrire fermerait la
 * boucle sur elle-même dans le même instant, et le système n'aurait plus de dynamique du tout : il
 * se contenterait de résoudre une équation à chaque échantillon.
 */
export function vivre(monde: Float32Array, o: OptionsEcosysteme): Resultat {
  const sr = o.frequence;
  const total = Math.max(PERIODE, Math.round(o.duree * sr));
  const son = new Float32Array(total);
  const r = alea(o.graine);

  // La mémoire où les grains sont puisés : le passé du système, mêlé au monde.
  const tailleMemoire = Math.max(PERIODE * 4, Math.round(Math.max(0.05, o.memoireS) * sr));
  const memoire = new Float32Array(tailleMemoire);
  let curseur = 0;

  // Les deux échelles d'observation. Le système n'entend pas un niveau mais la DIFFÉRENCE entre ce
  // qu'il entend vite et ce qu'il entend lentement : c'est de cet écart que vient son agitation, et
  // un système qui ne mesurerait qu'un niveau resterait sourd à tout ce qui bouge à niveau égal.
  // Vingt millisecondes contre un demi-seconde. La longue ne peut pas l'être davantage : elle sert
  // aussi de mesure à l'homéostat, qui corrigerait alors une situation vieille de plusieurs
  // secondes et arriverait toujours trop tard pour rattraper quoi que ce soit.
  const tauRapide = Math.exp(-PERIODE / (0.02 * sr));
  const tauLent = Math.exp(-PERIODE / (0.5 * sr));
  let rapide = 0, lent = 0;
  // Et une troisième observation, celle de sa propre voix seule.
  //
  // DEUX OBSERVATIONS POUR DEUX RÔLES, ET LES CONFONDRE TUE LE SYSTÈME. Ce que le système ENTEND
  // commande son comportement — densité, durée, profondeur de mémoire. Ce qu'il ÉMET est ce qu'il
  // régule. Faire régler l'homéostat sur ce qu'il entend paraît plus simple et ne l'est pas : dans
  // un monde déjà plus fort que le point d'équilibre, l'erreur reste négative quoi que le système
  // fasse, la poussée tombe au plancher et n'en remonte jamais. Mesuré avant correction : un monde
  // à −9 dB pour une cible à −20 rendait une sortie à −36 dB, définitivement éteinte.
  let propre = 0;

  let poussee = 1;
  const trajectoire: Point[] = [];

  // Les grains en cours, qui débordent d'une période sur les suivantes.
  interface Grain { debut: number; longueur: number; lecture: number; gain: number; fenetre: Float32Array; }
  let vivants: Grain[] = [];
  const fenetres = new Map<number, Float32Array>();
  const fenetreDe = (n: number) => {
    let f = fenetres.get(n);
    if (!f) { f = fenetreHann(n); fenetres.set(n, f); }
    return f;
  };

  const couplage = Math.max(0, o.couplage);
  const densiteMax = Math.max(1, o.densiteMax);
  const reactivite = Math.max(0, Math.min(1, o.reactivite));
  let reste = 0;

  for (let debutPeriode = 0; debutPeriode < total; debutPeriode += PERIODE) {
    const fin = Math.min(total, debutPeriode + PERIODE);

    // ── 1. Le système écoute la pièce, c'est-à-dire lui-même ET le monde ───────────────────────
    // IL NE S'ÉCOUTE PAS SEUL, ET LA DIFFÉRENCE EST TOUT LE NŒUD. Un système qui n'observerait que
    // sa propre sortie n'entendrait jamais que sa propre texture granulaire : un monde tenu et un
    // monde de clics lui paraîtraient également agités, et le comportement cesserait de dépendre
    // de l'environnement — ce qui ôterait au dispositif la seule chose qui en fait un écosystème.
    // Le microphone de Di Scipio entend la pièce, et la pièce contient les deux.
    let energie = 0, sienne = 0;
    for (let i = Math.max(0, debutPeriode - PERIODE); i < debutPeriode; i++) {
      const entendu = son[i] + (monde[i] ?? 0);
      energie += entendu * entendu;
      sienne += son[i] * son[i];
    }
    energie /= PERIODE;
    sienne /= PERIODE;
    rapide = tauRapide * rapide + (1 - tauRapide) * energie;
    lent = tauLent * lent + (1 - tauLent) * energie;
    propre = tauLent * propre + (1 - tauLent) * sienne;
    const niveauDb = enDb(propre);
    const entenduDb = enDb(lent);
    // L'agitation est l'écart entre les deux observations, ramené en décibels puis borné : un son
    // qui bouge beaucoup fait diverger le rapide du lent, un son tenu les fait coïncider.
    const agitation = Math.min(1, Math.abs(enDb(rapide) - entenduDb) / 12);

    // ── 2. L'homéostat corrige l'écart au point d'équilibre ────────────────────────────────────
    if (o.homeostat) {
      // L'ERREUR EST BORNÉE, ET C'EST CE QUI EMPÊCHE L'EMBALLEMENT. Sans borne, un événement fort
      // produit une erreur de cent décibels, donc une correction cent fois trop brutale : la
      // poussée s'écrase contre son plancher, et quand l'événement passe il ne reste au système
      // qu'un bruit de fond à remonter de quatre-vingts décibels — ce qui prend plusieurs secondes.
      // Mesuré avant correction : le système s'éteignait au-delà d'un couplage de 0,9 dès qu'un
      // monde un peu fort l'avait traversé, alors qu'un couplage plus faible tenait sans peine.
      const erreur = Math.max(-12, Math.min(12, o.cibleDb - Math.max(DB_PLANCHER, niveauDb)));
      poussee = Math.max(POUSSEE_MIN, Math.min(POUSSEE_MAX, poussee + reactivite * erreur * 0.01));
    } else {
      poussee = 1;
    }

    // ── 3. Le système décide de sa propre texture ──────────────────────────────────────────────
    // C'EST ICI QUE CE N'EST PAS UN CONTRÔLE DE GAIN. L'observation ne commande pas un volume :
    // elle commande combien de grains, de quelle durée, et à quelle distance dans le passé.
    const densite = densiteMax * (0.08 + 0.92 * agitation);
    const longueurGrain = Math.max(
      Math.round(0.004 * sr),
      Math.min(Math.round(0.12 * sr), Math.round((2 / Math.max(1, densite)) * sr)),
    );
    // Agité, le système puise près du présent ; calme, il va chercher loin dans sa mémoire.
    const retardMax = Math.max(longueurGrain + 1, Math.round(tailleMemoire * (1 - 0.8 * agitation)));

    trajectoire.push({
      secondes: debutPeriode / sr,
      niveauDb,
      entenduDb,
      agitation,
      poussee,
      densite,
      dureeMs: (longueurGrain / sr) * 1000,
    });

    // ── 4. Les grains sont programmés ──────────────────────────────────────────────────────────
    // La partie fractionnaire décide d'un grain de plus, au hasard : arrondir interdirait toute
    // densité inférieure à un grain par période, comme pour les écrans de Xenakis.
    reste += (densite * PERIODE) / sr;
    const combien = Math.floor(reste) + (r() < reste - Math.floor(reste) ? 1 : 0);
    reste -= combien;
    for (let g = 0; g < combien; g++) {
      const retard = longueurGrain + Math.floor(r() * Math.max(1, retardMax - longueurGrain));
      vivants.push({
        debut: debutPeriode + Math.floor(r() * (fin - debutPeriode)),
        longueur: longueurGrain,
        lecture: (curseur - retard + tailleMemoire * 2) % tailleMemoire,
        // Le gain d'un grain porte la poussée et le couplage : c'est par lui que la boucle se
        // referme, et à couplage nul le système n'entend plus que le monde.
        gain: poussee * couplage * (0.5 + 0.5 * r()),
        fenetre: fenetreDe(longueurGrain),
      });
    }

    // ── 5. Les grains sont rendus, puis la mémoire est nourrie ─────────────────────────────────
    // LA SOMME EST RAMENÉE AU RECOUVREMENT ATTENDU, sans quoi l'homéostat n'a aucune autorité.
    // À cent vingt grains par seconde de vingt millisecondes, une dizaine de grains sonnent
    // ensemble : la somme entre alors si loin dans la saturation du tanh que la sortie vaut ±1
    // quelle que soit la poussée, et le système ne se règle plus du tout. Mesuré avant correction :
    // poussée au plancher de 0,02, et le niveau restait sept décibels au-dessus de la cible.
    const recouvrement = Math.max(1, (densite * longueurGrain) / sr);
    const echelle = 1 / Math.sqrt(recouvrement);
    for (let i = debutPeriode; i < fin; i++) {
      let somme = 0;
      for (const grain of vivants) {
        const k = i - grain.debut;
        if (k < 0 || k >= grain.longueur) continue;
        somme += memoire[(grain.lecture + k) % tailleMemoire] * grain.fenetre[k] * grain.gain;
      }
      // LA FONCTION NON LINÉAIRE ITÉRÉE, et elle n'est pas décorative : c'est elle qui borne le
      // système sans le couper, et c'est d'elle que viennent les régimes. Une boucle linéaire ne
      // saurait que s'éteindre ou exploser ; celle-ci peut se tenir, osciller, ou ne jamais se
      // répéter, selon la seule force du couplage.
      const sortie = Math.tanh(somme * echelle);
      son[i] = sortie;
      // LE BRUIT DE FOND N'EST PAS UN ARTIFICE, C'EST LA MATIÈRE PREMIÈRE. Sans lui, le zéro est un
      // état absorbant : que la mémoire s'annule une fois — et elle s'annule, la dynamique du
      // flottant finissant le travail dès que la boucle décroît — et le système est mort pour de
      // bon, aucune quantité de poussée ne pouvant amplifier du silence exact. Mesuré avant
      // correction : silence définitif au-delà d'un couplage de 0,9. Di Scipio fait de ce bruit le
      // point de départ de son « Background Noise Study » ; il joue ici le même rôle.
      memoire[curseur] = Math.tanh((monde[i] ?? 0) + couplage * sortie + BRUIT_DE_FOND * (r() * 2 - 1));
      curseur = (curseur + 1) % tailleMemoire;
    }
    vivants = vivants.filter((g) => g.debut + g.longueur > fin);
  }

  const seconde = trajectoire.slice(Math.floor(trajectoire.length / 2));
  let energieFinale = 0;
  for (const v of son) energieFinale += v * v;
  return {
    son,
    trajectoire,
    regime: diagnostiquer(trajectoire, o.cibleDb),
    niveauFinalDb: enDb(energieFinale / Math.max(1, son.length)),
    densiteMediane: mediane(seconde.map((p) => p.densite)),
    dureeMedianeMs: mediane(seconde.map((p) => p.dureeMs)),
  };
}

/**
 * Le régime que le système a trouvé.
 *
 * C'est la question que Di Scipio pose, et elle ne se lit pas sur les réglages : le même couplage
 * donne un système qui se tient ou un système qui s'emballe selon le monde qu'on lui donne. On la
 * lit donc sur la trajectoire, après avoir laissé au système le temps de s'installer.
 */
export const POUSSEE_MIN = 0.05;
export const POUSSEE_MAX = 6;

export function diagnostiquer(trajectoire: readonly Point[], cibleDb: number): Regime {
  const installe = trajectoire.slice(Math.floor(trajectoire.length / 3));
  if (installe.length < 8) return "insuffisant";

  // LE RÉGIME SE LIT SUR L'EFFORT DE RÉGULATION, ET NON SUR LE NIVEAU DE SORTIE. C'est la seule
  // lecture qui ait un sens ici : l'homéostat ramène le niveau à sa cible dans presque tous les
  // cas, si bien que le niveau ne distingue plus rien — un système qui se tient sans peine et un
  // système à bout de forces sonnent au même volume. Ce qui les sépare est ce qu'il a fallu
  // dépenser pour y arriver, et cela se lit sur la poussée.
  const poussees = installe.map((p) => p.poussee);
  const moyenne = poussees.reduce((s, v) => s + v, 0) / poussees.length;
  const auPlafond = poussees.filter((v) => v >= POUSSEE_MAX * 0.98).length / poussees.length;
  const auPlancher = poussees.filter((v) => v <= POUSSEE_MIN * 1.02).length / poussees.length;

  const niveaux = installe.map((p) => Math.max(DB_PLANCHER, p.niveauDb));
  const moyenNiveau = niveaux.reduce((s, v) => s + v, 0) / niveaux.length;

  // Poussée au plafond et cible hors d'atteinte : le couplage est trop faible pour que le système
  // se porte lui-même. Ce qu'on entend est le monde, à peine granulé.
  if (auPlafond > 0.6 && moyenNiveau < cibleDb - 6) return "insuffisant";
  // Poussée au plancher : le système s'emballerait si on le laissait faire, et l'homéostat ne fait
  // plus que le retenir. C'est là que les textures les plus vivantes se trouvent, et c'est là
  // aussi que le système peut dépasser sa cible puis s'effondrer, en une oscillation très lente.
  if (auPlancher > 0.6) return "bride";

  const centre = poussees.map((v) => v - moyenne);
  const variance = centre.reduce((s, v) => s + v * v, 0) / centre.length;
  // Une poussée qui balaie plus du tiers de sa course n'est pas une régulation, c'est un balancier.
  const etendue = Math.max(...poussees) - Math.min(...poussees);
  if (etendue > (POUSSEE_MAX - POUSSEE_MIN) / 3 && variance > 0.05) return "oscille";
  return "regule";
}

export const REGIMES = [
  { id: "insuffisant", fr: "porté par le monde", en: "carried by the world" },
  { id: "regule", fr: "il se tient", en: "holding itself" },
  { id: "oscille", fr: "balancier", en: "swinging" },
  { id: "bride", fr: "retenu de justesse", en: "barely held back" },
] as const;

export const nomRegime = (r: Regime, en: boolean): string =>
  (REGIMES.find((x) => x.id === r) ?? REGIMES[0])[en ? "en" : "fr"];

/** Une courbe en caractères, pour que la trajectoire se lise et non se devine. */
export function tracer(trajectoire: readonly Point[], valeur: (p: Point) => number, lignes = 8, colonnes = 60): string[] {
  if (trajectoire.length === 0) return [];
  const pas = Math.max(1, trajectoire.length / colonnes);
  const points: number[] = [];
  for (let c = 0; c < colonnes; c++) {
    const a = Math.floor(c * pas), b = Math.min(trajectoire.length, Math.floor((c + 1) * pas));
    let s = 0, n = 0;
    for (let i = a; i < b; i++) { s += valeur(trajectoire[i]); n++; }
    points.push(n > 0 ? s / n : points[points.length - 1] ?? 0);
  }
  const bas = Math.min(...points), haut = Math.max(...points);
  const plage = haut - bas || 1;
  const out: string[] = [];
  for (let l = lignes - 1; l >= 0; l--) {
    let ligne = "";
    for (const p of points) {
      const rang = Math.round(((p - bas) / plage) * (lignes - 1));
      ligne += rang === l ? "o" : rang > l ? "|" : " ";
    }
    out.push(ligne);
  }
  return out;
}
