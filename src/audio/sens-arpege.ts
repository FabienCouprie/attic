// audio/sens-arpege.ts — L'ordre dans lequel se succèdent les notes d'un arpège, déclaré une fois.
//
// POURQUOI CE MODULE EXISTE. Quatre composants offrent ce sens : l'arpégiateur MIDI ses huit
// directions, les accords joués, l'arpège spectral et la gamme jouée les trois premières. Chacun
// écrivait sa liste, et la gamme jouée l'écrivait au féminin, `montante` et `descendante`, quand les
// trois autres posaient `montant` et `descendant` (passe de complétude, lot 3c, 2026-11-14).
//
// LA TABLE EST CELLE DE L'ARPÉGIATEUR, qui l'offre entière ; ses identifiants étaient déjà ceux du
// dépôt pour le sens d'un arpège.

/** Les huit sens, dans l'ordre que l'arpégiateur offrait. */
export const SENS_ARPEGE = {
  ids: ["montant", "descendant", "aller-retour", "retour-aller", "aleatoire", "ordre-de-jeu", "convergent", "divergent"] as const,
  fr: ["Montant", "Descendant", "Aller-retour", "Retour-aller", "Aléatoire", "Ordre de jeu", "Convergent", "Divergent"],
  en: ["Ascending", "Descending", "Round trip", "Reverse round trip", "Random", "As played", "Converging", "Diverging"],
};

export type SensArpege = (typeof SENS_ARPEGE.ids)[number];

/**
 * Les quatre sens d'un balayage continu, ce qu'offre l'arpège spectral : la bande va et vient sur le
 * spectre, et les ordres sautés, tirés ou joués sont des ordres entre notes séparées, qu'il n'a pas.
 * Décision de Fabien du 2026-11-14.
 */
export const SENS_D_UN_BALAYAGE = ["montant", "descendant", "aller-retour", "retour-aller"] as const satisfies readonly SensArpege[];

/**
 * Les écritures d'avant que ne relisent ni l'identifiant ni le libellé d'aujourd'hui.
 *
 * L'ARPÉGIATEUR posait deux mots anglais dans sa liste française, `UpDown` et `DownUp`, et affichait
 * « Up » et « Down » ; l'arpège spectral affichait « Up », « Down » et « Up and down » ; la gamme
 * jouée enregistrait le féminin.
 */
export const LIBELLES_HERITES_SENS: Record<string, SensArpege> = {
  "UpDown": "aller-retour", "DownUp": "retour-aller", "Up": "montant", "Down": "descendant",
  "Up and down": "aller-retour",
  "montante": "montant", "descendante": "descendant", "Montante": "montant", "Descendante": "descendant",
};

/** Les listes d'un réglage de sens, pour les sens demandés, dans l'ordre de la table. */
export function choixSensArpege(ids: readonly SensArpege[] = SENS_ARPEGE.ids): {
  options: string[]; optionsEn: string[]; optionIds: SensArpege[]; optionsHeritees: Record<string, string>;
} {
  const rangs = SENS_ARPEGE.ids.flatMap((id, i) => (ids.includes(id) ? [i] : []));
  if (rangs.length !== ids.length) throw new Error(`sens inconnu parmi : ${ids.join(", ")}`);
  return {
    options: rangs.map((i) => SENS_ARPEGE.fr[i]),
    optionsEn: rangs.map((i) => SENS_ARPEGE.en[i]),
    optionIds: rangs.map((i) => SENS_ARPEGE.ids[i]),
    optionsHeritees: { ...LIBELLES_HERITES_SENS },
  };
}

/**
 * Le sens d'une valeur reçue, sous n'importe laquelle de ses écritures, ou `undefined`.
 *
 * UNE FONCTION, ET NON UNE CONVERSION À LA MAIN : la gamme jouée comparait son réglage à
 * `"montante"`, qui n'est plus un identifiant ; une comparaison en clair serait devenue fausse au
 * premier identifiant changé, et le réglage inerte sans que rien ne le dise.
 */
export function sensDe(valeur: unknown): SensArpege | undefined {
  const v = String(valeur).trim();
  const ids = SENS_ARPEGE.ids as readonly string[];
  if (ids.includes(v)) return v as SensArpege;
  const rang = Math.max(SENS_ARPEGE.fr.indexOf(v), SENS_ARPEGE.en.indexOf(v));
  if (rang >= 0) return SENS_ARPEGE.ids[rang];
  return LIBELLES_HERITES_SENS[v];
}

/**
 * Les sens d'un parcours joué une fois sur des notes tirées d'un nom, accord ou gamme : tous, sauf
 * l'ordre de jeu, que ces notes n'ont pas. Décision de Fabien du 2026-11-14.
 */
export const SENS_SANS_ORDRE_DE_JEU = SENS_ARPEGE.ids.filter((s) => s !== "ordre-de-jeu");

/**
 * Des hauteurs rangées du grave à l'aigu, dans l'ordre d'un sens, jouées une fois.
 *
 * JOUÉES UNE FOIS, ET NON EN BOUCLE comme dans l'arpégiateur : l'aller-retour ne rejoue pas son
 * sommet et finit sur sa note de départ, le retour-aller de même par le bas. C'est ce que les accords
 * joués et la gamme jouée faisaient déjà pour leurs trois sens, à la note près.
 *
 * L'ALÉATOIRE EST UN MÉLANGE DE FISHER-YATES sur le hasard reçu, qui vient de la graine du nœud.
 * L'ordre de jeu rend le montant : ces notes n'ont pas d'autre ordre.
 */
export function ordreUneFois(montant: readonly number[], sens: SensArpege, hasard: () => number): number[] {
  const m = [...montant];
  const d = [...m].reverse();
  // Des bords vers le milieu : la plus grave, la plus aiguë, la deuxième plus grave…
  const convergent = m.map((_, i) => m[i % 2 === 0 ? i / 2 : m.length - 1 - (i - 1) / 2]);
  switch (sens) {
    case "descendant": return d;
    case "aller-retour": return [...m, ...d.slice(1)];
    case "retour-aller": return [...d, ...m.slice(1)];
    case "convergent": return convergent;
    case "divergent": return [...convergent].reverse();
    case "aleatoire": {
      const out = [...m];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(hasard() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
    default: return m;
  }
}

/** Le sens reçu s'il est parmi ceux qu'un composant sait jouer, sinon son défaut. */
export function sensParmi<S extends SensArpege>(valeur: unknown, offerts: readonly S[], defaut: S): S {
  const s = sensDe(valeur);
  return s !== undefined && (offerts as readonly string[]).includes(s) ? (s as S) : defaut;
}
