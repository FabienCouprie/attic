// docs/gammes-passe-profonde.test.ts — La passe profonde du banc des gammes.
//
// CE QUE LE GARDE RAPIDE NE VOIT PAS, et que celle-ci relève, sous `BANC_GAMMES_PROFOND=1`
// (`npm run controle-gammes-profond`, quelques dizaines de minutes ; `GAMMES_FICHES=a,b` la borne) :
//  - LES DOUZE CLÉS : sous chaque gamme offerte, à plusieurs graines, chaque clé de do à si, et la
//    transposition de chacune à sa voisine d'un demi-ton, si et do compris. Le garde rapide ne lance
//    que mi bémol et mi ;
//  - LES AUTRES RÉGLAGES À CHOIX : sous chaque valeur de chacun, sous trois gammes, l'appartenance et
//    les accords. C'est là que se cachait la triade parallèle du Color Looper, son mode par défaut,
//    « Mélodie », ne jouant aucun accord ;
//  - LE SON : pour chaque nœud qui rend aussi de l'audio, sous chaque gamme, la part de l'énergie des
//    partiels du son qu'expliquent les harmoniques des notes de son MIDI, contre un témoin, ce MIDI
//    décalé d'un demi-ton. Une synthèse qui jouerait une autre clé ou une autre gamme que son MIDI se
//    verrait là, quel que soit son timbre.
//
// ELLE ÉCRIT UN RELEVÉ, `GAMMES/profonde.md`, ou `GAMMES/profonde-bornee.md` quand elle est bornée, pour ne
// jamais écraser la passe entière, et ne fait tomber aucun cas : ce qu'elle trouve se juge,
// puis se répare ou se déclare.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { apparier, lancerSousGamme } from "../audio/gamme-banc-lancer";
import { lireSorties, type PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releveEnMarkdown, releverUneGamme, type ReleveDeGamme } from "../audio/gamme-banc-releve";
import { degresAttendus as degresDe, degresDesAccordsAttendus as degresDesAccords } from "../audio/gamme-banc-proprietes";
import { partExpliquee, picsParTrames, retardDuSon } from "../audio/gamme-banc-son";
import {
  ACCORDS_SUR_LES_DEGRES, APPARTENANCE_DECLAREE, HORS_DE_PORTEE, SANS_TRANSPOSITION, TENUS_AILLEURS, cleDeReglage, gammeSansEffet,
  reglagesLies,
} from "../audio/gamme-banc-inscriptions";
import { reglagesANomenclature } from "../plugins/nomenclatures";

type FicheDuBanc = FicheLancable & { sorties?: readonly PortDeSortie[] };
const fiche = (id: string) => registre.trouverDef(id) as unknown as FicheDuBanc | undefined;

async function lireNotation(texte: string): Promise<unknown> {
  const f = fiche("texte-vers-midi");
  return f ? (await lancerFiche(f, {}, { entrees: [texte] })).valeurs[1] : null;
}

const TONIQUES = Array.from({ length: 12 }, (_, i) => i);
const GRAINES = (process.env.GAMMES_GRAINES ?? "1,2,3").split(",").map(Number);
const BORNE = process.env.GAMMES_FICHES?.split(",").filter(Boolean);
/** Le relevé, sans extension : une passe bornée écrit à part, et la passe entière reste lisible. */
const RELEVE = BORNE ? "GAMMES/profonde-bornee" : "GAMMES/profonde";
/** Les trois gammes des croisements : la mineure, ses deux secondes augmentées, une pentatonique. */
const GAMMES_CROISEES = ["mineur", "mineur-harmonique", "pentatonique-mineure"];
/** Les réglages qui ne gouvernent pas les hauteurs : la synthèse, sans banque au banc de node. */
const NON_CROISES = new Set(["Synthèse"]);
/**
 * Au son, la part de l'énergie des partiels que le MIDI doit expliquer au moins. Une batterie n'a pas
 * de hauteur à expliquer : celle des Multi-réservoirs tient leur son à 74 %, sans aucun retard.
 */
const SEUIL_DU_SON = 0.6;

const { paires } = apparier(reglagesANomenclature());

/** Une faute d'un croisement, ou, `declare`, un croisement que la passe saute parce que la gamme y est déclarée sans effet. */
interface Croisement { reglage: string; valeur: string; gamme: string; faute: string; declare?: boolean }
/**
 * Ce que le son dit d'une gamme : LA PART DE L'ÉNERGIE DE SES PARTIELS QU'EXPLIQUENT LES HARMONIQUES
 * DES NOTES DE SON MIDI, et le témoin, la même part sous ce MIDI décalé d'un demi-ton vers le haut ou
 * vers le bas, la plus forte des deux. Un son qui joue son MIDI laisse bien moins d'inexpliqué que son
 * témoin ; un son qui jouerait une autre clé ou une autre gamme que lui en laisserait autant. Et LE
 * RETARD DU SON SUR SON MIDI, quand un MIDI déplacé dans le temps l'explique nettement mieux : un
 * fichier qui perd le silence de tête de sa pièce joue ses notes en avance sur son son. Le MIDI, lui,
 * est jugé dans la gamme par le volet des douze clés : le son qui le joue y est donc aussi.
 */
interface DuSon { gamme: string; part: number; temoin: number; retard?: { retard: number; part: number } }
/** Le son d'un nœud sous chaque gamme, et le nombre de gammes sous lesquelles son port audio n'a rien rendu. */
interface DuSons { parts: DuSon[]; sansTampon: number }
/**
 * Le son joue son MIDI quand il le joue à l'heure, quand le MIDI en explique au moins six dixièmes, et
 * quand CE QUI RESTE INEXPLIQUÉ vaut au plus la moitié de ce que le témoin laisse. Comparer les parts
 * expliquées ne suffisait pas : sous un MIDI dense, basse, accords et mélodie ensemble, et une gamme de
 * demi-tons voisins, le MIDI décalé retombe sur des notes jouées, et le témoin de la Groove Box montait
 * à 61 % sous la diminuée quand son son en expliquait 89.
 */
const joueSonMidi = (x: DuSon) => !x.retard && x.part >= SEUIL_DU_SON && 1 - x.part <= (1 - x.temoin) / 2;

describe.runIf(process.env.BANC_GAMMES_PROFOND === "1")("la passe profonde du banc des gammes", () => {
  it("relève les douze clés, les réglages croisés et le son", async () => {
    const t0 = performance.now();
    const eprouves = paires.filter((p) => !HORS_DE_PORTEE[cleDeReglage(p)] && !TENUS_AILLEURS[cleDeReglage(p)]
      && (!BORNE || BORNE.includes(p.fiche)));
    const cles: ReleveDeGamme[] = [];
    const croisements = new Map<string, Croisement[]>();
    const sons = new Map<string, DuSons>();
    const ecrire = () => {
      mkdirSync("GAMMES", { recursive: true });
      writeFileSync(`${RELEVE}.json`, JSON.stringify({ cles, croisements: [...croisements], sons: [...sons] }, null, 1));
      writeFileSync(`${RELEVE}.md`, rediger(cles, croisements, sons, (performance.now() - t0) / 1000));
    };
    for (const p of eprouves) {
      const f = fiche(p.fiche)!;
      const o = { ports: f.sorties ?? [], degresDe, degresDesAccords, lireNotation, sansAccords: !ACCORDS_SUR_LES_DEGRES.has(p.fiche) };
      const sansTransposition = SANS_TRANSPOSITION[cleDeReglage(p)];
      // LES DOUZE CLÉS.
      for (const gamme of p.ids) {
        cles.push(await releverUneGamme(f, p, gamme, {
          ...o, graines: GRAINES, toniques: TONIQUES, autres: reglagesLies(f, p, gamme), ...(sansTransposition ? { sansTransposition } : {}),
        }));
      }
      // LES RÉGLAGES CROISÉS.
      const fautes: Croisement[] = [];
      const autres = f.parametres.filter((x) => x.type === "choix" && x.nom !== p.gamme && x.nom !== p.tonique?.reglage
        && !NON_CROISES.has(x.nom) && (x.optionIds ?? x.options ?? []).length >= 2);
      for (const s of autres) {
        for (const v of (s.optionIds ?? s.options ?? []).map(String)) {
          const sansEffet = gammeSansEffet(p, s.nom, v);
          if (sansEffet) { fautes.push({ reglage: s.nom, valeur: v, gamme: "", faute: `non croisé, la gamme y est sans effet : ${sansEffet}`, declare: true }); continue; }
          for (const gamme of GAMMES_CROISEES.filter((g) => p.ids.includes(g))) {
            const r = await releverUneGamme(f, p, gamme, { ...o, graines: [1], toniques: [3], autres: { ...reglagesLies(f, p, gamme), [s.nom]: v } });
            const ici = { reglage: s.nom, valeur: v, gamme };
            if (r.echecs.length) fautes.push({ ...ici, faute: `échec : ${r.echecs.join(" ; ")}` });
            for (const so of r.sorties) {
              if (so.hors && !APPARTENANCE_DECLAREE[cleDeReglage(p)]) fautes.push({ ...ici, faute: `${so.sortie} : ${so.hors} notes hors gamme, dont ${so.exemplesHors.join(", ")}` });
              if (so.accordsFautifs.length) fautes.push({ ...ici, faute: `${so.sortie} : ${so.accordsFautifs.join(" ; ")}` });
            }
          }
        }
      }
      croisements.set(cleDeReglage(p), fautes);
      // LE SON, AU TIMBRE PAR DÉFAUT, celui qu'on entend en posant le nœud : le juge ne dépend pas du timbre.
      const rangAudio = (f.sorties ?? []).findIndex((s) => s.type === "audio");
      if (rangAudio >= 0) {
        const parts: DuSon[] = [];
        let sansTampon = 0;
        for (const gamme of p.ids) {
          const l = await lancerSousGamme(f, p, gamme, { graine: 1, demiTon: 3, autres: reglagesLies(f, p, gamme) });
          const buf = l.lancer?.valeurs[rangAudio];
          if (!(buf instanceof AudioBuffer)) { sansTampon++; continue; }
          // LES NOTES QUE LE NŒUD DIT JOUER, lues dans ses sorties du même lancer.
          const { lues } = await lireSorties(f.sorties ?? [], l.lancer!.valeurs, lireNotation);
          const notes = lues.flatMap((s) => s.hauteurs);
          if (!notes.length) continue;
          const trames = picsParTrames(buf);
          const temoin = Math.max(partExpliquee(trames, notes, { demiTons: 1 }), partExpliquee(trames, notes, { demiTons: -1 }));
          const retard = retardDuSon(trames, notes);
          parts.push({ gamme, part: partExpliquee(trames, notes), temoin, ...(retard ? { retard } : {}) });
        }
        sons.set(cleDeReglage(p), { parts, sansTampon });
      }
      ecrire();
    }
    ecrire();
    expect(cles.length).toBeGreaterThan(0);
  }, 12 * 3600_000);
});

function rediger(cles: readonly ReleveDeGamme[], croisements: Map<string, Croisement[]>, sons: Map<string, DuSons>, secondes: number): string {
  const l: string[] = [`# La passe profonde du banc des gammes`, ``,
    `${cles.length} gammes relevées sous les douze clés, graines ${GRAINES.join(", ")}, en ${Math.round(secondes)} s.`, ``,
    `## Les douze clés`, ``, releveEnMarkdown(cles), ``, `## Les réglages croisés, sous ${GAMMES_CROISEES.join(", ")}, en mi bémol`, ``];
  for (const [cle, tous] of croisements) {
    const fautes = tous.filter((x) => !x.declare), sautes = tous.filter((x) => x.declare);
    l.push(fautes.length ? `- **${cle}** : ${fautes.length} fautes` : `- ${cle} : rien`);
    for (const x of fautes.slice(0, 12)) l.push(`  - « ${x.reglage} » = ${x.valeur}, ${x.gamme} : ${x.faute}`);
    for (const x of sautes) l.push(`  - « ${x.reglage} » = ${x.valeur}, déclaré : ${x.faute}`);
  }
  l.push(``, `## Le son, en mi bémol : la part de ses partiels qu'expliquent les notes de son MIDI, contre le témoin décalé d'un demi-ton`, ``);
  const pc = (v: number) => `${(100 * v).toFixed(0)} %`;
  const faute = (x: DuSon) => x.retard
    ? `${x.gamme} (en retard de ${x.retard.retard.toFixed(2)} s sur son MIDI : ${pc(x.part)} à l'heure, ${pc(x.retard.part)} ainsi retardé)`
    : `${x.gamme} (${pc(x.part)}, témoin ${pc(x.temoin)})`;
  for (const [cle, { parts, sansTampon }] of sons) {
    if (!parts.length) {
      l.push(`- ${cle} : aucun son jugé${sansTampon ? `, son port audio n'ayant rendu aucun tampon sous ${sansTampon} gammes au banc` : ", aucune note lue à côté du son"}`);
      continue;
    }
    const fautes = parts.filter((x) => !joueSonMidi(x));
    const pire = parts.reduce<DuSon | undefined>((a, x) => (!a || x.part < a.part ? x : a), undefined);
    const temoinMax = Math.max(...parts.map((x) => x.temoin));
    l.push(`- ${cle} : ${fautes.length ? `**le son ne joue pas son MIDI** sous ${fautes.length} gammes sur ${parts.length} : ${fautes.slice(0, 6).map(faute).join(", ")}${fautes.length > 6 ? "…" : ""}` : `le son joue son MIDI sous les ${parts.length} gammes`}${pire ? ` ; part expliquée de ${pc(pire.part)} au moins, sous ${pire.gamme}, témoin de ${pc(temoinMax)} au plus` : ""}`);
  }
  return l.join("\n") + "\n";
}
