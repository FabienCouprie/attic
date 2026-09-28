// plugins/carte-sonore-page.ts — La page qui porte la carte et ses sons.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import type { CarteSonore } from "./carte-sonore-formes";
import { palettePour } from "./carte-sonore-decor";
import { escapeHtml, pathString, polygonPath, renderBatimentConcentrique, renderBatimentGrid, renderDecoration, safeFileName } from "./carte-sonore-svg";
import { renderMotifs } from "./carte-sonore-motifs";

export function genererHtmlCarte(carte: CarteSonore, titre: string, fichiers: { nom: string; chemin: string }[]): string {
  const palette = palettePour(carte.esthetique);
  const isConcentrique = carte.style === "concentrique";
  const hasGradient = !!palette.gradient && isConcentrique;

  const quartiersHtml = carte.quartiers.map((q) => {
    const fill = palette.quartiers[q.type] ?? palette.quartiers.defaut;
    if (q.d) return `<path d="${q.d}" fill="${fill}" stroke="none" />`;
    return `<rect x="${q.x.toFixed(1)}" y="${q.y.toFixed(1)}" width="${q.w.toFixed(1)}" height="${q.h.toFixed(1)}" fill="${fill}" stroke="none" />`;
  }).join("");

  const eauHtml = carte.eau.map((e) => {
    if (e.d) {
      return `<path d="${e.d}" fill="${palette.eau}" stroke="${palette.eauStroke}" stroke-width="1" />`;
    }
    if (e.type === "lac") {
      return `<path d="${polygonPath(e.points)}" fill="${palette.eau}" stroke="${palette.eauStroke}" stroke-width="1" />`;
    }
    return `<path d="${pathString(e.points)}" fill="none" stroke="${palette.eau}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const espacesVertsHtml = carte.espacesVerts.map((e) => {
    const fill = palette.quartiers.parc;
    const arbres = e.arbres?.map((a) => `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="${a.r.toFixed(1)}" fill="${palette.arbre}" />`).join("") ?? "";
    if (e.d) return `<path d="${e.d}" fill="${fill}" stroke="none" />${arbres}`;
    return `<ellipse cx="${e.cx.toFixed(1)}" cy="${e.cy.toFixed(1)}" rx="${e.rx.toFixed(1)}" ry="${e.ry.toFixed(1)}" fill="${fill}" stroke="none" />${arbres}`;
  }).join("");

  const batimentsHtml = isConcentrique
    ? carte.batiments.map((b) => renderBatimentConcentrique(b, carte.centre!, carte.esthetique)).join("")
    : carte.batiments.map((b) => renderBatimentGrid(b, carte.esthetique)).join("");

  const routeDefs: string[] = [];
  const routeCasings = carte.routes.map((r) => {
    const d = pathString(r.points);
    return `<path d="${d}" fill="none" stroke="${palette.routeCasing}" stroke-width="${(r.epaisseur + 2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeSurfaces = carte.routes.map((r) => {
    const d = pathString(r.points);
    const color = r.type === "artere" ? palette.routeArtere : r.type === "boulevard" ? palette.routeBoulevard : palette.routeSurface;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r.epaisseur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join("");

  const routeLabels = carte.routes.map((r, i) => {
    if (!r.nom) return "";
    const id = `route-label-${i}`;
    routeDefs.push(`<path id="${id}" d="${pathString(r.points)}" fill="none" />`);
    return `<text font-size="9" fill="${palette.routeCasing}" font-weight="600" font-family="${palette.fontFamily}" paint-order="stroke" stroke="${palette.fond}" stroke-width="2.5" stroke-linejoin="round"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${escapeHtml(r.nom)}</textPath></text>`;
  }).join("");

  const decorationsHtml = (carte.decorations ?? []).map((d) => renderDecoration(d, palette, carte.esthetique)).join("");
  const motifsHtml = renderMotifs(carte, palette);

  const pointsHtml = carte.points.map((p, i) => {
    const f = fichiers[i];
    const audioUrl = f ? "audio/" + safeFileName(f.nom) : "";
    const label = escapeHtml(p.nom.length > 22 ? p.nom.slice(0, 20) + "…" : p.nom);
    return `
      <g class="point" data-url="${escapeHtml(audioUrl)}" data-nom="${escapeHtml(p.nom)}" onclick="jouer(this)" transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})">
        <path class="pin-body" d="M 0,0 C -2,-4 -6,-12 -6,-16 C -6,-21 -3,-23 0,-23 C 3,-23 6,-21 6,-16 C 6,-12 2,-4 0,0 Z" fill="${p.couleur}" stroke="#fff" stroke-width="2" />
        <circle cx="0" cy="-16" r="2.5" fill="#fff" />
        <text class="point-label" x="0" y="-32" text-anchor="middle" font-size="10" fill="#333" font-weight="700" font-family="${palette.fontFamily}">${label}</text>
      </g>`;
  }).join("");

  const legendHtml = `
    <g transform="translate(${carte.width - 180}, ${carte.height - 110})">
      <rect x="0" y="0" width="170" height="100" rx="6" fill="rgba(255,255,255,0.92)" stroke="${palette.routeCasing}" stroke-width="1" />
      <text x="10" y="16" font-size="11" font-weight="700" fill="#333" font-family="${palette.fontFamily}">Légende</text>
      <rect x="10" y="24" width="12" height="12" fill="${palette.quartiers.residentiel}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="34" font-size="9" fill="#555" font-family="${palette.fontFamily}">Résidentiel</text>
      <rect x="10" y="40" width="12" height="12" fill="${palette.quartiers.commercial}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="50" font-size="9" fill="#555" font-family="${palette.fontFamily}">Commercial</text>
      <rect x="10" y="56" width="12" height="12" fill="${palette.quartiers.industriel}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="66" font-size="9" fill="#555" font-family="${palette.fontFamily}">Industriel</text>
      <rect x="10" y="72" width="12" height="12" fill="${palette.quartiers.parc}" stroke="#999" stroke-width="0.5" />
      <text x="28" y="82" font-size="9" fill="#555" font-family="${palette.fontFamily}">Espace vert</text>
      <circle cx="90" cy="80" r="5" fill="#e63946" stroke="#fff" stroke-width="1.5" />
      <text x="102" y="83" font-size="9" fill="#555" font-family="${palette.fontFamily}">Son</text>
    </g>`;

  const bgGradient = hasGradient
    ? `<radialGradient id="bgGrad" cx="50%" cy="50%" r="75%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${palette.gradient!.center}" /><stop offset="100%" stop-color="${palette.gradient!.edge}" /></radialGradient>`
    : "";
  const background = hasGradient
    ? `<rect x="0" y="0" width="${carte.width}" height="${carte.height}" fill="url(#bgGrad)" />`
    : `<rect x="0" y="0" width="${carte.width}" height="${carte.height}" fill="${palette.fond}" />`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titre)}</title>
  <style>
    body { margin: 0; font-family: ${palette.fontFamily}; background: #222; color: #eee; display: flex; flex-direction: column; align-items: center; min-height: 100vh; }
    h1 { margin: 16px 0 6px; font-size: 1.2rem; }
    .info { font-size: 0.85rem; opacity: 0.7; margin-bottom: 12px; }
    #carte { width: min(95vw, 1920px); height: auto; background: ${palette.fond}; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
    .point { cursor: pointer; }
    .point:hover .pin-body { stroke: #222; stroke-width: 2.5; }
    .point.active .pin-body { stroke: #ffd700; stroke-width: 3; }
    .point-label { opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
    .point:hover .point-label { opacity: 1; }
    #controls { margin: 12px 0 24px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center; }
    #titre { font-size: 0.9rem; opacity: 0.8; }
    audio { height: 36px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(titre)}</h1>
  <div class="info">${carte.points.length} points · ${carte.batiments.length} bâtiments · ${carte.routes.length} rues · ${carte.style} · ${carte.esthetique} · graine ${carte.graine}</div>
  <svg id="carte" viewBox="0 0 ${carte.width} ${carte.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.15" />
      </filter>
      ${bgGradient}
      ${routeDefs.join("\n")}
    </defs>
    ${background}
    ${quartiersHtml}
    ${eauHtml}
    ${espacesVertsHtml}
    ${routeCasings}
    ${routeSurfaces}
    ${routeLabels}
    ${batimentsHtml}
    ${decorationsHtml}
    ${motifsHtml}
    ${legendHtml}
    ${pointsHtml}
  </svg>
  <div id="controls">
    <span id="titre">Aucun son sélectionné</span>
    <audio id="player" controls></audio>
  </div>
  <script>
    function jouer(el) {
      const url = el.getAttribute("data-url");
      const nom = el.getAttribute("data-nom");
      if (!url) return;
      document.querySelectorAll(".point").forEach(p => p.classList.remove("active"));
      el.classList.add("active");
      const player = document.getElementById("player");
      const titre = document.getElementById("titre");
      player.src = url;
      titre.textContent = nom;
      player.play().catch(() => {});
    }
  </script>
</body>
</html>`;
}

