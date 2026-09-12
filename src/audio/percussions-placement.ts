// audio/percussions-placement.ts — Où poser chaque frappe de batterie.
//
// POURQUOI CE MODULE EXISTE
//
// Le rendu de batterie passait par un seul `Tone.Offline` où les huit synthés
// recevaient l'intégralité des frappes. Mesuré dans l'app : 200 frappes sur une
// seule voix, sur 60 s, coûtaient **78 s** de calcul, contre 18 s pour les mêmes
// 200 frappes réparties sur quatre voix, et 3,3 s pour une frappe unique sur la
// même durée. Le coût est donc quadratique dans le nombre d'événements posés sur
// un MÊME synthé — la timeline d'automation de Tone est parcourue à chaque
// déclenchement. Or un groove concentre ses frappes sur le charley : c'est
// systématiquement le pire cas. Un morceau de cinq minutes devenait impossible
// (537 s mesurées pour 150 s de musique dans le nœud Groove Box).
//
// La sortie : rendre CHAQUE SON UNE FOIS avec Tone — un déclenchement, donc une
// timeline à un événement — puis recopier l'échantillon obtenu à chaque frappe.
// Le coût ne dépend plus de la durée du morceau, et devient linéaire dans le
// nombre de frappes.
//
// Ce que cela suppose, et qui a été vérifié dans l'app avant d'être écrit :
// la vélocité et le paramètre Volume agissent comme de simples gains. Le rendu
// d'une frappe à vélocité 64 est **bit à bit identique** au rendu à 127 multiplié
// par 64/127 (écart maximal mesuré : 0), et de même pour Volume 50 contre 100.
// Une copie mise à l'échelle est donc exactement ce que produisait l'ancien code.

/** Une frappe de batterie, telle que le MIDI la donne. */
export type Frappe = { note: number; velocite: number; debut: number; fin: number };

/**
 * Un déclenchement de synthé.
 *
 * La distinction entre `voix` et le triplet complet n'est pas cosmétique :
 * - la VOIX est l'instance de synthé, donc l'unité de monophonie — deux frappes
 *   rapprochées sur la même voix se coupent ;
 * - la HAUTEUR et la DURÉE font le son — `lowTom` sert A1 pour la note 45 et C2
 *   pour la note 47, deux sons distincts sur une seule voix.
 * Confondre les deux donnerait soit deux toms qui ne se coupent plus, soit un
 * seul son pour deux notes.
 */
export type Declenchement = { voix: string; hauteur: string | null; duree: string };

/** Identifiant d'un échantillon à rendre : voix + hauteur + durée. */
export function cleEchantillon(d: Declenchement): string {
  return `${d.voix}|${d.hauteur ?? "-"}|${d.duree}`;
}

/**
 * Les déclenchements produits par une note General MIDI.
 *
 * Une note peut en produire DEUX : la caisse claire est un corps (membrane) plus
 * un bruit, joués ensemble. Les deux ont leur propre voix, donc leur propre
 * monophonie.
 *
 * Une note inconnue tombe sur la grosse caisse. Ce repli est celui du code
 * d'origine ; il est conservé tel quel — un kit General MIDI compte une
 * quarantaine de percussions et n'en mapper que dix laisserait sinon des frappes
 * muettes, ce qui s'entend moins bien qu'un son approché.
 */
export function declenchementsPour(note: number): Declenchement[] {
  switch (note) {
    case 36: return [{ voix: "kick", hauteur: "C2", duree: "8n" }];
    case 38: return [
      { voix: "snare", hauteur: "D2", duree: "8n" },
      { voix: "snareNoise", hauteur: null, duree: "16n" },
    ];
    case 39: return [{ voix: "clap", hauteur: null, duree: "16n" }];
    case 42:
    case 44: return [{ voix: "hihat", hauteur: "C5", duree: "32n" }];
    case 46: return [{ voix: "hihatOpen", hauteur: "C5", duree: "16n" }];
    case 45: return [{ voix: "lowTom", hauteur: "A1", duree: "8n" }];
    case 47: return [{ voix: "lowTom", hauteur: "C2", duree: "8n" }];
    case 48: return [{ voix: "highTom", hauteur: "E2", duree: "8n" }];
    case 50: return [{ voix: "highTom", hauteur: "F2", duree: "8n" }];
    case 49: return [{ voix: "crash", hauteur: "C5", duree: "4n" }];
    default: return [{ voix: "kick", hauteur: "C2", duree: "8n" }];
  }
}

/** Les échantillons à rendre pour un ensemble de frappes, sans doublon. */
export function echantillonsRequis(frappes: Frappe[]): Declenchement[] {
  const vus = new Map<string, Declenchement>();
  for (const f of frappes) {
    for (const d of declenchementsPour(f.note)) {
      const cle = cleEchantillon(d);
      if (!vus.has(cle)) vus.set(cle, d);
    }
  }
  return [...vus.values()];
}

/**
 * Durée d'un déclenchement en secondes, dans la notation de Tone.
 *
 * Les valeurs sont celles du tempo par défaut de Tone (120 BPM) : `Tone.Offline`
 * crée son propre transport et le code de rendu ne l'a jamais réglé. La
 * conséquence était déjà là avant ce module et est conservée telle quelle — la
 * longueur des sons de batterie ne suit pas le tempo du morceau, une caisse
 * claire dure autant à 60 qu'à 200 BPM.
 */
export function secondesDeclenchement(duree: string): number {
  switch (duree) {
    case "4n": return 0.5;
    case "8n": return 0.25;
    case "16n": return 0.125;
    case "32n": return 0.0625;
    default: return 0.25;
  }
}

/** Un son rendu une fois, prêt à être recopié. */
export type Echantillon = { gauche: Float32Array; droite: Float32Array };

export interface OptionsPlacement {
  frappes: Frappe[];
  /** Échantillons rendus, indexés par `cleEchantillon`. */
  echantillons: Map<string, Echantillon>;
  sortie: { gauche: Float32Array; droite: Float32Array };
  sampleRate: number;
  /** Gain global (Volume / 100). */
  gain: number;
  /**
   * Rampe appliquée quand une frappe est coupée par la suivante sur sa voix.
   * Un synthé monophonique ne s'éteint pas en fondu — il repart de son niveau
   * courant — mais une coupure franche produirait un clic, que l'ancien rendu
   * n'avait pas. 5 ms sont inaudibles et suffisent à l'éviter.
   */
  releaseSec?: number;
}

export interface ResultatPlacement {
  placees: number;
  /** Frappes dont l'échantillon manquait (ne devrait pas arriver). */
  ignorees: number;
  /** Frappes écourtées par la suivante sur leur voix. */
  coupees: number;
}

/**
 * Recopie chaque échantillon à la position de sa frappe, mis à l'échelle par la
 * vélocité et le volume, en coupant une frappe quand la suivante arrive sur la
 * même voix.
 *
 * Écrit en accumulant : deux voix différentes qui se chevauchent s'additionnent,
 * comme le faisaient les huit synthés branchés sur la même destination.
 */
export function placerPercussions(o: OptionsPlacement): ResultatPlacement {
  const { frappes, echantillons, sortie, sampleRate, gain } = o;
  const releaseSec = o.releaseSec ?? 0.005;
  const longueur = Math.min(sortie.gauche.length, sortie.droite.length);
  let placees = 0, ignorees = 0, coupees = 0;

  // Prochaine frappe de chaque voix : c'est elle qui borne la précédente.
  // Les frappes ne sont pas garanties triées, et un MIDI bouclé ou fusionné en
  // donne souvent dans le désordre : on trie par voix plutôt que de l'espérer.
  const parVoix = new Map<string, number[]>();
  for (const f of frappes) {
    for (const d of declenchementsPour(f.note)) {
      const liste = parVoix.get(d.voix) ?? [];
      liste.push(f.debut);
      parVoix.set(d.voix, liste);
    }
  }
  for (const liste of parVoix.values()) liste.sort((a, b) => a - b);

  const prochaine = (voix: string, debut: number): number | null => {
    const liste = parVoix.get(voix);
    if (!liste) return null;
    // Première position strictement postérieure : deux frappes simultanées sur
    // une même voix ne se coupent pas l'une l'autre — elles s'additionnent, ce
    // que faisait aussi le déclenchement unique de l'ancien code.
    for (const t of liste) if (t > debut) return t;
    return null;
  };

  for (const f of frappes) {
    const facteur = gain * Math.max(0, Math.min(1, f.velocite / 127));
    for (const d of declenchementsPour(f.note)) {
      const ech = echantillons.get(cleEchantillon(d));
      if (!ech) { ignorees++; continue; }

      const depart = Math.max(0, Math.round(f.debut * sampleRate));
      if (depart >= longueur) { placees++; continue; }

      // Longueur jouable : l'échantillon, la fin du tampon, et la frappe
      // suivante sur la même voix, le plus court des trois.
      let disponible = Math.min(ech.gauche.length, longueur - depart);
      const suivante = prochaine(d.voix, f.debut);
      let coupe = false;
      if (suivante !== null) {
        const jusqua = Math.max(1, Math.round((suivante - f.debut) * sampleRate));
        if (jusqua < disponible) { disponible = jusqua; coupe = true; }
      }
      if (coupe) coupees++;

      // Rampe de sortie, resserrée si l'intervalle est plus court qu'elle.
      const rampe = coupe ? Math.min(Math.round(releaseSec * sampleRate), disponible) : 0;
      const debutRampe = disponible - rampe;

      if (facteur === 0) { placees++; continue; }
      for (let i = 0; i < disponible; i++) {
        const att = rampe > 0 && i >= debutRampe ? 1 - (i - debutRampe) / rampe : 1;
        const k = facteur * att;
        sortie.gauche[depart + i] += ech.gauche[i] * k;
        sortie.droite[depart + i] += ech.droite[i] * k;
      }
      placees++;
    }
  }

  return { placees, ignorees, coupees };
}
