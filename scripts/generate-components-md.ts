import '../src/audio/adaptateur.ts';
import { toutesLesFiches } from '../src/plugins/index.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const typeMap: Record<string, string> = {
  nombre: 'number',
  texte: 'text',
  choix: 'choice',
  booleen: 'boolean',
  slider: 'slider',
  folder: 'folder',
  curseur: 'slider',
  fichier: 'file',
  image: 'image',
  audio: 'audio',
  midi: 'midi',
  controle: 'control',
};

function normalize(s: string | undefined): string {
  return (s ?? '').trim();
}

function fmtInputOutput(list: any[] | undefined): string {
  if (!list || list.length === 0) return 'none';
  return list
    .map((io) => {
      const name = normalize(io.nomEn ?? io.nom);
      const type = typeMap[io.type] ?? io.type ?? 'audio';
      const sub = io.sousType ? ` / ${io.sousType}` : '';
      return `${name} (${type}${sub})`;
    })
    .join(', ');
}

function fmtParam(p: any): string {
  const name = normalize(p.nomEn ?? p.nom);
  const type = typeMap[p.type] ?? p.type ?? 'number';
  const def = p.defautEn ?? p.defaut;
  const defStr = typeof def === 'string' ? `"${def}"` : String(def ?? '');
  let s = `    - ${name} (${type}) default ${defStr}`;
  if (p.unite) s += ` ${p.unite}`;
  if (p.plage && Array.isArray(p.plage)) s += ` [${p.plage[0]}..${p.plage[1]}]`;
  if (p.pas !== undefined && p.pas !== null) s += ` step ${p.pas}`;
  if (type === 'choice' && (p.optionsEn || p.options)) {
    const opts = (p.optionsEn || p.options).map((o: string) => normalize(o)).join(' / ');
    s += ` options: ${opts}`;
  }
  const doc = normalize(p.docEn ?? p.doc ?? '');
  if (doc) s += ` — ${doc}`;
  return s;
}

function fmtParams(params: any[] | undefined): string {
  if (!params || params.length === 0) return '    none';
  return params.map(fmtParam).join('\n');
}

const grouped = new Map<string, Map<string, any[]>>();
for (const f of toutesLesFiches) {
  const universe = f.univers ?? 'Uncategorized';
  const family = f.famille ?? 'General';
  if (!grouped.has(universe)) grouped.set(universe, new Map());
  const families = grouped.get(universe)!;
  if (!families.has(family)) families.set(family, []);
  families.get(family)!.push(f);
}

const universeOrder = ['Entrées', 'Traitement', 'Sorties', 'Autres'];
const sortedUniverses = [...grouped.keys()].sort((a, b) => {
  const ai = universeOrder.indexOf(a);
  const bi = universeOrder.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
});

let md = `# Component Dictionary (English)\n\n`;
md += `This document lists all **${toutesLesFiches.length}** components available in the Attic catalog, grouped by category and subcategory. Names, descriptions and parameter documentation are in English only.\n\n`;

for (const universe of sortedUniverses) {
  md += `## ${universe}\n\n`;
  const families = grouped.get(universe)!;
  const sortedFamilies = [...families.keys()].sort();
  for (const family of sortedFamilies) {
    md += `### ${family}\n\n`;
    const fiches = families.get(family)!;
    fiches.sort((a, b) => (a.nomEn ?? a.nom).localeCompare(b.nomEn ?? b.nom));
    for (const f of fiches) {
      const name = normalize(f.nomEn ?? f.nom);
      const summary = normalize(f.resumeEn ?? f.resume);
      const doc = normalize(f.noticeEn ?? f.resumeEn ?? f.resume ?? '');
      md += `- **${name}** \`${f.id}\`\n`;
      md += `  - Summary: ${summary}\n`;
      md += `  - Documentation: ${doc}\n`;
      md += `  - Inputs: ${fmtInputOutput(f.entrees)}\n`;
      md += `  - Outputs: ${fmtInputOutput(f.sorties)}\n`;
      md += `  - Parameters:\n${fmtParams(f.parametres)}\n\n`;
    }
  }
}

writeFileSync(join(process.cwd(), 'COMPONENTS.md'), md);
console.log(`Generated COMPONENTS.md with ${toutesLesFiches.length} components.`);
