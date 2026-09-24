// ui/vues.tsx — Vues de nœud spécifiques + registre (extension UI).
// Découple le renderer générique (AtelierNode) des UI propres à certains nœuds.
// Une vue reçoit { id, data, def } et se rend sous l'en-tête du nœud. Le registre
// associe un id (ou un prédicat) à une ou plusieurs vues, avec une position
// « avant » ou « après » le lecteur audio générique.
//
// Point d'extension multi-domaines (cf. ARCHITECTURE.md §11) : un autre domaine
// enregistre ici ses propres vues (aperçu image, grille de données, éditeur…)
// sans toucher au renderer.
import { EVENEMENT_FILMER } from "./demo/useRealisateurDemo";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ReactNode, CSSProperties } from "react";
import { useReactFlow, NodeResizer } from "@xyflow/react";
import { useI18n, defautParametre, uniteParametre, traduire } from "../i18n";
import { bufferVersWavBlob } from "../audio/io";
import { decrire } from "../audio/metadonnees";
import { lireProfondeurExport } from "./profondeur-export";

/** Le tampon d'un nœud s'il a plus de deux canaux : son aperçu est alors un repliement, pas le fichier. */
const tamponMulticanal = (b: unknown): AudioBuffer | null =>
  typeof AudioBuffer !== "undefined" && b instanceof AudioBuffer && b.numberOfChannels > 2 ? b : null;
import { copierTexte } from "./copier";
import { PistesMultiples, type PisteVue } from "./PistesMultiples";
import { nomNote } from "./clavier-disposition";
import { TouchesClavier, useClavierJouable } from "./clavier-jouable";
import { useStatut } from "./statuts";
import { parametresLecture, rendreNotes, voixPourNote, type Banque } from "../audio/clavier-banque";
import { chargerSfz, dossierDe } from "../audio/sfz";
import { banqueVive, oublierBanque } from "../audio/banques-vives";
import { decodeurElectron } from "../plugins/clavier-sfz";
import { DUREE_NOTE_LIVE, instrumentClavier, modeRenduClavier, volumeClavier } from "./clavier-son";
import { sf2Chargee } from "../plugins/soundfontGlobal";
import { rendreSequence } from "../audio/midi";
import { EditeurCode } from "./EditeurCode";
import { FormeOnde } from "./FormeOnde";
import { SelecteurMultiZones } from "./SelecteurMultiZones";
import { ClavierApprentissage as VueClavierApprentissage } from "./ClavierApprentissage";
import { Quiz } from "./Quiz";
import { Parcours } from "./Parcours";
import { SpectreFFT } from "./Spectre";
import { Spectrogramme } from "./Spectrogramme";
import { OscilloVue } from "./OscilloVue";
import { ReponseFiltre } from "./ReponseFiltre";
import { SequenceurBatterieAvance } from "./SequenceurBatterieAvance";
import { SequenceurMelodique } from "./SequenceurMelodique";
import { SequenceurAccords } from "./SequenceurAccords";
import { EnveloppeADSR } from "./EnveloppeADSR";
import { VuMetre } from "./VuMetre";
import { VueScoreEsthetique, VueComparaisonEsthetique } from "./ScoreEsthetique";
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
import { registre } from "../audio/adaptateur";
import { INSTRUMENTS_ORCHESTRE } from "../audio/csound-orchestre";
import type { FicheAudio } from "../audio/types-domaine";
import type { DonneesNoeud } from "./AtelierNode";

export interface VueProps {
  id: string;
  data: DonneesNoeud;
  def?: FicheAudio;
}

// ── Plusieurs pistes sur un axe commun ──
// Le nœud pose leurs enveloppes sur lui-même à l'exécution : la vue ne recalcule rien et ne retient
// aucun son. Voir `plugins/visualiseur-multipiste.ts` et `audio/pistes-visu.ts`.
function VuePistesMultiples({ data }: VueProps) {
  const pistes = ((data as unknown as { _pistesVisu?: PisteVue[] })._pistesVisu ?? []);
  return <PistesMultiples pistes={pistes} />;
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
  // L'ENTRÉE AUDIO NE MONTRE SON LECTEUR QU'APRÈS LE RUN, et le perd à la réinitialisation, comme
  // tout nœud qui rend un résultat : au chargement, le bouton et le nom du fichier suffisent.
  // Demandé par Fabien le 2026-09-22 — le lecteur affiché dès le chargement, et qu'aucune
  // réinitialisation n'effaçait, se confondait avec un résultat. Le sampler garde son aperçu :
  // son fichier est un échantillon à vérifier avant de jouer, non la sortie du nœud.
  const statut = useStatut(id).statut;
  const lecteurVisible = data.ficheId !== "entree-audio" || statut === "termine";
  return (
    <div className="attic-node-fichier" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <label className="attic-node-fichier-btn">
        {data.audioNom ? t("btn.changer.audio") : t("btn.charger.audio")}
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) data.onChargerAudio?.(id, f); }} />
      </label>
      {data.audioNom && <div className="attic-node-fichier-nom">{data.audioNom}</div>}
      {data.audioUrl && lecteurVisible && (
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

  // LA SURBRILLANCE SUIT LE CLIC, ET NON LA FIN DE LA LECTURE DU FICHIER.
  //
  // Elle se déduisait de `data.audioChemin`, qui n'arrive qu'une fois le fichier lu sur le disque.
  // Entre le clic et cette arrivée, le navigateur mettait bien la ligne cliquée en surbrillance,
  // puis le rendu suivant de React y reposait l'ANCIENNE valeur — la piste d'avant, ou la première
  // ligne quand rien n'était encore choisi — et la bonne ligne ne revenait qu'au retour de la
  // lecture. D'où une surbrillance qui partait ailleurs et revenait, à chaque choix de piste.
  //
  // La ligne choisie est donc tenue ici, posée dès le clic, et remise d'accord avec le nœud quand
  // celui-ci change de chemin — au retour de la lecture, à la réinitialisation, ou au rechargement
  // d'un projet.
  const [choisi, setChoisi] = useState<string | null>(data.audioChemin ?? null);
  const demande = useRef<string | null>(data.audioChemin ?? null);
  useEffect(() => {
    setChoisi(data.audioChemin ?? null);
    demande.current = data.audioChemin ?? null;
  }, [data.audioChemin]);
  const selectedIndex = fichiersMusique?.findIndex((f) => f.chemin === choisi) ?? -1;

  // RIEN NE DOIT PARAÎTRE CHOISI TANT QUE RIEN NE L'EST. Une liste déroulée (`size` > 1) met sa
  // première ligne en surbrillance quand aucune option n'est sélectionnée : le nœud semblait tenir
  // la première piste, et choisir une autre ligne donnait l'impression de revenir à celle-là.
  // `value=""` ne suffit pas — le navigateur retombe sur l'indice 0 —, on le dit donc au DOM.
  // Sans tableau de dépendances : n'importe quel rendu — le chargement qui se termine, une autre
  // piste lue — repose `value=""` sur la liste, et le navigateur y revient à sa première ligne.
  const listeRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (listeRef.current && selectedIndex < 0) listeRef.current.selectedIndex = -1;
  });

  // Sélection d'une piste, partagée par `onChange` et `onClick` du <select>.
  async function choisirPiste(index: number) {
    const f = fichiersMusique?.[index];
    if (!f) return;
    // UN SEUL CLIC FAIT PARTIR `click` ET `change` : sans cette garde, le fichier était lu deux fois
    // et deux URL étaient créées pour la même piste. Un état ne s'y prête pas — les deux
    // gestionnaires partent du même rendu et y liraient la même valeur périmée —, d'où la référence.
    if (demande.current === f.chemin) return;
    demande.current = f.chemin;
    setChoisi(f.chemin);                         // la ligne cliquée est en surbrillance dès maintenant
    if (f.chemin === data.audioChemin) return;   // déjà chargée : rien à refaire
    const resultat = await api?.lireFichierAudio(f.chemin);
    if (!resultat) {
      // Le fichier n'a pas pu être lu : la surbrillance revient là où elle était, plutôt que de
      // montrer comme choisie une piste que le nœud n'a pas.
      demande.current = data.audioChemin ?? null;
      setChoisi(data.audioChemin ?? null);
      return;
    }
    const blob = new Blob([resultat.donnees], { type: "audio/mpeg" });
    const fichier = new File([blob], resultat.nom, { type: "audio/mpeg" });
    const url = URL.createObjectURL(fichier);
    setAudioLocale(url);
    setNodes((nds) => nds.map((nd) => nd.id === id ? {
      ...nd,
      data: { ...nd.data, audioFichier: fichier, audioNom: fichier.name, audioUrl: url, audioChemin: f.chemin },
    } : nd));
  }

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
            // `onClick` EN PLUS de `onChange` : tant qu'aucune piste n'est
            // choisie, React pose value="" — qui ne correspond à aucune option,
            // si bien que le navigateur replie sur la première et l'affiche en
            // surbrillance. Cliquer cette première ligne ne changeait alors RIEN
            // dans le DOM : `change` ne partait pas, le nœud restait sans
            // fichier, et l'exécution répondait « Aucun fichier » alors que la
            // liste montrait bien la piste sélectionnée. Les autres lignes
            // fonctionnaient, elles, puisqu'elles changeaient réellement l'index.
            <select ref={listeRef} className="attic-node-select" size={Math.min(fichiersMusique.length, 6)}
              value={selectedIndex >= 0 ? String(selectedIndex) : ""}
              onClick={(e) => {
                const cible = e.target as HTMLElement;
                if (cible instanceof HTMLOptionElement && cible.value !== "") {
                  void choisirPiste(parseInt(cible.value, 10));
                }
              }}
              onChange={(e) => void choisirPiste(parseInt(e.target.value, 10))}>
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
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{data.parametres?.[p.nom] ?? defautP}{p.unite ? ` ${uniteParametre(p, lang)}` : ""}</span>
          )}
        </div>
      );
      })}
    </div>
  );
}

// ── Export / téléchargement (sorties, convertisseurs) ──
/**
 * Profondeur et bloc iXML d'un fichier multicanal refait depuis son tampon. C'est là que l'iXML sert
 * le plus : ses pistes y sont nommées d'après la disposition — L, R, C, LFE… ou ACN0 à ACN15.
 */
function optionsMulticanal(b: AudioBuffer, ficheId: unknown) {
  const bits = lireProfondeurExport();
  const id = String(ficheId ?? "");
  return { bits, ixml: decrire(b, { noeud: registre.trouverDef(id)?.nom ?? id }, bits).ixml };
}

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
              const ext = data.ficheId === "convertisseur-audio" ? "mp3" : "wav";
              const multi = ext === "wav" ? tamponMulticanal(data.audioResultatBuffer) : null;
              // UN FICHIER MULTICANAL SE REFAIT DEPUIS LE TAMPON. Son aperçu a été replié en stéréo
              // pour ne pas peser six à huit fois une stéréo dans le processus principal ; l'enregistrer
              // tel quel livrerait un repliement à la place du 7.1.4 composé.
              const buf = multi
                ? await bufferVersWavBlob(multi, undefined, false, optionsMulticanal(multi, data.ficheId)).arrayBuffer()
                : await (await fetch(data.ficheId === "convertisseur-audio" && mp3Url ? mp3Url : data.audioResultatUrl!)).arrayBuffer();
              await api.sauvegarderBinaire({
                defaultPath: nomOu(`sortie.${ext}`),
                filters: [{ name: "Audio", extensions: [ext] }],
                buffer: buf,
              });
            }}>💾 {t("export.sauvegarder").replace("💾 ", "")}</button>
          ) : tamponMulticanal(data.audioResultatBuffer) ? (
            <button className="attic-node-fichier-btn" onClick={() => {
              const b = tamponMulticanal(data.audioResultatBuffer)!;
              const u = URL.createObjectURL(bufferVersWavBlob(b, undefined, false, optionsMulticanal(b, data.ficheId)));
              const a = document.createElement("a"); a.href = u; a.download = nomOu((data.audioResultatNom as string) || "sortie.wav"); a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
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
// ── Clavier d'apprentissage : le MIDI reçu, montré main par main ──
function VueApprentissage({ data }: VueProps) {
  return (
    <VueClavierApprentissage
      midi={data.midiFichierSortie as File | undefined}
      audioUrl={data.audioResultatUrl as string | undefined}
      anticipation={Number((data.parametres as Record<string, unknown> | undefined)?.["Anticipation"] ?? 3) || 3}
    />
  );
}

function ClavierMelodie({ id, data }: VueProps) {
  const { t } = useI18n();
  // Un 88 touches complet, La0 a Do8, comme un vrai clavier. La geometrie, le choix de la
  // touche sous le curseur et l'enregistrement vivent dans `clavier-jouable.tsx`, partages
  // avec « Clavier SFZ » : ce qui reste ici est la SEULE chose qui les distingue, la facon
  // de faire du son.
  const ctxRef = useRef<AudioContext | null>(null);
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }
  /** Les reglages du noeud, lus a chaque note : ils peuvent changer entre deux touches. */
  function reglages() {
    const params = data.parametres as Record<string, unknown> | undefined;
    return {
      mode: modeRenduClavier(params, !!sf2Chargee()),
      instrument: instrumentClavier(params),
      volume: volumeClavier(params),
    };
  }
  /** La synthese interne, inchangee : immediate, et toujours disponible. */
  function jouerFM(note: number, ctx: AudioContext) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "triangle"; osc.frequency.value = 440 * 2 ** ((note - 69) / 12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
    return { arreter: () => { try { osc.stop(); } catch {} } };
  }
  /**
   * La meme note, rendue par le SoundFont choisi — c'est-a-dire par le chemin qui rendra
   * l'audio du noeud. Le rendu est asynchrone : si la touche est relachee avant qu'il
   * arrive, on n'emet rien plutot que de faire sonner une note deja finie.
   */
  function jouerSoundFont(note: number, ctx: AudioContext, r: ReturnType<typeof reglages>) {
    let source: AudioBufferSourceNode | null = null;
    let annule = false;
    void (async () => {
      try {
        const buf = await rendreSequence(
          [{ note, velocite: 100, debut: 0, fin: DUREE_NOTE_LIVE }],
          "SoundFont", r.volume, r.instrument.programme, r.instrument.banque,
        );
        if (annule) return;
        source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.start();
      } catch (e) {
        console.error("[attic] Clavier : rendu SoundFont impossible, retour a la synthese interne", e);
        if (!annule) jouerFM(note, ctx);
      }
    })();
    return { arreter: () => { annule = true; try { source?.stop(); } catch {} } };
  }
  const clavier = useClavierJouable(id, (note) => {
    const ctx = getCtx(), r = reglages();
    return r.mode === "SoundFont" ? jouerSoundFont(note, ctx, r) : jouerFM(note, ctx);
  });
  useEffect(() => () => { ctxRef.current?.close(); ctxRef.current = null; }, []);
  /**
   * « Rejouer » fait entendre CE QUE LE NOEUD RENDRA : la sequence passe par
   * `rendreSequence`, la meme fonction que l'execution, avec le meme mode et le meme
   * instrument. Elle etait auparavant rejouee a l'oscillateur, si bien qu'on ne pouvait
   * pas s'ecouter avant de lancer le graphe.
   */
  async function rejouer() {
    const ctx = getCtx();
    const notes = clavier.seqRef.current.filter((s) => s.fin > s.debut);
    if (notes.length === 0) return;
    const r = reglages();
    try {
      const buf = await rendreSequence(notes, r.mode, r.volume, r.instrument.programme, r.instrument.banque);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.start();
    } catch (e) {
      console.error("[attic] Clavier : rejeu impossible", e);
    }
  }
  const seq = clavier.seq;
  return (
    <div className="clavier" ref={clavier.contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={220} />
      <div className="clavier-controles">
        <button className={clavier.enReg ? "actif" : ""} onClick={clavier.demarrerEnreg} disabled={clavier.enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={clavier.arreterEnreg} disabled={!clavier.enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || clavier.enReg}>▶ {t("clavier.rejouer")}</button>
        <button onClick={clavier.effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
        <span className="clavier-octave">←↑→ {nomNote(clavier.octaveClavier * 12)}–{nomNote(clavier.octaveClavier * 12 + 11)}</span>
      </div>
      <TouchesClavier clavier={clavier} />
    </div>
  );
}

/**
 * Le clavier qui joue une BANQUE D'ECHANTILLONS : un fichier SFZ du disque, ou la banque
 * qui arrive par le graphe.
 *
 * CE QUI LE DISTINGUE DU PRECEDENT tient en une ligne : une note est ici un
 * `AudioBufferSourceNode` — le materiel relit l'echantillon et boucle tout seul, ce qui
 * rend la latence nulle et permet de tenir une note indefiniment quand la zone a une
 * boucle de maintien. Un SoundFont, lui, demandait un rendu hors ligne par note.
 *
 * LES RAPPORTS DE LECTURE VIENNENT DE `voixPourNote`, la meme fonction que le rendu du
 * graphe : ce qu'on entend en jouant et ce que le noeud rendra ne peuvent donc pas
 * diverger, ce qui etait tout l'interet de ce clavier.
 */
function ClavierSfz({ id, data }: VueProps) {
  const { t } = useI18n();
  const ctxRef = useRef<AudioContext | null>(null);
  const banqueRef = useRef<Banque | null>(null);
  const [etat, setEtat] = useState<{ zones: number; basse: number; haute: number; nom: string } | null>(null);
  const [progres, setProgres] = useState("");
  const [erreur, setErreur] = useState("");
  const { setNodes } = useReactFlow();
  function getCtx() { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; }

  const adopter = useCallback((banque: Banque, nom: string) => {
    banqueRef.current = banque;
    setEtat({ zones: banque.zones.length, basse: banque.noteBasse, haute: banque.noteHaute, nom });
  }, []);

  // La banque que l'execution vient de deposer, quelle qu'en soit l'origine : un clavier
  // branche sur « Etaler sur le clavier » n'a alors rien a charger du disque, et un graphe
  // reouvert avec un chemin memorise retrouve son instrument des la premiere execution —
  // sans quoi le clavier restait muet jusqu'a ce qu'on recharge le fichier a la main.
  // Le statut change a chaque execution : c'est le seul signal dont la vue dispose. Il vient du
  // magasin d'execution depuis que l'etat a quitte le tableau des noeuds (`ui/statuts.ts`).
  const statutClavier = useStatut(id).statut;
  useEffect(() => {
    const vive = banqueVive(id);
    if (vive && vive.banque !== banqueRef.current) {
      adopter(vive.banque, vive.nom || t("clavier.sfz.duGraphe"));
    }
  }, [statutClavier, id, adopter, t]);

  /** Charge un `.sfz` designe par l'utilisateur, et retient son chemin dans le noeud. */
  async function choisirFichier() {
    const api = (window as any).api;
    if (!api?.ouvrirFichier) { setErreur(traduire("msg.n_cessite_electron")); return; }
    setErreur("");
    const choix = await api.ouvrirFichier({ filters: [{ name: "SFZ", extensions: ["sfz"] }] });
    if (!choix?.chemin || typeof choix.contenu !== "string") return;
    setProgres(traduire("clavier.sfz.chargement", "0", "?"));
    try {
      const charge = await chargerSfz(choix.contenu, dossierDe(choix.chemin),
        decodeurElectron(api, getCtx()),
        { surProgres: (faits, total) => setProgres(traduire("clavier.sfz.chargement", String(faits), String(total))) });
      setProgres("");
      if (charge.banque.zones.length === 0) {
        setErreur(traduire("clavier.sfz.echec", choix.nom ?? choix.chemin));
        return;
      }
      adopter(charge.banque, choix.nom ?? choix.chemin);
      oublierBanque(id);
      // Le chemin part dans les donnees du noeud : l'execution relira le meme fichier, et
      // il survit a la sauvegarde du graphe.
      setNodes((nds) => nds.map((nd) => nd.id === id
        ? { ...nd, data: { ...nd.data, sfzChemin: choix.chemin, sfzNom: choix.nom } } : nd));
    } catch (e: any) {
      setProgres("");
      setErreur(traduire("clavier.sfz.echec", e?.message ?? String(e)));
    }
  }

  const clavier = useClavierJouable(id, (note, velocite) => {
    const banque = banqueRef.current;
    if (!banque) return { arreter: () => {} };
    const voix = voixPourNote(banque, note, velocite, 1);
    if (!voix) return { arreter: () => {} };
    const p = parametresLecture(voix);
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = p.audio;
    source.playbackRate.value = p.vitesse;
    if (p.boucle) { source.loop = true; source.loopStart = p.boucleDebut; source.loopEnd = p.boucleFin; }
    const gain = ctx.createGain();
    gain.gain.value = p.gain;
    source.connect(gain).connect(ctx.destination);
    source.start();
    return {
      arreter: () => {
        // Un relachement en douceur : couper la source net laisserait un clic, l'onde etant
        // arretee en pleine periode. Le temps est celui du parametre du noeud.
        const relachement = Math.max(0.005, Number((data.parametres as any)?.["Relâchement"] ?? 150) / 1000);
        try {
          const fin = ctx.currentTime + relachement;
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.0001, fin);
          source.stop(fin + 0.01);
        } catch { try { source.stop(); } catch {} }
      },
    };
  });
  useEffect(() => () => { ctxRef.current?.close(); ctxRef.current = null; }, []);

  /** « Rejouer » passe par `rendreNotes` : la fonction meme que l'execution du noeud. */
  function rejouer() {
    const banque = banqueRef.current;
    const notes = clavier.seqRef.current.filter((s) => s.fin > s.debut);
    if (!banque || notes.length === 0) return;
    const params = data.parametres as Record<string, unknown> | undefined;
    const buf = rendreNotes(notes, banque, {
      volume: Number(params?.["Volume"] ?? 80) / 100,
      relachement: Number(params?.["Relâchement"] ?? 150) / 1000,
      fonduBoucle: Number(params?.["Fondu de boucle"] ?? 20) / 1000,
    });
    const ctx = getCtx();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start();
  }

  const seq = clavier.seq;
  return (
    <div className="clavier" ref={clavier.contRef} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={350} minHeight={240} />
      <div className="clavier-controles">
        <button onClick={choisirFichier}>📂 {t("clavier.sfz.charger")}</button>
        <button className={clavier.enReg ? "actif" : ""} onClick={clavier.demarrerEnreg} disabled={clavier.enReg}>⏺ {t("clavier.enreg")}</button>
        <button onClick={clavier.arreterEnreg} disabled={!clavier.enReg}>⏹ {t("clavier.arreter")}</button>
        <button onClick={rejouer} disabled={seq.length === 0 || clavier.enReg || !etat}>▶ {t("clavier.rejouer")}</button>
        <button onClick={clavier.effacer}>🗑 {t("clavier.effacer")}</button>
        <span className="clavier-nb">{seq.length} {t("clavier.notes")}</span>
      </div>
      <div className="clavier-controles" data-role="sfz-etat">
        {progres && <span className="clavier-nb">{progres}</span>}
        {!progres && etat && (
          <span className="clavier-nb" data-zones={etat.zones}>
            🎹 {etat.nom} — {traduire("clavier.sfz.zones", String(etat.zones), nomNote(etat.basse), nomNote(etat.haute))}
          </span>
        )}
        {!progres && !etat && <span className="clavier-nb">{t("clavier.sfz.rien")}</span>}
        {erreur && <span className="clavier-nb" style={{ color: "#e06c75" }}>{erreur}</span>}
        <span className="clavier-octave">←↑→ {nomNote(clavier.octaveClavier * 12)}–{nomNote(clavier.octaveClavier * 12 + 11)}</span>
      </div>
      <TouchesClavier clavier={clavier} />
    </div>
  );
}

/**
 * « Banque SFZ » : une ligne, un bouton, aucun clavier.
 *
 * La vue ne charge rien — c'est l'execution qui lit le disque et decode les echantillons. Elle ne
 * sert qu'a DESIGNER le fichier, parce qu'un chemin ne se tape pas a la main : le dialogue natif
 * d'Electron le rend, et il part dans les donnees du noeud, ou il survit a la sauvegarde.
 */
function VueBanqueSfz({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const [erreur, setErreur] = useState("");
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const surFichier = String(params["Source"] ?? "") === "fichier"
    || String(params["Source"] ?? "") === "Fichier SFZ";
  const nom = (data.sfzNom as string | undefined) ?? (data.sfzChemin as string | undefined);

  async function choisir() {
    const api = (window as any).api;
    if (!api?.ouvrirFichier) { setErreur(traduire("msg.n_cessite_electron")); return; }
    setErreur("");
    const choix = await api.ouvrirFichier({ filters: [{ name: "SFZ", extensions: ["sfz"] }] });
    if (!choix?.chemin) return;
    setNodes((nds) => nds.map((nd) => nd.id === id
      ? { ...nd, data: { ...nd.data, sfzChemin: choix.chemin, sfzNom: choix.nom } } : nd));
  }

  return (
    <div className="clavier-controles" style={{ padding: "4px 6px" }}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={choisir}>📂 {t("clavier.sfz.charger")}</button>
      <span className="clavier-nb">
        {surFichier ? (nom ?? t("banque.sfz.aucun")) : t("banque.sfz.integre")}
      </span>
      {erreur && <span className="clavier-nb" style={{ color: "#e06c75" }}>{erreur}</span>}
    </div>
  );
}

/**
 * La liste a cocher de l'« Orchestre Csound ».
 *
 * L'inspecteur n'a pas de type « choix multiple » : le reglage est donc un TEXTE, et cette vue
 * l'ecrit. Le texte reste lisible, sauvegardable et modifiable a la main — et l'ORDRE y compte,
 * puisqu'il decide des numeros d'instruments : cocher ajoute a la fin, decocher retire.
 */
function VueOrchestreCsound({ id, data }: VueProps) {
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const params = (data.parametres ?? {}) as Record<string, unknown>;
  const brut = String(params["Instruments"] ?? "");
  const choisis = brut.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const base = Math.max(1, Math.round(Number(params["Premier instrument"] ?? 1)) || 1);

  function basculer(idInstrument: string) {
    const suivant = choisis.includes(idInstrument)
      ? choisis.filter((x) => x !== idInstrument)
      : [...choisis, idInstrument];
    (data as { onChangerParametre?: (n: string, p: string, v: string | number) => void })
      .onChangerParametre?.(id, "Instruments", suivant.join(","));
    // `onChangerParametre` passe par l'application ; quand il manque — vue isolee —, on ecrit
    // directement dans le noeud pour que la case reste cochee.
    setNodes((nds) => nds.map((nd) => nd.id === id
      ? { ...nd, data: { ...nd.data, parametres: { ...(nd.data.parametres as object), Instruments: suivant.join(",") } } }
      : nd));
  }

  const familles = [...new Set(INSTRUMENTS_ORCHESTRE.map((i) => i.famille))];
  return (
    <div className="orchestre-csound" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <NodeResizer minWidth={300} minHeight={220} />
      <div className="clavier-controles">
        <span className="clavier-nb">🎻 {t("orchestre.csound.titre")}</span>
        <span className="clavier-nb">
          {choisis.length === 0 ? t("orchestre.csound.aucun")
            : traduire("orchestre.csound.compte", String(choisis.length), String(base), String(base + choisis.length - 1))}
        </span>
      </div>
      <div className="orchestre-liste" style={{ overflowY: "auto", maxHeight: "calc(100% - 34px)", padding: "2px 6px" }}>
        {familles.map((famille) => (
          <div key={famille}>
            <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{famille}</div>
            {INSTRUMENTS_ORCHESTRE.filter((i) => i.famille === famille).map((inst) => {
              const rang = choisis.indexOf(inst.id);
              return (
                <label key={inst.id} data-instrument={inst.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: "18px", cursor: "pointer" }}>
                  <input type="checkbox" checked={rang >= 0} onChange={() => basculer(inst.id)} />
                  <span style={{ opacity: rang >= 0 ? 1 : 0.75 }}>
                    {rang >= 0 ? `i${base + rang} · ` : ""}{inst.fr}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
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
// ── Partition gravée (Verovio) : le SVG est sur la sortie, le message reste lisible ──
function VueGravure({ data }: VueProps) {
  const { t } = useI18n();
  const svg = typeof data.scriptGenere === "string" ? data.scriptGenere : "";
  if (!svg.includes("<svg")) {
    return <div className="attic-node-vue-gravure" style={{ padding: 4 }}><div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div></div>;
  }
  // La hauteur vient du dessin, pas du nœud : voir `.attic-node-vue-gravure` dans atelier.css. Les
  // classes VexFlow, qu'elle empruntait, exigent un nœud de taille explicite — ce composant n'en a
  // pas, et sa gravure était écrasée à zéro.
  return (
    <div className="attic-node-vue-gravure">
      <div className="attic-node-vue-gravure-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

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

// ── Image engendree a partir d'un audio (Songsee, goniometre...) ──
// Le composant est le meme que pour les autres images ; seul le message d'attente change,
// puisque ces noeuds attendent un son et non une image.
function VueImageDepuisAudio({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.audio")} />;
}

// ── Tracé d'une courbe de modulation ──
// Une sortie image ne s'affiche pas d'elle-même : il faut une vue enregistrée. Celle-ci est celle
// du goniomètre à un mot près — ce nœud attend une courbe, non un son.
function VueTraceCourbe({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.courbe")} />;
}

// ── Attracteur / IFS (image générée) ──
// ── Une animation SVG posée par le nœud, et qui ne sort pas par un port ──
// ── Le goût d'un son : quatre parts, du plus fort au plus faible ──
const COULEURS_GOUT: Record<string, string> = {
  "sucré": "#e08bb5", "acide": "#c9d94a", "amer": "#8a6f4a", "salé": "#7fb3d5",
};

function VueGout({ data }: VueProps) {
  const { t } = useI18n();
  const parts = Array.isArray(data._profilGout) ? (data._profilGout as { gout: string; part: number }[]) : [];
  if (!parts.length) {
    return <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>;
  }
  return (
    <div className="attic-gout">
      {parts.map((p) => (
        <div key={p.gout} className="attic-gout-ligne">
          <span className="attic-gout-nom">{p.gout}</span>
          <span className="attic-gout-barre">
            <span style={{ width: `${Math.round(p.part * 100)}%`, background: COULEURS_GOUT[p.gout] ?? "var(--text-muted)" }} />
          </span>
          <span className="attic-gout-part">{Math.round(p.part * 100)} %</span>
        </div>
      ))}
    </div>
  );
}

function VueAnimationSvg({ data }: VueProps) {
  const { t } = useI18n();
  const svg = typeof data._animationSvg === "string" ? data._animationSvg : "";
  if (!svg.includes("<svg")) {
    return <div className="attic-node-vue-animation" style={{ padding: 4 }}><div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div></div>;
  }
  // L'animation est écrite en SMIL : posée telle quelle dans la page, elle tourne.
  //
  // SA HAUTEUR EST SA LARGEUR, et ne se déduit d'aucun ancêtre : voir `.attic-node-vue-animation`
  // dans atelier.css. Ces classes-là ne sont pas celles des nœuds VexFlow, qu'elle empruntait et
  // dont la chaîne de hauteur exige un nœud de taille explicite — d'où une vue écrasée à zéro.
  //
  // LE LECTEUR EST POSÉ ICI, ET NON PAR LE NŒUD. Une vue « avant » masque le lecteur générique, au
  // motif qu'elle porte elle-même l'audio ; celle-ci ne montrait que l'image, et le son sorti par le
  // composant restait inaudible sans le brancher ailleurs. L'image et la mélodie étant la même
  // suite de pulsations, elles s'écoutent au même endroit.
  return (
    <div className="attic-node-vue-animation">
      <div className="attic-node-vue-animation-inner" dangerouslySetInnerHTML={{ __html: svg }} />
      {typeof data.audioResultatUrl === "string" && (
        <audio
          key={data.audioResultatUrl}
          className="attic-node-audio nodrag"
          style={{ flex: "0 0 auto", marginTop: 4 }}
          controls
          src={data.audioResultatUrl}
          onPointerDown={(e) => e.stopPropagation()}
          onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 0.3; }}
        />
      )}
    </div>
  );
}

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
// ── Score et comparaison esthétiques ──
// Affichés seulement une fois le nœud terminé : `_esthetique` survit à une
// réinitialisation (les champs `_` ne sont pas effacés), et une courbe périmée
// affichée à côté d'un nœud « en attente » se lirait comme le résultat courant.
function VueEsthetique({ data }: VueProps) {
  const d = data as { statut?: string; _esthetique?: any };
  return d.statut === "termine" ? <VueScoreEsthetique analyse={d._esthetique} /> : null;
}
function VueComparaisonEsth({ data }: VueProps) {
  const d = data as { statut?: string; _comparaisonEsthetique?: { a: any; b: any } };
  return d.statut === "termine" ? <VueComparaisonEsthetique a={d._comparaisonEsthetique?.a} b={d._comparaisonEsthetique?.b} /> : null;
}

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
// ── Démonstration : la vidéo rendue, et de quoi l'enregistrer ──
/** Une vidéo dans un nœud, et de quoi l'enregistrer. */
function VideoDeNoeud({ url, nom }: { url: string; nom: string }) {
  const { t } = useI18n();
  const api = (window as { api?: any }).api;
  return (
    <div className="attic-demo-bloc">
      <video className="attic-demo-video" src={url} controls style={{ width: "100%", display: "block", background: "#000" }} />
      {api ? (
        <button className="attic-node-fichier-btn" onClick={async () => {
          const buffer = await (await fetch(url)).arrayBuffer();
          await api.sauvegarderBinaire({ defaultPath: nom, filters: [{ name: "WebM", extensions: ["webm"] }], buffer });
        }}>{t("demo.sauvegarder")}</button>
      ) : (
        <a className="attic-node-fichier-btn" href={url} download={nom}>{t("demo.sauvegarder")}</a>
      )}
    </div>
  );
}

function VueDemonstration({ data }: VueProps) {
  const { t } = useI18n();
  const url = (data as { _demoVideoUrl?: string })._demoVideoUrl;
  return (
    <div className="attic-node-fichier nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {url ? <VideoDeNoeud url={url} nom="demonstration.webm" />
        : <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("demo.avantLancer")}</div>}
    </div>
  );
}

// ── Film de l'application : le bouton qui le lance, et le film ──
function VueFilmApplication({ id, data }: VueProps) {
  const { t } = useI18n();
  const url = (data as { _demoAppVideoUrl?: string })._demoAppVideoUrl;
  return (
    <div className="attic-node-fichier nodrag" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button className="attic-node-fichier-btn attic-demo-filmer" title={t("demo.filmerTitre")}
        onClick={() => window.dispatchEvent(new CustomEvent(EVENEMENT_FILMER, { detail: { id } }))}>{t("demo.filmer")}</button>
      {url && <VideoDeNoeud url={url} nom="film-application.webm" />}
    </div>
  );
}

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


/**
 * La courbe qu'un nœud vient de produire, tracée sur le nœud lui-même.
 *
 * CE QUI MANQUAIT LE PLUS. On branchait une modulation et rien à l'écran ne disait ce qu'elle
 * faisait : ni sa forme, ni son amplitude, ni si elle bougeait. Pour une courbe engendrée on
 * pouvait encore la deviner des réglages ; pour un suiveur de caractéristique — la brillance d'un
 * son, son énergie — personne ne peut la prévoir, et c'est justement celle-là qu'il faut voir.
 *
 * L'échelle verticale est fixe, de zéro à un, et ne se normalise pas. Une courbe qui ne bouge
 * presque pas DOIT se voir comme une ligne presque plate : l'étirer pour remplir le cadre
 * montrerait un beau relief là où le paramètre ne bouge pas, ce qui est le contraire du service
 * rendu. Les deux tirets marquent le tiers et les deux tiers, de quoi juger d'un coup d'œil.
 */
function VueCourbe({ data }: VueProps) {
  const points = (data as unknown as { apercuCourbe?: number[] }).apercuCourbe;
  if (!points || points.length < 2) return null;
  const L = 200, H = 46;
  const trace = points
    .map((v, i) => `${((i / (points.length - 1)) * L).toFixed(1)},${(H - v * H).toFixed(1)}`)
    .join(" ");
  const bas = Math.min(...points), haut = Math.max(...points);
  return (
    <div className="attic-node-courbe">
      <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Courbe de modulation, de ${bas.toFixed(2)} a ${haut.toFixed(2)}`}>
        <line x1="0" y1={H / 3} x2={L} y2={H / 3} className="attic-node-courbe-repere" />
        <line x1="0" y1={(2 * H) / 3} x2={L} y2={(2 * H) / 3} className="attic-node-courbe-repere" />
        <polyline points={trace} className="attic-node-courbe-trace" />
      </svg>
      <div className="attic-node-courbe-bornes"><span>{bas.toFixed(2)}</span><span>{haut.toFixed(2)}</span></div>
    </div>
  );
}

// ── Registre : id (ou prédicat) → vue(s), position relative au lecteur ──
type Vue = (props: VueProps) => ReactNode;
/**
 * Une vue du registre.
 *
 * `porteLecteur` DIT QUE CETTE VUE DONNE DEJA UN MOYEN D'ECOUTER. Le noeud pose un lecteur audio
 * generique sous ses vues ; il le retire quand l'une d'elles porte le sien, sans quoi il y en
 * aurait deux. La regle se lisait auparavant sur la seule PRESENCE d'une vue « avant », au motif
 * qu'une vue custom gere l'audio : c'etait faux pour la plupart d'entre elles, et huit generateurs
 * fabriquaient un son que rien ne permettait d'entendre dans le composant. Le fait se declare donc
 * ici plutot que de se deviner.
 */
interface EntreeRegistre {
  correspond: (ficheId: string) => boolean;
  vue: Vue;
  position: "avant" | "apres";
  masqueMessage?: boolean;
  porteLecteur?: boolean;
}
const parId = (...ids: string[]) => (f: string) => ids.includes(f);

const REGISTRE: EntreeRegistre[] = [
  // Enregistreur et entrée micro : la logique d'enregistrement est dans l'inspecteur,
  // pas dans une vue avant (évite le décalage du handle de sortie).
  { correspond: parId("generateur-courbe", "suiveur-caracteristique"), vue: VueCourbe, position: "avant" },
  { correspond: parId("visualiseur-forme-onde"), vue: VueFormeOnde, position: "avant" },
  // Aucun lecteur à déclarer : ce nœud ne rend pas de son, et n'en propose donc pas l'écoute.
  { correspond: parId("visualiseur-multipiste"), vue: VuePistesMultiples, position: "avant" },
  { correspond: parId("selecteur-multi-zones"), vue: VueSelecteurMultiZones, position: "avant" },
  { correspond: parId("analyseur-spectre"), vue: VueSpectre, position: "avant" },
  { correspond: parId("spectrogramme"), vue: VueSpectrogramme, position: "avant" },
  { correspond: parId("oscillateur"), vue: VueOscillo, position: "avant" },
  { correspond: parId("reponse-filtre"), vue: VueReponseFiltre, position: "avant" },
  { correspond: parId("comparateur-ab"), vue: VueComparateurAB, position: "avant" },
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
  { correspond: parId("score-esthetique"), vue: VueEsthetique, position: "avant" },
  { correspond: parId("comparaison-esthetique"), vue: VueComparaisonEsth, position: "avant" },
  { correspond: parId("colorsynth"), vue: VueColorSynth, position: "avant" },
  { correspond: parId("generateur-pochette"), vue: VuePochette, position: "avant" },
  { correspond: parId("visualisation-songsee"), vue: VueImageDepuisAudio, position: "avant" },
  { correspond: parId("goniometre"), vue: VueImageDepuisAudio, position: "avant" },
  { correspond: parId("visualiseur-courbe"), vue: VueTraceCourbe, position: "avant" },
  { correspond: parId("attracteur-ifs"), vue: VueAttracteurIFS, position: "avant" },
  { correspond: parId("cercle-pulsant"), vue: VueAnimationSvg, position: "avant", porteLecteur: true },
  { correspond: (f) => f === "gout-du-son" || f === "parfum-motif" || f === "accord-mets-musique", vue: VueGout, position: "avant" },
  { correspond: parId("rendu-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("camelot"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("texte-image"), vue: VueRenduImage, position: "avant" },
  { correspond: (f) => f.startsWith("vexflow-"), vue: VueVexFlow, position: "avant", masqueMessage: true },
  { correspond: parId("partition-verovio"), vue: VueGravure, position: "avant" },
  { correspond: parId("galerie-exposition"), vue: VueGalerieExposition, position: "avant" },
  { correspond: parId("carte-sonore"), vue: VueCarteSonore, position: "avant" },
  { correspond: parId("coordonnees-sur-carte"), vue: VueCoordonneesSurCarte, position: "avant" },
  { correspond: parId("gestion-nodes"), vue: VueGestionNodes, position: "avant" },
  { correspond: parId("python-processor"), vue: VuePythonProcessor, position: "avant" },
  { correspond: parId("julia-processor"), vue: VueJuliaProcessor, position: "avant" },
  { correspond: parId("source-texte"), vue: VueSourceTexte, position: "avant" },
  { correspond: parId("sortie-texte"), vue: VueSortieTexte, position: "avant", masqueMessage: true },
  { correspond: parId("demonstration"), vue: VueDemonstration, position: "apres" },
  { correspond: parId("film-application"), vue: VueFilmApplication, position: "apres" },
  { correspond: parId("entree-audio", "sampler-personnalise"), vue: VueUploadAudio, position: "avant", porteLecteur: true },
  { correspond: parId("entree-image"), vue: VueUploadImage, position: "avant" },
  { correspond: parId("entree-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueUploadSvg, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("entree-pdf"), vue: VueUploadPdf, position: "avant" },
  { correspond: parId("explorateur-musique"), vue: VueExplorateur, position: "avant", porteLecteur: true },
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
  { correspond: parId("clavier-sfz"), vue: ClavierSfz, position: "apres" },
  { correspond: parId("banque-sfz"), vue: VueBanqueSfz, position: "apres" },
  { correspond: parId("orchestre-csound"), vue: VueOrchestreCsound, position: "apres" },
  { correspond: parId("clavier-apprentissage"), vue: VueApprentissage, position: "apres" },
  { correspond: parId("quiz"), vue: Quiz, position: "avant" },
  { correspond: parId("parcours"), vue: Parcours, position: "avant" },
];

/**
 * L'identifiant sous lequel chercher une vue.
 *
 * UN NOEUD PEUT PORTER UN ANCIEN IDENTIFIANT. Le registre resout les alias — « sequenceur-batterie »
 * ouvre « sequenceur-batterie-avance » —, mais les vues etaient cherchees sur l'identifiant BRUT des
 * donnees du noeud. Un graphe enregistre s'ouvrait donc sur la bonne fiche, avec le bon titre et la
 * bonne execution, mais SANS SA GRILLE : plus rien a cliquer, et aucune erreur pour le dire.
 * Constate dans l'application en verifiant la suppression du sequenceur binaire.
 */
const idPourVue = (ficheId: string): string => registre.trouverDef(ficheId)?.id ?? ficheId;

export function vuesPourNoeud(ficheId: string, position: "avant" | "apres"): Vue[] {
  const id = idPourVue(ficheId);
  return REGISTRE.filter((e) => e.position === position && e.correspond(id)).map((e) => e.vue);
}

/** Une vue « avant » de ce composant donne-t-elle deja un moyen d'ecouter ? */
export function vueAvantPorteLecteur(ficheId: string): boolean {
  return REGISTRE.some((e) => e.position === "avant" && e.porteLecteur === true && e.correspond(ficheId));
}

export function vueAvantMasqueMessage(ficheId: string): boolean {
  const id = idPourVue(ficheId);
  return REGISTRE.some((e) => e.position === "avant" && e.correspond(id) && e.masqueMessage);
}
