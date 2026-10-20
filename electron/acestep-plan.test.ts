// electron/acestep-plan.test.ts — Ce qu'une tâche d'ACE-Step a le droit d'écrire dans un plan.
//
// LA FORME DU PIÈGE QUE CES CAS EMPÊCHENT : un moteur qui charge deux gigaoctets de modèle AVANT
// de s'apercevoir qu'il lui manque un fichier, et qui refuse alors en anglais. Mesuré en le
// provoquant : `cover` sans audio source répond « task 'cover' requires source audio or latents »,
// et une plage à l'envers répond « [Region] ERROR: end (2.0) <= start (6.0) ». Les deux arrivent
// après le chargement, donc après l'attente. Tout ce qui se sait avant de lancer doit se refuser
// avant de lancer.
//
// LA TABLE EST LUE, JAMAIS RECOPIÉE : les cas qui suivent parcourent `TACHES` et n'écrivent aucune
// liste de noms. Une tâche ajoutée sans ses exigences tombe donc d'elle-même.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

type Fiche = { source: boolean; base: boolean; piste: boolean; offerte: boolean };
type Resultat = { ok: boolean; plan?: Record<string, unknown>; erreur?: string };

const { TACHES, MODES, MODELE_RAPIDE, MODELE_BASE, appliquerTache, plageProlongement, requetePlanification } =
  createRequire(import.meta.url)("./acestep-plan.cjs") as {
    TACHES: Record<string, Fiche>;
    MODES: Record<string, boolean>;
    MODELE_RAPIDE: string;
    MODELE_BASE: string;
    appliquerTache: (plan: unknown, options?: Record<string, unknown>) => Resultat;
    plageProlongement: (cote: string, ajout: number, duree: number) => { debut: number; fin: number } | null;
    requetePlanification: (options?: Record<string, unknown>) => Record<string, unknown>;
  };

/** Tout champ de la requête dont le nom désigne une graine, cherché par sa FORME. */
const champsDeGraine = (requete: Record<string, unknown>) =>
  Object.keys(requete).filter((c) => /(^|_)seed$/.test(c)).sort();

const PLAN = { caption: "une ballade", lyrics: "[Instrumental]", duration: 30 };
const SOURCE = new Uint8Array([1, 2, 3]);

/** De quoi contenter une tâche, quelles que soient ses exigences : on éprouve une à une. */
function optionsCompletes(tache: string) {
  return { tache, audioSource: SOURCE, debut: 2, fin: 6, piste: "drums", dosage: 1, bruit: 0 };
}

describe("les exigences de chaque tâche", () => {
  it("écrit le type de tâche dans le plan, pour chacune de celles que le moteur connaît", () => {
    for (const tache of Object.keys(TACHES)) {
      const r = appliquerTache(PLAN, optionsCompletes(tache));
      expect(r.ok, `${tache} devrait partir quand tout est fourni`).toBe(true);
      expect(r.plan?.task_type).toBe(tache);
    }
  });

  it("refuse une tâche que le moteur ne connaît pas", () => {
    const r = appliquerTache(PLAN, { tache: "demelage", audioSource: SOURCE });
    expect(r.ok).toBe(false);
    expect(r.erreur).toContain("demelage");
  });

  it("refuse, en français, toute tâche qui réclame un audio source quand il manque", () => {
    const reclamantes = Object.entries(TACHES).filter(([, f]) => f.source).map(([t]) => t);
    expect(reclamantes.length, "la table doit porter des tâches à audio source").toBeGreaterThan(0);
    for (const tache of reclamantes) {
      const r = appliquerTache(PLAN, { ...optionsCompletes(tache), audioSource: undefined });
      expect(r.ok, `${tache} devrait être refusée sans audio source`).toBe(false);
      expect(r.erreur).toMatch(/audio source/);
    }
  });

  it("refuse toute tâche qui réclame une piste quand elle manque", () => {
    const reclamantes = Object.entries(TACHES).filter(([, f]) => f.piste).map(([t]) => t);
    expect(reclamantes.length, "la table doit porter des tâches à piste").toBeGreaterThan(0);
    for (const tache of reclamantes) {
      const r = appliquerTache(PLAN, { ...optionsCompletes(tache), piste: undefined });
      expect(r.ok, `${tache} devrait être refusée sans piste`).toBe(false);
      expect(r.erreur).toMatch(/piste/);
    }
  });

  it("n'écrit un nom de piste que pour les tâches qui en réclament un", () => {
    for (const [tache, fiche] of Object.entries(TACHES)) {
      const r = appliquerTache(PLAN, optionsCompletes(tache));
      expect(Object.hasOwn(r.plan ?? {}, "track"), `track sur ${tache}`).toBe(fiche.piste);
    }
  });

  it("donne le modèle de base à TOUTE tâche qui le réclame, sans qu'un nœud ait à le nommer", () => {
    for (const [tache, fiche] of Object.entries(TACHES)) {
      const r = appliquerTache(PLAN, optionsCompletes(tache));
      expect(r.plan?.synth_model, `${tache}`).toBe(fiche.base ? MODELE_BASE : MODELE_RAPIDE);
    }
  });

  it("refuse de lancer sur le modèle rapide une tâche qui réclame le modèle de base", () => {
    // LE MOTEUR, LUI, PART QUAND MÊME : il avertit « turbo output incoherent » et rend un fichier
    // qui ne vaut rien. Mesuré sur `complete` : la sortie corrèle à 0,996 avec l'audio reçu, donc
    // le modèle rapide n'a rien fait. Mieux vaut refuser que rendre cela.
    const reclamantes = Object.entries(TACHES).filter(([, f]) => f.base).map(([t]) => t);
    expect(reclamantes.length, "la table doit porter des tâches à modèle de base").toBeGreaterThan(0);
    for (const tache of reclamantes) {
      const r = appliquerTache(PLAN, { ...optionsCompletes(tache), modele: MODELE_RAPIDE });
      expect(r.ok, `${tache} sur le modèle rapide`).toBe(false);
      expect(r.erreur).toMatch(/modèle de base/);
    }
  });
});

describe("le guidage", () => {
  // MESURÉ, ET C'EST POURQUOI CE RÉGLAGE EXISTE : sur une voix seule, le guidage décide de tout.
  // À 1,0 la sortie corrèle à 0,964 avec la voix et deux descriptions opposées rendent presque le
  // même son, 0,9935 ; à 7,5 la corrélation tombe à 0,598 et les deux descriptions se séparent.
  it("n'est écrit que lorsqu'il est demandé", () => {
    expect(Object.hasOwn(appliquerTache(PLAN, {}).plan ?? {}, "guidance_scale")).toBe(false);
  });

  it("est écrit tel quel quand il l'est", () => {
    for (const guidage of [1, 4, 7.5, 10]) {
      expect(appliquerTache(PLAN, { guidage }).plan?.guidance_scale, `guidage ${guidage}`).toBe(guidage);
    }
  });

  it("ignore ce qui n'est pas un nombre, plutôt que d'écrire un champ illisible", () => {
    for (const guidage of [undefined, "fort", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(Object.hasOwn(appliquerTache(PLAN, { guidage }).plan ?? {}, "guidance_scale"),
        `guidage ${String(guidage)}`).toBe(false);
    }
  });
});

describe("le modèle de rendu", () => {
  // LE DÉFAUT QUE CES CAS EMPÊCHENT, mesuré en posant un second débruiteur dans le dossier des
  // modèles : `ace-synth` les enregistre tous les deux, et sans `synth_model` il prend le premier
  // par ordre de nom. Le journal annonçait alors `acestep-v15-base-Q6_K.gguf -> DiT` pour un rendu
  // réglé sur huit pas, qui est la valeur du modèle rapide. Un fichier déposé à côté changeait le
  // son sans que rien ne le dise.
  it("est nommé dans TOUTE requête de rendu, quelle que soit la tâche", () => {
    for (const tache of Object.keys(TACHES)) {
      const r = appliquerTache(PLAN, optionsCompletes(tache));
      expect(r.plan?.synth_model, `${tache} ne nomme pas son modèle`).toBeTruthy();
    }
  });

  it("est le modèle rapide par défaut, celui sur lequel les réglages sont taillés", () => {
    expect(appliquerTache(PLAN, {}).plan?.synth_model).toBe(MODELE_RAPIDE);
  });

  it("laisse un plan qui nomme déjà son modèle garder le sien", () => {
    const choisi = { ...PLAN, synth_model: "acestep-v15-base-Q6_K.gguf" };
    expect(appliquerTache(choisi, {}).plan?.synth_model).toBe("acestep-v15-base-Q6_K.gguf");
  });
});

describe("la plage de retouche", () => {
  it("écrit début et fin dans le plan", () => {
    const r = appliquerTache(PLAN, { tache: "repaint", audioSource: SOURCE, debut: 3, fin: 9 });
    expect(r.ok).toBe(true);
    expect(r.plan?.repainting_start).toBe(3);
    expect(r.plan?.repainting_end).toBe(9);
  });

  it("refuse une plage dont la fin n'est pas après le début, comme le moteur le ferait", () => {
    for (const [debut, fin] of [[6, 2], [4, 4]]) {
      const r = appliquerTache(PLAN, { tache: "repaint", audioSource: SOURCE, debut, fin });
      expect(r.ok, `[${debut}, ${fin}] devrait être refusée`).toBe(false);
      expect(r.erreur).toMatch(/fin/);
    }
  });

  it("refuse une retouche sans plage", () => {
    const r = appliquerTache(PLAN, { tache: "repaint", audioSource: SOURCE });
    expect(r.ok).toBe(false);
  });
});

describe("le prolongement", () => {
  it("ajoute avant le début par une plage négative", () => {
    // MESURÉ : sur une source de 11,84 s, la plage [-8, 0] rend 19,84 s.
    expect(plageProlongement("avant", 8, 11.84)).toEqual({ debut: -8, fin: 0 });
  });

  it("ajoute après la fin en partant de la durée de la source", () => {
    expect(plageProlongement("apres", 8, 11.84)).toEqual({ debut: 11.84, fin: 19.84 });
  });

  it("ne produit JAMAIS une plage que le moteur refuserait", () => {
    // C'est la propriété que ce calcul doit garantir, et elle est éprouvée sur les deux côtés,
    // des ajouts minuscules aux durées de source nulles.
    for (const cote of ["avant", "apres"]) {
      for (const ajout of [0.001, 0.5, 8, 600]) {
        for (const duree of [0, 0.1, 11.84, 3600]) {
          const p = plageProlongement(cote, ajout, duree);
          expect(p, `${cote} ${ajout} ${duree}`).not.toBeNull();
          expect(p!.fin, `${cote} ${ajout} ${duree}`).toBeGreaterThan(p!.debut);
        }
      }
    }
  });

  it("rend néant pour un ajout nul ou absurde, plutôt qu'une plage vide", () => {
    for (const ajout of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(plageProlongement("apres", ajout, 11.84), `ajout ${ajout}`).toBeNull();
    }
  });

  it("passe par la retouche, et le plan sort avec sa plage", () => {
    const r = appliquerTache(PLAN, {
      tache: "repaint", audioSource: SOURCE,
      prolongement: { cote: "avant", ajout: 8 }, dureeSource: 11.84,
    });
    expect(r.ok).toBe(true);
    expect(r.plan?.repainting_start).toBe(-8);
    expect(r.plan?.repainting_end).toBe(0);
  });

  it("refuse un prolongement nul plutôt que d'écrire une plage vide", () => {
    const r = appliquerTache(PLAN, {
      tache: "repaint", audioSource: SOURCE,
      prolongement: { cote: "apres", ajout: 0 }, dureeSource: 11.84,
    });
    expect(r.ok).toBe(false);
  });
});

describe("les dosages de reprise", () => {
  it("n'écrit les deux dosages que pour les reprises", () => {
    for (const tache of Object.keys(TACHES)) {
      const r = appliquerTache(PLAN, optionsCompletes(tache));
      const attendu = tache === "cover" || tache === "cover-nofsq";
      expect(Object.hasOwn(r.plan ?? {}, "audio_cover_strength"), `dosage sur ${tache}`).toBe(attendu);
      expect(Object.hasOwn(r.plan ?? {}, "cover_noise_strength"), `bruit sur ${tache}`).toBe(attendu);
    }
  });
});

describe("la graine de planification", () => {
  // LE DÉFAUT QUE CES CAS EMPÊCHENT, mesuré sur la vraie chaîne : la requête portait `seed` et
  // non `lm_seed`, donc le modèle de langue tirait sa propre graine au hasard. Deux planifications
  // de même graine rendaient 79 s à 111 BPM, puis 200 s à 158 BPM. Le réglage « Graine » promettait
  // un plan reproductible et ne le donnait pas.
  //
  // LA FORME DU PIÈGE, et c'est elle qu'on garde : DEUX champs de graine, un seul renseigné. Les
  // cas ci-dessous cherchent donc tout champ dont le nom se termine par `seed`, sans en nommer
  // aucun : un troisième champ de graine qui apparaîtrait dans le moteur tomberait ici.
  it("ne laisse JAMAIS un champ de graine partir sans les autres", () => {
    for (const graine of [0, 1, 7, 999999]) {
      const requete = requetePlanification({ description: "test", graine });
      const champs = champsDeGraine(requete);
      expect(champs.length, `graine ${graine} : aucun champ de graine`).toBeGreaterThan(1);
      for (const champ of champs) {
        expect(requete[champ], `${champ} pour la graine ${graine}`).toBe(graine);
      }
    }
  });

  it("n'écrit aucun champ de graine quand aucune graine n'est posée", () => {
    for (const graine of [-1, undefined, Number.NaN]) {
      const requete = requetePlanification({ description: "test", graine });
      expect(champsDeGraine(requete), `graine ${graine}`).toEqual([]);
    }
  });

  it("porte les deux champs que le moteur honore", () => {
    // Mesuré : `lm_seed` posé, deux appels rendent un plan identique à l'octet.
    expect(champsDeGraine(requetePlanification({ graine: 3 }))).toEqual(["lm_seed", "seed"]);
  });
});

describe("le mode de planification", () => {
  it("écrit chacun des modes que le moteur connaît", () => {
    for (const mode of Object.keys(MODES)) {
      expect(requetePlanification({ mode }).lm_mode, mode).toBe(mode);
    }
  });

  it("n'écrit aucun mode quand il est absent ou inconnu", () => {
    for (const mode of [undefined, "", "reecrire", "GENERATE"]) {
      expect(Object.hasOwn(requetePlanification({ mode }), "lm_mode"), `mode ${mode}`).toBe(false);
    }
  });
});

describe("le plan reçu", () => {
  it("n'est jamais modifié, car le même plan se rend plusieurs fois", () => {
    const original = { ...PLAN };
    appliquerTache(PLAN, optionsCompletes("repaint"));
    appliquerTache(PLAN, optionsCompletes("cover"));
    expect(PLAN).toEqual(original);
  });

  it("garde ce que le planificateur a décidé", () => {
    const r = appliquerTache(PLAN, optionsCompletes("cover"));
    expect(r.plan?.caption).toBe(PLAN.caption);
    expect(r.plan?.duration).toBe(PLAN.duration);
  });
});
