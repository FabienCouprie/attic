// tests-e2e/comparer.spec.ts — COMPARER : le quatrième verbe, et la couche qui manquait.
//
// LA QUESTION QU'AUCUN VERBE NE SAVAIT PRENDRE. `décrire` projette un composant depuis le registre,
// `valider` refuse un graphe fautif, `mesurer` passe UN composant au banc. Devant huit
// réverbérations, la question posée n'est aucune des trois : c'est **laquelle, et pourquoi pas une
// autre**. Fabien a écrit cette comparaison trois fois à la main, un domaine à chaque fois.
//
// POURQUOI ELLE SE MESURE PLUTÔT QU'ELLE NE S'ÉCRIT. C'est le seul des quatre verbes dont la vérité
// n'est nulle part dans la source : le registre dit les ports et les réglages, il ne dit pas que
// l'une allonge le son trois fois et l'autre pas du tout. Ce qui n'est pas dérivable est tentant à
// ÉCRIRE — et une description tenue à la main à côté du dépôt vieillit sans que rien ne le dise. La
// base d'empreintes l'a fait ; les deux chemins de construction d'une banque de clavier l'ont fait
// quatre fois, dont une à cent trente cents. La sortie d'ici est donc une mesure rejouée.
//
//   FAMILLE=Réverbération npm run comparer
//   COMPOSANTS=echo,echo-ping-pong,delay-stereo npm run comparer
//   FAMILLE=Écho PARAMETRES='{"Mix":50}' npm run comparer
//
// LE MÊME SON D'ESSAI POUR TOUS, les réglages par défaut de chacun, et le banc avec ses cinq
// précautions — dont la page neuve entre deux mesures, sans quoi la quatrième mesure d'une famille
// de huit porterait la pression mémoire des trois précédentes. C'est l'erreur qui m'a fait publier
// `echo-ping-pong` à 1 629 ms pour 30 ms réels.
//
// CE QU'IL NE FAIT PAS : trancher. Il dit ce qui sépare et de combien, pas laquelle est la bonne.
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { DUREE_SEC, FREQUENCE, mesurerComposant, type Mesure } from "./banc-mesure";
import { serveurDeVerification } from "./serveur-de-developpement";
import { FAMILLES_EFFETS } from "../src/plugins/familles-palette";
import {
  rapport, type AxeChiffre, type Colonne, type LigneMesure,
} from "../src/docs/comparaison-familles";

const devUrl = serveurDeVerification(5238);

const FAMILLE = process.env.FAMILLE ?? "";
const COMPOSANTS = process.env.COMPOSANTS ? process.env.COMPOSANTS.split(",").map((s) => s.trim()).filter(Boolean) : [];
const PARAMETRES = process.env.PARAMETRES ? JSON.parse(process.env.PARAMETRES) : {};
const ENTREES = process.env.ENTREES ? process.env.ENTREES.split(",").map((s) => Number(s.trim())) : undefined;

/**
 * LES SEUILS, ET CHACUN SE JUSTIFIE. Ils décident de ce qui est annoncé comme une différence, et un
 * seuil trop bas ferait passer le bruit de mesure pour un résultat — ce qui est la façon la plus
 * sûre de rendre cette couche inutile.
 */
const AXES: AxeChiffre[] = [
  // Un dixième de la durée d'entrée : en deçà, c'est la queue d'un filtre, pas un allongement.
  { cle: "rapportDuree", libelle: "duree rendue", unite: "x l'entree", seuil: 0.1, decimales: 2 },
  // Trois décibels de sonie : l'écart à partir duquel on monte ou baisse le fader.
  { cle: "sonieLufs", libelle: "sonie", unite: "LUFS", seuil: 3 },
  // Un demi-ton de centroïde : en dessous, personne n'entend « plus clair ».
  { cle: "centroideDemiTons", libelle: "couleur", unite: "demi-tons", seuil: 1 },
  // Six décibels d'écart à l'entrée : le point où l'on dit « celui-ci transforme », et non « il
  // effleure ». C'est l'axe qui distingue un effet d'un passe-plat.
  { cle: "ecartEntreeDb", libelle: "ecart a l'entree", unite: "dB", seuil: 6 },
  // Deux dixièmes de corrélation : l'écart entre un mono et une stéréo qu'on entend s'ouvrir.
  { cle: "correlation", libelle: "correlation des canaux", unite: "", seuil: 0.2, decimales: 2 },
  // Vingt millisecondes d'attaque : la frontière de la percussion.
  { cle: "attaqueMs", libelle: "attaque", unite: "ms", seuil: 20, decimales: 0 },
  // Un facteur deux sur le temps de calcul, en millisecondes absolues : sous cent, on s'en moque.
  { cle: "ms", libelle: "calcul", unite: "ms", seuil: 100, decimales: 0 },
];

const ESPECES = [
  { cle: "masse", libelle: "masse" },
  { cle: "dynamique", libelle: "forme dynamique" },
];

const n = (v: number | null | undefined, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

const COLONNES: Colonne[] = [
  { titre: "composant", lire: (l) => l.id },
  { titre: "duree", lire: (l) => `${n(l.valeurs.secondes, 2)} s` },
  { titre: "sonie", lire: (l) => n(l.valeurs.sonieLufs) },
  { titre: "centroide", lire: (l) => `${n(l.valeurs.centroideHz, 0)} Hz` },
  { titre: "couleur", lire: (l) => `${n(l.valeurs.centroideDemiTons)} dt` },
  { titre: "ecart", lire: (l) => `${n(l.valeurs.ecartEntreeDb)} dB` },
  { titre: "correl", lire: (l) => n(l.valeurs.correlation, 2) },
  { titre: "masse", lire: (l) => l.especes?.masse ?? "—" },
  { titre: "dynamique", lire: (l) => l.especes?.dynamique ?? "—" },
  { titre: "calcul", lire: (l) => `${n(l.valeurs.ms, 0)} ms` },
];

/** Ce que le banc a rendu, mis dans la forme que la part pure attend. */
function enLigne(id: string, m: Mesure): LigneMesure {
  const d = m.descripteurs as (Record<string, number | string> | null);
  const erreurDesc = d && typeof d.erreurDescripteurs === "string" ? d.erreurDescripteurs : null;
  // UN COMPOSANT QUI N'A RENDU AUCUN AUDIO N'EST PAS COMPARABLE sur ces axes, et le dire vaut mieux
  // que d'aligner des tirets : c'est souvent qu'il lui manquait une entrée.
  const erreur = m.erreur ?? erreurDesc
    ?? (m.descripteurs ? null : "aucune sortie audio : ce composant ne se compare pas sur ce banc");
  return {
    id, erreur,
    valeurs: { ...(d ?? {}), ms: m.ms } as LigneMesure["valeurs"],
    especes: d ? { masse: String(d.masse ?? ""), dynamique: String(d.dynamique ?? "") } : {},
  };
}

test.describe("comparer", () => {
  test.setTimeout(1_800_000);

  test("une famille, mesuree sur le meme son d'essai", async ({ page }) => {
    const membres = COMPOSANTS.length > 0 ? COMPOSANTS : FAMILLES_EFFETS[FAMILLE];
    // SANS FAMILLE DÉSIGNÉE, CE CAS N'A RIEN À COMPARER : c'est un guichet, pas un garde. Il passe
    // donc en silence quand la passe complète le rencontre, comme `mesurer`.
    test.skip(!FAMILLE && COMPOSANTS.length === 0, "aucune FAMILLE ni COMPOSANTS : ce spec est un guichet, pas un garde.");

    expect(membres, [
      "",
      `Famille « ${FAMILLE} » inconnue. Les familles declarees :`,
      ...Object.keys(FAMILLES_EFFETS).map((f) => `  ${f}`),
      "",
    ].join("\n")).toBeTruthy();

    const lignes: LigneMesure[] = [];
    for (const id of membres) {
      const m = await mesurerComposant(page, devUrl, id, {
        parametres: PARAMETRES, entreesAudio: ENTREES, descripteurs: true,
      });
      lignes.push(enLigne(id, m));
    }

    const texte = rapport({
      titre: COMPOSANTS.length > 0 ? `${membres.length} composants compares` : `${FAMILLE} — ${membres.length} composants`,
      entete: `meme son d'essai : ${DUREE_SEC} s a ${FREQUENCE} Hz, deux canaux, deterministe`
        + `  ·  reglages par defaut de chacun`,
      lignes, axes: AXES, colonnes: COLONNES, especes: ESPECES,
    });

    // LE RAPPORT S'ÉCRIT AVANT LE VERDICT, comme pour `mesurer` : un refus l'interrompt, et c'est
    // justement le cas où l'on veut relire le detail sur le disque.
    writeFileSync("COMPARAISON.txt", `${texte}\n`, "utf8");
    console.log(`\n${texte}\n`);

    // LE VERDICT NE PORTE QUE SUR LA MESURABILITÉ, non sur ce qu'on a trouvé : comparer n'est pas
    // juger. Une famille dont AUCUN membre ne se mesure est en revanche une passe pour rien.
    expect(lignes.some((l) => !l.erreur), [
      "", "AUCUN des composants n'a pu etre mesure.", "", texte, "",
    ].join("\n")).toBe(true);
  });
});
