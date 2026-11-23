// plugins/verovio-outil.ts — Un moteur Verovio neuf, pour la gravure comme pour la lecture.
//
// SORTI DE `plugins/verovio.ts` le 2026-11-22, pour que « Lire une partition » charge Verovio par le
// même chemin que la gravure, et garde la même précaution.
//
// UN MODULE NEUF, ET NON UN TOOLKIT GARDÉ, revue des notations en texte, décision de Fabien du
// 2026-11-22. Verovio garde l'armure d'une partition ABC à la suivante, dans son module WebAssembly, en
// 6.3.0 comme en 6.4.1 : le moteur se chargeait une fois pour toutes, et après un air en do bémol,
// l'air en do se gravait avec huit altérations, une par note. Ni un toolkit neuf sur le même module, ni
// `resetOptions`, ni un MEI chargé entre deux airs ne réparaient la fuite. Un module coûte 103 ms.
//
// DEUX MODULES, ET HUMDRUM N'EST QUE DANS LE SECOND. `verovio/wasm` (7,3 Mo) ne porte pas le lecteur
// Humdrum : relevé le 2026-11-22, `loadData` y rend 0 sur un choral en `**kern` de Craig Sapp, et sa
// source ne contient aucune occurrence de `HumdrumInput`. `verovio/wasm-hum` (12,4 Mo) le lit : 229
// notes sur quatre portées. Le second ne se charge que quand on le demande.

let boites: Partial<Record<"base" | "humdrum", Promise<{ creerModule: () => Promise<unknown>; VerovioToolkit: new (m: unknown) => unknown }>>> = {};

/** Un toolkit neuf, sur le module qui lit Humdrum quand `humdrum` est vrai. */
export async function outilVerovio(humdrum = false): Promise<any> {
  const cle = humdrum ? "humdrum" : "base";
  if (!boites[cle]) {
    boites[cle] = (async () => {
      const [creerModule, { VerovioToolkit }] = await Promise.all([
        (humdrum ? import("verovio/wasm-hum") : import("verovio/wasm")).then((m: any) => m.default ?? m),
        import("verovio/esm") as Promise<any>,
      ]);
      return { creerModule, VerovioToolkit };
    })().catch((e) => { boites = { ...boites, [cle]: undefined }; throw e; });
  }
  const { creerModule, VerovioToolkit } = await boites[cle]!;
  return new VerovioToolkit(await creerModule());
}
