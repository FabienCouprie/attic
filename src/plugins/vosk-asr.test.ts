// plugins/vosk-asr.test.ts — Le nœud Vosk, et surtout l'attente qui a failli le rendre muet.
//
// POURQUOI UN DOUBLE, ET NON LE VRAI MOTEUR. `vosk-browser` est un paquet UMD de 5,8 Mo qui porte
// son WebAssembly à l'intérieur, pose un global et lance son propre worker : rien de tout cela ne
// tourne sous Node. Mais CE N'EST PAS LE MOTEUR QUI EST LA PRISE. La prise, c'est ce que la fiche
// lui donne et ce qu'elle fait de ses événements, et cela se tient entièrement sans lui — c'est le
// même raisonnement que `textgen-ia.test.ts`, dont l'interface de worker est déclarée « pour qu'un
// double suffise en test ».
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. Donner le signal au moteur ne coûte presque rien :
// mesuré, 33 millisecondes pour 2,84 secondes de parole, puisque chaque tranche n'est qu'un message
// au worker. C'est la RECONNAISSANCE qui prend le temps, et elle arrive APRÈS. Un premier jet
// attendait quatre cents millisecondes après la demande de résultat final ; relevé dans le
// navigateur, le premier événement tombe vers huit cents millisecondes et le dernier vers deux
// secondes huit. Le nœud rendait donc un texte vide, zéro mot, et AUCUNE ERREUR — le pire des
// défauts, celui qui ressemble à un enregistrement sans parole. L'attente est désormais
// événementielle, et l'échéance n'est qu'un filet.
//
// CE QUE LE VOCABULAIRE CONTRAINT APPORTE, mesuré sur une phrase dite par la synthèse vocale
// d'Attic elle-même : « la chanteuse monte au sol puis redescend vers le mi grave ». Sans liste, le
// petit modèle français rend « vers le grave » et perd le « mi », en 3,1 s ; avec la liste, il rend
// la phrase exacte en 0,6 s. C'est le réglage qui sépare ce nœud des deux autres moteurs.
// Le polyfill complet, et non le seul `AudioBuffer` : le rééchantillonnage passe par un
// `OfflineAudioContext`, qui filtre au lieu de décimer.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  FREQUENCE_VOSK, MODELES, fiches, tableauDesMots, transcrire, vers16k, versMono,
} from "./vosk-asr";

const fiche = () => {
  const f = fiches.find((x) => x.id === "vosk-asr");
  if (!f) throw new Error("fiche vosk-asr introuvable");
  return f;
};

interface Mot { word: string; start: number; end: number; conf: number }

/**
 * Un double du modèle, qui rejoue un scénario d'événements.
 *
 * IL SE FIE À CE QU'ON LUI DONNE, et non à un ordre d'appel : il garde le signal reçu, la grammaire
 * reçue et le drapeau des mots, puis émet ce que le scénario dit, APRÈS le délai que le scénario
 * dit. C'est ce décalage qui compte : un double qui répondrait tout de suite laisserait passer
 * exactement le défaut que ce fichier tient.
 */
function fauxModele(scenario: {
  resultats: { apresMs: number; texte: string; mots: Mot[] }[];
  partiels?: { apresMs: number; texte: string }[];
}) {
  const vu = {
    frequences: [] as number[],
    grammaires: [] as (string | undefined)[],
    motsDemandes: [] as boolean[],
    tranches: [] as number[],
    retire: 0,
    finalDemande: 0,
  };
  class FauxReconnaisseur {
    private ecouteurs = new Map<string, ((m: unknown) => void)[]>();
    constructor(frequence: number, grammaire?: string) {
      vu.frequences.push(frequence);
      vu.grammaires.push(grammaire);
    }
    on(evenement: string, ecouteur: (m: unknown) => void) {
      const liste = this.ecouteurs.get(evenement) ?? [];
      liste.push(ecouteur);
      this.ecouteurs.set(evenement, liste);
    }
    private emettre(evenement: string, message: unknown) {
      for (const e of this.ecouteurs.get(evenement) ?? []) e(message);
    }
    setWords(mots: boolean) { vu.motsDemandes.push(mots); }
    acceptWaveformFloat(tampon: Float32Array) { vu.tranches.push(tampon.length); }
    retrieveFinalResult() {
      vu.finalDemande++;
      for (const p of scenario.partiels ?? []) {
        setTimeout(() => this.emettre("partialresult", { result: { partial: p.texte } }), p.apresMs);
      }
      for (const r of scenario.resultats) {
        setTimeout(() => this.emettre("result", { result: { text: r.texte, result: r.mots } }), r.apresMs);
      }
    }
    remove() { vu.retire++; }
  }
  return { modele: { KaldiRecognizer: FauxReconnaisseur, terminate() {} } as never, vu };
}

const mot = (word: string, start: number, end: number, conf = 1): Mot => ({ word, start, end, conf });

/** Un signal quelconque, de la durée demandée. */
function signal(secondes: number): Float32Array {
  const n = Math.round(secondes * FREQUENCE_VOSK);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.1 * Math.sin((2 * Math.PI * 200 * i) / FREQUENCE_VOSK);
  return s;
}

describe("l'attente du résultat", () => {
  it("ATTEND L'ÉVÉNEMENT ET NON UN DÉLAI : un résultat qui tarde deux secondes est tout de même rendu", async () => {
    // LE CAS QUI TIENT LE DÉFAUT. Avec une attente fixe de quatre cents millisecondes, ce scénario
    // rendait un texte vide et zéro mot, sans erreur.
    vi.useFakeTimers();
    const { modele } = fauxModele({
      resultats: [{ apresMs: 2000, texte: "le petit chat dort", mots: [mot("le", 0, 0.2), mot("petit", 0.2, 0.5)] }],
    });
    const promesse = transcrire(modele, signal(2.8));
    await vi.runAllTimersAsync();
    const r = await promesse;
    vi.useRealTimers();
    expect(r.texte).toBe("le petit chat dort");
    expect(r.mots).toHaveLength(2);
  });

  it("rend la main quand rien ne vient, plutôt que d'attendre sans fin", async () => {
    // Un signal sans parole ne produit aucun résultat : l'échéance est le filet, et elle suit la
    // durée du signal puisque la reconnaissance va plus vite que le temps réel.
    vi.useFakeTimers();
    const { modele } = fauxModele({ resultats: [] });
    const promesse = transcrire(modele, signal(1));
    await vi.runAllTimersAsync();
    const r = await promesse;
    vi.useRealTimers();
    expect(r.texte).toBe("");
    expect(r.mots).toEqual([]);
  });

  it("rassemble plusieurs énoncés, et garde leurs mots dans l'ordre", async () => {
    // LE CAS QUI A TROUVÉ LE SECOND DÉFAUT. Une première version rendait la main au PREMIER
    // résultat ; or l'alimentation est finie depuis longtemps quand ils arrivent, et un
    // enregistrement de deux phrases était tronqué à la première. Les instants sont ceux du relevé :
    // sur deux phrases séparées de deux secondes de silence, les deux résultats tombent à 1362 et
    // 1946 millisecondes, soit 584 d'écart.
    vi.useFakeTimers();
    const { modele } = fauxModele({
      resultats: [
        { apresMs: 1362, texte: "premier énoncé", mots: [mot("premier", 0, 0.4), mot("énoncé", 0.4, 0.9)] },
        { apresMs: 1946, texte: "second énoncé", mots: [mot("second", 1.2, 1.6), mot("énoncé", 1.6, 2)] },
      ],
    });
    const promesse = transcrire(modele, signal(2));
    await vi.runAllTimersAsync();
    const r = await promesse;
    vi.useRealTimers();
    expect(r.texte).toBe("premier énoncé second énoncé");
    expect(r.mots.map((m) => m.word)).toEqual(["premier", "énoncé", "second", "énoncé"]);
  });

  it("remonte les résultats partiels à mesure, et libère le reconnaisseur à la fin", async () => {
    vi.useFakeTimers();
    const { modele, vu } = fauxModele({
      resultats: [{ apresMs: 500, texte: "fini", mots: [] }],
      partiels: [{ apresMs: 100, texte: "fi" }, { apresMs: 300, texte: "fin" }],
    });
    const vus: string[] = [];
    const promesse = transcrire(modele, signal(1), { surPartiel: (t) => vus.push(t) });
    await vi.runAllTimersAsync();
    await promesse;
    vi.useRealTimers();
    expect(vus).toEqual(["fi", "fin"]);
    // Un reconnaisseur qu'on n'enlève pas reste chez le moteur, et ils s'accumulent.
    expect(vu.retire).toBe(1);
  });
});

describe("ce que la fiche donne au moteur", () => {
  it("demande les mots, et donne le signal par tranches à la fréquence de Vosk", async () => {
    vi.useFakeTimers();
    const { modele, vu } = fauxModele({ resultats: [{ apresMs: 50, texte: "x", mots: [] }] });
    const promesse = transcrire(modele, signal(1));
    await vi.runAllTimersAsync();
    await promesse;
    vi.useRealTimers();
    expect(vu.motsDemandes).toEqual([true]);
    expect(vu.frequences).toEqual([FREQUENCE_VOSK]);
    // Un quart de seconde par tranche : quatre pour une seconde.
    expect(vu.tranches).toEqual([4000, 4000, 4000, 4000]);
    expect(vu.finalDemande).toBe(1);
  });

  it("ne pose une grammaire que si on lui donne un vocabulaire, et y joint l'inconnu", async () => {
    // SANS `[unk]`, UN MOT HORS LISTE EST RENDU PAR LE PLUS PROCHE DE LA LISTE : le moteur n'a pas
    // le droit de se taire. Le jeton d'inconnu lui rend ce droit, et c'est ce qui fait la différence
    // entre une liste qui aide et une liste qui invente.
    vi.useFakeTimers();
    const vide = fauxModele({ resultats: [{ apresMs: 10, texte: "x", mots: [] }] });
    const p1 = transcrire(vide.modele, signal(0.5), { grammaire: [] });
    await vi.runAllTimersAsync();
    await p1;
    expect(vide.vu.grammaires).toEqual([undefined]);

    const plein = fauxModele({ resultats: [{ apresMs: 10, texte: "x", mots: [] }] });
    const p2 = transcrire(plein.modele, signal(0.5), { grammaire: ["do", "ré", "mi"] });
    await vi.runAllTimersAsync();
    await p2;
    vi.useRealTimers();
    expect(JSON.parse(plein.vu.grammaires[0]!)).toEqual(["do", "ré", "mi", "[unk]"]);
  });
});

describe("le signal avant le moteur", () => {
  it("mixe en mono en moyennant les canaux", () => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: 4, sampleRate: FREQUENCE_VOSK });
    b.getChannelData(0).set([1, 0, 1, 0]);
    b.getChannelData(1).set([0, 1, -1, 0]);
    expect([...versMono(b)]).toEqual([0.5, 0.5, 0, 0]);
  });

  it("laisse un signal déjà à seize kilohertz tel quel, au bit près", async () => {
    const s = signal(0.1);
    expect(await vers16k(s, FREQUENCE_VOSK)).toBe(s);
  });

  it("ramène un signal d'une autre fréquence à seize kilohertz", async () => {
    const s = new Float32Array(48000);
    for (let i = 0; i < s.length; i++) s[i] = Math.sin((2 * Math.PI * 200 * i) / 48000);
    const r = await vers16k(s, 48000);
    expect(r.length).toBe(16000);
  });
});

describe("le tableau des mots", () => {
  it("donne une ligne par mot, avec ses deux instants et sa confiance", () => {
    const lignes = tableauDesMots([mot("sol", 1.2, 1.45, 0.87)], false).split("\n");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain("début");
    expect(lignes[1]).toContain("sol");
    expect(lignes[1]).toContain("1.20");
    expect(lignes[1]).toContain("1.45");
    expect(lignes[1]).toContain("0.87");
  });

  it("le dit plutôt que de rendre un tableau vide, et dans les deux langues", () => {
    expect(tableauDesMots([], false)).toContain("Aucun mot");
    expect(tableauDesMots([], true)).toContain("No word");
    expect(tableauDesMots([mot("a", 0, 1)], true)).toContain("word");
  });
});

describe("déclarations", () => {
  it("prend un audio et rend le texte puis les mots, dans cet ordre", () => {
    expect(fiche().entrees.map((e) => e.type)).toEqual(["audio"]);
    expect(fiche().sorties.map((s) => s.type)).toEqual(["texte", "texte"]);
    expect(fiche().sorties.map((s) => s.nom)).toEqual(["Texte", "Mots"]);
  });

  it("nomme chacun de ses réglages dans son exécuteur, et les traduit", () => {
    const source = fiche().executer.toString();
    for (const p of fiche().parametres) {
      expect(source.includes(`"${p.nom}"`), p.nom).toBe(true);
      expect(p.nomEn, p.nom).toBeTruthy();
      expect(p.doc, p.nom).toBeTruthy();
      expect(p.docEn, p.nom).toBeTruthy();
    }
    expect(fiche().nomEn).toBeTruthy();
    expect(fiche().resumeEn).toBeTruthy();
  });

  it("offre une langue par modèle livré, et pas une de plus", () => {
    const choix = fiche().parametres.find((p) => p.nom === "Langue");
    expect(choix?.optionIds).toEqual(Object.keys(MODELES));
    expect(choix?.optionsEn?.length).toBe(choix?.options?.length);
  });

  it("et chaque modèle est au manifeste, avec une adresse sur la release", () => {
    // LA RÈGLE DU DÉPÔT, tenue ici comme ailleurs : un modèle vient de la release `assets`.
    const manifeste = JSON.parse(readFileSync("scripts/modeles-manifest.json", "utf8"));
    for (const { id, fichier } of Object.values(MODELES)) {
      const entree = manifeste.modeles.find((m: { id: string }) => m.id === id);
      expect(entree, id).toBeTruthy();
      expect(entree.source.url, id)
        .toMatch(/^https:\/\/github\.com\/FabienCouprie\/attic\/releases\/download\/assets\//);
      expect(entree.source.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      // Le fichier que la fiche demande est bien celui que le manifeste livre.
      expect(entree.fichiers.map((f: { chemin: string }) => f.chemin), id).toContain(`oonx/${fichier}`);
    }
  });
});
