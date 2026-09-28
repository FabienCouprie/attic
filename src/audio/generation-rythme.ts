// audio/generation-rythme.ts — La grille de la boite a rythmes, et son rendu.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { PATRONS_RYTHME } from "./generation-patrons";
import type { Patron } from "./generation-patrons";

function genererPatronDefaut(tempsParMesure: number, uniteBattement: number): Patron {
  const subParTemps = 4 / (uniteBattement / 4);
  const kick: number[] = [];
  const snare: number[] = [];
  const hat: number[] = [];
  for (let b = 0; b < tempsParMesure; b++) {
    const pos = Math.round(b * subParTemps);
    if (b === 0 || b === Math.floor(tempsParMesure / 2)) kick.push(pos);
    if (b % 2 === 1) snare.push(pos);
    hat.push(pos);
  }
  return { kick, snare, hat, hatOuvert: [] };
}


/**
 * La grille d'une boîte à rythmes : quatre pistes de booléens, dépliées sur toutes les mesures.
 *
 * EXTRAITE DU GÉNÉRATEUR pour que le rendu audio et la sortie MIDI voient LA MÊME grille. Les deux la
 * recopieraient sinon, et une correction faite d'un côté manquerait de l'autre — le genre de
 * divergence qui fait qu'un même patron ne sonne pas pareil selon qu'on l'écoute ou qu'on le rejoue.
 */
export function grilleBoiteRythmes(
  patronNom: string,
  mesures: number,
  tempsParMesure: number = 4,
  uniteBattement: number = 4,
): { kick: boolean[]; snare: boolean[]; hat: boolean[]; hatOuvert: boolean[]; pasMesure: number; totalPas: number } {
  const pasMesure = tempsParMesure * 4;
  const totalPas = mesures * pasMesure;
  const entree = PATRONS_RYTHME[patronNom];
  const signatureCle = `${tempsParMesure}/${uniteBattement}`;
  const patron: Patron = entree && entree.signatures.includes(signatureCle)
    ? entree.positions[signatureCle]!
    : genererPatronDefaut(tempsParMesure, uniteBattement);
  const kick = Array.from({ length: totalPas }, () => false);
  const snare = Array.from({ length: totalPas }, () => false);
  const hat = Array.from({ length: totalPas }, () => false);
  const hatOuvert = Array.from({ length: totalPas }, () => false);
  for (let m = 0; m < mesures; m++) {
    const decalage = m * pasMesure;
    for (const p of patron.kick) kick[decalage + p] = true;
    for (const p of patron.snare) snare[decalage + p] = true;
    for (const p of patron.hat) hat[decalage + p] = true;
    for (const p of patron.hatOuvert) hatOuvert[decalage + p] = true;
  }
  return { kick, snare, hat, hatOuvert, pasMesure, totalPas };
}

export async function genererBoiteRythmes(
  tempo: number,
  patronNom: string,
  mesures: number,
  volumeKick: number,
  volumeSnare: number,
  volumeHat: number,
  tempsParMesure: number = 4,
  uniteBattement: number = 4,
  hasard: () => number = Math.random,
): Promise<AudioBuffer> {
  const sr = 44100;
  const dureeNoire = 60 / Math.max(1, tempo);
  const dureeBattement = dureeNoire * (4 / uniteBattement);
  const pasMesure = tempsParMesure * 4;
  const tempsPas = dureeBattement / 4;
  const totalPas = mesures * pasMesure;
  const duree = totalPas * tempsPas;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);

  const { kick, snare, hat, hatOuvert } = grilleBoiteRythmes(
    patronNom, mesures, tempsParMesure, uniteBattement);
  const triggers = { kick, snare, hat, hatOuvert };

  function jouerKick(debut: number, vol: number) {
    const gVol = vol * 0.8;
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, debut);
    osc.frequency.exponentialRampToValueAtTime(30, debut + 0.12);
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.25);
    osc.connect(g);
    g.connect(offline.destination);
    osc.start(debut);
    osc.stop(debut + 0.3);

    const cOsc = offline.createOscillator();
    cOsc.type = "square";
    cOsc.frequency.value = 1000;
    const cG = offline.createGain();
    cG.gain.setValueAtTime(gVol * 0.2, debut);
    cG.gain.exponentialRampToValueAtTime(0.001, debut + 0.003);
    cOsc.connect(cG);
    cG.connect(offline.destination);
    cOsc.start(debut);
    cOsc.stop(debut + 0.01);
  }

  function jouerSnare(debut: number, vol: number) {
    const gVol = vol * 0.6;
    const osc = offline.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 200;
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol * 0.4, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.08);
    osc.connect(g);
    g.connect(offline.destination);
    osc.start(debut);
    osc.stop(debut + 0.1);

    const nLen = Math.ceil(0.12 * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = hasard() * 2 - 1;
    const src = offline.createBufferSource();
    src.buffer = buf;
    const f = offline.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 800;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + 0.12);
    src.connect(f);
    f.connect(nG);
    nG.connect(offline.destination);
    src.start(debut);
    src.stop(debut + 0.15);
  }

  function jouerHat(debut: number, vol: number, ouvert: boolean) {
    const gVol = vol * 0.5;
    const dureeSon = ouvert ? 0.25 : 0.04;
    const nLen = Math.ceil(dureeSon * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = hasard() * 2 - 1;
    const src = offline.createBufferSource();
    src.buffer = buf;
    const f = offline.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = ouvert ? 5000 : 7000;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + dureeSon);
    src.connect(f);
    f.connect(nG);
    nG.connect(offline.destination);
    src.start(debut);
    src.stop(debut + dureeSon + 0.01);
  }

  const vk = Math.max(0, Math.min(1, volumeKick / 100));
  const vs = Math.max(0, Math.min(1, volumeSnare / 100));
  const vh = Math.max(0, Math.min(1, volumeHat / 100));

  for (let i = 0; i < totalPas; i++) {
    const t = i * tempsPas;
    if (triggers.kick[i]) jouerKick(t, vk);
    if (triggers.snare[i]) jouerSnare(t, vs);
    if (triggers.hat[i]) jouerHat(t, vh, false);
    if (triggers.hatOuvert[i]) jouerHat(t, vh, true);
  }

  return offline.startRendering();
}

