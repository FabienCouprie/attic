import { traduire } from "../i18n";

export interface EchantillonSF2 {
  nom: string;
  debut: number;
  fin: number;
  debutBoucle: number;
  finBoucle: number;
  taux: number;
  noteOriginale: number;
  correction: number;
}

export interface ZoneInstrument {
  noteMin: number;
  noteMax: number;
  velMin: number;
  velMax: number;
  echantillonId: number;
  boucleActive: boolean;
}

export interface InstrumentSF2 {
  nom: string;
  zones: ZoneInstrument[];
}

export interface PresetSF2 {
  nom: string;
  programme: number;
  banque: number;
}

export interface StructureSF2 {
  programme: number;
  nom: string;
  presets: PresetSF2[];
  echantillons: EchantillonSF2[];
  instruments: InstrumentSF2[];
  smpl: Int16Array;
  bufferOriginal: ArrayBuffer;
}

function lireUint8(v: DataView, pos: number): number {
  return v.getUint8(pos);
}

function lireUint16(v: DataView, pos: number): number {
  return v.getUint16(pos, true);
}

function lireUint32(v: DataView, pos: number): number {
  return v.getUint32(pos, true);
}

function lireInt8(v: DataView, pos: number): number {
  return v.getInt8(pos);
}

function lireQuatreCc(v: DataView, pos: number): string {
  return String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3));
}

function lireChaine(v: DataView, pos: number, taille: number): string {
  let s = "";
  for (let i = 0; i < taille; i++) {
    const c = v.getUint8(pos + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function chercherSousChunk(v: DataView, pos: number, limite: number, id: string): { pos: number; taille: number } | null {
  let p = pos;
  while (p + 8 <= limite) {
    const cc = lireQuatreCc(v, p);
    const taille = lireUint32(v, p + 4);
    if (taille > limite - p - 8) break;
    if (cc === id) return { pos: p + 8, taille };
    p += 8 + taille + (taille % 2);
  }
  return null;
}

function chercherList(v: DataView, pos: number, limite: number, id: string): { pos: number; taille: number } | null {
  let p = pos;
  while (p + 12 <= limite) {
    const cc = lireQuatreCc(v, p);
    const taille = lireUint32(v, p + 4);
    if (taille > limite - p - 8) break;
    if (cc === "LIST") {
      const type = lireQuatreCc(v, p + 8);
      if (type === id) return { pos: p + 12, taille: taille - 4 };
    }
    p += 8 + taille + (taille % 2);
  }
  return null;
}

// GenOper types used in SF2
const GEN_KEY_RANGE = 43;
const GEN_VEL_RANGE = 44;
const GEN_SAMPLE_ID = 53;
const GEN_SAMPLE_MODES = 54;

export function analyserSF2(buffer: ArrayBuffer): StructureSF2 {
  const v = new DataView(buffer);
  if (lireQuatreCc(v, 0) !== "RIFF" || lireQuatreCc(v, 8) !== "sfbk") {
    throw new Error(traduire("msg.format_soundfont_invalide"));
  }
  const tailleFichier = lireUint32(v, 4);
  const limite = Math.min(buffer.byteLength, 12 + tailleFichier);

  const sdta = chercherList(v, 12, limite, "sdta");
  const pdta = chercherList(v, 12, limite, "pdta");

  if (!sdta || !pdta) throw new Error(traduire("msg.chunks_sdta_pdta_introuvables"));

  // --- Sample data ---
  const smplChunk = chercherSousChunk(v, sdta.pos, sdta.pos + sdta.taille, "smpl");
  if (!smplChunk) throw new Error(traduire("msg.chunk_smpl_introuvable"));
  const nbSamples = Math.floor(smplChunk.taille / 2);
  if (smplChunk.pos & 1) throw new Error(traduire("msg.chunk_smpl_mal_align"));
  const smpl = new Int16Array(buffer, smplChunk.pos, nbSamples);

  // --- Sample headers (shdr) ---
  const shdrChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "shdr");
  if (!shdrChunk) throw new Error(traduire("msg.chunk_shdr_introuvable"));
  const nbEchantillons = Math.floor(shdrChunk.taille / 96) - 1; // last record is terminator
  const echantillons: EchantillonSF2[] = [];
  for (let i = 0; i < nbEchantillons; i++) {
    const base = shdrChunk.pos + i * 96;
    echantillons.push({
      nom: lireChaine(v, base, 20),
      debut: lireUint32(v, base + 20),
      fin: lireUint32(v, base + 24),
      debutBoucle: lireUint32(v, base + 28),
      finBoucle: lireUint32(v, base + 32),
      taux: lireUint32(v, base + 36),
      noteOriginale: lireUint8(v, base + 40),
      correction: lireInt8(v, base + 41),
    });
  }

  // --- Instrument headers (inst) ---
  const instChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "inst");
  const ibagChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "ibag");
  const igenChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "igen");

  if (!instChunk || !ibagChunk || !igenChunk) throw new Error(traduire("msg.chunks_pdta_manquants"));

  const nbInstruments = Math.floor(instChunk.taille / 22) - 1;
  const nbIbag = Math.floor(ibagChunk.taille / 4);
  const nbIgen = Math.floor(igenChunk.taille / 4);

  function lireIbagIndex(i: number): number {
    if (i >= nbIbag) return nbIgen;
    return lireUint16(v, ibagChunk!.pos + i * 4);
  }

  const instruments: InstrumentSF2[] = [];
  for (let i = 0; i < nbInstruments; i++) {
    const instBase = instChunk.pos + i * 22;
    const nomInst = lireChaine(v, instBase, 20);
    const zoneDebut = lireUint16(v, instBase + 20);
    const zoneFin = i + 1 <= nbInstruments ? lireUint16(v, instChunk.pos + (i + 1) * 22 + 20) : nbIbag;

    const zones: ZoneInstrument[] = [];
    for (let zi = zoneDebut; zi < Math.min(zoneFin, nbIbag); zi++) {
      const genDebut = lireIbagIndex(zi);
      const genFin = lireIbagIndex(zi + 1);

      let noteMin = 0, noteMax = 127;
      let velMin = 0, velMax = 127;
      let echantillonId = -1;
      let boucleActive = false;

      for (let gi = genDebut; gi < Math.min(genFin, nbIgen); gi++) {
        const genBase = igenChunk.pos + gi * 4;
        const type = lireUint16(v, genBase);
        const valeur = lireUint16(v, genBase + 2);

        if (type === GEN_KEY_RANGE) {
          noteMin = valeur & 0xFF;
          noteMax = (valeur >> 8) & 0xFF;
        } else if (type === GEN_VEL_RANGE) {
          velMin = valeur & 0xFF;
          velMax = (valeur >> 8) & 0xFF;
        } else if (type === GEN_SAMPLE_ID) {
          echantillonId = valeur;
        } else if (type === GEN_SAMPLE_MODES) {
          boucleActive = ((valeur & 0x01) !== 0);
        }
      }

      if (echantillonId >= 0 && echantillonId < nbEchantillons) {
        zones.push({ noteMin, noteMax, velMin, velMax, echantillonId, boucleActive });
      }
    }

    instruments.push({ nom: nomInst, zones });
  }

  // --- Preset headers (phdr) ---
  const phdrChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "phdr");
  if (!phdrChunk) throw new Error(traduire("msg.chunk_phdr_introuvable"));

  const nbPresets = Math.floor(phdrChunk.taille / 38) - 1;
  const presets: PresetSF2[] = [];
  for (let i = 0; i < nbPresets; i++) {
    const base = phdrChunk.pos + i * 38;
    presets.push({
      nom: lireChaine(v, base, 20),
      programme: lireUint16(v, base + 20),
      banque: lireUint16(v, base + 22),
    });
  }
  const programme = presets.length > 0 ? presets[0].programme : 0;
  const nomPreset = presets.length > 0 ? presets[0].nom : "";

  return { programme, nom: nomPreset, presets, echantillons, instruments, smpl, bufferOriginal: buffer };
}

export function chercherZoneInstrument(sf: StructureSF2, noteMidi: number, velocite: number, instrumentIdx?: number): {
  echantillon: EchantillonSF2;
  donnees: Int16Array;
  debutSample: number;
  finSample: number;
} | null {
  let instruments: InstrumentSF2[];
  if (instrumentIdx !== undefined && instrumentIdx >= 0 && instrumentIdx < sf.instruments.length) {
    instruments = [sf.instruments[instrumentIdx]];
  } else {
    instruments = sf.instruments;
  }
  for (const inst of instruments) {
    for (const zone of inst.zones) {
      if (noteMidi >= zone.noteMin && noteMidi <= zone.noteMax &&
          velocite >= zone.velMin && velocite <= zone.velMax) {
        const ech = sf.echantillons[zone.echantillonId];
        if (!ech || ech.debut >= ech.fin) continue;
        return {
          echantillon: ech,
          donnees: sf.smpl,
          debutSample: ech.debut,
          finSample: ech.fin,
        };
      }
    }
  }
  return null;
}
