// tests-e2e/varier.spec.ts — VARIER : un composant, un réglage, plusieurs valeurs, et la DIFFÉRENCE.
//
// POURQUOI CE VERBE EXISTE, ET C'EST FABIEN QUI L'A FORMULÉ. « Ce qui est intéressant ce n'est pas
// un son, c'est une différence entre au moins deux. » Les six verbes précédents rendent des sons et
// des nombres ; aucun ne rend une différence À L'INTÉRIEUR d'un composant.
//
// `comparer` et `écouter` savent mettre côte à côte N composants DIFFÉRENTS sur la même entrée —
// mais leur `PARAMETRES` est un seul jeu de réglages appliqué à TOUS les membres. Un composant à
// trois valeurs d'un même curseur leur est donc hors d'atteinte.
//
// ET C'EST PAR CE TROU QU'UN DÉFAUT EST PASSÉ. « Déréverbération » ne faisait rien d'audible : son
// réglage unique était inerte sur toute sa course, et rien dans l'outillage ne mettait deux de ses
// valeurs l'une contre l'autre. Il a fallu que Fabien le SENTE, puis qu'un graphe de dix nœuds soit
// écrit à la main pour le voir — dix-sept secondes de mesure contre la durée de vie du composant.
//
//   COMPOSANT=dereverberation REGLAGE=Mémoire VALEURS=5,10,20 npm run varier
//   COMPOSANT=distorsion REGLAGE=Drive VALEURS=0,25,50,75,100 npm run varier
//   COMPOSANT=dereverberation REGLAGE=Mémoire VALEURS=5,20 SON=un/son/reverbere.wav npm run varier
//
// ═══ CE QU'IL REND, ET POURQUOI UN SEUL NOMBRE NE SUFFIT PAS ═══
//
// UN TABLEAU PAR TRANCHES, une ligne par demi-seconde et une colonne par valeur. Ce n'est pas une
// coquetterie : deux mesures fausses EN SENS CONTRAIRE ont été écrites avant celle-là, toutes deux
// sur une valeur efficace calculée d'un bloc. L'une annonçait 38 dB d'atténuation en moyennant du
// silence numérique ; l'autre, recadrée sur le début d'une queue décroissante où l'instant le plus
// fort domine tout, en annonçait moins d'un demi. La vérité était entre les deux, et seule la
// découpe en tranches pouvait la dire. Le calcul vit dans `audio/empreinte-wav.ts`, avec ses cas.
//
// ET LA DIFFÉRENCE EST CALCULÉE, non laissée à lire. Chaque colonne porte son écart à la PREMIÈRE
// valeur, tranche par tranche, et le relevé nomme la tranche où cet écart est le plus grand. C'est
// ce qu'on cherche quand on fait varier un réglage : non « combien vaut ceci », mais « qu'est-ce que
// cela change, et où ».
//
// ═══ CE QU'IL NE PEUT PAS FAIRE, ET IL FAUT LE SAVOIR AVANT DE L'EMPLOYER ═══
//
// UNE VARIATION N'EST VISIBLE QUE SUR UNE MATIÈRE QUE LE COMPOSANT PEUT TRAVAILLER. Sur le son de
// référence, qui est SEC, faire varier une déréverbération ne montre rien — on ne déréverbère pas ce
// qui n'est pas réverbéré. C'est la même limite que celle du catalogue, où 89 composants restent
// muets faute de la matière qu'ils exigent. `SON=` est là pour cela.
//
// CE N'EST PAS UN GARDE : il ne refuse rien de ce qu'il entend, et ne tombe que si le composant
// lève ou si le réglage demandé n'existe pas.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { mesurerComposant } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";
import { niveauxParTranche } from "../src/audio/empreinte-wav";

const devUrl = serveurDeVerification(5243);
const ICI = dirname(fileURLToPath(import.meta.url));

/** Le répertoire des variations. Ignoré par git : un son se rejoue, il ne se garde pas. */
const DOSSIER = "VARIATION";

const COMPOSANT = process.env.COMPOSANT ?? "";
const REGLAGE = process.env.REGLAGE ?? "";
const VALEURS = process.env.VALEURS
  ? process.env.VALEURS.split(",").map((s) => s.trim()).filter(Boolean) : [];
const PARAMETRES = process.env.PARAMETRES ? JSON.parse(process.env.PARAMETRES) : {};
const ENTREES = process.env.ENTREES
  ? process.env.ENTREES.split(",").map((s) => Number(s.trim())) : undefined;
const TRANCHE = Number(process.env.TRANCHE ?? "0.5");
const BORNE_SEC = 6;
/** Le son de référence du catalogue par défaut, pour qu'une variation s'y raccroche. */
const SON = process.env.SON ?? join(ICI, "son-de-reference.wav");

/** Un nom de fichier sûr, et les accents se TRANSLITÈRENT au lieu de disparaître. */
const sain = (s: string) => s
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/^-+|-+$/g, "");

/** Une valeur de réglage telle que le banc l'attend : un nombre si c'en est un, sinon un texte. */
const valeurTypee = (v: string): string | number => {
  const n = Number(v);
  return v !== "" && Number.isFinite(n) ? n : v;
};

const db = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "  −∞");

interface Variante {
  valeur: string | number;
  fichier: string | null;
  secondesEntendues: number;
  secondesRendues: number;
  crete: number;
  message: string | null;
  tranches: number[];
}

test.describe("varier", () => {
  test.setTimeout(1_800_000);

  test("un reglage parcouru, et ce qu'il change tranche par tranche", async ({ page }) => {
    // SANS COMPOSANT NI RÉGLAGE NI VALEURS, CE CAS N'A RIEN À FAIRE VARIER : c'est un guichet, pas
    // un garde, et il traverse donc une passe complète sans la déranger — comme les six autres.
    test.skip(!COMPOSANT || !REGLAGE || VALEURS.length === 0,
      "COMPOSANT, REGLAGE et VALEURS sont requis : ce spec est un guichet, pas un garde.");

    expect(VALEURS.length, "une différence demande au moins deux valeurs").toBeGreaterThan(1);
    const sourceWav = readFileSync(isAbsolute(SON) ? SON : resolve(process.cwd(), SON)).toString("base64");

    const racine = join(DOSSIER, `${sain(COMPOSANT)}-${sain(REGLAGE)}`);
    // ON REPART D'UN DOSSIER VIDE : un clip d'une passe précédente qui survivrait à une valeur
    // devenue muette serait écouté comme s'il venait d'être rendu, et rien dans le son ne dirait sa
    // date ni la valeur qui l'a produit.
    rmSync(racine, { recursive: true, force: true });
    mkdirSync(racine, { recursive: true });

    const variantes: Variante[] = [];
    /**
     * L'ENTRÉE EST UNE COLONNE DU TABLEAU, et non seulement un fichier à côté.
     *
     * Un premier jet ne comparait les variantes qu'ENTRE ELLES : il disait ce que le réglage change,
     * jamais ce que le composant fait. Sur la déréverbération, les deux questions ont des réponses
     * différentes — le réglage déplace la queue de trente décibels, et le composant, lui, ne touche
     * pas au son direct. Les deux se lisent d'un coup ou pas du tout.
     */
    let tranchesEntree: number[] = [];
    let entreeEcrite = false;

    for (const brute of VALEURS) {
      const valeur = valeurTypee(brute);
      const m = await mesurerComposant(page, devUrl, COMPOSANT, {
        // LE RÉGLAGE PARCOURU PASSE APRÈS LES RÉGLAGES FIXES, pour qu'un `PARAMETRES` qui le
        // nommerait aussi ne puisse pas écraser la valeur qu'on fait varier — ce serait une passe
        // entière qui mesurerait la même chose N fois sans rien dire.
        parametres: { ...PARAMETRES, [REGLAGE]: valeur },
        entreesAudio: ENTREES, wav: true, wavBits: 32,
        sourceWav, wavMaxSec: BORNE_SEC,
      });
      expect(m.erreur, [
        `« ${COMPOSANT} » a levé à ${REGLAGE} = ${brute}.`,
        "CE N'EST PAS LE DÉPÔT QUI EST EN FAUTE, C'EST LE COMPOSANT MESURÉ.",
      ].join("\n")).toBeNull();

      const v: Variante = {
        valeur, fichier: null, secondesEntendues: 0, secondesRendues: 0,
        crete: 0, message: m.message, tranches: [],
      };
      for (const w of m.wavs) {
        const octets = Buffer.from(w.base64, "base64");
        if (w.rang === -1) {
          // LE SON D'ENTRÉE PART AVEC, UNE FOIS : on ne juge pas ce qu'un réglage change sans
          // entendre ce sur quoi il agit.
          if (!entreeEcrite) {
            writeFileSync(join(racine, "_entree.wav"), octets);
            const ab = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
            tranchesEntree = niveauxParTranche(ab as ArrayBuffer, TRANCHE).map((t) => t.db);
            entreeEcrite = true;
          }
          continue;
        }
        if (v.fichier) continue; // La première sortie audio suffit : c'est un réglage qu'on suit.
        const nom = `${sain(String(brute))}.wav`;
        writeFileSync(join(racine, nom), octets);
        const ab = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
        v.fichier = nom;
        v.secondesEntendues = Number(w.secondes.toFixed(3));
        v.secondesRendues = Number(w.secondesRendues.toFixed(3));
        v.crete = Number(w.crete.toFixed(6));
        v.tranches = niveauxParTranche(ab as ArrayBuffer, TRANCHE).map((t) => t.db);
      }
      variantes.push(v);
      console.log(`${REGLAGE} = ${String(brute).padEnd(8)} ${v.fichier ?? "(aucune sortie audio)"}`
        + (v.message ? ` · ${v.message.slice(0, 70)}` : ""));
    }

    // ─── LE TABLEAU, ET C'EST LUI QUI DIT LA DIFFÉRENCE ───
    const sonores = variantes.filter((v) => v.tranches.length > 0);
    const lignes: string[] = [
      `composant : ${COMPOSANT}`,
      `réglage   : ${REGLAGE} parcouru sur ${VALEURS.join(", ")}`,
      `entrée    : ${SON.replace(/\\/g, "/").split("/").pop()}`,
      `tranches  : ${TRANCHE} s, clips bornés à ${BORNE_SEC} s`,
      "",
    ];

    if (sonores.length < 2) {
      // DEUX VALEURS QUI NE RENDENT RIEN NE SE COMPARENT PAS, et le dire vaut mieux qu'un tableau
      // vide : c'est presque toujours que la matière ne convient pas au composant.
      lignes.push("MOINS DE DEUX VALEURS ONT RENDU DE L'AUDIO : il n'y a pas de différence à montrer.",
        "Un composant ne montre une variation que sur une matière qu'il peut travailler —",
        "une déréverbération sur un son sec ne change rien. Essayez `SON=`.");
    } else {
      const nbTranches = Math.max(tranchesEntree.length, ...sonores.map((v) => v.tranches.length));
      const ref = sonores[0];
      lignes.push(`   temps    entrée${sonores.map((v) => String(v.valeur).padStart(9)).join("")}`
        + `   ${sonores.map((v) => `Δ${String(v.valeur)}`.padStart(9)).join("")}`);
      for (let i = 0; i < nbTranches; i++) {
        const t = (i * TRANCHE).toFixed(1).padStart(6);
        const e = tranchesEntree[i];
        const niveaux = db(e ?? NaN).padStart(9)
          + sonores.map((v) => db(v.tranches[i] ?? NaN).padStart(9)).join("");
        // L'ÉCART EST PRIS SUR L'ENTRÉE, parce que c'est lui qui dit ce que le composant FAIT. Ce
        // que le réglage CHANGE se lit en comparant deux colonnes d'écart l'une à l'autre.
        const ecarts = sonores.map((v) => {
          const b = v.tranches[i];
          return (Number.isFinite(e) && Number.isFinite(b) ? (b - e).toFixed(1) : "  −").padStart(9);
        }).join("");
        lignes.push(`${t} s ${niveaux}   ${ecarts}`);
      }

      // ─── CE QUI SÉPARE LE PLUS, NOMMÉ PLUTÔT QUE LAISSÉ À CHERCHER ───
      // LE RÉSUMÉ NE CHERCHE QUE DANS CE QUI S'ENTEND, et j'ai dû le corriger après l'avoir écrit.
      //
      // Le premier jet prenait le plus grand écart sur TOUTES les tranches : sur la déréverbération
      // il annonçait « −40,0 dB à 3,5 s » pour les trois valeurs — une tranche où l'entrée est à
      // −214 dBFS, c'est-à-dire du silence. Le plus grand écart était donc dans la seule tranche
      // qu'on n'entend pas, et le résumé ne distinguait plus les trois réglages. C'est, pour la
      // troisième fois de la journée, un seul nombre pris sur un signal qui décroît.
      //
      // LE PLANCHER EST À SOIXANTE DÉCIBELS SOUS LA TRANCHE LA PLUS FORTE DE L'ENTRÉE, et ce n'est
      // pas un seuil de confort : c'est l'étendue dynamique conventionnelle au-delà de laquelle un
      // écart ne s'entend plus dans le contexte de ce son.
      const PLANCHER_DB = 60;
      const plusFort = Math.max(...tranchesEntree.filter(Number.isFinite), -Infinity);
      const audible = (i: number) => Number.isFinite(tranchesEntree[i])
        && tranchesEntree[i] >= plusFort - PLANCHER_DB;

      // DEUX QUESTIONS, DEUX RELEVÉS, et les confondre est précisément l'erreur à éviter.
      const plusGrandEcart = (a: number[], b: number[]) => {
        let pire = 0, quand = 0;
        for (let i = 0; i < nbTranches; i++) {
          if (!audible(i) || !Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue;
          if (Math.abs(b[i] - a[i]) > Math.abs(pire)) { pire = b[i] - a[i]; quand = i * TRANCHE; }
        }
        return { pire, quand };
      };
      const derniereAudible = [...Array(nbTranches).keys()].filter(audible).pop() ?? 0;
      lignes.push("", `ce qui s'entend va jusqu'à ${(derniereAudible * TRANCHE).toFixed(1)} s`
        + ` — soixante décibels sous la tranche la plus forte de l'entrée (${db(plusFort)} dB).`,
        "Les écarts ci-dessous ne sont cherchés que là.",
        "", "CE QUE LE COMPOSANT FAIT, écart le plus grand à l'entrée :");
      for (const v of sonores) {
        const { pire, quand } = plusGrandEcart(tranchesEntree, v.tranches);
        lignes.push(`  ${REGLAGE} = ${String(v.valeur).padEnd(8)} ${pire >= 0 ? "+" : ""}${pire.toFixed(1)} dB`
          + ` à ${quand.toFixed(1)} s · crête ${v.crete.toFixed(3)}`
          + (v.secondesRendues !== v.secondesEntendues
            ? ` · ${v.secondesEntendues} s entendues sur ${v.secondesRendues} rendues` : ""));
      }
      lignes.push("", `CE QUE LE RÉGLAGE CHANGE, écart le plus grand à « ${REGLAGE} = ${ref.valeur} » :`);
      for (const v of sonores.slice(1)) {
        const { pire, quand } = plusGrandEcart(ref.tranches, v.tranches);
        lignes.push(`  ${String(v.valeur).padEnd(10)} ${pire >= 0 ? "+" : ""}${pire.toFixed(1)} dB`
          + ` à ${quand.toFixed(1)} s`);
      }
      // UN RÉGLAGE INERTE SE DIT, parce que c'est le défaut qu'on vient de payer : « Déréverbération »
      // avait un curseur qui ne changeait presque rien sur toute sa course, et rien ne le signalait.
      //
      // ET IL FAUT DEUX STATISTIQUES POUR L'AFFIRMER, corrigé après l'avoir écrit avec une seule. Sur
      // « Réduction » parcouru de 0 à 100 sur un son sec, aucune tranche ne bougeait d'un dixième de
      // décibel — mais la CRÊTE passait de 0,284 à 0,340, soit 1,6 dB. Le réglage changeait donc le
      // son sans changer son énergie, ce qu'un traitement spectral fait couramment : annoncer « rien
      // ne change » sur la seule énergie était une affirmation plus large que la mesure.
      const dbRapport = (a: number, b: number) =>
        a > 0 && b > 0 ? Math.abs(20 * Math.log10(b / a)) : (a === b ? 0 : Infinity);
      const inerte = sonores.slice(1).every((v) =>
        Math.abs(plusGrandEcart(ref.tranches, v.tranches).pire) < 0.5
        && dbRapport(ref.crete, v.crete) < 0.5);
      if (inerte) {
        lignes.push("", `AUCUNE VALEUR NE CHANGE NI L'ÉNERGIE NI LA CRÊTE DE PLUS D'UN DEMI-DÉCIBEL :`,
          `« ${REGLAGE} » est inerte sur cette matière. Soit le réglage n'agit pas, soit l'entrée ne`,
          "lui donne rien à faire — une déréverbération sur un son sec ne change rien. Essayez `SON=`.");
      } else {
        // LA CRÊTE EST DITE À PART quand c'est elle seule qui bouge : un traitement spectral peut
        // redessiner la forme d'onde sans toucher à l'énergie, et le tableau par tranches n'en dit
        // alors rien du tout.
        const parLaCrete = sonores.slice(1).filter((v) =>
          Math.abs(plusGrandEcart(ref.tranches, v.tranches).pire) < 0.5
          && dbRapport(ref.crete, v.crete) >= 0.5);
        if (parLaCrete.length) {
          lignes.push("", "CES VALEURS NE CHANGENT QUE LA CRÊTE, pas l'énergie par tranche :",
            ...parLaCrete.map((v) => `  ${String(v.valeur).padEnd(10)} crête ${v.crete.toFixed(3)}`
              + ` contre ${ref.crete.toFixed(3)}, soit ${dbRapport(ref.crete, v.crete).toFixed(1)} dB`));
        }
      }
      const muettes = variantes.filter((v) => v.tranches.length === 0);
      if (muettes.length) {
        lignes.push("", "AUCUNE SORTIE AUDIO à ces valeurs :",
          ...muettes.map((v) => `  ${v.valeur}`));
      }
    }

    const rapport = lignes.join("\n");
    writeFileSync(join(racine, "variation.txt"), `${rapport}\n`, "utf8");
    writeFileSync(join(racine, "variation.json"), `${JSON.stringify({
      composant: COMPOSANT, reglage: REGLAGE, valeurs: VALEURS,
      entree: SON.replace(/\\/g, "/").split("/").pop(), trancheSec: TRANCHE, borneSec: BORNE_SEC,
      parametresFixes: PARAMETRES, variantes,
    }, null, 2)}\n`, "utf8");
    console.log(`\n${rapport}\n\nles fichiers sont dans ${racine}/\n`);
  });
});
