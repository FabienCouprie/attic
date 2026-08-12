// ui/vues.tsx — Vues de nœud spécifiques + registre (extension UI).
// Découple le renderer générique (AtelierNode) des UI propres à certains nœuds.
// Une vue reçoit { id, data, def } et se rend sous l'en-tête du nœud. Le registre
// associe un id (ou un prédicat) à une ou plusieurs vues, avec une position
// « avant » ou « après » le lecteur audio générique.
//
// Point d'extension multi-domaines (cf. ARCHITECTURE.md §11) : un autre domaine
// enregistre ici ses propres vues (aperçu image, grille de données, éditeur…)
// sans toucher au renderer.
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ReactNode, CSSProperties } from "react";
import { useReactFlow, NodeResizer } from "@xyflow/react";
import { useI18n, defautParametre, traduire } from "../i18n";
import { copierTexte } from "./copier";
import { EditeurCode } from "./EditeurCode";
import { FormeOnde } from "./FormeOnde";
import { SelecteurMultiZones } from "./SelecteurMultiZones";
import { SpectreFFT } from "./Spectre";
import { Spectrogramme } from "./Spectrogramme";
import { OscilloVue } from "./OscilloVue";
import { ReponseFiltre } from "./ReponseFiltre";
import { SequenceurBatterie } from "./SequenceurBatterie";
import { SequenceurBatterieAvance } from "./SequenceurBatterieAvance";
import { SequenceurMelodique } from "./SequenceurMelodique";
import { SequenceurAccords } from "./SequenceurAccords";
import { EnveloppeADSR } from "./EnveloppeADSR";
import { VuMetre } from "./VuMetre";
import { ColorSynth } from "./ColorSynth";
import { PochetteGen } from "./PochetteGen";
import { EditeurFormule } from "./EditeurFormule";
import { SongseeVue } from "./Songsee";
import { construireListeInstruments } from "../plugins/instruments";
import { construireListeStyles } from "../plugins/styles-musicaux";
import { construireListeEmotions } from "../plugins/emotions";
import { construireListeTessitures } from "../plugins/tessitures";
import { tokenizePython } from "../plugins/python-processor";
import { tokenizeJulia } from "../plugins/julia-processor";
import { COULEURS, cleCouleur } from "../audio";
import type { FicheAudio } from "../audio/types-domaine";
import type { DonneesNoeud } from "./AtelierNode";

export interface VueProps {
  id: string;
  data: DonneesNoeud;
  def?: FicheAudio;
}

// ── Forme d'onde (WaveSurfer.js) ──
function VueFormeOnde({ data }: VueProps) {
  return (
    <FormeOnde
      audioUrl={data.audioResultatUrl}
      multi={false}
      zones={[]}
    />
  );
}

// ── Sélecteur multi-zones (canvas natif) ──
function VueSelecteurMultiZones({ id, data }: VueProps) {
  return (
    <SelecteurMultiZones
      audioUrl={data.audioResultatUrl}
      zones={data.zonesSelectionnees ?? []}
      onZonesChange={(z) => data.onChangerZones?.(id, z)}
    />
  );
}

// ── Chargement d'un fichier audio ──
// ── Lecture de paramètres « choix » hors `paramTexte` ──
// Certaines vues lisent `data.parametres` directement, sans passer par la
// canonisation de `paramTexte`. Elles doivent donc accepter aussi bien l'id
// canonique que les anciens libellés FR/EN encore présents dans les projets.
function estActif(valeur: unknown): boolean {
  const v = String(valeur ?? "").trim().toLowerCase();
  return v === "oui" || v === "on";
}

function estLog(valeur: unknown): boolean {
  const v = String(valeur ?? "log").trim().toLowerCase();
  // Défaut historique = échelle logarithmique : tout ce qui n'est pas
  // explicitement linéaire reste logarithmique.
  return v !== "lineaire" && v !== "linéaire" && v !== "linear";
}

function VueUploadAudio({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.audioNom ? t("btn.changer.audio") : t("btn.charger.audio")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerAudio?.(id, f); }} />
      </label>
      {data.audioNom && <div className="attic-node-fichier-nom">{data.audioNom}</div>}
      {data.audioUrl && (
        <audio key={data.audioUrl} className="attic-node-audio nodrag" controls src={data.audioUrl}
          onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; }} />
      )}
    </div>
  );
}

// ── Chargement d'un fichier image ──
function VueUploadImage({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.imageNom ? t("btn.changer.image") : t("btn.charger.image")}
        <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerImage?.(id, f); }} />
      </label>
      {data.imageNom && <div className="attic-node-fichier-nom">{data.imageNom}</div>}
    </div>
  );
}

// ── Chargement d'un fichier SVG ──
function VueUploadSvg({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.svgNom ? t("btn.changer.svg") : t("btn.charger.svg")}
        <input type="file" accept=".svg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerSvg?.(id, f); }} />
      </label>
      {data.svgNom && <div className="attic-node-fichier-nom">{data.svgNom}</div>}
    </div>
  );
}

// ── Chargement d'un fichier PDF ──
function VueUploadPdf({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.pdfNom ? t("btn.changer.pdf") : t("btn.charger.pdf")}
        <input type="file" accept=".pdf,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerPdf?.(id, f); }} />
      </label>
      {data.pdfNom && <div className="attic-node-fichier-nom">{data.pdfNom}</div>}
    </div>
  );
}

// ── Explorateur de musique (Electron) ──
function VueExplorateur({ id, data }: VueProps) {
  const { t } = useI18n();
  const [fichiersMusique, setFichiersMusique] = useState<{ nom: string; chemin: string }[] | null>(null);
  const [chargementMusique, setChargementMusique] = useState(false);
  const [audioLocale, setAudioLocale] = useState<string | null>(data.audioUrl ?? null);
  const { setNodes } = useReactFlow();
  const api = (window as { api?: any }).api;

  // Restaurer la sélection de piste si le workflow a été rechargé.
  useEffect(() => {
    if (!api || !data.audioChemin || fichiersMusique) return;
    const dossier = String(data.parametres?.["Chemin"] || "music collection");
    const rel = dossier.replace(/^[/\\]+|[/\\]+$/g, "");
    api.lireDossier(rel).then((liste: { nom: string; chemin: string }[] | null) => {
      if (liste) setFichiersMusique(liste);
    }).catch((e: any) => console.warn("[VueExplorateur] échec du re-scan du dossier", e));
  }, [api, data.audioChemin, data.parametres, fichiersMusique]);

  // Garder le lecteur local synchronisé avec l'URL rechargée depuis le disque.
  useEffect(() => {
    if (data.audioUrl) setAudioLocale(data.audioUrl);
  }, [data.audioUrl]);

  const dossierCourant = String(data.parametres?.["Chemin"] || "music collection");
  const selectedIndex = fichiersMusique?.findIndex((f) => f.chemin === data.audioChemin) ?? -1;

  return (
    <div className="attic-node-fichier nodrag" onClick={(e) => e.stopPropagation()}>
      {!api ? (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("msg.electronUniquement")}</div>
      ) : (
        <>
          {/* `minWidth: 0` est indispensable : un élément flex a `min-width: auto`
              par défaut et refuse donc de rétrécir sous la largeur de son
              contenu. Sans lui, un chemin long élargissait ce bouton au-delà du
              conteneur et poussait l'icône de dossier hors du cadre du nœud.
              Le chemin est tronqué par des points de suspension, et reste
              lisible en entier au survol grâce au `title`. */}
          <div style={{ display: "flex", gap: 4, minWidth: 0 }}>
            <button className="attic-node-fichier-btn"
              // `display: block` (et non le `inline-flex` centré de la classe) :
              // `text-overflow: ellipsis` ne s'applique pas au contenu d'un
              // conteneur flex — le texte y était rogné des DEUX côtés, sans
              // points de suspension. En bloc aligné à gauche, on garde le début
              // du chemin et l'ellipse apparaît bien à la fin.
              style={{ flex: 1, minWidth: 0, display: "block", textAlign: "left",
                       overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={`/${dossierCourant}`}
              disabled={chargementMusique} onClick={async () => {
              setChargementMusique(true);
              const rel = dossierCourant.replace(/^[/\\]+|[/\\]+$/g, "");
              const fichiers = (await api?.lireDossier(rel)) ?? null;
              setFichiersMusique(fichiers);
              setChargementMusique(false);
            }}>
              ⟳ /{dossierCourant}
            </button>
            <button className="attic-node-fichier-btn" style={{ flexShrink: 0 }} title={t("btn.choisirDossier")} onClick={async () => {
              const dossier = await api?.choisirDossier();
              if (dossier) { data.parametres!["Chemin"] = dossier; data.onChangerParametre?.(id, "Chemin", dossier); }
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /></svg>
            </button>
          </div>
          {fichiersMusique && fichiersMusique.length > 0 && (
            <select className="attic-node-select" size={Math.min(fichiersMusique.length, 6)}
              value={selectedIndex >= 0 ? String(selectedIndex) : ""}
              onChange={async (e) => {
                const f = fichiersMusique[parseInt(e.target.value)];
                if (!f) return;
                const resultat = await api?.lireFichierAudio(f.chemin);
                if (!resultat) return;
                const blob = new Blob([resultat.donnees], { type: "audio/mpeg" });
                const fichier = new File([blob], resultat.nom, { type: "audio/mpeg" });
                const url = URL.createObjectURL(fichier);
                setAudioLocale(url);
                setNodes((nds) => nds.map((nd) => nd.id === id ? {
                  ...nd,
                  data: {
                    ...nd.data,
                    audioFichier: fichier,
                    audioNom: fichier.name,
                    audioUrl: url,
                    audioChemin: f.chemin,
                  },
                } : nd));
              }}>
              {fichiersMusique.map((f, i) => <option key={f.chemin} value={i}>{f.nom}</option>)}
            </select>
          )}
          {fichiersMusique && fichiersMusique.length === 0 && (
            <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("msg.aucunFichierAudio")}</div>
          )}
          {audioLocale && !data.audioUrl && <audio key={audioLocale} className="attic-node-audio" controls src={audioLocale} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; console.log("[audio player] loadedmetadata", e.currentTarget.duration, e.currentTarget.src); }} onError={(e) => console.error("[audio player] error", e.currentTarget.error, e.currentTarget.src)} onPlay={(e) => console.log("[audio player] play", e.currentTarget.src)} />}
          {data.audioResultatUrl && <audio key={data.audioResultatUrl} className="attic-node-audio" controls src={data.audioResultatUrl} onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; console.log("[audio player] loadedmetadata", e.currentTarget.duration, e.currentTarget.src); }} onError={(e) => console.error("[audio player] error", e.currentTarget.error, e.currentTarget.src)} onPlay={(e) => console.log("[audio player] play", e.currentTarget.src)} />}
        </>
      )}
    </div>
  );
}

// ── Lecteur musique (Electron) ──
function VueLecteurMusique({ id, data }: VueProps) {
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

  const formatTime = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

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

  // Déclenchement au run : détecte la transition en_cours -> termine
  useEffect(() => {
    const prev = prevStatutRef.current;
    prevStatutRef.current = data.statut ?? "";
    if (data.statut === "termine" && prev === "en_cours") {
      if (fichiers && fichiers.length > 0 && !audioUrl) {
        loadTrack(currentIndex >= 0 ? currentIndex : 0, true);
      } else {
        setPendingPlay(true);
      }
    }
  }, [data.statut, fichiers, audioUrl, currentIndex, loadTrack]);

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
            <span style={{ width: 32, textAlign: "right" }}>{formatTime(currentTime)}</span>
            <input type="range" min={0} max={100} step={0.1} value={duration ? (currentTime / duration) * 100 : 0} onChange={(e) => handleSeek(parseFloat(e.target.value))} style={{ flex: 1 }} />
            <span style={{ width: 32, textAlign: "left" }}>{formatTime(duration)}</span>
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
function VueUploadMidi({ id, data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.midiNom ? t("btn.changer.midi") : t("btn.charger.midi")}
        <input type="file" accept=".mid,.midi" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerMidi?.(id, f); }} />
      </label>
      {data.midiNom && <div className="attic-node-fichier-nom">{data.midiNom}</div>}
    </div>
  );
}

// ── Sélecteur d'instrument SoundFont ──
function VueSoundFont({ data }: VueProps) {
  if (!data.sf2Data) return null;
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()}>
      <select className="attic-node-select" value={data.sf2InstrumentIdx ?? 0}
        onChange={(e) => { data.sf2InstrumentIdx = parseInt(e.target.value); }}>
        {(data.sf2Data as { instruments?: { nom: string }[] }).instruments?.map((inst, i) => (
          <option key={i} value={i}>{i} — {inst.nom}</option>
        ))}
      </select>
    </div>
  );
}

// ── Téléchargement du MIDI transcrit ──
function VueTranscription({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {data.midiFichierSortie ? (
        <a href="#" className="attic-node-fichier-btn" onClick={(e) => {
          e.preventDefault();
          const u = URL.createObjectURL(data.midiFichierSortie! as File);
          const a = document.createElement("a"); a.href = u; a.download = "transcription.mid"; a.click(); URL.revokeObjectURL(u);
        }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: .5 }}>{t("msg.connecter.audio")}</div>
      )}
    </div>
  );
}

// ── Chargement d'un modèle ONNX ──
function VueUploadOnnx({ data }: VueProps) {
  const { t } = useI18n();
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.modeleFichier?.name || t("btn.charger.onnx")}
        <input type="file" accept=".onnx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.modeleFichier = f; }} />
      </label>
    </div>
  );
}

// ── Chargement d'une réponse impulsionnelle (IR) ──
function VueUploadIR({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { irFichier?: File; irNom?: string; onChargerIR?: (id: string, f: File) => void };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {d.irNom ? t("btn.changer.audio") : t("btn.charger.ir")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { d.irFichier = f; d.irNom = f.name; d.onChargerIR?.(id, f); } }} />
      </label>
      {d.irNom && <div className="attic-node-fichier-nom">{d.irNom}</div>}
    </div>
  );
}

// ── Chargement d'un patch Pure Data ──
function VueUploadPd({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as {
    pureDataFichier?: File;
    pureDataNom?: string;
    onChangerParametre?: (id: string, nom: string, v: string | number) => void;
  };
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {d.pureDataNom ? t("btn.changer.pd") : t("btn.charger.pd")}
        <input
          type="file"
          accept=".pd"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              d.pureDataFichier = f;
              d.pureDataNom = f.name;
              d.onChangerParametre?.(id, "Patch", `${f.name}@${f.lastModified}`);
            }
          }}
        />
      </label>
      {d.pureDataNom && <div className="attic-node-fichier-nom">{d.pureDataNom}</div>}
    </div>
  );
}

// ── Paramètres inline des collections (sélecteurs de dossier) ──
function VueCollections({ id, data, def }: VueProps) {
  const { t, lang } = useI18n();
  if (!def || def.parametres.length === 0) return null;
  return (
    <div className="attic-node-params" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {def.parametres.map((p) => {
        const defautP = defautParametre(p, lang);
        return (
        <div key={p.nom} className="attic-node-param">
          <label>{lang === "en" && p.nomEn ? p.nomEn : p.nom}</label>
          {p.type === "dossier" ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input type="text" value={String(data.parametres?.[p.nom] ?? defautP)} onChange={(e) => data.onChangerParametre?.(id, p.nom, e.target.value)}
                style={{ flex: 1, fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 3, padding: "2px 4px", color: "var(--text-title)" }} />
              <button onClick={async () => {
                const api = (window as { api?: any }).api;
                if (api?.choisirDossier) {
                  const d = await api.choisirDossier();
                  if (d) data.onChangerParametre?.(id, p.nom, d);
                } else {
                  const inp = document.createElement("input");
                  inp.type = "file"; (inp as { webkitdirectory?: boolean }).webkitdirectory = true;
                  inp.onchange = () => { const f = inp.files?.[0]; if (f) data.onChangerParametre?.(id, p.nom, (f as { path?: string }).path ?? f.name); };
                  inp.click();
                }
              }} className="attic-node-fichier-btn" title={t("btn.parcourir")}>…</button>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{data.parametres?.[p.nom] ?? defautP}{p.unite ? ` ${p.unite}` : ""}</span>
          )}
        </div>
      );
      })}
    </div>
  );
}

// ── Export / téléchargement (sorties, convertisseurs) ──
function VueExport({ data }: VueProps) {
  const { t } = useI18n();
  const [nomFichierLocal, setNomFichierLocal] = useState(String(data.nomFichier ?? ""));
  const api = (window as { api?: any }).api;
  const mp3Url = (data as { mp3Url?: string }).mp3Url;
  const nomOu = (defaut: string) => (data.nomFichier as string)?.toString().trim() || defaut;
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <input className="attic-node-export-nom" type="text" placeholder={t("export.nomFichier")}
        value={nomFichierLocal}
        onChange={(e) => { setNomFichierLocal(e.target.value); (data as { nomFichier?: string }).nomFichier = e.target.value; }} />
      {data.audioResultatUrl ? (
        <>
          {data.midiFichierSortie && (
            <a className="attic-node-fichier-btn" href="#" onClick={(e) => {
              e.preventDefault();
              const u = URL.createObjectURL(data.midiFichierSortie! as File);
              const a = document.createElement("a"); a.href = u; a.download = nomOu("sortie") + ".mid"; a.click(); URL.revokeObjectURL(u);
            }}>⬇ MIDI ({(data.midiFichierSortie as unknown as File).size.toLocaleString()} o)</a>
          )}
          {api ? (
            <button className="attic-node-fichier-btn" onClick={async () => {
              const rep = await fetch(data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl!);
              const buf = await rep.arrayBuffer();
              const ext = data.ficheId === "convertisseur-audio" ? "mp3" : "wav";
              await api.sauvegarderBinaire({
                defaultPath: nomOu(`sortie.${ext}`),
                filters: [{ name: "Audio", extensions: [ext] }],
                buffer: buf,
              });
            }}>💾 {t("export.sauvegarder").replace("💾 ", "")}</button>
          ) : (
            <a className="attic-node-fichier-btn" href={data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl}
              download={nomOu((data.audioResultatNom as string) || "sortie.wav")}>
              💾 {t("export.sauvegarder").replace("💾 ", "")}
            </a>
          )}
        </>
      ) : (
        <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Clavier mélodie (instrument jouable + enregistrement de séquence) ──
function ClavierMelodie({ id }: VueProps) {
  const { t } = useI18n();
  const OCTAVE_DEPART = 3, NB_OCTAVES = 5, BLANCHES_PAR_OCT = 7;
  const totalBlanches = NB_OCTAVES * BLANCHES_PAR_OCT;
  const contRef = useRef<HTMLDivElement>(null), touchesRef = useRef<HTMLDivElement>(null);
  const [larg, setLarg] = useState(0);
  useEffect(() => {
    const el = contRef.current; if (!el) return;
    const ro = new ResizeObserver(([entry]) => setLarg(entry.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const NOTES = useMemo(() => {
    const arr: { note: number; noir: boolean }[] = [];
    for (let o = OCTAVE_DEPART; o < OCTAVE_DEPART + NB_OCTAVES; o++) {
      for (const [n, noir] of [[0, false], [1, true], [2, false], [3, true], [4, false], [5, false], [6, true], [7, false], [8, true], [9, false], [10, true], [11, false]] as const)
        arr.push({ note: o * 12 + n, noir });
    }
    return arr;
  }, []);
  const blanches = useMemo(() => NOTES.filter((k) => !k.noir), [NOTES]);
  const noires = useMemo(() => NOTES.filter((k) => k.noir).map((k) => ({
    ...k, idxBlanche: blanches.findIndex((b) => b.note === k.note - 1),
  })).filter((k) => k.idxBlanche >= 0), [NOTES, blanches]);
  const NB = Math.max(22, larg > 0 ? larg / totalBlanches : 22), totalWidth = NB * totalBlanches;
  const ctxRef = useRef<AudioContext | null>(null), activesRef = useRef<Map<number, OscillatorNode>>(new Map());
  const debutRef = useRef(0), enRegRef = useRef(false), dernierePresseRef = useRef(0);
  const seqRef = useRef<{ note: number; velocite: number; debut: number; fin: number }[]>([]);
  const [enReg, setEnReg] = useState(false), [touches, setTouches] = useState<Set<number>>(new Set());
  const [, setVersion] = useState(0), { setNodes } = useReactFlow();
  const seq = seqRef.current;
  const pointerEnfonce = useRef(false);
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }
  function nomNote(n: number) { return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][n % 12] + Math.floor(n / 12 - 1); }
  function calculerVelocite(): number { const now = performance.now(), delta = now - dernierePresseRef.current; dernierePresseRef.current = now; if (delta < 80) return 120; if (delta < 150) return 100; if (delta < 300) return 80; return 60; }
  function jouer(note: number) { const ctx = getCtx(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12); gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5); activesRef.current.set(note, osc); }
  function arreter(note: number) { const o = activesRef.current.get(note); if (o) { try { o.stop(); } catch {} activesRef.current.delete(note); } }
  function presser(note: number) { setTouches((p) => new Set(p).add(note)); jouer(note); if (enRegRef.current) { seqRef.current.push({ note, velocite: calculerVelocite(), debut: (performance.now() - debutRef.current) / 1000, fin: 0 }); setVersion((v) => v + 1); } }
  function relacher(note: number) { setTouches((p) => { const n = new Set(p); n.delete(note); return n; }); arreter(note); if (enRegRef.current) { for (const s of seqRef.current) if (s.note === note && s.fin === 0) { s.fin = (performance.now() - debutRef.current) / 1000; break; } setVersion((v) => v + 1); } }
  function trouverNoteDepuisPointer(e: React.PointerEvent): number | null { const el = touchesRef.current; if (!el) return null; const rect = el.getBoundingClientRect(), x = e.clientX - rect.left + el.scrollLeft, idx = Math.floor(x / NB); if (idx < 0 || idx >= blanches.length) return null; return blanches[idx].note; }
  function onPointerDown(e: React.PointerEvent) { if (e.button !== 0) return; e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); pointerEnfonce.current = true; const note = trouverNoteDepuisPointer(e); if (note !== null) presser(note); }
  function onPointerMove(e: React.PointerEvent) { if (!pointerEnfonce.current) return; if (e.buttons === 0) { onPointerUp(); return; } const note = trouverNoteDepuisPointer(e); if (note !== null && !touches.has(note)) presser(note); }
  function onPointerUp() { pointerEnfonce.current = false; for (const note of activesRef.current.keys()) relacher(note); }
  function demarrerEnreg() { seqRef.current = []; setVersion((v) => v + 1); enRegRef.current = true; debutRef.current = performance.now(); setEnReg(true); }
  function arreterEnreg() { enRegRef.current = false; setEnReg(false); const now = performance.now(); for (const s of seqRef.current) if (s.fin === 0) s.fin = (now - debutRef.current) / 1000; setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, sequenceNotes: [...seqRef.current] } } : nd)); setVersion((v) => v + 1); }
  function effacer() { seqRef.current = []; setVersion((v) => v + 1); for (const [n] of activesRef.current) arreter(n); setTouches(new Set()); setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, sequenceNotes: [] } } : nd)); }
  function jouerNoteSynthetisee(ctx: AudioContext, note: number, debut: number, duree: number, velocite: number) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    const vol = 0.12 * (velocite / 127);
    const t = ctx.currentTime + debut + 0.05;
    g.gain.setValueAtTime(0, t - 0.02);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + duree - 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + duree + 0.05);
  }
  function rejouer() {
    const ctx = getCtx();
    for (const s of seqRef.current) {
      if (s.fin <= s.debut) continue;
      jouerNoteSynthetisee(ctx, s.note, s.debut, s.fin - s.debut, s.velocite);
    }
  }
  const [octaveClavier, setOctaveClavier] = useState(4);
  const keyMap = useMemo(() => { const m = new Map<string, number>(), blancs = "zxcvbnm", noirs = "sdghj", notesBlanches = [0, 2, 4, 5, 7, 9, 11], notesNoires = [1, 3, 6, 8, 10], base = octaveClavier * 12; for (let i = 0; i < blancs.length; i++) m.set(blancs[i].toUpperCase(), base + notesBlanches[i]); for (let i = 0; i < noirs.length; i++) m.set(noirs[i].toUpperCase(), base + notesNoires[i]); return m; }, [octaveClavier]);
  useEffect(() => { function onKD(e: KeyboardEvent) { if (e.repeat) return; if (e.key === "ArrowUp" || e.key === "=") { setOctaveClavier((o) => Math.min(o + 1, 7)); return; } if (e.key === "ArrowDown" || e.key === "-") { setOctaveClavier((o) => Math.max(o - 1, 2)); return; } const note = keyMap.get(e.key.toUpperCase()); if (note !== undefined && !activesRef.current.has(note)) presser(note); } function onKU(e: KeyboardEvent) { const note = keyMap.get(e.key.toUpperCase()); if (note !== undefined) relacher(note); } window.addEventListener("keydown", onKD); window.addEventListener("keyup", onKU); return () => { window.removeEventListener("keydown", onKD); window.removeEventListener("keyup", onKU); ctxRef.current?.close(); ctxRef.current = null; }; }, [keyMap]);
  return (
    <div className="clavier" ref={contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={220} />
      <div className="clavier-controles">
        <button className={enReg ? "actif" : ""} onClick={demarrerEnreg} disabled={enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={arreterEnreg} disabled={!enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || enReg}>▶ {t("clavier.rejouer")}</button>
        <button onClick={effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
        <span className="clavier-octave">←↑→ {nomNote(octaveClavier * 12)}–{nomNote(octaveClavier * 12 + 11)}</span>
      </div>
      <div className={"clavier-touches" + (larg > 0 && totalWidth > larg ? " avec-scroll" : "")}
        ref={touchesRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp}
        style={{ width: "100%", minHeight: 70 }}>
        <div className="clavier-interieure" style={{ width: totalWidth, position: "relative", height: "100%" }}>
          {blanches.map((b, i) => (
            <div key={b.note} className={"clavier-blanche" + (touches.has(b.note) ? " enfoncee" : "")}
              style={{ position: "absolute", left: i * NB, width: NB - 1, height: "100%", top: 0 }} />
          ))}
          {noires.map((k) => (
            <div key={k.note} className={"clavier-noire" + (touches.has(k.note) ? " enfoncee" : "")}
              style={{ position: "absolute", left: (k.idxBlanche + 1) * NB - NB * 0.3, width: NB * 0.55, height: "60%", top: 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Analyseur de spectre (FFT) ──
function VueSpectre({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <SpectreFFT
      audioUrl={data.audioResultatUrl}
      tailleFFT={parseInt(String(p["Fenêtre"] ?? "4096")) || 4096}
      log={estLog(p["Échelle"])}
    />
  );
}

// ── Spectrogramme (STFT) ──
function VueSpectrogramme({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <Spectrogramme
      audioUrl={data.audioResultatUrl}
      tailleFFT={parseInt(String(p["Fenêtre"] ?? "1024")) || 1024}
      log={estLog(p["Échelle"])}
    />
  );
}

// ── Oscillateur pédagogique (onde + harmoniques) ──
function VueOscillo({ data }: VueProps) {
  const p = data.parametres ?? {};
  return <OscilloVue audioUrl={data.audioResultatUrl} frequence={Number(p["Fréquence"] ?? 220) || 220} />;
}

// ── Réponse en fréquence d'un filtre (courbe théorique depuis les paramètres) ──
function VueReponseFiltre({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <ReponseFiltre
      type={String(p["Type"] ?? "Passe-bas")}
      cutoff={Number(p["Fréquence de coupure"] ?? 1000) || 1000}
      q={Number(p["Résonance"] ?? 0.7) || 0.7}
    />
  );
}

// ── Séquenceur de batterie (grille pas-à-pas) ──
function VueSequenceurBatterie({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurBatterie
      motif={motif}
      nbPas={nbPas}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Séquenceur mélodique (grille piano-roll pas-à-pas) ──
function VueSequenceurMelodique({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const cle = String(p["Clé"] ?? "C");
  const gamme = String(p["Gamme"] ?? "majeur");
  const octave = Number(p["Octave"] ?? 3);
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurMelodique
      motif={motif}
      nbPas={nbPas}
      cle={cle}
      gamme={gamme}
      octave={octave}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Séquenceur d'accords (grille de degrés pas-à-pas) ──
function VueSequenceurAccords({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const cle = String(p["Clé"] ?? "C");
  const gamme = String(p["Gamme"] ?? "majeur");
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurAccords
      motif={motif}
      nbPas={nbPas}
      cle={cle}
      gamme={gamme}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Séquenceur de batterie avancé (velocity + 8 pistes) ──
function VueSequenceurBatterieAvance({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  const nbPas = parseInt(String(p["Nombre de pas"] ?? "16"), 10) || 16;
  const motif = String(p["Motif"] ?? "");
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  return (
    <SequenceurBatterieAvance
      motif={motif}
      nbPas={nbPas}
      onChange={(m) => d.onChangerParametre?.(id, "Motif", m)}
    />
  );
}

// ── Enveloppe ADSR (courbe depuis les paramètres) ──
function VueADSR({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <EnveloppeADSR
      attaque={Number(p["Attaque"] ?? 10)}
      declin={Number(p["Déclin"] ?? 100)}
      maintien={Number(p["Maintien"] ?? 70)}
      relachement={Number(p["Relâchement"] ?? 200)}
    />
  );
}

// ── Noms d'instruments (aperçu texte de la liste, depuis les paramètres) ──
function VueNomsInstruments({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeInstruments(String(p["Famille"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "instruments" : "instruments"}</div>
    </div>
  );
}

// ── Styles musicaux (aperçu texte de la liste, depuis les paramètres) ──
function VueStylesMusicaux({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeStyles(String(p["Catégorie"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "styles" : "styles"}</div>
    </div>
  );
}

// ── Émotions (aperçu texte de la liste, depuis les paramètres) ──
function VueEmotions({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeEmotions(String(p["Catégorie"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "emotions" : "émotions"}</div>
    </div>
  );
}

// ── Tessitures de voix (aperçu texte de la liste, depuis les paramètres) ──
function VueTessituresVoix({ data }: VueProps) {
  const { lang } = useI18n();
  const p = data.parametres ?? {};
  const { texte, total } = construireListeTessitures(String(p["Groupe"] ?? "Toutes"), String(p["Format"] ?? "Virgule"), lang);
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{
        maxHeight: 150, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
        background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
      }}>{texte}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3 }}>{total} {lang === "en" ? "ranges" : "tessitures"}</div>
    </div>
  );
}

// ── Générateur de script IA (aperçu du script généré) ──
function VueGenerateurScriptIA({ data }: VueProps) {
  const { t } = useI18n();
  const script = data.audioResultatMessage ?? "";
  const texte = (data as { scriptGenere?: string }).scriptGenere ?? "";
  const affiche = texte || script;
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {affiche ? (
        <div style={{
          maxHeight: 180, overflowY: "auto", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
        }}>{affiche}</div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Comparateur A/B (boutons de bascule + relance) ──
function VueComparateurAB({ id, data }: VueProps) {
  const sel = String(data.parametres?.["Écoute"] ?? "A");
  const d = data as {
    onChangerParametre?: (id: string, nom: string, v: string | number) => void;
    onDefinirPrioritaire?: (id: string) => void;
  };
  const choisir = (v: string) => {
    d.onChangerParametre?.(id, "Écoute", v);
    // Laisse l'état se propager (noeudsRef) avant de relancer ce nœud.
    setTimeout(() => d.onDefinirPrioritaire?.(id), 60);
  };
  const btn = (v: string): CSSProperties => ({
    flex: 1, padding: "6px 0", cursor: "pointer", fontWeight: 700, borderRadius: 4,
    border: "1px solid var(--bordure, #333)",
    background: sel === v ? "#2a9d8f" : "transparent",
    color: sel === v ? "#0d1117" : "var(--texte, #ccc)",
  });
  return (
    <div className="nodrag" style={{ display: "flex", gap: 6, padding: "4px 0" }} onPointerDown={(e) => e.stopPropagation()}>
      <button style={btn("A")} onClick={(e) => { e.stopPropagation(); choisir("A"); }}>A</button>
      <button style={btn("B")} onClick={(e) => { e.stopPropagation(); choisir("B"); }}>B</button>
    </div>
  );
}

// ── Détecteur d'accords (progression d'accords) ──
function VueDetecteurAccords({ data }: VueProps) {
  const { t } = useI18n();
  const message = data.audioResultatMessage ?? "";
  const affiche = message && !message.startsWith("Aucune") && !message.startsWith("No chords");
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {affiche ? (
        <div style={{
          maxHeight: 160, overflowY: "auto", fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap",
          background: "#0d1117", borderRadius: 4, padding: "6px 8px", color: "var(--texte, #cbd5e1)",
        }}>{message}</div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Python Processor (éditeur de code avec coloration syntaxique) ──
const COULEURS_PYTHON: Record<string, string> = {
  keyword: "#569cd6", string: "#ce9178", comment: "#6a9955",
  number: "#b5cea8", ident: "#d4d4d4", plain: "#d4d4d4",
};

function VuePythonProcessor({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const code = String(data.parametres?.["Code"] ?? "");
  const [pyInfo, setPyInfo] = useState<{ disponible: boolean; chemin: string; version: string } | null>(null);

  // Vérifier Python au montage
  useEffect(() => {
    const api = (window as any).api;
    if (api?.pythonInfo) {
      api.pythonInfo().then((info: any) => setPyInfo(info));
    }
  }, []);

  // Configurer le chemin Python
  const configurerPython = async () => {
    const api = (window as any).api;
    if (!api?.pythonChoisirExecutable) return;
    const chemin = await api.pythonChoisirExecutable();
    if (!chemin) return;
    const result = await api.pythonDefinirChemin(chemin);
    if (result?.ok) {
      setPyInfo({ disponible: true, chemin: result.chemin, version: result.version });
    } else {
      alert(`${t("msg.erreur")}: ${result?.erreur || t("msg.cheminInvalide")}`);
    }
  };

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", height: "100%", display: "flex", flexDirection: "column" }}>
      <NodeResizer minWidth={350} minHeight={200} />
      {/* Barre de statut Python + bouton configurer */}
      <div style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: pyInfo?.disponible ? "#2a9d8f" : "#e76f51",
        }} />
        <span style={{ color: pyInfo?.disponible ? "#2a9d8f" : "#e76f51" }}>
          {pyInfo?.disponible ? `Python: ${pyInfo.version}` : t("python.nonDetecte")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); configurerPython(); }}
          style={{
            fontSize: 10, padding: "2px 8px", cursor: "pointer",
            border: "1px solid var(--border, #333)", borderRadius: 4,
            background: "transparent", color: "var(--text-secondary)",
          }}
          title={t("python.configurerChemin")}
        >⚙ {t("btn.configurer")}</button>
      </div>
      {/* Éditeur partagé, NON-CONTRÔLÉ (voir ui/EditeurCode.tsx) */}
      <EditeurCode codeInitial={code} tokenize={tokenizePython} couleurs={COULEURS_PYTHON}
        onSync={(v) => d.onChangerParametre?.(id, "Code", v)}
        suffixePied={t("python.requis")} titre={t("python.titre")} />
    </div>
  );
}

// ── Julia Processor (éditeur de code avec coloration syntaxique) ──
const COULEURS_JULIA: Record<string, string> = {
  keyword: "#569cd6", string: "#ce9178", comment: "#6a9955",
  number: "#b5cea8", ident: "#d4d4d4", type: "#4ec9b0", op: "#d4d4d4",
};

function VueJuliaProcessor({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const code = String(data.parametres?.["Code"] ?? "");
  const [jlInfo, setJlInfo] = useState<{ disponible: boolean; chemin: string; version: string } | null>(null);

  useEffect(() => {
    const api = (window as any).api;
    if (api?.juliaInfo) {
      api.juliaInfo().then((info: any) => setJlInfo(info));
    }
  }, []);

  const configurerPath = async () => {
    const api = (window as any).api;
    if (!api?.juliaChoisirExecutable) return;
    const chemin = await api.juliaChoisirExecutable();
    if (!chemin) return;
    const result = await api.juliaDefinirChemin(chemin);
    if (result?.ok) {
      setJlInfo({ disponible: true, chemin: result.chemin, version: result.version });
    } else {
      alert(`${t("msg.erreur")}: ${result?.erreur || t("msg.cheminInvalide")}`);
    }
  };

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", height: "100%", display: "flex", flexDirection: "column" }}>
      <NodeResizer minWidth={350} minHeight={200} />
      <div style={{ fontSize: 10, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: jlInfo?.disponible ? "#2a9d8f" : "#e76f51",
        }} />
        <span style={{ color: jlInfo?.disponible ? "#2a9d8f" : "#e76f51" }}>
          {jlInfo?.disponible ? `Julia: ${jlInfo.version}` : t("julia.nonDetecte")}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); configurerPath(); }}
          style={{
            fontSize: 10, padding: "2px 8px", cursor: "pointer",
            border: "1px solid var(--border, #333)", borderRadius: 4,
            background: "transparent", color: "var(--text-secondary)",
          }}
          title={t("julia.configurerChemin")}
        >⚙ {t("btn.configurer")}</button>
      </div>
      {/* Éditeur partagé, NON-CONTRÔLÉ (voir ui/EditeurCode.tsx) */}
      <EditeurCode codeInitial={code} tokenize={tokenizeJulia} couleurs={COULEURS_JULIA}
        onSync={(v) => d.onChangerParametre?.(id, "Code", v)}
        suffixePied={t("julia.requis")} titre={t("julia.titre")} />
    </div>
  );
}

// ── Gestionnaire de nodes (instructions + statut) ──
function VueGestionNodes({ data }: VueProps) {
  const p = data.parametres ?? {};
  const action = String(p["Action"] ?? "Exporter");
  const message = data.audioResultatMessage ?? "";
  const api = (window as { api?: any }).api;
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", fontSize: 11, lineHeight: 1.6 }}>
      {action === "Exporter" ? (
        <div style={{ color: "var(--text-secondary)" }}>
          <p style={{ marginBottom: 6 }}>1. Lancez une 1ère fois pour peupler la liste</p>
          <p style={{ marginBottom: 6 }}>2. Sélectionnez un node dans la liste</p>
          <p style={{ marginBottom: 6 }}>3. Relancez — une boîte de dialogue s'ouvre pour choisir où sauvegarder le .zip</p>
          {!api?.sauvegarderNodeZip && <p style={{ color: "#e76f51" }}>⚠ Nécessite Electron</p>}
        </div>
      ) : (
        <div style={{ color: "var(--text-secondary)" }}>
          <p style={{ marginBottom: 6 }}>1. Sélectionnez un fichier .zip</p>
          <p style={{ marginBottom: 6 }}>2. Lancez — le node est installé et apparaît dans le catalogue</p>
          {!api?.importerNodeZip && <p style={{ color: "#e76f51" }}>⚠ Nécessite Electron</p>}
        </div>
      )}
      {message && (
        <div style={{
          marginTop: 8, padding: "6px 8px", background: "#0d1117", borderRadius: 4,
          whiteSpace: "pre-wrap", color: "var(--texte, #cbd5e1)", fontSize: 10,
        }}>{message}</div>
      )}
    </div>
  );
}

// ── Couleur → Suno IA (carrés de couleur + script généré) ──
function VueCouleurSunoIA({ data }: VueProps) {
  const { t, lang } = useI18n();
  const p = data.parametres ?? {};
  const c1 = String(p["Couleur 1"] ?? "Bleu");
  const c2 = String(p["Couleur 2"] ?? "(aucune)");
  // Lecture directe de `parametres` (sans `paramTexte`), donc sans canonisation :
  // la valeur peut être l'id (« bleu »), l'ancien nom français ou l'anglais.
  // Indexer COULEURS avec elle telle quelle ne marchait qu'avec le nom français.
  const obj1 = COULEURS[cleCouleur(c1) ?? ""];
  const obj2 = COULEURS[cleCouleur(c2) ?? ""];
  const hex1 = obj1?.hex ?? "#999";
  const hex2 = obj2?.hex ?? "#333";
  const nom1 = obj1 ? obj1[lang] : c1;
  const nom2 = obj2 ? obj2[lang] : c2;
  const texte = (data as { scriptGenere?: string }).scriptGenere ?? "";
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: hex1, boxShadow: `0 0 6px ${hex1}` }} />
        {/* `obj2` suffit : « (aucune) », « (none) » et l'id « aucune » ne
            résolvent vers aucune couleur, quel que soit leur libellé. */}
        {obj2 ? (
          <>
            <span style={{ fontSize: 14, opacity: 0.5 }}>+</span>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: hex2, boxShadow: `0 0 6px ${hex2}` }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{nom1} + {nom2}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: hex1 }}>{nom1}</span>
        )}
      </div>
      {texte ? (
        <div style={{ position: "relative" }}>
          <button className="attic-node-copy-btn nodrag" title={t("btn.copier")}
            onClick={(e) => { e.stopPropagation(); copierTexte(texte); }}
            style={{ position: "absolute", top: 4, right: 20, zIndex: 1 }}>⧉</button>
          <div style={{
            maxHeight: 160, overflowY: "auto", fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap",
            background: "#0d1117", borderRadius: 4, padding: "6px 22px 6px 8px", color: "var(--texte, #cbd5e1)",
          }}>{texte}</div>
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Galerie d'exposition (liste des pistes + ouverture du HTML généré) ──
function VueGalerieExposition({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const htmlPath = (data as any)._galerieHtmlPath as string | undefined;
  const pistes = (data as any)._galeriePistes as { nom: string; url: string }[] | undefined;

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {htmlPath ? (
        <>
          {pistes && pistes.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, marginBottom: 6 }}>
              {pistes.slice(0, 10).map((p, i) => (
                <div key={i} style={{ padding: "3px 0", color: "var(--text-secondary)", display: "flex", gap: 6 }}>
                  <span style={{ color: "#2a9d8f", fontWeight: 700, minWidth: 20 }}>{(i + 1).toString().padStart(2, "0")}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
                </div>
              ))}
              {pistes.length > 10 && <div style={{ opacity: 0.5, padding: "3px 0" }}>… +{pistes.length - 10} autres</div>}
            </div>
          )}
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%" }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all", marginTop: 4 }}>{htmlPath}</div>
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── VexFlow (aperçu SVG de portée, tablature, grille d'accords) ──
function VueVexFlow({ data }: VueProps) {
  const { t } = useI18n();
  const svg = data.audioResultatMessage ?? "";
  const isSvg = svg.trim().startsWith("<svg");
  if (!isSvg) {
    return (
      <div className="attic-node-vue-vexflow" style={{ padding: "4px" }}>
        <div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div>
      </div>
    );
  }
  return (
    <div className="attic-node-vue-vexflow">
      <div className="attic-node-vue-vexflow-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

// ── Générateur de pochette (SVG procédural) ──
function VuePochette({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <PochetteGen
      prompt={String(p["Prompt"] ?? "dark ambient night mysterious")}
      titre={String(p["Titre"] ?? "Album")}
      artiste={String(p["Artiste"] ?? "")}
      style={String(p["Style"] ?? "bauhaus")}
      palette={String(p["Palette"] ?? "auto")}
      complexite={Number(p["Complexité"] ?? 50)}
      bordure={String(p["Bordure"] ?? "non")}
      typographie={String(p["Typographie"] ?? "sans-serif")}
      largeur={Number(p["Largeur"] ?? 512)}
      hauteur={Number(p["Hauteur"] ?? 512)}
      graine={Number(p["Graine"] ?? 0)}
    />
  );
}

// ── Songsee (image de visualisation audio) ──
function VueSongsee({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.audio")} />;
}

// ── Attracteur / IFS (image générée) ──
function VueAttracteurIFS({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.image")} />;
}

// ── Rendu image (affiche une image reçue) ──
function VueRenduImage({ data, def }: VueProps) {
  const { t } = useI18n();
  const pasDeMessage = def?.id === "entree-image" || def?.id === "lecteur-svg" || def?.id === "texte-image";
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={pasDeMessage ? "" : t("msg.connecter.image")} />;
}

// ── ColorSynth (spectre → palette de couleurs) ──
function VueColorSynth({ data }: VueProps) {
  return <ColorSynth audioUrl={data.audioResultatUrl} />;
}

// ── VU-mètre / LUFS (bargraphes de niveau) ──
function VueVuMetre({ data }: VueProps) {
  return <VuMetre audioUrl={data.audioResultatUrl} />;
}

// ── Source de texte (zone de texte éditable et redimensionnable) ──
function VueSourceTexte({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const texte = String(data.parametres?.["Texte"] ?? "");
  return (
    <div className="nodrag attic-node-source-texte" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <NodeResizer minWidth={220} minHeight={120} />
      <textarea
        defaultValue={texte}
        key={`${id}-texte`}
        onChange={(e) => d.onChangerParametre?.(id, "Texte", e.target.value)}
        style={{
          width: "100%", flex: "1 1 auto", minHeight: 80,
          resize: "none",
          fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
          background: "var(--bg-input, #0d1117)", color: "var(--texte, #cbd5e1)",
          border: "1px solid var(--border, #333)",
          borderRadius: 4, padding: "6px 8px", outline: "none",
          boxSizing: "border-box",
        }}
        placeholder={t("node.source_texte.placeholder")}
        onClick={(e) => e.stopPropagation()}
      />
      <div style={{ fontSize: 10, marginTop: 3, color: "var(--text-muted, #666)" }}>
        {traduire("msg.var_0_caract_res", texte.length)}
      </div>
    </div>
  );
}

// ── Sortie de texte (zone de texte redimensionnable + copie) ──
function VueSortieTexte({ data }: VueProps) {
  const { t } = useI18n();
  const texte = data.audioResultatMessage ?? "";
  return (
    <div className="nodrag attic-node-sortie-texte" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <NodeResizer minWidth={260} minHeight={140} maxWidth={800} maxHeight={600} />
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <button
          className="attic-node-copy-btn"
          style={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}
          title={t("btn.copier")}
          onClick={(e) => { e.stopPropagation(); copierTexte(texte); }}
        >⧉</button>
        <textarea
          readOnly
          value={texte || t("export.avantLancer")}
          style={{
            width: "100%", flex: "1 1 auto", minHeight: 80,
            resize: "none",
            fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
            background: "var(--bg-input, #0d1117)", color: "var(--texte, #cbd5e1)",
            border: "1px solid var(--border, #333)",
            borderRadius: 4, padding: "6px 8px", outline: "none",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// ── Carte sonore (génère un HTML ouvrable dans le navigateur par défaut) ──
function VueCarteSonore({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const htmlPath = (data as any)._carteHtmlPath as string | undefined;
  const message = data.audioResultatMessage ?? "";

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", minWidth: 220 }}>
      {!htmlPath ? (
        <div style={{ padding: 8, fontSize: 11, opacity: 0.6 }}>
          {t("export.avantLancer")}
        </div>
      ) : (
        <>
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%", marginBottom: 6 }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all" }}>{htmlPath}</div>
          {message && <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{message}</div>}
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      )}
    </div>
  );
}

// ── Coordonnées sur carte (variante de Carte sonore pilotée par des
// coordonnées reçues en entrée — carte-sonore.ts et VueCarteSonore ne sont
// pas modifiés, ceci est une copie adaptée volontairement séparée) ──
function VueCoordonneesSurCarte({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const htmlPath = (data as any)._coordCarteHtmlPath as string | undefined;
  const message = data.audioResultatMessage ?? "";

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px", minWidth: 220 }}>
      {!htmlPath ? (
        <div style={{ padding: 8, fontSize: 11, opacity: 0.6 }}>
          {t("export.avantLancer")}
        </div>
      ) : (
        <>
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%", marginBottom: 6 }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all" }}>{htmlPath}</div>
          {message && <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-secondary)", whiteSpace: "pre-line" }}>{message}</div>}
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      )}
    </div>
  );
}

// ── Registre : id (ou prédicat) → vue(s), position relative au lecteur ──
type Vue = (props: VueProps) => ReactNode;
interface EntreeRegistre { correspond: (ficheId: string) => boolean; vue: Vue; position: "avant" | "apres"; masqueMessage?: boolean; }
const parId = (...ids: string[]) => (f: string) => ids.includes(f);

const REGISTRE: EntreeRegistre[] = [
  // Enregistreur et entrée micro : la logique d'enregistrement est dans l'inspecteur,
  // pas dans une vue avant (évite le décalage du handle de sortie).
  { correspond: parId("visualiseur-forme-onde"), vue: VueFormeOnde, position: "avant" },
  { correspond: parId("selecteur-multi-zones"), vue: VueSelecteurMultiZones, position: "avant" },
  { correspond: parId("analyseur-spectre"), vue: VueSpectre, position: "avant" },
  { correspond: parId("spectrogramme"), vue: VueSpectrogramme, position: "avant" },
  { correspond: parId("oscillateur"), vue: VueOscillo, position: "avant" },
  { correspond: parId("reponse-filtre"), vue: VueReponseFiltre, position: "avant" },
  { correspond: parId("comparateur-ab"), vue: VueComparateurAB, position: "avant" },
  { correspond: parId("sequenceur-batterie"), vue: VueSequenceurBatterie, position: "avant" },
  { correspond: parId("sequenceur-batterie-avance"), vue: VueSequenceurBatterieAvance, position: "avant" },
  { correspond: parId("sequenceur-melodique"), vue: VueSequenceurMelodique, position: "avant" },
  { correspond: parId("sequenceur-accords"), vue: VueSequenceurAccords, position: "avant" },
  { correspond: parId("generateur-audio-mathematique", "formule-echantillons", "formule-spectrale"), vue: EditeurFormule, position: "avant" },
  { correspond: parId("enveloppe-adsr"), vue: VueADSR, position: "avant" },
  { correspond: parId("noms-instruments"), vue: VueNomsInstruments, position: "avant" },
  { correspond: parId("styles-musicaux"), vue: VueStylesMusicaux, position: "avant" },
  { correspond: parId("emotions"), vue: VueEmotions, position: "avant" },
  { correspond: parId("tessitures-voix"), vue: VueTessituresVoix, position: "avant" },
  { correspond: parId("generateur-script-ia"), vue: VueGenerateurScriptIA, position: "avant" },
  { correspond: parId("couleur-suno-ia"), vue: VueCouleurSunoIA, position: "avant" },
  { correspond: parId("detecteur-accords"), vue: VueDetecteurAccords, position: "avant", masqueMessage: true },
  { correspond: parId("vu-metre"), vue: VueVuMetre, position: "avant" },
  { correspond: parId("colorsynth"), vue: VueColorSynth, position: "avant" },
  { correspond: parId("generateur-pochette"), vue: VuePochette, position: "avant" },
  { correspond: parId("visualisation-songsee"), vue: VueSongsee, position: "avant" },
  { correspond: parId("attracteur-ifs"), vue: VueAttracteurIFS, position: "avant" },
  { correspond: parId("rendu-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("camelot"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("texte-image"), vue: VueRenduImage, position: "avant" },
  { correspond: (f) => f.startsWith("vexflow-"), vue: VueVexFlow, position: "avant", masqueMessage: true },
  { correspond: parId("galerie-exposition"), vue: VueGalerieExposition, position: "avant" },
  { correspond: parId("carte-sonore"), vue: VueCarteSonore, position: "avant" },
  { correspond: parId("coordonnees-sur-carte"), vue: VueCoordonneesSurCarte, position: "avant" },
  { correspond: parId("gestion-nodes"), vue: VueGestionNodes, position: "avant" },
  { correspond: parId("python-processor"), vue: VuePythonProcessor, position: "avant" },
  { correspond: parId("julia-processor"), vue: VueJuliaProcessor, position: "avant" },
  { correspond: parId("source-texte"), vue: VueSourceTexte, position: "avant" },
  { correspond: parId("sortie-texte"), vue: VueSortieTexte, position: "avant", masqueMessage: true },
  { correspond: parId("entree-audio", "sampler-personnalise"), vue: VueUploadAudio, position: "avant" },
  { correspond: parId("entree-image"), vue: VueUploadImage, position: "avant" },
  { correspond: parId("entree-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueUploadSvg, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("entree-pdf"), vue: VueUploadPdf, position: "avant" },
  { correspond: parId("explorateur-musique"), vue: VueExplorateur, position: "avant" },
  { correspond: parId("lecteur-midi"), vue: VueUploadMidi, position: "avant" },
  { correspond: parId("lecteur-midi"), vue: VueSoundFont, position: "avant" },
  { correspond: parId("transcripteur-midi"), vue: VueTranscription, position: "avant" },
  { correspond: parId("classificateur-genre", "separateur-ia"), vue: VueUploadOnnx, position: "avant" },
  { correspond: parId("reverbe-convolution"), vue: VueUploadIR, position: "apres" },
  { correspond: parId("pure-data"), vue: VueUploadPd, position: "avant" },
  { correspond: (f) => f.startsWith("collection-") && f !== "collection-lecteur-musique", vue: VueCollections, position: "apres" },
  { correspond: parId("collection-lecteur-musique"), vue: VueLecteurMusique, position: "apres" },
  { correspond: parId("sortie-audio", "sortie-midi", "convertisseur-audio", "convertisseur-mp3-wav"), vue: VueExport, position: "apres" },
  { correspond: parId("clavier-melodie"), vue: ClavierMelodie, position: "apres" },
];

export function vuesPourNoeud(ficheId: string, position: "avant" | "apres"): Vue[] {
  return REGISTRE.filter((e) => e.position === position && e.correspond(ficheId)).map((e) => e.vue);
}

export function vueAvantMasqueMessage(ficheId: string): boolean {
  return REGISTRE.some((e) => e.position === "avant" && e.correspond(ficheId) && e.masqueMessage);
}
