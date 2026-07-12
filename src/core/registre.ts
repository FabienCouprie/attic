// core/registre.ts — Registre global des plugins
import type { PluginDef, FonctionPlugin } from "./types";

const plugins: PluginDef[] = [];
const parId = new Map<string, PluginDef>();

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

// Contrôle qu'une fiche est complète (cf. spec §3.9 : documentation obligatoire).
// Les erreurs bloquent la présence au catalogue ; les avertissements signalent
// une documentation incomplète sans casser l'application.
function valider(def: PluginDef): { erreurs: string[]; avertissements: string[] } {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  if (!def.id) erreurs.push("id manquant");
  if (!def.nom) erreurs.push("nom manquant");
  if (!def.resume) erreurs.push("résumé manquant");
  if (typeof def.executer !== "function") erreurs.push("fonction executer manquante");
  if (!def.notice) avertissements.push("notice absente");
  for (const p of def.parametres ?? []) {
    if (!p.doc && !p.docEn) avertissements.push(`paramètre « ${p.nom} » sans documentation`);
  }
  return { erreurs, avertissements };
}

export function enregistrer(def: PluginDef): void {
  const { erreurs, avertissements } = valider(def);
  if (erreurs.length) {
    console.error(`[attic] Plugin « ${def.id || "?"} » invalide : ${erreurs.join(" ; ")} — non enregistré.`);
    return;
  }
  const existant = parId.get(def.id);
  if (existant) {
    // Remplacement en place : même id déjà présent. Couvre le rechargement à
    // chaud (Vite HMR ré-exécute les modules de plugins) sans dupliquer l'entrée
    // dans la palette ni spammer la console. En production, un seul enregistrement
    // par id a lieu de toute façon.
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

// Résolution alias-consciente : accepte un id actuel ou un ancien id.
export function trouverPlugin(id: string): FonctionPlugin | undefined {
  return parId.get(resoudre(id))?.executer;
}

export function trouverDef(id: string): PluginDef | undefined {
  return parId.get(resoudre(id));
}

export function tousLesPlugins(): PluginDef[] {
  return plugins;
}

// Retire une fiche du catalogue (utilisé pour supprimer un méta-composant).
export function desenregistrer(id: string): void {
  const def = parId.get(id);
  if (!def) return;
  parId.delete(id);
  const idx = plugins.indexOf(def);
  if (idx >= 0) plugins.splice(idx, 1);
}
