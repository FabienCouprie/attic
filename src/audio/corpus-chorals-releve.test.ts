// audio/corpus-chorals-releve.test.ts — Les chorals du DCML comparés à ceux de Craig Sapp, note à note.
//
// POURQUOI CE RELEVÉ, ET POURQUOI IL N'EST PAS UN GARDE. Le corpus du DCML (CC0) dit lui-même que sa
// conversion « has resulted in many incorrect accidentals », et propose de le corriger en le
// comparant à un autre. Celui de Sapp (Humdrum, CC BY-NC-SA 4.0) est propre, mais ne se redistribue
// pas sous la licence d'Attic : il sert ici de témoin, jamais de source. Décision de Fabien du
// 2026-11-22 : « DCML corrigé par Sapp ».
//
// GARDÉ PAR `CORPUS_CHORALS`, le dossier qui contient les deux corpus déballés, `dcml/` et `sapp/` :
//   CORPUS_CHORALS=work/corpus npx vitest run src/audio/corpus-chorals-releve.test.ts
// Sans elle, rien ne s'exécute. Le rapport et la liste des corrections s'écrivent dans ce même
// dossier, hors du dépôt : rien de Sapp n'y entre.
//
// LA COMPARAISON. Les deux corpus sont lus sans reprise dépliée, liaisons jointes. Voix par voix, une
// note du DCML et une note de Sapp qui s'attaquent au même instant, en noires, se comparent par leur
// hauteur ; une attaque qui n'a pas sa jumelle est comptée à part.
//
// L'APPARIEMENT SE FAIT PAR LE CONTENU, ET NON PAR LE NUMÉRO. Relevé au premier passage, le
// 2026-11-22 : apparié par numéro (`001 …` contre `chor001.krn`), un tiers des chorals montrait des
// écarts de quarte et de quinte, et les titres de 153 paires sur 361 ne concordaient pas ; les deux
// corpus ne numérotent pas tous les chorals de la même façon (le 6 et le 7 y sont permutés). Sur
// une paire juste, au contraire, l'écart est le même d'une note à l'autre, +1 demi-ton sur le
// choral 2, −1 sur le 22 : une altération mal convertie. Chaque table du DCML va donc au choral de
// Sapp dont le plus de notes s'attaquent au même instant dans la même voix, à un demi-ton près.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { lireTableDcml } from "./dcml-tsv";
import { hauteursHumdrum, lireDepuisVerovio, type ToolkitPartition } from "./partition-lecture";
import type { Note } from "./note";
import { lireAccord, type Mode } from "./choral-regles";
import { tranchesDuChoral } from "./choral-tranches";
import { tonaliteDesNotes } from "./corpus-tonalite";
import { estRefusChoral, REGLES_CHORAL, verifierChoral, type RegleChoral } from "./choral-verifier";

const RACINE = process.env.CORPUS_CHORALS;

/** Le premier sous-dossier qui contient `nom`, les archives se déballant dans un dossier daté. */
const trouver = (dossier: string, nom: string): string | undefined => {
  if (existsSync(join(dossier, nom))) return join(dossier, nom);
  for (const d of readdirSync(dossier, { withFileTypes: true })) if (d.isDirectory() && existsSync(join(dossier, d.name, nom))) return join(dossier, d.name, nom);
  return undefined;
};

/** Les entités HTML que les titres de Sapp emploient, décodées avant toute comparaison. */
const ENTITES: Record<string, string> = { auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", amp: "&" };
const decoder = (t: string) => t.replace(/&(\w+);/g, (m, e) => ENTITES[e] ?? m);
const simplifier = (t: string) => decoder(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

interface Ecart { choral: string; sapp: number; voix: number; noire: number; dcml: number; hauteurSapp: number }

/** La tonalité qu'un Humdrum déclare (`*G:` sol majeur, `*g:` sol mineur), ou `null`. */
function tonaliteKern(texte: string): { tonique: number; mode: Mode } | null {
  const m = /^\*([A-Ga-g])([#-]?):/m.exec(texte);
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase() as "c"]!;
  const alteration = m[2] === "#" ? 1 : m[2] === "-" ? -1 : 0;
  return { tonique: (base + alteration + 12) % 12, mode: m[1] === m[1].toUpperCase() ? "majeur" : "mineur" };
}

/** Les notes d'une voix, indexées par attaque arrondie au millionième de noire. */
const parAttaque = (notes: Note[], v: number) => new Map(notes.filter((n) => n.voix === v).map((n) => [Math.round(n.debut * 1e6), n]));

/** Combien de notes du DCML trouvent leur jumelle chez Sapp, même voix, même attaque, à un demi-ton près. */
function accord(dcml: Note[], index: Map<number, Note>[]): number {
  let n = 0;
  for (const x of dcml) {
    const j = index[x.voix ?? 0]?.get(Math.round(x.debut * 1e6));
    if (j && Math.abs(j.note - x.note) <= 1) n++;
  }
  return n;
}

describe.skipIf(!RACINE)("les chorals du DCML comparés à ceux de Sapp", () => {
  it("relève, choral par choral et voix par voix, les hauteurs qui diffèrent", async () => {
    const notesDcml = trouver(join(RACINE!, "dcml"), "notes")!;
    const kernSapp = trouver(join(RACINE!, "sapp"), "kern")!;
    const creer = ((await import("verovio/wasm-hum")) as { default: () => Promise<unknown> }).default;
    const { VerovioToolkit } = (await import("verovio/esm")) as unknown as { VerovioToolkit: new (m: unknown) => ToolkitPartition & { setOptions(o: object): void; loadData(t: string): unknown; destroy(): void } };

    // Tout Sapp d'abord, une fois : chaque table du DCML se mesure ensuite à chacun de ses chorals.
    const sapps: { numero: number; titre: string; notes: Note[]; index: Map<number, Note>[]; tonalite: { tonique: number; mode: Mode } | null }[] = [];
    for (const f of readdirSync(kernSapp).filter((x) => /^chor\d+\.krn$/.test(x)).sort()) {
      const texteKern = readFileSync(join(kernSapp, f), "utf8");
      const tk = new VerovioToolkit(await creer());
      tk.setOptions({ inputFrom: "humdrum", expandNever: true });
      tk.loadData(texteKern);
      // Les hauteurs viennent du texte du Humdrum : l'import de Verovio perd les altérations d'armure.
      const notes = lireDepuisVerovio(tk, 60, hauteursHumdrum(texteKern)).sequence.notes;
      tk.destroy();
      sapps.push({
        numero: Number(/\d+/.exec(f)![0]),
        titre: decoder(/^!!!OTL@@DE:\s*(.+)$/m.exec(texteKern)?.[1] ?? /^!!!OTL[^:]*:\s*(.+)$/m.exec(texteKern)?.[1] ?? ""),
        notes, index: [0, 1, 2, 3].map((v) => parAttaque(notes, v)),
        tonalite: tonaliteKern(texteKern),
      });
    }

    const tables = readdirSync(notesDcml).filter((f) => f.endsWith(".notes.tsv")).sort();
    const lignes: string[] = [];
    const ecarts: Ecart[] = [];
    let titresDiscordants = 0;
    let autreNumero = 0;
    let incertaines = 0;
    let comparees = 0;
    let identiques = 0;
    let orphelines = 0;
    for (const table of tables) {
      const numero = Number(/^(\d+)/.exec(table)?.[1]);
      // L'IDENTIFIANT ENTIER, ET NON LE SEUL NOMBRE : le DCML a un « 283bis » à côté du 283, et les
      // écarts des deux tables s'écrivaient sous le même numéro, impossibles à rendre à la leur.
      // Relevé le 2026-11-22 par le fabricant du corpus livré (`corpus-dcml-livre.test.ts`).
      const ident = /^(\d+\w*)/.exec(table)?.[1] ?? String(numero);
      const titreDcml = table.replace(/^\d+\w*\s+/, "").replace(/\.notes\.tsv$/, "");
      const dcml = lireTableDcml(readFileSync(join(notesDcml, table), "utf8"), 60).sequence.notes;
      const classes = sapps.map((s) => ({ s, score: accord(dcml, s.index) })).sort((a, b) => b.score - a.score);
      const { s: sapp, score } = classes[0];
      const part = dcml.length ? score / dcml.length : 0;
      if (part < 0.8) incertaines++;
      if (sapp.numero !== numero) autreNumero++;
      const memeTitre = simplifier(sapp.titre).slice(0, 10) === simplifier(titreDcml).slice(0, 10);
      if (!memeTitre) titresDiscordants++;

      let differentes = 0;
      let seules = 0;
      for (const n of dcml) {
        const jumelle = sapp.index[n.voix ?? 0]?.get(Math.round(n.debut * 1e6));
        if (!jumelle) { seules++; continue; }
        comparees++;
        if (jumelle.note === n.note) identiques++;
        else { differentes++; ecarts.push({ choral: ident, sapp: sapp.numero, voix: n.voix ?? 0, noire: n.debut, dcml: n.note, hauteurSapp: jumelle.note }); }
      }
      orphelines += seules;
      lignes.push(`| ${ident} | ${sapp.numero}${sapp.numero === numero ? "" : " ←"} | ${titreDcml}${memeTitre ? "" : ` ≠ ${sapp.titre}`} | ${(part * 100).toFixed(1)} % | ${dcml.length} | ${sapp.notes.length} | ${differentes} | ${seules} |`);
    }

    // LES TESSITURES DE BACH, voix par voix, sur les hauteurs de Sapp, qui sont justes : l'étendue
    // entière, et celle qui laisse de côté le centième le plus grave et le centième le plus aigu.
    const NOMS = ["soprano", "alto", "ténor", "basse"];
    const tessitures = [0, 1, 2, 3].map((v) => {
      const h = sapps.flatMap((s) => s.notes.filter((n) => n.voix === v).map((n) => n.note)).sort((a, b) => a - b);
      const q = (p: number) => h[Math.min(h.length - 1, Math.floor(p * h.length))];
      return `- ${NOMS[v]} : ${h.length} notes, de ${h[0]} à ${h[h.length - 1]} ; du 1er au 99e centile, de ${q(0.01)} à ${q(0.99)}`;
    });

    // LE VÉRIFICATEUR SUR BACH : chaque choral de Sapp dans sa tonalité, lue dans son Humdrum. C'est le
    // cas dont on attend la réponse : Bach enfreint peu les règles de l'usage, et ce qu'il enfreint dit
    // ce que le vérificateur compte à tort, ou ce que l'usage scolaire ne tient pas de lui.
    const bilan = new Map<RegleChoral, { erreur: number; avis: number; jugees: number }>(REGLES_CHORAL.map((r) => [r.id, { erreur: 0, avis: 0, jugees: 0 }]));
    const parChoral: { numero: number; erreurs: number }[] = [];
    const detailsVerif: string[] = [];
    const finales: string[] = [];
    let verifies = 0;
    for (const s of sapps) {
      if (!s.tonalite) continue;
      const v = verifierChoral({ notes: s.notes, tempo: 60 }, { ...s.tonalite, tempo: 60, tempsParMesure: 4 });
      if (estRefusChoral(v)) continue;
      verifies++;
      for (const r of REGLES_CHORAL) bilan.get(r.id)!.jugees += v.jugees[r.id];
      for (const i of v.infractions) bilan.get(i.regle)![i.gravite]++;
      parChoral.push({ numero: s.numero, erreurs: v.infractions.filter((i) => i.gravite === "erreur").length });
      for (const i of v.infractions.filter((x) => x.gravite === "erreur" && (x.regle === "cadence" || x.regle === "septieme-non-resolue"))) {
        detailsVerif.push(`${s.numero}\t${s.tonalite.tonique}${s.tonalite.mode === "mineur" ? "m" : ""}\t${i.mesure}.${i.temps}\t${i.regle}\t${i.fr}`);
      }
      const fin = s.notes.filter((n) => n.debut === Math.max(...s.notes.map((x) => x.debut)));
      finales.push(`${s.numero}\t${s.tonalite.tonique}${s.tonalite.mode === "mineur" ? "m" : ""}\t${fin.map((n) => `${n.voix}:${n.note}`).join(" ")}`);
    }
    writeFileSync(join(RACINE!, "verificateur-details.tsv"), [...detailsVerif, "", "# dernières attaques", ...finales].join("\n") + "\n", "utf8");
    const sansErreur = parChoral.filter((c) => c.erreurs === 0).length;

    // LA FRÉQUENCE DES DEGRÉS CHEZ BACH, sur les temps qui portent au moins trois voix et que
    // `lireAccord` reconnaît, majeur et mineur à part : la préférence de l'harmoniseur en vient.
    const degres = { majeur: new Array(7).fill(0), mineur: new Array(7).fill(0) };
    for (const s of sapps) {
      if (!s.tonalite) continue;
      const { tranches } = tranchesDuChoral({ notes: s.notes, tempo: 60 }, 60, 4);
      for (const t of tranches) {
        const sonnantes = t.hauteurs.filter((x): x is number => x !== null);
        if (!t.surLeTemps || sonnantes.length < 3) continue;
        const a = lireAccord(sonnantes, s.tonalite.tonique, s.tonalite.mode);
        if (a) degres[s.tonalite.mode][a.degre]++;
      }
    }
    // LA TONALITÉ LUE CONTRE LA TONALITÉ ÉCRITE CHEZ SAPP (`*G:`), sous plusieurs marges de la basse
    // finale : la lecture que le corpus et sa fabrication emploient, jugée là où la réponse est écrite.
    const ecrites = sapps.filter((s) => s.tonalite);
    const MARGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2];
    const accordTonalite = MARGES.map((m) => ecrites.filter((s) => {
      const lue = tonaliteDesNotes({ notes: s.notes, tempo: 60 }, m);
      return lue?.tonique === s.tonalite!.tonique && lue.mode === s.tonalite!.mode;
    }).length);
    const frequences = (["majeur", "mineur"] as const).map((m) => {
      const total = degres[m].reduce((x: number, y: number) => x + y, 0);
      return `- ${m} : ${total} temps · ${degres[m].map((c: number, d: number) => `${["I", "II", "III", "IV", "V", "VI", "VII"][d]} ${(100 * c / total).toFixed(1)} %`).join(" · ")}`;
    });
    const verification = [
      `## Le vérificateur sur les chorals de Sapp, ${verifies} chorals dans leur tonalité`,
      "",
      `- chorals sans aucune erreur : ${sansErreur}`,
      "",
      "| règle | erreurs | avis | jugées |",
      "|---|---|---|---|",
      ...REGLES_CHORAL.map((r) => { const b = bilan.get(r.id)!; return `| ${r.fr} | ${b.erreur} | ${b.avis} | ${b.jugees} |`; }),
    ];

    const parEcart = new Map<number, number>();
    for (const e of ecarts) parEcart.set(e.dcml - e.hauteurSapp, (parEcart.get(e.dcml - e.hauteurSapp) ?? 0) + 1);
    const chorauxTouches = new Set(ecarts.map((e) => e.choral)).size;
    const rapport = [
      `# DCML contre Sapp, ${tables.length} tables du DCML, ${sapps.length} chorals de Sapp`,
      "",
      `- notes comparées (même voix, même attaque) : ${comparees}`,
      `- hauteurs identiques : ${identiques}`,
      `- hauteurs qui diffèrent : ${ecarts.length}, dans ${chorauxTouches} chorals`,
      `- écart DCML moins Sapp, en demi-tons : ${[...parEcart].sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d > 0 ? "+" : ""}${d} ×${c}`).join(", ")}`,
      `- attaques du DCML sans jumelle chez Sapp : ${orphelines}`,
      `- tables appariées à un autre numéro que le leur : ${autreNumero}`,
      `- appariements incertains, moins de 80 % des notes concordantes : ${incertaines}`,
      `- titres qui ne concordent pas après appariement : ${titresDiscordants}`,
      "",
      "## Tessitures chez Sapp, en MIDI",
      "",
      ...tessitures,
      "",
      ...verification,
      "",
      "## Fréquence des degrés chez Bach, sur les temps reconnus",
      "",
      ...frequences,
      "",
      `## Tonalité lue contre tonalité écrite chez Sapp, ${ecrites.length} chorals`,
      "",
      ...MARGES.map((m, k) => `- marge de la basse finale ${m} : ${accordTonalite[k]} justes`),
      "",
      "| n° DCML | n° Sapp | titre | notes concordantes | notes DCML | notes Sapp | hauteurs différentes | attaques sans jumelle |",
      "|---|---|---|---|---|---|---|---|",
      ...lignes,
    ].join("\n");
    writeFileSync(join(RACINE!, "releve-dcml-sapp.md"), rapport + "\n", "utf8");
    writeFileSync(join(RACINE!, "corrections-dcml.tsv"),
      ["choral_dcml\tchoral_sapp\tvoix\tnoire\tmidi_dcml\tmidi_sapp", ...ecarts.map((e) => `${e.choral}\t${e.sapp}\t${e.voix}\t${e.noire}\t${e.dcml}\t${e.hauteurSapp}`)].join("\n") + "\n", "utf8");
    console.log(rapport.split("\n").slice(0, 10).join("\n"));
    // L'INSTRUMENT SE MESURE AVANT D'ÊTRE CRU : une passe qui ne comparerait rien serait verte.
    expect(tables.length).toBeGreaterThan(300);
    expect(comparees).toBeGreaterThan(50000);
  }, 1_800_000);
});
