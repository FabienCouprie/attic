// plugins/midi-norme.test.ts — La conformité MIDI de tous les nœuds qui écrivent du MIDI.
//
// POURQUOI CE TEST EXISTE. `midi-file` n'écrête rien et son lecteur est indulgent : une vélocité de
// 200 part telle quelle dans le fichier, où l'octet 0xC8 se lit comme un octet de statut, et le
// relire avec `parseMidi` rend 200 sans broncher. Un MIDI malformé est donc INVISIBLE depuis
// l'intérieur du logiciel : il ne se voit que chez un lecteur conforme, c'est-à-dire chez l'usager.
// Aucun test du seul calcul ne l'attrape ; il faut sortir les octets et les confronter à la norme.
//
// CE QU'IL A TROUVÉ, le 2026-09-27 : le quantiseur écrivait ses `deltaTime` selon un ordre de tri
// qui n'était jamais appliqué à la piste, et la dernière note de tout fichier quantifié sortait à
// durée nulle — écartée ensuite par `rendreAvecSF2`, qui jette tout ce qui dure moins d'une
// milliseconde. Une note perdue en silence, à chaque quantification.
//
// COMMENT IL EST ÉCRIT, et c'est la leçon de la passe qui l'a produit. Trois fois de suite mon banc
// de mesure s'est trompé tout seul : `JSON.stringify(new File(...))` rend `{}`, donc tout nœud
// rendant un fichier paraissait inerte ; les bornes s'écrivent `plage: [min, max]` et non
// `min:`/`max:`, donc les valeurs d'essai tombaient hors plage et revenaient au défaut. D'où la
// dernière assertion de ce fichier : elle vérifie que le test ÉPROUVE VRAIMENT un nombre plancher
// d'émetteurs. Un test de conformité qui n'exerce plus rien passe au vert en mentant.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { parseMidi, writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { analyserMidi } from "../audio/midi";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 44100;

/** Le son d'entrée : deux attaques, un peu de bruit, crête vers 0,5. */
function son(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
  let e = 11;
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(SR);
    for (let i = 0; i < SR; i++) {
      e = (e * 1664525 + 1013904223) >>> 0;
      const t = i / SR, env = Math.exp(-((t % 0.5) * 6));
      x[i] = 0.35 * env * Math.sin(2 * Math.PI * (c ? 330 : 220) * t) + 0.03 * (e / 4294967296 * 2 - 1);
    }
    b.getChannelData(c).set(x);
  }
  return b;
}

/** Le MIDI d'entrée porte les cas durs : un accord, la même hauteur rejouée, une note seule. */
// Le type précise `ArrayBuffer` : un `Uint8Array<ArrayBufferLike>` n'est pas un `BlobPart`, parce
// qu'il pourrait être adossé à un `SharedArrayBuffer`, et `new File([...])` le refuse.
function octetsMidi(): Uint8Array<ArrayBuffer> {
  const trk: Record<string, unknown>[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
  ];
  const pousser = (notes: number[], duree: number) => {
    for (const n of notes) trk.push({ deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n, velocity: 96 });
    notes.forEach((n, i) => trk.push({ deltaTime: i === 0 ? duree : 0, type: "noteOff", channel: 0, noteNumber: n, velocity: 0 }));
  };
  pousser([60, 64, 67], 480);
  pousser([60, 64, 67], 480);
  pousser([62], 240);
  pousser([62], 240);
  pousser([55], 480);
  trk.push({ deltaTime: 0, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [trk] } as never));
}

function entreeSynthetique(p: { type: string }): unknown {
  if (p.type === "audio") return son();
  if (p.type === "midi") return new File([octetsMidi()], "entree.mid", { type: "audio/midi" });
  if (p.type === "texte") return "CDEF GABc";
  if (p.type === "nombre") return 60;
  return null;
}

async function executer(fiche: { id: string }): Promise<unknown[]> {
  const def = registre.trouverDef(fiche.id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    // UNE GRAINE À ZÉRO EST TIRÉE AU SORT À CHAQUE EXÉCUTION dans ce dépôt. Plusieurs nœuds tolérés
    // ci-dessous en ont une, et leur recouvrement de hauteurs apparaissait ou non selon le tirage :
    // le test passait seul et tombait dans la suite complète. La fixer le rend reproductible.
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
  }
  const ent = (def.entrees ?? []).map(entreeSynthetique);
  const ctx = {
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: (i: number) => ent[i] ?? null, entrees: () => ent,
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => {
      const p = (def.parametres ?? []).find((x) => x.nom === n);
      return p && typeof params[n] === "string" ? String(valeurCanoniqueChoix(p as never, params[n] as string)) : d;
    },
    onProgress: () => {}, signal: new AbortController().signal,
  };
  const r = await def.executer(ctx);
  return r?.valeurs ?? [];
}

async function versOctets(v: unknown): Promise<Uint8Array | null> {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
  return null;
}

/**
 * Les manquements d'un flux MIDI à la norme. La liste est vide quand tout est conforme.
 *
 * L'ordre dans un tick est celui de `audio/midi-ordre.ts` : réglages, puis note-off, puis note-on.
 * Un note-off placé APRÈS le note-on du même tick referme la note qui vient de s'ouvrir, et la note
 * disparaît. Les bornes sont celles du protocole : une donnée MIDI tient sur sept bits.
 */
function manquements(octets: Uint8Array): string[] {
  const m: string[] = [];
  let midi: ReturnType<typeof parseMidi>;
  try {
    midi = parseMidi(octets);
  } catch (e) {
    return [`illisible : ${String(e)}`];
  }
  if (!midi.header.ticksPerBeat) m.push("en-tete sans ticksPerBeat");

  midi.tracks.forEach((piste, ip) => {
    let tick = 0;
    const ouvertes = new Map<string, number>();
    const ouvertesAuTick = new Map<string, number>();
    const fermeesAuTick = new Map<string, number>();
    for (const ev of piste as unknown as Record<string, number | string>[]) {
      tick += Number(ev.deltaTime);
      const borne = (nom: string, max: number) => {
        const v = ev[nom];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) {
          m.push(`${nom} hors bornes 0..${max} : piste ${ip}, tick ${tick}, ${String(ev.type)}, ${nom}=${String(v)}`);
        }
      };
      if (ev.type === "noteOn" || ev.type === "noteOff") {
        borne("noteNumber", 127);
        borne("velocity", 127);
        borne("channel", 15);
        const cle = `${String(ev.channel)}/${String(ev.noteNumber)}`;
        if (ev.type === "noteOn" && Number(ev.velocity) > 0) {
          if (ouvertes.has(cle) && fermeesAuTick.get(cle) !== tick) {
            m.push(`hauteur deja ouverte : piste ${ip}, tick ${tick}, ${cle} rejouee sans note-off`);
          }
          ouvertes.set(cle, tick);
          ouvertesAuTick.set(cle, tick);
        } else {
          if (!ouvertes.has(cle)) m.push(`note-off orphelin : piste ${ip}, tick ${tick}, ${cle}`);
          else {
            if (ouvertesAuTick.get(cle) === tick) {
              m.push(`ordre dans le tick : piste ${ip}, tick ${tick}, ${cle} ferme au tick ou il s'ouvre`);
            }
            ouvertes.delete(cle);
            fermeesAuTick.set(cle, tick);
          }
        }
      } else if (typeof ev.channel === "number") borne("channel", 15);
      if (ev.type === "programChange") borne("programNumber", 127);
      if (ev.type === "controller") { borne("controllerType", 127); borne("value", 127); }
    }
    for (const cle of ouvertes.keys()) m.push(`note jamais refermee : piste ${ip}, ${cle}`);
    const dernier = (piste as unknown[])[piste.length - 1] as { type?: string } | undefined;
    if (dernier?.type !== "endOfTrack") m.push(`endOfTrack absent : piste ${ip}`);
  });
  return m;
}

/**
 * LES NON-CONFORMITÉS CONNUES, relevées le 2026-09-27, et que ce test tolère en les nommant.
 *
 * Aucune n'est acquise : le but est de VIDER cette table, une entrée à la fois, et retirer une
 * entrée fait partie de la correction. Tolérer sans nommer aurait laissé le test au vert sans rien
 * apprendre ; nommer sans tolérer aurait laissé la suite au rouge, ce qui la rend inutilisable.
 *
 * Le recouvrement de même hauteur sur un même canal est ambigu en MIDI : un lecteur conforme
 * relance la note et le premier note-off éteint tout. Le lecteur du logiciel, lui, retrouve toutes
 * les notes. Mesuré, l'écart de durée sonnante entre les deux lectures vaut 4,114 s pour
 * `arpege-koch`, 6,300 s pour `automate-cellulaire` et 0,206 s pour `boite-groove` ; pour
 * `motif-echo-notes`, 9 des 36 notes tombent à durée nulle chez un lecteur conforme. L'export ne
 * sonne donc pas comme l'application.
 */
const RECOUVREMENT = ["hauteur deja ouverte", "note-off orphelin"];
const TOLERES: Record<string, string[]> = {
  // Écart de durée sonnante mesuré entre les deux lectures : l'export ne sonne pas comme l'application.
  "arpege-koch": RECOUVREMENT,           // 24,683 s contre 20,569 s
  "automate-cellulaire": RECOUVREMENT,   // 4,200 s contre 10,500 s, et 2 notes a duree nulle
  "boite-groove": RECOUVREMENT,          // 2,473 s contre 2,267 s
  "motif-echo-notes": RECOUVREMENT,      // 9 des 36 notes a duree nulle chez un lecteur conforme
  // Même classe, mais aucun écart de durée sonnante mesuré : le flux reste ambigu, sans conséquence
  // relevée à ce jour. Moins pressés que les quatre précédents, à corriger tout de même.
  "arpegiateur-midi": RECOUVREMENT,
  "multi-reservoirs": RECOUVREMENT,
  "reservoir-musical": RECOUVREMENT,
  // `motif-crossmodal.ts` bâtit deux pistes et ne termine que la seconde.
  "parfum-motif": ["endOfTrack absent"],
  "accord-mets-musique": ["endOfTrack absent"],
};

/** Le plancher d'émetteurs réellement éprouvés. Voir l'en-tête : un test qui n'exerce plus rien
 *  passe au vert en mentant, et c'est exactement le piège où mon banc de mesure est tombé. */
const PLANCHER_EPROUVES = 45;

const emetteurs = toutesLesFiches.filter(
  (f) => ((f as { sorties?: { type: string }[] }).sorties ?? []).some((s) => s.type === "midi"),
);

describe("conformite MIDI des nœuds qui ecrivent du MIDI", () => {
  it("aucun flux ne sort des bornes ni de l'ordre, hors non-conformites nommees", async () => {
    expect(emetteurs.length).toBeGreaterThan(PLANCHER_EPROUVES);
    let eprouves = 0;
    const fautes: string[] = [];

    for (const fiche of emetteurs) {
      let valeurs: unknown[];
      try {
        valeurs = await executer(fiche);
      } catch {
        continue; // Un nœud qui demande un modèle ou un runtime absent n'est pas éprouvé ici.
      }
      const iMidi = ((fiche as { sorties?: { type: string }[] }).sorties ?? [])
        .map((s, i) => (s.type === "midi" ? i : -1)).filter((i) => i >= 0);
      const releves: string[] = [];
      let vu = false;
      for (const i of iMidi) {
        const octets = await versOctets(valeurs[i]);
        if (!octets || octets.length === 0) continue;
        vu = true;
        releves.push(...manquements(octets));
      }
      if (!vu) continue;
      eprouves++;
      const tolere = TOLERES[fiche.id] ?? [];
      for (const r of releves) {
        if (!tolere.some((t) => r.startsWith(t))) fautes.push(`${fiche.id} — ${r}`);
      }
    }

    expect(fautes).toEqual([]);
    expect(eprouves).toBeGreaterThanOrEqual(PLANCHER_EPROUVES);
  }, 120000);

  it("le quantiseur garde la derniere note, qui sortait a duree nulle", async () => {
    // Le défaut du 2026-09-27, gardé fermé : les `deltaTime` étaient calculés selon un ordre de tri
    // jamais appliqué à la piste. Le relevé d'alors : note 55 de début 1,500000 s à fin 1,500000 s.
    const fiche = emetteurs.find((f) => f.id === "transposeur-quantiseur-midi")!;
    const octets = (await versOctets((await executer(fiche))[0]))!;
    const midi = parseMidi(octets);
    const notes = analyserMidi(midi as never).notes;
    const nulles = notes.filter((n) => n.fin - n.debut < 0.001);
    expect(nulles, `notes de duree nulle : ${JSON.stringify(nulles)}`).toEqual([]);
    // L'entrée finit par une note 55 de 480 ticks, soit une demi-seconde au tempo par défaut.
    const derniere = notes.reduce((a, b) => (b.debut > a.debut ? b : a));
    expect(derniere.note).toBe(55);
    expect(derniere.fin - derniere.debut).toBeCloseTo(0.5, 3);
  }, 60000);

  it("chaque non-conformite toleree existe encore, sinon son entree doit partir", async () => {
    // Une tolérance qui ne sert plus est un mensonge qui dort : elle laisserait croire qu'un défaut
    // subsiste, et masquerait sa réapparition sous une autre forme.
    for (const [id, types] of Object.entries(TOLERES)) {
      const fiche = emetteurs.find((f) => f.id === id);
      expect(fiche, `${id} n'ecrit plus de MIDI : retirer son entree de TOLERES`).toBeTruthy();
      const valeurs = await executer(fiche!);
      const iMidi = ((fiche as unknown as { sorties: { type: string }[] }).sorties)
        .map((s, i) => (s.type === "midi" ? i : -1)).filter((i) => i >= 0);
      const releves: string[] = [];
      for (const i of iMidi) {
        const octets = await versOctets(valeurs[i]);
        if (octets && octets.length > 0) releves.push(...manquements(octets));
      }
      for (const t of types) {
        expect(
          releves.some((r) => r.startsWith(t)),
          `${id} ne presente plus « ${t} » : le defaut est corrige, retirer cette ligne de TOLERES`,
        ).toBe(true);
      }
    }
  }, 120000);
});
