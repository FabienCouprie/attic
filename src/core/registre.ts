// core/registre.ts — Registre de plugins instancié par domaine.
//
// `creerRegistre<TV, TR>()` retourne un objet avec les mêmes méthodes que
// l'ancien registre global : enregistrer, trouverDef, trouverPlugin,
// tousLesPlugins, desenregistrer. L'adaptateur de domaine est le seul à
// appeler `enregistrer` — les modules de plugins exportent leurs fiches,
// l'adaptateur les enregistre.
//
// Les fiches sont stockées effacées en `PluginDef<unknown, unknown>` (pas
// `any`) : le domaine prouve le type à la frontière (cf. audio/index.ts).
import type { PluginDef, FonctionPlugin } from "./types";
import { valider } from "./validation";

export interface Registre {
  enregistrer<TV, TR>(def: PluginDef<TV, TR>): void;
  trouverDef(id: string): PluginDef<unknown, unknown> | undefined;
  trouverPlugin(id: string): FonctionPlugin<unknown, unknown> | undefined;
  tousLesPlugins(): PluginDef<unknown, unknown>[];
  desenregistrer(id: string): void;
}

// Migration d'identifiants : anciens id (workflows sauvegardés / ancien projet)
// → id actuel. Permet de recharger un graphe qui référence un nœud renommé.
const ALIAS: Record<string, string> = {
  "placer-son-zones": "placer-sons-zones",
  "dererverb": "dereverberation",
  "reverbe-progressive": "reverb-progressive",
  "melangeur-audio": "melangeur",
  "boite-a-rythmes": "boite-rythmes",
  "variateur-vitesse": "changement-tempo",
  "filtre": "reponse-filtre",
};

function resoudre(id: string): string {
  return ALIAS[id] ?? id;
}

export function creerRegistre(): Registre {
  const plugins: PluginDef<unknown, unknown>[] = [];
  const parId = new Map<string, PluginDef<unknown, unknown>>();

  function enregistrer<TV, TR>(def: PluginDef<TV, TR>): void {
    const { erreurs, avertissements } = valider(def);
    if (erreurs.length) {
      console.error(`[attic] Plugin « ${def.id || "?"} » invalide : ${erreurs.join(" ; ")} — non enregistré.`);
      return;
    }
    const erased = def as unknown as PluginDef<unknown, unknown>;
    const existant = parId.get(def.id);
    if (existant) {
      const idx = plugins.indexOf(existant);
      if (idx >= 0) plugins[idx] = erased;
      parId.set(def.id, erased);
      return;
    }
    if ((import.meta as any).env?.DEV && avertissements.length) {
      console.warn(`[attic] Plugin « ${def.id} » — documentation incomplète : ${avertissements.join(" ; ")}`);
    }
    plugins.push(erased);
    parId.set(def.id, erased);
  }

  function trouverPlugin(id: string): FonctionPlugin<unknown, unknown> | undefined {
    return parId.get(resoudre(id))?.executer;
  }

  function trouverDef(id: string): PluginDef<unknown, unknown> | undefined {
    return parId.get(resoudre(id));
  }

  function tousLesPlugins(): PluginDef<unknown, unknown>[] {
    return plugins;
  }

  function desenregistrer(id: string): void {
    const def = parId.get(id);
    if (!def) return;
    parId.delete(id);
    const idx = plugins.indexOf(def);
    if (idx >= 0) plugins.splice(idx, 1);
  }

  return { enregistrer, trouverDef, trouverPlugin, tousLesPlugins, desenregistrer };
}
