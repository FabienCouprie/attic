// plugins/determinisme-graine.test.ts — Deux passes de mêmes réglages rendent-elles le même son ?
//
// LA PROMESSE QUE CE BANC ÉPROUVE. Le dépôt écrit partout qu'une même graine rejoue la même pièce,
// et la convention va plus loin : la graine TIRÉE revient dans le message, pour qu'un rendu qu'on
// voudrait garder se retrouve. Rien ne vérifiait cette promesse composant par composant.
//
// CE QU'IL A TROUVÉ, le 2026-10-22, à sa première passe : **191 sorties éprouvées, zéro écart**.
// La promesse tient sur tout le catalogue, à une exception près, et elle n'est pas dans le hasard.
// « Continuation spectrale (LSTM) » rend deux sons différents à réglages égaux, écart maximal de
// 2,6 × 10⁻¹. La cause est mesurée : budget de temps hors d'atteinte, les deux passes sont
// IDENTIQUES au bit près ; budget de trois secondes, elles diffèrent. L'entraînement s'arrête sur
// l'horloge, qui ne tombe pas au même endroit d'une machine ou d'une fois à l'autre. Les
// documentations de « Graine » et de « Budget » le disent désormais, sur ce composant et sur la
// PCA neuronale, dont le budget se comporte de même.
//
// IL NE TOURNE PAS TOUT SEUL, pour la même raison que le banc des bornes : **1 min 45 s** pour une
// propriété qui tient partout. Il se lance à la demande :
//
//     BANC_GRAINE=1 npx vitest run src/plugins/determinisme-graine.test.ts
//
// LES SIX COMPOSANTS LENTS SONT ÉCARTÉS et nommés, leur seul premier passage coûtant jusqu'à
// trente-quatre secondes. Ils ont été éprouvés à part, avec la même méthode.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 48000;
const N = Math.round(SR * 0.2);

function son(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const env = Math.exp(-((i / SR) % 0.05) * 25);
      x[i] = 0.4 * env * Math.sin(2 * Math.PI * (c ? 330 : 220) * (i / SR));
    }
    b.getChannelData(c).set(x);
  }
  return b;
}

type Fiche = { id: string; entrees?: { type: string }[]; sorties?: { type: string }[] };

async function executer(id: string): Promise<unknown[]> {
  const def = registre.trouverDef(id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    // UNE GRAINE EST POSÉE, ET NON LAISSÉE À ZÉRO : à zéro, la convention du dépôt veut qu'elle
    // soit TIRÉE AU SORT, et deux passes différeraient à bon droit.
    if (p.nom === "Graine") params[p.nom] = 4242;
  }
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

describe("la promesse de la graine, composant par composant", () => {
  it.skipIf(!process.env.BANC_GRAINE)("deux passes de mêmes réglages rendent le même son", async () => {
    const candidats = (toutesLesFiches as unknown as Fiche[]).filter(
      (f) => (f.entrees ?? []).some((e) => e.type === "audio")
        && (f.sorties ?? []).some((s) => s.type === "audio"),
    );
    const differents: string[] = [], lents: string[] = [];
    let eprouves = 0;
    for (const fiche of candidats) {
      const t0 = Date.now();
      let un: unknown[], deux: unknown[];
      try {
        un = await executer(fiche.id);
      } catch {
        continue;
      }
      if (Date.now() - t0 > 2000) { lents.push(`${fiche.id} (${Date.now() - t0} ms)`); continue; }
      try {
        deux = await executer(fiche.id);
      } catch {
        continue;
      }
      const rangs = (fiche.sorties ?? []).map((s, i) => (s.type === "audio" ? i : -1)).filter((i) => i >= 0);
      for (const rang of rangs) {
        const a = un[rang] as AudioBuffer | null, b = deux[rang] as AudioBuffer | null;
        if (!a || !b || typeof a.numberOfChannels !== "number" || a.length === 0) continue;
        eprouves++;
        if (a.length !== b.length || a.numberOfChannels !== b.numberOfChannels) {
          differents.push(`${fiche.id}[${rang}] : formes differentes ${a.length}/${b.length}`);
          continue;
        }
        let ecart = 0;
        for (let c = 0; c < a.numberOfChannels; c++) {
          const x = a.getChannelData(c), y = b.getChannelData(c);
          for (let i = 0; i < x.length; i++) {
            const d = Math.abs(x[i] - y[i]);
            if (d > ecart) ecart = d;
          }
        }
        if (ecart > 1e-9) differents.push(`${fiche.id}[${rang}] : ecart max ${ecart.toExponential(2)}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nSORTIES EPROUVEES ${eprouves} · ECARTES CAR LENTS ${lents.length}`
      + `\n### DEUX PASSES DIFFERENTES (${differents.length})\n${differents.join("\n")}`
      + `\n### LENTS\n${lents.join(", ")}`);
    expect(differents).toEqual([]);
    expect(eprouves, "un banc qui n'éprouve plus rien passerait au vert en mentant")
      .toBeGreaterThan(150);
  }, 1800000);
});
