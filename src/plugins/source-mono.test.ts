// plugins/source-mono.test.ts — Un composant qui ramène sa source à un canal les SOMME-t-il ?
//
// LE DÉFAUT QUE CE FICHIER GARDE FERMÉ. Trois composants prenaient leur source par
// `getChannelData(0)`, c'est-à-dire le seul canal gauche : d'une prise stéréo ordinaire, la moitié
// droite disparaissait, et rien ne le disait. Mesuré le 2026-10-22 avant la correction, sur un son
// posé UNIQUEMENT à droite : la sortie valait **exactement zéro**, pas atténuée, absente.
//
// POURQUOI LE TÉMOIN EST « LE MÊME SON À GAUCHE, PUIS À DROITE ». Un premier banc posait six
// fréquences sur six canaux et comparait leurs niveaux en sortie ; il laissait un résidu de 9 dB
// sur le déphasage, que j'ai failli prendre pour une perte restante. C'était le PEIGNE de l'effet :
// superposer des copies décalées ne traite pas 197 et 311 Hz à la même place. Le même son déplacé
// d'un canal à l'autre élimine cette explication, puisque la fréquence ne change pas.
//
// ET LE BANC PASSE PAR L'EXÉCUTEUR, non par le module. Une première écriture appelait elle-même la
// moyenne des canaux avant de passer le son au module : elle passait donc quoi que fasse le
// composant, et ne gardait rien. Défaut planté, elle ne tombait pas. C'est le chemin de l'usager
// qu'il faut éprouver, du réglage par défaut jusqu'au tampon rendu.
//
// CES TROIS COMPOSANTS RENDENT DE LA STÉRÉO, ET C'EST VOULU : le déphasage et le canon placent
// leurs voix à des endroits différents, le doppler fait passer la source devant l'auditeur. C'est
// la SOURCE qui doit être entière, pas la sortie qui doit être mono.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 48000;
const N = SR;
const F = 197;

/** Le même son, posé sur un seul canal d'une stéréo. */
function unCanal(canal: 0 | 1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * F * (i / SR));
  b.getChannelData(canal).set(x);
  return b;
}

/** L'amplitude à une fréquence précise, par Goertzel : pas besoin de tout un spectre. */
function amplitude(x: Float32Array, f: number): number {
  const k = (2 * Math.PI * f) / SR;
  const coef = 2 * Math.cos(k);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { s0 = x[i] + coef * s1 - s2; s2 = s1; s1 = s0; }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - coef * s1 * s2)) / x.length;
}

/** Le composant exécuté avec ses réglages déclarés, et le tampon qu'il rend. */
async function rendu(id: string, entree: AudioBuffer): Promise<AudioBuffer> {
  const def = registre.trouverDef(id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    // Les durées déclarées valent une minute : ce banc n'a pas besoin de les attendre.
    if (p.nom === "Durée" && typeof p.defaut === "number") params[p.nom] = 4;
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
  }
  const ent = (def.entrees ?? []).map((p) => (p.type === "audio" ? entree : null));
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
  const fiche = (toutesLesFiches as unknown as { id: string; sorties?: { type: string }[] }[])
    .find((f) => f.id === id)!;
  const rang = (fiche.sorties ?? []).findIndex((s) => s.type === "audio");
  return (r?.valeurs ?? [])[rang] as AudioBuffer;
}

const plusForte = (b: AudioBuffer) =>
  Math.max(...Array.from({ length: b.numberOfChannels }, (_, c) => amplitude(b.getChannelData(c), F)));

/** L'écart, en décibels, entre la sortie du son posé à droite et celle du son posé à gauche. */
async function ecartGaucheDroite(id: string): Promise<number> {
  const g = plusForte(await rendu(id, unCanal(0)));
  const d = plusForte(await rendu(id, unCanal(1)));
  expect(g, `${id} : le canal gauche doit au moins ressortir`).toBeGreaterThan(1e-6);
  return 20 * Math.log10((d + 1e-15) / g);
}

describe("un composant qui ramène sa source à un canal", () => {
  for (const [id, nom] of [
    ["dephasage-reich", "« Déphasage (Reich) »"],
    ["canon-nancarrow", "« Canon de tempo (Nancarrow) »"],
    ["doppler", "« Doppler »"],
  ] as const) {
    it(`${nom} ENTEND LA DROITE COMME LA GAUCHE`, async () => {
      const ecart = await ecartGaucheDroite(id);
      expect(Math.abs(ecart), `ecart mesure ${ecart.toFixed(1)} dB`).toBeLessThan(1);
    }, 120000);
  }

  it("ET LES TÉMOINS NE BOUGENT PAS, sans quoi l'instrument fabriquerait l'écart", async () => {
    // Trois composants dont on sait qu'ils somment déjà : s'ils dérivaient, c'est la mesure qu'il
    // faudrait reprendre et non eux.
    for (const id of ["haas", "echo", "chorus"]) {
      const ecart = await ecartGaucheDroite(id);
      expect(Math.abs(ecart), `${id} : ecart mesure ${ecart.toFixed(1)} dB`).toBeLessThan(1);
    }
  }, 120000);
});
