// tests-e2e/graines-tenues.spec.ts — Une graine déclarée tient, et c'est le SON qui le dit.
//
// POURQUOI CE GARDE, ET IL A UN PRÉCÉDENT PRÉCIS. `src/docs/contrat-graines.test.ts` tient déjà
// huit cas sur les graines : le rôle est déclaré plutôt que devine du libellé, la plage monte
// jusqu'à la graine tirée, elle descend jusqu'à la valeur qui demande un tirage, et le moteur la
// résout de façon idempotente. TOUS SONT STRUCTURELS. Aucun ne lance le composant.
//
// ET C'EST PAR LÀ QUE « BOÎTE À GROOVE » EST PASSÉE. Sa déclaration était juste, le moteur lui
// passait bien la graine, son message annonçait « graine 4242 » — et deux passes rendaient
// `0.172357839` puis `0.170609203`. Sa génération MIDI était semée ; son rendu de batterie ne
// l'était pas, Tone tirant au hasard le décalage de départ de chaque frappe dans son tampon de
// bruit. Huit cas verts, et le son changeait à chaque run.
//
// C'est la même leçon que celle des cent trente cents : UN GARDE QUI MESURE LA DÉCLARATION NE
// MESURE PAS LE SON. Celui-ci lance chaque composant à graine fixée DEUX FOIS, et compare ce qu'il
// entend.
//
//   npm run graines
//   COMPOSANTS=boite-groove,markov-midi npm run graines
//
// LA LISTE VIENT DU REGISTRE, par le rôle `graine: true` — jamais du libellé. Un garde qui
// reconnaîtrait une graine à son nom serait le même garde que celui qui a laissé passer cinq tables
// de gammes : il marcherait jusqu'au premier composant qui l'appelle autrement.
//
// ET LA VALEUR EST PRISE DANS LA PLAGE DU RÉGLAGE, non écrite en dur : une graine hors bornes serait
// ramenée par le moteur, et deux composants seraient alors semés différemment sans qu'on le sache.
import { expect, test } from "@playwright/test";

import { mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5244);

const COMPOSANTS = process.env.COMPOSANTS
  ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];

/**
 * La graine qu'on impose, quand la plage du réglage l'accepte.
 *
 * 4242 EST CELLE DU DÉFAUT FONDATEUR, celui de « Boîte à groove ». La garder rend ce garde
 * comparable à la mesure qui l'a motivé.
 */
const GRAINE_VOULUE = 4242;

interface Semee {
  id: string;
  nom: string;
  reglage: string;
  graine: number;
  /** Les empreintes des deux passes, et le message de chacune. */
  a: { empreintes: (string | null)[]; message: string | null };
  b: { empreintes: (string | null)[]; message: string | null };
}

test.describe("les graines tenues", () => {
  // Soixante-treize composants, deux passes chacun, une page neuve par passe : cela se compte en
  // minutes. C'est un garde qu'on lance, comme la base des empreintes.
  test.setTimeout(3_600_000);

  test("a graine fixee, un composant rend deux fois le meme son", async ({ page }) => {
    await page.goto(devUrl);
    await page.waitForSelector(".attic-app", { timeout: 15000 });
    // LE REGISTRE EST LU DANS LA PAGE, comme le fait le catalogue : une liste écrite ici vieillirait
    // sans que rien ne le dise, et un composant semé de plus arriverait hors de ce garde.
    const fiches = await page.evaluate(async () => {
      const idx = await import("/src/plugins/index.ts") as unknown as {
        toutesLesFiches: {
          id: string; nom: string;
          parametres?: { nom: string; graine?: true; plage?: [number, number] }[];
        }[];
      };
      return idx.toutesLesFiches
        .map((f) => {
          const p = (f.parametres ?? []).find((q) => q.graine === true);
          return p ? { id: f.id, nom: f.nom, reglage: p.nom, plage: p.plage ?? null } : null;
        })
        .filter((x): x is { id: string; nom: string; reglage: string; plage: [number, number] | null } => x !== null)
        .sort((a, b) => a.id.localeCompare(b.id));
    });

    const aFaire = COMPOSANTS.length > 0 ? fiches.filter((f) => COMPOSANTS.includes(f.id)) : fiches;
    expect(aFaire.length, [
      "Aucun composant à graine trouvé au registre.",
      "Ce garde lit le rôle `graine: true`, et `src/docs/contrat-graines.test.ts` tient qu'il existe.",
    ].join("\n")).toBeGreaterThan(0);

    const semees: Semee[] = [];
    const infideles: string[] = [];
    const sansAudio: string[] = [];
    const fautifs: string[] = [];

    for (const [i, f] of aFaire.entries()) {
      // LA GRAINE RESTE DANS LA PLAGE DU RÉGLAGE : hors bornes, le moteur la ramènerait, et deux
      // composants seraient semés différemment sans qu'on le sache.
      const graine = f.plage
        ? Math.min(Math.max(GRAINE_VOULUE, Math.max(1, f.plage[0])), f.plage[1])
        : GRAINE_VOULUE;
      const reglages = { [f.reglage]: graine };
      const a = await mesurerComposant(page, devUrl, f.id, { parametres: reglages });
      const b = await mesurerComposant(page, devUrl, f.id, { parametres: reglages });

      if (a.erreur || b.erreur) {
        // UN COMPOSANT QUI LÈVE N'EST PAS UNE GRAINE INFIDÈLE : il demande un modèle absent ou
        // l'application de bureau, et le dire vaut mieux que de le compter comme une faute de graine.
        fautifs.push(`${f.id} : ${(a.erreur ?? b.erreur ?? "").slice(0, 90)}`);
        continue;
      }
      const sonores = a.empreintes.filter((e) => e !== null);
      if (sonores.length === 0) {
        // SANS SORTIE AUDIO, IL N'Y A RIEN À COMPARER ici. Le composant peut être parfaitement semé
        // sur une sortie de texte ou de séquence ; ce garde ne regarde que le son, et le dit.
        sansAudio.push(f.id);
        continue;
      }
      const s: Semee = {
        id: f.id, nom: f.nom, reglage: f.reglage, graine,
        a: { empreintes: a.empreintes, message: a.message },
        b: { empreintes: b.empreintes, message: b.message },
      };
      semees.push(s);
      if (a.empreintes.join("|") !== b.empreintes.join("|")) {
        infideles.push([
          `${f.id} · ${f.reglage} = ${graine}`,
          ...a.empreintes.map((e, r) => e === b.empreintes[r] ? null
            : `    sortie ${r} : ${e} puis ${b.empreintes[r]}`).filter(Boolean) as string[],
          a.message !== b.message ? `    message : « ${a.message} » puis « ${b.message} »` : null,
        ].filter(Boolean).join("\n"));
      }
      if ((i + 1) % 10 === 0 || i + 1 === aFaire.length) {
        console.log(`${i + 1}/${aFaire.length} · ${semees.length} comparé(s)`
          + ` · ${infideles.length} infidèle(s) · dernier : ${f.id}`);
      }
    }

    const resume = [
      "",
      `composants à graine  : ${aFaire.length}`,
      `comparés sur le son  : ${semees.length}`,
      `sans sortie audio    : ${sansAudio.length}`,
      `en erreur            : ${fautifs.length}`,
      "",
    ].join("\n");
    if (sansAudio.length) {
      console.log(["SANS SORTIE AUDIO, rien à comparer ici :", ...sansAudio.map((x) => `  ${x}`)].join("\n"));
    }
    if (fautifs.length) {
      console.log(["EN ERREUR, et ce n'est pas une faute de graine :",
        ...fautifs.map((x) => `  ${x}`)].join("\n"));
    }
    console.log(resume);

    // LE VERDICT PORTE SUR LA FIDÉLITÉ, ET SUR ELLE SEULE. Un composant qui lève ou qui ne rend pas
    // d'audio n'est pas en cause ici ; une graine déclarée qui ne tient pas l'est par définition,
    // puisque la convention du dépôt promet qu'un résultat réussi se rejoue.
    expect(infideles, [
      "",
      "UNE GRAINE DÉCLARÉE NE TIENT PAS : deux passes à la même graine rendent deux sons.",
      "",
      "C'est le défaut de « Boîte à groove », qui annonçait « graine 4242 » et rendait",
      "`0.172357839` puis `0.170609203` : sa génération était semée, son rendu ne l'était pas.",
      "Cherchez un tirage que la graine n'atteint pas — un `Math.random` dans une bibliothèque,",
      "un décalage choisi au rendu, un ordre de parcours dépendant du temps.",
      "",
      ...infideles,
      "",
    ].join("\n")).toEqual([]);
  });
});
