// tests-e2e/ecart-reference-dans-application.spec.ts — « Écart à une référence » rend le même rapport par
// ses ouvriers que dans le fil.
//
// ═══ POURQUOI CETTE SPEC, ET NON LA BASE D'EMPREINTES ═══
//
// Le composant décrit ses deux sons hors du fil, par `workers/ecart-reference-worker.ts`. La base
// d'empreintes surveille les workers de calcul par le son qu'ils rendent, et celui-ci ne rend qu'un
// texte : `src/docs/couverture-empreintes.test.ts` l'accepte sur la preuve faite ici, et seulement si
// cette spec le nomme. C'est la règle décidée par Fabien le 2026-11-07.
//
// ═══ CE QU'ELLE COMPARE ═══
//
// LE MÊME COMPOSANT, DEUX FOIS, DANS LA MÊME PAGE : par ses ouvriers, puis sans constructeur `Worker`,
// ce qui le fait calculer dans le fil, comme en test unitaire. Le rapport et le message doivent être
// identiques à l'octet. Deux ouvriers doivent avoir été créés, un par son, et sous leur nom : un
// composant retombé dans le fil passerait la comparaison sans rien prouver.
//
// ET LA DESCRIPTION BRUTE EST COMPARÉE AUSSI, nombre par nombre. Le rapport arrondit : vu rouge sur une
// fréquence d'échantillonnage décalée d'un hertz dans l'ouvrier, il ne différait que par la ligne qui
// affiche cette fréquence, tous les autres écarts tombant sous la dernière décimale écrite. Vu rouge
// ensuite sur un seul échantillon des deux canaux déplacé d'un millionième dans l'ouvrier : le rapport
// était identique, et seule la description brute est tombée.
import { expect, test } from "@playwright/test";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5297);

test("Écart à une référence rend par ses ouvriers le rapport qu'il rend dans le fil", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(devUrl);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const urls: string[] = [];
    const Origine = window.Worker;
    class Espion extends Origine {
      constructor(u: string | URL, o?: WorkerOptions) { super(u, o); urls.push(String(u)); }
    }
    const { fiches } = await import("/src/plugins/ecart-reference.ts");
    const { accord, bruitRose } = await import("/src/audio/ecart-reference-essai.ts");
    const fiche = (fiches as any[]).find((f) => f.id === "ecart-reference");
    const tampon = (canaux: Float32Array[], fe: number) => {
      const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate: fe });
      canaux.forEach((c, i) => b.copyToChannel(c, i));
      return b;
    };
    const chord = accord([48, 60, 64, 67, 72], 6, 48000);
    const audio = tampon([bruitRose(6, 44100, 1), bruitRose(6, 44100, 2)], 44100);
    const reference = tampon([chord, chord], 48000);
    const ctx = {
      noeud: { id: "x", data: {} }, runtime: null, repertoireTravail: null,
      entree: (i: number) => [audio, reference][i] ?? null, entrees: () => [audio, reference],
      paramNombre: (_p: string, def: number) => def, paramTexte: (_p: string, def: string) => def,
      onProgress: () => {}, signal: new AbortController().signal,
    };
    const lire = async () => {
      const res = await fiche.executer(ctx);
      return { message: res.message as string, rapport: res.valeurs[0] as string };
    };
    (window as any).Worker = Espion;
    const parWorker = await lire();
    (window as any).Worker = undefined;
    const dansLeFil = await lire();
    (window as any).Worker = Origine;

    // La description brute : une carte devient la liste de ses paires, un tableau typé ses nombres.
    const { parUneFois } = await import("/src/plugins/hors-lot.ts");
    const { decrireDemande } = await import("/src/audio/ecart-reference-mesures.ts");
    const aplatir = (d: unknown) => JSON.stringify(d, (_k, v) =>
      v instanceof Map ? [...v.entries()] : ArrayBuffer.isView(v) ? Array.from(v as Float64Array) : v);
    const demande = { canaux: [audio.getChannelData(0), audio.getChannelData(1)], fe: audio.sampleRate };
    const brutParWorker = aplatir(await parUneFois(demande, {
      creerWorker: () => new Worker("/src/workers/ecart-reference-worker.ts", { type: "module" }),
      calcul: decrireDemande,
    }));
    const brutDansLeFil = aplatir(decrireDemande(demande));
    return { urls, parWorker, dansLeFil, brutParWorker, brutDansLeFil };
  });
  expect(r.urls.filter((u) => u.includes("ecart-reference-worker")), `workers créés : ${r.urls.join(", ")}`).toHaveLength(2);
  expect(r.parWorker.rapport.split("\n").length).toBeGreaterThan(40);
  expect(r.parWorker.message).toMatch(/ · DTW \d/);
  expect(r.dansLeFil).toEqual(r.parWorker);
  expect(r.brutParWorker.length).toBeGreaterThan(10000);
  expect(r.brutDansLeFil === r.brutParWorker, "la description brute diffère entre l'ouvrier et le fil").toBe(true);
});
