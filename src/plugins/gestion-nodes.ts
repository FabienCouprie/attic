// plugins/gestion-nodes.ts — Nœud « Gestionnaire de nodes » :
// exporte un node existant en .zip et importe un node depuis un .zip.
// Permet de partager des nodes entre installations d'Attic.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { installerNode, registreActif } from "../core";

// Récupère les 5 derniers plugins au moment de l'appel (pas au chargement du module)
function getPluginsRecents(): string[] {
  return registreActif().tousLesPlugins()
    .filter((p) => !p.id.startsWith("__") && !p.id.startsWith("meta-") && !p.id.startsWith("frontiere"))
    .slice(-5)
    .map((p) => `${p.id} — ${p.nom}`);
}

export const fiches: PluginDef[] = ([
  {
    id: "gestion-nodes", nom: "Gestionnaire de nodes", nomEn: "Node Manager",
    univers: "Nouvelles fonctionnalités", famille: "Installation",
    resume: "Exporte un node en .zip ou importe un node depuis un .zip.",
    resumeEn: "Exports a node as .zip or imports a node from a .zip.",
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Action", nomEn: "Action", type: "choix",
        options: ["Exporter", "Importer"], optionsEn: ["Export", "Import"],
        defaut: "Exporter",
        doc: "Exporter = créer un .zip d'un node existant. Importer = installer un node depuis un .zip.",
        docEn: "Export = create a .zip of an existing node. Import = install a node from a .zip." },
      { nom: "Node à exporter", nomEn: "Node to export", type: "choix",
        options: [], optionsEn: [],
        defaut: "",
        doc: "Sélectionnez le node à exporter parmi les 5 derniers créés. La liste se met à jour à chaque exécution.",
        docEn: "Select the node to export from the 5 most recently created. The list updates on each run." },
    ],
    async executer(ctx: any) {
      const action = ctx.paramTexte("Action", "Exporter");
      const api = (window as any).api;

      // Mettre à jour la liste des nodes disponibles à chaque exécution
      const recents = getPluginsRecents();
      const defGestion = registreActif().trouverDef("gestion-nodes");
      if (defGestion && defGestion.parametres[1]) {
        defGestion.parametres[1].options = recents.length > 0 ? recents : ["(aucun node disponible)"];
        defGestion.parametres[1].optionsEn = recents.length > 0 ? recents : ["(no node available)"];
      }

      if (action === "Exporter") {
        const selection = ctx.paramTexte("Node à exporter", "");
        const nodeId = selection.split(" — ")[0].trim();
        if (!nodeId || nodeId === "(aucun") return { valeurs: [], message: "Lancez une première fois pour peupler la liste, puis sélectionnez un node et relancez." };
        const nodeDef = registreActif().trouverDef(nodeId);
        if (!nodeDef) return { valeurs: [], message: `Node « ${nodeId} » introuvable.` };

        // Construire le manifest
        const manifest = {
          id: nodeDef.id,
          nom: nodeDef.nom,
          nomEn: nodeDef.nomEn,
          univers: nodeDef.univers,
          famille: nodeDef.famille,
          resume: nodeDef.resume,
          resumeEn: nodeDef.resumeEn,
          entrees: nodeDef.entrees,
          sorties: nodeDef.sorties,
          parametres: nodeDef.parametres.map((p: any) => ({
            nom: p.nom, nomEn: p.nomEn, type: p.type, options: p.options, optionsEn: p.optionsEn,
            plage: p.plage, pas: p.pas, defaut: p.defaut, unite: p.unite, doc: p.doc, docEn: p.docEn,
          })),
          dependencies: [] as string[],
        };

        // Extraire le code de la fonction executer
        let fnCode = nodeDef.executer?.toString() || "";
        // Normaliser : "async function exec(ctx) {" → "async function(ctx) {"
        // ou "async exec(ctx) {" → "async function(ctx) {"
        // ou "async (ctx) => {" → "async (ctx) => {"
        fnCode = fnCode
          .replace(/^async\s+(\w+)\s*\(/, "async function(")  // async name( → async function(
          .replace(/^async\s+function\s+(\w+)\s*\(/, "async function("); // async function name( → async function(
        const executerCode = `module.exports = ${fnCode};\n`;

        // Notice
        const notice = (nodeDef.notice || nodeDef.resume) ? { fr: nodeDef.notice || nodeDef.resume, en: nodeDef.noticeEn || nodeDef.resumeEn || nodeDef.resume } : null;

        // Dépendances — analyser le code
        const imports = fnCode.match(/from\s+["']([^"']+)["']/g) || [];
        const deps = imports.map((s: string) => {
          const m = s.match(/["']([^"']+)["']/);
          return m ? m[1] : null;
        }).filter(Boolean) as string[];
        manifest.dependencies = [...new Set(deps)].filter((d: string) => !d.startsWith(".") && !d.startsWith(".."));

        // Vérifier si le code est autonome (pas d'imports internes)
        const hasInternalImports = fnCode.includes("import(") || fnCode.includes("from \"../");
        if (hasInternalImports) {
          manifest.dependencies.push("__requires_attic_internals__");
        }

        if (!api?.sauvegarderNodeZip || !api?.exporterNodeZip) {
          return { valeurs: [], message: `⚠ Mode web — l'export .zip nécessite Electron.\nNode « ${nodeId} » · ${manifest.dependencies.length} dépendance(s) : ${manifest.dependencies.join(", ") || "aucune"}` };
        }

        ctx.onProgress("Génération du .zip…");
        const outputPath = await api.sauvegarderNodeZip({ defaultPath: `${nodeId}.zip` });
        if (!outputPath) return { valeurs: [], message: "Export annulé." };

        let assetsDir = null;
        if (api.cheminAssetsNode) assetsDir = await api.cheminAssetsNode(nodeId);

        const res = await api.exporterNodeZip({
          manifest,
          executerCode,
          notice,
          dependencies: manifest.dependencies,
          assetsDir,
          outputPath,
        });

        if (res?.ok) {
          const depsInfo = manifest.dependencies.length > 0 ? manifest.dependencies.join(", ") : "aucune (code autonome)";
          return { valeurs: [], message: `✓ Node « ${nodeId} » exporté\n📁 ${res.path}\n📦 ${manifest.dependencies.length} dépendance(s) : ${depsInfo}` };
        } else {
          return { valeurs: [], message: `✗ Échec export : ${res?.erreur || "erreur inconnue"}` };
        }

      } else {
        // Importer
        if (!api?.importerNodeZip) {
          return { valeurs: [], message: "L'import nécessite Electron." };
        }

        // Sélectionner le fichier zip via dialogue Electron
        ctx.onProgress("Sélection du fichier .zip…");
        let zipPath: string | null = null;
        if (api.selectionnerNodeZip) {
          zipPath = await api.selectionnerNodeZip();
        } else {
          // Fallback : input file web
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".zip";
          const fichier = await new Promise<File | null>((resolve) => {
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          });
          if (!fichier) return { valeurs: [], message: "Import annulé." };
          zipPath = api.cheminFichier ? api.cheminFichier(fichier) : null;
        }

        if (!zipPath) return { valeurs: [], message: "Import annulé." };

        ctx.onProgress("Décompression du .zip…");
        const res = await api.importerNodeZip(zipPath);
        if (!res?.ok) return { valeurs: [], message: `✗ Échec import : ${res?.erreur || "erreur inconnue"}` };

        // Installer le node
        ctx.onProgress("Installation du node…");
        installerNode({
          manifest: res.manifest,
          executerCode: res.executerCode,
          notice: res.notice,
          noticeText: res.notice?.fr,
          noticeTextEn: res.notice?.en,
        });

        // Signaler à l'UI de rafraîchir la palette
        (ctx.noeud.data as any)._nodeInstalle = true;

        return { valeurs: [], message: `✓ Node « ${res.manifest.id} » installé\n${res.manifest.nom} · ${res.manifest.univers}/${res.manifest.famille}\n📦 ${res.dependencies?.length || 0} dépendance(s) : ${(res.dependencies || []).join(", ") || "aucune"}` };
      }
    },
  },
] as PluginDef[]).map(avecDoc);
