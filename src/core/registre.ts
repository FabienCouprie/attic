// core/registre.ts — Registre de plugins instancié et TYPÉ par domaine.
//
// `creerRegistre<TV, TR>()` retourne un registre où `trouverDef` renvoie
// `PluginDef<TV, TR> | undefined` — sans cast. Le domaine prouve son type
// à la construction, pas à chaque appel.
import type { PluginDef, FonctionPlugin } from "./types";
import { valider } from "./validation";

export interface Registre<TV, TR> {
  enregistrer(def: PluginDef<TV, TR>): void;
  trouverDef(id: string): PluginDef<TV, TR> | undefined;
  trouverPlugin(id: string): FonctionPlugin<TV, TR> | undefined;
  tousLesPlugins(): PluginDef<TV, TR>[];
  desenregistrer(id: string): void;
}

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

export function creerRegistre<TV, TR>(): Registre<TV, TR> {
  const plugins: PluginDef<TV, TR>[] = [];
  const parId = new Map<string, PluginDef<TV, TR>>();

  function enregistrer(def: PluginDef<TV, TR>): void {
    const { erreurs, avertissements } = valider(def);
    if (erreurs.length) {
      console.error(`[attic] Plugin « ${def.id || "?"} » invalide : ${erreurs.join(" ; ")} — non enregistré.`);
      return;
    }
    const existant = parId.get(def.id);
    if (existant) {
      const idx = plugins.indexOf(existant);
      if (idx >= 0) plugins[idx] = def;
      parId.set(def.id, def);
      return;
    }
    if ((import.meta as any).env?.DEV && avertissements.length) {
      console.warn(`[attic] Plugin « ${def.id} » — documentation incomplète : ${avertissements.join(" ; ")}`);
    }
    plugins.push(def);
    parId.set(def.id, def);
  }

  function trouverPlugin(id: string): FonctionPlugin<TV, TR> | undefined {
    return parId.get(resoudre(id))?.executer;
  }

  function trouverDef(id: string): PluginDef<TV, TR> | undefined {
    return parId.get(resoudre(id));
  }

  function tousLesPlugins(): PluginDef<TV, TR>[] {
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
