// audio/musicxml-parties.ts — Une séquence à voix en MusicXML, une partie par voix.
//
// L'ÉCRIVAIN DE `audio/musicxml.ts` N'ÉCRIT QU'UNE PARTIE, où les notes qui commencent ensemble
// font un accord : quatre voix d'un choral s'y fondent, et « Lire une partition » les relirait en
// une seule. Ici chaque voix est écrite seule par lui, puis les parties sont réunies sous une même
// liste, chacune à son identifiant, toutes de la même longueur.

import { notesVersMusicXML, type OptionsMusicXML } from "./musicxml";
import type { Sequence } from "./sequence";

/** Le contenu d'une partie écrite seule, entre ses balises. */
const corpsDeLaPartie = (xml: string): string => {
  const m = /<part id="P1">([\s\S]*)<\/part>/.exec(xml);
  if (!m) throw new Error("partie introuvable dans le MusicXML écrit");
  return m[1];
};

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Écrit une séquence à voix, une partie par voix ; une voix dont la plupart des notes sont sous le do central prend la clé de fa. */
export function sequenceVersMusicXMLParVoix(s: Sequence, options: OptionsMusicXML = {}): string {
  const voix = [...new Set(s.notes.map((n) => n.voix ?? 0))].sort((a, b) => a - b);
  if (voix.length === 0) throw new Error("une pièce sans note ne s'écrit pas en MusicXML");
  const tempo = options.tempo ?? (s.tempo && s.tempo > 0 ? s.tempo : 120);
  const [num, den] = options.metrique ?? [4, 4];
  // TOUTES LES PARTIES ONT LA LONGUEUR DE LA PLUS LONGUE, en mesures de la métrique demandée.
  const fin = Math.max(...s.notes.map((n) => n.fin));
  const mesures = Math.max(1, Math.ceil(fin / ((60 / tempo) * ((num * 4) / den)) - 1e-9));
  const parties = voix.map((v, k) => {
    const siennes = s.notes.filter((n) => (n.voix ?? 0) === v);
    const graves = siennes.filter((n) => n.note < 60).length;
    const nom = s.voix?.find((x) => x.numero === v)?.nom ?? `${k + 1}`;
    const xml = notesVersMusicXML(siennes, { ...options, tempo, mesures, instrument: nom, cle: graves * 2 > siennes.length ? "fa" : "sol" });
    return { id: `P${k + 1}`, nom, corps: corpsDeLaPartie(xml), entete: xml.slice(0, xml.indexOf("  <part-list>")) };
  });
  return [
    parties[0].entete.trimEnd(),
    "  <part-list>",
    ...parties.map((p) => `    <score-part id="${p.id}"><part-name>${echapper(p.nom)}</part-name></score-part>`),
    "  </part-list>",
    ...parties.map((p) => `  <part id="${p.id}">${p.corps}</part>`),
    "</score-partwise>",
    "",
  ].join("\n");
}
