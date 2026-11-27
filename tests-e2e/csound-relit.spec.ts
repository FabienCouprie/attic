// tests-e2e/csound-relit.spec.ts — Csound relit ce que les nœuds écrivent.
//
// LA RÉFÉRENCE EST CSOUND LUI-MÊME. Les gardes unitaires du onzième format vérifient le TEXTE écrit ;
// rien ne vérifiait ce que Csound en LIT. La sonde qui l'avait fait pendant la revue des notations
// en texte a été supprimée ; ce spec la rend permanente. Décision de Fabien du 2026-11-22, « Add the
// spec ».
//
// TOUT PASSE PAR `executer`, dans la page, sur les modules que l'application charge : les nœuds
// écrivent, et Csound, compilé en WebAssembly, rend ou imprime. Deux épreuves :
//   - chaque formule de « Formules Csound » sonne par le nœud « Csound », sans erreur et sans toucher
//     le limiteur, ce que la table des formules promet ;
//   - chaque partition qu'un nœud écrit est relue par un orchestre qui imprime ses p-fields par
//     `prints` : Csound doit lire, champ par champ, ce que le texte écrit.
//
// Il ne tourne pas en CI, qui ne lance que les empreintes : il se lance à la demande, sur son port.
import { test, expect } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5253);

/** Les modules du dépôt, chargés dans la page par leur adresse, comme l'application les charge. */
const MODULES = {
  lancer: "/src/audio/lancer-fiche.ts",
  registre: "/src/audio/adaptateur.ts",
  csound: "/src/audio/csound.ts",
  midi: "/src/audio/midi-ecriture.ts",
  formules: "/src/audio/csound-formules.ts",
};

test.describe("Csound relit ce que les nœuds écrivent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 60_000 });
  });

  test("chaque formule sonne par le nœud Csound, sans erreur et sans toucher le limiteur", async ({ page }) => {
    test.setTimeout(300_000);
    const rendus = await page.evaluate(async (m) => {
      const { lancerFiche } = await import(/* @vite-ignore */ m.lancer);
      const { registre } = await import(/* @vite-ignore */ m.registre);
      const { FORMULES } = await import(/* @vite-ignore */ m.formules);
      const F = (id: string) => registre.trouverDef(id);
      const sortie: { id: string; refus: string | null; duree: number; crete: number }[] = [];
      for (const f of FORMULES as { id: string; canaux: number }[]) {
        const ecrit = await lancerFiche(F("formules-csound"), { Formule: f.id }, { entrees: [] });
        const joue = await lancerFiche(F("csound"), { Canaux: f.canaux === 2 ? "stereo" : "mono" },
          { entrees: [null, null, ecrit.valeurs[0], ecrit.valeurs[1]] });
        const audio = joue.valeurs[0] as AudioBuffer | null;
        let crete = 0;
        for (let c = 0; audio && c < audio.numberOfChannels; c++) {
          for (const x of audio.getChannelData(c)) crete = Math.max(crete, Math.abs(x));
        }
        const refus = joue.erreurRendue || joue.levee ? String(joue.levee ?? joue.message).slice(0, 300) : null;
        sortie.push({ id: f.id, refus, duree: audio?.duration ?? 0, crete });
      }
      return sortie;
    }, MODULES);
    expect(rendus.length).toBeGreaterThan(0);
    for (const r of rendus) {
      expect(r.refus, r.id).toBeNull();
      expect(r.duree, r.id).toBeGreaterThan(1);
      expect(r.crete, r.id).toBeGreaterThan(0.01);
      // Le limiteur du nœud coupe à 0,95 : une crête qui l'atteint est une saturation.
      expect(r.crete, r.id).toBeLessThan(0.95);
    }
  });

  test("les p-fields que chaque partition écrit sont ceux que Csound lit", async ({ page }) => {
    test.setTimeout(300_000);
    const relus = await page.evaluate(async (m) => {
      const { lancerFiche } = await import(/* @vite-ignore */ m.lancer);
      const { registre } = await import(/* @vite-ignore */ m.registre);
      const { construireCsd, rendreCsd } = await import(/* @vite-ignore */ m.csound);
      const { notesVersFichierMidi } = await import(/* @vite-ignore */ m.midi);
      const F = (id: string) => registre.trouverDef(id);
      const midi = notesVersFichierMidi([
        { note: 60, velocite: 100, debut: 0, fin: 0.5 },
        { note: 64, velocite: 80, debut: 0.5, fin: 1.25 },
        { note: 67, velocite: 60, debut: 1.25, fin: 2 },
      ], 120);
      // UNE COURBE AUSSI, depuis le 2026-11-27 : ce qu'elle écrit dans un p-field doit être ce que Csound
      // y lit, puisque c'est par là seulement qu'elle pilote quoi que ce soit.
      const rampe = { valeurs: Float32Array.from({ length: 400 }, (_, i) => i / 399), cadence: 200 };
      const partitions: Record<string, unknown> = {
        "partition-csound": (await lancerFiche(F("partition-csound"), {}, { entrees: [midi, null] })).valeurs[0],
        "partition-csound, courbe en p7": (await lancerFiche(F("partition-csound"), { p7: "courbe" }, { entrees: [midi, rampe] })).valeurs[0],
        "matrice-parametres": (await lancerFiche(F("matrice-parametres"), {}, { entrees: [null] })).valeurs[0],
        "matrice-parametres, courbe en p6": (await lancerFiche(F("matrice-parametres"), { "Événements": 5, "Champ piloté": "6", Minimum: 100, Maximum: 900 }, { entrees: [rampe] })).valeurs[0],
        "partition-aleatoire-csound": (await lancerFiche(F("partition-aleatoire-csound"), {}, { entrees: [] })).valeurs[0],
        "orchestre-csound": (await lancerFiche(F("orchestre-csound"), {}, { entrees: [] })).valeurs[1],
      };
      const sortie: Record<string, { ecrits: number[][]; lus: number[][]; erreur: string | null }> = {};
      // UN PREMIER RENDU À BLANC. Sur le premier rendu d'une page neuve, les messages de Csound sont
      // arrivés une fois en double, mesuré le 2026-11-22 : une passe sur trois lisait six notes pour
      // trois écrites, chaque ligne deux fois, les mêmes valeurs. Ce n'est pas l'affaire des
      // écrivains que ce spec éprouve ; le rendu à blanc le met hors de la mesure.
      await rendreCsd(construireCsd({ orchestre: "instr 1\n  out oscili:a(0.01, 440)\nendin", partition: "i1 0 0.1\ne" }));
      for (const [id, texte] of Object.entries(partitions)) {
        // Les instructions « i » telles qu'écrites, commentaires ôtés.
        const ecrits = String(texte ?? "").split("\n").map((l) => l.replace(/;.*$/, "").trim())
          .filter((l) => /^i\s*\d/.test(l)).map((l) => l.replace(/^i\s*/, "").split(/\s+/).map(Number));
        const nb = Math.max(3, ...ecrits.map((e) => e.length));
        const champs = Array.from({ length: nb }, (_, k) => `p${k + 1}`);
        // Un orchestre qui imprime ce qu'il lit, un instrument par numéro employé. Le son faible
        // qu'il rend n'est là que parce qu'un rendu muet est refusé.
        const orchestre = [...new Set(ecrits.map((e) => e[0]))]
          .map((n) => `instr ${n}\n  prints "P${" %f".repeat(nb)}\\n", ${champs.join(", ")}\n  out oscili:a(0.01, 440)\nendin`).join("\n");
        const rendu = await rendreCsd(construireCsd({ orchestre, partition: `${String(texte)}\ne` }));
        const lus = (rendu.messages as string[]).flatMap((x) => x.split("\n")).map((x) => x.trim())
          .filter((x) => x.startsWith("P ")).map((x) => x.slice(2).trim().split(/\s+/).map(Number));
        sortie[id] = { ecrits, lus, erreur: rendu.erreur };
      }
      return sortie;
    }, MODULES);
    const ordre = (a: number[], b: number[]) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2];
    for (const [id, { ecrits, lus, erreur }] of Object.entries(relus)) {
      expect(erreur, id).toBeNull();
      expect(ecrits.length, `${id} : aucune note écrite`).toBeGreaterThan(0);
      expect(lus.length, `${id} : Csound a lu ${lus.length} notes sur ${ecrits.length}`).toBe(ecrits.length);
      const e = [...ecrits].sort(ordre), l = [...lus].sort(ordre);
      e.forEach((ligne, i) => ligne.forEach((v, k) => {
        expect(l[i][k], `${id}, note ${i + 1}, p${k + 1} : écrit ${v}, lu ${l[i][k]}`).toBeCloseTo(v, 4);
      }));
      // Le dernier champ porte la courbe : une colonne constante dirait qu'elle n'a rien écrit.
      if (id.includes("courbe")) expect(new Set(ecrits.map((x) => x[x.length - 1])).size, `${id} : la courbe n'a rien fait varier`).toBeGreaterThan(1);
    }
  });

  // L'ENTRÉE AUDIO DU NŒUD « CSOUND » SERT, et cette épreuve le tient. Fabien a demandé le 2026-11-27
  // si elle servait à quelque chose ; le son y arrive comme un fichier, « entree1.wav », que l'orchestre
  // lit par `diskin2` ou la partition par une table GEN01. Un sinus de 440 Hz doit en ressortir tel
  // quel, à sa hauteur bien que Csound tourne à sa propre fréquence, et un MIDI doit pouvoir le jouer
  // transposé. Un programme qui le lit sans son branché est refusé, le fichier nommé.
  test("le son branché sur l'entrée Audio du nœud Csound arrive dans l'orchestre", async ({ page }) => {
    test.setTimeout(300_000);
    const r = await page.evaluate(async (m) => {
      const { lancerFiche } = await import(/* @vite-ignore */ m.lancer);
      const { registre } = await import(/* @vite-ignore */ m.registre);
      const { notesVersFichierMidi } = await import(/* @vite-ignore */ m.midi);
      const sr = 44100;
      const son = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr });
      son.copyToChannel(Float32Array.from({ length: sr }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sr)), 0);
      /**
       * Hauteur par passages à zéro, et corrélation au sinus d'entrée, de `de` à `a` secondes. Le sinus
       * de référence est recalculé à la fréquence de la sortie, qui n'est pas forcément celle du son.
       */
      const mesure = (b: AudioBuffer | null, de: number, a: number) => {
        if (!b) return null;
        const d = b.getChannelData(0), fe = b.sampleRate;
        const i0 = Math.round(de * fe), i1 = Math.round(a * fe);
        let p = 0, xy = 0, xx = 0, yy = 0;
        for (let i = i0 + 1; i < i1; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) p++;
        for (let i = i0; i < i1; i++) {
          const s = Math.sin(2 * Math.PI * 440 * i / fe);
          xy += d[i] * s; xx += d[i] * d[i]; yy += s * s;
        }
        return { hertz: p / 2 / (a - de), correlation: xy / Math.sqrt(xx * yy || 1) };
      };
      const NL = String.fromCharCode(10);
      const instr = (...l: string[]) => ["instr 1", ...l, "endin"].join(NL);
      const csound = (reglages: Record<string, string>, entrees: unknown[]) => lancerFiche(registre.trouverDef("csound"), reglages, { entrees });
      const diskin = await csound({ Orchestre: instr("  a1 diskin2 \"entree1.wav\", 1", "  out a1"), Partition: "i1 0 1" }, [son, null, null, null]);
      const table = await csound({ Orchestre: instr("  a1 loscil 0.5, 1, 1, 1, 0", "  out a1"), Partition: `f1 0 0 1 "entree1.wav" 0 0 0${NL}i1 0 1` }, [son, null, null, null]);
      const midi = notesVersFichierMidi([{ note: 69, velocite: 127, debut: 0, fin: 0.8 }, { note: 81, velocite: 127, debut: 1, fin: 1.8 }], 120);
      const echantillonneur = await csound({ Orchestre: instr("  a1 diskin2 \"entree1.wav\", p4 / 440", "  out a1 * p5") }, [son, midi, null, null]);
      const sansSon = await csound({ Orchestre: instr("  a1 diskin2 \"entree1.wav\", 1", "  out a1"), Partition: "i1 0 1" }, [null, null, null, null]);
      return {
        diskin: { message: diskin.message, m: mesure(diskin.valeurs[0] as AudioBuffer, 0.1, 0.9) },
        table: { message: table.message, m: mesure(table.valeurs[0] as AudioBuffer, 0.1, 0.9) },
        echantillonneur: {
          message: echantillonneur.message,
          note1: mesure(echantillonneur.valeurs[0] as AudioBuffer, 0.1, 0.7),
          // Transposé d'une octave, le son d'une seconde se lit en une demi-seconde : de 1 à 1,5 s.
          note2: mesure(echantillonneur.valeurs[0] as AudioBuffer, 1.05, 1.45),
        },
        sansSon: { message: sansSon.message, erreur: sansSon.erreurRendue },
      };
    }, MODULES);
    for (const cas of ["diskin", "table"] as const) {
      expect(r[cas].m, `${cas} : ${r[cas].message}`).not.toBeNull();
      // Un passage à zéro de plus ou de moins vaut 0,6 Hz sur 0,8 s : deux hertz de marge.
      expect(Math.abs(r[cas].m!.hertz - 440), cas).toBeLessThan(2);
      expect(r[cas].m!.correlation, cas).toBeGreaterThan(0.999);
      expect(r[cas].message, cas).not.toContain("jamais lu");
    }
    expect(Math.abs((r.echantillonneur.note1?.hertz ?? 0) - 440), r.echantillonneur.message).toBeLessThan(2);
    expect(Math.abs((r.echantillonneur.note2?.hertz ?? 0) - 880), r.echantillonneur.message).toBeLessThan(3);
    expect(r.sansSon.erreur).toBe(true);
    expect(r.sansSon.message).toContain("entree1.wav");
  });
});
