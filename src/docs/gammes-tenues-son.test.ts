// docs/gammes-tenues-son.test.ts — Les nœuds à gamme qui ne rendent que du son.
//
// LE GÉNÉRATEUR D'ACCORDS NE REND QU'UN SON, mais il le rend d'un MIDI qu'il bâtit d'abord : c'est
// ce MIDI qui porte les accords, et la synthèse ne fait que le jouer. Il se capte au passage, sans
// rien changer à ce que la fiche fait : `genererAccords` est enveloppé, il rend ce qu'il rendait, et
// une copie de son MIDI est gardée. La fiche est donc éprouvée par son chemin réel, réglages compris.
// Le mock vit dans ce fichier seul, parce qu'il remplace le module pour tout le fichier.
//
// LES AUTRES, la correction de hauteur, le glissando et le sampler, demandent de mesurer le son
// lui-même ; ils ne sont pas encore relevés, et le relevé le dit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { registre } from "../audio/adaptateur";
import type { FicheLancable } from "../audio/lancer-fiche";
import { apparier } from "../audio/gamme-banc-lancer";
import { releveEnMarkdown, releverUneGamme, type ReleveDeGamme } from "../audio/gamme-banc-releve";
import type { HauteurRendue } from "../audio/gamme-banc-hauteurs";
import { hauteursParFenetres, picsDuSpectre } from "../audio/gamme-banc-son";
import { reglagesANomenclature } from "../plugins/nomenclatures";
import { degresAttendus as degresDe, degresDesAccordsAttendus as degresDesAccords } from "../audio/gamme-banc-proprietes";

const capte = vi.hoisted(() => ({ midi: null as Uint8Array<ArrayBuffer> | null }));

vi.mock("../audio", async (original) => {
  const m = await original<typeof import("../audio")>();
  return {
    ...m,
    genererAccords: (...a: Parameters<typeof m.genererAccords>) => {
      const r = m.genererAccords(...a);
      capte.midi = new Uint8Array(r.midiBytes);
      return r;
    },
  };
});

const GRAINES = (process.env.GAMMES_GRAINES ?? "1,42,4242").split(",").map(Number);
const paires = apparier(reglagesANomenclature()).paires;

/** La tolérance d'une hauteur mesurée dans le son, en demi-tons : dix cents. */
const TOLERANCE_DU_SON = 0.1;

/** Des hauteurs mesurées, rendues en séquence pour que le relevé les lise comme une sortie. */
const enSequence = (h: readonly HauteurRendue[]) => ({ notes: h.map((x) => ({ note: x.note, velocite: 90, debut: x.debut, fin: x.fin })) });

/** Un son de sinus aux hauteurs données, chacune de `debut` à `fin`. */
function sinus(notes: readonly { note: number; debut: number; fin: number }[], secondes: number, sr = 48000): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * sr), sampleRate: sr });
  const d = b.getChannelData(0);
  for (const n of notes) {
    const f = 440 * 2 ** ((n.note - 69) / 12);
    for (let i = Math.round(n.debut * sr); i < Math.min(d.length, Math.round(n.fin * sr)); i++) d[i] += 0.2 * Math.sin((2 * Math.PI * f * i) / sr);
  }
  return b;
}

describe("l'autocontrôle des instruments du son", () => {
  it("les pics du spectre rendent une gamme tenue au cent près, quart de ton compris", () => {
    const attendues = [60, 62, 63.5, 65, 67, 68.5, 70];
    const lues = picsDuSpectre(sinus(attendues.map((note) => ({ note, debut: 0, fin: 1.5 })), 1.5), 0.2, 1.3).map((h) => h.note);
    expect(lues).toHaveLength(attendues.length);
    lues.forEach((n, i) => expect(Math.abs(n - attendues[i]), `pic ${i}`).toBeLessThan(0.01));
  });

  it("le suivi d'une voix seule rend chaque note à cinq cents près, et la voit trente cents trop haut quand elle l'est", () => {
    const attendues = [60, 61.3, 64, 66.7];
    const son = sinus(attendues.map((note, i) => ({ note, debut: i * 0.25, fin: (i + 1) * 0.25 })), 1);
    const lues = hauteursParFenetres(son, attendues.map((_, i) => [i * 0.25, (i + 1) * 0.25] as [number, number])).map((h) => h.note);
    expect(lues).toHaveLength(attendues.length);
    lues.forEach((n, i) => expect(Math.abs(n - attendues[i]), `note ${i}`).toBeLessThan(0.05));
  });
});

describe("les accords du Générateur d'accords, captés avant sa synthèse", () => {
  const paire = paires.find((p) => p.fiche === "generateur-accords")!;
  const f = registre.trouverDef("generateur-accords") as unknown as FicheLancable;
  // LA NAPPE AUSSI : elle posait une quinte juste fixe au-dessus de chaque fondamentale, hors de la
  // gamme partout où la quinte du degré ne l'est pas, sous 17 gammes au relevé du 2026-11-21.
  it.each(paire.ids)("sous « %s », chaque accord est la triade de la gamme, et la nappe n'en sort pas", async (g) => {
    const r = await releverUneGamme(f, paire, g, {
      ports: [{ nom: "MIDI capté avant le rendu", type: "midi" }], graines: [1], toniques: [3], degresDe, degresDesAccords,
      capture: () => { const m: Uint8Array<ArrayBuffer> | null = capte.midi; capte.midi = null; return [m ? new File([m], "accords.mid") : null]; },
    });
    expect(r.echecs).toEqual([]);
    expect(r.sorties.some((s) => s.accords > 0), "le nœud a rendu des accords").toBe(true);
    expect(r.sorties.flatMap((s) => s.accordsFautifs)).toEqual([]);
    expect(r.sorties.flatMap((s) => s.exemplesHors)).toEqual([]);
  });
});

/**
 * LA CORRECTION DE HAUTEUR RAMÈNE CHAQUE NOTE SUR LA GAMME, quelle que soit la gamme. Sous les gammes à
 * grands intervalles, une note entre deux degrés éloignés dépassait l'« Écart max » par défaut, un
 * demi-ton, et restait trente cents trop haut : dix gammes au relevé du 2026-11-21. L'écart protège des
 * erreurs d'octave du suiveur ; Fabien a décidé le même jour qu'il ne descend jamais sous la moitié du
 * plus grand intervalle de la gamme. L'entrée d'essai est celle du banc de croisement : les douze
 * demi-tons de do à si, trente cents trop haut, un par quart de seconde.
 */
describe("la correction de hauteur ramène chaque note sur la gamme", () => {
  const paire = paires.find((p) => p.fiche === "correction-hauteur")!;
  const f = registre.trouverDef("correction-hauteur") as unknown as FicheLancable;
  const quarts = Array.from({ length: 12 }, (_, i) => [i * 0.25, (i + 1) * 0.25] as [number, number]);
  it.each(paire.ids)("sous « %s », aucune note ne ressort hors de la gamme", async (g) => {
    const r = await releverUneGamme(f, paire, g, {
      ports: [{ nom: "Hauteurs suivies dans le son", type: "sequence" }], graines: [1], toniques: [3], degresDe, tolerance: TOLERANCE_DU_SON,
      sansTransposition: "la correction ramène une entrée qui ne bouge pas",
      // L'entrée tient de do 4 à si 4, trente cents trop haut, et une correction la déplace de moins de
      // deux demi-tons : la bande cherchée se borne de 200 à 700 Hz.
      capture: (v) => [enSequence(hauteursParFenetres(v[0] as AudioBuffer, quarts, { fMin: 200, fMax: 700 }))],
    });
    expect(r.echecs).toEqual([]);
    expect(r.sorties[0]?.notes, "les douze notes de l'entrée ont été suivies").toBe(12);
    expect(r.sorties.flatMap((s) => s.exemplesHors)).toEqual([]);
  });
});

/**
 * LE GLISSANDO TIENT SES DEUX GAMMES, celle de départ dans sa tenue initiale et celle d'arrivée dans sa
 * tenue finale, lues dans les pics du spectre, la richesse à un pour des sinus purs. Chaque pic est un
 * degré de la gamme, à dix cents près, et chaque degré se fait entendre : chaque gamme tenue est
 * exactement elle-même, dit sa notice.
 *
 * LE SHRUTI À VINGT-DEUX DEGRÉS EST HORS DE PORTÉE DE L'INSTRUMENT : en une seconde de son, deux
 * degrés à vingt-deux cents l'un de l'autre ne se séparent pas dans le grave, et les pics se confondent.
 */
const LIMITE_DE_RESOLUTION = "shruti22";
const TENUES: Record<string, [number, number]> = { "Gamme de départ": [0.2, 1.3], "Gamme d'arrivée": [3.7, 4.8] };

describe("le glissando tient ses deux gammes", () => {
  const fg = registre.trouverDef("glissando-de-gamme") as unknown as FicheLancable;
  for (const p of paires.filter((x) => x.fiche === "glissando-de-gamme")) {
    const [a, b] = TENUES[p.gamme];
    it.each(p.ids.filter((g) => g !== LIMITE_DE_RESOLUTION))(`${p.gamme} « %s » : chaque degré sonne, et rien d'autre`, async (g) => {
      const r = await releverUneGamme(fg, p, g, {
        ports: [{ nom: "Hauteurs lues dans le spectre", type: "sequence" }], graines: [1], toniques: [3], degresDe, tolerance: TOLERANCE_DU_SON,
        autres: { Richesse: 1, "Tenue initiale": 1.5, Glissement: 2, "Tenue finale": 1.5 },
        capture: (v) => [enSequence(picsDuSpectre(v[0] as AudioBuffer, a, b).map((h, i) => ({ ...h, debut: i, fin: i + 1 })))],
      });
      expect(r.echecs).toEqual([]);
      expect(r.sorties.flatMap((s) => s.exemplesHors)).toEqual([]);
      expect(r.sorties[0]?.manquants, "degrés jamais entendus").toEqual([]);
    });
  }
});

describe.runIf(process.env.BANC_GAMMES === "1")("le relevé des nœuds qui ne rendent que du son", () => {
  it("relève le Générateur d'accords par le MIDI qu'il remet à sa synthèse", async () => {
    const paire = paires.find((p) => p.fiche === "generateur-accords")!;
    const f = registre.trouverDef("generateur-accords") as unknown as FicheLancable;
    const releves: ReleveDeGamme[] = [];
    for (const g of paire.ids) {
      releves.push(await releverUneGamme(f, paire, g, {
        ports: [{ nom: "MIDI capté avant le rendu", type: "midi" }], graines: GRAINES, degresDe,
        capture: () => { const m: Uint8Array<ArrayBuffer> | null = capte.midi; capte.midi = null; return [m ? new File([m], "accords.mid") : null]; },
      }));
    }
    expect(releves.every((r) => r.sorties.length > 0), "le MIDI des accords a été capté à chaque gamme").toBe(true);

    // LA CORRECTION DE HAUTEUR reçoit les douze demi-tons de do à si, trente cents trop haut, un par
    // quart de seconde (`croisement-entrees.ts`) : chacun doit ressortir sur un degré de la gamme.
    const correction = paires.find((p) => p.fiche === "correction-hauteur")!;
    const fc = registre.trouverDef("correction-hauteur") as unknown as FicheLancable;
    const quarts = Array.from({ length: 12 }, (_, i) => [i * 0.25, (i + 1) * 0.25] as [number, number]);
    for (const g of correction.ids) {
      releves.push(await releverUneGamme(fc, correction, g, {
        ports: [{ nom: "Hauteurs suivies dans le son", type: "sequence" }], graines: [1], degresDe, tolerance: TOLERANCE_DU_SON,
        sansTransposition: "la correction ramène sur la gamme une entrée qui ne bouge pas : sous une autre clé, elle rend d'autres degrés, et rien n'a à se déplacer d'un demi-ton",
        capture: (v) => [enSequence(hauteursParFenetres(v[0] as AudioBuffer, quarts))],
      }));
    }

    // LE GLISSANDO tient sa gamme de départ, glisse, puis tient celle d'arrivée. Chaque gamme tenue se
    // lit dans le spectre de sa tenue, la richesse à un pour des sinus purs.
    const tenues: Record<string, [number, number]> = { "Gamme de départ": [0.2, 1.3], "Gamme d'arrivée": [3.7, 4.8] };
    const fg = registre.trouverDef("glissando-de-gamme") as unknown as FicheLancable;
    for (const p of paires.filter((x) => x.fiche === "glissando-de-gamme")) {
      const [a, b] = tenues[p.gamme];
      for (const g of p.ids) {
        releves.push(await releverUneGamme(fg, p, g, {
          ports: [{ nom: "Hauteurs lues dans le spectre", type: "sequence" }], graines: [1], degresDe, tolerance: TOLERANCE_DU_SON,
          autres: { Richesse: 1, "Tenue initiale": 1.5, Glissement: 2, "Tenue finale": 1.5 },
          capture: (v) => [enSequence(picsDuSpectre(v[0] as AudioBuffer, a, b).map((h, i) => ({ ...h, debut: i, fin: i + 1 })))],
        }));
      }
    }

    mkdirSync("GAMMES", { recursive: true });
    writeFileSync("GAMMES/releve-son.json", JSON.stringify(releves, null, 1));
    const entete = `Au son, la tolérance d'appartenance est de ${Math.round(TOLERANCE_DU_SON * 100)} cents. Non relevé : sampler-personnalise, qui joue un fichier posé sur le nœud, que le banc ne sait pas lui donner.`;
    writeFileSync("GAMMES/releve-son.md", `# Relevé des nœuds qui ne rendent que du son\n\n${entete}\n\n${releveEnMarkdown(releves)}\n`);
  }, 3600_000);
});
