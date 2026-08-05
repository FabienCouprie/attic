// plugins/notices.test.ts — Vérifie que les notices des derniers composants sont attachées.
import { describe, it, expect } from "vitest";
import { fiches as fichesOcr } from "./ocr";
import { fiches as fichesExportSvg } from "./export-svg";
import { fiches as fichesTtsPiper } from "./tts-piper";
import { fiches as fichesTtsKokoro } from "./tts-kokoro";


describe("notices des composants livrés", () => {
  it.each([
    ["ocr", fichesOcr],
    ["export-svg", fichesExportSvg],
    ["tts-piper", fichesTtsPiper],
    ["tts-kokoro", fichesTtsKokoro],
  ])("%s a une notice française et anglaise", (_id, fiches) => {
    const fiche = fiches[0];
    expect(fiche).toBeDefined();
    expect(typeof fiche.notice).toBe("string");
    expect(fiche.notice?.length).toBeGreaterThan(10);
    expect(typeof fiche.noticeEn).toBe("string");
    expect(fiche.noticeEn?.length).toBeGreaterThan(10);
  });

});
