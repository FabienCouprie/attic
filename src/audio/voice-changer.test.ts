// audio/voice-changer.test.ts
// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { appliquerVoiceChanger, listeEffetsVoiceChanger } from "./voice-changer";

describe("voice changer", () => {
  it("liste les effets prédéfinis", () => {
    expect(listeEffetsVoiceChanger()).toContain("Chipmunk");
    expect(listeEffetsVoiceChanger()).toContain("Robot");
    expect(listeEffetsVoiceChanger()).toContain("Phone");
  });

  it("conserve la durée et le nombre de canaux", async () => {
    const sr = 44100;
    const buffer = new AudioBuffer({ numberOfChannels: 2, length: sr, sampleRate: sr });
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * 440 * i / sr);
    }
    for (const effet of listeEffetsVoiceChanger()) {
      const out = await appliquerVoiceChanger(buffer, effet);
      expect(out.numberOfChannels).toBe(2);
      expect(out.length).toBe(buffer.length);
      expect(out.sampleRate).toBe(sr);
    }
  });

  it("retourne le buffer inchangé pour un effet inconnu", async () => {
    const buffer = new AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: 44100 });
    const out = await appliquerVoiceChanger(buffer, "Inconnu");
    expect(out).toBe(buffer);
  });
});
