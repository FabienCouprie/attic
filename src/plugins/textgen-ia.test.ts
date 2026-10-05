// plugins/textgen-ia.test.ts — Les trois fiches d'IA textuelle, que nul test ne faisait tourner.
//
// POURQUOI CE FICHIER, ET OÙ IL REGARDE. Des quatre fiches de `textgen.ts`, une seule était tenue :
// `reservoir-textuel`, qui calcule tout lui-même, a sa propre batterie. Les trois autres —
// `gpt2-paroles`, `qwen2.5-lyrics` et `nllb-paroles` — passent par un WORKER et un modèle d'IA, et
// aucun test ne les nommait. Le modèle ne peut pas tourner ici : il faut un navigateur, du WebGPU
// ou du WASM, et des centaines de mégaoctets téléchargés.
//
// MAIS CE N'EST PAS LE MODÈLE QUI EST LA PRISE. La prise, c'est ce que la fiche ENVOIE au worker et
// ce qu'elle FAIT de chaque réponse, et cela se tient entièrement sans modèle. `garde-worker.ts`
// l'a prévu et l'écrit : son interface `CibleWorker` dit « ce dont ce module a besoin d'un worker —
// rien de plus, POUR QU'UN DOUBLE SUFFISE EN TEST ». Le double est donc ici, et il enregistre ce
// qu'on lui poste.
//
// CE QUE CELA PERMET DE TENIR, ET QUI NE SE VOIT NULLE PART AILLEURS.
//
//   LES TROIS FICHES PARTAGENT UN SEUL WORKER, mis en cache au niveau du module. C'est donc le
//   `requestId` qui empêche deux nœuds de se voler leur réponse, et un filtre qui lâcherait ferait
//   dire à un nœud ce qu'un autre a demandé. Un cas pose exactement cette situation.
//
//   LE GARDE-FOU TRANSFORME LA MORT D'UN WORKER EN ERREUR DU NŒUD, et son en-tête dit ce qui arrive
//   sans lui : « la promesse du nœud ne se règle ni dans un sens ni dans l'autre, et le nœud reste
//   "en cours" indéfiniment. Les sept nœuds Magenta sont restés dans cet état. » Deux cas le
//   tiennent : l'erreur rendue, et le worker mort retiré du cache — faute de quoi « la panne durerait
//   jusqu'au redémarrage de l'application ».
//
//   `nllb-paroles` FAIT DEUX DEMANDES À DEUX WORKERS, génère en anglais puis traduit, et son second
//   worker est jetable : il doit être terminé. Les quatre issues de cette chaîne — tout va bien,
//   l'anglais trop court, la traduction échouée, la langue sans modèle — rendent quatre choses
//   différentes, et trois d'entre elles rendent tout de même l'anglais plutôt que rien.
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Un double de worker, qui n'est que ce que `CibleWorker` demande.
 *
 * Il enregistre ce qu'on lui poste et répond ce que le scénario du cas lui dit de répondre. Les
 * exécuteurs posent leur écouteur AVANT de poster, de sorte qu'une réponse synchrone leur parvient.
 */
class FauxWorker {
  static tous: FauxWorker[] = [];
  static scenario: ((poste: Poste, w: FauxWorker) => void) | null = null;
  ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  postes: Poste[] = [];
  termine = false;
  url: unknown;
  options: unknown;
  constructor(url: unknown, options?: unknown) {
    this.url = url;
    this.options = options;
    FauxWorker.tous.push(this);
  }
  addEventListener(type: string, f: (e: unknown) => void) {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]);
  }
  removeEventListener(type: string, f: (e: unknown) => void) {
    this.ecouteurs.set(type, (this.ecouteurs.get(type) ?? []).filter((x) => x !== f));
  }
  dispatchEvent(e: { type: string }) {
    for (const f of [...(this.ecouteurs.get(e.type) ?? [])]) f(e);
    return true;
  }
  postMessage(m: Poste) { this.postes.push(m); FauxWorker.scenario?.(m, this); }
  terminate() { this.termine = true; }
  /** Répond comme le ferait le worker. */
  repond(donnees: Record<string, unknown>) { this.dispatchEvent({ type: "message", data: donnees } as never); }
  /** Meurt comme le ferait un worker dont le module ne s'importe pas. */
  meurt(raison: string) { this.dispatchEvent({ type: "error", message: raison } as never); }
}

interface Poste {
  requestId?: string;
  prompt?: string;
  messages?: { role: string; content: string }[];
  modelId?: string;
  task?: string;
  text?: string;
  maxTokens?: number;
  temperature?: number;
  repetitionPenalty?: number;
}

(globalThis as unknown as { Worker: unknown }).Worker = FauxWorker;

const { fiches } = await import("./textgen");

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string>, journal: string[]) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: (m: string) => journal.push(m),
  } as never;
}

const lancer = (id: string, entrees: unknown[] = [null],
  reglages: Record<string, number | string> = {}, journal: string[] = []) =>
  fiche(id).executer(contexte(entrees, reglages, journal));

/**
 * Le worker partagé par les trois fiches : celui que le module garde en cache.
 *
 * ON NE VIDE PAS LA LISTE ENTRE DEUX CAS, et c'est une leçon de la première écriture : le module
 * garde SON worker dans une variable à lui, de sorte qu'un `beforeEach` qui effaçait la liste le
 * rendait introuvable pour les cas suivants, alors qu'il continuait de servir. Ce sont donc les
 * messages postés qu'on efface, et les workers se reconnaissent à leur fichier.
 */
const partage = () => {
  const w = [...FauxWorker.tous].reverse().find((x) => String(x.url).includes("textgen-worker"));
  if (!w) throw new Error("aucun worker de génération n'a été créé");
  return w;
};
/** Celui à qui l'on a posté une traduction, dans le cas courant. */
const traducteur = () => FauxWorker.tous.find((w) => w.postes.some((p) => p.modelId?.includes("opus")));

/**
 * Le scénario ordinaire : le worker répond ce qu'on lui demande.
 *
 * IL SE FIE À LA FORME DE LA DEMANDE, ET NON À SON CHAMP `task`. Ma première version répondait
 * « génération » quand `task` valait « text-generation » ; planté avec une autre tâche, le double
 * prenait l'autre branche, répondait sans `requestId`, et le nœud attendait soixante secondes pour
 * rien. Un vrai worker répond à qui lui parle : c'est la présence d'un `requestId` qui décide, et
 * la traduction se reconnaît à ce qu'elle poste un texte plutôt qu'un prompt.
 */
const repondBien = (texte = "once upon a rainy love", traduction = "il était une pluie amoureuse") =>
  (poste: Poste, w: FauxWorker) => {
    if (poste.text !== undefined) w.repond({ type: "done", text: traduction });
    else w.repond({ requestId: poste.requestId, type: "done", text: texte });
  };

const TROIS = ["gpt2-paroles", "qwen2.5-lyrics", "nllb-paroles"];
const SOURCE = readFileSync("src/plugins/textgen.ts", "utf-8");

beforeEach(() => {
  for (const w of FauxWorker.tous) w.postes.length = 0;
  FauxWorker.scenario = repondBien();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("ce que les trois fiches envoient au worker", () => {
  it("DISTILGPT-2 ENVOIE SON MODÈLE, SA TÂCHE ET SES QUATRE RÉGLAGES", async () => {
    // Le worker ne sait rien du nœud : tout ce que le réglage doit faire passe par ce seul objet.
    // Un champ oublié est un curseur mort, et rien d'autre ne le verrait.
    await lancer("gpt2-paroles", [null],
      { "Longueur": 250, "Créativité": 0.4, "Anti-répétition": 1.8, "Prompt": "écris la pluie" });
    const poste = partage().postes[0];
    expect(poste.modelId, "le modèle annoncé par la fiche").toBe("Xenova/distilgpt2");
    expect(poste.task).toBe("text-generation");
    expect(poste.prompt).toBe("écris la pluie");
    expect(poste.maxTokens).toBe(250);
    expect(poste.temperature).toBe(0.4);
    expect(poste.repetitionPenalty).toBe(1.8);
    expect(typeof poste.requestId, "chaque demande porte son identifiant").toBe("string");
  });

  it("QWEN ENVOIE DES MESSAGES ET NON UN PROMPT BRUT, et c'est ce qui les distingue", async () => {
    // Les deux fiches se ressemblent au point qu'on pourrait les croire interchangeables : l'une
    // poste `prompt`, l'autre un dialogue `messages` avec un rôle système. Les confondre enverrait
    // au modèle une demande qu'il ne sait pas lire.
    await lancer("qwen2.5-lyrics", [null], { "Prompt": "écris la mer" });
    const poste = partage().postes[0];
    expect(poste.modelId).toBe("onnx-community/Qwen2.5-0.5B");
    expect(poste.prompt, "qwen ne poste pas de prompt brut").toBeUndefined();
    expect(poste.messages, "deux messages : le rôle système et la demande").toHaveLength(2);
    expect(poste.messages![0].role).toBe("system");
    expect(poste.messages![1]).toEqual({ role: "user", content: "écris la mer" });
  });

  it("DEUX DEMANDES NE PORTENT JAMAIS LE MÊME IDENTIFIANT", async () => {
    await lancer("gpt2-paroles");
    await lancer("qwen2.5-lyrics");
    const [a, b] = partage().postes;
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("UNE ENTRÉE TEXTE L'EMPORTE SUR LE RÉGLAGE, sauf si elle est blanche", async () => {
    // « Prompt » est un réglage, mais le port d'entrée est fait pour qu'un autre nœud l'écrive. Une
    // entrée vide ou faite d'espaces ne doit pas effacer le réglage pour autant.
    for (const id of ["gpt2-paroles", "qwen2.5-lyrics"]) {
      const lu = async (entree: unknown) => {
        for (const w of FauxWorker.tous) w.postes.length = 0;
        await lancer(id, [entree], { "Prompt": "le réglage" });
        const p = partage().postes[0];
        return p.prompt ?? p.messages![1].content;
      };
      expect(await lu("une vraie entrée"), `${id} : l'entrée doit l'emporter`).toBe("une vraie entrée");
      for (const vide of ["   ", "", null, 42]) {
        expect(await lu(vide), `${id} : ${JSON.stringify(vide)} a effacé le réglage`).toBe("le réglage");
      }
    }
  });
});

describe("ce que les trois fiches font de la réponse", () => {
  it("un « done » rend le texte, et le message en compte les caractères", async () => {
    FauxWorker.scenario = repondBien("douze lettres");
    for (const [id, marque] of [["gpt2-paroles", "GPT-2"], ["qwen2.5-lyrics", "Qwen2.5"]] as [string, string][]) {
      const res = await lancer(id);
      expect(res.valeurs).toEqual(["douze lettres"]);
      expect(res.message, `${id} : ${res.message}`).toContain(marque);
      expect(res.message).toContain("13");
    }
  });

  it("un « error » rend une ERREUR DÉCLARÉE, et porte la raison du worker", async () => {
    // `erreur: true` est ce qui fait passer le nœud en rouge : sans lui, un échec se lirait comme
    // un résultat vide et le graphe continuerait comme si de rien n'était.
    FauxWorker.scenario = (poste, w) => w.repond({ requestId: poste.requestId, type: "error", msg: "modèle introuvable" });
    for (const id of ["gpt2-paroles", "qwen2.5-lyrics"]) {
      const res = await lancer(id);
      expect(res.valeurs).toEqual([null]);
      expect((res as { erreur?: boolean }).erreur, `${id} : l'échec n'est pas déclaré`).toBe(true);
      expect(res.message, `${id} : la raison du worker est perdue`).toContain("modèle introuvable");
    }
  });

  it("un « progress » est remonté tel quel au nœud", async () => {
    FauxWorker.scenario = (poste, w) => {
      w.repond({ requestId: poste.requestId, type: "progress", msg: "chargement 40 %" });
      w.repond({ requestId: poste.requestId, type: "done", text: "fini" });
    };
    const journal: string[] = [];
    await lancer("gpt2-paroles", [null], {}, journal);
    expect(journal).toContain("chargement 40 %");
  });

  it("UNE RÉPONSE À UNE AUTRE DEMANDE EST IGNORÉE", async () => {
    // LES TROIS FICHES PARTAGENT UN SEUL WORKER, mis en cache par le module. C'est le `requestId`
    // qui empêche deux nœuds de se voler leur réponse, et un filtre qui lâcherait ferait dire à un
    // nœud ce qu'un autre a demandé — sans erreur, sans trace, et avec un texte plausible.
    FauxWorker.scenario = (poste, w) => {
      w.repond({ requestId: "la-demande-du-voisin", type: "done", text: "CE TEXTE N'EST PAS LE MIEN" });
      w.repond({ requestId: poste.requestId, type: "done", text: "le mien" });
    };
    expect((await lancer("gpt2-paroles")).valeurs).toEqual(["le mien"]);
    expect((await lancer("qwen2.5-lyrics")).valeurs).toEqual(["le mien"]);
  });
});

describe("le garde-fou : un worker qui meurt fait échouer le nœud", () => {
  it("SA MORT DEVIENT UNE ERREUR, et non une attente sans fin", async () => {
    // C'est tout l'objet de `garde-worker.ts`, et son en-tête dit ce qui arrive sans lui : « la
    // promesse du nœud ne se règle ni dans un sens ni dans l'autre, et le nœud reste "en cours"
    // indéfiniment. Les sept nœuds Magenta sont restés dans cet état. » On borne donc l'attente :
    // un cas qui ne se conclut pas est le défaut même qu'on cherche.
    FauxWorker.scenario = (_poste, w) => w.meurt("le module ne s'importe pas");
    const tenu = Symbol("délai");
    let minuteur: ReturnType<typeof setTimeout>;
    const attente = new Promise((r) => { minuteur = setTimeout(() => r(tenu), 2000); });
    const issue = await Promise.race([lancer("gpt2-paroles"), attente]);
    clearTimeout(minuteur!);
    expect(issue, "le nœud resterait « en cours » sans fin").not.toBe(tenu);
    const res = issue as { valeurs: unknown[]; erreur?: boolean; message?: string };
    expect(res.valeurs).toEqual([null]);
    expect(res.erreur).toBe(true);
    expect(res.message).toContain("le module ne s'importe pas");
  });

  it("ET LE WORKER MORT EST RETIRÉ DU CACHE : la panne ne dure pas jusqu'au redémarrage", async () => {
    // « Sans cela, un worker mort resterait en cache et FERAIT ATTENDRE PAREILLEMENT toutes les
    // exécutions suivantes — la panne durerait jusqu'au redémarrage de l'application. » C'est le
    // rôle du rappel `surMort`, et il se vérifie au nombre de workers construits.
    // L'ATTENTE EST BORNÉE ICI AUSSI. Planté sur le garde-fou lui-même, ce cas a mis soixante
    // secondes à tomber : la première exécution ne se concluait jamais, et le délai de vitest
    // tranchait à sa place. Le dépassement est le défaut, et il se signale en deux secondes.
    const borne = async <T>(promesse: Promise<T>, quoi: string): Promise<T> => {
      const tenu = Symbol("délai");
      let minuteur: ReturnType<typeof setTimeout>;
      const attente = new Promise((r) => { minuteur = setTimeout(() => r(tenu), 2000); });
      const issue = await Promise.race([promesse, attente]);
      clearTimeout(minuteur!);
      expect(issue, `${quoi} : la promesse ne se conclut pas`).not.toBe(tenu);
      return issue as T;
    };
    FauxWorker.scenario = (_poste, w) => w.meurt("mort");
    await borne(lancer("gpt2-paroles"), "la première exécution");
    const apresLaMort = FauxWorker.tous.length;
    FauxWorker.scenario = repondBien("ressuscité");
    const res = await borne(lancer("gpt2-paroles"), "la seconde exécution");
    expect(FauxWorker.tous.length, "le worker mort a été réemployé").toBe(apresLaMort + 1);
    expect(res.valeurs, "la seconde exécution doit réussir").toEqual(["ressuscité"]);
  });
});

describe("nllb : générer en anglais, puis traduire", () => {
  it("DEUX DEMANDES À DEUX WORKERS, et le traducteur est JETABLE", async () => {
    // Le worker de génération est partagé et gardé ; celui de traduction est créé pour cette seule
    // phrase et doit être terminé. Un worker jetable qu'on oublie de terminer s'accumule à chaque
    // exécution, et c'est le genre de fuite que rien ne signale.
    const journal: string[] = [];
    const res = await lancer("nllb-paroles", [null], {}, journal);
    const trad = traducteur();
    // LA PREMIÈRE ÉTAPE EST VÉRIFIÉE AUSSI, et elle ne l'était pas : planté, un modèle de
    // génération anglaise changé ne faisait rien tomber. Les deux demandes ont chacune leur modèle,
    // et le nœud annonce dans son résumé qu'il « génère en anglais via DistilGPT-2 ».
    const generation = partage().postes[0];
    expect(generation.modelId, "la génération anglaise ne passe plus par DistilGPT-2")
      .toBe("Xenova/distilgpt2");
    expect(generation.task).toBe("text-generation");
    expect(trad, "aucune demande de traduction").toBeTruthy();
    expect(trad!.postes[0].modelId).toBe("Xenova/opus-mt-en-fr");
    expect(trad!.postes[0].text, "c'est l'anglais produit qui part à la traduction")
      .toBe("once upon a rainy love");
    expect(trad!.termine, "le worker jetable n'a pas été terminé").toBe(true);
    expect(res.valeurs).toEqual(["il était une pluie amoureuse"]);
    expect(journal.length, "les deux étapes doivent s'annoncer").toBeGreaterThanOrEqual(2);
  });

  it("LA LANGUE CHOISIE DÉCIDE DU MODÈLE DE TRADUCTION", async () => {
    for (const [code, modele] of [["fr", "en-fr"], ["ja", "en-ja"], ["ar", "en-ar"]] as [string, string][]) {
      for (const w of FauxWorker.tous) w.postes.length = 0;
      await lancer("nllb-paroles", [null], { "Langue cible": code });
      expect(traducteur()!.postes[0].modelId, `${code}`).toContain(modele);
    }
  });

  it("LES ANCIENS LIBELLÉS FRANÇAIS SONT ENCORE ACCEPTÉS, pour les projets déjà enregistrés", async () => {
    // Le réglage portait autrefois « Français » et porte aujourd'hui « fr ». Un projet enregistré
    // avant le changement doit continuer de traduire, et non rendre l'anglais sans rien dire.
    for (const ancien of ["Français", "français", "Japonais"]) {
      for (const w of FauxWorker.tous) w.postes.length = 0;
      await lancer("nllb-paroles", [null], { "Langue cible": ancien });
      expect(traducteur(), `« ${ancien} » n'est plus reconnu`).toBeTruthy();
    }
  });

  it("UNE LANGUE SANS MODÈLE REND L'ANGLAIS, et le dit", async () => {
    const res = await lancer("nllb-paroles", [null], { "Langue cible": "klingon" });
    expect(traducteur(), "aucune traduction ne doit être tentée").toBeFalsy();
    expect(res.valeurs, "l'anglais doit tout de même sortir").toEqual(["once upon a rainy love"]);
    expect(res.message, `${res.message}`).toContain("klingon");
  });

  it("UNE GÉNÉRATION ANGLAISE TROP COURTE EST UNE ERREUR, non un texte minuscule", async () => {
    FauxWorker.scenario = repondBien("court");
    const res = await lancer("nllb-paroles");
    expect(res.valeurs).toEqual([null]);
    expect((res as { erreur?: boolean }).erreur).toBe(true);
    expect(traducteur(), "rien ne doit partir à la traduction").toBeFalsy();
  });

  it("UNE TRADUCTION QUI ÉCHOUE REND L'ANGLAIS plutôt que rien", async () => {
    FauxWorker.scenario = (poste, w) => {
      if (poste.task === "text-generation") w.repond({ requestId: poste.requestId, type: "done", text: "the sea and the freedom of waves" });
      else w.repond({ type: "error", msg: "pas de modèle" });
    };
    const res = await lancer("nllb-paroles");
    expect(res.valeurs, "le travail de la première étape est perdu").toEqual(["the sea and the freedom of waves"]);
    expect(res.message, `${res.message}`).toMatch(/anglais|English/);
  });
});

describe("ce que les fiches déclarent, et ce que la source doit tenir", () => {
  it("CHAQUE LANGUE PROPOSÉE A SON MODÈLE DE TRADUCTION", () => {
    // LE GARDE DE COHÉRENCE DE CE FICHIER. La liste des langues et la table des modèles sont deux
    // écritures séparées du même savoir : ajouter une langue à la liste sans ajouter son modèle
    // ferait rendre l'anglais, sans erreur et sans trace. Le garde lit la table dans la source,
    // par sa FORME — un code suivi d'un modèle `opus-mt-en-…` — et la compare aux identifiants
    // déclarés par le réglage.
    const p = (fiche("nllb-paroles").parametres ?? []).find((x) => x.nom === "Langue cible")!;
    const codes = (p.optionIds ?? []).map(String);
    expect(codes.length, "dix langues déclarées").toBe((p.options ?? []).length);
    const table = new Set([...SOURCE.matchAll(/(\w+): "Xenova\/opus-mt-en-([\w-]+)"/g)].map((m) => m[1]));
    for (const code of codes) {
      expect(table, `« ${code} » est proposé sans modèle de traduction`).toContain(code);
    }
  });

  it("CHAQUE LANGUE A AUSSI SON LIBELLÉ LISIBLE, sinon le message affiche un code", () => {
    const p = (fiche("nllb-paroles").parametres ?? []).find((x) => x.nom === "Langue cible")!;
    const labels = SOURCE.slice(SOURCE.indexOf("LABELS_LANGUES"), SOURCE.indexOf("LABELS_LANGUES") + 400);
    for (const code of (p.optionIds ?? []).map(String)) {
      expect(labels, `« ${code} » n'a pas de libellé lisible`).toMatch(new RegExp(`\\b${code}:`));
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of TROIS) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of TROIS) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });

  it("les trois prennent du texte et en rendent", () => {
    for (const id of TROIS) {
      const f = fiche(id);
      expect((f.entrees ?? []).map((e) => e.type), `${id} : entrée`).toEqual(["texte"]);
      expect((f.sorties ?? []).map((s) => s.type), `${id} : sortie`).toEqual(["texte"]);
    }
  });
});
