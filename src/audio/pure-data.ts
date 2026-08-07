// audio/pure-data.ts — Exécute un patch Pure Data (.pd) via libpd-wasm dans un
// OfflineAudioContext. Le patch reçoit l'audio d'entrée sur les canaux adc~ et
// produit sa sortie sur dac~.
import { createPd, checkPatch } from "libpd-wasm";
import workletVanillaUrl from "libpd-wasm/assets/libpd-worklet.js?url";
import workletCycloneUrl from "libpd-wasm/assets/libpd-worklet-cyclone.js?url";
import workletElseUrl from "libpd-wasm/assets/libpd-worklet-else.js?url";
import workletFullUrl from "libpd-wasm/assets/libpd-worklet-full.js?url";

const WORKLET_URLS: Record<string, string> = {
  vanilla: workletVanillaUrl,
  cyclone: workletCycloneUrl,
  else: workletElseUrl,
  full: workletFullUrl,
};

/** Objets GUI / graphiques que libpd-wasm ne peut pas exécuter en mode headless. */
const GUI_OBJECT_TYPES = new Set([
  "bng", "tgl", "hsl", "vsl", "hradio", "vradio", "cnv", "vu", "nbx",
  "floatatom", "symbolatom", "listbox",
  "array", "table", "plot",
  "drawpolygon", "drawcurve", "filledcurve", "drawnumber", "drawsymbol",
  "gatom", "slider", "radio", "toggle", "bang",
]);

function isGuiLine(line: string): { index: number; gui: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#X ")) return null;
  // Format d'une ligne d'objet : #X obj x y type ...
  // Format d'un atom : #X floatatom x y ... / #X symbolatom x y ... / #X listbox x y ...
  // Format d'un canvas : #X c ...
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const kind = parts[1];
  if (kind === "obj" && parts.length >= 5) {
    const type = parts[4].toLowerCase();
    if (GUI_OBJECT_TYPES.has(type)) {
      return { index: 0, gui: true };
    }
  }
  if (GUI_OBJECT_TYPES.has(kind.toLowerCase())) {
    return { index: 0, gui: true };
  }
  return { index: 0, gui: false };
}

/** Supprime les objets GUI du patch Pd ainsi que les connexions qui les référencent.
 * Retourne le source nettoyé et la liste des objets supprimés. */
export function filtrerObjetsGUI(patchSource: string): { source: string; supprimes: string[] } {
  const lines = patchSource.split(/\r?\n/);
  const guiIndices = new Set<number>();
  const supprimes: string[] = [];

  // Premier passage : identifier les lignes GUI et leur index (position dans le patch).
  lines.forEach((line, idx) => {
    const info = isGuiLine(line);
    if (info?.gui) {
      guiIndices.add(idx);
      const parts = line.trim().split(/\s+/);
      const type = parts[1] === "obj" ? parts[4] : parts[1];
      supprimes.push(type);
    }
  });

  if (guiIndices.size === 0) {
    return { source: patchSource, supprimes: [] };
  }

  // Index des objets visuels (non GUI) pour réindexer les connexions.
  const keptIndices: number[] = [];
  const oldToNew = new Map<number, number>();
  lines.forEach((line, idx) => {
    if (!line.trim().startsWith("#X connect") && !guiIndices.has(idx)) {
      oldToNew.set(idx, keptIndices.length);
      keptIndices.push(idx);
    }
  });

  // Reconstruire les lignes : d'abord les lignes non-connexion non-GUI, puis les connexions valides.
  const outLines: string[] = [];
  lines.forEach((line, idx) => {
    if (guiIndices.has(idx)) return;
    if (!line.trim().startsWith("#X connect")) {
      outLines.push(line);
      return;
    }
    // Format : #X connect src outlet dst inlet
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) return;
    const srcIdx = parseInt(parts[2], 10);
    const dstIdx = parseInt(parts[3], 10);
    if (guiIndices.has(srcIdx) || guiIndices.has(dstIdx)) return;
    const newSrc = oldToNew.get(srcIdx);
    const newDst = oldToNew.get(dstIdx);
    if (newSrc === undefined || newDst === undefined) return;
    outLines.push(`#X connect ${newSrc} ${parts[3]} ${newDst} ${parts[4]}`);
  });

  return { source: outLines.join("\n"), supprimes: [...new Set(supprimes)] };
}

export interface OptionsPureData {
  packages: string;
  outputChannels: number;
  bangOnStart?: boolean;
  ignorerGUI?: boolean;
}

export async function appliquerPatchPureData(
  buffer: AudioBuffer,
  patchSource: string,
  options: OptionsPureData,
): Promise<AudioBuffer> {
  const { packages, outputChannels, bangOnStart = true, ignorerGUI = false } = options;

  let source = patchSource;
  let guiSupprimes: string[] = [];
  if (ignorerGUI) {
    const filtered = filtrerObjetsGUI(source);
    source = filtered.source;
    guiSupprimes = filtered.supprimes;
    if (guiSupprimes.length > 0) {
      console.log("[pure-data] objets GUI ignorés:", guiSupprimes.join(", "));
    }
  }

  const packageList = packages === "full"
    ? ["vanilla", "cyclone", "else"]
    : packages === "else"
      ? ["vanilla", "else"]
      : packages === "cyclone"
        ? ["vanilla", "cyclone"]
        : ["vanilla"];

  const workletUrl = WORKLET_URLS[packages] || workletVanillaUrl;

  const check = checkPatch({ packages: packageList, files: { "patch.pd": source }, entry: "patch.pd" });
  if (!check.ok) {
    // Regroupe les objets manquants par type de problème.
    const missingPackages: string[] = [];
    const unsupported: string[] = [];
    for (const m of check.messages) {
      const pkgMatch = m.match(/object\s+"([^"]+)"\s+requires package:\s*(\S+)/);
      if (pkgMatch) {
        missingPackages.push(`${pkgMatch[1]} → ${pkgMatch[2]}`);
      } else {
        const unsupportedMatch = m.match(/Unsupported Pd object\s*:\s*(\S+)/i);
        if (unsupportedMatch) {
          unsupported.push(unsupportedMatch[1]);
        } else {
          unsupported.push(m);
        }
      }
    }
    const details: string[] = [];
    if (missingPackages.length) details.push(`objets nécessitant une autre bibliothèque : ${missingPackages.join(", ")}`);
    if (unsupported.length) details.push(`objets non supportés : ${unsupported.join(", ")}`);
    if (guiSupprimes.length) details.push(`objets GUI ignorés : ${guiSupprimes.join(", ")}`);
    const hint = packages === "full" ? "" : ` Essaie la bibliothèque "full" si un objet fait partie de cyclone/else.`;
    throw new Error(`Patch incompatible : ${details.join(" ; ")}${hint}`);
  }

  const sr = buffer.sampleRate;
  const len = buffer.length;
  const outChannels = Math.max(1, Math.min(8, outputChannels));

  const audioContext = new OfflineAudioContext(outChannels, len, sr);
  await audioContext.audioWorklet.addModule(workletUrl);

  const pd = await createPd({
    packages: packageList,
    files: { "patch.pd": source },
    entry: "patch.pd",
    audioContext: audioContext as any,
    workletUrl,
    onPrint: (text: string) => console.log("[pd]", text),
    onError: (err: Error) => console.error("[pd]", err),
  });

  const sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = buffer;
  console.log("[pure-data] input buffer:", buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  console.log("[pure-data] output channels:", outChannels);
  console.log("[pure-data] pd node inputs:", pd.node.numberOfInputs, "outputs:", pd.node.numberOfOutputs);
  sourceNode.connect(pd.node);
  pd.connect(audioContext.destination);

  if (bangOnStart) {
    pd.sendBang("loadbang");
  }

  sourceNode.start(0);
  const rendered = await audioContext.startRendering();
  console.log("[pure-data] rendered buffer:", rendered.numberOfChannels, rendered.length, rendered.sampleRate, "silent=", estSilencieux(rendered));
  await pd.close();
  return rendered;
}

function estSilencieux(buffer: AudioBuffer): boolean {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 100) {
      if (Math.abs(data[i]) > 1e-9) return false;
    }
  }
  return true;
}
