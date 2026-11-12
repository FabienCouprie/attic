// plugins/fiche.test.ts — Une fiche ne lit que les réglages qu'elle déclare, et le compilateur y veille.
//
// POURQUOI CE GARDE, et c'est la pièce 1 de `work/plan-reglages-par-nom-2026-11-11.md`. Un réglage se
// lit par son libellé, et rien ne tenait ce libellé à ceux que la fiche déclare : un nom mal écrit,
// ou un réglage renommé dans sa fiche, retombait sans un mot sur le défaut de l'appel. `fiche()`, de
// `plugins/fiche.ts`, déduit les noms de la fiche et en type l'exécuteur ; ce garde tient le reste.
//
// CE QUE LE COMPILATEUR NE PEUT PAS DIRE, ET QUE CE GARDE DIT :
//   · une fiche écrite sans `fiche()` échappe à la vérification, sans erreur nulle part ;
//   · une fiche passée par `ficheSansNomsVerifies` lit tout nom, et la liste de ces fiches ne doit
//     que rétrécir ;
//   · un ancien réglage qui serait encore vivant, ou hérité par un réglage vivant, ne serait jamais
//     lu sous son nom.
//
// ET CE QUE LE COMPILATEUR DIT, CE GARDE LE PROUVE, par trois témoins écrits sous `@ts-expect-error`
// et que `tsc -b` lit avec les tests : si la vérification tombait, l'affirmation inutile ferait
// tomber le build.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import type { ParametreDef } from "../core";
import { fiche, ficheSansNomsVerifies } from "./fiche";
import { toutesLesFiches } from "./index";

const DOSSIER = resolve(__dirname);

/**
 * LES FICHES DONT LES NOMS NE SE DÉDUISENT PAS ENCORE, relevées le 2026-11-11 quand ce garde est né.
 *
 * ELLE NE PEUT QUE DÉCROÎTRE. Leur liste de réglages mêle des réglages partagés ou construits à ceux
 * écrits sur place, et leurs noms s'élargissent à `string` : c'est la pièce 2 du plan. Une fiche qui
 * retrouve des noms déduits en sort ; une fiche neuve n'y entre pas, elle écrit ses réglages.
 */
const SANS_NOMS_VERIFIES: Record<string, string[]> = {
  "abc-reprise.ts": ["reprise-abc"],
  "abc-vers-midi.ts": ["abc-vers-midi"],
  "accord-mets.ts": ["accord-mets-musique"],
  "accords-joues.ts": ["accords-joues"],
  "aligner-texte.ts": ["aligner-texte"],
  "analyse.ts": ["transcripteur-midi"],
  "arc-en-ciel.ts": ["arc-en-ciel-acoustique"],
  "automate-cellulaire.ts": ["automate-cellulaire"],
  "bruitage-ia.ts": ["bruitage-ia"],
  "bytebeat.ts": ["bytebeat"],
  "camelot.ts": ["camelot"],
  "cercle-pulsant.ts": ["cercle-pulsant"],
  "chanson-accompagnement.ts": ["accompagner-voix"],
  "chanson-locale.ts": ["planifier-chanson", "rendre-chanson"],
  "chanson-variantes.ts": ["reprendre-chanson", "retoucher-chanson", "prolonger-chanson", "ecrire-chanson"],
  "clavier-apprentissage.ts": ["clavier-apprentissage"],
  "cloner-voix.ts": ["cloner-voix"],
  "collections.ts": ["collection-midi-vers-mp3"],
  "color-looper.ts": ["color-looper"],
  "concret.ts": ["resonateurs"],
  "continuation-spectrale.ts": ["continuation-spectrale-ar", "continuation-spectrale-lstm"],
  "convertir-voix.ts": ["convertir-voix"],
  "csound-partition.ts": ["partition-csound"],
  "csound.ts": [
    "csound", "csound-instrument", "csound-effet", "csound-instruments-physiques", "csound-spectral",
  ],
  "dater-les-mots.ts": ["dater-les-mots"],
  "decrire-audio.ts": ["decrire-audio"],
  "deplacement.ts": ["ducking", "ambisonique"],
  "dessin-sonore.ts": ["dessin-sonore"],
  "effets-cresson.ts": ["echo-flottant", "ubiquite", "vague", "creneau"],
  "effets-midi.ts": [
    "motif-imposer-rythme", "motif-echo-notes", "motif-eclaircir", "motif-retrograde",
    "motif-repeter-tourner", "markov-midi", "temperament", "transposeur-quantiseur-midi", "arpegiateur-midi",
  ],
  "effets-modulation.ts": ["spatialisation-stereo"],
  "effets-rotatifs.ts": ["tremolo-harmonique", "haut-parleur-rotatif"],
  "effets-temporel.ts": ["wahwah", "phaser", "beat-repeat"],
  "effets.ts": ["gate-expandeur", "vocoder"],
  "egaliseur-parametrique.ts": ["egaliseur-parametrique"],
  "entrees.ts": ["capture-midi", "generateur-musical"],
  "fdn.ts": ["reverbe-reseau"],
  "finitions.ts": ["reverbe-hachee", "shimmer"],
  "fm-operateurs.ts": ["fm-six-operateurs"],
  "gamme-jouee.ts": ["gamme-jouee"],
  "generateurs-echantillons.ts": ["boite-groove"],
  "generateurs-fractals.ts": ["generateur-fractal", "mappeur-mandelbrot", "arpege-koch"],
  "generateurs-reservoirs.ts": ["reservoir-musical", "multi-reservoirs"],
  "generateurs-rythme.ts": ["l-systeme"],
  "generateurs-sources.ts": ["clavier-melodie", "sampler-personnalise"],
  "generateurs.ts": ["generateur-accords", "melodie-aleatoire"],
  "glissando-de-gamme.ts": ["glissando-de-gamme"],
  "glissando-harmonique.ts": ["glissando-harmonique"],
  "granulation-ecologique.ts": ["granulation-ecologique"],
  "isoler-voix.ts": ["isoler-voix"],
  "magenta.ts": [
    "magenta-drums", "magenta-continuation", "magenta-improvisation", "magenta-generer-melodie",
    "magenta-interpoler-midi", "magenta-generer-batterie", "magenta-humaniser-groove",
  ],
  "maquette.ts": ["maquette"],
  "matrice-parametres.ts": ["matrice-parametres"],
  "micromontage.ts": ["micromontage"],
  "montage-video.ts": ["montage-video"],
  "multicanal.ts": ["spatialiseur", "objet-sonore"],
  "objets-sonores.ts": ["montage"],
  "palette-harmonique.ts": ["palette-harmonique"],
  "parfum.ts": ["parfum-motif"],
  "qui-parle-quand.ts": ["qui-parle-quand"],
  "restaurer-compresse.ts": ["restaurer-compresse"],
  "retard-granulaire.ts": ["retard-granulaire"],
  "retard-spectral.ts": ["retard-spectral"],
  "sequence.ts": ["rendu-sequence"],
  "sequenceurs.ts": ["sequenceur-melodique", "sequenceur-accords"],
  "solveur-contraintes.ts": ["solveur-contraintes"],
  "sorties.ts": ["sortie-midi", "lecteur-midi", "point-ecoute-midi"],
  "spectral-cdp.ts": ["peignes-accordes"],
  "spectral-wishart.ts": ["tracage-spectral", "flou-spectral", "gel-spectral", "glissando-interieur"],
  "spectrogramme-image.ts": ["son-spectrogramme", "spectrogramme-image", "image-spectrogramme"],
  "spirale-quintes.ts": ["spirale-quintes"],
  "suites-entieres.ts": ["suites-entieres"],
  "table-onde.ts": ["oscillateur-table-onde"],
  "texte-image-moss.ts": ["texte-image-moss"],
  "texte-image.ts": ["texte-image"],
  "texte-vers-midi.ts": ["texte-vers-midi"],
  "theorie-avancee.ts": ["tonnetz", "canon-pavage", "serie-infinie"],
  "theorie-composition.ts": ["serie-dodecaphonique", "harmonie-negative", "voicings-accords"],
  "transcription-midi.ts": ["transcription-midi"],
  "transcrire.ts": ["transcrire"],
  "velours.ts": ["reverberation-velours"],
  "vitesse-midi.ts": ["vitesse-midi"],
  "vosim.ts": ["vosim"],
};

const nomDePropriete = (p: ts.ObjectLiteralElementLike) =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;

/** L'`id` d'une fiche écrite sur place : un littéral d'objet qui porte un `id`, des réglages et un exécuteur. */
function idDeFiche(n: ts.Node): string | null {
  if (!ts.isObjectLiteralExpression(n)) return null;
  const noms = new Map(n.properties.map((p) => [nomDePropriete(p), p]));
  const id = noms.get("id");
  if (!id || !noms.has("executer") || !noms.has("parametres")) return null;
  return ts.isPropertyAssignment(id) && ts.isStringLiteral(id.initializer) ? id.initializer.text : null;
}

/** Les fiches de chaque fichier de greffons, rangées par la fonction qui les enveloppe. */
function fichesEcrites() {
  const nues: string[] = [];
  const sansNoms: Record<string, string[]> = {};
  let verifiees = 0;
  for (const nom of readdirSync(DOSSIER).sort()) {
    if (!nom.endsWith(".ts") || nom.includes(".test.") || nom === "fiche.ts") continue;
    const sf = ts.createSourceFile(nom, readFileSync(join(DOSSIER, nom), "utf8"), ts.ScriptTarget.Latest, true);
    const visiter = (n: ts.Node) => {
      const id = idDeFiche(n);
      if (id) {
        const p = n.parent;
        const par = ts.isCallExpression(p) && ts.isIdentifier(p.expression) ? p.expression.text : null;
        if (par === "fiche") verifiees++;
        else if (par === "ficheSansNomsVerifies") (sansNoms[nom] ??= []).push(id);
        else nues.push(`${nom} : ${id}`);
      }
      ts.forEachChild(n, visiter);
    };
    visiter(sf);
  }
  return { nues, sansNoms, verifiees };
}

const ECRITES = fichesEcrites();

describe("une fiche ne lit que les réglages qu'elle déclare", () => {
  it("le garde lit les fiches des greffons, sans quoi il ne dirait rien", () => {
    // 334 vérifiées et 134 sans noms vérifiés le 2026-11-11, sur 511 fiches au registre.
    expect(ECRITES.verifiees).toBeGreaterThanOrEqual(300);
  });

  it("CHAQUE FICHE ÉCRITE SUR PLACE PASSE PAR fiche() : une fiche nue échappe à la vérification", () => {
    expect(ECRITES.nues, [
      "Enveloppez la fiche dans fiche({...}), de plugins/fiche.ts : sans lui, ses noms de réglage",
      "s'élargissent à string, et une faute de frappe dans une lecture retombe sans un mot sur le défaut.",
    ].join("\n")).toEqual([]);
  });

  it("LES FICHES SANS NOMS VÉRIFIÉS SONT CELLES DE LA LISTE, et la liste ne fait que rétrécir", () => {
    const attendues = Object.entries(SANS_NOMS_VERIFIES).flatMap(([f, ids]) => ids.map((id) => `${f} : ${id}`));
    const trouvees = Object.entries(ECRITES.sansNoms).flatMap(([f, ids]) => ids.map((id) => `${f} : ${id}`));
    expect({
      enTrop: trouvees.filter((x) => !attendues.includes(x)),
      sortiesDeLaListe: attendues.filter((x) => !trouvees.includes(x)),
    }, [
      "enTrop : une fiche de plus lit ses réglages sans vérification. Écrivez ses réglages sur place,",
      "ou typez la liste partagée, pour que fiche() en déduise les noms.",
      "sortiesDeLaListe : la fiche passe désormais par fiche(), ou n'existe plus ; retirez-la de la liste.",
    ].join("\n")).toEqual({ enTrop: [], sortiesDeLaListe: [] });
  });

  it("UN ANCIEN RÉGLAGE N'EST NI VIVANT NI HÉRITÉ : sinon il ne serait jamais lu sous son nom", () => {
    const fautes: string[] = [];
    let anciens = 0;
    for (const f of toutesLesFiches) {
      const vivants = new Set(f.parametres.flatMap((p: ParametreDef) => [p.nom, ...(p.nomsHerites ?? [])]));
      for (const nom of f.anciensReglages ?? []) {
        anciens++;
        if (vivants.has(nom)) fautes.push(`${f.id} : « ${nom} » est encore un réglage, ou un nom hérité`);
      }
    }
    // « Fondu » du masque de zones et « Instrument » de la boîte à groove, le 2026-11-11.
    expect(anciens, "le garde doit voir les anciens réglages déclarés").toBeGreaterThanOrEqual(2);
    expect(fautes).toEqual([]);
  });

  it("LE COMPILATEUR REFUSE UN NOM QUE LA FICHE NE DÉCLARE PAS, et accepte ses anciens réglages", () => {
    // Les trois `@ts-expect-error` sont le témoin : `tsc -b` lit ce fichier, et une affirmation qui
    // n'attrape plus d'erreur fait elle-même tomber le build.
    const temoin = fiche({
      id: "temoin-des-noms", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [],
      parametres: [{ nom: "Gain", plage: [0, 2], pas: 0.1, defaut: 1 }],
      anciensReglages: ["Volume"],
      async executer(ctx) {
        ctx.paramNombre("Gain", 1);
        ctx.paramNombre("Volume", 1);
        // @ts-expect-error « Gian » n'est pas un réglage de la fiche.
        ctx.paramNombre("Gian", 1);
        return { valeurs: [] };
      },
    });
    const sansReglage = fiche({
      id: "temoin-sans-reglage", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [], parametres: [],
      async executer(ctx) {
        // @ts-expect-error une fiche sans réglage n'en lit aucun.
        ctx.paramTexte("Gain", "");
        return { valeurs: [] };
      },
    });
    const partages: ParametreDef[] = [{ nom: "Gain", defaut: 1 }];
    const refusee = fiche({
      id: "temoin-noms-elargis", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [],
      // @ts-expect-error une liste dont les noms ne se déduisent pas est refusée par fiche().
      parametres: partages,
      async executer() { return { valeurs: [] }; },
    });
    const libre = ficheSansNomsVerifies({
      id: "temoin-libre", nom: "Témoin", univers: "Essai", famille: "Essai", resume: "Témoin.",
      entrees: [], sorties: [], parametres: partages,
      async executer(ctx) { ctx.paramNombre("Gian", 1); return { valeurs: [] }; },
    });
    // À l'exécution, les deux fonctions rendent la fiche telle quelle.
    expect([temoin.id, sansReglage.id, refusee.id, libre.id])
      .toEqual(["temoin-des-noms", "temoin-sans-reglage", "temoin-noms-elargis", "temoin-libre"]);
  });
});
