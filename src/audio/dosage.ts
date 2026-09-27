// audio/dosage.ts — Appliquer un effet sur une portion de temps, et rien qu'elle.
//
// UN EFFET NE S'ALLUME PAS, IL SE DOSE. Couper l'entrée d'un effet à un instant, ou en brancher la
// sortie d'un coup, produit une discontinuité, et une discontinuité s'entend comme un clic. La
// portion de temps ne commande donc pas un interrupteur mais un MÉLANGE, dont la part varie :
//
//     y(t) = (1 − m·a(t))·sec(t) + a(t)·traité(t)
//
// L'effet tourne sur tout le signal ; c'est sa part qui est automatisée. Aucun effet n'a à savoir
// qu'il est dosé, et les cent dix-huit le deviennent d'un coup, y compris ceux qui regardent le
// signal entier et ne sauraient pas travailler par morceaux.
//
// DEUX FAÇONS D'APPLIQUER, ET C'EST LA CONSOLE QUI LES NOMME. En INSERTION, le traité remplace le
// sec, qui s'efface à mesure : c'est ce que veut un filtre, une distorsion, une transposition, et
// m vaut un. En DÉPART, le traité s'ajoute au sec qui reste entier : c'est ce que veut une
// réverbération ou un délai, et m vaut zéro. Une seule formule, un seul chemin de calcul.
//
// LA QUEUE D'UN EFFET DÉBORDE, OU NON, ET CELA SE DÉCIDE PAR LE CÂBLAGE. Fenêtrer ici, c'est
// fenêtrer la SORTIE de l'effet : sa queue est coupée avec la zone. Pour qu'une réverbération
// sonne après le passage qui l'a déclenchée, c'est son ENTRÉE qu'il faut fenêtrer, donc en amont
// de l'effet, et le dosage n'a plus alors qu'à additionner.
//
// LE FONDU SE TIENT À L'EXTÉRIEUR DE LA ZONE. Une zone dit ce qui doit être traité ; mordre dedans
// pour y loger la rampe laisserait une zone courte sans jamais atteindre sa dose. Les rampes sont
// donc posées avant et après, et deux zones voisines dont les rampes se rencontrent prennent le
// maximum des deux : l'enveloppe ne redescend pas entre elles, et ne dépasse jamais un.

/** Une portion de la ligne de temps, en secondes. */
export interface Zone {
  debut: number;
  duree: number;
}

/**
 * La loi du fondu enchaîné.
 *
 * ELLE DÉPEND DE CE QU'ON TRAVERSE, et se trompe de trois décibels quand on la choisit mal. Deux
 * signaux en phase, un son et sa version filtrée, s'additionnent en amplitude : leur somme garde
 * son niveau si les deux parts font un, donc en LINÉAIRE. Deux signaux sans rapport de phase, un
 * son et sa réverbération ou sa transposition, s'additionnent en puissance : leur somme garde son
 * niveau si les carrés des deux parts font un, donc en RACINE. Un fondu linéaire entre deux sons
 * décorrélés creuse un trou de trois décibels au passage.
 */
export type LoiFondu = "lineaire" | "puissance";

/** L'effet remplace le sec, ou s'ajoute à lui. */
export type ModeDosage = "insertion" | "depart";

export interface OptionsEnveloppe {
  /** Longueur en échantillons. */
  longueur: number;
  sampleRate: number;
  /** Les portions traitées. Aucune : tout le signal l'est. */
  zones?: readonly Zone[];
  fonduEntreeSec?: number;
  fonduSortieSec?: number;
  /** Traiter le complément : tout sauf les zones. */
  horsZones?: boolean;
}

/**
 * L'enveloppe d'application : un dans les zones, zéro dehors, une rampe à chaque frontière.
 *
 * SANS ZONE, ELLE VAUT UN PARTOUT, et cela vaut aussi pour le complément : le complément de rien
 * est le tout. Le nœud se comporte alors comme un mélange sec et traité ordinaire, ce qui est le
 * cas dégénéré utile plutôt qu'un cas interdit.
 */
export function enveloppeDeZones(o: OptionsEnveloppe): Float32Array {
  const n = Math.max(0, Math.floor(o.longueur));
  const env = new Float32Array(n);
  const zones = (o.zones ?? []).filter((z) => z && Number.isFinite(z.debut) && z.duree > 0);
  if (n === 0) return env;
  if (zones.length === 0) { env.fill(1); return env; }

  const sr = o.sampleRate;
  const dans = new Uint8Array(n);
  // L'ARRONDI VERS LE BAS, ET NON AU PLUS PROCHE : c'est la convention des nœuds de montage, et
  // une zone doit désigner les mêmes échantillons partout. Un demi-échantillon d'écart entre deux
  // nœuds qui lisent les mêmes zones laisserait une frontière non recouverte.
  for (const z of zones) {
    const d = Math.max(0, Math.floor(z.debut * sr));
    const f = Math.min(n, Math.floor((z.debut + z.duree) * sr));
    for (let i = d; i < f; i++) dans[i] = 1;
  }
  for (let i = 0; i < n; i++) env[i] = dans[i];

  const nE = Math.max(0, Math.round((o.fonduEntreeSec ?? 0) * sr));
  const nS = Math.max(0, Math.round((o.fonduSortieSec ?? 0) * sr));
  for (let i = 1; i < n; i++) {
    if (dans[i] === 1 && dans[i - 1] === 0 && nE > 0) {
      // Avant l'entrée dans la zone : de zéro jusqu'au bord, qui vaut déjà un.
      for (let j = Math.max(0, i - nE); j < i; j++) {
        const v = (j - (i - nE)) / nE;
        if (v > env[j]) env[j] = v;
      }
    } else if (dans[i] === 0 && dans[i - 1] === 1 && nS > 0) {
      // Après la sortie : depuis le bord, qui valait un, jusqu'à zéro.
      for (let j = i; j < Math.min(n, i + nS); j++) {
        const v = 1 - (j - i + 1) / nS;
        if (v > env[j]) env[j] = v;
      }
    }
  }

  // Le complément d'une rampe est la rampe inverse : la continuité tient d'elle-même.
  if (o.horsZones) for (let i = 0; i < n; i++) env[i] = 1 - env[i];
  return env;
}

export interface OptionsDosage {
  mode?: ModeDosage;
  loi?: LoiFondu;
}

/**
 * Mélange le sec et le traité, échantillon par échantillon, selon le dosage `a`.
 *
 * LA SORTIE PREND LA PLUS LONGUE DES DEUX ENTRÉES, le sec complété par du silence. Une
 * réverbération, un délai, un étirement rendent un tampon plus long que celui qu'ils ont reçu :
 * aligner sur le sec couperait exactement ce que l'effet a ajouté, et la queue serait perdue sans
 * qu'un message le dise.
 *
 * UN CANAL UNIQUE SE DOUBLE plutôt que d'imposer sa monophonie : un effet mono branché sur un son
 * stéréo ne doit pas rendre le mélange mono.
 *
 * Le dosage est tenu au-delà de sa fin, comme toute courbe plus courte que le son.
 */
export function doser(
  sec: readonly Float32Array[],
  traite: readonly Float32Array[],
  a: Float32Array,
  o: OptionsDosage = {},
): Float32Array[] {
  const mode = o.mode ?? "insertion";
  const loi = o.loi ?? "lineaire";
  const longueur = Math.max(
    sec.reduce((m, c) => Math.max(m, c.length), 0),
    traite.reduce((m, c) => Math.max(m, c.length), 0),
  );
  const canaux = Math.max(sec.length, traite.length, 1);
  const aFin = a.length > 0 ? a[a.length - 1] : 1;
  const sorties: Float32Array[] = [];

  for (let c = 0; c < canaux; c++) {
    const s = sec[Math.min(c, sec.length - 1)] ?? new Float32Array(0);
    const t = traite[Math.min(c, traite.length - 1)] ?? new Float32Array(0);
    const y = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) {
      const dose = Math.min(1, Math.max(0, i < a.length ? a[i] : aFin));
      const vs = i < s.length ? s[i] : 0;
      const vt = i < t.length ? t[i] : 0;
      if (mode === "depart") {
        y[i] = vs + dose * vt;
      } else if (loi === "puissance") {
        y[i] = Math.sqrt(1 - dose) * vs + Math.sqrt(dose) * vt;
      } else {
        y[i] = (1 - dose) * vs + dose * vt;
      }
    }
    sorties.push(y);
  }
  return sorties;
}
