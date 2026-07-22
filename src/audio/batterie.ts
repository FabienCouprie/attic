// audio/batterie.ts — Rendu d'un séquenceur de batterie SYNTHÉTISÉ (style TR-808).
// Chaque instrument est synthétisé au vol (pas de SoundFont) : fiable, sans
// dépendance, « sonne boîte à rythmes ». Les recettes reprennent celles de la
// boîte à rythmes existante (generation.ts), + un clap.
//
// Grille : 5 pistes fixes (ordre) × N pas, bouclée sur `mesures` mesures.
// Sérialisation du motif : `nRows` lignes séparées par « | », chaque pas « 1 »/« 0 ».
export function decoderMotif(motif: string, nRows: number, nbPas: number): boolean[][] {
  const lignes = (motif || "").split("|");
  const g: boolean[][] = [];
  for (let r = 0; r < nRows; r++) {
    const s = lignes[r] ?? "";
    const row: boolean[] = [];
    for (let c = 0; c < nbPas; c++) row.push(s[c] === "1");
    g.push(row);
  }
  return g;
}

export function encoderMotif(grille: boolean[][]): string {
  return grille.map((row) => row.map((b) => (b ? "1" : "0")).join("")).join("|");
}

export async function rendreSequenceurBatterie(
  grille: boolean[][], // [piste 0..4][pas 0..nbPas-1]
  tempo: number,
  nbPas: number,
  swing: number,       // 0..100 % (décale les pas impairs)
  mesures: number,
  volume: number,      // 0..100 (global)
): Promise<AudioBuffer> {
  const sr = 44100;
  const stepDur = ((60 / Math.max(1, tempo)) * 4) / Math.max(1, nbPas); // barre = 4 temps
  const totalPas = Math.max(1, mesures) * nbPas;
  const duree = totalPas * stepDur + 0.4;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);
  const v = Math.max(0, Math.min(1, volume / 100));

  function jouerKick(debut: number) {
    const gVol = v * 0.8;
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, debut);
    osc.frequency.exponentialRampToValueAtTime(30, debut + 0.12);
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.25);
    osc.connect(g); g.connect(offline.destination);
    osc.start(debut); osc.stop(debut + 0.3);
    const cOsc = offline.createOscillator();
    cOsc.type = "square"; cOsc.frequency.value = 1000;
    const cG = offline.createGain();
    cG.gain.setValueAtTime(gVol * 0.2, debut);
    cG.gain.exponentialRampToValueAtTime(0.001, debut + 0.003);
    cOsc.connect(cG); cG.connect(offline.destination);
    cOsc.start(debut); cOsc.stop(debut + 0.01);
  }

  function jouerSnare(debut: number) {
    const gVol = v * 0.6;
    const osc = offline.createOscillator();
    osc.type = "triangle"; osc.frequency.value = 200;
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol * 0.4, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.08);
    osc.connect(g); g.connect(offline.destination);
    osc.start(debut); osc.stop(debut + 0.1);
    const nLen = Math.ceil(0.12 * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource(); src.buffer = buf;
    const f = offline.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 800;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + 0.12);
    src.connect(f); f.connect(nG); nG.connect(offline.destination);
    src.start(debut); src.stop(debut + 0.15);
  }

  function jouerHat(debut: number, ouvert: boolean) {
    const gVol = v * 0.5;
    const dureeSon = ouvert ? 0.25 : 0.04;
    const nLen = Math.ceil(dureeSon * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource(); src.buffer = buf;
    const f = offline.createBiquadFilter(); f.type = "highpass"; f.frequency.value = ouvert ? 5000 : 7000;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + dureeSon);
    src.connect(f); f.connect(nG); nG.connect(offline.destination);
    src.start(debut); src.stop(debut + dureeSon + 0.01);
  }

  function jouerClap(debut: number) {
    const gVol = v * 0.5;
    for (const off of [0, 0.01, 0.02, 0.032]) {
      const nLen = Math.ceil(0.05 * sr);
      const buf = offline.createBuffer(1, nLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
      const src = offline.createBufferSource(); src.buffer = buf;
      const f = offline.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 1.4;
      const g = offline.createGain(); const t0 = debut + off;
      g.gain.setValueAtTime(gVol * (off === 0 ? 0.6 : 1), t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
      src.connect(f); f.connect(g); g.connect(offline.destination);
      src.start(t0); src.stop(t0 + 0.06);
    }
  }

  for (let pas = 0; pas < totalPas; pas++) {
    const s = pas % nbPas;
    let t = pas * stepDur;
    if (s % 2 === 1) t += (swing / 100) * stepDur * 0.6; // swing sur les contretemps
    if (grille[0]?.[s]) jouerKick(t);
    if (grille[1]?.[s]) jouerSnare(t);
    if (grille[2]?.[s]) jouerHat(t, false);
    if (grille[3]?.[s]) jouerHat(t, true);
    if (grille[4]?.[s]) jouerClap(t);
  }

  const rendu = await offline.startRendering();
  // Renvoie exactement la longueur musicale du motif (sans les 0,4 s de silence
  // de fin) pour un bouclage sans couture. La queue de décroissance du dernier
  // son (qui déborde) est repliée sur le début → continuité au point de bouclage,
  // pas de clic ni d'espace vide à chaque itération.
  const barLen = Math.round(totalPas * stepDur * sr);
  if (barLen >= rendu.length) return rendu;
  const out = new AudioBuffer({ numberOfChannels: rendu.numberOfChannels, length: barLen, sampleRate: sr });
  for (let c = 0; c < rendu.numberOfChannels; c++) {
    const src = rendu.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, barLen));
    for (let i = barLen; i < src.length; i++) dst[i - barLen] += src[i]; // repli de la queue
  }
  return out;
}

// ── Rythme de Cantor ───────────────────────────────────────────────────────
// Construit une grille de pas et retire récursivement la partie centrale de
// chaque intervalle restant. Chaque pas survivant déclenche une percussion.
// Les niveaux de récursion peuvent être mappés sur kick/snare/hat pour un
// motif auto-similaire.

export function genererGrilleCantor(
  nbPas: number,
  profondeur: number,
  subdivision: number,
  partieRetiree: "centre" | "gauche" | "droite" | "aleatoire"
): number[] {
  // Retourne le niveau de récursion de chaque pas actif, ou -1 si inactif.
  const grille = new Int8Array(nbPas).fill(-1);

  function retirer(debut: number, fin: number, niveau: number) {
    if (debut >= fin || niveau > profondeur) return;
    const taille = fin - debut;
    if (niveau > 0) {
      // Marque les extrémités de l'intervalle comme actives à ce niveau.
      grille[debut] = Math.max(grille[debut], niveau - 1);
      grille[Math.max(debut, fin - 1)] = Math.max(grille[Math.max(debut, fin - 1)], niveau - 1);
    }
    if (niveau === profondeur) return;

    const tier = taille / subdivision;
    let retireDebut = 0, retireFin = 0;
    switch (partieRetiree) {
      case "centre":
        retireDebut = debut + Math.floor(tier);
        retireFin = debut + Math.ceil(tier * (subdivision - 1));
        break;
      case "gauche":
        retireDebut = debut;
        retireFin = debut + Math.floor(tier);
        break;
      case "droite":
        retireDebut = debut + Math.ceil(tier * (subdivision - 1));
        retireFin = fin;
        break;
      case "aleatoire":
        // Tire au sort une partie contiguë à retirer.
        const partie = Math.floor(Math.random() * subdivision);
        retireDebut = debut + Math.floor(tier * partie);
        retireFin = debut + Math.floor(tier * (partie + 1));
        break;
    }

    // Récursion sur les deux sous-intervalles restants.
    retirer(debut, Math.max(debut + 1, retireDebut), niveau + 1);
    retirer(Math.min(fin, retireFin), fin, niveau + 1);
  }

  retirer(0, nbPas, 0);
  return Array.from(grille);
}

export async function genererRythmeCantor(
  tempo: number,
  profondeur: number,
  subdivision: number,
  partieRetiree: "centre" | "gauche" | "droite" | "aleatoire",
  mesures: number,
  instrument: "Kick" | "Caisse claire" | "Charley" | "Tous",
  volume: number,
  swing: number = 0,
): Promise<AudioBuffer> {
  const sr = 44100;
  const pasParMesure = 64;
  const totalPas = mesures * pasParMesure;
  const dureePas = (60 / Math.max(1, tempo)) * (4 / pasParMesure);
  const duree = totalPas * dureePas + 0.4;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * sr), sr);
  const v = Math.max(0, Math.min(1, volume / 100));

  const grille = genererGrilleCantor(pasParMesure, Math.max(1, profondeur), subdivision, partieRetiree);

  function jouerKick(debut: number, vol: number) {
    const gVol = vol * v * 0.8;
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, debut);
    osc.frequency.exponentialRampToValueAtTime(30, debut + 0.12);
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.25);
    osc.connect(g); g.connect(offline.destination);
    osc.start(debut); osc.stop(debut + 0.3);
    const cOsc = offline.createOscillator();
    cOsc.type = "square"; cOsc.frequency.value = 1000;
    const cG = offline.createGain();
    cG.gain.setValueAtTime(gVol * 0.2, debut);
    cG.gain.exponentialRampToValueAtTime(0.001, debut + 0.003);
    cOsc.connect(cG); cG.connect(offline.destination);
    cOsc.start(debut); cOsc.stop(debut + 0.01);
  }

  function jouerSnare(debut: number, vol: number) {
    const gVol = vol * v * 0.6;
    const osc = offline.createOscillator();
    osc.type = "triangle"; osc.frequency.value = 200;
    const g = offline.createGain();
    g.gain.setValueAtTime(gVol * 0.4, debut);
    g.gain.exponentialRampToValueAtTime(0.001, debut + 0.08);
    osc.connect(g); g.connect(offline.destination);
    osc.start(debut); osc.stop(debut + 0.1);
    const nLen = Math.ceil(0.12 * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource(); src.buffer = buf;
    const f = offline.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 800;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + 0.12);
    src.connect(f); f.connect(nG); nG.connect(offline.destination);
    src.start(debut); src.stop(debut + 0.15);
  }

  function jouerHat(debut: number, vol: number) {
    const gVol = vol * v * 0.5;
    const nLen = Math.ceil(0.04 * sr);
    const buf = offline.createBuffer(1, nLen, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = Math.random() * 2 - 1;
    const src = offline.createBufferSource(); src.buffer = buf;
    const f = offline.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const nG = offline.createGain();
    nG.gain.setValueAtTime(gVol, debut);
    nG.gain.exponentialRampToValueAtTime(0.001, debut + 0.04);
    src.connect(f); f.connect(nG); nG.connect(offline.destination);
    src.start(debut); src.stop(debut + 0.05);
  }

  for (let m = 0; m < mesures; m++) {
    for (let p = 0; p < pasParMesure; p++) {
      const niveau = grille[p];
      if (niveau < 0) continue;
      let t = (m * pasParMesure + p) * dureePas;
      if (p % 2 === 1) t += (swing / 100) * dureePas * 0.6;
      if (instrument === "Tous") {
        if (niveau % 3 === 0) jouerKick(t, 1);
        else if (niveau % 3 === 1) jouerSnare(t, 1);
        else jouerHat(t, 1);
      } else if (instrument === "Kick") {
        jouerKick(t, 1);
      } else if (instrument === "Caisse claire") {
        jouerSnare(t, 1);
      } else {
        jouerHat(t, 1);
      }
    }
  }

  const rendu = await offline.startRendering();
  const barLen = Math.round(totalPas * dureePas * sr);
  if (barLen >= rendu.length) return rendu;
  const out = new AudioBuffer({ numberOfChannels: rendu.numberOfChannels, length: barLen, sampleRate: sr });
  for (let c = 0; c < rendu.numberOfChannels; c++) {
    const src = rendu.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, barLen));
    for (let i = barLen; i < src.length; i++) dst[i - barLen] += src[i];
  }
  return out;
}
