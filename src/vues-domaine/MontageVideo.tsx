// ui/MontageVideo.tsx — Le film à l'écran, et les sons posés dessous sur son axe.
//
// ON NE SYNCHRONISE PAS À L'AVEUGLE. Poser un son à l'image 1 200 sans voir le plan qu'il souligne
// revient à compter les images à la main ; la vue montre le film, les bandes sous lui sur le même
// axe, et une tête de lecture commune. Une bande se déplace à la souris, et c'est le réglage
// « Image n » qu'elle écrit : rien de neuf dans le nœud, seulement de quoi viser.
//
// LE FILM N'EST PAS CHARGÉ EN MÉMOIRE, ici non plus. L'élément vidéo lit une adresse servie par
// notre protocole, qui répond par plages ; se déplacer dans onze minutes ne coûte que les morceaux
// demandés. Voir `electron/plage-media.cjs`.
//
// LES BANDES VIENNENT DE L'EXÉCUTION, comme au visualiseur multipiste : le nœud pose sur lui-même
// l'enveloppe de chaque piste. Avant la première exécution, une piste branchée reçoit une bande
// vide, qui se place déjà : le début se règle sans connaître la forme du son.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import { calerSource, courbeDeGain, gainLineaire } from "../audio/apercu-video";
import {
  formatTemps, imageApresDeplacement, imageDepuisSecondesCalee, rectDeBande, secondesDepuisX,
  type BandeVue, type ColonneVue,
} from "./montage-video-geometrie";

export interface InfosFilm { dureeSec: number; cadence: number; largeur?: number; hauteur?: number }

export interface ReglagesPiste { gainDb: number; fonduEntreeMs: number; fonduSortieMs: number }

export interface MontageVideoProps {
  id: string;
  chemin: string;
  /** Les enveloppes posées par l'exécution, une entrée par piste branchée. */
  enveloppes: { piste: number; dureeSec: number; crete: number; colonnes: ColonneVue[] }[];
  /** Les sons posés par l'exécution, pour les entendre sur le film. */
  sons: Record<number, AudioBuffer>;
  /** Le niveau et les fondus d'une piste, tels que le rendu les emploiera. */
  reglagesDePiste: (piste: number) => ReglagesPiste;
  /** Le niveau du son d'origine du film, en décibels. */
  gainFilmDb: number;
  infos: InfosFilm | null;
  /** Le rang des entrées branchées, pour dessiner une bande avant toute exécution. */
  branchees: number[];
  /** L'image de départ de chaque piste, lue dans les réglages. */
  imageDePiste: (piste: number) => number;
  onDeplacer: (piste: number, image: number) => void;
  urlFilm: string | null;
  /** Le fichier produit par la dernière exécution, à enregistrer quelque part. */
  resultat: { url: string; nom: string; octets: number } | null;
  /** Ce que le composant a mesuré du film, quand personne ne l'a encore fait. */
  onMesurer?: () => void;
}

const MEGA = 1024 * 1024;

const MARGE_GAUCHE = 24;
const HAUTEUR_BANDE = 26;
const HAUTEUR_AXE = 14;
/** Ce que mesure le repère d'une piste dont la durée n'est pas encore connue. */
const LARGEUR_REPERE = 10;

const largeurMini = (b: { dureeSec: number }) => (b.dureeSec > 0 ? 1 : LARGEUR_REPERE);

export function MontageVideo(p: MontageVideoProps) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement | null>(null);
  const hote = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [temps, setTemps] = useState(0);
  const prise = useRef<{ piste: number; xPrise: number; debutSec: number } | null>(null);

  const cadence = p.infos?.cadence ?? 0;
  const dureeFilm = p.infos?.dureeSec ?? 0;

  // LES BANDES SONT CELLES DES PISTES BRANCHÉES, ET D'ELLES SEULES. Une exécution laisse sur le nœud
  // l'enveloppe de chaque piste ; débrancher une entrée n'efface pas cette trace, et la bande d'une
  // piste qui n'existe plus resterait à l'écran, prête à être déplacée et à ne rien produire. Ce sont
  // les câbles qui décident, l'enveloppe ne fait que remplir.
  const bandes = useMemo<BandeVue[]>(() => {
    return [...new Set(p.branchees)].sort((a, b) => a - b).map((piste) => {
      const e = p.enveloppes.find((x) => x.piste === piste);
      return {
        piste,
        debutSec: cadence > 0 ? p.imageDePiste(piste) / cadence : 0,
        dureeSec: e?.dureeSec ?? 0,
        crete: e?.crete,
        colonnes: e?.colonnes,
      };
    });
  }, [p.branchees, p.enveloppes, p.imageDePiste, cadence]);

  useEffect(() => { if (!p.infos && p.chemin) p.onMesurer?.(); }, [p.infos, p.chemin, p.onMesurer]);

  // Le niveau du film, porté par le volume de l'élément : à moins soixante décibels, il se tait ici
  // comme dans le fichier produit.
  useEffect(() => {
    if (video.current) video.current.volume = Math.min(1, gainLineaire(p.gainFilmDb));
  }, [p.gainFilmDb, p.urlFilm]);

  // ── Le dessin ──
  const dessiner = useCallback(() => {
    const c = canvas.current;
    const boite = hote.current;
    if (!c || !boite) return;
    const l = Math.max(80, Math.floor(boite.clientWidth));
    const h = Math.max(HAUTEUR_BANDE + HAUTEUR_AXE, Math.floor(boite.clientHeight));
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.floor(l * ratio);
    c.height = Math.floor(h * ratio);
    c.style.width = `${l}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, l, h);

    const largeur = l - MARGE_GAUCHE;
    if (!(dureeFilm > 0) || largeur <= 0) return;
    const hauteurBandes = h - HAUTEUR_AXE;
    const bande = bandes.length > 0 ? hauteurBandes / bandes.length : hauteurBandes;

    bandes.forEach((b, rang) => {
      const haut = rang * bande;
      const milieu = haut + bande / 2;
      if (rang % 2 === 1) {
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(MARGE_GAUCHE, haut, largeur, bande);
      }
      const r = rectDeBande(b, dureeFilm, MARGE_GAUCHE, largeur, largeurMini(b));
      // Le corps de la bande : la place que le son occupe dans le film.
      ctx.fillStyle = r.deborde ? "rgba(224,122,95,0.16)" : "rgba(138,164,255,0.16)";
      ctx.fillRect(r.x, haut + 2, r.largeur, Math.max(4, bande - 4));
      ctx.strokeStyle = r.deborde ? "rgba(224,122,95,0.85)" : "rgba(138,164,255,0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, haut + 2.5, Math.max(1, r.largeur - 1), Math.max(3, bande - 5));

      const colonnes = b.colonnes ?? [];
      if (colonnes.length > 0) {
        ctx.fillStyle = "rgba(138,164,255,0.95)";
        const pasX = r.largeur / colonnes.length;
        const demi = (bande / 2) * 0.8;
        for (let i = 0; i < colonnes.length; i++) {
          const col = colonnes[i];
          const y1 = milieu - col.max * demi;
          const y2 = milieu - col.min * demi;
          ctx.fillRect(r.x + i * pasX, y1, Math.max(0.6, pasX), Math.max(0.8, y2 - y1));
        }
      }

      ctx.fillStyle = "rgba(233,224,240,0.8)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.piste + 1), 7, milieu);
    });

    // L'axe du temps du film, commun à toutes les bandes.
    const y = h - HAUTEUR_AXE;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(MARGE_GAUCHE, y);
    ctx.lineTo(l, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(169,155,184,0.9)";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "top";
    for (let k = 0; k <= 4; k++) {
      const x = MARGE_GAUCHE + (k / 4) * largeur;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.textAlign = k === 4 ? "right" : k === 0 ? "left" : "center";
      ctx.fillText(formatTemps((k / 4) * dureeFilm), x, y + 4);
    }
    ctx.textAlign = "left";

    // LA TÊTE DE LECTURE EST LE LIEN entre l'image et les sons : c'est elle qui dit, d'un coup
    // d'œil, quelle bande tombe sur le plan qu'on regarde.
    const xTete = MARGE_GAUCHE + (Math.min(temps, dureeFilm) / dureeFilm) * largeur;
    ctx.strokeStyle = "rgba(233,224,240,0.9)";
    ctx.beginPath();
    ctx.moveTo(xTete, 0);
    ctx.lineTo(xTete, y);
    ctx.stroke();
  }, [bandes, dureeFilm, temps]);

  useEffect(() => {
    dessiner();
    const boite = hote.current;
    if (!boite) return;
    const observateur = new ResizeObserver(dessiner);
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, [dessiner]);

  // ── Entendre les sons posés, pendant que le film défile ──
  //
  // LE SON D'ORIGINE VIENT DE L'ÉLÉMENT VIDÉO, les pistes viennent du Web Audio : deux chemins, une
  // seule horloge, celle du film. Le niveau du film est porté par le volume de l'élément, ce qui le
  // fait taire à moins soixante décibels comme le fera le rendu. Un volume ne monte pas au-dessus
  // de un : un gain positif s'entend donc à zéro ici, et à sa vraie valeur dans le fichier produit.
  const audio = useRef<AudioContext | null>(null);
  const sources = useRef<AudioBufferSourceNode[]>([]);

  const arreterSons = useCallback(() => {
    for (const s of sources.current) { try { s.stop(); } catch { /* déjà arrêtée */ } s.disconnect(); }
    sources.current = [];
  }, []);

  const lancerSons = useCallback((tempsFilm: number) => {
    arreterSons();
    const aJouer = bandes.filter((b) => p.sons[b.piste]);
    if (aJouer.length === 0) return;
    if (!audio.current) audio.current = new AudioContext();
    const ctx = audio.current;
    void ctx.resume();
    const depart = ctx.currentTime + 0.02; // de quoi programmer sans buter sur l'instant courant
    for (const b of aJouer) {
      const son = p.sons[b.piste];
      const calage = calerSource(b.debutSec, son.duration, tempsFilm);
      if (!calage) continue;
      const reglages = p.reglagesDePiste(b.piste);
      const source = ctx.createBufferSource();
      source.buffer = son;
      const gain = ctx.createGain();
      const courbe = courbeDeGain(reglages, son.duration, calage.decalage);
      gain.gain.setValueCurveAtTime(courbe, depart + calage.quand, Math.max(0.001, calage.duree));
      source.connect(gain).connect(ctx.destination);
      source.start(depart + calage.quand, calage.decalage, calage.duree);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      sources.current.push(source);
    }
  }, [bandes, p.sons, p.reglagesDePiste, arreterSons]);

  // REPROGRAMMER SUR UN CHANGEMENT, ET NON SUR UN RENDU. La tête de lecture provoque soixante rendus
  // par seconde ; reprogrammer à chacun couperait le son en continu. Ce qui doit décider, c'est ce
  // qu'on entendrait : la position d'une piste, sa durée, son niveau, ses fondus.
  const lancerRef = useRef(lancerSons);
  lancerRef.current = lancerSons;
  const signatureLecture = bandes
    .map((b) => `${b.piste}@${b.debutSec.toFixed(4)}:${p.sons[b.piste]?.duration ?? 0}:${
      Object.values(p.reglagesDePiste(b.piste)).join(",")}`)
    .join("|");
  useEffect(() => {
    const v = video.current;
    if (!v || v.paused) return;
    lancerRef.current(v.currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureLecture]);

  useEffect(() => () => { arreterSons(); void audio.current?.close(); }, [arreterSons]);

  // LE TEMPS SE SUIT À L'IMAGE PRÈS PENDANT LA LECTURE. `timeupdate` ne se déclenche que trois ou
  // quatre fois par seconde : la tête de lecture avancerait par saccades d'une dizaine d'images.
  useEffect(() => {
    let vivant = true;
    let demande = 0;
    const suivre = () => {
      if (!vivant) return;
      const v = video.current;
      if (v && !v.paused && !v.ended) setTemps(v.currentTime);
      demande = requestAnimationFrame(suivre);
    };
    demande = requestAnimationFrame(suivre);
    return () => { vivant = false; cancelAnimationFrame(demande); };
  }, []);

  /**
   * Le point visé, DANS LES PIXELS DU DESSIN et non dans ceux de l'écran.
   *
   * Le canevas du graphe a un zoom : à 50 %, la boîte mesurée à l'écran fait la moitié de la boîte
   * dessinée. Mêler les deux placerait les sons ailleurs qu'où on les pose, et d'autant plus loin
   * qu'on aurait zoomé.
   */
  const pointDansDessin = (e: React.PointerEvent) => {
    const c = canvas.current;
    if (!c) return null;
    const boite = c.getBoundingClientRect();
    if (!(boite.width > 0) || !(boite.height > 0)) return null;
    return {
      x: ((e.clientX - boite.left) * c.clientWidth) / boite.width,
      y: ((e.clientY - boite.top) * c.clientHeight) / boite.height,
      largeurUtile: c.clientWidth - MARGE_GAUCHE,
      hauteurBandes: c.clientHeight - HAUTEUR_AXE,
    };
  };

  const pisteSous = (y: number, hauteurBandes: number): number | null => {
    if (bandes.length === 0 || y >= hauteurBandes) return null;
    const rang = Math.floor(y / (hauteurBandes / bandes.length));
    return bandes[Math.min(Math.max(rang, 0), bandes.length - 1)]?.piste ?? null;
  };

  const surPointerDown = (e: React.PointerEvent) => {
    const point = pointDansDessin(e);
    if (!point || !(dureeFilm > 0)) return;
    const piste = pisteSous(point.y, point.hauteurBandes);
    const b = piste === null ? undefined : bandes.find((z) => z.piste === piste);
    const r = b ? rectDeBande(b, dureeFilm, MARGE_GAUCHE, point.largeurUtile, largeurMini(b)) : null;
    // PRENDRE UNE BANDE LA DÉPLACE ; CLIQUER À CÔTÉ DÉPLACE LE FILM. Deux gestes au même endroit,
    // distingués par ce qui se trouve sous le curseur, comme dans un montage.
    if (b && r && point.x >= r.x && point.x <= r.x + r.largeur && cadence > 0) {
      prise.current = { piste: b.piste, xPrise: point.x, debutSec: b.debutSec };
      try { canvas.current?.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    } else {
      const sec = secondesDepuisX(point.x, MARGE_GAUCHE, point.largeurUtile, dureeFilm);
      if (video.current) video.current.currentTime = sec;
      setTemps(sec);
    }
  };

  const surPointerMove = (e: React.PointerEvent) => {
    const enCours = prise.current;
    const point = pointDansDessin(e);
    if (!enCours || !point) return;
    p.onDeplacer(enCours.piste, imageApresDeplacement(
      enCours.debutSec, enCours.xPrise, point.x, MARGE_GAUCHE, point.largeurUtile, dureeFilm, cadence,
    ));
  };

  const surPointerUp = (e: React.PointerEvent) => {
    if (prise.current) {
      try { canvas.current?.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    }
    prise.current = null;
  };

  const image = cadence > 0 ? imageDepuisSecondesCalee(temps, cadence, dureeFilm) : null;

  return (
    <>
      <NodeResizer minWidth={360} minHeight={320} />
      <div className="attic-vue-film nodrag">
        {p.urlFilm ? (
          <video
            ref={video}
            src={p.urlFilm}
            controls
            // LES COMMANDES QUI NE MÈNENT NULLE PART SONT RETIRÉES. Le plein écran ne répondait pas,
            // signalé par Fabien ; le téléchargement redemanderait au disque un fichier qui en vient,
            // et la lecture à distance n'a pas de destinataire. Le nœud se redimensionne pour agrandir
            // l'image, et le bouton sous les pistes enregistre le fichier produit.
            controlsList="nofullscreen nodownload noremoteplayback"
            disablePictureInPicture
            preload="metadata"
            onPlay={(e) => lancerSons(e.currentTarget.currentTime)}
            onPause={arreterSons}
            onEnded={arreterSons}
            onSeeking={arreterSons}
            onSeeked={(e) => {
              setTemps(e.currentTarget.currentTime);
              if (!e.currentTarget.paused) lancerSons(e.currentTarget.currentTime);
            }}
            onRateChange={arreterSons}
            onTimeUpdate={(e) => setTemps(e.currentTarget.currentTime)}
          />
        ) : (
          <div className="attic-vue-film-vide">
            {p.chemin ? t("montageVideo.sansLecteur") : t("montageVideo.sansFilm")}
          </div>
        )}
        <div className="attic-vue-film-temps">
          <span>{formatTemps(temps)}</span>
          {image !== null && <span>{t("montageVideo.image")} {image}</span>}
          {dureeFilm > 0 && <span>{formatTemps(dureeFilm)}</span>}
          {cadence > 0 && <span>{cadence.toFixed(2)} {t("montageVideo.imagesParSeconde")}</span>}
        </div>
        <div
          ref={hote}
          className="attic-vue-film-pistes"
          onPointerDown={surPointerDown}
          onPointerMove={surPointerMove}
          onPointerUp={surPointerUp}
          onPointerCancel={surPointerUp}
        >
          <canvas ref={canvas} />
          {bandes.length === 0 && (
            <span className="attic-vue-film-aucune">{t("montageVideo.aucunePiste")}</span>
          )}
        </div>
        {/* LE FICHIER PRODUIT SE RÉCUPÈRE ICI. Il n'existe qu'en mémoire tant qu'on ne l'enregistre
            pas, et la fermeture de la fenêtre l'emporte. Le dialogue du système dans l'application
            de bureau, le téléchargement du navigateur ailleurs. */}
        {p.resultat && (
          <div className="attic-vue-film-resultat">
            {(window as any).api?.sauvegarderBinaire ? (
              <button className="attic-node-fichier-btn" onClick={async () => {
                const buffer = await (await fetch(p.resultat!.url)).arrayBuffer();
                await (window as any).api.sauvegarderBinaire({
                  defaultPath: p.resultat!.nom,
                  filters: [{ name: "MP4", extensions: ["mp4"] }],
                  buffer,
                });
              }}>💾 {t("montageVideo.enregistrer")}</button>
            ) : (
              <a className="attic-node-fichier-btn" href={p.resultat.url} download={p.resultat.nom}>
                💾 {t("montageVideo.enregistrer")}
              </a>
            )}
            <span>{p.resultat.nom}</span>
            <span>{(p.resultat.octets / MEGA).toFixed(1)} Mo</span>
          </div>
        )}
      </div>
    </>
  );
}
