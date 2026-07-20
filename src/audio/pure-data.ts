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

export interface OptionsPureData {
  packages: string;
  outputChannels: number;
  bangOnStart?: boolean;
}

export async function appliquerPatchPureData(
  buffer: AudioBuffer,
  patchSource: string,
  options: OptionsPureData,
): Promise<AudioBuffer> {
  const { packages, outputChannels, bangOnStart = true } = options;
  const packageList = packages === "full"
    ? ["vanilla", "cyclone", "else"]
    : packages === "else"
      ? ["vanilla", "else"]
      : packages === "cyclone"
        ? ["vanilla", "cyclone"]
        : ["vanilla"];

  const workletUrl = WORKLET_URLS[packages] || workletVanillaUrl;

  const check = checkPatch({ packages: packageList, files: { "patch.pd": patchSource }, entry: "patch.pd" });
  if (!check.ok) {
    throw new Error(`Patch incompatible : ${check.messages.join(" ; ")}`);
  }

  const sr = buffer.sampleRate;
  const len = buffer.length;
  const outChannels = Math.max(1, Math.min(8, outputChannels));

  const audioContext = new OfflineAudioContext(outChannels, len, sr);
  await audioContext.audioWorklet.addModule(workletUrl);

  const pd = await createPd({
    packages: packageList,
    files: { "patch.pd": patchSource },
    entry: "patch.pd",
    audioContext: audioContext as any,
    workletUrl,
    onPrint: (text: string) => console.log("[pd]", text),
    onError: (err: Error) => console.error("[pd]", err),
  });

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(pd.node);
  pd.connect(audioContext.destination);

  if (bangOnStart) {
    pd.sendBang("loadbang");
  }

  source.start(0);
  const rendered = await audioContext.startRendering();
  await pd.close();
  return rendered;
}
