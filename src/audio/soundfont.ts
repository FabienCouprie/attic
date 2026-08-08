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
  type: number;
}

export interface ZoneInstrument {
  noteMin: number;
  noteMax: number;
  velMin: number;
  velMax: number;
  echantillonId: number;
  boucleActive: boolean;
  rootKey?: number;
  coarseTune?: number;
  fineTune?: number;
  attenuation?: number;
  pan?: number;
}

export interface InstrumentSF2 {
  nom: string;
  zones: ZoneInstrument[];
}

export interface PresetZone {
  noteMin: number;
  noteMax: number;
  velMin: number;
  velMax: number;
  instrumentIdx: number;
  coarseTune?: number;
  fineTune?: number;
  attenuation?: number;
  pan?: number;
}

export interface PresetSF2 {
  nom: string;
  programme: number;
  banque: number;
  zones: PresetZone[];
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
const GEN_PAN = 17;
const GEN_INITIAL_ATTENUATION = 48;
const GEN_COARSE_TUNE = 51;
const GEN_INSTRUMENT = 41;
const GEN_FINE_TUNE = 52;
const GEN_SAMPLE_ID = 53;
const GEN_SAMPLE_MODES = 54;
const GEN_OVERRIDING_ROOT_KEY = 58;

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
  const nbEchantillons = Math.floor(shdrChunk.taille / 46) - 1; // last record is terminator
  const echantillons: EchantillonSF2[] = [];
  for (let i = 0; i < nbEchantillons; i++) {
    const base = shdrChunk.pos + i * 46;
    echantillons.push({
      nom: lireChaine(v, base, 20),
      debut: lireUint32(v, base + 20),
      fin: lireUint32(v, base + 24),
      debutBoucle: lireUint32(v, base + 28),
      finBoucle: lireUint32(v, base + 32),
      taux: lireUint32(v, base + 36),
        noteOriginale: lireUint8(v, base + 40),
        correction: lireInt8(v, base + 41),
        type: lireUint16(v, base + 44),
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
      let rootKey: number | undefined;
      let coarseTune = 0;
      let fineTune = 0;
      let attenuation = 0;
      let pan = 0;

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
          const loopMode = valeur & 0x03;
          boucleActive = (loopMode === 1 || loopMode === 3);
        } else if (type === GEN_OVERRIDING_ROOT_KEY) {
          rootKey = valeur & 0x7F;
        } else if (type === GEN_COARSE_TUNE) {
          coarseTune = (valeur & 0x8000) ? (valeur - 65536) : valeur;
        } else if (type === GEN_FINE_TUNE) {
          fineTune = (valeur & 0x8000) ? (valeur - 65536) : valeur;
        } else if (type === GEN_INITIAL_ATTENUATION) {
          attenuation = valeur;
        } else if (type === GEN_PAN) {
          pan = valeur;
        }
      }

      if (echantillonId >= 0 && echantillonId < nbEchantillons) {
        zones.push({ noteMin, noteMax, velMin, velMax, echantillonId, boucleActive, rootKey, coarseTune, fineTune, attenuation, pan });
      }
    }

    instruments.push({ nom: nomInst, zones });
  }

  // --- Preset headers (phdr) ---
  const phdrChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "phdr");
  const pbagChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "pbag");
  const pgenChunk = chercherSousChunk(v, pdta.pos, pdta.pos + pdta.taille, "pgen");
  if (!phdrChunk || !pbagChunk || !pgenChunk) throw new Error(traduire("msg.chunks_pdta_manquants"));

  const nbPresets = Math.floor(phdrChunk.taille / 38) - 1;
  const nbPbag = Math.floor(pbagChunk.taille / 4);
  const nbPgen = Math.floor(pgenChunk.taille / 4);

  function lirePbagIndex(i: number): number {
    if (i >= nbPbag) return nbPgen;
    return lireUint16(v, pbagChunk!.pos + i * 4);
  }

  const presets: PresetSF2[] = [];
  for (let i = 0; i < nbPresets; i++) {
    const base = phdrChunk.pos + i * 38;
    const zoneDebut = lireUint16(v, base + 24);
    const zoneFin = i + 1 < nbPresets
      ? lireUint16(v, phdrChunk.pos + (i + 1) * 38 + 24)
      : nbPbag;

    const zones: PresetZone[] = [];
    let globalCoarseTune = 0;
    let globalFineTune = 0;
    let globalAttenuation = 0;
    let globalPan = 0;
    for (let zi = zoneDebut; zi < Math.min(zoneFin, nbPbag); zi++) {
      const genDebut = lirePbagIndex(zi);
      const genFin = lirePbagIndex(zi + 1);

      let noteMin = 0, noteMax = 127;
      let velMin = 0, velMax = 127;
      let instrumentIdx = -1;
      let coarseTune = 0;
      let fineTune = 0;
      let attenuation = 0;
      let pan = 0;

      for (let gi = genDebut; gi < Math.min(genFin, nbPgen); gi++) {
        const genBase = pgenChunk.pos + gi * 4;
        const type = lireUint16(v, genBase);
        const valeur = lireUint16(v, genBase + 2);

        if (type === GEN_KEY_RANGE) {
          noteMin = valeur & 0xFF;
          noteMax = (valeur >> 8) & 0xFF;
        } else if (type === GEN_VEL_RANGE) {
          velMin = valeur & 0xFF;
          velMax = (valeur >> 8) & 0xFF;
        } else if (type === GEN_INSTRUMENT) {
          instrumentIdx = valeur;
        } else if (type === GEN_COARSE_TUNE) {
          coarseTune = (valeur & 0x8000) ? (valeur - 65536) : valeur;
        } else if (type === GEN_FINE_TUNE) {
          fineTune = (valeur & 0x8000) ? (valeur - 65536) : valeur;
        } else if (type === GEN_INITIAL_ATTENUATION) {
          attenuation = valeur;
        } else if (type === GEN_PAN) {
          pan = valeur;
        }
      }

      if (instrumentIdx >= 0 && instrumentIdx < nbInstruments) {
        zones.push({
          noteMin, noteMax, velMin, velMax,
          instrumentIdx,
          coarseTune: coarseTune + globalCoarseTune,
          fineTune: fineTune + globalFineTune,
          attenuation: attenuation + globalAttenuation,
          pan: pan + globalPan,
        });
      } else if (instrumentIdx === -1) {
        // Zone globale (pas d'instrument) : accumulateurs pour les zones suivantes
        globalCoarseTune += coarseTune;
        globalFineTune += fineTune;
        globalAttenuation += attenuation;
        globalPan += pan;
      }
    }

    presets.push({
      nom: lireChaine(v, base, 20),
      programme: lireUint16(v, base + 20),
      banque: lireUint16(v, base + 22),
      zones,
    });
  }
  const programme = presets.length > 0 ? presets[0].programme : 0;
  const nomPreset = presets.length > 0 ? presets[0].nom : "";

  return { programme, nom: nomPreset, presets, echantillons, instruments, smpl, bufferOriginal: buffer };
}

export function chercherZonesInstrument(sf: StructureSF2, noteMidi: number, velocite: number, programme = 0, banque = 0): {
  echantillon: EchantillonSF2;
  zone: ZoneInstrument;
  donnees: Int16Array;
  debutSample: number;
  finSample: number;
  instrumentIdx: number;
}[] {
  // Trouver le preset demandé, sinon le premier preset disponible
  let preset = sf.presets.find(p => p.programme === programme && p.banque === banque);
  if (!preset && sf.presets.length > 0) {
    preset = sf.presets[0];
  }

  let presetZone: PresetZone | undefined;
  let instrumentIdx = 0;
  if (preset) {
    presetZone = preset.zones.find(
      z => noteMidi >= z.noteMin && noteMidi <= z.noteMax &&
           velocite >= z.velMin && velocite <= z.velMax
    );
    if (!presetZone) return [];
    instrumentIdx = presetZone.instrumentIdx;
  } else if (sf.instruments.length > 0) {
    instrumentIdx = 0;
  } else {
    return [];
  }

  const inst = sf.instruments[instrumentIdx];
  if (!inst) return [];

  const matches: {
    echantillon: EchantillonSF2;
    zone: ZoneInstrument;
    donnees: Int16Array;
    debutSample: number;
    finSample: number;
    instrumentIdx: number;
  }[] = [];

  for (const zone of inst.zones) {
    if (noteMidi < zone.noteMin || noteMidi > zone.noteMax ||
        velocite < zone.velMin || velocite > zone.velMax) continue;

    const ech = sf.echantillons[zone.echantillonId];
    if (!ech || ech.debut >= ech.fin) continue;

    const finalAttenuation = (zone.attenuation ?? 0) + (presetZone?.attenuation ?? 0);
    const finalPan = Math.max(-500, Math.min(500, (zone.pan ?? 0) + (presetZone?.pan ?? 0)));
    const combinedZone: ZoneInstrument = {
      ...zone,
      coarseTune: (zone.coarseTune ?? 0) + (presetZone?.coarseTune ?? 0),
      fineTune: (zone.fineTune ?? 0) + (presetZone?.fineTune ?? 0),
      attenuation: finalAttenuation,
      pan: finalPan,
    };

    matches.push({
      echantillon: ech,
      zone: combinedZone,
      donnees: sf.smpl,
      debutSample: ech.debut,
      finSample: ech.fin,
      instrumentIdx,
    });
  }

  return matches;
}
