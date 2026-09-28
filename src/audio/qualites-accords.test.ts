// audio/qualites-accords.test.ts — La table des accords, et ce qu'elle doit aux trois qu'elle range.
//
// CE QUE CES CAS TIENNENT. D'abord qu'aucun accord des tables d'avant n'a changé d'intervalles : une
// table qui en remplace trois ne se croit pas sur parole. Puis que les anciens noms répondent
// encore, un identifiant devenu inconnu faisant retomber un graphe rouvert sur l'accord par défaut.
// Puis que les accords ajoutés sont justes, intervalle par intervalle. Enfin, et c'est le cas qui
// vaut le plus cher, que `tonal` soit prise en TÉMOIN là où les deux s'accordent : vingt-huit
// qualités gardées par une source extérieure, et les cinq écarts nommés avec leur raison.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Chord, Note } from "tonal";
import {
  QUALITES, completer, dansLeSens, intervallesDaccord, jouerAccord, notesDaccord, qualiteDe,
  qualitesDe, qualitesParIds,
} from "./qualites-accords";

/** Les sources où une table d'accords pourrait réapparaître. */
function sourcesAudioEtPlugins(dossiers = [join("src", "audio"), join("src", "plugins")]): string[] {
  const out: string[] = [];
  for (const d of dossiers) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...sourcesAudioEtPlugins([join(d, e.name)]));
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(join(d, e.name));
    }
  }
  return out;
}

/** Les intervalles tels que les trois tables d'avant les écrivaient, recopiés. */
const AVANT: Record<string, number[]> = {
  // `audio/accords.ts`, dix types, employés par la détection d'accords.
  maj: [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  m7b5: [0, 3, 6, 10],
};

/** Les noms que les trois tables employaient, et ce qu'ils doivent désigner. */
const ANCIENS_NOMS: Record<string, string> = {
  // `audio/accords.ts`
  min: "m", min7: "m7", min7b5: "m7b5",
  // `audio/koch.ts`, en français
  Majeur: "maj", Mineur: "m", "Augmenté": "aug", "Diminué": "dim", Sus4: "sus4",
  // `audio/generation-fractale.ts`
  "Triade M": "maj", "Triade m": "m", "Arpège 7": "7",
};

describe("la table des accords", () => {
  it("N'A CHANGÉ AUCUN INTERVALLE de ce qui existait", () => {
    for (const [id, intervalles] of Object.entries(AVANT)) {
      expect(qualiteDe(id), `${id} a disparu de la table`).toBeTruthy();
      expect(qualiteDe(id)!.intervalles, `${id} n'a plus les mêmes intervalles`).toEqual(intervalles);
    }
  });

  it("RÉPOND ENCORE AUX ANCIENS NOMS, sinon un projet rouvert changerait d'accord", () => {
    for (const [ancien, attendu] of Object.entries(ANCIENS_NOMS)) {
      expect(qualiteDe(ancien)?.id, `« ${ancien} » ne désigne plus rien`).toBe(attendu);
    }
  });

  it("CHAQUE ACCORD COMMENCE À LA FONDAMENTALE, EST TRIÉ, ET NE RÉPÈTE RIEN", () => {
    for (const q of QUALITES) {
      expect(q.intervalles[0], `${q.id} ne commence pas à la fondamentale`).toBe(0);
      expect([...q.intervalles].sort((a, b) => a - b), `${q.id} n'est pas trié`).toEqual(q.intervalles);
      expect(new Set(q.intervalles).size, `${q.id} répète un intervalle`).toBe(q.intervalles.length);
      expect(q.intervalles.length, `${q.id} n'a pas assez de notes`).toBeGreaterThanOrEqual(3);
    }
  });

  it("DEUX QUALITÉS NE PARTAGENT NI UN IDENTIFIANT NI UN ALIAS", () => {
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const q of QUALITES) {
      for (const cle of [q.id, ...(q.alias ?? [])]) {
        if (vus.has(cle)) doubles.push(`${cle} : ${vus.get(cle)} et ${q.id}`);
        vus.set(cle, q.id);
      }
    }
    expect(doubles).toEqual([]);
  });

  it("DEUX QUALITÉS NE PARTAGENT PAS LE MÊME JEU D'INTERVALLES", () => {
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const q of QUALITES) {
      const cle = q.intervalles.join(",");
      if (vus.has(cle)) doubles.push(`${cle} : ${vus.get(cle)} et ${q.id}`);
      vus.set(cle, q.id);
    }
    expect(doubles).toEqual([]);
  });

  it("LES CINQ FAMILLES SONT REPRÉSENTÉES, et chaque qualité en a une", () => {
    for (const f of ["triade", "septieme", "extension", "altere", "suspendu"] as const) {
      expect(qualitesDe(f).length, `la famille « ${f} » est vide`).toBeGreaterThan(0);
    }
    for (const q of QUALITES) expect(q.familles.length, `${q.id} n'a pas de famille`).toBeGreaterThan(0);
  });

  it("LES ACCORDS AJOUTÉS SONT JUSTES, intervalle par intervalle", () => {
    // Le demi-diminué, premier accord de tout II-V-I mineur.
    expect(qualiteDe("m7b5")!.intervalles).toEqual([0, 3, 6, 10]);
    // Le diminué septième empile quatre tierces mineures, d'où sa symétrie.
    const dim7 = qualiteDe("dim7")!.intervalles;
    expect(dim7.map((v, i) => (i > 0 ? v - dim7[i - 1] : 3))).toEqual([3, 3, 3, 3]);
    // La onzième se joue sans sa tierce, la treizième de dominante sans sa onzième.
    expect(qualiteDe("11")!.intervalles).not.toContain(4);
    expect(qualiteDe("13")!.intervalles).not.toContain(17);
    // Mais la onzième mineure garde les deux, la tierce mineure ne frottant pas contre elle.
    expect(qualiteDe("m11")!.intervalles).toContain(3);
    expect(qualiteDe("m11")!.intervalles).toContain(17);
    // L'ajoutée neuvième n'a pas de septième : c'est ce qui la sépare de la neuvième de dominante.
    expect(qualiteDe("add9")!.intervalles).not.toContain(10);
    expect(qualiteDe("9")!.intervalles).toContain(10);
  });

  it("UNE QUINTE ALTÉRÉE REMPLACE LA QUINTE JUSTE, elle ne s'y ajoute pas", () => {
    // C'est la faute que `tonal` commet sur ses symboles composés, et la raison pour laquelle cette
    // table est déclarée plutôt que dérivée d'elle.
    for (const id of ["7b5", "7b5b9", "7b5s9"]) {
      expect(qualiteDe(id)!.intervalles, id).toContain(6);
      expect(qualiteDe(id)!.intervalles, `${id} garde une quinte juste en plus de sa quinte bémol`)
        .not.toContain(7);
    }
    for (const id of ["7s5", "7s5b9", "7s5s9"]) {
      expect(qualiteDe(id)!.intervalles, id).toContain(8);
      expect(qualiteDe(id)!.intervalles, `${id} garde une quinte juste en plus de sa quinte augmentée`)
        .not.toContain(7);
    }
  });

  it("un identifiant inconnu ne fabrique pas d'accord, mais les intervalles ont un secours", () => {
    expect(qualiteDe("accord-qui-n-existe-pas")).toBeUndefined();
    expect(intervallesDaccord("accord-qui-n-existe-pas")).toEqual(AVANT.maj);
    expect(() => qualitesParIds(["accord-qui-n-existe-pas"])).toThrow();
  });

  it("l'ordre historique d'un composant est conservé, et le reste vient après", () => {
    const suite = completer(["m", "maj"]).map((q) => q.id);
    expect(suite.slice(0, 2)).toEqual(["m", "maj"]);
    expect(suite.length).toBe(QUALITES.length);
    expect(new Set(suite).size).toBe(QUALITES.length);
  });

  // LE GARDE DES TABLES PRIVÉES A DÉMÉNAGÉ dans `nomenclatures.test.ts`, où la même règle vaut pour
  // les gammes, les accords et les rythmes. Celui-ci cherchait déjà la FORME et non le nom, et
  // c'est ce modèle-là qui a servi à refaire celui des gammes, lequel n'avait rien vu.
});

describe("la table confrontée à « tonal », prise en témoin", () => {
  /**
   * Les classes de hauteur d'un accord de tonal, depuis do.
   *
   * LE SYMBOLE EST RAMENÉ À L'ASCII : la table écrit « 7♯9 » et « m7♭5 » avec les signes
   * typographiques, que tonal ne sait pas lire. Ce qui est comparé reste le même accord.
   */
  function classesDeTonal(symbole: string): number[] | null {
    const ascii = symbole.replace(/♯/g, "#").replace(/♭/g, "b").replace(/[()]/g, "");
    const c = Chord.get("C" + ascii);
    if (c.empty) return null;
    const demiTons = c.notes.map((n) => (Note.midi(n + "4") ?? 60) - 60);
    return [...new Set(demiTons.map((v) => ((v % 12) + 12) % 12))].sort((a, b) => a - b);
  }
  const classes = (v: readonly number[]) =>
    [...new Set(v.map((x) => ((x % 12) + 12) % 12))].sort((a, b) => a - b);

  /**
   * Les qualités sur lesquelles les deux sources divergent, chacune avec sa raison.
   *
   * ELLES SONT NOMMÉES UNE PAR UNE, et non écartées en bloc : une divergence qui disparaîtrait
   * — parce que `tonal` se corrige — doit se voir, et le cas suivant l'exige.
   */
  const DIVERGENCES: Record<string, string> = {
    m13: "tonal omet la onzième, que l'usage du jazz met sur un accord mineur",
    "7b5b9": "tonal garde la quinte juste en plus de la quinte bémol, contre son propre 7b5",
    "7b5s9": "tonal garde la quinte juste en plus de la quinte bémol, contre son propre 7b5",
  };

  it("VINGT-HUIT QUALITÉS SONT CONFIRMÉES PAR UNE SOURCE EXTÉRIEURE", () => {
    const desaccords: string[] = [];
    let confirmees = 0;
    for (const q of QUALITES) {
      if (q.id in DIVERGENCES) continue;
      const vu = classesDeTonal(q.symbole);
      if (vu === null) continue;
      if (JSON.stringify(vu) === JSON.stringify(classes(q.intervalles))) confirmees++;
      else desaccords.push(`${q.id} (${q.symbole}) : nous [${classes(q.intervalles)}] · tonal [${vu}]`);
    }
    expect(desaccords, "une qualité déclarée contre l'avis de tonal se nomme dans DIVERGENCES")
      .toEqual([]);
    expect(confirmees).toBeGreaterThanOrEqual(28);
  });

  it("ET LES DIVERGENCES EXISTENT ENCORE, sinon la tolérance masquerait un défaut", () => {
    const disparues: string[] = [];
    for (const [id, raison] of Object.entries(DIVERGENCES)) {
      const q = qualiteDe(id)!;
      const vu = classesDeTonal(q.symbole);
      if (vu && JSON.stringify(vu) === JSON.stringify(classes(q.intervalles))) {
        disparues.push(`${id} : ${raison} — les deux sont désormais d'accord, retirer la tolérance`);
      }
    }
    expect(disparues).toEqual([]);
  });
});

describe("les notes d'un accord", () => {
  const DO4 = 60;

  it("SE POSENT DEPUIS LA FONDAMENTALE", () => {
    expect(notesDaccord("maj", DO4)).toEqual([60, 64, 67]);
    expect(notesDaccord("m7", DO4)).toEqual([60, 63, 67, 70]);
  });

  it("LA FONDAMENTALE DÉPLACE TOUT L'ACCORD, et rien d'autre", () => {
    expect(notesDaccord("7s9", DO4 + 5)).toEqual(notesDaccord("7s9", DO4).map((n) => n + 5));
  });

  it("LE RENVERSEMENT MONTE LES NOTES DU BAS D'UNE OCTAVE, et change la basse", () => {
    expect(notesDaccord("maj", DO4, 1, 0)).toEqual([60, 64, 67]);
    expect(notesDaccord("maj", DO4, 1, 1)).toEqual([64, 67, 72]);
    expect(notesDaccord("maj", DO4, 1, 2)).toEqual([67, 72, 76]);
    // Les classes de hauteur ne changent pas : c'est le même accord, autrement posé.
    const pc = (v: number[]) => [...new Set(v.map((n) => n % 12))].sort((a, b) => a - b);
    expect(pc(notesDaccord("maj", DO4, 1, 2))).toEqual(pc(notesDaccord("maj", DO4, 1, 0)));
    // Un renversement plus grand que le nombre de notes est ramené au dernier possible.
    expect(notesDaccord("maj", DO4, 1, 9)).toEqual(notesDaccord("maj", DO4, 1, 2));
  });

  it("L'ÉTENDUE REJOUE L'ACCORD UNE OCTAVE PLUS HAUT", () => {
    expect(notesDaccord("maj", DO4, 2)).toEqual([60, 64, 67, 72, 76, 79]);
    for (const q of QUALITES) {
      expect(notesDaccord(q.id, 36, 3).length, q.id).toBe(q.intervalles.length * 3);
    }
  });

  it("LA FONDAMENTALE FINALE FERME L'ARPÈGE, ET PASSE AU-DESSUS DE TOUT L'ACCORD", () => {
    expect(notesDaccord("maj", DO4, 1, 0, true)).toEqual([60, 64, 67, 72]);
    expect(notesDaccord("maj", DO4, 2, 0, true)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    // ET ELLE EST BIEN LA DERNIÈRE, SUR TOUT ACCORD. Une extension monte au-delà de l'octave : la
    // fondamentale montée de douze demi-tons y tomberait au milieu. Relevé sur « La 7♯9 », dont la
    // neuvième augmentée passe la fondamentale d'un demi-ton.
    for (const q of QUALITES) {
      for (const octaves of [1, 2, 3]) {
        const avec = notesDaccord(q.id, DO4, octaves, 0, true);
        const sans = notesDaccord(q.id, DO4, octaves, 0, false);
        expect(avec.length, `${q.id} sur ${octaves} octave(s)`).toBe(sans.length + 1);
        const ajoutee = avec[avec.length - 1];
        expect(ajoutee, `${q.id} : la fondamentale finale n'est pas la dernière`)
          .toBeGreaterThan(Math.max(...sans));
        expect((ajoutee - DO4) % 12, `${q.id} : la note ajoutée n'est pas la fondamentale`).toBe(0);
      }
    }
  });

  it("CE QUI SORT DES 128 NOTES EST ÉCARTÉ, non replié", () => {
    const haut = notesDaccord("m13", 120, 2);
    expect(haut.every((n) => n >= 0 && n <= 127)).toBe(true);
    expect([...haut].sort((a, b) => a - b)).toEqual(haut);
    expect(notesDaccord("maj", -4).every((n) => n >= 0)).toBe(true);
  });
});

describe("le sens et la façon de jouer", () => {
  const TROIS = [60, 64, 67];

  it("LE SENS RÉORDONNE, ET L'ALLER-RETOUR NE REJOUE PAS SON SOMMET", () => {
    expect(dansLeSens(TROIS, "montant")).toEqual([60, 64, 67]);
    expect(dansLeSens(TROIS, "descendant")).toEqual([67, 64, 60]);
    expect(dansLeSens(TROIS, "aller-retour")).toEqual([60, 64, 67, 64, 60]);
    expect(dansLeSens(TROIS, "aller-retour").filter((n) => n === 67).length).toBe(1);
  });

  it("PLAQUÉ : TOUT PART ENSEMBLE ET S'ARRÊTE ENSEMBLE", () => {
    const joue = jouerAccord(TROIS, "plaque", 2);
    expect(joue.every((n) => n.debut === 0 && n.fin === 2)).toBe(true);
    // L'étalement n'agit pas sur un accord plaqué : c'est ce que sa documentation dit.
    expect(jouerAccord(TROIS, "plaque", 2, 0.5)).toEqual(joue);
  });

  it("ARPÉGÉ : CHAQUE NOTE EST RELÂCHÉE QUAND LA SUIVANTE PART", () => {
    const joue = jouerAccord(TROIS, "arpege", 3, 1);
    expect(joue.map((n) => n.debut)).toEqual([0, 1, 2]);
    expect(joue.map((n) => n.fin)).toEqual([1, 2, 3]);
    // Aucun chevauchement : la fin de l'une est le départ de l'autre.
    for (let i = 1; i < joue.length; i++) expect(joue[i].debut).toBe(joue[i - 1].fin);
    // À étalement plein, l'arpège remplit exactement la durée.
    expect(joue[joue.length - 1].fin).toBe(3);
  });

  it("ROULÉ : LES NOTES PARTENT L'UNE APRÈS L'AUTRE ET SONT TENUES", () => {
    const joue = jouerAccord(TROIS, "roule", 2, 0.1);
    expect(joue.map((n) => n.debut)).toEqual([0, 0.1, 0.2]);
    expect(joue.every((n) => n.fin === 2)).toBe(true);
    // L'accord sonne donc entier à partir du dernier départ, ce que l'arpège ne fait jamais.
    const ensemble = joue.filter((n) => n.debut <= 0.2 && n.fin > 0.2).length;
    expect(ensemble).toBe(3);
  });

  it("L'ÉTALEMENT EST UNE PART DE LA DURÉE, donc l'allure ne dépend pas de la longueur", () => {
    const court = jouerAccord(TROIS, "roule", 1, 0.2);
    const long = jouerAccord(TROIS, "roule", 2, 0.2);
    expect(long.map((n) => n.debut)).toEqual(court.map((n) => n.debut * 2));
  });

  it("un accord sans note ne fabrique rien, et une note seule se joue", () => {
    expect(jouerAccord([], "roule", 1)).toEqual([]);
    expect(jouerAccord([60], "roule", 1, 0.5, 77)).toEqual([{ note: 60, velocite: 77, debut: 0, fin: 1 }]);
    expect(jouerAccord([60], "arpege", 1, 1, 77)).toEqual([{ note: 60, velocite: 77, debut: 0, fin: 1 }]);
  });

  it("LA NUANCE EST CELLE DEMANDÉE, la même sur toutes les notes", () => {
    for (const mode of ["plaque", "arpege", "roule"] as const) {
      expect(jouerAccord(TROIS, mode, 2, 0.3, 64).every((n) => n.velocite === 64), mode).toBe(true);
    }
  });
});
