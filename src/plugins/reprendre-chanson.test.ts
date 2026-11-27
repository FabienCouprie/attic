// plugins/reprendre-chanson.test.ts — Les réglages « Départ sur l'audio » et « Dosage » de « Reprendre
// une chanson » disent ce que le moteur en fait, et arrivent au moteur tels qu'ils sont réglés.
//
// ═══ LE DOSAGE, ET POURQUOI SA VALEUR DOIT PARTIR TELLE QUELLE ═══
//
// Sa notice donne des seuils en valeurs du curseur (entre 0,2 et 0,25 sur « Rapide », entre 0,1 et 0,15
// sur « Base »), relevés le 2026-11-27 sur le moteur. Ils ne restent vrais que si la valeur du curseur
// devient `audio_cover_strength` sans conversion : une échelle glissée entre les deux déplacerait le
// seuil sous un texte resté le même.
//
// ═══ LE DÉFAUT QUE CE FICHIER EMPÊCHE ═══
//
// Le réglage s'appelait « Bruit », et sa notice disait « bruit mêlé à l'audio reçu ». Le moteur lit
// la même valeur, `cover_noise_strength`, comme la PROXIMITÉ du point de départ à la source :
// « 0 = pure noise, 1 = source » (`request.h` d'acestep.cpp, version épinglée `de858d8e`). Monter le
// curseur pour s'éloigner de l'original l'en rapprochait, jusqu'à la quasi-copie. Mesuré le 2026-11-27
// (`EXECUTION/reprise-proche/RAPPORT.md`) : motif spectral au même instant contre la source, 0,535 à
// zéro, 0,947 à un.
//
// LA RÉPARATION A CHANGÉ LE NOM ET LE TEXTE, PAS LA VALEUR. Les cas tiennent les trois pièces
// ensemble : la valeur part au moteur sans être retournée, le texte dit le sens du moteur, et un projet
// enregistré sous l'ancien nom rouvre avec sa valeur, par l'import comme par la séance reprise. Un
// « remède » qui enverrait `1 − valeur` ferait tomber le premier ; un texte qui reparlerait de bruit
// mêlé ferait tomber le deuxième.
import "node-web-audio-api/polyfill.js";
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

import { toutesLesFiches } from "./index";
import { registre } from "../audio/adaptateur";
import "../composition";
import { ctxDEssai } from "../core/contexte-essai";
import { noeudsRelus } from "../ui/en-cours-a-relire";
import { traduireNomsHerites } from "../ui/pertes-chargement";
import { configurerRegistreUI, type RegistreUI } from "../ui/registre-actif";

const { appliquerTache } = createRequire(import.meta.url)("../../electron/acestep-plan.cjs") as {
  appliquerTache: (plan: object, options: object) => { ok: boolean; plan?: Record<string, unknown> };
};

const NOM = "Départ sur l'audio";
type Param = { nom: string; nomEn?: string; nomsHerites?: string[]; doc?: string; docEn?: string };
const fiche = () => toutesLesFiches.find((f) => f.id === "reprendre-chanson") as unknown as {
  parametres: Param[]; notice: string; noticeEn: string; executer: (ctx: unknown) => Promise<unknown>;
};
const reglage = () => fiche().parametres.find((p) => p.nom === NOM);

// UN SEUL PONT FACTICE POUR TOUT LE FICHIER : posé dans chaque bloc, le dernier remplacerait les
// autres dès le chargement, et les premiers cas liraient un relevé resté vide.
const recu: Record<string, unknown>[] = [];
(globalThis as unknown as { api?: unknown }).api = {
  acestepRendre: async (o: Record<string, unknown>) => { recu.push(o); return { ok: false, journal: "pont factice" }; },
};
afterEach(() => { recu.length = 0; });

describe("« Départ sur l'audio » arrive au moteur tel qu'il est réglé", () => {

  it("la valeur du curseur devient `cover_noise_strength` sans être retournée", async () => {
    const plan = JSON.stringify({ caption: "une ballade", duration: 4 });
    const audio = new AudioBuffer({ length: 4800, numberOfChannels: 2, sampleRate: 48000 });
    const vus: [number, unknown][] = [];
    for (const v of [0, 0.1, 0.5, 1]) {
      await fiche().executer(ctxDEssai([plan, audio], { [NOM]: v }));
      const options = recu.at(-1) ?? {};
      vus.push([v, appliquerTache(JSON.parse(String(options.plan)), options).plan?.cover_noise_strength]);
    }
    // Zéro part du bruit seul, un part presque de la source : c'est le sens du moteur, et le curseur
    // le porte sans conversion.
    expect(vus).toEqual([[0, 0], [0.1, 0.1], [0.5, 0.5], [1, 1]]);
  });

  it("et le « Dosage » devient `audio_cover_strength` sans conversion, seuils de la notice compris", async () => {
    const plan = JSON.stringify({ caption: "une ballade", duration: 4 });
    const audio = new AudioBuffer({ length: 4800, numberOfChannels: 2, sampleRate: 48000 });
    const valeurs = [0, 0.1, 0.15, 0.2, 0.25, 1];
    const vus: unknown[] = [];
    for (const v of valeurs) {
      await fiche().executer(ctxDEssai([plan, audio], { "Dosage": v }));
      const options = recu.at(-1) ?? {};
      vus.push(appliquerTache(JSON.parse(String(options.plan)), options).plan?.audio_cover_strength);
    }
    expect(vus).toEqual(valeurs);
  });
});

describe("le texte dit le sens du moteur", () => {
  it("le réglage dit qu'à zéro le rendu part du bruit seul, et qu'à un il est presque la copie", () => {
    const r = reglage();
    expect(r, `le réglage « ${NOM} » manque à la fiche`).toBeDefined();
    expect(r!.doc).toMatch(/À zéro, le bruit seul/);
    expect(r!.doc).toMatch(/presque la copie/);
    expect(r!.docEn).toMatch(/At zero, noise alone/);
    expect(r!.docEn).toMatch(/almost a copy/);
  });

  it("et la notice aussi, dans les deux langues, sans plus parler de bruit mêlé", () => {
    const { notice, noticeEn } = fiche();
    expect(notice).toMatch(/« Départ sur l'audio » règle le point d'où le rendu part\. À zéro, il part du bruit seul\./);
    expect(noticeEn).toMatch(/« Start from the audio » sets the point the render starts from\. At zero, it starts from noise alone\./);
    expect(notice).not.toMatch(/bruit mêlé/);
    expect(noticeEn).not.toMatch(/noise mixed/);
  });

  it("le « Dosage » dit son seuil, et ne promet plus de s'écarter à mesure qu'il baisse", () => {
    const { notice, noticeEn, parametres } = fiche();
    const dosage = parametres.find((p) => p.nom === "Dosage");
    for (const texte of [notice, dosage?.doc ?? ""]) {
      expect(texte).toMatch(/entre 0,2 et 0,25 sur « Rapide » avec « Glissement » à zéro, entre 0,1 et 0,15 sur « Base »/);
    }
    for (const texte of [noticeEn, dosage?.docEn ?? ""]) {
      expect(texte).toMatch(/between 0\.2 and 0\.25 on « Fast » with « Shift » at zero, between 0\.1 and 0\.15 on « Base »/);
    }
    expect(notice).not.toMatch(/plus bas, il s'en écarte/);
    expect(noticeEn).not.toMatch(/lower, it departs from it/);
    // Au-dessus du seuil, « Avec » fait un plateau et « Sans » une pente : la notice dit les deux.
    expect(notice).toMatch(/sur « Sans », le rendu se rapproche de l'audio reçu à mesure que le dosage monte/);
    expect(noticeEn).toMatch(/on « Without », the render comes closer to the received audio as the strength rises/);
  });

  it("« Sans » dit qu'il suit l'audio reçu de bien plus près, dans les deux langues", () => {
    const { notice, noticeEn, parametres } = fiche();
    const q = parametres.find((p) => p.nom === "Quantification des codes");
    expect(notice).toMatch(/« Sans » les garde continus : le rendu suit l'audio reçu de bien plus près/);
    expect(noticeEn).toMatch(/« Without » keeps them continuous: the render follows the received audio much more closely/);
    expect(q?.doc).toMatch(/« Sans » les garde continus, et le rendu le suit de bien plus près/);
    expect(q?.docEn).toMatch(/« Without » keeps them continuous, and the render follows it much more closely/);
  });
});

describe("« Sans » part au moteur sans l'aller-retour qui efface le détail", () => {
  it("« Avec » devient la tâche `cover`, « Sans » la tâche `cover-nofsq`", async () => {
    const plan = JSON.stringify({ caption: "une ballade", duration: 4 });
    const audio = new AudioBuffer({ length: 4800, numberOfChannels: 2, sampleRate: 48000 });
    const ids = (fiche().parametres.find((p) => p.nom === "Quantification des codes") as unknown as {
      options: string[]; optionIds: string[];
    });
    const taches: Record<string, unknown> = {};
    ids.options.forEach((libelle, i) => { taches[libelle] = ids.optionIds[i]; });
    for (const id of ids.optionIds) {
      await fiche().executer(ctxDEssai([plan, audio], { "Quantification des codes": id }));
      const options = recu.at(-1) ?? {};
      taches[`→ ${id}`] = appliquerTache(JSON.parse(String(options.plan)), options).plan?.task_type;
    }
    expect(taches).toEqual({ Avec: "cover", Sans: "cover-nofsq", "→ cover": "cover", "→ cover-nofsq": "cover-nofsq" });
  });
});

describe("un projet enregistré sous l'ancien nom rouvre avec sa valeur", () => {
  it("« Bruit » est hérité, et sa valeur passe au réglage d'aujourd'hui", () => {
    expect(reglage()?.nomsHerites).toEqual(["Bruit"]);
    expect(fiche().parametres.map((p) => p.nom)).not.toContain("Bruit");
    const noeuds = [{ id: "r", data: { ficheId: "reprendre-chanson", parametres: { "Bruit": 0.4, "Dosage": 0.5 } as Record<string, unknown> } }];
    const traduits = traduireNomsHerites(noeuds, (id) => toutesLesFiches.find((f) => f.id === id) as never);
    expect(traduits).toBe(1);
    expect(noeuds[0].data.parametres).toEqual({ [NOM]: 0.4, "Dosage": 0.5 });
  });

  it("et une séance reprise aussi : l'en-cours relu porte la valeur sous « Départ sur l'audio »", () => {
    configurerRegistreUI(registre as unknown as RegistreUI);
    const [relu] = noeudsRelus([{ id: "r", position: { x: 0, y: 0 },
      data: { ficheId: "reprendre-chanson", parametres: { "Bruit": 0.4, "Dosage": 0.5 } } }]);
    expect(relu.data.parametres).toEqual({ [NOM]: 0.4, "Dosage": 0.5 });
  });
});
