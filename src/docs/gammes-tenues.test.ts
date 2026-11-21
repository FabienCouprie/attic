// docs/gammes-tenues.test.ts — Chaque nœud à gamme tient-il la gamme dans ce qu'il rend ?
//
// LE CHANTIER DU CONTRÔLE DES GAMMES, ouvert le 2026-11-21 sur la règle de Fabien : « la musique est
// une chose sérieuse ». Les nœuds à gamme n'étaient éprouvés qu'en majeur, en do, ou pas du tout ;
// quarante et un en dépendent. Ce fichier tient d'abord l'inventaire, puis mène le relevé : chaque
// réglage de gamme, chaque gamme offerte, en mi bémol et en mi, sous trois graines, et juge ce que le
// nœud a rendu (`audio/gamme-banc-*.ts`).
//
// LE RELEVÉ EST SOUS INTERRUPTEUR, `BANC_GAMMES=1`, et s'écrit dans `GAMMES/` : il compte plusieurs
// milliers de lancers. `GAMMES_FICHES=a,b` le borne à quelques nœuds.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { apparier, type ReglageDeGamme } from "../audio/gamme-banc-lancer";
import type { PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releveEnMarkdown, releverUneGamme, type ReleveDeGamme } from "../audio/gamme-banc-releve";
import { degresEnDemiTons } from "../audio/gammes-reunies";
import { PARAMETRE_CLE, demiTonDeCle } from "../audio/cles";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { reglagesANomenclature } from "../plugins/nomenclatures";

type FicheDuBanc = FicheLancable & { sorties?: readonly PortDeSortie[] };

const fiche = (id: string) => registre.trouverDef(id) as unknown as FicheDuBanc | undefined;

/** Les degrés d'une gamme dans une octave, l'octave de fermeture d'une gamme en cents écartée. */
const degresDe = (id: string) => degresEnDemiTons(id)?.filter((d) => d < 12 - 0.01);

/** La notation texte, lue par le nœud qui la lit dans un graphe. */
async function lireNotation(texte: string): Promise<unknown> {
  const f = fiche("texte-vers-midi");
  if (!f) return null;
  return (await lancerFiche(f, {}, { entrees: [texte] })).valeurs[1];
}

const { paires, ambigues } = apparier(reglagesANomenclature());

describe("l'inventaire des nœuds à gamme", () => {
  it("chaque réglage de gamme du registre est apparié à sa tonique, ou n'en a pas", () => {
    expect(ambigues).toEqual([]);
    expect(paires.length).toBeGreaterThan(30);
    for (const p of paires) expect(fiche(p.fiche), p.fiche).toBeDefined();
  });

  it("chaque gamme offerte est une gamme de la table, en demi-tons ou en cents", () => {
    for (const p of paires) for (const id of p.ids) expect(degresDe(id), `${p.fiche}·${p.gamme} : ${id}`).toBeDefined();
  });
});

/**
 * L'AUTOCONTRÔLE : quatre fiches d'essai dont la réponse est connue. Un banc qui ne voit pas ses propres
 * fautes ne prouve rien de celles des nœuds.
 *
 * Chacune joue, à partir de do 4, les degrés de la gamme lue ; `faute` décide de ce qu'elle fait mal.
 */
type Faute = "ignore la clé" | "v en sus4" | "replie l'ambitus" | "ne rend rien";

function ficheDEssai(faute: Faute): FicheDuBanc {
  const ids = ["majeur", "mineur", "diminuee-demi-ton"];
  return {
    id: `essai-gamme-${faute}`, entrees: [], sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Gamme", type: "choix", options: ids, optionIds: ids, defaut: "majeur" },
      PARAMETRE_CLE,
      { nom: "Graine", plage: [0, 999], defaut: 0, graine: true },
    ],
    executer: async (ctx: never) => {
      const c = ctx as { paramTexte: (n: string, d: string) => string };
      if (faute === "ne rend rien") return { valeurs: [null] };
      const d = degresDe(c.paramTexte("Gamme", "majeur"))!;
      const tonique = faute === "ignore la clé" ? 0 : demiTonDeCle(c.paramTexte("Clé", "C")) ?? 0;
      const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];
      const poser = (note: number, debut: number) => notes.push({ note, velocite: 90, debut, fin: debut + 0.5 });
      for (let o = 0; o < 2; o++) for (const [i, x] of d.entries()) {
        const n = 60 + tonique + 12 * o + x;
        poser(faute === "replie l'ambitus" && n > 72 ? n - 12 : n, (o * d.length + i) * 0.5);
      }
      if (faute === "v en sus4" && d.length === 7) {
        // Le I, puis le V bâti sur la quarte : sol, do, ré en do majeur.
        for (const x of [0, 2, 4]) poser(48 + tonique + d[x], 20);
        for (const x of [d[4], d[0] + 12, d[1] + 12]) poser(48 + tonique + x, 21);
      }
      return { valeurs: [notesVersFichierMidi(notes, 120, 0)] };
    },
  } as FicheDuBanc;
}

const PAIRE_DESSAI = (faute: Faute): ReglageDeGamme => ({
  fiche: `essai-gamme-${faute}`, gamme: "Gamme", ids: ["majeur", "mineur", "diminuee-demi-ton"],
  tonique: { reglage: "Clé", ids: (PARAMETRE_CLE.optionIds ?? []).map(String) },
});

async function releveDEssai(faute: Faute, gamme: string) {
  const f = ficheDEssai(faute);
  return releverUneGamme(f, PAIRE_DESSAI(faute), gamme, { ports: f.sorties!, graines: [1], degresDe });
}

describe("l'autocontrôle du banc des gammes", () => {
  it("UN NŒUD QUI IGNORE LA CLÉ tombe, y compris sous une gamme diminuée, que la clé de mi bémol seule ne verrait pas", async () => {
    const majeur = await releveDEssai("ignore la clé", "majeur");
    expect(majeur.sorties[0].hors).toBeGreaterThan(0);
    expect(majeur.sorties[0].transposition).not.toBeNull();
    const diminuee = await releveDEssai("ignore la clé", "diminuee-demi-ton");
    expect(diminuee.sorties[0].transposition, "un demi-ton plus haut, la gamme diminuée ne revient pas sur elle-même").not.toBeNull();
  });

  it("UN V EN SUS4 est nommé, et le I juste ne l'est pas", async () => {
    const r = await releveDEssai("v en sus4", "majeur");
    expect(r.sorties[0].accordsFautifs).toHaveLength(2);
    expect(r.sorties[0].accordsFautifs.every((x) => x.includes("sus4 au lieu de majeur"))).toBe(true);
  });

  it("UN AMBITUS REPLIÉ ne fait pas tomber la transposition, qui juge les classes et non les octaves", async () => {
    const r = await releveDEssai("replie l'ambitus", "mineur");
    expect(r.sorties[0].hors).toBe(0);
    expect(r.sorties[0].transposition).toBeNull();
  });

  it("UN NŒUD QUI NE REND RIEN est dit tel, et non compté comme juste", async () => {
    const r = await releveDEssai("ne rend rien", "majeur");
    expect(r.sorties).toHaveLength(0);
    expect(releveEnMarkdown([r])).toContain("aucune sortie lue");
  });

  it("UN NŒUD JUSTE passe les quatre propriétés", async () => {
    const r = await releveDEssai("replie l'ambitus", "majeur");
    expect(r.sorties[0]).toMatchObject({ hors: 0, manquants: [], transposition: null, accordsFautifs: [] });
  });
});

const GRAINES = (process.env.GAMMES_GRAINES ?? "1,42,4242").split(",").map(Number);
const BORNE = process.env.GAMMES_FICHES?.split(",").filter(Boolean);
/** Des réglages posés en plus, en JSON : `{"Mode":"plaque"}` fait jouer le Color Looper en accords. */
const AUTRES = process.env.GAMMES_AUTRES ? (JSON.parse(process.env.GAMMES_AUTRES) as Record<string, string | number>) : undefined;
/** Le nom du relevé dans `GAMMES/`, pour qu'un relevé borné n'écrase pas le relevé entier. */
const SORTIE = process.env.GAMMES_SORTIE ?? "releve";

describe.runIf(process.env.BANC_GAMMES === "1")("le relevé du banc des gammes", () => {
  it("relève chaque réglage de gamme sous chaque gamme offerte", async () => {
    // UN NŒUD QUI NE REND QUE DU SON se relève dans `gammes-tenues-son.test.ts`, qui lit son MIDI avant
    // le rendu ou mesure le son : ici, il n'aurait aucune sortie à lire.
    const sonSeul = (p: ReglageDeGamme) => !(fiche(p.fiche)!.sorties ?? []).some((s) => s.type !== "audio");
    const retenues: ReglageDeGamme[] = paires.filter((p) => (!BORNE || BORNE.includes(p.fiche)) && !sonSeul(p));
    const ecartees = paires.filter(sonSeul).map((p) => `${p.fiche}·${p.gamme}`);
    const releves: ReleveDeGamme[] = [];
    const t0 = performance.now();
    for (const p of retenues) {
      const f = fiche(p.fiche)!;
      for (const g of p.ids) {
        releves.push(await releverUneGamme(f, p, g, { ports: f.sorties ?? [], graines: GRAINES, degresDe, lireNotation, ...(AUTRES ? { autres: AUTRES } : {}) }));
      }
    }
    const duree = (performance.now() - t0) / 1000;
    mkdirSync("GAMMES", { recursive: true });
    writeFileSync(`GAMMES/${SORTIE}.json`, JSON.stringify(releves, null, 1));
    const poses = AUTRES ? ` Posés en plus : ${JSON.stringify(AUTRES)}.` : "";
    const entete = `${retenues.length} réglages, ${releves.length} gammes, graines ${GRAINES.join(", ")}, ${duree.toFixed(0)} s.${poses} Relevés à part, parce qu'ils ne rendent que du son : ${ecartees.join(", ")}.`;
    writeFileSync(`GAMMES/${SORTIE}.md`, `# Relevé du banc des gammes\n\n${entete}\n\n${releveEnMarkdown(releves)}\n`);
    expect(releves.length).toBeGreaterThan(0);
  }, 6 * 3600_000);
});
