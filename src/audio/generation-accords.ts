// audio/generation-accords.ts — Le generateur d'accords.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { comparerEvenementsMidi } from "./midi";
import { writeMidi } from "midi-file";
import { PROGRESSIONS_GENRE, degreAccordProche, degreSeptiemeProche, degresGammeAccords, traduireCle } from "./generation";

// ─── Générateur d'accords ───


const ROMAIN_VERS_DEGRE: Record<string, number> = {
  I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6,
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
};


export function genererAccords(
  cleNom: string, gammeNom: string, genreNom: string, progressionPerso: string,
  tempo: number, dureeAccord: number, nbAccords: number,
  extension: "aucune" | "septieme" | "sixte" = "aucune",
): { midiBytes: Uint8Array; description: string } {
  const gammeCourante = degresGammeAccords(gammeNom);
  const estMineur = degreAccordProche(gammeCourante, 0, 4) < 4; // tierce mineure depuis la tonique
  const decalage = traduireCle(cleNom);

  let progression: number[];
  if (genreNom === "custom" || genreNom === "personnalisé") {
    progression = progressionPerso.split("-").map((r) => ROMAIN_VERS_DEGRE[r.trim()] ?? 0);
  } else {
    const progressions = PROGRESSIONS_GENRE[genreNom] || PROGRESSIONS_GENRE["pop"];
    progression = progressions[0];
  }

  const noire = 60 / tempo;
  const dureeSecAccord = dureeAccord * noire;
  const tpm = 480;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const pisteAccords: any[] = [
    { deltaTime: 0, type: "programChange", channel: 0, programNumber: estMineur ? 1 : 0 },
  ];
  const pistePad: any[] = [
    { deltaTime: 0, type: "programChange", channel: 1, programNumber: 48 },
  ];

  for (let i = 0; i < nbAccords; i++) {
    const deb = i * dureeSecAccord;
    const fin = deb + dureeSecAccord;
    const degre = progression[i % progression.length];
    const racinePc = gammeCourante[degre % gammeCourante.length];
    const fonda = 36 + decalage + racinePc + Math.floor(degre / gammeCourante.length) * 12;
    const tierce = degreAccordProche(gammeCourante, racinePc, 4);
    const quinte = degreAccordProche(gammeCourante, racinePc, 7);
    const td = secEnTicks(deb);
    const tf = secEnTicks(fin);

    // Voicing aéré sur 3 octaves — son plus riche et moins agressif. Tierce
    // et quinte suivent la gamme choisie (degreAccordProche) au lieu d'un
    // intervalle fixe, pour que les modes (dorien, locrien…) et les gammes
    // pentatoniques sonnent avec leur couleur propre.
    const voixAccord = [
      { note: fonda - 12, vel: 90 },        // basse octave -1
      { note: fonda + quinte, vel: 65 },     // quinte médium
      { note: fonda + 12 + tierce, vel: 60 }, // tierce aiguë
      { note: fonda + 12 + quinte, vel: 55 }, // quinte aiguë
      { note: fonda + 24, vel: 50 },         // octave haute
    ];
    // Extension optionnelle (7e ou 6e), diatonique à la gamme choisie —
    // ajoutée dans le même registre aigu que la tierce/quinte.
    if (extension === "septieme") {
      voixAccord.push({ note: fonda + 12 + degreSeptiemeProche(gammeCourante, racinePc), vel: 50 });
    } else if (extension === "sixte") {
      voixAccord.push({ note: fonda + 12 + degreAccordProche(gammeCourante, racinePc, 9), vel: 50 });
    }

    for (let vi = 0; vi < voixAccord.length; vi++) {
      const v = voixAccord[vi];
      // Arpège doux : chaque note décalée progressivement de ~15 ms
      const tArp = td + Math.round((vi * 15) * tpm * tempo / 60000);
      pisteAccords.push({ deltaTime: tArp, type: "noteOn", channel: 0, noteNumber: v.note, velocity: v.vel });
      pisteAccords.push({ deltaTime: Math.max(tArp + 1, tf), type: "noteOff", channel: 0, noteNumber: v.note, velocity: 0 });
    }

    // Pad tenu — deux notes espacées
    pistePad.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda, velocity: 40 });
    pistePad.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda, velocity: 0 });
    pistePad.push({ deltaTime: td, type: "noteOn", channel: 1, noteNumber: fonda + 19, velocity: 35 });
    pistePad.push({ deltaTime: Math.max(td + 1, tf), type: "noteOff", channel: 1, noteNumber: fonda + 19, velocity: 0 });
  }

  function trierPiste(events: any[]): any[] {
    // Réglages, note-off, puis note-on à l'intérieur d'un même tick : voir
    // `comparerEvenementsMidi`. L'ordre inverse faisait taire toute note relancée à la
    // même hauteur sur le même canal — un accord ou un pad tenu jusqu'au suivant.
    events.sort((a, b) =>
      comparerEvenementsMidi({ tick: a.deltaTime, type: a.type }, { tick: b.deltaTime, type: b.type }),
    );
    let tick = 0;
    const sorted: any[] = [];
    for (const e of events) {
      sorted.push({ ...e, deltaTime: e.deltaTime - tick });
      tick = e.deltaTime;
    }
    sorted.push({ deltaTime: 0, type: "endOfTrack" });
    return sorted;
  }

  const metaEvents = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];
  const piste1 = [...metaEvents, ...trierPiste(pisteAccords)];
  const piste2 = trierPiste(pistePad);
  const midi = { header: { format: 1 as const, numTracks: 2, ticksPerBeat: tpm }, tracks: [piste1, piste2] };
  const bytes = new Uint8Array(writeMidi(midi));

  const romain = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const descr = [
    `── Progression d'accords ──`,
    `${cleNom} ${gammeNom} · ${genreNom} · ${tempo} BPM`,
    `${nbAccords} accords × ${dureeAccord}t · ${(nbAccords * dureeSecAccord).toFixed(1)}s`,
    progression.map((d) => romain[d % 7]).join(" – "),
  ].join("\n");

  return { midiBytes: bytes, description: descr };
}


