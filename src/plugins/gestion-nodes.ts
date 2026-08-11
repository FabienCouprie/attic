// plugins/gestion-nodes.ts — Nœud « Gestionnaire de nodes » :
// exporte un node existant en .zip et importe un node depuis un .zip.
// Permet de partager des nodes entre installations d'Attic.

import type { Registre, TypeValeur } from "../core";
import { traduire } from "../i18n";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { installerNode } from "../core";

// Injection : l'adaptateur configure le registre au démarrage.
// Ce plugin est un outil d'administration (export/import .zip) qui accède
// au registre — ce n'est pas un plugin de traitement.
let registre: Registre<TypeValeur, AudioContext> | null = null;
export function configurerRegistreGestion(r: Registre<TypeValeur, AudioContext>): void { registre = r; }

// Récupère les 5 derniers plugins au moment de l'appel (pas au chargement du module)
function getPluginsRecents(): string[] {
  return registre!.tousLesPlugins()
    .filter((p) => !p.id.startsWith("__") && !p.id.startsWith("meta-") && !p.id.startsWith("frontiere"))
    .slice(-5)
    .map((p) => `${p.id} — ${p.nom}`);
}

export const fiches: FicheAudio[] = ([
  {
    id: "gestion-nodes", nom: "Gestionnaire de nodes", nomEn: "Node Manager",
    univers: "Autres", famille: "Installation",
    resume: "Exporte un node en .zip ou importe un node depuis un .zip.",
    resumeEn: "Exports a node as .zip or imports a node from a .zip.",
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Action", nomEn: "Action", type: "choix",
        options: ["Exporter", "Importer"], optionIds: ["Exporter","Importer"], optionsEn: ["Export", "Import"],
        defaut: "Exporter",
        doc: "Exporter = créer un .zip d'un node existant. Importer = installer un node depuis un .zip.",
        docEn: "Export = create a .zip of an existing node. Import = install a node from a .zip.", defautEn: "Export" },
      { nom: "Node à exporter", nomEn: "Node to export", type: "choix",
        options: [], optionsEn: [],
        defaut: "",
        doc: "Sélectionnez le node à exporter parmi les 5 derniers créés. La liste se met à jour à chaque exécution.",
        docEn: "Select the node to export from the 5 most recently created. The list updates on each run.", defautEn: "" },
    ],
    async executer(ctx: any) {
      const action = ctx.paramTexte("Action", "Exporter");
      const api = (window as any).api;

      // Mettre à jour la liste des nodes disponibles à chaque exécution
      const recents = getPluginsRecents();
      const defGestion = registre!.trouverDef("gestion-nodes");
      if (defGestion && defGestion.parametres[1]) {
        defGestion.parametres[1].options = recents.length > 0 ? recents : ["(aucun node disponible)"];
        defGestion.parametres[1].optionsEn = recents.length > 0 ? recents : ["(no node available)"];
      }

      if (action === "Exporter") {
        const selection = ctx.paramTexte("Node à exporter", "");
        const nodeId = selection.split(" — ")[0].trim();
        if (!nodeId || nodeId === "(aucun") return { valeurs: [], message: traduire("msg.lancez_une_premi_re_fois_pour_peupler_la_liste_puis_s_lectio") };
        const nodeDef = registre!.trouverDef(nodeId);
        if (!nodeDef) return { valeurs: [], message: traduire("msg.node_var_0_introuvable", nodeId) };

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
          return { valeurs: [], message: traduire("msg.mode_web_l_export_zip_n_cessite_electron_node_var_0_var_1_d_", nodeId, manifest.dependencies.length, manifest.dependencies.join(", ") || "aucune") };
        }

        ctx.onProgress(traduire("progress.g_n_ration_du_zip"));
        const outputPath = await api.sauvegarderNodeZip({ defaultPath: `${nodeId}.zip` });
        if (!outputPath) return { valeurs: [], message: traduire("msg.export_annul") };

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
          return { valeurs: [], message: traduire("msg.node_var_0_export_var_1_var_2_d_pendance_s_var_3", nodeId, res.path, manifest.dependencies.length, depsInfo) };
        } else {
          return { valeurs: [], message: traduire("msg.chec_export_var_0", res?.erreur || "erreur inconnue") };
        }

      } else {
        // Importer
        if (!api?.importerNodeZip) {
          return { valeurs: [], message: traduire("msg.l_import_n_cessite_electron") };
        }

        // Sélectionner le fichier zip via dialogue Electron
        ctx.onProgress(traduire("progress.s_lection_du_fichier_zip"));
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
          if (!fichier) return { valeurs: [], message: traduire("msg.import_annul") };
          zipPath = api.cheminFichier ? api.cheminFichier(fichier) : null;
        }

        if (!zipPath) return { valeurs: [], message: traduire("msg.import_annul") };

        ctx.onProgress(traduire("progress.d_compression_du_zip"));
        const res = await api.importerNodeZip(zipPath);
        if (!res?.ok) return { valeurs: [], message: traduire("msg.chec_import_var_0", res?.erreur || "erreur inconnue") };

        // Installer le node
        ctx.onProgress(traduire("progress.installation_du_node"));
        installerNode({
          manifest: res.manifest,
          executerCode: res.executerCode,
          notice: res.notice,
          noticeText: res.notice?.fr,
          noticeTextEn: res.notice?.en,
        });

        // Signaler à l'UI de rafraîchir la palette
        (ctx.noeud.data as any)._nodeInstalle = true;

        return { valeurs: [], message: traduire("msg.node_var_0_install_var_1_var_2_var_3_var_4_d_pendance_s_var_", res.manifest.id, res.manifest.nom, res.manifest.univers, res.manifest.famille, res.dependencies?.length || 0, (res.dependencies || []).join(", ") || "aucune") };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
