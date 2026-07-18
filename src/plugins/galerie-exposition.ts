// plugins/galerie-exposition.ts — Nœud « Galerie d'exposition » :
// génère une galerie HTML visuelle avec pochettes procédurales par piste,
// lecteurs intégrés, métadonnées et design vitrine. Exposable sur le web ou en local.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

// Couleurs déduites du nom de piste (même logique que le générateur de pochette)
function palettePiste(nom: string, graine: number): string[] {
  const texte = nom.toLowerCase();
  let r = graine | 0;
  const rng = () => { r = (r + 0x6D2B79F5) | 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const palettes: { mots: string[]; couleurs: string[] }[] = [
    { mots: ["rock", "metal", "feu", "rouge", "energie"], couleurs: ["#e63946", "#f4a261", "#1a1a2e"] },
    { mots: ["blue", "blues", "mer", "ocean", "froid", "triste"], couleurs: ["#0d1b2a", "#1b4965", "#5fa8d3"] },
    { mots: ["nature", "vert", "foret", "folk", "acoustic"], couleurs: ["#1b4332", "#2d6a4f", "#95d5b2"] },
    { mots: ["night", "noir", "dark", "electro", "techno"], couleurs: ["#0a0a0a", "#1a1a2e", "#e94560"] },
    { mots: ["sun", "jaune", "jour", "pop", "happy"], couleurs: ["#f9c80e", "#f86624", "#ea3546"] },
    { mots: ["dream", "violet", "reve", "ambient", "mystere"], couleurs: ["#2d1b69", "#6c5ce7", "#a29bfe"] },
    { mots: ["love", "rose", "amour", "romance"], couleurs: ["#ff006e", "#fb5607", "#ffbe0b"] },
    { mots: ["jazz", "saxo", "soul", "funk"], couleurs: ["#3e2723", "#8b5a2b", "#d4a574"] },
  ];
  for (const p of palettes) {
    for (const mot of p.mots) { if (texte.includes(mot)) return p.couleurs; }
  }
  const hue = Math.floor(rng() * 360);
  return [`hsl(${hue},65%,15%)`, `hsl(${(hue + 40) % 360},60%,45%)`, `hsl(${(hue + 80) % 360},55%,65%)`];
}

// Génère un SVG de pochette procédurale pour une piste (inline, pas de fichier externe)
function pochetteSVG(nom: string, index: number, graine: number): string {
  const [c1, c2, c3] = palettePiste(nom, graine + index);
  const styles = ["degrade", "cercles", "bauhaus", "grille", "vagues"];
  const style = styles[(graine + index) % styles.length];
  let r = graine | 0;
  const rng = () => { r = (r + 0x6D2B79F5) | 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  let corps = "";
  if (style === "degrade") {
    corps = `<defs><linearGradient id="g${index}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="0.5" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g${index})"/>`;
  } else if (style === "cercles") {
    corps = `<rect width="200" height="200" fill="${c1}"/>`;
    for (let i = 8; i >= 0; i--) { const rad = (i / 8) * 140; corps += `<circle cx="100" cy="100" r="${rad}" fill="${i % 2 === 0 ? c2 : c3}" opacity="0.7"/>`; }
  } else if (style === "bauhaus") {
    corps = `<rect width="200" height="200" fill="${c1}"/>`;
    for (let i = 0; i < 4; i++) {
      const x = rng() * 200, y = rng() * 200, s = 40 + rng() * 80;
      const col = [c2, c3, c1][Math.floor(rng() * 3)];
      const type = Math.floor(rng() * 3);
      if (type === 0) corps += `<circle cx="${x}" cy="${y}" r="${s/2}" fill="${col}"/>`;
      else if (type === 1) corps += `<rect x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" fill="${col}"/>`;
      else corps += `<polygon points="${x},${y-s/2} ${x-s/2},${y+s/2} ${x+s/2},${y+s/2}" fill="${col}"/>`;
    }
  } else if (style === "grille") {
    corps = `<rect width="200" height="200" fill="${c1}"/>`;
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) { if (rng() < 0.4) corps += `<rect x="${gx*40}" y="${gy*40}" width="40" height="40" fill="${rng() < 0.5 ? c2 : c3}"/>`; }
  } else {
    corps = `<rect width="200" height="200" fill="${c1}"/>`;
    for (let v = 0; v < 4; v++) { corps += `<path d="M0 ${60+v*35} Q50 ${40+v*35} 100 ${60+v*35} T200 ${60+v*35} V200 H0 Z" fill="${c2}" opacity="${0.3+v*0.15}"/>`; }
  }
  // Vignette + titre
  const titreCourt = nom.replace(/\.mp3$/i, "").substring(0, 20);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">${corps}<rect width="200" height="200" fill="url(#v${index})" opacity="0.3"/><text x="100" y="185" text-anchor="middle" fill="white" font-family="sans-serif" font-size="10" opacity="0.8">${titreCourt}</text><defs><radialGradient id="v${index}"><stop offset="0.5" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.4"/></radialGradient></defs></svg>`;
}

function genererGalerieHTML(titre: string, pistes: { nom: string; url: string; index: number }[], graine: number, pochettes?: { [nom: string]: string }): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const cards = pistes.map((p, i) => {
    const pochetteMp3 = pochettes?.[p.nom];
    const coverSrc = pochetteMp3 || (() => {
      const svg = pochetteSVG(p.nom, i, graine);
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    })();
    const nomPiste = p.nom.replace(/\.mp3$/i, "");
    return `
    <div class="card">
      <div class="card-cover"><img src="${coverSrc}" alt="${esc(nomPiste)}" width="200" height="200"/></div>
      <div class="card-body">
        <div class="card-num">${(i + 1).toString().padStart(2, "0")}</div>
        <div class="card-title">${esc(nomPiste)}</div>
        <audio controls preload="none" src="${esc(p.url)}"></audio>
        <a class="card-dl" href="${esc(p.url)}" download="${esc(p.nom)}">⬇ MP3</a>
      </div>
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titre)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#cbd5e1;min-height:100vh}
  .header{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:60px 20px;text-align:center;border-bottom:1px solid #21262d}
  .header h1{font-size:36px;font-weight:800;color:#f0f6fc;margin-bottom:8px;letter-spacing:-0.5px}
  .header .meta{font-size:14px;color:#8b949e}
  .header .badge{display:inline-block;margin-top:16px;padding:6px 16px;background:rgba(42,157,143,0.15);border:1px solid #2a9d8f;border-radius:20px;font-size:12px;color:#2a9d8f}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;max-width:1200px;margin:40px auto;padding:0 20px}
  .card{background:#161b22;border-radius:12px;overflow:hidden;transition:transform 0.2s,box-shadow 0.2s;border:1px solid #21262d}
  .card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,0.4);border-color:#2a9d8f}
  .card-cover{position:relative}
  .card-cover img{width:100%;aspect-ratio:1;object-fit:contain;display:block;background:#161b22}
  .card-body{padding:16px}
  .card-num{font-size:11px;font-weight:700;color:#2a9d8f;margin-bottom:4px}
  .card-title{font-size:14px;font-weight:600;color:#f0f6fc;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  audio{width:100%;height:36px;margin-bottom:8px}
  audio::-webkit-media-controls-panel{background-color:#21262d}
  .card-dl{display:inline-block;color:#8b949e;text-decoration:none;font-size:12px;padding:4px 12px;border:1px solid #30363d;border-radius:6px;transition:all 0.2s}
  .card-dl:hover{color:#2a9d8f;border-color:#2a9d8f}
  .footer{text-align:center;padding:40px 20px;font-size:12px;color:#484f58;border-top:1px solid #21262d;margin-top:40px}
  .footer a{color:#2a9d8f;text-decoration:none}
  @media(max-width:600px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header">
  <h1>${esc(titre)}</h1>
  <div class="meta">${pistes.length} piste(s) · Galerie d'exposition</div>
  <div class="badge">🎧 Jouable & téléchargeable</div>
</div>
<div class="grid">
${cards}
</div>
<div class="footer">Généré par <a href="#">Attic</a> le ${new Date().toLocaleDateString("fr-FR")} · ${pistes.length} pistes</div>
</body>
</html>`;
}

export const fiches: FicheAudio[] = ([
  {
    id: "galerie-exposition", nom: "Galerie d'exposition", nomEn: "Exhibition Gallery",
    univers: "Collections", famille: "Export",
    resume: "Génère une galerie HTML visuelle avec pochettes procédurales depuis un répertoire de MP3.",
    resumeEn: "Generates a visual HTML gallery with procedural cover art from a directory of MP3 files.",
    entrees: [],
    sorties: [],
    parametres: [
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "Ma galerie",
        doc: "Titre affiché en haut de la galerie.", docEn: "Title displayed at the top of the gallery." },
      { nom: "Répertoire MP3", nomEn: "MP3 directory", type: "dossier", defaut: "",
        doc: "Chemin du répertoire contenant les fichiers MP3 (uniquement des .mp3).",
        docEn: "Path to the directory containing MP3 files (.mp3 only)." },
      { nom: "Répertoire de sortie", nomEn: "Output directory", type: "dossier", defaut: "",
        doc: "Répertoire où générer la galerie (index.html + MP3 copiés).",
        docEn: "Directory where to generate the gallery (index.html + copied MP3s)." },
      { nom: "Graine visuelle", nomEn: "Visual seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine pour les pochettes procédurales (0 = aléatoire). Même graine = mêmes pochettes.",
        docEn: "Seed for procedural cover art (0 = random). Same seed = same covers." },
    ],
    async executer(ctx: any) {
      const titre = ctx.paramTexte("Titre", "Ma galerie");
      const repertoire = ctx.paramTexte("Répertoire MP3", "");
      const sortieDir = ctx.paramTexte("Répertoire de sortie", "");
      const graine = ctx.paramNombre("Graine visuelle", 0) || Math.floor(Math.random() * 99999) + 1;

      if (!repertoire) return { valeurs: [], message: "Aucun répertoire MP3 spécifié." };
      if (!sortieDir) return { valeurs: [], message: "Aucun répertoire de sortie spécifié." };

      const api = (window as any).api;
      if (!api?.lireDossier) return { valeurs: [], message: "Nécessite Electron." };

      ctx.onProgress("Lecture du répertoire…");
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(repertoire)) ?? [];
      fichiers = fichiers.filter((f: any) => f.nom.toLowerCase().endsWith(".mp3"));
      if (fichiers.length === 0) return { valeurs: [], message: `Aucun MP3 dans : ${repertoire}` };

      const pistes = fichiers.map((f: any, i: number) => {
        const safeNom = f.nom.replace(/[/\\]/g, "_").replace(/^\.+/, "");
        return {
          nom: safeNom,
          url: `mp3/${safeNom}`,
          index: i,
        };
      });

      ctx.onProgress("Génération de la galerie…");

      // Extraire les pochettes intégrées des MP3 (si disponibles)
      const pochettes: { [nom: string]: string } = {}; // nom → data URL
      if (api.extrairePochetteMp3) {
        for (let i = 0; i < fichiers.length; i++) {
          if (i % 10 === 0) ctx.onProgress(`Pochettes ${i}/${fichiers.length}…`);
          try {
            const res = await api.extrairePochetteMp3(fichiers[i].chemin);
            if (res?.ok && res?.data) {
              pochettes[fichiers[i].nom] = `data:${res.mime};base64,${res.data}`;
            }
          } catch {}
        }
      }

      const html = genererGalerieHTML(titre, pistes, graine, pochettes);
      const dossierSortie = sortieDir.replace(/\\/g, "/");

      // Écrire le HTML à la racine du répertoire de sortie
      const htmlOk = await api.ecrireFichier(`${dossierSortie}/index.html`, html);

      // Copier les MP3 dans un sous-répertoire "mp3/"
      const dossierMp3 = `${dossierSortie}/mp3`;
      let nbCopies = 0;
      if (api.copierFichier) {
        for (let i = 0; i < fichiers.length; i++) {
          ctx.onProgress(`Copie MP3 ${i + 1}/${fichiers.length}…`);
          const safeNom = fichiers[i].nom.replace(/[/\\]/g, "_").replace(/^\.+/, "");
          const res = await api.copierFichier(fichiers[i].chemin, `${dossierMp3}/${safeNom}`);
          if (res) nbCopies++;
        }
      }

      // Stocker pour la vue (aperçu + téléchargement HTML)
      (ctx.noeud.data as any)._galerieHTML = html;
      (ctx.noeud.data as any)._galeriePistes = pistes;

      return { valeurs: [], message: `Galerie générée : ${dossierSortie}/index.html\n${pistes.length} pistes · ${nbCopies} MP3 copiés dans mp3/ · ${htmlOk ? "HTML écrit ✓" : "HTML échec ✗"}` };
    },
  },
] as FicheAudio[]).map(avecDoc);
