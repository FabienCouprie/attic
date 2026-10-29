// tests-e2e/messages-anglais.spec.ts — Ce qu'un composant dit en fin d'exécution, dans l'interface
// anglaise.
//
// POURQUOI CE BALAYAGE EXISTE. Le 2026-10-29, en filmant la présentation anglaise d'Attic, deux
// messages sont restés en français à l'écran : celui de la Groove Box, « C majeur · 15 neurones ·
// graine 4242 », et celui de Paulstretch, « 71,9 s · 8,0 × ». Le garde du registre anglais était
// vert, et il avait raison : il lit les fiches et le dictionnaire, et ces deux textes n'étaient ni
// l'un ni l'autre. Le premier est composé à l'exécution à partir des identifiants des réglages, le
// second écrit sa virgule décimale à la main. Un message composé ne se voit qu'en lançant le
// composant.
//
// CE QU'IL FAIT. Il lance chaque fiche du registre sur le banc de mesure, l'interface en anglais, et
// passe le message rendu et l'erreur levée au détecteur de `src/docs/detecteur-francais.ts`, le même
// que celui du registre. Une fiche à plusieurs entrées passe deux fois : avec sa seule première
// entrée nourrie, comme le banc le fait par défaut, puis avec toutes. Paulstretch ne dit « 8,0 à
// 12,0 × » que lorsqu'une courbe arrive sur sa seconde entrée.
//
// LE RELEVÉ SE DIT EN TROIS CLASSES, comme tout balayage du catalogue (`AGENTS.md`, section 6) :
// audio vers audio, audio sans sortie audio, et sans entrée audio.
//
// CE QU'IL NE VOIT PAS, et il faut le dire. Un composant qui refuse son entrée d'essai, ou qui
// demande un modèle absent ou l'application de bureau, rend son refus et non son message de
// réussite : ce message-là reste hors de portée, et le relevé compte combien de fiches sont dans ce
// cas. Les vues ne sont pas rendues sur le banc ; leur texte en dur est l'affaire de
// `src/docs/vues-anglais.test.ts`. Et le message d'avancement, que le nœud montre pendant le run,
// n'est pas relevé.
//
//   ANGLAIS=1 npm run messages-anglais
//   COMPOSANTS=boite-groove,paulstretch npm run messages-anglais
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import { francais, virguleDecimale } from "../src/docs/detecteur-francais";
import { mesurerComposant, type Mesure } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5272);

const DEMANDE = process.env.ANGLAIS === "1";
const COMPOSANTS = process.env.COMPOSANTS
  ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];

/**
 * Le délai accordé à une exécution. Au-delà, la page est jetée et le composant compté à part.
 *
 * UN COMPOSANT QUI NE REND PAS LA MAIN BLOQUERAIT TOUT LE BALAYAGE, et un seul suffit : un modèle
 * qui se télécharge, un worker qui attend. Le délai ne juge pas le composant, il protège le relevé.
 */
const DELAI_MS = 90_000;

type Classe = "audio vers audio" | "audio sans sortie audio" | "sans entrée audio";
const CLASSES: Classe[] = ["audio vers audio", "audio sans sortie audio", "sans entrée audio"];

interface Passe {
  id: string;
  classe: Classe;
  /** Les rangs d'entrée nourris. */
  rangs: number[];
  message: string | null;
  erreur: string | null;
  delaiDepasse: boolean;
}

/**
 * Les fiches dont le message est écrit par un modèle, et non par le composant.
 *
 * « Ollama (LLM local) » rend la réponse du modèle, qui reprend les mots de l'invite : le banc lui
 * passe l'invite par défaut française, et le modèle la cite (« First, "motif simple" means… »). Ce
 * n'est pas un texte de l'interface, et aucune traduction ne le changerait.
 */
const MESSAGE_ECRIT_PAR_UN_MODELE = new Set(["ollama-llm"]);

/** Ce que le détecteur reproche à un texte, ou `null`. */
function reproche(texte: string | null): string | null {
  if (!texte) return null;
  if (francais(texte)) return "mots français";
  if (virguleDecimale(texte)) return "virgule décimale";
  return null;
}

/** Une mesure bornée dans le temps. `null` quand le délai est dépassé. */
async function mesurerAvecDelai(page: Page, id: string, rangs: number[]): Promise<Mesure | null> {
  const mesure = mesurerComposant(page, devUrl, id, { entreesAudio: rangs });
  // La promesse abandonnée rejette quand la page est jetée : on l'éteint ici, sans quoi elle
  // remonterait comme une erreur du spec.
  mesure.catch(() => {});
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<null>((r) => { minuteur = setTimeout(() => r(null), DELAI_MS); });
  const m = await Promise.race([mesure, delai]);
  clearTimeout(minuteur);
  return m;
}

test.describe("messages en anglais", () => {
  test.setTimeout(10_800_000);

  test("en anglais, aucun composant ne rend de message en français", async ({ browser }) => {
    test.skip(!DEMANDE && COMPOSANTS.length === 0,
      "ANGLAIS=1 ou COMPOSANTS absents : ce balayage coûte des dizaines de minutes, il se lance.");

    const contexte = await browser.newContext();
    await contexte.addInitScript(() => localStorage.setItem("attic-lang", "en"));
    let page = await contexte.newPage();

    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 15000 });
    // LA LANGUE EST PROUVÉE AVANT TOUT RELEVÉ. Un balayage resté en français ne trouverait rien de
    // plus qu'un balayage juste, et passerait au vert pour la même raison.
    const langue = await page.evaluate(async () => (await import("/src/i18n.tsx")).langueCourante());
    expect(langue, "l'interface du banc doit être en anglais").toBe("en");

    const fiches = await page.evaluate(async () => {
      const idx = await import("/src/plugins/index.ts") as unknown as {
        toutesLesFiches: { id: string; entrees?: { type: string }[]; sorties?: { type: string }[] }[];
      };
      return idx.toutesLesFiches.map((f) => ({
        id: f.id,
        entrees: (f.entrees ?? []).length,
        entreeAudio: (f.entrees ?? []).some((p) => p.type === "audio"),
        sortieAudio: (f.sorties ?? []).some((p) => p.type === "audio"),
      })).sort((a, b) => a.id.localeCompare(b.id));
    });
    const aFaire = COMPOSANTS.length > 0 ? fiches.filter((f) => COMPOSANTS.includes(f.id)) : fiches;
    expect(aFaire.length, `COMPOSANTS ne nomme rien du registre : ${COMPOSANTS.join(", ")}`).toBeGreaterThan(0);

    const passes: Passe[] = [];
    for (const [i, f] of aFaire.entries()) {
      const classe: Classe = !f.entreeAudio ? "sans entrée audio"
        : f.sortieAudio ? "audio vers audio" : "audio sans sortie audio";
      const jeux = f.entrees > 1 ? [[0], Array.from({ length: f.entrees }, (_, k) => k)] : [[0]];
      for (const rangs of jeux) {
        const m = await mesurerAvecDelai(page, f.id, rangs);
        if (!m) {
          await page.close({ runBeforeUnload: false }).catch(() => {});
          page = await contexte.newPage();
        }
        passes.push({
          id: f.id, classe, rangs,
          message: m?.message ?? null, erreur: m?.erreur ?? null, delaiDepasse: !m,
        });
      }
      if ((i + 1) % 25 === 0 || i + 1 === aFaire.length) console.log(`${i + 1}/${aFaire.length} · dernier : ${f.id}`);
    }
    await contexte.close();

    const fautifs = passes.filter((p) => !MESSAGE_ECRIT_PAR_UN_MODELE.has(p.id)).flatMap((p) => [
      ...(reproche(p.message) ? [`${p.id} [${p.rangs.join(",")}] message, ${reproche(p.message)} : ${p.message}`] : []),
      ...(reproche(p.erreur) ? [`${p.id} [${p.rangs.join(",")}] erreur, ${reproche(p.erreur)} : ${p.erreur}`] : []),
    ]);

    // LE DÉNOMINATEUR, par classe : ce qui a été lancé, ce qui a rendu un message, ce qui a levé.
    const parClasse = CLASSES.map((c) => {
      const ids = new Set(aFaire.filter((f) => passes.some((p) => p.id === f.id && p.classe === c)).map((f) => f.id));
      const dans = passes.filter((p) => p.classe === c);
      return {
        classe: c,
        fiches: ids.size,
        passes: dans.length,
        avecMessage: dans.filter((p) => p.message).length,
        enErreur: dans.filter((p) => p.erreur).length,
        delaiDepasse: dans.filter((p) => p.delaiDepasse).length,
        // Ni message ni erreur : le composant n'a rien dit, et il n'y a rien à lire.
        muettes: dans.filter((p) => !p.message && !p.erreur && !p.delaiDepasse).length,
      };
    });
    writeFileSync("MESSAGES-ANGLAIS.json", `${JSON.stringify({ parClasse, fautifs, passes }, null, 2)}\n`, "utf8");
    console.log([
      "",
      ...parClasse.map((c) => `${c.classe.padEnd(24)} : ${c.fiches} fiches, ${c.passes} passes · ${c.avecMessage} messages · ${c.enErreur} erreurs · ${c.delaiDepasse} délais · ${c.muettes} muettes`),
      `en français              : ${fautifs.length}`,
      ...fautifs.map((l) => `  ${l.slice(0, 160)}`),
      "",
    ].join("\n"));

    // L'INSTRUMENT QUI MESURE SA PROPRE CÉCITÉ : sur le catalogue entier, un banc qui ne lirait plus
    // aucun message passerait au vert sans rien avoir relu.
    if (COMPOSANTS.length === 0) expect(passes.filter((p) => p.message).length).toBeGreaterThan(300);
    expect(fautifs, "messages d'exécution restés en français dans l'interface anglaise").toEqual([]);
  });
});
