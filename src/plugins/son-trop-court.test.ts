// plugins/son-trop-court.test.ts — Un son trop court se fait dire, il ne fait pas fuir une erreur.
//
// LE DÉFAUT, relevé le 2026-10-22 en passant les 218 composants qui prennent de l'audio sur un son
// de soixante-quatre échantillons. Neuf levaient une erreur ; deux la disaient clairement — « la
// piste est trop courte pour prédire, besoin d'au moins 6 frames, trouvé 0 » — et **quatre
// laissaient remonter une phrase du constructeur d'AudioBuffer** : « Invalid length: 0 is less than
// or equal to minimum bound (0) ». En anglais, sans rapport avec le son, et sans rien dire de ce
// qu'il faudrait faire.
//
// CE QUE LA MESURE A DONNÉ. L'extracteur de SoundTouch travaille par blocs de 4 096 trames et n'en
// rend aucune tant qu'il n'en a pas assez : rien ne sort en dessous de **8 192 échantillons**
// d'entrée, quel que soit le tempo — 7 168 ne rend rien, 8 192 rend tout. Le tampon de sortie était
// alors construit avec une longueur nulle.
//
// LE RESTE DU RELEVÉ, pour qu'on ne le refasse pas : **aucun composant ne rend d'échantillon non
// fini** sur un son minuscule, et les trois autres erreurs levées viennent de l'environnement du
// banc — un modèle ONNX absent, un `Worker` qui n'existe pas sous Node.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";

const SR = 48000;

/** Soixante-quatre échantillons : plus court qu'une fenêtre d'analyse, et non vide. */
function minuscule(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: 64, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(64);
    for (let i = 0; i < 64; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 197 * (i / SR));
    b.getChannelData(c).set(x);
  }
  return b;
}

async function executer(id: string): Promise<unknown[]> {
  const def = registre.trouverDef(id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
  }
  const ent = (def.entrees ?? []).map((p) => (p.type === "audio" ? minuscule() : null));
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

describe("un son trop court pour l'étirement", () => {
  for (const id of ["soundtouch-tempo", "soundtouch-tonalite", "soundtouch-rate", "pitch-progressif"]) {
    it(`« ${id} » DIT QUE LE SON EST TROP COURT, et ne fait pas remonter autre chose`, async () => {
      let dit = "";
      try {
        await executer(id);
      } catch (e) {
        dit = String((e as Error).message);
      }
      expect(dit, `${id} doit lever quelque chose sur 64 echantillons`).not.toBe("");
      expect(dit, `message rendu : ${dit}`).toMatch(/trop court/i);
      expect(dit, "la phrase du constructeur ne doit plus remonter").not.toMatch(/Invalid length/i);
    }, 60000);
  }
});
