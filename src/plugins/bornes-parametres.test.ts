// plugins/bornes-parametres.test.ts — Un réglage poussé à sa borne rend-il un son défini ?
//
// CE BANC NE TOURNE PAS TOUT SEUL, ET C'EST MESURÉ. Il exécute chaque composant audio une fois par
// réglage numérique et par bout de plage, soit **1 932 essais pour 3 min 51 s** — et le raccourcir
// n'y change rien, la même passe sur un dixième de seconde de son prenant encore 3 min 36 : le
// temps est dans la mise en route de chaque module, pas dans le son. Trois minutes et demie de plus
// à chaque passe d'intégration continue, pour une classe de défaut qui en a rendu UN, c'est une
// mauvaise affaire. Il se lance donc à la demande :
//
//     BANC_BORNES=1 npx vitest run src/plugins/bornes-parametres.test.ts
//
// CE QU'IL A TROUVÉ, le 2026-10-22, à sa première passe : « Extraire une zone », avec « Début » à
// son maximum, rendait deux échantillons non finis — le début était borné à la LONGUEUR du tampon
// au lieu du dernier échantillon, et la boucle lisait `src[longueur]`, c'est-à-dire `undefined`.
// Seul cas sur 1 932, et aucune erreur levée nulle part ailleurs. Le défaut est corrigé et gardé à
// part par `audio/zone-hors-du-son.test.ts`, qui tient en quelques millisecondes.
//
// CE QU'IL NE DIT PAS. Une erreur levée à une borne peut être le bon comportement — « la piste est
// trop courte pour prédire » en est une. Seul l'échantillon non fini est une faute sans discussion,
// et c'est le seul relevé sur lequel ce banc conclut.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 48000;
const N = Math.round(SR * 0.1);

function son(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const env = Math.exp(-((i / SR) % 0.08) * 20);
      x[i] = 0.4 * env * Math.sin(2 * Math.PI * (c ? 330 : 220) * (i / SR));
    }
    b.getChannelData(c).set(x);
  }
  return b;
}

type Param = { nom: string; type?: string; defaut?: unknown; plage?: [number, number] };
type Fiche = { id: string; entrees?: { type: string }[]; sorties?: { type: string }[]; parametres?: Param[] };

async function executer(id: string, forcer: Record<string, unknown>): Promise<unknown[]> {
  const def = registre.trouverDef(id) as never as {
    parametres?: Param[]; entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
  }
  Object.assign(params, forcer);
  const ent = (def.entrees ?? []).map((p) => (p.type === "audio" ? son() : null));
  const r = await def.executer({
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: (i: number) => ent[i] ?? null, entrees: () => ent,
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => {
      const p = (def.parametres ?? []).find((x) => x.nom === n);
      return p && typeof params[n] === "string" ? String(valeurCanoniqueChoix(p as never, params[n] as string)) : d;
    },
    onProgress: () => {}, signal: new AbortController().signal,
  });
  return r?.valeurs ?? [];
}

describe("chaque réglage numérique poussé à ses deux bornes", () => {
  it.skipIf(!process.env.BANC_BORNES)("aucune borne ne rend d'échantillon non fini", async () => {
    const candidats = (toutesLesFiches as unknown as Fiche[]).filter(
      (f) => (f.entrees ?? []).some((e) => e.type === "audio")
        && (f.sorties ?? []).some((s) => s.type === "audio"),
    );
    const nonFinis: string[] = [], leves: string[] = [], lents: string[] = [];
    let essais = 0;
    // LE BANC SE BORNE PAR UNE MESURE, ET NON PAR UNE LISTE DE NOMS. Un composant est d'abord
    // lancé avec ses réglages déclarés ; s'il prend plus d'une seconde sur un quart de seconde de
    // son, ses bornes ne seront pas essayées — multiplier ce temps par dix réglages et deux bouts
    // ferait durer la passe des heures, et la lenteur ne dit rien de la justesse.
    const PLAFOND_MS = 1000;
    for (const fiche of candidats) {
      const t0 = Date.now();
      try {
        await executer(fiche.id, {});
      } catch {
        continue;
      }
      const cout = Date.now() - t0;
      if (cout > PLAFOND_MS) { lents.push(`${fiche.id} (${cout} ms)`); continue; }
      const numeriques = (fiche.parametres ?? []).filter(
        (p) => Array.isArray(p.plage) && p.plage.length === 2 && p.nom !== "Graine",
      );
      for (const p of numeriques) {
        for (const [bout, v] of [["min", p.plage![0]], ["max", p.plage![1]]] as [string, number][]) {
          essais++;
          let valeurs: unknown[];
          try {
            valeurs = await executer(fiche.id, { [p.nom]: v });
          } catch (e) {
            leves.push(`${fiche.id} « ${p.nom} » ${bout}=${v} : ${String((e as Error).message).slice(0, 70)}`);
            continue;
          }
          const rangs = (fiche.sorties ?? []).map((s, i) => (s.type === "audio" ? i : -1)).filter((i) => i >= 0);
          for (const rang of rangs) {
            const a = valeurs[rang] as AudioBuffer | null;
            if (!a || typeof a.numberOfChannels !== "number" || a.length === 0) continue;
            let mauvais = 0;
            for (let c = 0; c < a.numberOfChannels; c++) {
              const x = a.getChannelData(c);
              for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) mauvais++;
            }
            if (mauvais > 0) {
              nonFinis.push(`${fiche.id}[${rang}] « ${p.nom} » ${bout}=${v} : ${mauvais} non finis`);
            }
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nESSAIS ${essais} · ECARTES CAR LENTS ${lents.length}`
      + `\n### NON FINIS (${nonFinis.length})\n${nonFinis.join("\n")}`
      + `\n### ERREURS LEVEES (${leves.length})\n${leves.slice(0, 40).join("\n")}`
      + `\n### LENTS\n${lents.join(", ")}`);
    // LA SEULE CONCLUSION DU BANC. Les erreurs levées sont imprimées pour être lues, non jugées :
    // certaines sont le bon comportement. Un échantillon non fini, lui, n'en est jamais un.
    expect(nonFinis).toEqual([]);
    expect(essais, "un banc qui n'essaie plus rien passerait au vert en mentant").toBeGreaterThan(1500);
  }, 3600000);
});
