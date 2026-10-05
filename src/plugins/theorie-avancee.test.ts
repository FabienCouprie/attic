// plugins/theorie-avancee.test.ts — Les cinq outils de théorie, que nul test ne faisait tourner.
//
// POURQUOI CE FICHIER. Les cinq calculs sont couverts — `audio/tonnetz.test.ts`,
// `audio/contrepoint.test.ts`, `audio/canon-pavage.test.ts`, `audio/norgard.test.ts`,
// `audio/auto-similarite.test.ts`. Les cinq FICHES ne l'étaient pas : seul
// `docs/classement-theorie.test.ts` nomme `tonnetz` et `contrepoint-especes`, et il ne vérifie que
// leur RANGEMENT dans le catalogue, jamais leur exécution.
//
// ET L'EN-TÊTE DU FICHIER DIT CE QUI LE REND VÉRIFIABLE, mieux que je ne saurais le faire :
// « chacun porte un critère de vérité EXTÉRIEUR au code, qu'il s'agisse d'un traité, d'un théorème
// ou d'une suite publiée ». C'est rare, et c'est ce que cette batterie exploite. On ne compare donc
// pas le nœud à lui-même ni à un chiffre relevé une fois : on le compare à ce que disent Riemann,
// Fux, Vuza et Nørgård.
//
//   LE TONNETZ. Les trois transformations néo-riemanniennes ne déplacent QU'UNE voix, et chacune
//   est une INVOLUTION. Le cycle « PLPLPL » revient à son point de départ. Do majeur et sol dièse
//   mineur n'ont AUCUNE note commune et sont pourtant à trois opérations l'un de l'autre : c'est le
//   pôle hexatonique, et aucune distance tonale ne le donne.
//
//   LE CONTREPOINT. Le réglage par défaut porte sa propre prédiction, écrite dans sa documentation :
//   « La valeur par défaut est un exercice juste : le composant ne doit rien y trouver. » Une phrase
//   qu'un test peut mettre en défaut, et qui vaut mieux que n'importe quelle valeur de référence.
//
//   LE CANON PAR PAVAGE. Sa définition même est vérifiable dans la grille que le nœud écrit : chaque
//   pulsation doit être frappée par une voix et UNE SEULE. On compte donc les colonnes de sa propre
//   sortie, et chacune doit porter exactement un.
//
//   LA SÉRIE DE L'INFINI. Une suite publiée, et deux propriétés d'auto-similarité que la notice
//   énonce : un terme sur quatre redonne la suite à l'identique, un terme sur deux donne son
//   inversion. Les deux se vérifient dans la suite que le nœud imprime.
//
// DEUX DÉFAUTS PLANTÉS NE SONT PAS TOMBÉS, ET AUCUN DES DEUX N'ÉTAIT UN DÉFAUT. Le dire importe,
// parce qu'un plantage qui passe ressemble toujours à un garde aveugle.
//
//   DÉCALER TOUTES LES ENTRÉES D'UN CANON NE CASSE RIEN : une rotation d'un pavage est un pavage.
//   {0,3,6,9} devenu {1,4,7,10} couvre encore chaque pulsation une fois et une seule, et le garde a
//   donc raison de le laisser passer. Décaler UNE SEULE entrée, en doubler une, en retirer une ou
//   élargir le motif d'une frappe : les quatre tombent.
//
//   ET `verifier` EST SYMÉTRIQUE EN SES DEUX VOIX, mesuré sur cinq couples dont un croisement
//   complet : les mêmes infractions sortent dans les deux sens. Les règles de Fux implémentées ici
//   portent sur les INTERVALLES, qui ne connaissent pas le haut du bas ; l'interdit du croisement,
//   lui, n'y est pas. Les deux entrées s'appellent « Voix grave » et « Voix aiguë », et elles sont
//   pourtant interchangeables : c'est relevé, non corrigé, et aucun cas ne le grave.
//
// LE RENDU AUDIO COÛTE CHER — trois de ces fiches passent par `rendreSequence`, et une mesure
// imprudente a mis deux minutes. Les durées employées ici sont donc les plus courtes que les
// réglages permettent, et les cas qui ne regardent que le texte ne demandent qu'un seul rendu.
import "node-web-audio-api/polyfill.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { fiches } from "./theorie-avancee";

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));

/** Les réglages qui rendent le son le plus court possible : le rendu est ce qui coûte. */
const BREF = { "Durée d'un accord": 0.1, "Durée d'un pas": 0.05, "Répétitions": 1, "Durée d'une note": 0.05 };

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/**
 * Les trois hauteurs de chaque accord du chemin que le Tonnetz imprime.
 *
 * Chaque ligne a la forme «  P Cm   60 63 67   [0,3,7] » : le nom de l'opération, celui de la
 * triade, les trois voix placées, et les classes de hauteur. Ce sont les voix placées qui disent
 * la parcimonie, puisque c'est leur déplacement qu'on mesure.
 */
function voixDuChemin(texte: string): number[][] {
  return texte.split("\n")
    .map((l) => /\s(\d+ \d+ \d+)\s+\[/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1].split(" ").map(Number));
}

/** Les noms de triades du chemin, dans l'ordre. */
function triadesDuChemin(texte: string): string[] {
  return texte.split("\n")
    .map((l) => /^\s*[PLR]?\s+([A-G][#b]?m?)\s+\d/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]);
}

/** Les classes de hauteur de chaque triade, lues entre crochets. */
function classesDuChemin(texte: string): number[][] {
  return [...texte.matchAll(/\[([-\d,]+)\]/g)].map((m) => m[1].split(",").map(Number));
}

const CINQ = ["tonnetz", "contrepoint-especes", "canon-pavage", "serie-infinie", "auto-similarite"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("tonnetz : trois transformations qui ne déplacent qu'une voix", () => {
  it("CHAQUE OPÉRATION NE DÉPLACE QU'UNE SEULE VOIX, et c'est la définition même", async () => {
    // P et L d'un demi-ton, R de deux : c'est la parcimonie néo-riemannienne, et c'est ce que la
    // documentation du nœud appelle « ce qui fait entendre la parcimonie ». Mesuré sur le chemin
    // par défaut, PLRLPR : do majeur 60 64 67 devient do mineur 60 63 67, une seule voix bougeant.
    const res = await lancer("tonnetz", [null], { ...BREF, "Opérations": "PLRLPR" });
    const accords = voixDuChemin(res.valeurs[2] as string);
    expect(accords.length, "sept accords pour six opérations").toBe(7);
    for (let i = 1; i < accords.length; i++) {
      const bouges = accords[i].filter((_, v) => accords[i][v] !== accords[i - 1][v]);
      expect(bouges, `l'étape ${i} déplace ${bouges.length} voix`).toHaveLength(1);
      const saut = Math.abs(accords[i].find((x, v) => x !== accords[i - 1][v])!
        - accords[i - 1][accords[i].findIndex((x, v) => x !== accords[i - 1][v])]);
      expect(saut, `l'étape ${i} saute de ${saut} demi-tons`).toBeLessThanOrEqual(2);
    }
  });

  it("P, L ET R SONT DES INVOLUTIONS : appliquées deux fois, elles rendent l'accord de départ", async () => {
    // C'est la structure de groupe de l'espace de Riemann, et le test le plus simple qu'on puisse
    // lui demander. Il ne tient à aucune valeur de référence.
    for (const operation of ["PP", "LL", "RR"]) {
      const res = await lancer("tonnetz", [null], { ...BREF, "Opérations": operation });
      const triades = triadesDuChemin(res.valeurs[2] as string);
      expect(triades, `${operation} : trois accords`).toHaveLength(3);
      expect(triades[2], `${operation} ne revient pas au départ`).toBe(triades[0]);
    }
  });

  it("« PLPLPL » PARCOURT LE CYCLE HEXATONIQUE ET REVIENT AU DÉPART", async () => {
    // Sa documentation l'annonce : « PLPLPL parcourt le cycle hexatonique et revient au départ. »
    // Six accords distincts puis le retour, ce qui est la définition du cycle.
    const res = await lancer("tonnetz", [null], { ...BREF, "Opérations": "PLPLPL" });
    const triades = triadesDuChemin(res.valeurs[2] as string);
    expect(triades).toHaveLength(7);
    expect(triades[6], "le cycle ne se referme pas").toBe(triades[0]);
    expect(new Set(triades.slice(0, 6)).size, "les six du cycle doivent être distincts").toBe(6);
  });

  it("DO MAJEUR ET SOL DIÈSE MINEUR : trois opérations, aucune note commune", async () => {
    // LE PÔLE HEXATONIQUE, et c'est l'exemple que la documentation du nœud donne elle-même : deux
    // accords qui ne partagent RIEN et que trois mouvements d'une voix séparent. Aucune distance
    // tonale ne donne cela, et c'est pourquoi le mode « chemin » existe.
    const res = await lancer("tonnetz", [null],
      { ...BREF, "Mode": "chemin", "Accord de départ": "C", "Accord d'arrivée": "G#m" });
    expect(chiffres(res.message!), "quatre accords pour trois opérations").toContain(4);
    const texte = res.valeurs[2] as string;
    expect(chiffres(texte.split("\n")[0]), "l'en-tête annonce trois opérations").toContain(3);
    const classes = classesDuChemin(texte);
    const depart = new Set(classes[0]);
    const arrivee = classes[classes.length - 1];
    expect(arrivee.filter((n) => depart.has(n)), "les deux pôles ne partagent aucune note").toEqual([]);
  });

  it("le mode « chemin » trouve bien LE PLUS COURT", async () => {
    // Do majeur et la mineur sont voisins : une seule opération, R. Un chemin plus long serait un
    // chemin, mais pas le plus court, et c'est le plus court que le mode promet.
    const res = await lancer("tonnetz", [null],
      { ...BREF, "Mode": "chemin", "Accord de départ": "C", "Accord d'arrivée": "Am" });
    expect(chiffres((res.valeurs[2] as string).split("\n")[0]), "une seule opération").toContain(1);
    expect(res.message, `${res.message}`).toContain("R");
  });

  it("UN MIDI BRANCHÉ L'EMPORTE SUR L'ACCORD ÉCRIT, et sa première triade sert de départ", async () => {
    // La documentation le dit : « Un MIDI branché en entrée l'emporte. » Un la mineur joué doit
    // donc partir de la mineur, quoi qu'il y ait dans le champ de texte.
    const midi = notesVersFichierMidi([
      { note: 57, velocite: 90, debut: 0, fin: 0.5 },
      { note: 60, velocite: 90, debut: 0, fin: 0.5 },
      { note: 64, velocite: 90, debut: 0, fin: 0.5 },
    ], 120);
    const res = await lancer("tonnetz", [midi], { ...BREF, "Accord de départ": "C", "Opérations": "P" });
    expect(triadesDuChemin(res.valeurs[2] as string)[0], "le MIDI n'a pas été entendu").toBe("Am");
  });

  it("un accord illisible retombe sur do majeur plutôt que d'échouer", async () => {
    const res = await lancer("tonnetz", [null], { ...BREF, "Accord de départ": "Zz", "Opérations": "P" });
    expect(triadesDuChemin(res.valeurs[2] as string)[0]).toBe("C");
  });

  it("sans opération lisible, il le dit au lieu de rendre un silence", async () => {
    for (const ops of ["", "XYZ"]) {
      const res = await lancer("tonnetz", [null], { ...BREF, "Opérations": ops });
      if (res.valeurs[0] === null) {
        expect((res.message ?? "").length, `« ${ops} » : pas de message`).toBeGreaterThan(0);
      }
    }
  });

  it("« Note de base » place les accords, et les trois sorties sont servies", async () => {
    const grave = await lancer("tonnetz", [null], { ...BREF, "Note de base": 48, "Opérations": "P" });
    const aigu = await lancer("tonnetz", [null], { ...BREF, "Note de base": 72, "Opérations": "P" });
    expect(voixDuChemin(grave.valeurs[2] as string)[0][0],
      "les accords ne suivent pas la note de base").toBeLessThan(voixDuChemin(aigu.valeurs[2] as string)[0][0]);
    expect(grave.valeurs[0], "la sortie audio").toBeInstanceOf(AudioBuffer);
    expect(grave.valeurs[1], "la sortie MIDI").toBeInstanceOf(File);
    expect(typeof grave.valeurs[2], "la sortie texte").toBe("string");
  });
});

describe("contrepoint d'espèces : les règles de Fux", () => {
  it("L'EXERCICE PAR DÉFAUT EST JUSTE, et c'est sa documentation qui le promet", async () => {
    // « La valeur par défaut est un exercice juste : le composant ne doit rien y trouver. » Une
    // prédiction écrite, qu'un test peut mettre en défaut — et qui vaut mieux qu'un chiffre relevé.
    const res = await lancer("contrepoint-especes", [null]);
    expect(chiffres(res.message!), "ni erreur ni avis").toEqual([0, 0]);
    expect(res.valeurs[0], `${res.valeurs[0]}`).toMatch(/Aucune infraction|No infringement/);
  });

  it("LES QUINTES PARALLÈLES SONT TROUVÉES, ET NOMMÉES", async () => {
    // L'interdit le plus connu du traité, et celui qu'on vérifie en premier sur tout vérificateur.
    const res = await lancer("contrepoint-especes", [null],
      { "Voix grave": "C4 D4 E4", "Voix aiguë": "G4 A4 B4" });
    expect(chiffres(res.message!)[0], "aucune erreur trouvée").toBeGreaterThan(0);
    const rapport = res.valeurs[0] as string;
    expect(rapport, "la quinte parallèle n'est pas nommée").toMatch(/[Qq]uintes parallèles|[Pp]arallel fifths/);
    expect(rapport, "l'infraction doit dire OÙ elle est").toMatch(/\d/);
  });

  it("LES OCTAVES PARALLÈLES AUSSI, et ce n'est pas le même reproche", async () => {
    const res = await lancer("contrepoint-especes", [null],
      { "Voix grave": "C4 D4 E4", "Voix aiguë": "C5 D5 E5" });
    const rapport = res.valeurs[0] as string;
    expect(rapport).toMatch(/[Oo]ctaves parallèles|[Pp]arallel octaves/);
    expect(rapport, "une octave n'est pas une quinte").not.toMatch(/[Qq]uintes parallèles/);
  });

  it("« UNISSONS INTÉRIEURS » : les permettre en retire une infraction", async () => {
    // Fux les interdit ailleurs qu'au début et à la fin, « parce que les deux voix s'y confondent
    // et que l'on n'entend plus qu'une ligne ». Le réglage doit donc pouvoir lever CET interdit, et
    // lui seul : le reste du bilan ne bouge pas.
    const voix = { "Voix grave": "C4 E4 F4 C4", "Voix aiguë": "C5 E4 A4 C5" };
    const interdits = chiffres((await lancer("contrepoint-especes", [null], { ...voix, "Unissons intérieurs": "interdits" })).message!);
    const permis = chiffres((await lancer("contrepoint-especes", [null], { ...voix, "Unissons intérieurs": "permis" })).message!);
    expect(permis[0], "permettre l'unisson n'a rien retiré").toBeLessThan(interdits[0]);
    expect(permis[1], "et n'a pas touché aux avis").toBe(interdits[1]);
  });

  it("UN MIDI BRANCHÉ L'EMPORTE, et ses deux voix se séparent par la hauteur", async () => {
    // Les champs de texte portent ici un exercice JUSTE, et le MIDI des quintes parallèles : si le
    // nœud rend un bilan vierge, c'est qu'il a lu le texte, et la documentation ment.
    const midi = notesVersFichierMidi([
      { note: 60, velocite: 90, debut: 0, fin: 0.5 }, { note: 67, velocite: 90, debut: 0, fin: 0.5 },
      { note: 62, velocite: 90, debut: 0.5, fin: 1 }, { note: 69, velocite: 90, debut: 0.5, fin: 1 },
      { note: 64, velocite: 90, debut: 1, fin: 1.5 }, { note: 71, velocite: 90, debut: 1, fin: 1.5 },
    ], 120);
    const res = await lancer("contrepoint-especes", [midi],
      { "Voix grave": "C4 D4 E4 F4", "Voix aiguë": "G4 F4 G4 A4" });
    expect(chiffres(res.message!)[0], "le MIDI n'a pas été entendu").toBeGreaterThan(0);
    expect(res.valeurs[0]).toMatch(/[Qq]uintes parallèles|[Pp]arallel fifths/);
  });

  it("deux voix vides donnent un message, pas une exception", async () => {
    const res = await lancer("contrepoint-especes", [null], { "Voix grave": "", "Voix aiguë": "" });
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });
});

describe("canon par pavage : le théorème se lit dans la grille du nœud", () => {
  /** Combien de voix frappent chaque pulsation, comptées dans la grille écrite par le nœud. */
  function colonnes(grille: string, n: number): number[] {
    const lignes = grille.split("\n").filter((l) => /^[x·]+$/.test(l));
    const compte = new Array(n).fill(0);
    for (const ligne of lignes) {
      for (let i = 0; i < Math.min(n, ligne.length); i++) if (ligne[i] === "x") compte[i]++;
    }
    return compte;
  }

  // CHAQUE PULSATION EST FRAPPÉE PAR UNE VOIX ET UNE SEULE : c'est la définition d'un canon par
  // pavage, et le nœud écrit lui-même la grille où elle se vérifie. On ne compare donc pas à une
  // valeur de référence, on compte dans sa propre sortie.
  const pavages: [number, string][] = [[12, "0 1 2"], [12, "0 4 8"], [12, "0 1 2 3"], [8, "0 1"]];
  for (const [n, motif] of pavages) {
    it(`« ${motif} » pave un cycle de ${n} : chaque pulsation frappée une fois et une seule`, async () => {
      const res = await lancer("canon-pavage", [], { ...BREF, "Pulsations": n, "Motif": motif });
      const compte = colonnes(res.valeurs[2] as string, n);
      expect(compte, `la grille n'a pas ${n} colonnes`).toHaveLength(n);
      expect(compte.every((c) => c === 1), `colonnes : ${compte.join("")}`).toBe(true);
    });
  }

  it("LE PRODUIT DES VOIX PAR LES FRAPPES VAUT LES PULSATIONS, et le message le dit", async () => {
    // « Leur produit vaut donc toujours ce nombre », dit la documentation du réglage. C'est une
    // conséquence du pavage, et elle se lit dans les trois chiffres du message.
    for (const [n, motif] of pavages) {
      const res = await lancer("canon-pavage", [], { ...BREF, "Pulsations": n, "Motif": motif });
      const [voix, frappes, pulsations] = chiffres(res.message!);
      expect(voix * frappes, `${motif} sur ${n} : ${voix} × ${frappes}`).toBe(pulsations);
      expect(pulsations).toBe(n);
    }
  });

  it("UN MOTIF QUI NE PAVE PAS EST REFUSÉ, avec sa raison", async () => {
    const res = await lancer("canon-pavage", [], { ...BREF, "Pulsations": 12, "Motif": "0 1 3" });
    expect(res.valeurs).toEqual([null, null, null]);
    expect(res.message, `${res.message}`).toContain("0 1 3");
  });

  it("MOTIF LAISSÉ VIDE, le composant en cherche un — et celui qu'il trouve pave", async () => {
    const res = await lancer("canon-pavage", [], { ...BREF, "Pulsations": 12, "Motif": "", "Taille cherchée": 3 });
    expect(res.valeurs[0], "aucun motif trouvé").toBeInstanceOf(AudioBuffer);
    const compte = colonnes(res.valeurs[2] as string, 12);
    expect(compte.every((c) => c === 1), `colonnes : ${compte.join("")}`).toBe(true);
  });

  it("« Durée d'un pas » et « Répétitions » décident de la durée entendue", async () => {
    const court = (await lancer("canon-pavage", [], { ...BREF, "Durée d'un pas": 0.05, "Répétitions": 1 })).valeurs[0] as AudioBuffer;
    const long = (await lancer("canon-pavage", [], { ...BREF, "Durée d'un pas": 0.05, "Répétitions": 3 })).valeurs[0] as AudioBuffer;
    expect(long.duration, "trois tours ne durent pas plus qu'un").toBeGreaterThan(court.duration * 2);
  });
});

describe("série de l'infini : une suite publiée, et deux auto-similarités", () => {
  const suiteDe = async (reglages: Record<string, number | string> = {}) => {
    const res = await lancer("serie-infinie", [], { ...BREF, "Notes": 64, ...reglages });
    return { res, termes: (res.valeurs[2] as string).split("\n")[0].trim().split(/\s+/).map(Number) };
  };

  it("LES SEIZE PREMIERS TERMES SONT CEUX DE NØRGÅRD", async () => {
    // La suite est publiée, et c'est le critère de vérité extérieur dont l'en-tête du fichier
    // parle. On ne la recalcule pas ici : on l'écrit telle qu'elle est, et on compare.
    const { termes } = await suiteDe();
    expect(termes.slice(0, 16)).toEqual([0, 1, -1, 2, 1, 0, -2, 3, -1, 2, 0, 1, 2, -1, -3, 4]);
  });

  it("UN TERME SUR QUATRE REDONNE LA SUITE À L'IDENTIQUE", async () => {
    // La notice l'énonce, et c'est ce qui fait tenir le contrepoint de la Deuxième Symphonie : la
    // voix quatre fois plus lente est LA MÊME MÉLODIE. La propriété se vérifie dans la suite que le
    // nœud imprime, sans rien calculer d'autre.
    const { termes } = await suiteDe();
    const unSurQuatre = termes.filter((_, i) => i % 4 === 0);
    expect(unSurQuatre.slice(0, 12), "la suite prise au pas quatre n'est plus elle-même")
      .toEqual(termes.slice(0, 12));
  });

  it("ET UN TERME SUR DEUX DONNE SON INVERSION", async () => {
    // L'OPPOSÉ DE ZÉRO EST MOINS ZÉRO, et `toEqual` les distingue : `0 === -0` est vrai, mais
    // `Object.is(0, -0)` est faux, et c'est sur lui que vitest compare. Le premier terme de la
    // suite valant zéro, la comparaison tombait sur le signe d'un zéro.
    const oppose = (x: number) => (x === 0 ? 0 : -x);
    const { termes } = await suiteDe();
    const unSurDeux = termes.filter((_, i) => i % 2 === 0);
    expect(unSurDeux.slice(0, 16), "la suite prise au pas deux n'est pas son inverse")
      .toEqual(termes.slice(0, 16).map(oppose));
  });

  it("le message et le texte disent la même étendue", async () => {
    const { res, termes } = await suiteDe();
    const lus = chiffres(res.message!);
    expect(lus, "le message porte le minimum").toContain(Math.min(...termes));
    expect(lus, "et le maximum").toContain(Math.max(...termes));
  });

  it("« VOIX » SUPERPOSE SANS CHANGER LA SUITE, et allonge le son", async () => {
    const une = await suiteDe({ "Voix": 1, "Notes": 32 });
    const trois = await suiteDe({ "Voix": 3, "Notes": 32 });
    expect(trois.termes, "la suite imprimée ne dépend pas du nombre de voix").toEqual(une.termes);
    expect(chiffres(trois.res.message!)[0], "trois voix font plus de notes qu'une")
      .toBeGreaterThan(chiffres(une.res.message!)[0]);
  });

  it("« GAMME » N'AGIT QU'EN LECTURE PAR DEGRÉS, et sa documentation le dit", async () => {
    // « La gamme employée en lecture par degrés. » Un réglage légitimement inerte dans l'autre
    // mode, ce que le contrat du dépôt demande d'écrire à côté de lui — et de vérifier.
    const son = async (lecture: string, gamme: string) =>
      (await lancer("serie-infinie", [], { ...BREF, "Notes": 16, "Lecture": lecture, "Gamme": gamme })).valeurs[0] as AudioBuffer;
    const ecart = (a: AudioBuffer, b: AudioBuffer) => {
      let m = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        m = Math.max(m, Math.abs(a.getChannelData(0)[i] - b.getChannelData(0)[i]));
      }
      return m;
    };
    expect(ecart(await son("demi-tons", "majeure"), await son("demi-tons", "pentatonique")),
      "la gamme agit en demi-tons, où elle n'a rien à faire").toBe(0);
    expect(ecart(await son("degres", "majeure"), await son("degres", "pentatonique")),
      "la gamme n'agit pas en lecture par degrés").toBeGreaterThan(0.01);
  });

  it("« Tonique » et « Octave » déplacent le son, « Durée d'une note » sa longueur", async () => {
    const son = async (r: Record<string, number | string>) =>
      (await lancer("serie-infinie", [], { ...BREF, "Notes": 16, ...r })).valeurs[0] as AudioBuffer;
    const base = await son({});
    const ecart = (a: AudioBuffer, b: AudioBuffer) => {
      let m = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        m = Math.max(m, Math.abs(a.getChannelData(0)[i] - b.getChannelData(0)[i]));
      }
      return m;
    };
    expect(ecart(base, await son({ "Tonique": "7" })), "« Tonique » est inerte").toBeGreaterThan(0.01);
    expect(ecart(base, await son({ "Octave": 2 })), "« Octave » est inerte").toBeGreaterThan(0.01);
    expect((await son({ "Durée d'une note": 0.2 })).duration,
      "« Durée d'une note » est inerte").toBeGreaterThan(base.duration * 2);
  });
});

describe("matrice d'auto-similarité : la méthode de Foote", () => {
  /** Trois sections franches : une tenue grave, du bruit, une tenue aiguë. */
  function troisSections(secondes = 6, sr = 22050): AudioBuffer {
    const n = Math.round(secondes * sr);
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const d = b.getChannelData(0);
    let graine = 12345;
    for (let i = 0; i < n; i++) {
      const tiers = Math.floor((i / n) * 3);
      graine = (graine * 1103515245 + 12345) % 2147483648;
      d[i] = tiers === 0 ? 0.5 * Math.sin(2 * Math.PI * 220 * i / sr)
        : tiers === 1 ? 0.5 * (graine / 2147483648 * 2 - 1)
          : 0.5 * Math.sin(2 * Math.PI * 880 * i / sr);
    }
    return b;
  }

  it("LE SON RESSORT INCHANGÉ : ce nœud regarde, il ne touche pas", async () => {
    const source = troisSections();
    const res = await lancer("auto-similarite", [source]);
    expect(res.valeurs[0] === source, "le son a été recopié ou modifié").toBe(true);
  });

  it("la matrice est rendue en SVG, et le texte décrit les sections", async () => {
    const res = await lancer("auto-similarite", [troisSections()]);
    const svg = res.valeurs[1] as string;
    expect(typeof svg).toBe("string");
    expect(svg.startsWith("<svg"), "la matrice n'est pas un SVG").toBe(true);
    expect(svg.length, "un SVG vide").toBeGreaterThan(1000);
    expect(res.valeurs[2], "le texte doit nommer ses sections").toMatch(/Section 1/);
  });

  it("LES SECTIONS PAVENT LA DURÉE : ni trou, ni recouvrement", async () => {
    // Un découpage en sections est une partition : la fin de l'une est le début de la suivante, la
    // première part de zéro, et la dernière va jusqu'au bout. Une frontière mal reportée se verrait
    // là, et nulle part ailleurs.
    const res = await lancer("auto-similarite", [troisSections()]);
    const texte = res.valeurs[2] as string;
    const bornes = [...texte.matchAll(/Section \d+ : ([\d.]+) s → ([\d.]+) s/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    expect(bornes.length, "aucune section décrite").toBeGreaterThan(0);
    expect(bornes[0][0], "la première section ne part pas de zéro").toBe(0);
    for (let i = 1; i < bornes.length; i++) {
      expect(bornes[i][0], `trou ou recouvrement avant la section ${i + 1}`).toBe(bornes[i - 1][1]);
    }
    const [sections, trames] = chiffres(res.message!);
    expect(sections, "le message ne compte pas les mêmes sections que le texte").toBe(bornes.length);
    expect(trames, "le message doit aussi compter les trames").toBeGreaterThan(0);
  });

  it("« TRAME » CHANGE L'ÉCHELLE À LAQUELLE ON REGARDE LA FORME", async () => {
    // « Courte, on voit le détail des accords ; longue, on voit les grandes sections. » Une trame
    // deux fois plus courte doit donc donner deux fois plus de trames.
    const source = troisSections();
    const large = chiffres((await lancer("auto-similarite", [source], { "Trame": 0.5 })).message!)[1];
    const fine = chiffres((await lancer("auto-similarite", [source], { "Trame": 0.2 })).message!)[1];
    expect(fine, "une trame plus courte doit en donner davantage").toBeGreaterThan(large);
  });

  it("un extrait trop court pour la trame est refusé avec sa raison", async () => {
    const court = new AudioBuffer({ numberOfChannels: 1, length: 2000, sampleRate: 22050 });
    const res = await lancer("auto-similarite", [court]);
    expect(res.valeurs).toEqual([null, null, null]);
    expect(res.message, `${res.message}`).toMatch(/court|short/);
  });

  it("rien en entrée donne un message, pas une exception", async () => {
    const res = await lancer("auto-similarite", [null]);
    expect(res.valeurs).toEqual([null, null, null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });
});

describe("ce que les cinq fiches déclarent", () => {
  it("TOUT PARAMÈTRE DÉCLARÉ EST LU — par l'exécuteur OU par une aide du module", () => {
    // LE GARDE HABITUEL SERAIT AVEUGLE ICI, comme il l'était sur la chaîne des spectrogrammes :
    // les quatre réglages de rendu — « Tempo », « Synthèse », « Instrument », « Volume » — ne sont
    // lus par aucun des exécuteurs mais par l'aide `rendre`, que quatre fiches partagent. Le garde
    // cherche donc une FORME dans la source entière : un appel à `paramNombre` ou `paramTexte`
    // portant ce nom, où qu'il soit écrit.
    const source = readFileSync("src/plugins/theorie-avancee.ts", "utf-8");
    for (const id of CINQ) {
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} : le réglage « ${p.nom} » n'est lu nulle part`)
          .toMatch(new RegExp(String.raw`param(?:Nombre|Texte)\("${p.nom}"`));
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of CINQ) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });

  it("un choix qui porte des identifiants en porte autant que d'options", () => {
    for (const id of CINQ) {
      for (const p of fiche(id).parametres ?? []) {
        if (!p.optionIds) continue;
        expect(p.optionIds, `${id} · ${p.nom}`).toHaveLength(p.options!.length);
        expect(p.options, `${id} · ${p.nom} : le défaut doit figurer parmi les options`)
          .toContain(String(p.defaut));
      }
    }
  });

  it("chacune rend autant de valeurs que de sorties déclarées", async () => {
    const entrees: Record<string, unknown[]> = {
      "tonnetz": [null], "contrepoint-especes": [null], "canon-pavage": [],
      "serie-infinie": [], "auto-similarite": [troisSectionsCourtes()],
    };
    for (const id of CINQ) {
      const res = await lancer(id, entrees[id], { ...BREF, "Notes": 16, "Opérations": "P" });
      expect(res.valeurs, id).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("chacune porte un nom et un résumé anglais", () => {
    for (const id of CINQ) {
      const f = fiche(id);
      expect(f.nomEn, `${id} : pas de nom anglais`).toBeTruthy();
      expect(f.resumeEn, `${id} : pas de résumé anglais`).toBeTruthy();
      expect(f.resumeEn, `${id} : le résumé anglais est le français`).not.toBe(f.resume);
    }
  });
});

/** Un extrait assez long pour que l'auto-similarité ait de quoi regarder, et pas plus. */
function troisSectionsCourtes(sr = 22050): AudioBuffer {
  const n = Math.round(6 * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    d[i] = 0.5 * Math.sin(2 * Math.PI * (i < n / 2 ? 220 : 880) * i / sr);
  }
  return b;
}
