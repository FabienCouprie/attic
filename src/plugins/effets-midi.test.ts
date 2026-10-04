// plugins/effets-midi.test.ts — Les huit fiches MIDI que nul test ne nommait.
//
// POURQUOI CE FICHIER, ET CE QU'IL NE REFAIT PAS. Un relevé des 469 composants du catalogue a
// montré que **203 d'entre eux n'étaient nommés par aucun test**, et que `effets-midi.ts` en portait
// le plus : huit. L'arithmétique, elle, est déjà tenue — `audio/motifs-midi.test.ts` couvre
// `imposerRythme`, `echoNotes`, `eclaircir`, `palindrome` et `repeterEtTourner`, `audio/markov.test.ts`
// couvre la chaîne. Ce qui n'était tenu par rien, c'est la FICHE : le câblage des paramètres, les
// canaux de sortie, et les chemins d'échec.
//
// C'EST EXACTEMENT CE QUE LE CONTRAT DE COMPOSANT DEMANDE, et qui ne se vérifie qu'ici :
//
//   · tout paramètre déclaré est LU et AGIT — un curseur qui ne peut rien changer est un défaut
//     que l'arithmétique sous-jacente ne peut pas révéler, puisqu'elle n'a jamais vu le curseur ;
//   · l'exécuteur rend par ses canaux déclarés, et rien d'autre ;
//   · une entrée absente ou vide donne un message, et non une exception.
//
// LE RENDU AUDIO EST ÉCARTÉ, et c'est délibéré. `rendreMotif` passe par la synthèse, qui demande un
// contexte audio ; les huit fiches le partagent, et le tenir ici reviendrait à tester huit fois la
// même fonction. On exerce donc la sortie MIDI, qui porte le résultat du traitement, et on vérifie
// que la fiche demande bien son rendu audio.
import { describe, expect, it, vi } from "vitest";
import { parseMidi } from "midi-file";
import { fiches } from "./effets-midi";
import { notesVersFichierMidi } from "../audio/midi-ecriture";

// ── Le gréement : une entrée connue, et un contexte qui répond comme l'inspecteur ──

/** Un MIDI de `n` noires montantes à 120, canal 0 — assez pour que Markov ait de quoi apprendre. */
function midiEssai(n = 8, canal = 0): File {
  const duree = 0.5;
  const degres = [0, 2, 4, 5, 7, 4, 2, 0, 5, 7, 9, 7];
  const notes = Array.from({ length: n }, (_, i) => ({
    note: 60 + degres[i % degres.length], velocite: 100,
    debut: i * duree, fin: i * duree + duree * 0.9,
  }));
  return notesVersFichierMidi(notes as never, 120, canal);
}

/** Un MIDI sans la moindre note : le cas que chaque fiche doit nommer plutôt que de lancer. */
function midiVide(): File {
  return notesVersFichierMidi([] as never, 120);
}

/**
 * Un contexte d'exécution comme l'inspecteur en passe un.
 *
 * `reglages` ne porte que ce qu'on veut changer : tout le reste retombe sur le défaut DÉCLARÉ par la
 * fiche, ce qui est le comportement réel — un paramètre jamais touché n'est pas écrit sur le nœud.
 */
function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? reglages[nom] : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

/** Les notes d'un MIDI produit, lues comme un instrument les lirait. Les départs sont en NOIRES. */
async function notesDeAsync(sortie: unknown): Promise<{ note: number; debut: number }[]> {
  expect(sortie, "la sortie MIDI devrait être un fichier").toBeInstanceOf(File);
  const midi = parseMidi(new Uint8Array(await (sortie as File).arrayBuffer()));
  const tpb = (midi.header as { ticksPerBeat?: number }).ticksPerBeat ?? 480;
  const out: { note: number; debut: number }[] = [];
  for (const piste of midi.tracks) {
    let t = 0;
    for (const e of piste as unknown as { deltaTime: number; type: string; velocity?: number; noteNumber?: number }[]) {
      t += e.deltaTime;
      if (e.type === "noteOn" && (e.velocity ?? 0) > 0) out.push({ note: e.noteNumber!, debut: t / tpb });
    }
  }
  return out;
}

/**
 * Exécute une fiche en neutralisant le seul rendu audio.
 *
 * Les cinq fiches de motif rendent par `rendreMotif`, qui synthétise du son : cela demande un
 * contexte audio, et le tenir ici testerait huit fois la même fonction au lieu des huit fiches. On
 * remplace donc la synthèse, et on vérifie séparément qu'elle est bien demandée.
 */
async function executer(id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) {
  const aides = await import("./effets-aides");
  const espion = vi.spyOn(aides, "rendreMotif").mockImplementation(
    async (ctx: { paramNombre: (n: string, d: number) => number }, notes, canal) =>
      [null as unknown as AudioBuffer, notesVersFichierMidi(notes as never, ctx.paramNombre("Tempo", 120), canal)],
  );
  try {
    const res = await fiche(id).executer(contexte(entrees, reglages));
    // LE COMPTE SE RELÈVE AVANT LA RESTAURATION : `mockRestore` efface l'historique de l'espion, et
    // le lire après rendait toujours zéro — ce qui aurait fait croire que le remplacement ne prenait
    // pas, alors qu'il prenait très bien.
    return { res, appelsAuRendu: espion.mock.calls.length };
  } finally {
    espion.mockRestore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les huit fiches MIDI : ce qu'elles font d'une entrée absente ou vide", () => {
  // CE CAS VAUT POUR LES HUIT, et c'est pourquoi il est écrit une fois. Un composant à qui rien
  // n'est branché doit DIRE qu'il lui manque son entrée : une exception laisserait le nœud en
  // erreur sans phrase, et c'est le défaut le plus fréquent d'un exécuteur qu'aucun test n'a vu.
  const sansEntree: [string, number][] = [
    ["motif-imposer-rythme", 2], ["motif-echo-notes", 2], ["motif-eclaircir", 2],
    ["motif-retrograde", 2], ["motif-repeter-tourner", 2], ["markov-midi", 3],
    ["jointure-midi", 1], ["boucle-midi", 1],
  ];

  for (const [id, nbSorties] of sansEntree) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const { res } = await executer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées").toHaveLength(nbSorties);
      expect(res.valeurs.every((v) => v === null), "aucune sortie quand rien n'entre").toBe(true);
      expect(typeof res.message, "le composant doit dire ce qui manque").toBe("string");
      expect((res.message ?? "").length).toBeGreaterThan(0);
    });
  }

  // UN MIDI SANS NOTE N'EST PAS UNE ABSENCE DE MIDI, et les fiches le distinguent : le fichier est
  // là, il est lisible, il ne porte rien. Les deux messages diffèrent, et c'est ce qui permet de
  // savoir si le câble est débranché ou si la source est muette.
  const avecMidiVide = ["motif-echo-notes", "motif-eclaircir", "motif-retrograde", "motif-repeter-tourner", "markov-midi"];
  for (const id of avecMidiVide) {
    it(`${id} : un MIDI sans note est nommé autrement qu'une entrée absente`, async () => {
      const vide = midiVide();
      const { res: sansNote } = await executer(id, [vide, vide]);
      const { res: sansRien } = await executer(id, [null, null]);
      expect(sansNote.valeurs.every((v) => v === null)).toBe(true);
      expect(sansNote.message).not.toBe(sansRien.message);
    });
  }
});

describe("motif-imposer-rythme : la grille d'un MIDI sur les hauteurs d'un autre", () => {
  it("IL EXIGE SES DEUX ENTRÉES, et le dit quand la seconde manque", async () => {
    const { res } = await executer("motif-imposer-rythme", [midiEssai(), null]);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toBeTruthy();
  });

  it("la sortie suit le nombre de frappes de la GRILLE, et non des hauteurs", async () => {
    const { res } = await executer("motif-imposer-rythme", [midiEssai(4), midiEssai(8)]);
    const notes = await notesDeAsync(res.valeurs[1]);
    expect(notes.length, "c'est le rythme qui commande la longueur").toBe(8);
  });
});

describe("motif-echo-notes : ses quatre réglages agissent", () => {
  it("« Répétitions » ajoute bien ce nombre de copies par note", async () => {
    const une = await executer("motif-echo-notes", [midiEssai(4)], { "Répétitions": 0 });
    const trois = await executer("motif-echo-notes", [midiEssai(4)], { "Répétitions": 3 });
    const a = await notesDeAsync(une.res.valeurs[1]);
    const b = await notesDeAsync(trois.res.valeurs[1]);
    expect(a.length, "zéro répétition rend le motif seul").toBe(4);
    expect(b.length, "trois copies par note, atténuation permettant").toBeGreaterThan(a.length);
  });

  it("« Décalage » écarte les copies dans le temps", async () => {
    const serre = await executer("motif-echo-notes", [midiEssai(2)], { "Décalage": 0.05 });
    const large = await executer("motif-echo-notes", [midiEssai(2)], { "Décalage": 1.5 });
    const finA = Math.max(...(await notesDeAsync(serre.res.valeurs[1])).map((n) => n.debut));
    const finB = Math.max(...(await notesDeAsync(large.res.valeurs[1])).map((n) => n.debut));
    expect(finB, "un décalage plus large allonge la traîne").toBeGreaterThan(finA);
  });

  it("« Transposition » fait monter les copies", async () => {
    const sans = await executer("motif-echo-notes", [midiEssai(1)], { "Transposition": 0 });
    const avec = await executer("motif-echo-notes", [midiEssai(1)], { "Transposition": 7 });
    const hautA = Math.max(...(await notesDeAsync(sans.res.valeurs[1])).map((n) => n.note));
    const hautB = Math.max(...(await notesDeAsync(avec.res.valeurs[1])).map((n) => n.note));
    expect(hautB, "+7 envoie l'écho de quinte en quinte").toBeGreaterThan(hautA);
  });

  it("« Atténuation » à zéro coupe la série dès la première copie", async () => {
    const muet = await executer("motif-echo-notes", [midiEssai(4)], { "Atténuation": 0 });
    const fort = await executer("motif-echo-notes", [midiEssai(4)], { "Atténuation": 100 });
    const a = await notesDeAsync(muet.res.valeurs[1]);
    const b = await notesDeAsync(fort.res.valeurs[1]);
    expect(b.length, "à 100 % les copies restent toutes audibles").toBeGreaterThan(a.length);
  });
});

describe("motif-eclaircir : le hasard est reproductible, et les temps se gardent", () => {
  // « GARDER LES TEMPS » EST COUPÉ DANS LES DEUX CAS DE GRAINE, et ce n'est pas un détail : le MIDI
  // d'essai pose une note tous les demi-temps, donc toutes tombent sur la pulsation. Avec le défaut
  // « Oui », rien n'est retiré — et ce cas passait au vert en comparant deux fois le motif intact,
  // graine ignorée ou non. Trouvé en plantant la faute : le relevé restait vert.
  it("LA MÊME GRAINE REND LE MÊME ÉCLAIRCISSEMENT, et c'est la promesse du réglage", async () => {
    const a = await executer("motif-eclaircir", [midiEssai(12)], { "Graine": 42, "Proportion": 50, "Garder les temps": "non" });
    const b = await executer("motif-eclaircir", [midiEssai(12)], { "Graine": 42, "Proportion": 50, "Garder les temps": "non" });
    const na = await notesDeAsync(a.res.valeurs[1]);
    expect(na.length, "il doit rester des notes, sinon on compare deux vides").toBeGreaterThan(0);
    expect(na.length, "et il doit en manquer, sinon on compare deux motifs intacts").toBeLessThan(12);
    expect(na).toEqual(await notesDeAsync(b.res.valeurs[1]));
  });

  // « GARDER LES TEMPS » EST COUPÉ ICI, ET C'EST LE RÉGLAGE QUI M'A PRIS. Le MIDI d'essai pose une
  // note tous les demi-temps, donc TOUTES tombent sur la pulsation : avec le défaut « Oui », aucune
  // n'est retirée, et deux graines différentes rendaient évidemment la même chose. Le cas ne
  // mesurait pas le hasard, il mesurait la pulsation.
  it("deux graines différentes ne rendent pas le même", async () => {
    const a = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 1, "Proportion": 50, "Garder les temps": "non" });
    const b = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 2, "Proportion": 50, "Garder les temps": "non" });
    const na = await notesDeAsync(a.res.valeurs[1]);
    const nb = await notesDeAsync(b.res.valeurs[1]);
    expect(na).not.toEqual(nb);
  });

  it("« Proportion » commande la part retirée", async () => {
    const peu = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 7, "Proportion": 10, "Garder les temps": "non" });
    const beaucoup = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 7, "Proportion": 90, "Garder les temps": "non" });
    const a = (await notesDeAsync(peu.res.valeurs[1])).length;
    const b = (await notesDeAsync(beaucoup.res.valeurs[1])).length;
    expect(b, "à 90 % il doit rester moins de notes qu'à 10 %").toBeLessThan(a);
  });

  it("« Garder les temps » épargne ce qui tombe sur la pulsation", async () => {
    // À quatre-vingt-dix pour cent et sans épargne, il ne reste parfois RIEN : la fiche rend alors
    // deux valeurs nulles et le dit. On prend donc une proportion qui laisse de quoi comparer.
    const garde = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 3, "Proportion": 60, "Garder les temps": "oui", "Durée d'un temps": 0.5 });
    const sans = await executer("motif-eclaircir", [midiEssai(16)], { "Graine": 3, "Proportion": 60, "Garder les temps": "non", "Durée d'un temps": 0.5 });
    const a = (await notesDeAsync(garde.res.valeurs[1])).length;
    const b = (await notesDeAsync(sans.res.valeurs[1])).length;
    expect(a, "épargner les temps laisse davantage de notes").toBeGreaterThan(b);
  });

  it("tout retirer est un cas nommé, et non une sortie vide", async () => {
    const { res } = await executer("motif-eclaircir", [midiEssai(4)], { "Graine": 11, "Proportion": 100, "Garder les temps": "non" });
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message, "le composant doit dire qu'il n'a rien laissé").toBeTruthy();
  });
});

describe("motif-retrograde : le sens et la charnière", () => {
  it("« Rétrograde » renverse sans allonger ; « Aller-retour » double", async () => {
    const seul = await executer("motif-retrograde", [midiEssai(4)], { "Sens": "retrograde" });
    const double = await executer("motif-retrograde", [midiEssai(4)], { "Sens": "aller-retour" });
    const a = await notesDeAsync(seul.res.valeurs[1]);
    const b = await notesDeAsync(double.res.valeurs[1]);
    expect(a.length).toBe(4);
    expect(b.length, "le palindrome met le motif puis son rétrograde").toBeGreaterThan(a.length);
  });

  it("le rétrograde commence par la dernière hauteur du motif", async () => {
    const source = await notesDeAsync(midiEssai(4));
    const { res } = await executer("motif-retrograde", [midiEssai(4)], { "Sens": "retrograde" });
    const sortie = await notesDeAsync(res.valeurs[1]);
    expect(sortie[0].note).toBe(source[source.length - 1].note);
  });

  it("« Rejouer la charnière » ajoute l'événement du retournement", async () => {
    const sans = await executer("motif-retrograde", [midiEssai(4)], { "Sens": "aller-retour", "Rejouer la charnière": "non" });
    const avec = await executer("motif-retrograde", [midiEssai(4)], { "Sens": "aller-retour", "Rejouer la charnière": "oui" });
    const a = (await notesDeAsync(sans.res.valeurs[1])).length;
    const b = (await notesDeAsync(avec.res.valeurs[1])).length;
    expect(b, "la charnière rejouée fait une note de plus").toBeGreaterThan(a);
  });
});

describe("motif-repeter-tourner : la grille se remplit, la mélodie glisse", () => {
  it("« Répétitions » densifie sans déplacer la fin", async () => {
    const une = await executer("motif-repeter-tourner", [midiEssai(4)], { "Répétitions": 1 });
    const trois = await executer("motif-repeter-tourner", [midiEssai(4)], { "Répétitions": 3 });
    const a = await notesDeAsync(une.res.valeurs[1]);
    const b = await notesDeAsync(trois.res.valeurs[1]);
    expect(a.length).toBe(4);
    expect(b.length, "chaque événement est joué trois fois dans sa durée").toBe(12);
    expect(Math.max(...b.map((n) => n.debut)), "la grille ne s'allonge pas")
      .toBeLessThanOrEqual(Math.max(...a.map((n) => n.debut)) + 0.6);
  });

  it("« Rotation » change les hauteurs sans changer les départs", async () => {
    const sans = await executer("motif-repeter-tourner", [midiEssai(6)], { "Répétitions": 1, "Rotation": 0 });
    const avec = await executer("motif-repeter-tourner", [midiEssai(6)], { "Répétitions": 1, "Rotation": 2 });
    const a = await notesDeAsync(sans.res.valeurs[1]);
    const b = await notesDeAsync(avec.res.valeurs[1]);
    expect(b.map((n) => n.debut), "le rythme reste").toEqual(a.map((n) => n.debut));
    expect(b.map((n) => n.note), "la mélodie glisse").not.toEqual(a.map((n) => n.note));
  });
});

describe("markov-midi : trois sorties, et la table en clair", () => {
  it("IL REND SES TROIS SORTIES, dont le rapport en texte", async () => {
    const { res } = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 16 });
    expect(res.valeurs).toHaveLength(3);
    expect(typeof res.valeurs[2], "la troisième sortie est la table, en texte").toBe("string");
    expect((res.valeurs[2] as string).length).toBeGreaterThan(0);
  });

  it("« Notes » commande le nombre de notes engendrées", async () => {
    const court = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 8 });
    const long = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 40 });
    expect((await notesDeAsync(court.res.valeurs[1])).length).toBe(8);
    expect((await notesDeAsync(long.res.valeurs[1])).length).toBe(40);
  });

  // « TEMPO » SE MESURE EN SECONDES, ET NON EN NOIRES — c'est ce que mon premier cas lisait mal.
  // Les notes engendrées sont posées à `(60/tempo)/2` seconde l'une de l'autre et le fichier porte
  // ce même tempo : en temps MUSICAL, elles tombent sur les mêmes croches quel que soit le réglage,
  // et deux tempos donnaient le même nombre de noires. Ce qui change est la durée réelle.
  it("« Tempo » resserre les notes dans le temps réel", async () => {
    const lent = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 8, "Tempo": 60 });
    const vite = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 8, "Tempo": 240 });
    const secondes = async (sortie: unknown, tempo: number) =>
      Math.max(...(await notesDeAsync(sortie)).map((n) => n.debut)) * (60 / tempo);
    expect(await secondes(vite.res.valeurs[1], 240), "quatre fois plus vite, quatre fois plus court")
      .toBeLessThan(await secondes(lent.res.valeurs[1], 60));
  });

  it("et le tempo demandé est bien celui qu'écrit le fichier", async () => {
    const { res } = await executer("markov-midi", [midiEssai(24)], { "Graine": 5, "Notes": 8, "Tempo": 90 });
    const midi = parseMidi(new Uint8Array(await (res.valeurs[1] as File).arrayBuffer()));
    let qpm = 0;
    for (const piste of midi.tracks) {
      for (const e of piste as unknown as { type: string; microsecondsPerBeat?: number }[]) {
        if (e.type === "setTempo") { qpm = 60_000_000 / e.microsecondsPerBeat!; break; }
      }
    }
    expect(qpm).toBeCloseTo(90, 2);
  });

  it("LA MÊME GRAINE REND LA MÊME SUITE", async () => {
    const a = await executer("markov-midi", [midiEssai(24)], { "Graine": 99, "Notes": 20 });
    const b = await executer("markov-midi", [midiEssai(24)], { "Graine": 99, "Notes": 20 });
    expect((await notesDeAsync(a.res.valeurs[1])).map((n) => n.note))
      .toEqual((await notesDeAsync(b.res.valeurs[1])).map((n) => n.note));
  });

  it("une source trop courte pour l'ordre demandé est nommée, et non lancée", async () => {
    // Deux notes et un ordre de 4 : la table ne peut pas se construire.
    const { res } = await executer("markov-midi", [midiEssai(2)], { "Ordre": 4, "Notes": 16 });
    expect(res.valeurs).toEqual([null, null, null]);
    expect(res.message).toBeTruthy();
  });
});

describe("jointure-midi et boucle-midi : le montage", () => {
  it("jointure-midi met les deux fichiers bout à bout", async () => {
    const { res } = await executer("jointure-midi", [midiEssai(4), midiEssai(4)], { "Chevauchement": 0 });
    const notes = await notesDeAsync(res.valeurs[0]);
    expect(notes.length, "les notes des deux fichiers").toBe(8);
  });

  it("« Chevauchement » rapproche le second fichier du premier", async () => {
    const sec = await executer("jointure-midi", [midiEssai(4), midiEssai(4)], { "Chevauchement": 0 });
    const chevauche = await executer("jointure-midi", [midiEssai(4), midiEssai(4)], { "Chevauchement": 1 });
    const finA = Math.max(...(await notesDeAsync(sec.res.valeurs[0])).map((n) => n.debut));
    const finB = Math.max(...(await notesDeAsync(chevauche.res.valeurs[0])).map((n) => n.debut));
    expect(finB, "un chevauchement d'une seconde raccourcit l'ensemble").toBeLessThan(finA);
  });

  it("boucle-midi répète le fichier le nombre de fois demandé", async () => {
    const deux = await executer("boucle-midi", [midiEssai(4)], { "Répétitions": 2 });
    const cinq = await executer("boucle-midi", [midiEssai(4)], { "Répétitions": 5 });
    expect((await notesDeAsync(deux.res.valeurs[0])).length).toBe(8);
    expect((await notesDeAsync(cinq.res.valeurs[0])).length).toBe(20);
  });

  it("« Fondu » fait se recouvrir les répétitions", async () => {
    const sec = await executer("boucle-midi", [midiEssai(4)], { "Répétitions": 3, "Fondu": 0 });
    const fondu = await executer("boucle-midi", [midiEssai(4)], { "Répétitions": 3, "Fondu": 500 });
    const finA = Math.max(...(await notesDeAsync(sec.res.valeurs[0])).map((n) => n.debut));
    const finB = Math.max(...(await notesDeAsync(fondu.res.valeurs[0])).map((n) => n.debut));
    expect(finB, "un demi-seconde de recouvrement par tour raccourcit le tout").toBeLessThan(finA);
  });
});

describe("les huit fiches déclarent ce qu'elles rendent", () => {
  const attendu: [string, number][] = [
    ["motif-imposer-rythme", 2], ["motif-echo-notes", 2], ["motif-eclaircir", 2],
    ["motif-retrograde", 2], ["motif-repeter-tourner", 2], ["markov-midi", 3],
    ["jointure-midi", 1], ["boucle-midi", 1],
  ];

  // CE CAS TIENT LE CONTRAT LE PLUS SIMPLE ET LE PLUS FACILE À ROMPRE : autant de valeurs rendues
  // que de sorties déclarées. Une fiche qui gagne une sortie sans que son exécuteur suive laisse un
  // port branché sur `undefined`, ce qui se voit à l'écran et nulle part ailleurs.
  for (const [id, nb] of attendu) {
    it(`${id} déclare ${nb} sortie(s), et son exécuteur en rend autant`, async () => {
      expect(fiche(id).sorties).toHaveLength(nb);
      const { res } = await executer(id, [null, null]);
      expect(res.valeurs).toHaveLength(nb);
    });
  }

  // CE CAS VÉRIFIE AUSSI QUE LE REMPLACEMENT PREND, et c'est ce qui rend tous les autres lisibles :
  // si l'espion n'était pas posé, la vraie synthèse tournerait et ces quarante-huit cas mesureraient
  // autre chose que ce qu'ils annoncent.
  it("les cinq fiches de motif DEMANDENT leur rendu audio, et c'est bien lui qu'on remplace", async () => {
    for (const id of ["motif-imposer-rythme", "motif-echo-notes", "motif-eclaircir", "motif-retrograde", "motif-repeter-tourner"]) {
      const entrees = [midiEssai(4), midiEssai(4)];
      const { appelsAuRendu } = await executer(id, entrees, { "Garder les temps": "non", "Proportion": 10 });
      expect(appelsAuRendu, `${id} devrait passer par rendreMotif`).toBe(1);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU, par l'exécuteur ou par l'aide à qui il passe son contexte", async () => {
    // Un paramètre que personne ne lit est un curseur qui ne peut rien changer. On le cherche sur la
    // source plutôt qu'à l'exécution : un réglage peut n'agir que dans un mode, et les exercer tous
    // demanderait de connaître les modes ; être LU est la condition nécessaire, et elle se vérifie.
    //
    // ET L'AIDE PARTAGÉE COMPTE, ce que mon premier relevé oubliait : « Tempo », « Synthèse »,
    // « Instrument » et « Volume » ne sont lus par aucune des cinq fiches de motif — elles passent
    // `ctx` à `rendreMotif`, qui les lit pour elles. Chercher dans le seul exécuteur accusait donc
    // cinq fiches de ne pas lire quatre réglages qu'elles emploient bel et bien.
    const aides = await import("./effets-aides");
    const sourceAide = aides.rendreMotif.toString();
    for (const [id] of attendu) {
      const f = fiche(id);
      const source = f.executer.toString();
      const portee = source.includes("rendreMotif") ? `${source}\n${sourceAide}` : source;
      for (const p of f.parametres ?? []) {
        expect(portee, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });
});
