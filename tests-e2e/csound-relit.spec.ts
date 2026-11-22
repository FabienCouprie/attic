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

const devUrl = serveurDeVerification(5231);

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
      const partitions: Record<string, unknown> = {
        "partition-csound": (await lancerFiche(F("partition-csound"), {}, { entrees: [midi, null] })).valeurs[0],
        "matrice-parametres": (await lancerFiche(F("matrice-parametres"), {}, { entrees: [null] })).valeurs[0],
        "partition-aleatoire-csound": (await lancerFiche(F("partition-aleatoire-csound"), {}, { entrees: [] })).valeurs[0],
        "orchestre-csound": (await lancerFiche(F("orchestre-csound"), {}, { entrees: [] })).valeurs[1],
      };
      const sortie: Record<string, { ecrits: number[][]; lus: number[][]; erreur: string | null }> = {};
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
    }
  });
});
