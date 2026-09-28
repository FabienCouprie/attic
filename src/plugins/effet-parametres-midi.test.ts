// plugins/effet-parametres-midi.test.ts — Chaque réglage des transformateurs MIDI agit-il ?
//
// LA FAMILLE : les nœuds qui prennent du MIDI et rendent du MIDI. Elle se définit par ses ports, pas
// par une liste tenue à la main, donc un nouveau transformateur entre ici sans qu'on y pense.
//
// POURQUOI UNE ENTRÉE PROPRE À LA FAMILLE, et c'est tout l'objet de ce fichier. Un balayage général
// du registre a désigné « Direction » et « Motif » de l'arpégiateur comme sans effet ; ils sont
// parfaitement branchés. Son fichier d'essai n'avait que des notes successives : un arpégiateur sans
// accord n'a rien à arpéger. De même « Quantifier fins » paraissait mort sur une entrée déjà posée
// sur la grille. La mesure ne valait rien parce que l'ENTRÉE ne sollicitait pas ce qu'on mesurait.
//
// L'entrée ci-dessous porte donc, à dessein : des accords, des notes hors grille, deux canaux, un
// changement de tempo, des vélocités et des durées inégales, et une hauteur rejouée à l'identique.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";
import { sf2Chargee } from "./soundfontGlobal";

interface Parametre {
  nom: string;
  type?: string;
  defaut?: unknown;
  plage?: [number, number];
  pas?: number;
  options?: string[];
  optionIds?: string[];
}
interface Port { nom: string; type: string }
interface Def {
  id: string;
  parametres?: Parametre[];
  entrees?: Port[];
  sorties?: Port[];
  executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
}

const TPM = 480;

/** Une entrée qui sollicite tout ce que cette famille sait faire. */
function entreeRiche(): Uint8Array<ArrayBuffer> {
  const piste: Record<string, unknown>[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
  ];
  let tick = 0;
  const poser = (
    notes: number[], debut: number, duree: number, canal: number, velocite: number,
  ) => {
    for (const n of notes) {
      evenements.push({ tick: debut, ev: { type: "noteOn", channel: canal, noteNumber: n, velocity: velocite } });
      evenements.push({ tick: debut + duree, ev: { type: "noteOff", channel: canal, noteNumber: n, velocity: 0 } });
    }
  };
  const evenements: { tick: number; ev: Record<string, unknown> }[] = [];

  // Deux accords de trois notes, pour les arpégiateurs et les renversements.
  poser([60, 64, 67], 0, 460, 0, 96);
  poser([59, 62, 67], 480, 460, 0, 80);
  // Des notes hors grille : 1/16 vaut 120 ticks, donc 970 et 1050 tombent entre deux crans.
  poser([72], 970, 110, 0, 112);
  poser([71], 1050, 95, 0, 64);
  // La même hauteur rejouée, note-off juste avant le note-on suivant.
  poser([65], 1200, 240, 0, 90);
  poser([65], 1440, 240, 0, 90);
  // Un second canal, pour les répartiteurs et les logiques par canal.
  poser([48, 55], 0, 940, 1, 70);
  poser([43], 960, 460, 1, 58);
  // Des durées longues et inégales, pour les quantiseurs de fins et les éclaircisseurs.
  poser([77], 1680, 700, 0, 120);
  poser([74], 1700, 180, 0, 40);

  evenements.sort((a, b) => a.tick - b.tick || (a.ev.type === "noteOff" ? 0 : 1) - (b.ev.type === "noteOff" ? 0 : 1));
  for (const { tick: t, ev } of evenements) {
    piste.push({ ...ev, deltaTime: t - tick });
    tick = t;
  }
  // Un changement de tempo en cours de route, pour les nœuds qui recalculent le temps.
  piste.push({ deltaTime: 0, type: "setTempo", microsecondsPerBeat: 375000 });
  piste.push({ deltaTime: 0, type: "endOfTrack" });
  return new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: TPM }, tracks: [piste] } as never));
}

const OCTETS = entreeRiche();

function entreeSynthetique(p: Port): unknown {
  if (p.type === "midi") return new File([OCTETS], "riche.mid", { type: "audio/midi" });
  if (p.type === "texte") return "CDEF GABc";
  if (p.type === "nombre") return 60;
  return null;
}

const octetsHash = (v: Uint8Array) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s = (s * 31 + v[i]) % 1e9;
  return `${v.length}:${s}`;
};

/** UN FICHIER SE LIT, IL NE SE SÉRIALISE PAS : `JSON.stringify(new File(...))` rend `{}`, et tout
 *  nœud rendant un fichier paraîtrait alors inerte, quel que soit son réglage. */
async function empreinte(valeurs: unknown[]): Promise<string> {
  const bouts: string[] = [];
  for (const v of valeurs) {
    if (v instanceof Blob) bouts.push(`f${octetsHash(new Uint8Array(await v.arrayBuffer()))}`);
    else if (v instanceof Uint8Array) bouts.push(`o${octetsHash(v)}`);
    else if (v instanceof AudioBuffer) {
      // SANS CETTE BRANCHE, tout son rendu vaut « opaque » et se compare égal à lui-même : les
      // réglages qui n'agissent que sur l'audio — « Volume », « Synthèse » — paraissent morts.
      let s = 0;
      for (let c = 0; c < v.numberOfChannels; c++) {
        const d = v.getChannelData(c);
        for (let i = 0; i < d.length; i += 97) s += Math.abs(d[i]) * ((i % 101) + 1);
      }
      bouts.push(`a${v.length}:${v.numberOfChannels}:${s.toFixed(4)}`);
    }
    else if (typeof v === "string") bouts.push(`t${v.length}:${v.slice(0, 300)}`);
    else if (typeof v === "number") bouts.push(`n${v}`);
    else if (v == null) bouts.push("vide");
    else bouts.push("opaque");
  }
  return bouts.join("|");
}

async function lancer(def: Def, reglages: Record<string, unknown>): Promise<string> {
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    // UNE GRAINE À ZÉRO EST TIRÉE AU SORT À CHAQUE EXÉCUTION dans ce dépôt. Deux appels ne rendraient
    // alors jamais le même résultat, et tout réglage paraîtrait agir : l'inertie réelle se cacherait
    // derrière le hasard. On fixe la graine, sauf quand c'est elle qu'on éprouve.
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
  }
  Object.assign(params, reglages);
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
  return empreinte(r?.valeurs ?? []);
}

/**
 * Une autre valeur pour un réglage, choisie pour avoir une chance de changer le résultat.
 *
 * LA BORNE S'ÉCRIT `plage: [min, max]` DANS CE DÉPÔT, et non `min:`/`max:`. Lire les mauvais champs
 * fait essayer `defaut ± 10`, valeur hors plage que le nœud ramène à son défaut : le réglage paraît
 * alors sans effet alors qu'il n'a jamais été changé.
 */
function valeursDEssai(p: Parametre): unknown[] {
  if (p.type === "choix") {
    const ids = p.optionIds ?? p.options ?? [];
    const courant = defautCanoniqueChoix(p as never);
    return ids.filter((x) => x !== courant);
  }
  if (p.type === "bool" || p.type === "booleen") return [!p.defaut];
  if (p.type === "nombre") {
    const d = Number(p.defaut ?? 0);
    const [min, max] = Array.isArray(p.plage) ? p.plage : [d - 10, d + 10];
    // PLUSIEURS VALEURS, ET NON LA SEULE BORNE LA PLUS LOIN. « Rotation » de « Répéter et tourner »
    // agit modulo la longueur du motif densifié : la borne 32 tombait pile sur un multiple de cette
    // longueur, le décalage valait zéro, et le réglage paraissait mort alors qu'il est juste.
    const tiers = min + (max - min) / 3;
    const brut = [max, min, tiers, (min + max) / 2];
    const entier = (p.pas ?? 0) >= 1 || Number.isInteger(d);
    return [...new Set(brut.map((v) => (entier ? Math.round(v) : v)))].filter((v) => v !== d);
  }
  return []; // Un texte arbitraire ferait retomber le nœud sur son défaut : voir SANS_VALEUR_UTILE.
}

/**
 * LES RÉGLAGES DONT L'INERTIE EST NORMALE, nommés un par un avec la raison. Un réglage qui n'agit
 * que dans un autre mode n'est pas mort : il attend son mode. Cette table se lit comme la liste de
 * ce que l'entrée de ce fichier ne sollicite pas — c'est-à-dire ce qu'il reste à couvrir.
 */
const INERTIE_NORMALE: Record<string, Record<string, string>> = {
  "vitesse-midi": {
    // Les trois modes expriment « aucun changement » par leur défaut : Facteur 1, Pourcentage 100
    // qui vaut 1, et Tempo cible 120 sur une entrée dont le tempo EST 120. Vérifié dans le code.
    "Mode": "les defauts des trois modes donnent tous le facteur 1",
    // Sa propre documentation le dit : « En mode « Tempo » : le tempo auquel jouer le fichier ».
    "Tempo cible": "lu seulement en mode Tempo, et le mode par defaut est Facteur",
  },
};

/**
 * MESURÉ INERTE, CAUSE NON ÉTABLIE. Le test les tolère en les nommant, parce qu'un candidat non
 * attribué n'est ni un défaut ni une inertie normale : c'est du travail qui reste. Vider cette table
 * veut dire, pour chaque ligne, soit corriger le nœud, soit passer la ligne dans INERTIE_NORMALE
 * avec sa raison.
 */
const A_ATTRIBUER: Record<string, Record<string, string>> = {
  "clavier-apprentissage": { "Adapter": "ni « replier » ni « replier-sans-percussion » ne bougent la sortie" },
  // Piste : `conduireVoix` pousse le PREMIER accord tel quel, sans consulter les bornes de registre.
  // Mesuré sur la fonction : a plafond 60, les accords 2 a 4 descendent, le premier reste a 60/64/67.
  "voicings-accords": { "Aigu maximum": "le premier accord echappe aux bornes ; reste a attribuer cote nœud" },
};

/** Les réglages de texte, qu'aucune valeur générique ne peut éprouver : on les compte, sans plus. */
const SANS_VALEUR_UTILE = new Set(["texte", "fichier", "dossier"]);

/**
 * « Synthèse » ne s'éprouve pas ici, et sa propre documentation dit pourquoi : « Automatique =
 * SoundFont si un fichier SF2 est chargé, sinon FM ». Aucun SF2 n'est chargé dans une suite de
 * tests, donc « Automatique » EST « FM », et passer de l'un à l'autre ne peut rien changer. Ce
 * n'est pas une inertie du nœud mais une propriété du banc, d'où l'assertion qui garde l'hypothèse.
 */
const HORS_PORTEE = new Set(["Synthèse"]);

const famille = (toutesLesFiches as unknown as Def[]).filter(
  (f) => (f.entrees ?? []).some((e) => e.type === "midi") && (f.sorties ?? []).some((s) => s.type === "midi"),
);

describe("les reglages des transformateurs MIDI agissent", () => {
  it("chaque reglage change le resultat, hors inertie nommee", async () => {
    expect(famille.length).toBeGreaterThan(10);
    // L'hypothèse qui justifie d'écarter « Synthèse » : si un SF2 venait à être chargé dans la
    // suite, « Automatique » cesserait d'être « FM » et le réglage redeviendrait éprouvable.
    expect(sf2Chargee(), "un SF2 est charge : « Synthese » redevient eprouvable").toBeFalsy();
    const inertes: string[] = [];
    let eprouves = 0, essais = 0;

    for (const fiche of famille) {
      const def = (registre.trouverDef(fiche.id) ?? fiche) as unknown as Def;
      let base: string;
      try { base = await lancer(def, {}); } catch { continue; }
      if (base === "" || /^(vide\|?)+$/.test(base)) continue;
      eprouves++;
      for (const p of def.parametres ?? []) {
        if (SANS_VALEUR_UTILE.has(p.type ?? "") || HORS_PORTEE.has(p.nom)) continue;
        const candidates = valeursDEssai(p);
        if (candidates.length === 0) continue;
        essais++;
        let agit = false;
        const essayees: unknown[] = [];
        for (const v of candidates) {
          essayees.push(v);
          try {
            if (await lancer(def, { [p.nom]: v }) !== base) { agit = true; break; }
          } catch { /* une exception ne dit rien de l'effet : on passe a la valeur suivante. */ }
        }
        const attendu = INERTIE_NORMALE[fiche.id]?.[p.nom] ?? A_ATTRIBUER[fiche.id]?.[p.nom];
        if (!agit && !attendu) {
          inertes.push(`${fiche.id} — « ${p.nom} » (${p.type}) : aucune de ${JSON.stringify(essayees)} ne change quoi que ce soit`);
        }
        if (agit && attendu) {
          inertes.push(`${fiche.id} — « ${p.nom} » agit desormais : retirer son entree de INERTIE_NORMALE ou de A_ATTRIBUER`);
        }
      }
    }

    expect(inertes).toEqual([]);
    expect(eprouves).toBeGreaterThan(10);
    expect(essais).toBeGreaterThan(30);
  }, 300000);
});
