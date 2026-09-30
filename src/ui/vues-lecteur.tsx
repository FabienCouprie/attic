// ui/vues-lecteur.tsx — Le lecteur de musique.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState, useRef, useEffect, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n } from "../i18n";
import { useStatut } from "./statuts";
import { estActif } from "./vues-fichiers";
import { tempsAuCentieme } from "./lecteur-audio";
import type { VueProps } from "./vues";

export function VueLecteurMusique({ id, data }: VueProps) {
  const { t } = useI18n();
  const api = (window as { api?: any }).api;
  const [fichiers, setFichiers] = useState<{ nom: string; chemin: string }[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioNom, setAudioNom] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [pendingPlay, setPendingPlay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevStatutRef = useRef<string>("");
  const prevUrlRef = useRef<string | null>(null);

  const chemin = String((data.parametres?.["Chemin"] as string | number | undefined) ?? "music collection");
  const volume = typeof data.parametres?.["Volume"] === "number" ? (data.parametres["Volume"] as number) : 80;
  // Ces deux paramètres sont lus ici directement dans `parametres` (pas via
  // `paramTexte`), donc sans canonisation : on accepte l'id « oui » comme les
  // anciens libellés FR/EN encore stockés dans les projets existants.
  const shuffle = estActif(data.parametres?.["Lecture aléatoire"]);
  const loop = estActif(data.parametres?.["Lecture en boucle"]);

  // LE CENTIÈME PLUTÔT QUE LA SECONDE : ce transport est à nous, et il tronquait comme celui du
  // navigateur. Un fichier d'une demi-seconde s'y lisait « 0:00 / 0:00 », et beaucoup de ce que ce
  // dépôt fabrique dure moins de deux secondes.
  const formatTime = tempsAuCentieme;

  const rafraichir = useCallback(async () => {
    if (!api) return;
    setChargement(true);
    try {
      const rel = chemin.replace(/^[/\\]+|[/\\]+$/g, "");
      const liste = (await api?.lireDossier(rel)) ?? [];
      const cibles = (liste as { nom: string; chemin: string }[]).filter((f) => {
        const ext = f.chemin.slice(f.chemin.lastIndexOf(".")).toLowerCase();
        return [".wav", ".mp3"].includes(ext);
      });
      setFichiers(cibles);
      setCurrentIndex(-1);
      setAudioUrl(null);
      setAudioNom(null);
      setCurrentTime(0);
      setDuration(0);
    } finally {
      setChargement(false);
    }
  }, [api, chemin]);

  const loadTrack = useCallback(async (i: number, andPlay = false) => {
    if (!api || !fichiers || !fichiers[i]) return;
    const f = fichiers[i];
    setCurrentIndex(i);
    setAudioNom(f.nom);
    const res: { nom: string; donnees: ArrayBufferView | ArrayBuffer } | null = await api.lireFichierAudio(f.chemin);
    if (!res) return;
      const blob = new Blob([res.donnees as ArrayBuffer], { type: "audio/mpeg" });
    const fichier = new File([blob], res.nom, { type: "audio/mpeg" });
    const url = URL.createObjectURL(fichier);
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    prevUrlRef.current = url;
    setAudioUrl(url);
    setPendingPlay(andPlay);
    data.onChangerParametre?.(id, "Piste", f.nom);
  }, [api, fichiers, data, id]);

  const nextIndex = useCallback((from: number) => {
    if (!fichiers || fichiers.length === 0) return -1;
    if (fichiers.length === 1) return 0;
    if (shuffle) {
      let n = from;
      let safety = 0;
      while (n === from && safety < 10) { n = Math.floor(Math.random() * fichiers.length); safety++; }
      return n;
    }
    return (from + 1) % fichiers.length;
  }, [fichiers, shuffle]);

  const prevIndex = useCallback((from: number) => {
    if (!fichiers || fichiers.length === 0) return -1;
    if (fichiers.length === 1) return 0;
    if (shuffle) {
      let n = from;
      let safety = 0;
      while (n === from && safety < 10) { n = Math.floor(Math.random() * fichiers.length); safety++; }
      return n;
    }
    return (from - 1 + fichiers.length) % fichiers.length;
  }, [fichiers, shuffle]);

  const handlePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (!audioUrl && fichiers && fichiers.length > 0) {
      loadTrack(currentIndex >= 0 ? currentIndex : 0, true);
      return;
    }
    audioRef.current.play().catch(() => {});
  }, [audioUrl, fichiers, currentIndex, loadTrack]);

  const handlePause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const handleNext = useCallback(() => {
    if (!fichiers?.length) return;
    const i = nextIndex(currentIndex);
    if (i >= 0) loadTrack(i, true);
  }, [fichiers, currentIndex, nextIndex, loadTrack]);

  const handlePrev = useCallback(() => {
    if (!fichiers?.length) return;
    const i = prevIndex(currentIndex);
    if (i >= 0) loadTrack(i, true);
  }, [fichiers, currentIndex, prevIndex, loadTrack]);

  const handleEnded = useCallback(() => {
    if (!fichiers?.length) return;
    if (loop) {
      const i = nextIndex(currentIndex);
      if (i >= 0) loadTrack(i, true);
    } else {
      setIsPlaying(false);
    }
  }, [fichiers, loop, currentIndex, nextIndex, loadTrack]);

  // Écrit l'id canonique (et non plus le libellé français), pour rester
  // cohérent avec la valeur des <option> du menu déroulant de l'inspecteur.
  const toggleShuffle = useCallback(() => {
    data.onChangerParametre?.(id, "Lecture aléatoire", shuffle ? "non" : "oui");
  }, [data, id, shuffle]);

  const toggleLoop = useCallback(() => {
    data.onChangerParametre?.(id, "Lecture en boucle", loop ? "non" : "oui");
  }, [data, id, loop]);

  const handleVolume = useCallback((v: number) => {
    data.onChangerParametre?.(id, "Volume", v);
    if (audioRef.current) audioRef.current.volume = v / 100;
  }, [data, id]);

  const handleSeek = useCallback((v: number) => {
    if (audioRef.current && duration) audioRef.current.currentTime = (v / 100) * duration;
  }, [duration]);

  // Déclenchement au run : détecte la transition en_cours -> termine.
  // Le statut vient du magasin d'exécution, plus de `data` — voir `ui/statuts.ts`.
  const statutExec = useStatut(id).statut;
  useEffect(() => {
    const prev = prevStatutRef.current;
    prevStatutRef.current = statutExec;
    if (statutExec === "termine" && prev === "en_cours") {
      if (fichiers && fichiers.length > 0 && !audioUrl) {
        loadTrack(currentIndex >= 0 ? currentIndex : 0, true);
      } else {
        setPendingPlay(true);
      }
    }
  }, [statutExec, fichiers, audioUrl, currentIndex, loadTrack]);

  // Lecture automatique dès qu'un audio est prêt et demandé
  useEffect(() => {
    if (pendingPlay && audioRef.current && audioUrl) {
      audioRef.current.play().catch(() => {});
      setPendingPlay(false);
    }
  }, [pendingPlay, audioUrl]);

  // Volume initial / changement
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  // Nettoyage de l'URL à la destruction du nœud
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  return (
    <div className="attic-node-fichier nodrag" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={300} minHeight={220} />
      {!api ? (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("msg.electronUniquement")}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="attic-node-fichier-btn" style={{ flex: 1 }} disabled={chargement} onClick={rafraichir}>
              {t("lecteur.rafraichir").replace("{chemin}", chemin.replace(/^[/\\]+/, "")).replace("{path}", chemin.replace(/^[/\\]+/, ""))}
            </button>
            <button className="attic-node-fichier-btn" title={t("btn.choisirDossier")} onClick={async () => {
              const d = await api?.choisirDossier();
              if (d) data.onChangerParametre?.(id, "Chemin", d);
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /></svg>
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "auto", minHeight: 0 }}>
            {fichiers && fichiers.length > 0 && (
              <select className="attic-node-select" size={Math.min(fichiers.length, 99)} value={currentIndex} onChange={(e) => {
                const i = parseInt(e.target.value);
                if (!Number.isNaN(i)) loadTrack(i, false);
              }} style={{ width: "100%", height: "100%", minHeight: 0 }}>
                {fichiers.map((f, i) => <option key={f.chemin} value={i}>{f.nom}</option>)}
              </select>
            )}
            {fichiers && fichiers.length === 0 && (
              <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("lecteur.aucunFichier")}</div>
            )}
            {fichiers === null && !chargement && (
              <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("lecteur.rafraichir").replace("{chemin}", chemin.replace(/^[/\\]+/, "")).replace("{path}", chemin.replace(/^[/\\]+/, ""))}</div>
            )}
            {chargement && (
              <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("lecteur.chargement")}</div>
            )}
          </div>
          <div className="attic-node-fichier-nom" style={{ textAlign: "center", minHeight: 18 }}>{audioNom || "—"}</div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            <button className="attic-node-fichier-btn" title={t("lecteur.precedent")} onClick={handlePrev}>⏮</button>
            <button className="attic-node-fichier-btn" title={isPlaying ? t("lecteur.pause") : t("lecteur.lecture")} onClick={isPlaying ? handlePause : handlePlay}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button className="attic-node-fichier-btn" title={t("lecteur.stop")} onClick={handleStop}>⏹</button>
            <button className="attic-node-fichier-btn" title={t("lecteur.suivant")} onClick={handleNext}>⏭</button>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, padding: "2px 0" }}>
            <span style={{ width: 48, textAlign: "right", fontFamily: "monospace" }}>{formatTime(currentTime)}</span>
            <input type="range" min={0} max={100} step={0.1} value={duration ? (currentTime / duration) * 100 : 0} onChange={(e) => handleSeek(parseFloat(e.target.value))} style={{ flex: 1 }} />
            <span style={{ width: 48, textAlign: "left", fontFamily: "monospace" }}>{formatTime(duration)}</span>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, padding: "2px 0" }}>
            <button className="attic-node-fichier-btn" style={{ opacity: shuffle ? 1 : 0.5 }} title={t("lecteur.shuffle")} onClick={toggleShuffle}>🔀</button>
            <button className="attic-node-fichier-btn" style={{ opacity: loop ? 1 : 0.5 }} title={t("lecteur.loop")} onClick={toggleLoop}>🔁</button>
            <span style={{ width: 24 }}>Vol</span>
            <input type="range" min={0} max={100} step={1} value={volume} onChange={(e) => handleVolume(parseInt(e.target.value))} style={{ flex: 1 }} />
          </div>
          <audio ref={audioRef} src={audioUrl || undefined} style={{ display: "none" }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleEnded}
            onTimeUpdate={() => {
              if (audioRef.current) {
                setCurrentTime(audioRef.current.currentTime);
                setDuration(audioRef.current.duration || 0);
              }
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) {
                setDuration(audioRef.current.duration || 0);
                audioRef.current.volume = volume / 100;
              }
            }}
          />
        </>
      )}
    </div>
  );
}

// ── Chargement d'un fichier MIDI ──
