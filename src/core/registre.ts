// core/registre.ts — Registre de plugins ET de types de flux, instancié et typé par domaine.
//
// `creerRegistre<TV, TR>()` retourne un registre cloisonné contenant :
//  - les fiches de plugins (Map par id)
//  - les types de flux (Map par id)
//
// Deux registres sont étanches : un type de flux "nombre" dans le domaine
// nombre n'écrase pas un type "nombre" dans un autre domaine.
import type { PluginDef, FonctionPlugin } from "./types";
import type { TypeFlux } from "./typesFlux";
import { valider } from "./validation";

export interface Registre<TV, TR> {
  enregistrer(def: PluginDef<TV, TR>): void;
  trouverDef(id: string): PluginDef<TV, TR> | undefined;
  trouverPlugin(id: string): FonctionPlugin<TV, TR> | undefined;
  tousLesPlugins(): PluginDef<TV, TR>[];
  desenregistrer(id: string): void;
  enregistrerTypeFlux(t: TypeFlux): void;
  typeFlux(id: string): TypeFlux | undefined;
  tousTypesFlux(): TypeFlux[];
  couleurFlux(id: string): string;
  fluxCompatibles(sourceId: string, cibleId: string): boolean;
}

const ALIAS: Record<string, string> = {
  "placer-son-zones": "placer-sons-zones",
  "dererverb": "dereverberation",
  "reverbe-progressive": "reverb-progressive",
  "melangeur-audio": "melangeur",
  "boite-a-rythmes": "boite-rythmes",
  "variateur-vitesse": "changement-tempo",
  "filtre": "reponse-filtre",
  "boucle": "simple-boucle",
  "fusionneur": "melangeur",
};

function resoudre(id: string): string {
  return ALIAS[id] ?? id;
}

export function creerRegistre<TV, TR>(): Registre<TV, TR> {
  const plugins: PluginDef<TV, TR>[] = [];
  const parId = new Map<string, PluginDef<TV, TR>>();
  const typesFlux = new Map<string, TypeFlux>();

  function enregistrer(def: PluginDef<TV, TR>): void {
    const { erreurs, avertissements } = valider(def, { typeFlux: (id: string) => typesFlux.get(id), fluxCompatibles });
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

  function enregistrerTypeFlux(t: TypeFlux): void {
    typesFlux.set(t.id, t);
  }

  function typeFlux(id: string): TypeFlux | undefined {
    return typesFlux.get(id);
  }

  function tousTypesFlux(): TypeFlux[] {
    return [...typesFlux.values()];
  }

  function couleurFlux(id: string): string {
    return typesFlux.get(id)?.couleur ?? "#999";
  }

  function fluxCompatibles(sourceId: string, cibleId: string): boolean {
    const t = typesFlux.get(sourceId);
    if (t?.compatible) return t.compatible(cibleId);
    return sourceId === cibleId;
  }

  return { enregistrer, trouverDef, trouverPlugin, tousLesPlugins, desenregistrer,
    enregistrerTypeFlux, typeFlux, tousTypesFlux, couleurFlux, fluxCompatibles };
}
