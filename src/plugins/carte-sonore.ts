// plugins/carte-sonore.ts — Le nœud : un dossier de sons, et la carte qui en sort.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

import { mulberry32, shuffle } from "./carte-sonore-formes";
import type { Esthetique, StyleCarte } from "./carte-sonore-formes";
import { genererCarteVille } from "./carte-sonore-plan-ville";
import { genererCarteConcentrique, genererCarteOrganique, genererCarteVoronoi } from "./carte-sonore-plan-cellulaire";
import { safeFileName } from "./carte-sonore-svg";
import { genererHtmlCarte } from "./carte-sonore-page";

const EXTENSIONS_AUDIO = [".wav", "wave", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm"];


export const fiches: FicheAudio[] = ([
  {
    id: "carte-sonore", nom: "Carte sonore", nomEn: "Sound Map", univers: "Collections", famille: "Export",
    resume: "Charge un dossier audio et génère une carte HTML interactive d'une ville fictive ou d'une carte concentrique, avec plusieurs esthétiques, ouvrable dans le navigateur.",
    resumeEn: "Loads an audio folder and generates an interactive HTML map of a fictional city or a concentric map with several aesthetics, openable in a browser.",
    affichageAutonome: true,
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "dossier", defaut: "music collection", defautEn: "music collection",
        doc: "Dossier audio source.", docEn: "Source audio folder." },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Dossier où générer index.html et copier les sons.", docEn: "Folder where index.html and the sounds will be generated." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Carte sonore", defautEn: "Sound Map",
        doc: "Titre de la page HTML.", docEn: "Title of the HTML page." },
      { nom: "Style", nomEn: "Style", type: "choix", options: ["Ville en grille", "Cercles concentriques", "Organique", "Voronoi"], optionsEn: ["Grid city", "Concentric circles", "Organic", "Voronoi"], optionIds: ["ville", "concentrique", "organique", "voronoi"], defaut: "Ville en grille", defautEn: "Grid city",
        doc: "Style de la carte.", docEn: "Map style." },
      { nom: "Esthétique", nomEn: "Aesthetic", type: "choix", options: ["Classique", "Baroque", "Art nouveau", "Art déco", "Exotique"], optionsEn: ["Classic", "Baroque", "Art Nouveau", "Art Deco", "Exotic"], optionIds: ["classique", "baroque", "art-nouveau", "art-deco", "exotique"], defaut: "Classique", defautEn: "Classic",
        doc: "Ambiance visuelle de la carte.", docEn: "Visual mood of the map." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [0, 9999], pas: 1, defaut: 0,
        doc: "Graine de la carte (0 = carte différente à chaque exécution).", docEn: "Map seed (0 = new map each run)." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireDossier || !api?.ecrireFichier) return { valeurs: [], message: traduire("msg.n_cessite_electron") };

      const chemin = ctx.paramTexte("Chemin", "music collection").replace(/^[/\\]+|[/\\]+$/g, "");
      const sortie = ctx.paramTexte("Dossier sortie", "").replace(/^[/\\]+|[/\\]+$/g, "");
      const titre = ctx.paramTexte("Titre", "Carte sonore");
      const styleId = ctx.paramTexte("Style", "ville");
      const style = (["ville", "concentrique", "organique", "voronoi"] as StyleCarte[]).includes(styleId as StyleCarte)
        ? (styleId as StyleCarte)
        : "ville";
      const esthetiqueId = ctx.paramTexte("Esthétique", "classique");
      const esthetique = (["classique", "baroque", "art-nouveau", "art-deco", "exotique"] as Esthetique[]).includes(esthetiqueId as Esthetique)
        ? (esthetiqueId as Esthetique)
        : "classique";
      const graineParam = ctx.paramNombre("Graine", 0);
      const graine = graineParam > 0 ? graineParam : Math.floor(Math.random() * 99999) + 1;

      if (!chemin) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_sp_cifi") };
      if (!sortie) return { valeurs: [], message: traduire("msg.aucun_r_pertoire_de_sortie_sp_cifi") };

      ctx.onProgress(traduire("progress.lecture_du_r_pertoire"));
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(chemin)) ?? [];
      fichiers = fichiers.filter((f: any) => {
        const ext = f.nom.slice(f.nom.lastIndexOf(".")).toLowerCase();
        return EXTENSIONS_AUDIO.includes(ext);
      });
      if (fichiers.length === 0) return { valeurs: [], message: traduire("msg.aucun_fichier_audio_dans_var_0", chemin) };

      const maxPoints = Math.min(400, fichiers.length);
      const selection = shuffle(fichiers, mulberry32(graine)).slice(0, maxPoints);
      const pointInputs = selection.map((f) => ({ nom: f.nom, chemin: f.chemin }));
      const carte = style === "concentrique"
        ? genererCarteConcentrique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "organique"
        ? genererCarteOrganique(graine, 1920, 1080, pointInputs, esthetique)
        : style === "voronoi"
        ? genererCarteVoronoi(graine, 1920, 1080, pointInputs, esthetique)
        : genererCarteVille(graine, 1920, 1080, pointInputs, esthetique);

      ctx.onProgress(traduire("progress.g_n_ration_de_la_carte"));
      const html = genererHtmlCarte(carte, titre, selection);

      const dossierSortie = sortie.replace(/\\/g, "/");
      const htmlPath = `${dossierSortie}/index.html`;
      const htmlOk = await api.ecrireFichier(htmlPath, html);

      let copies = 0;
      if (api.copierFichier) {
        for (const f of selection) {
          ctx.onProgress(traduire("progress.copie_audio_var_0", f.nom));
          const cible = `${dossierSortie}/audio/${safeFileName(f.nom)}`;
          const res = await api.copierFichier(f.chemin, cible);
          if (res) copies++;
        }
      }

      // Pas de blob téléchargeable : le HTML référence ses fichiers audio en
      // chemins relatifs (`audio/xxx.mp3`, copiés à côté d'index.html sur
      // disque) — un téléchargement isolé du blob romprait ces liens. Seul
      // « Ouvrir dans le navigateur » (le vrai fichier sur disque, aux côtés
      // de son dossier audio/) donne un résultat qui fonctionne.
      (ctx.noeud.data as any)._carteHtmlPath = htmlPath;
      (ctx.noeud.data as any)._carteSonore = carte;
      (ctx.noeud.data as any)._carteSonoreGraine = graine;

      return { valeurs: [], message: traduire("msg.carte_sonore_g_n_r_e_var_0_index_html_var_1_points_var_2_audio_copi", htmlPath, carte.points.length, copies, htmlOk ? "HTML écrit ✓" : "HTML échec ✗") };
    },
  },
] as FicheAudio[]).map(avecDoc);

