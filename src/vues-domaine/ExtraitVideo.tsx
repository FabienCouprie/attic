// ui/ExtraitVideo.tsx — Le film à l'écran, et la portion qu'on en garde dessous.
//
// ON NE COUPE PAS À L'AVEUGLE, pas plus qu'on ne synchronise à l'aveugle. La portion se dessine sur
// l'axe du film, ses deux bords se prennent à la souris, et deux boutons posent une borne là où le
// film est arrêté, ce qui est la façon exacte de découper un plan : on regarde, on s'arrête, on pose.
//
// LA GÉOMÉTRIE EST CELLE DU MONTAGE, au même module près : une bande sur un axe, une tête de lecture,
// une abscisse qui redevient un instant. Ce qui change est le nombre de bandes, une seule, et ce
// qu'on y prend, ses bords plutôt que son corps.

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import {
  formatTemps, imageDepuisSecondesCalee, rectDeBande, secondesDepuisX,
} from "./montage-video-geometrie";

export interface InfosFilm { dureeSec: number; cadence: number; largeur?: number; hauteur?: number }

export interface ExtraitVideoProps {
  chemin: string;
  urlFilm: string | null;
  infos: InfosFilm | null;
  imageDebut: number;
  imageFin: number;
  onBorner: (borne: "debut" | "fin", image: number) => void;
  resultat: { url: string; nom: string; octets: number } | null;
  onMesurer?: () => void;
}

const MEGA = 1024 * 1024;
const MARGE_GAUCHE = 24;
const HAUTEUR_AXE = 14;
/** La zone de prise d'un bord, de part et d'autre du trait. */
const PRISE_BORD = 7;

export function ExtraitVideo(p: ExtraitVideoProps) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement | null>(null);
  const hote = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [temps, setTemps] = useState(0);
  const prise = useRef<"debut" | "fin" | null>(null);

  const cadence = p.infos?.cadence ?? 0;
  const dureeFilm = p.infos?.dureeSec ?? 0;
  // UNE FIN QUI NE DÉPASSE PAS LE DÉBUT DÉSIGNE LA FIN DU FILM, comme à l'exécution : la vue montre
  // donc ce que le fichier contiendra, et non les deux nombres tels qu'ils sont écrits.
  const debutSec = cadence > 0 ? Math.min(p.imageDebut / cadence, dureeFilm) : 0;
  const finSec = cadence > 0 && p.imageFin > p.imageDebut
    ? Math.min(p.imageFin / cadence, dureeFilm)
    : dureeFilm;

  useEffect(() => { if (!p.infos && p.chemin) p.onMesurer?.(); }, [p.infos, p.chemin, p.onMesurer]);

  const dessiner = useCallback(() => {
    const c = canvas.current;
    const boite = hote.current;
    if (!c || !boite) return;
    const l = Math.max(80, Math.floor(boite.clientWidth));
    const h = Math.max(30, Math.floor(boite.clientHeight));
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
    const hautBande = h - HAUTEUR_AXE;

    // Ce qui est écarté est assombri, ce qui est gardé reste clair : la portion se lit d'un coup.
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(MARGE_GAUCHE, 0, largeur, hautBande);
    const r = rectDeBande({ debutSec, dureeSec: finSec - debutSec }, dureeFilm, MARGE_GAUCHE, largeur);
    ctx.fillStyle = "rgba(138,164,255,0.18)";
    ctx.fillRect(r.x, 0, r.largeur, hautBande);

    // Les deux bords, épais pour être visés.
    ctx.fillStyle = "rgba(138,164,255,0.95)";
    ctx.fillRect(r.x - 1, 0, 3, hautBande);
    ctx.fillRect(r.x + r.largeur - 2, 0, 3, hautBande);

    ctx.fillStyle = "rgba(233,224,240,0.85)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`${formatTemps(finSec - debutSec)}`, Math.min(r.x + 6, l - 60), 4);

    const y = h - HAUTEUR_AXE;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(MARGE_GAUCHE, y);
    ctx.lineTo(l, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(169,155,184,0.9)";
    ctx.font = "9px system-ui, sans-serif";
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

    const xTete = MARGE_GAUCHE + (Math.min(temps, dureeFilm) / dureeFilm) * largeur;
    ctx.strokeStyle = "rgba(233,224,240,0.9)";
    ctx.beginPath();
    ctx.moveTo(xTete, 0);
    ctx.lineTo(xTete, y);
    ctx.stroke();
  }, [debutSec, finSec, dureeFilm, temps]);

  useEffect(() => {
    dessiner();
    const boite = hote.current;
    if (!boite) return;
    const observateur = new ResizeObserver(dessiner);
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, [dessiner]);

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

  /** Le point visé, dans les pixels du dessin : le canevas du graphe a un zoom. */
  const pointDansDessin = (e: React.PointerEvent) => {
    const c = canvas.current;
    if (!c) return null;
    const boite = c.getBoundingClientRect();
    if (!(boite.width > 0)) return null;
    return {
      x: ((e.clientX - boite.left) * c.clientWidth) / boite.width,
      largeurUtile: c.clientWidth - MARGE_GAUCHE,
    };
  };

  const poser = (borne: "debut" | "fin", sec: number) => {
    const image = imageDepuisSecondesCalee(sec, cadence, dureeFilm);
    p.onBorner(borne, image);
  };

  const surPointerDown = (e: React.PointerEvent) => {
    const point = pointDansDessin(e);
    if (!point || !(dureeFilm > 0) || !(cadence > 0)) return;
    const r = rectDeBande({ debutSec, dureeSec: finSec - debutSec }, dureeFilm, MARGE_GAUCHE, point.largeurUtile);
    // PRENDRE UN BORD LE DÉPLACE ; CLIQUER AILLEURS DÉPLACE LE FILM. Le bord le plus proche gagne,
    // à condition d'être assez près : sans cette distance, un clic destiné à l'axe saisirait un bord.
    const dDebut = Math.abs(point.x - r.x);
    const dFin = Math.abs(point.x - (r.x + r.largeur));
    if (Math.min(dDebut, dFin) <= PRISE_BORD) {
      prise.current = dDebut <= dFin ? "debut" : "fin";
      try { canvas.current?.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      return;
    }
    const sec = secondesDepuisX(point.x, MARGE_GAUCHE, point.largeurUtile, dureeFilm);
    if (video.current) video.current.currentTime = sec;
    setTemps(sec);
  };

  const surPointerMove = (e: React.PointerEvent) => {
    const borne = prise.current;
    const point = pointDansDessin(e);
    if (!borne || !point) return;
    poser(borne, secondesDepuisX(point.x, MARGE_GAUCHE, point.largeurUtile, dureeFilm));
  };

  const surPointerUp = (e: React.PointerEvent) => {
    if (prise.current) {
      try { canvas.current?.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    }
    prise.current = null;
  };

  const image = cadence > 0 ? imageDepuisSecondesCalee(temps, cadence, dureeFilm) : null;
  const imageFinVue = cadence > 0 ? imageDepuisSecondesCalee(finSec, cadence, dureeFilm) : 0;

  return (
    <>
      <NodeResizer minWidth={360} minHeight={300} />
      <div className="attic-vue-film nodrag">
        {p.urlFilm ? (
          <video
            ref={video}
            src={p.urlFilm}
            controls
            controlsList="nofullscreen nodownload noremoteplayback"
            disablePictureInPicture
            preload="metadata"
            onSeeked={(e) => setTemps(e.currentTarget.currentTime)}
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
        <div className="attic-vue-film-bornes">
          <button className="attic-node-fichier-btn" disabled={!(cadence > 0)}
            onClick={() => poser("debut", temps)}>{t("extraitVideo.debutIci")}</button>
          <button className="attic-node-fichier-btn" disabled={!(cadence > 0)}
            onClick={() => poser("fin", temps)}>{t("extraitVideo.finIci")}</button>
          <span>{t("montageVideo.image")} {p.imageDebut} → {imageFinVue}</span>
        </div>
        <div
          ref={hote}
          className="attic-vue-film-pistes attic-vue-film-plage"
          onPointerDown={surPointerDown}
          onPointerMove={surPointerMove}
          onPointerUp={surPointerUp}
          onPointerCancel={surPointerUp}
        >
          <canvas ref={canvas} />
        </div>
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
              }}>💾 {t("extraitVideo.enregistrer")}</button>
            ) : (
              <a className="attic-node-fichier-btn" href={p.resultat.url} download={p.resultat.nom}>
                💾 {t("extraitVideo.enregistrer")}
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
