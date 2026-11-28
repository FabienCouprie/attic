// audio/sf2-essai.ts — Un fichier SoundFont 2 écrit en mémoire, pour les tests.
//
// POURQUOI UN FICHIER ET NON UNE STRUCTURE. Les tests du rendu SoundFont bâtissaient une
// `StructureSF2` à la main : une zone par preset, aucune zone globale, rien de ce que l'analyseur lit
// d'un vrai fichier. Deux défauts sont passés par là. Le 2026-11-24, un kit dont la première zone ne
// sonnait pas, que seule l'application a montré ; le 2026-11-28, l'enveloppe de volume que FluidR3
// range dans la zone globale de ses instruments, et que l'analyseur jetait. Un test qui écrit le
// fichier, puis le relit par `analyserSF2`, exerce ce que l'application exerce.
//
// CE QU'IL ÉCRIT : RIFF `sfbk`, la liste `sdta` et son `smpl` (chaque échantillon suivi des
// quarante-six points nuls que la norme demande), la liste `pdta` et ses neuf sous-chunks, chacun
// fini par son enregistrement terminal. Les modulateurs sont vides. Une zone se donne par la liste
// de ses générateurs ; celui qui la termine (instrument 41, échantillon 53) se met en dernier, comme
// la norme l'exige, et une zone qui n'en a pas est une zone globale.

export interface EchantillonEssai {
  nom: string;
  donnees: Int16Array;
  taux: number;
  noteOriginale: number;
  /** Bornes de la boucle, relatives au début de l'échantillon. */
  boucle?: [number, number];
}

/** Générateurs d'une zone : `[type, valeur]`, la valeur signée ou une plage déjà empaquetée. */
export type ZoneEssai = Array<[number, number]>;

export interface InstrumentEssai { nom: string; zones: ZoneEssai[] }
export interface PresetEssai { nom: string; programme: number; banque: number; zones: ZoneEssai[] }

/** Une plage de touches ou de vélocités, telle que les générateurs 43 et 44 la portent. */
export const plage = (bas: number, haut: number) => (bas & 0xff) | ((haut & 0xff) << 8);

const NUL_APRES_ECHANTILLON = 46;

class Ecrivain {
  private octets: number[] = [];
  u8(x: number) { this.octets.push(x & 0xff); }
  u16(x: number) { this.u8(x); this.u8(x >> 8); }
  u32(x: number) { this.u16(x & 0xffff); this.u16(x >>> 16); }
  cc(id: string) { for (let i = 0; i < 4; i++) this.u8(id.charCodeAt(i)); }
  nom(s: string, taille: number) { for (let i = 0; i < taille; i++) this.u8(i < s.length ? s.charCodeAt(i) : 0); }
  get taille() { return this.octets.length; }
  vers(): number[] { return this.octets; }
}

function chunk(id: string, corps: number[]): number[] {
  const e = new Ecrivain();
  e.cc(id); e.u32(corps.length);
  const tout = [...e.vers(), ...corps];
  if (corps.length % 2) tout.push(0);
  return tout;
}

function liste(type: string, contenu: number[][]): number[] {
  const e = new Ecrivain();
  e.cc(type);
  return chunk("LIST", [...e.vers(), ...contenu.flat()]);
}

/** Les sacs et les générateurs d'une suite de zones, et l'indice du premier sac de chaque entité. */
function sacs(entites: Array<{ zones: ZoneEssai[] }>) {
  const bag = new Ecrivain(), gen = new Ecrivain(), premiers: number[] = [];
  let nbSacs = 0, nbGens = 0;
  for (const ent of entites) {
    premiers.push(nbSacs);
    for (const zone of ent.zones) {
      bag.u16(nbGens); bag.u16(0); nbSacs++;
      for (const [type, valeur] of zone) { gen.u16(type); gen.u16(valeur & 0xffff); nbGens++; }
    }
  }
  bag.u16(nbGens); bag.u16(0);
  gen.u32(0);
  return { bag: bag.vers(), gen: gen.vers(), premiers, nbSacs };
}

/** Le fichier entier, prêt pour `analyserSF2`. */
export function ecrireSF2(echantillons: EchantillonEssai[], instruments: InstrumentEssai[], presets: PresetEssai[]): ArrayBuffer {
  const smpl = new Ecrivain(), shdr = new Ecrivain();
  let pos = 0;
  for (const ech of echantillons) {
    const debut = pos;
    for (const x of ech.donnees) smpl.u16(x);
    for (let i = 0; i < NUL_APRES_ECHANTILLON; i++) smpl.u16(0);
    pos += ech.donnees.length + NUL_APRES_ECHANTILLON;
    const [b0, b1] = ech.boucle ?? [0, 0];
    shdr.nom(ech.nom, 20); shdr.u32(debut); shdr.u32(debut + ech.donnees.length);
    shdr.u32(debut + b0); shdr.u32(debut + b1); shdr.u32(ech.taux);
    shdr.u8(ech.noteOriginale); shdr.u8(0); shdr.u16(0); shdr.u16(1);
  }
  shdr.nom("EOS", 20); for (let i = 0; i < 26; i++) shdr.u8(0);

  const si = sacs(instruments), sp = sacs(presets);
  const inst = new Ecrivain();
  instruments.forEach((ins, i) => { inst.nom(ins.nom, 20); inst.u16(si.premiers[i]); });
  inst.nom("EOI", 20); inst.u16(si.nbSacs);
  const phdr = new Ecrivain();
  presets.forEach((p, i) => {
    phdr.nom(p.nom, 20); phdr.u16(p.programme); phdr.u16(p.banque); phdr.u16(sp.premiers[i]);
    phdr.u32(0); phdr.u32(0); phdr.u32(0);
  });
  phdr.nom("EOP", 20); phdr.u16(0); phdr.u16(0); phdr.u16(sp.nbSacs); phdr.u32(0); phdr.u32(0); phdr.u32(0);
  const modVide = new Array(10).fill(0);

  const sdta = liste("sdta", [chunk("smpl", smpl.vers())]);
  const pdta = liste("pdta", [
    chunk("phdr", phdr.vers()), chunk("pbag", sp.bag), chunk("pmod", modVide), chunk("pgen", sp.gen),
    chunk("inst", inst.vers()), chunk("ibag", si.bag), chunk("imod", modVide), chunk("igen", si.gen),
    chunk("shdr", shdr.vers()),
  ]);
  const entete = new Ecrivain();
  entete.cc("sfbk");
  const riff = chunk("RIFF", [...entete.vers(), ...sdta, ...pdta]);
  return new Uint8Array(riff).buffer;
}
