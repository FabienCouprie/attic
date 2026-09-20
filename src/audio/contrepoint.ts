// audio/contrepoint.ts — Vérificateur de contrepoint de première espèce (Fux).
//
// C'est le premier nœud d'Attic qui CORRIGE au lieu de produire. Johann Joseph Fux a publié
// en 1725 le « Gradus ad Parnassum », où le contrepoint s'apprend par espèces : à la
// première, une note contre une note, ce qui isole la question de l'harmonie et du mouvement
// entre deux voix sans que le rythme s'en mêle. Haydn, Mozart et Beethoven l'ont tous
// travaillé, et les règles n'ont pas changé depuis.
//
// Elles tiennent en peu de choses, et chacune se vérifie mécaniquement : seules les
// consonances sont admises, les quintes et octaves parallèles sont interdites, on commence
// et l'on finit sur une consonance parfaite, les sauts se compensent, et la cadence se fait
// par mouvement contraire vers l'octave ou l'unisson.
//
// Le nœud ne réécrit rien : il ANNOTE. C'est ce que fait un professeur, et c'est plus utile
// qu'une correction automatique, qui priverait de la seule chose qui compte — comprendre
// pourquoi la règle existe.

export interface Infraction {
  /** Numéro de la note concernée, à partir de 1. */
  position: number;
  /** Identifiant stable de la règle, pour le test et la traduction. */
  regle: string;
  fr: string;
  en: string;
  /** « erreur » pour une interdiction, « avis » pour une recommandation. */
  gravite: "erreur" | "avis";
}

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nom = (n: number) => NOMS[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

/** Les consonances, en demi-tons dans l'octave. La QUARTE n'en est pas une à deux voix. */
const CONSONANCES = new Set([0, 3, 4, 7, 8, 9]);
const PARFAITES = new Set([0, 7]);

const intervalle = (bas: number, haut: number): number => Math.abs(haut - bas) % 12;

/** Les intervalles mélodiques interdits : septièmes, et tout ce qui est augmenté ou diminué. */
const MELODIQUES_INTERDITS = new Set([6, 10, 11]);

export interface OptionsContrepoint {
  /** Autorise les unissons ailleurs qu'au début et à la fin. */
  unissonsInterieurs?: boolean;
}

/**
 * Vérifie deux voix, note contre note.
 *
 * `basse` est le cantus firmus, `haute` le contrepoint — mais le vérificateur ne suppose
 * rien de leur ordre : il compare à chaque instant la plus grave et la plus aiguë, et
 * signale les croisements au passage.
 */
export function verifier(
  basse: number[], haute: number[], options: OptionsContrepoint = {},
): Infraction[] {
  const n = Math.min(basse.length, haute.length);
  const infractions: Infraction[] = [];
  const ajouter = (position: number, regle: string, fr: string, en: string, gravite: "erreur" | "avis" = "erreur") =>
    infractions.push({ position, regle, fr, en, gravite });

  if (n === 0) return infractions;
  if (basse.length !== haute.length) {
    ajouter(1, "longueurs", "Les deux voix n'ont pas le même nombre de notes.",
      "The two voices do not have the same number of notes.");
  }

  for (let i = 0; i < n; i++) {
    const bas = Math.min(basse[i], haute[i]);
    const hautNote = Math.max(basse[i], haute[i]);
    const iv = intervalle(bas, hautNote);
    const estUnisson = bas === hautNote;

    // 1. Seules les consonances sont admises en première espèce.
    if (!CONSONANCES.has(iv)) {
      ajouter(i + 1, "dissonance",
        `Dissonance sur le temps ${i + 1} : ${nom(bas)}–${nom(hautNote)}.`,
        `Dissonance on beat ${i + 1}: ${nom(bas)}–${nom(hautNote)}.`);
    }

    // 2. Début et fin sur une consonance parfaite.
    if ((i === 0 || i === n - 1) && !PARFAITES.has(iv)) {
      ajouter(i + 1, i === 0 ? "debut" : "fin",
        i === 0
          ? "Le premier accord doit être une consonance parfaite : unisson, quinte ou octave."
          : "Le dernier accord doit être un unisson ou une octave.",
        i === 0
          ? "The first interval must be a perfect consonance: unison, fifth or octave."
          : "The last interval must be a unison or an octave.");
    }
    if (i === n - 1 && iv === 7) {
      ajouter(i + 1, "fin.quinte", "La pièce ne peut pas se terminer sur une quinte.",
        "The piece cannot end on a fifth.");
    }

    // 3. Pas d'unisson à l'intérieur, sauf autorisation.
    if (estUnisson && i > 0 && i < n - 1 && !options.unissonsInterieurs) {
      ajouter(i + 1, "unisson", `Unisson au temps ${i + 1} : les voix se confondent.`,
        `Unison on beat ${i + 1}: the voices merge.`);
    }

    // 4. Croisement des voix.
    if (i > 0 && (basse[i] > haute[i]) !== (basse[i - 1] > haute[i - 1])
      && basse[i] !== haute[i] && basse[i - 1] !== haute[i - 1]) {
      ajouter(i + 1, "croisement", `Les voix se croisent au temps ${i + 1}.`,
        `The voices cross on beat ${i + 1}.`, "avis");
    }

    if (i === 0) continue;

    // 5. Mouvements parallèles vers une consonance parfaite.
    const ivPrecedent = intervalle(Math.min(basse[i - 1], haute[i - 1]), Math.max(basse[i - 1], haute[i - 1]));
    const mouvementBasse = basse[i] - basse[i - 1];
    const mouvementHaute = haute[i] - haute[i - 1];
    const memeSens = mouvementBasse * mouvementHaute > 0;
    if (PARFAITES.has(iv) && iv === ivPrecedent && (mouvementBasse !== 0 || mouvementHaute !== 0)) {
      ajouter(i + 1, iv === 0 ? "octaves.paralleles" : "quintes.paralleles",
        iv === 0
          ? `Octaves parallèles entre les temps ${i} et ${i + 1}.`
          : `Quintes parallèles entre les temps ${i} et ${i + 1}.`,
        iv === 0
          ? `Parallel octaves between beats ${i} and ${i + 1}.`
          : `Parallel fifths between beats ${i} and ${i + 1}.`);
    } else if (PARFAITES.has(iv) && memeSens) {
      // 6. Quintes et octaves directes : y arriver par mouvement semblable s'entend presque
      // comme un parallélisme, et la règle les proscrit aussi.
      ajouter(i + 1, "directe",
        `Consonance parfaite atteinte par mouvement semblable au temps ${i + 1}.`,
        `Perfect consonance reached by similar motion on beat ${i + 1}.`);
    }

    // 7. Intervalles mélodiques interdits, et sauts démesurés.
    for (const [voix, ligne] of [["basse", basse], ["haute", haute]] as [string, number[]][]) {
      const saut = Math.abs(ligne[i] - ligne[i - 1]);
      if (MELODIQUES_INTERDITS.has(saut % 12) && saut < 12) {
        ajouter(i + 1, "melodique",
          `Intervalle mélodique interdit à la voix ${voix === "basse" ? "grave" : "aiguë"}, temps ${i + 1}.`,
          `Forbidden melodic interval in the ${voix === "basse" ? "lower" : "upper"} voice, beat ${i + 1}.`);
      }
      if (saut > 12) {
        ajouter(i + 1, "saut",
          `Saut de plus d'une octave à la voix ${voix === "basse" ? "grave" : "aiguë"}, temps ${i + 1}.`,
          `Leap larger than an octave in the ${voix === "basse" ? "lower" : "upper"} voice, beat ${i + 1}.`);
      }
      // 8. Un saut d'une sixte ou plus se compense par un mouvement contraire.
      if (saut >= 8 && i + 1 < n) {
        const apres = ligne[i + 1] - ligne[i];
        const avant = ligne[i] - ligne[i - 1];
        if (apres * avant > 0 || Math.abs(apres) > 4) {
          ajouter(i + 2, "saut.compensation",
            `Le grand saut du temps ${i + 1} n'est pas compensé par un mouvement contraire conjoint.`,
            `The large leap on beat ${i + 1} is not answered by contrary stepwise motion.`, "avis");
        }
      }
    }
  }

  // 9. La cadence : l'avant-dernier intervalle doit se résoudre par mouvement contraire.
  if (n >= 2) {
    const ivFinal = intervalle(Math.min(basse[n - 1], haute[n - 1]), Math.max(basse[n - 1], haute[n - 1]));
    const avant = intervalle(Math.min(basse[n - 2], haute[n - 2]), Math.max(basse[n - 2], haute[n - 2]));
    const contraire = (basse[n - 1] - basse[n - 2]) * (haute[n - 1] - haute[n - 2]) < 0;
    if (PARFAITES.has(ivFinal) && !contraire) {
      ajouter(n, "cadence",
        "La cadence doit se faire par mouvement contraire : une sixte vers l'octave, ou une tierce vers l'unisson.",
        "The cadence must be by contrary motion: a sixth to the octave, or a third to the unison.");
    }
    if (ivFinal === 0 && avant !== 9 && avant !== 3 && avant !== 4) {
      ajouter(n, "cadence.intervalle",
        `L'avant-dernier intervalle d'une cadence se veut sixte ou tierce, et non ${avant} demi-tons.`,
        `The penultimate interval of a cadence should be a sixth or a third, not ${avant} semitones.`, "avis");
    }
  }

  // 10. Une ligne doit avoir un sommet, et un seul.
  const sommets = haute.filter((x) => x === Math.max(...haute)).length;
  if (n >= 4 && sommets > 1) {
    ajouter(haute.indexOf(Math.max(...haute)) + 1, "sommet",
      "La voix aiguë atteint son sommet plusieurs fois : une ligne n'a qu'un point culminant.",
      "The upper voice reaches its peak more than once: a line has a single climax.", "avis");
  }

  return infractions.sort((a, b) => a.position - b.position);
}

export interface Bilan {
  erreurs: number;
  avis: number;
  /** Règles enfreintes, sans doublon, dans l'ordre d'apparition. */
  regles: string[];
}

export function bilan(infractions: Infraction[]): Bilan {
  return {
    erreurs: infractions.filter((i) => i.gravite === "erreur").length,
    avis: infractions.filter((i) => i.gravite === "avis").length,
    regles: [...new Set(infractions.map((i) => i.regle))],
  };
}
