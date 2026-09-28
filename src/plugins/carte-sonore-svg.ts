// plugins/carte-sonore-svg.ts — Le rendu de chaque element de la carte en SVG.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import { mulberry32, polarToCartesian } from "./carte-sonore-formes";
import type { BatimentVille, DecorationCarte, Esthetique, Palette } from "./carte-sonore-formes";

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

export function safeFileName(nom: string): string {
  return nom.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function pathString(pts: { x: number; y: number }[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function polygonPath(poly: { x: number; y: number }[]): string {
  return pathString(poly) + " Z";
}

function buildingVariant(x: number, y: number, max: number): number {
  return Math.floor(mulberry32(Math.floor(x * 1000) + Math.floor(y * 1000) * 137 + max * 7)() * max);
}

export function renderBatimentGrid(b: BatimentVille, esthetique: Esthetique): string {
  const x = b.x, y = b.y, w = b.w, h = b.h;
  const color = b.couleur;
  const stroke = "#00000025";
  if (b.d) {
    const detail = buildingVariant(x, y, 2) === 0
      ? `<rect x="${(x - w * 0.1).toFixed(1)}" y="${(y + h / 2 - h * 0.25).toFixed(1)}" width="${(w * 0.2).toFixed(1)}" height="${(h * 0.25).toFixed(1)}" fill="#5d4037" opacity="0.5" />`
      : "";
    return `<path d="${b.d}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${detail}`;
  }
  switch (esthetique) {
    case "art-deco": {
      const v = buildingVariant(x, y, 3);
      const step = Math.min(w, h) * 0.2;
      if (v === 0) return `<polygon points="${x},${y + h} ${x + w},${y + h} ${x + w},${y + step} ${x + w - step},${y} ${x + step},${y} ${x},${y + step}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) {
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" rx="${Math.min(w, h) * 0.2}" /><line x1="${x + w * 0.25}" y1="${y}" x2="${x + w * 0.25}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" /><line x1="${x + w * 0.5}" y1="${y}" x2="${x + w * 0.5}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" /><line x1="${x + w * 0.75}" y1="${y}" x2="${x + w * 0.75}" y2="${y + h}" stroke="${stroke}" stroke-width="1.2" />`;
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="none" stroke="${stroke}" stroke-width="1" />`;
    }
    case "baroque": {
      const v = buildingVariant(x, y, 3);
      const r = w / 2;
      if (v === 0) return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) {
        const step = h / 4;
        return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + step} L ${x + w * 0.75} ${y + step} L ${x + w * 0.75} ${y} L ${x + w * 0.25} ${y} L ${x + w * 0.25} ${y + step} L ${x} ${y + step} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      }
      return `<rect x="${x}" y="${y + h * 0.3}" width="${w}" height="${h * 0.7}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x + w / 2} ${y} L ${x + w} ${y + h * 0.3} L ${x} ${y + h * 0.3} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + w / 2}" cy="${y + h * 0.3}" r="${Math.min(w, h) * 0.08}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
    }
    case "art-nouveau": {
      const v = buildingVariant(x, y, 2);
      const cy = y + h * 0.25;
      if (v === 0) return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${cy} Q ${x + w * 0.75} ${y} ${x + w * 0.5} ${cy} Q ${x + w * 0.25} ${y + h * 0.5} ${x} ${cy} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      return `<rect x="${x}" y="${y + h * 0.4}" width="${w}" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + w / 2}" cy="${y + h * 0.4}" r="${Math.min(w, h) * 0.35}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + h * 0.4} Q ${x + w / 2} ${y - h * 0.1} ${x + w} ${y + h * 0.4}" fill="none" stroke="${stroke}" stroke-width="0.5" />`;
    }
    case "exotique": {
      const v = buildingVariant(x, y, 3);
      const r = w / 2;
      const doorW = Math.min(w * 0.3, 10);
      const doorH = h * 0.35;
      const door = `<path d="M ${x + r - doorW / 2} ${y + h} L ${x + r - doorW / 2} ${y + h - doorH} A ${(doorW / 2).toFixed(1)} ${(doorW / 2).toFixed(1)} 0 0 1 ${x + r + doorW / 2} ${y + h - doorH} L ${x + r + doorW / 2} ${y + h}" fill="#5d4037" opacity="0.6" />`;
      if (v === 0) {
        const domeR = Math.min(r * 0.55, h * 0.18);
        return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + r}" cy="${y + r}" r="${domeR.toFixed(1)}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
      }
      if (v === 1) {
        return `<rect x="${x}" y="${y + r}" width="${w}" height="${h - r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><path d="M ${x} ${y + r} Q ${x + r} ${y - r} ${x + w} ${y + r}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
      }
      return `<rect x="${x}" y="${y + h * 0.4}" width="${w}" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + r - 1.5}" y="${y - h * 0.2}" width="3" height="${h * 0.6}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${x + r}" cy="${y - h * 0.2}" r="3" fill="${color}" stroke="${stroke}" stroke-width="0.5" />${door}`;
    }
    case "classique":
    default: {
      const v = buildingVariant(x, y, 4);
      if (v === 0) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 1) return `<path d="M ${x} ${y + h} L ${x + w} ${y + h} L ${x + w} ${y + h * 0.35} L ${x + w / 2} ${y} L ${x} ${y + h * 0.35} Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      if (v === 2) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + w - 4}" y="${y - 6}" width="3" height="8" fill="${color}" stroke="${stroke}" stroke-width="0.5" />`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${stroke}" stroke-width="0.5" /><rect x="${x + 3}" y="${y + 3}" width="${w * 0.25}" height="${h * 0.2}" fill="#ffffff" opacity="0.45" /><rect x="${x + w - 3 - w * 0.25}" y="${y + 3}" width="${w * 0.25}" height="${h * 0.2}" fill="#ffffff" opacity="0.45" />`;
    }
  }
}

export function renderBatimentConcentrique(b: BatimentVille, centre: { x: number; y: number }, esthetique: Esthetique): string {
  const cx = centre.x, cy = centre.y;
  const r = b.r ?? Math.hypot(b.x - cx, b.y - cy);
  const a = b.a ?? Math.atan2(b.y - cy, b.x - cx);
  if (r <= 0) return "";
  const da = Math.min(Math.PI / 4, (b.w / 2) / r);
  const dr = b.h / 2;
  const r0 = Math.max(0, r - dr);
  const r1 = r + dr;
  const a0 = a - da, a1 = a + da;
  const p0o = polarToCartesian(cx, cy, r1, a0);
  const p1o = polarToCartesian(cx, cy, r1, a1);
  const p1i = polarToCartesian(cx, cy, r0, a1);
  const p0i = polarToCartesian(cx, cy, r0, a0);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const d = `M ${p0o.x.toFixed(1)} ${p0o.y.toFixed(1)} A ${r1.toFixed(1)} ${r1.toFixed(1)} 0 ${large} 1 ${p1o.x.toFixed(1)} ${p1o.y.toFixed(1)} L ${p1i.x.toFixed(1)} ${p1i.y.toFixed(1)} A ${r0.toFixed(1)} ${r0.toFixed(1)} 0 ${large} 0 ${p0i.x.toFixed(1)} ${p0i.y.toFixed(1)} Z`;
  const stroke = esthetique === "art-deco" ? "#1a252f" : "#00000025";
  const center = polarToCartesian(cx, cy, r1, a);
  const v = buildingVariant(center.x, center.y, 3);
  if (esthetique === "exotique") {
    const domeR = Math.min(da * r * 0.6, dr * 0.8);
    return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" r="${domeR.toFixed(1)}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /></g>`;
  }
  if (v === 0) return `<path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" />`;
  if (v === 1) return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><circle cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" r="${Math.min(dr, da * r * 0.3).toFixed(1)}" fill="#ffffff" opacity="0.5" /></g>`;
  return `<g><path d="${d}" fill="${b.couleur}" stroke="${stroke}" stroke-width="0.5" /><line x1="${center.x.toFixed(1)}" y1="${center.y.toFixed(1)}" x2="${center.x.toFixed(1)}" y2="${(center.y - 10).toFixed(1)}" stroke="#333333" stroke-width="0.8" /></g>`;
}

export function renderDecoration(d: DecorationCarte, palette: Palette, esthetique: Esthetique): string {
  const t = `transform="translate(${d.x.toFixed(1)}, ${d.y.toFixed(1)})"`;
  const accent =
    esthetique === "baroque" ? "#d4af37" :
    esthetique === "art-deco" ? "#f4d03f" :
    esthetique === "exotique" ? "#f39c12" :
    esthetique === "art-nouveau" ? "#c9a9c9" : "#fff";
  const c1 = palette.bats.historique[0] ?? palette.bats.defaut[0];
  const c2 = palette.bats.commercial[0] ?? palette.bats.defaut[0];
  let icon = "";
  switch (d.type) {
    case "fontaine":
      icon = `<circle r="16" fill="${palette.eau}" opacity="0.8" /><circle r="8" fill="${palette.eauStroke}" /><path d="M-6,-12 Q0,-24 6,-12" stroke="#fff" stroke-width="1.5" fill="none" /><path d="M-9,-8 Q0,-26 9,-8" stroke="#fff" stroke-width="1" fill="none" opacity="0.7" />`;
      break;
    case "tour":
      icon = `<rect x="-6" y="-38" width="12" height="38" fill="${palette.bats.historique[0]}" stroke="#5c4033" stroke-width="1" /><polygon points="-7,-38 0,-48 7,-38" fill="${accent}" /><rect x="-2" y="-30" width="4" height="6" fill="#4a3b2a" />`;
      break;
    case "pavillon":
      icon = `<polygon points="-18,0 0,-24 18,0" fill="${palette.bats.commercial[0]}" stroke="#333" stroke-width="1" /><rect x="-10" y="0" width="20" height="12" fill="${palette.bats.residentiel[0]}" stroke="#333" stroke-width="1" /><rect x="-3" y="4" width="6" height="8" fill="#6c757d" />`;
      break;
    case "phare":
      icon = `<rect x="-5" y="-32" width="10" height="32" fill="#fff" stroke="#999" stroke-width="1" /><circle r="6" cy="-34" fill="${accent}" stroke="#e9c46a" stroke-width="1" /><path d="M6,-34 L32,-42 L32,-26 Z" fill="${accent}" opacity="0.25" />`;
      break;
    case "arbre":
      icon = `<circle r="9" fill="${palette.arbre}" opacity="0.8" /><circle r="5" cy="-6" fill="${palette.arbre}" /><circle r="4" cx="5" cy="-2" fill="${palette.arbre}" />`;
      break;
    case "palais":
      icon = `<rect x="-22" y="-10" width="44" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><path d="M-22,-10 Q0,-34 22,-10" fill="${c1}" stroke="#3e2723" stroke-width="1" /><circle cx="0" cy="-10" r="10" fill="${c1}" stroke="#3e2723" stroke-width="1" /><rect x="-26" y="-22" width="4" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><rect x="22" y="-22" width="4" height="24" fill="${c2}" stroke="#3e2723" stroke-width="1" /><rect x="-28" y="-24" width="8" height="3" fill="${accent}" /><rect x="20" y="-24" width="8" height="3" fill="${accent}" />`;
      break;
    case "minaret":
      icon = `<rect x="-4" y="-34" width="8" height="34" fill="${palette.bats.historique[0]}" stroke="#3e2723" stroke-width="1" /><rect x="-5" y="-36" width="10" height="4" fill="${accent}" stroke="#3e2723" stroke-width="1" /><rect x="-3" y="-30" width="6" height="2" fill="#3e2723" opacity="0.3" /><rect x="-3" y="-22" width="6" height="2" fill="#3e2723" opacity="0.3" />`;
      break;
    case "palmier":
      icon = `<path d="M0,10 Q2,0 0,-10" stroke="#8B5A2B" stroke-width="2" fill="none" /><path d="M0,-10 Q-8,-22 -18,-14 M0,-10 Q-3,-20 -8,-26 M0,-10 Q8,-22 18,-14 M0,-10 Q3,-20 8,-26 M0,-10 Q0,-28 0,-34" stroke="${palette.arbre}" stroke-width="1.5" fill="none" />`;
      break;
    case "marche":
      icon = `<rect x="-16" y="-8" width="32" height="16" fill="${palette.bats.commercial[0]}" stroke="#3e2723" stroke-width="1" /><line x1="-16" y1="0" x2="16" y2="0" stroke="#3e2723" stroke-width="1" /><path d="M-16,-8 L-10,-14 L-4,-8 L2,-14 L8,-8 L14,-14 L20,-8" fill="${accent}" stroke="#3e2723" stroke-width="1" />`;
      break;
    case "bar":
      icon = `<rect x="-8" y="0" width="16" height="8" rx="2" fill="#5d4037" /><rect x="-5" y="-10" width="4" height="10" fill="#8B5A2B" /><circle cx="3" cy="-8" r="3" fill="#fff" opacity="0.9" />`;
      break;
    case "grotte":
      icon = `<path d="M-14,8 Q-14,-12 0,-12 Q14,-12 14,8 Z" fill="#6d5a44" stroke="#3e2723" stroke-width="1" /><path d="M-8,8 Q-8,-4 0,-4 Q8,-4 8,8 Z" fill="#3e2723" />`;
      break;
    case "cinema":
      icon = `<rect x="-10" y="-8" width="20" height="14" fill="#333" stroke="#fff" stroke-width="1" /><circle cx="-6" cy="-12" r="2" fill="#fff" /><circle cx="0" cy="-12" r="2" fill="#fff" /><circle cx="6" cy="-12" r="2" fill="#fff" />`;
      break;
    case "monument":
      icon = `<polygon points="-3,8 0,-20 3,8" fill="#555" stroke="#333" stroke-width="1" /><rect x="-4" y="8" width="8" height="2" fill="#333" />`;
      break;
    case "statue": {
      const stone1 = "#7a6a5a";
      const stone2 = "#9e8e7a";
      const figure = "#a89880";
      const shadow = "#4a3b2a";
      icon = `<rect x="-7" y="4" width="14" height="5" fill="${stone1}" stroke="${shadow}" stroke-width="1" /><rect x="-5" y="0" width="10" height="4" fill="${stone2}" stroke="${shadow}" stroke-width="1" /><path d="M0,-4 C-3,-4 -4,-8 -3,-11 C-5,-13 -3,-17 0,-17 C3,-17 5,-13 3,-11 C4,-8 3,-4 0,-4 Z" fill="${figure}" stroke="${shadow}" stroke-width="1" /><path d="M-3,-10 C-7,-8 -8,-3 -5,0 M3,-10 C7,-8 8,-3 5,0" fill="none" stroke="${figure}" stroke-width="2" stroke-linecap="round" />`;
      break;
    }
    case "ecole":
      icon = `<rect x="-8" y="-8" width="16" height="16" fill="#c9a87c" stroke="#5c4033" stroke-width="1" /><rect x="-3" y="-16" width="6" height="8" fill="#8B5A2B" /><circle cx="0" cy="-18" r="2" fill="#fff" />`;
      break;
    case "eglise":
      icon = `<rect x="-6" y="0" width="12" height="10" fill="#d4c4b0" stroke="#5c4033" stroke-width="1" /><path d="M-8,0 L8,0 L0,-14 Z" fill="#8B5A2B" /><path d="M0,-16 L0,-8 M-3,-12 L3,-12" stroke="#fff" stroke-width="1" />`;
      break;
    case "bibliotheque":
      icon = `<rect x="-8" y="-2" width="16" height="4" fill="#8B5A2B" stroke="#5c4033" stroke-width="0.5" /><rect x="-8" y="2" width="16" height="4" fill="#5d4037" stroke="#5c4033" stroke-width="0.5" /><rect x="-8" y="6" width="16" height="4" fill="#8B5A2B" stroke="#5c4033" stroke-width="0.5" />`;
      break;
    case "theatre":
      icon = `<path d="M-10,0 Q-5,-10 0,0 Q5,-10 10,0 Q5,10 0,0 Q-5,10 -10,0 Z" fill="#fff" stroke="#333" stroke-width="1" />`;
      break;
    case "jardin":
      icon = `<path d="M0,8 L0,-8" stroke="#5d4037" stroke-width="1" /><circle cx="0" cy="-6" r="5" fill="${palette.arbre}" /><circle cx="-4" cy="-4" r="4" fill="${palette.arbre}" /><circle cx="4" cy="-4" r="4" fill="${palette.arbre}" />`;
      break;
    case "marais":
      icon = `<path d="M-8,8 L-8,-4 M-4,8 L-4,-8 M0,8 L0,-6 M4,8 L4,-4 M8,8 L8,-8" stroke="#7cb369" stroke-width="1" /><ellipse cx="0" cy="8" rx="12" ry="3" fill="${palette.eau}" opacity="0.8" />`;
      break;
    case "temple":
      icon = `<rect x="-12" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><rect x="-2" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><rect x="8" y="-4" width="4" height="12" fill="#c9a87c" stroke="#5c4033" stroke-width="0.5" /><path d="M-16,-4 L16,-4 L0,-14 Z" fill="#8B5A2B" />`;
      break;
    default:
      return "";
  }
  if (d.nom) {
    const label = escapeHtml(d.nom.length > 26 ? d.nom.slice(0, 24) + "…" : d.nom);
    icon += `<text y="24" x="0" text-anchor="middle" font-size="8" fill="${palette.routeCasing}" font-family="${palette.fontFamily}" font-weight="600" paint-order="stroke" stroke="${palette.fond}" stroke-width="2.5" stroke-linejoin="round">${label}</text>`;
  }
  return `<g ${t}>${icon}</g>`;
}

