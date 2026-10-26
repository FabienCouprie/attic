// plugins/annulation-atteint-les-composants.test.ts — Un arrêt demandé arrête vraiment.
//
// ═══ LE DÉFAUT, ET SON CHIFFRE ═══
//
// Point 7 de deux revues critiques : « l'annulation n'atteint presque aucun composant ». Mesuré
// sur le catalogue, et c'est pire que l'impression : sur **478 exécuteurs**, DEUX lisent
// `signal.aborted` pour s'arrêter. Huit fichiers transmettent le signal à un sous-traitant qui
// l'honore ; tout le reste continue jusqu'au bout après un arrêt demandé.
//
// LE LEVIER EST `onProgress`, que 86 appels traversent déjà : le moteur le fait LEVER une fois le
// run annulé, et **74 exécuteurs** deviennent interruptibles d'un seul geste.
//
// ═══ CE QUE CE GARDE TIENT, ET POURQUOI IL EXISTE ═══
//
// Le levier ne vaut que si l'exception REMONTE. Un exécuteur qui attrape largement la changerait
// en erreur de nœud — l'utilisateur chercherait une panne là où il a seulement demandé l'arrêt.
// La mesure du 2026-10-26 a trouvé SEPT appels dans ce cas, dans quatre fichiers, et ZÉRO avalé en
// silence. Les sept sont réparés ; ce cas empêche le huitième.
//
// IL CHERCHE LA FORME ET NON LE NOM : on neutralise commentaires et littéraux avant de compter les
// accolades, sans quoi une accolade dans un gabarit ferait dériver tout le reste.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ErreurAnnulation, estAnnulation } from "../core/annulation";

const ICI = dirname(fileURLToPath(import.meta.url));

/** Remplace commentaires et littéraux par des blancs, en gardant les longueurs. */
function neutraliser(t: string): string {
  const out = t.split("");
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === "/" && t[i + 1] === "/") {
      let j = t.indexOf("\n", i);
      if (j < 0) j = t.length;
      for (let k = i; k < j; k++) out[k] = " ";
      i = j;
    } else if (c === "/" && t[i + 1] === "*") {
      let j = t.indexOf("*/", i + 2);
      j = j < 0 ? t.length : j + 2;
      for (let k = i; k < j; k++) if (t[k] !== "\n") out[k] = " ";
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < t.length) {
        if (t[j] === "\\") { j += 2; continue; }
        if (t[j] === c) { j += 1; break; }
        j += 1;
      }
      for (let k = i; k < Math.min(j, t.length); k++) if (t[k] !== "\n") out[k] = " ";
      i = j;
    } else i += 1;
  }
  return out.join("");
}

/** La position de l'accolade fermante qui apparie celle ouverte en `depart`. */
function fermante(code: string, depart: number): number {
  let prof = 0;
  for (let i = depart; i < code.length; i++) {
    if (code[i] === "{") prof += 1;
    else if (code[i] === "}" && --prof === 0) return i;
  }
  return code.length;
}

interface BlocTry { debut: number; fin: number; catchDebut: number; catchFin: number }

function blocsTry(code: string): BlocTry[] {
  const blocs: BlocTry[] = [];
  for (const m of code.matchAll(/\btry\s*\{/g)) {
    const debut = m.index! + m[0].length - 1;
    const fin = fermante(code, debut);
    const suite = code.slice(fin + 1, fin + 200);
    const mc = /^\s*catch\s*(\([^)]*\))?\s*\{/.exec(suite);
    if (!mc) { blocs.push({ debut, fin, catchDebut: -1, catchFin: -1 }); continue; }
    const catchDebut = fin + 1 + mc[0].length - 1;
    blocs.push({ debut, fin, catchDebut, catchFin: fermante(code, catchDebut) });
  }
  return blocs;
}

function sources(): { nom: string; code: string; brut: string }[] {
  return readdirSync(ICI)
    .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
    .map((n) => {
      const brut = readFileSync(join(ICI, n), "utf8");
      return { nom: n, code: neutraliser(brut), brut };
    });
}

/** Les appels à `onProgress` qu'un `catch` intercepterait, avec le verdict de ce `catch`. */
function appelsSousUnCatch(): { ou: string; relance: boolean }[] {
  const out: { ou: string; relance: boolean }[] = [];
  for (const { nom, code, brut } of sources()) {
    const blocs = blocsTry(code);
    for (const m of code.matchAll(/\bonProgress\s*\(/g)) {
      const p = m.index!;
      const enveloppe = blocs.filter((b) => b.debut < p && p < b.fin && b.catchDebut >= 0);
      if (enveloppe.length === 0) continue;
      const b = enveloppe.reduce((a, c) => (c.fin - c.debut < a.fin - a.debut ? c : a));
      const corps = code.slice(b.catchDebut, b.catchFin);
      const ligne = brut.slice(0, p).split("\n").length;
      out.push({ ou: `${nom}:${ligne}`, relance: /\bestAnnulation\b/.test(corps) || /\bthrow\b/.test(corps) });
    }
  }
  return out;
}

describe("l'annulation atteint les composants", () => {
  it("UNE ERREUR D'ANNULATION SE RECONNAÎT, et rien d'autre ne se fait passer pour elle", () => {
    expect(estAnnulation(new ErreurAnnulation())).toBe(true);
    expect(estAnnulation(new Error("panne"))).toBe(false);
    expect(estAnnulation({ attic: "autre chose" })).toBe(false);
    expect(estAnnulation(null)).toBe(false);
    expect(estAnnulation("texte")).toBe(false);
  });

  it("LE BANC TROUVE ASSEZ D'APPELS POUR AVOIR UN SENS, sans quoi il passerait au vert à vide", () => {
    // Un garde de conformité qui n'exerce plus rien passe au vert en silence. Le chiffre relevé le
    // 2026-10-26 est de dix appels sous un `catch` ; le plancher le tient loin de zéro.
    expect(appelsSousUnCatch().length).toBeGreaterThanOrEqual(8);
  });

  it("AUCUN CATCH NE CHANGE UNE ANNULATION EN ERREUR DE NŒUD", () => {
    // Sept appels étaient dans ce cas le 2026-10-26, dans quatre fichiers. Un `catch` qui rend
    // `erreur: true` sans relancer ferait chercher une panne là où l'on a demandé l'arrêt.
    const fautifs = appelsSousUnCatch().filter((a) => !a.relance).map((a) => a.ou);
    expect(fautifs, [
      "",
      "UN APPEL À `onProgress` EST SOUS UN `catch` QUI N'ÉPARGNE PAS L'ANNULATION.",
      "",
      "Depuis que `onProgress` lève après un arrêt demandé, ce `catch` changerait l'annulation en",
      "erreur de nœud : l'utilisateur chercherait une panne là où il a seulement cliqué « Arrêter ».",
      "",
      "Ajouter `if (estAnnulation(e)) throw e;` en tête du `catch`, comme les quatre autres.",
      "",
    ].join("\n")).toEqual([]);
  });
});
