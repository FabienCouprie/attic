// audio/demonstration-video.ts — Le dessin et l'encodage d'une démonstration.
//
// Rendu HORS TEMPS RÉEL : chaque image est dessinée sur une toile puis confiée à l'encodeur VP9
// du navigateur (WebCodecs), la bande-son à l'encodeur Opus, et le tout est rangé dans un WebM par
// Mediabunny. Rien n'est joué pendant le rendu : la vidéo est identique d'un rendu à l'autre et se
// fabrique plus vite que sa durée. Le plan et la bande-son viennent de `demonstration.ts`.

import {
  DECALAGE_SON, dureeJouable, segmentA,
  type PlanDemo, type SegmentDemo,
} from "./demonstration";

export interface OptionsVideo {
  largeur: number;
  hauteur: number;
  ips: number;
  afficherReglages: boolean;
  /** Libellés traduits. */
  textes: { etapes: string; extrait: (a: string, b: string) => string };
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

const NL = String.fromCharCode(10);
const C = {
  fond: "#101216", panneau: "#181b21", texte: "#ece9e2", gris: "#8b909a", trait: "#2a2e36",
  accent: "#e3a347", accentPale: "#6e5530", courbe: "#6cc0b8",
};
const POLICE = "system-ui, 'Segoe UI', sans-serif";
const MONO = "Consolas, 'Cascadia Mono', monospace";
const FONDU_IMAGE = 0.25;

type Ctx = OffscreenCanvasRenderingContext2D;

/** Ce qui se calcule une fois par segment plutôt qu'à chaque image. */
interface Prepare {
  cretes?: { min: Float32Array; max: Float32Array; jouable: number };
  image?: CanvasImageSource & { width: number; height: number };
}

function envelopper(ctx: Ctx, texte: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split(NL)) {
    let ligne = "";
    for (const mot of paragraphe.split(" ")) {
      const essai = ligne ? ligne + " " + mot : mot;
      if (ctx.measureText(essai).width > largeur && ligne) { lignes.push(ligne); ligne = mot; }
      else ligne = essai;
    }
    lignes.push(ligne);
  }
  return lignes;
}

function formaterSecondes(s: number): string {
  return (Math.round(s * 10) / 10).toLocaleString("fr-FR", { useGrouping: false }) + " s";
}

function cretesDe(son: AudioBuffer, jouable: number, colonnes: number) {
  const min = new Float32Array(colonnes), max = new Float32Array(colonnes);
  const n = Math.max(1, Math.floor(jouable * son.sampleRate));
  const canaux = Array.from({ length: Math.min(2, son.numberOfChannels) }, (_, c) => son.getChannelData(c));
  for (let x = 0; x < colonnes; x++) {
    const a = Math.floor((x / colonnes) * n), b = Math.max(a + 1, Math.floor(((x + 1) / colonnes) * n));
    let lo = 0, hi = 0;
    for (let i = a; i < b; i++) {
      let v = 0;
      for (const c of canaux) v += c[i] ?? 0;
      v /= canaux.length;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[x] = lo; max[x] = hi;
  }
  return { min, max, jouable };
}

async function chargerImage(fichier: Blob): Promise<Prepare["image"]> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Le cadre de contenu d'un segment, selon que les réglages sont affichés ou non. */
function cadres(o: OptionsVideo) {
  const k = o.hauteur / 720, marge = 48 * k;
  const haut = 170 * k, bas = o.hauteur - 110 * k;
  const largeurReglages = o.afficherReglages ? o.largeur * 0.28 : 0;
  return {
    k, marge,
    contenu: { x: marge, y: haut, l: o.largeur - 2 * marge - (largeurReglages ? largeurReglages + marge * 0.5 : 0), h: bas - haut },
    reglages: { x: o.largeur - marge - largeurReglages, y: haut, l: largeurReglages, h: bas - haut },
  };
}

function dessinerOuverture(ctx: Ctx, plan: PlanDemo, o: OptionsVideo, t: number) {
  const k = o.hauteur / 720;
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, o.largeur, o.hauteur);
  ctx.textAlign = "center";
  ctx.fillStyle = C.texte; ctx.font = `600 ${56 * k}px ${POLICE}`;
  ctx.fillText(plan.titre, o.largeur / 2, o.hauteur * 0.42);
  ctx.fillStyle = C.gris; ctx.font = `${24 * k}px ${POLICE}`;
  ctx.fillText(`${plan.segments.length} ${o.textes.etapes} · ${formaterSecondes(plan.duree)}`, o.largeur / 2, o.hauteur * 0.42 + 50 * k);
  ctx.fillStyle = C.accent; ctx.fillRect(o.largeur / 2 - 40 * k, o.hauteur * 0.42 + 80 * k, 80 * k, 3 * k);
  ctx.textAlign = "left";
  fondu(ctx, o, Math.min(t, plan.ouverture - t));
}

function fondu(ctx: Ctx, o: OptionsVideo, distanceAuBord: number) {
  if (distanceAuBord >= FONDU_IMAGE) return;
  ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, distanceAuBord) / FONDU_IMAGE})`;
  ctx.fillRect(0, 0, o.largeur, o.hauteur);
}

function dessinerSegment(ctx: Ctx, plan: PlanDemo, seg: SegmentDemo, prep: Prepare, o: OptionsVideo, t: number) {
  const { k, marge, contenu, reglages } = cadres(o);
  const u = t - seg.debut;
  const e = seg.etape;
  ctx.fillStyle = C.fond; ctx.fillRect(0, 0, o.largeur, o.hauteur);

  // En-tête : rang, nom, résumé.
  ctx.fillStyle = C.accent; ctx.font = `600 ${18 * k}px ${POLICE}`;
  ctx.fillText(`${seg.index + 1} / ${plan.segments.length}`, marge, 52 * k);
  ctx.fillStyle = C.texte; ctx.font = `600 ${40 * k}px ${POLICE}`;
  ctx.fillText(e.titre, marge, 98 * k);
  ctx.fillStyle = C.gris; ctx.font = `${20 * k}px ${POLICE}`;
  envelopper(ctx, e.resume, o.largeur - 2 * marge).slice(0, 2).forEach((l, i) => ctx.fillText(l, marge, 128 * k + i * 26 * k));

  // Contenu.
  ctx.fillStyle = C.panneau; ctx.fillRect(contenu.x, contenu.y, contenu.l, contenu.h);
  const a = e.apercu;
  if (a.genre === "audio" && prep.cretes) dessinerSon(ctx, prep.cretes, a.son, seg, contenu, k, u, o);
  else if (a.genre === "courbe") dessinerCourbe(ctx, a.valeurs, contenu, k, u / seg.duree);
  else if (a.genre === "image" && prep.image) dessinerImage(ctx, prep.image, contenu);
  else if (a.genre === "texte") dessinerTexte(ctx, a.texte, contenu, k, u / seg.duree);

  // Réglages.
  if (o.afficherReglages && e.reglages.length) {
    ctx.font = `${16 * k}px ${POLICE}`;
    let y = reglages.y + 22 * k;
    for (const r of e.reglages) {
      for (const l of envelopper(ctx, r, reglages.l).slice(0, 2)) {
        if (y > reglages.y + reglages.h) break;
        ctx.fillStyle = C.texte; ctx.fillText(l, reglages.x, y);
        y += 22 * k;
      }
      y += 8 * k;
    }
  }

  // Pied : la chaîne des étapes, l'étape courante en évidence.
  dessinerChaine(ctx, plan, seg.index, o, k, marge);
  ctx.fillStyle = C.trait; ctx.fillRect(0, o.hauteur - 4 * k, o.largeur, 4 * k);
  ctx.fillStyle = C.accent; ctx.fillRect(0, o.hauteur - 4 * k, o.largeur * Math.min(1, t / plan.duree), 4 * k);

  fondu(ctx, o, Math.min(u, seg.duree - u));
}

function dessinerChaine(ctx: Ctx, plan: PlanDemo, courant: number, o: OptionsVideo, k: number, marge: number) {
  ctx.font = `${15 * k}px ${POLICE}`;
  const y = o.hauteur - 48 * k, h = 30 * k, pad = 12 * k, ecart = 22 * k;
  const pastilles = plan.segments.map((s) => ({ texte: s.etape.titre, l: ctx.measureText(s.etape.titre).width + 2 * pad }));
  // Fenêtre autour de l'étape courante quand la chaîne ne tient pas sur la largeur.
  let debut = 0, fin = pastilles.length;
  const place = o.largeur - 2 * marge;
  const largeurDe = (a: number, b: number) => pastilles.slice(a, b).reduce((s, p) => s + p.l + ecart, -ecart);
  while (largeurDe(debut, fin) > place && fin - debut > 1) {
    if (courant - debut > fin - 1 - courant) debut++; else fin--;
  }
  let x = marge;
  for (let i = debut; i < fin; i++) {
    const p = pastilles[i];
    ctx.fillStyle = i === courant ? C.accent : i < courant ? C.accentPale : C.trait;
    ctx.fillRect(x, y, p.l, h);
    ctx.fillStyle = i === courant ? C.fond : C.texte;
    ctx.fillText(p.texte, x + pad, y + h * 0.68);
    x += p.l;
    // Un trait quand l'étape suivante reçoit celle-ci ; un point quand elles ne sont pas reliées.
    if (i < fin - 1) {
      ctx.fillStyle = C.gris;
      if (plan.segments[i + 1].etape.suitLaPrecedente) ctx.fillRect(x + 4 * k, y + h / 2 - 1 * k, ecart - 8 * k, 2 * k);
      else { ctx.beginPath(); ctx.arc(x + ecart / 2, y + h / 2, 2 * k, 0, Math.PI * 2); ctx.fill(); }
    }
    x += ecart;
  }
}

function dessinerSon(ctx: Ctx, cr: NonNullable<Prepare["cretes"]>, son: AudioBuffer, seg: SegmentDemo,
  c: { x: number; y: number; l: number; h: number }, k: number, u: number, o: OptionsVideo) {
  const milieu = c.y + c.h / 2, ampli = c.h * 0.42;
  const position = cr.jouable > 0 ? (u - DECALAGE_SON) / cr.jouable : 0;
  const tete = Math.max(0, Math.min(1, position));
  const colonnes = cr.min.length;
  for (let x = 0; x < colonnes; x++) {
    ctx.fillStyle = x / colonnes <= tete ? C.accent : C.accentPale;
    const y0 = milieu - cr.max[x] * ampli, y1 = milieu - cr.min[x] * ampli;
    ctx.fillRect(c.x + (x / colonnes) * c.l, y0, Math.max(1, c.l / colonnes), Math.max(1, y1 - y0));
  }
  if (position >= 0 && position <= 1) {
    ctx.fillStyle = C.texte;
    ctx.fillRect(c.x + tete * c.l - 1 * k, c.y + 8 * k, 2 * k, c.h - 16 * k);
  }
  ctx.fillStyle = C.gris; ctx.font = `${15 * k}px ${POLICE}`;
  const legende = cr.jouable < son.duration - 1e-6
    ? o.textes.extrait(formaterSecondes(cr.jouable), formaterSecondes(son.duration))
    : formaterSecondes(son.duration);
  ctx.fillText(`${legende} · ${son.numberOfChannels} × ${son.sampleRate} Hz`, c.x + 12 * k, c.y + c.h - 12 * k);
  void seg;
}

function dessinerCourbe(ctx: Ctx, v: Float32Array, c: { x: number; y: number; l: number; h: number }, k: number, f: number) {
  const pad = 24 * k, h = c.h - 2 * pad, l = c.l - 2 * pad;
  ctx.strokeStyle = C.trait; ctx.lineWidth = 1 * k;
  for (const g of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(c.x + pad, c.y + pad + (1 - g) * h); ctx.lineTo(c.x + pad + l, c.y + pad + (1 - g) * h); ctx.stroke(); }
  if (!v.length) return;
  const pas = Math.max(1, Math.floor(v.length / Math.max(1, l)));
  ctx.strokeStyle = C.courbe; ctx.lineWidth = 3 * k; ctx.beginPath();
  for (let i = 0; i < v.length; i += pas) {
    const x = c.x + pad + (i / Math.max(1, v.length - 1)) * l, y = c.y + pad + (1 - Math.max(0, Math.min(1, v[i]))) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const fc = Math.max(0, Math.min(1, f));
  const iv = Math.min(v.length - 1, Math.round(fc * (v.length - 1)));
  const cx = c.x + pad + fc * l, cy = c.y + pad + (1 - Math.max(0, Math.min(1, v[iv]))) * h;
  ctx.fillStyle = C.texte; ctx.fillRect(cx - 1 * k, c.y + pad, 2 * k, h);
  ctx.beginPath(); ctx.arc(cx, cy, 7 * k, 0, Math.PI * 2); ctx.fillStyle = C.courbe; ctx.fill();
}

function dessinerImage(ctx: Ctx, img: NonNullable<Prepare["image"]>, c: { x: number; y: number; l: number; h: number }) {
  const w = img.width || 1, h = img.height || 1;
  const e = Math.min(c.l / w, c.h / h);
  ctx.drawImage(img, c.x + (c.l - w * e) / 2, c.y + (c.h - h * e) / 2, w * e, h * e);
}

function dessinerTexte(ctx: Ctx, texte: string, c: { x: number; y: number; l: number; h: number }, k: number, f: number) {
  const pad = 20 * k, pas = 24 * k;
  ctx.font = `${17 * k}px ${MONO}`;
  const lignes = envelopper(ctx, texte, c.l - 2 * pad);
  const visibles = Math.floor((c.h - 2 * pad) / pas);
  // Un texte plus long que le cadre défile, de sa première à sa dernière ligne, sur la durée du segment.
  const decalage = lignes.length > visibles ? Math.round(Math.max(0, Math.min(1, (f - 0.1) / 0.8)) * (lignes.length - visibles)) : 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(c.x, c.y, c.l, c.h); ctx.clip();
  ctx.fillStyle = C.texte;
  lignes.slice(decalage, decalage + visibles).forEach((l, i) => ctx.fillText(l, c.x + pad, c.y + pad + (i + 0.8) * pas));
  ctx.restore();
}

function tranche(b: AudioBuffer, debut: number, fin: number): AudioBuffer {
  const n = Math.max(1, fin - debut);
  const t = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: n, sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) t.copyToChannel(b.getChannelData(c).subarray(debut, debut + n), c);
  return t;
}

/** Rend la vidéo WebM (VP9 et Opus) d'un plan. */
export async function rendreVideo(plan: PlanDemo, bande: AudioBuffer, o: OptionsVideo): Promise<Blob> {
  const mb = await import("mediabunny");
  const toile = new OffscreenCanvas(o.largeur, o.hauteur);
  const ctx = toile.getContext("2d") as Ctx;
  const { contenu } = cadres(o);
  const prepares = new Map<SegmentDemo, Prepare>();
  for (const seg of plan.segments) {
    const a = seg.etape.apercu;
    if (a.genre === "audio") prepares.set(seg, { cretes: cretesDe(a.son, dureeJouable(a.son, seg), Math.max(64, Math.floor(contenu.l / 3))) });
    else if (a.genre === "image") prepares.set(seg, { image: await chargerImage(a.fichier).catch(() => undefined) });
    else prepares.set(seg, {});
  }

  const codecVideo = (await mb.canEncodeVideo("vp9", { width: o.largeur, height: o.hauteur })) ? "vp9" : "vp8";
  const cible = new mb.BufferTarget();
  const sortie = new mb.Output({ format: new mb.WebMOutputFormat(), target: cible });
  const video = new mb.CanvasSource(toile, { codec: codecVideo, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  const audio = new mb.AudioBufferSource({ codec: "opus", bitrate: mb.QUALITY_HIGH });
  sortie.addVideoTrack(video, { frameRate: o.ips });
  sortie.addAudioTrack(audio);
  await sortie.start();

  const images = Math.max(1, Math.round(plan.duree * o.ips));
  let audioEcrit = 0;
  try {
    for (let i = 0; i < images; i++) {
      if (o.signal?.aborted) throw new DOMException("Annulé", "AbortError");
      const t = i / o.ips;
      const seg = segmentA(plan, t);
      if (!seg) dessinerOuverture(ctx, plan, o, t);
      else dessinerSegment(ctx, plan, seg, prepares.get(seg) ?? {}, o, t);
      await video.add(t, 1 / o.ips);
      // La bande-son avance avec l'image, par tranches d'une seconde : l'encodeur n'a jamais à
      // garder toute la vidéo en attente de son audio.
      const audioVoulu = Math.min(bande.length, Math.ceil(((i + 1) / o.ips + 1) * bande.sampleRate));
      if (audioVoulu - audioEcrit >= bande.sampleRate || (i === images - 1 && audioVoulu > audioEcrit)) {
        await audio.add(tranche(bande, audioEcrit, audioVoulu));
        audioEcrit = audioVoulu;
      }
      if (i % 15 === 0) o.onProgress?.(i / images);
    }
    if (audioEcrit < bande.length) await audio.add(tranche(bande, audioEcrit, bande.length));
    await sortie.finalize();
  } catch (e) {
    await sortie.cancel().catch(() => {});
    throw e;
  }
  return new Blob([cible.buffer!], { type: "video/webm" });
}
