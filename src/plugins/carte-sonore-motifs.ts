// plugins/carte-sonore-motifs.ts — Les motifs de fond, un par esthetique.
//
// Ce module est une part de la carte sonore, decoupee selon ses dependances : la geometrie et
// les types d'un cote, le decor, les plans, le rendu, puis le nœud. Aucune ligne de calcul n'a
// ete retouchee au passage.

// cercles concentriques, avec plusieurs esthétiques (classique, baroque,
// art nouveau, art déco, exotique). Charge un dossier de sons et génère une
// page HTML autonome dans le dossier de sortie.


import type { CarteSonore, Palette } from "./carte-sonore-formes";

function artDecoMotifs(w: number, h: number, c: string): string {
  const s = 70, rays = 7;
  function sunburst(x: number, y: number, rot: number): string {
    let lines = "";
    for (let i = 0; i < rays; i++) {
      const a = rot + (i / (rays - 1)) * Math.PI / 2;
      const x2 = x + Math.cos(a) * s;
      const y2 = y + Math.sin(a) * s;
      lines += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="2" />`;
    }
    return lines;
  }
  return `
    ${sunburst(0, 0, 0)}
    ${sunburst(w, 0, Math.PI / 2)}
    ${sunburst(0, h, Math.PI * 1.5)}
    ${sunburst(w, h, Math.PI)}
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${c}" stroke-width="3" />
    <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${c}" stroke-width="1" />
  `;
}

function baroqueMotifs(w: number, h: number, c: string): string {
  const corner = `<path d="M0,0 C20,0 40,20 40,40 C40,55 30,70 15,75 C5,78 -5,70 -5,60 C-5,50 5,45 15,50 C25,55 30,45 25,35 C20,25 10,20 0,20" fill="none" stroke="${c}" stroke-width="2" />`;
  return `
    <g transform="translate(10,10) scale(0.8)">${corner}</g>
    <g transform="translate(${w - 10},10) rotate(90) scale(0.8)">${corner}</g>
    <g transform="translate(${w - 10},${h - 10}) rotate(180) scale(0.8)">${corner}</g>
    <g transform="translate(10,${h - 10}) rotate(270) scale(0.8)">${corner}</g>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${c}" stroke-width="3" rx="12" />
  `;
}

function artNouveauMotifs(w: number, h: number, c: string): string {
  const corner = `<path d="M0,0 Q30,10 40,40 T80,80" fill="none" stroke="${c}" stroke-width="2" /><circle cx="40" cy="40" r="4" fill="${c}" />`;
  return `
    <g transform="translate(5,5) scale(0.6)">${corner}</g>
    <g transform="translate(${w - 5},5) rotate(90) scale(0.6)">${corner}</g>
    <g transform="translate(${w - 5},${h - 5}) rotate(180) scale(0.6)">${corner}</g>
    <g transform="translate(5,${h - 5}) rotate(270) scale(0.6)">${corner}</g>
    <path d="M0,40 Q${w / 2},0 ${w},40" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" />
    <path d="M0,${h - 40} Q${w / 2},${h} ${w},${h - 40}" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.4" />
  `;
}

function exotiqueMotifs(w: number, h: number, c: string): string {
  const palm = `<path d="M0,45 Q2,20 0,-5 M0,-5 Q-10,-18 -22,-12 M0,-5 Q-3,-20 -8,-26 M0,-5 Q10,-18 22,-12 M0,-5 Q3,-20 8,-26" stroke="${c}" stroke-width="2" fill="none" />`;
  return `
    <g transform="translate(12,12) scale(0.5)">${palm}</g>
    <g transform="translate(${w - 12},12) rotate(90) scale(0.5)">${palm}</g>
    <g transform="translate(${w - 12},${h - 12}) rotate(180) scale(0.5)">${palm}</g>
    <g transform="translate(12,${h - 12}) rotate(270) scale(0.5)">${palm}</g>
    <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="8 4" />
  `;
}

export function renderMotifs(carte: CarteSonore, palette: Palette): string {
  const { width, height, esthetique } = carte;
  switch (esthetique) {
    case "art-deco":
      return artDecoMotifs(width, height, palette.routeCasing);
    case "baroque":
      return baroqueMotifs(width, height, palette.routeCasing);
    case "art-nouveau":
      return artNouveauMotifs(width, height, palette.routeCasing);
    case "exotique":
      return exotiqueMotifs(width, height, palette.routeCasing);
    default:
      return "";
  }
}

