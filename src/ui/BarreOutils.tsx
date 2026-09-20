// ui/BarreOutils.tsx
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { etiquetteFamille, etiquetteOutil, type FamilleBarre } from "./barre-outils-groupes";
import { BoutonModeles } from "./BoutonModeles";
import { PERIODE_MESURE_MS, agregerMetriques, detailParProcessus, formaterMo, type MesureMemoire } from "./memoire-vive";

interface Props {
  theme: string; setTheme: (t: "violet" | "black") => void;
  enExecution: boolean;
  repertoire: string; onChoisirDossier: () => void;
  onLancer: () => void;
  onArreter: () => void;
  onReinitialiser: () => void;
  onResumeAudio: () => Promise<void>;
  onExporter: () => void;
  onImporter: (f?: File) => void;
  onDetacher: () => void;
  onSauvegarder: () => void;
  onDetacherFichier: () => void;
  /** Sauvegarde automatique : état de la bascule du groupe Fichier. */
  sauvegardeAuto: boolean;
  onBasculerSauvegardeAuto: () => void;
  /** Économie de mémoire sur les pistes longues : bascule voisine, même groupe. */
  economieMemoire: boolean;
  onBasculerEconomieMemoire: () => void;
  onAjouterCommentaire: () => void;
  onAjouterCadre: () => void;
  nbPlugins: number;
  sf2Nom: string;
  onChargerSF2: (f: File) => void;
  currentFilePath?: string | null;
}

const FAVORIS = [
  { cle: "sonotheque", url: "https://lasonotheque.org" },
  { cle: "pixabay", url: "https://pixabay.com/fr/sound-effects/" },
  { cle: "signature", url: "https://signaturesounds.org/" },
  { cle: "cc0sounds", url: "https://cc0-sounds.exi.software/" },
  { cle: "sonniss", url: "https://gdc.sonniss.com/" },
  { cle: "freesound", url: "https://freesound.org/" },
  { cle: "openlofi", url: "https://github.com/btahir/open-lofi" },
  { cle: "birdsounds", url: "https://www.bird-sounds.net/" },
  { cle: "cornell", url: "https://dl.allaboutbirds.org/backyardbirdsdownload-0" },
  { cle: "hawaii", url: "https://muted.io/birds-of-hawaii/" },
  { cle: "sounddino", url: "https://sounddino.com/en/effects/birdsong/" },
  { cle: "vcsl", url: "https://versilian-studios.com/vcsl/" },
  { cle: "philharmonia", url: "https://philharmonia.co.uk/resources/sound-samples/" },
  { cle: "mutedio", url: "https://muted.io/" },
  { cle: "chantcosmos", url: "https://lesia.obspm.fr/perso/philippe-zarka/Chants.html" },
  { cle: "sounddinoSea", url: "https://sounddino.com/en/effects/fish/" },
  { cle: "aquaplan", url: "https://aquaplan-project.eu/resources/outreach-activities/sound-recordings/" },
  { cle: "marineMammals", url: "https://huggingface.co/datasets/ardavey/marine_ocean_mammal_sound" },
];

export function BarreOutils(props: Props) {
  const { theme, setTheme, enExecution, repertoire, onChoisirDossier, onLancer, onArreter, onReinitialiser, onResumeAudio, onExporter, onImporter, onDetacher, onSauvegarder, onAjouterCommentaire, onAjouterCadre, nbPlugins, sf2Nom, onChargerSF2, currentFilePath, onDetacherFichier, sauvegardeAuto, onBasculerSauvegardeAuto, economieMemoire, onBasculerEconomieMemoire } = props;
  const nomFichier = currentFilePath ? currentFilePath.replace(/\\/g, "/").split("/").pop() : null;
  const refImport = useRef<HTMLInputElement>(null);
  const { t, lang, setLang } = useI18n();
  const [favsOpen, setFavsOpen] = useState(false);
  const [maj, setMaj] = useState<{ disponible: boolean; version: string; progression: number; statut: string; notes?: string } | null>(null);
  const [verifEnCours, setVerifEnCours] = useState(false);
  const [etatAudio, setEtatAudio] = useState<string>("");

  // Compteur de mémoire : seul le processus principal connaît le total de l'application, donc
  // rien ne s'affiche hors d'Electron. Un relevé toutes les deux secondes, arrêté avec le
  // composant — un minuteur qui survit à son affichage interrogerait une fenêtre fermée.
  const [memoire, setMemoire] = useState<MesureMemoire | null>(null);
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.mesurerMemoire) return;
    let vivant = true;
    const relever = async () => {
      try {
        const metriques = await api.mesurerMemoire();
        if (vivant && Array.isArray(metriques)) setMemoire(agregerMetriques(metriques));
      } catch { /* le processus principal n'a pas répondu : on retentera au prochain battement */ }
    };
    relever();
    const minuteur = setInterval(relever, PERIODE_MESURE_MS);
    return () => { vivant = false; clearInterval(minuteur); };
  }, []);

  useEffect(() => {
    const api = (window as any).api;
    if (!api?.majEvenement) return;
    api.majEvenement((info: any) => { setMaj(info); setVerifEnCours(false); });
    api.majInfo?.().then((info: any) => { if (info) setMaj(info); });
    // Quand une mise à jour est téléchargée, sauvegarder les données
    if (api?.majBackupDemande) {
      api.majBackupDemande(() => {
        const backup = {
          metas: localStorage.getItem("attic-metas"),
          encours: localStorage.getItem("attic-encours"),
          lang: localStorage.getItem("attic-lang"),
          nodesInstalles: localStorage.getItem("attic-nodes-installes"),
        };
        api.majSauvegarderBackup?.(backup);
      });
    }
  }, []);

  const verifierMaj = async () => {
    const api = (window as any).api;
    if (!api?.majVerifier) return;
    setVerifEnCours(true);
    setMaj({ disponible: false, version: "", progression: 0, statut: "verification" });
    try {
      const result = await api.majVerifier();
      if (result) setMaj(result);
    } catch {}
    setVerifEnCours(false);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "s" && !e.shiftKey) { e.preventDefault(); onSauvegarder(); }
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); onExporter(); }
      if (ctrl && e.key === "o") { e.preventDefault(); refImport.current?.click(); }
      // La barre d'espace suit le bouton : elle lance, et elle arrête pendant un run.
      if (!ctrl && e.key === " ") { e.preventDefault(); enExecution ? onArreter() : onLancer(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onExporter, onImporter, onLancer, onArreter, onSauvegarder, enExecution]);

  // Étiquette de survol : toujours « verbe et objet — précision (raccourci) ».
  const eti = (id: string, precision?: string) => etiquetteOutil(id, t, precision);
  // Un groupe : ses outils, annoncés d'un seul nom aux lecteurs d'écran.
  const Groupe = ({ famille, children }: { famille: FamilleBarre; children: React.ReactNode }) => (
    <div className="attic-groupe" role="group" data-famille={famille} aria-label={etiquetteFamille(famille, t)}>
      {children}
    </div>
  );

  return (
    <div className="attic-barre-outils">
      <span className="attic-titre">{t("app.title")} <span className="attic-nb">({nbPlugins})</span></span>
      <span className="attic-sep" />

      <Groupe famille="fichier">
        <button className="attic-btn-icon" title={eti("sauvegarder")} aria-label={eti("sauvegarder")} onClick={() => onSauvegarder()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2h8l2 2v10H3V2z"/><path d="M5 2v4h5V2"/><path d="M5 9h6v5H5z"/></svg>
        </button>
        <button className="attic-btn-icon" title={eti("exporter")} aria-label={eti("exporter")} onClick={onExporter}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>
        </button>
        <button className="attic-btn-icon" title={eti("importer")} aria-label={eti("importer")} onClick={() => (window as any).api?.nouvelleFenetre ? onImporter() : refImport.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 14V5m-4 4 4-4 4 4M3 2h10"/></svg>
        </button>
        <input ref={refImport} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImporter(f); e.target.value = ""; }} />
        {/* Un sablier — la sauvegarde automatique est affaire d'intervalle —, barré quand
            elle est coupée. Ni disque ni flèche circulaire : la barre en compte déjà, et
            c'est précisément ce qu'on ne veut plus confondre. */}
        <button className={`attic-btn-icon${sauvegardeAuto ? "" : " attic-btn-coupe"}`}
          title={sauvegardeAuto
            ? eti("sauvegardeAutoCouper", t("barre.sauvegardeAuto.periode"))
            : eti("sauvegardeAutoActiver", t("barre.sauvegardeAuto.coupee"))}
          aria-label={sauvegardeAuto ? eti("sauvegardeAutoCouper") : eti("sauvegardeAutoActiver")}
          aria-pressed={sauvegardeAuto}
          onClick={() => onBasculerSauvegardeAuto()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 2h8M4 14h8M5 2v3l3 3 3-3V2M5 14v-3l3-3 3 3v3" />
            {!sauvegardeAuto && <path d="M2.5 13.5 13.5 2.5" />}
          </svg>
        </button>
        {/* Une barrette de mémoire — c'est de mémoire vive qu'il s'agit, pas de disque ni de
            vitesse —, barrée quand le régime économe est coupé. Voisine du sablier parce que
            les deux réglages se ressemblent : deux automatismes qu'on laisse faire, ou non. */}
        <button className={`attic-btn-icon${economieMemoire ? "" : " attic-btn-coupe"}`}
          title={economieMemoire
            ? eti("economieMemoireCouper", t("barre.economieMemoire.active"))
            : eti("economieMemoireActiver", t("barre.economieMemoire.coupee"))}
          aria-label={economieMemoire ? eti("economieMemoireCouper") : eti("economieMemoireActiver")}
          aria-pressed={economieMemoire}
          onClick={() => onBasculerEconomieMemoire()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5h12v6H2z" />
            <path d="M5 11v2M8 11v2M11 11v2" />
            {!economieMemoire && <path d="M2.5 13.5 13.5 2.5" />}
          </svg>
        </button>
        {nomFichier && (
          <span className="attic-nom-fichier" title={currentFilePath ?? undefined}>
            {nomFichier}
            <button className="attic-nom-fichier-detacher" title={t("btn.detacherFichier")}
              aria-label={t("btn.detacherFichier")} onClick={onDetacherFichier}>×</button>
          </span>
        )}
      </Groupe>
      <span className="attic-sep" />

      <Groupe famille="edition">
        <button className="attic-btn-icon" title={eti("commentaire")} aria-label={eti("commentaire")} onClick={onAjouterCommentaire}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3h8a1 1 0 011 1v7a1 1 0 01-1 1H8l-3 2v-2H4a1 1 0 01-1-1V4a1 1 0 011-1z"/></svg>
        </button>
        <button className="attic-btn-icon" title={eti("cadre")} aria-label={eti("cadre")} onClick={onAjouterCadre}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>
        </button>
      </Groupe>
      <span className="attic-sep" />

      <Groupe famille="ressources">
        <button className="attic-btn-icon" title={eti("dossier", repertoire || undefined)} aria-label={eti("dossier")} onClick={onChoisirDossier}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>
        </button>
        {repertoire && <span className="attic-chemin">{repertoire}</span>}
        {/* Le survol disait « SF2: » suivi d'un nom de fichier, jamais traduit ; il dit
            maintenant ce que le bouton fait, et ce qui est chargé. */}
        <label className="attic-btn-icon" title={eti("soundfont", sf2Nom || t("barre.soundfont.aucun"))}
          aria-label={eti("soundfont", sf2Nom || t("barre.soundfont.aucun"))}
          style={{ cursor: "pointer", position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M4 7l4 4 4-4M8 11V2"/></svg>
          <span className="attic-sf2-check">{sf2Nom ? "✓" : "?"}</span>
          <input type="file" accept=".sf2" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChargerSF2(f); e.target.value = ""; }} />
        </label>
        <div className="attic-favs" onMouseEnter={() => setFavsOpen(true)} onMouseLeave={() => setFavsOpen(false)}>
          <button className="attic-btn-icon" title={eti("favoris")} aria-label={eti("favoris")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1l2.5 5 5.5.8-4 3.9.9 5.3L8 13.5 3.1 16l.9-5.3-4-3.9 5.5-.8L8 1z"/></svg>
          </button>
          {favsOpen && (
            <div className="attic-favs-drop">
              {FAVORIS.map((f) => (
                <a key={f.cle} href={f.url} target="_blank" rel="noopener">{t(`favs.${f.cle}`)}</a>
              ))}
            </div>
          )}
        </div>
      </Groupe>
      <span className="attic-sep" />

      <Groupe famille="affichage">
        {/* Un disque à moitié rempli, et non plus un soleil : celui-ci se confondait avec
            l'horloge de la mise à jour, deux cercles de même taille à quelques boutons
            d'écart. Le contraste dit de lui-même qu'il s'agit du thème. */}
        <button className="attic-btn-icon" title={eti("theme", t(theme === "black" ? "barre.theme.plan" : "barre.theme.violet"))}
          aria-label={eti("theme")} onClick={() => setTheme(theme === "black" ? "violet" : "black")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <path d="M8 2a6 6 0 000 12z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button className="attic-btn-lang" onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          title={eti("langue", lang === "fr" ? "English" : "Français")}
          aria-label={eti("langue")}>
          {lang.toUpperCase()}
        </button>
        <button className="attic-btn-icon" title={eti("fenetre")} aria-label={eti("fenetre")} onClick={onDetacher}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 2h4v4M6 10l8-8M14 9v4a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1h4"/></svg>
        </button>
      </Groupe>

      <span className="attic-spacer" />

      <Groupe famille="application">
        <button className="attic-btn-icon" title={eti("doc")} aria-label={eti("doc")} onClick={async () => { const res = await (window as any).api?.ouvrirDoc?.(); if (!res?.ok) alert(t("msg.docIntrouvable")); }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h5a3 3 0 013 3v9a2 2 0 00-2-2H2V2z"/><path d="M14 2h-4a3 3 0 00-3 3v9a2 2 0 012 2h5V2z"/></svg>
        </button>
        {/* Une flèche qui descend vers un socle, et non plus une horloge : le disque de
            l'horloge était le jumeau de celui du thème. */}
        <button className="attic-btn-icon" title={eti("maj")} aria-label={eti("maj")} onClick={verifierMaj}
          style={{ width: 28, height: 28 }}>
          {verifEnCours ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v7M5 6.5 8 9.5l3-3" /><path d="M2.5 11.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" />
            </svg>
          )}
        </button>
        <BoutonModeles etiquette={eti("modeles")} />
      {maj && maj.statut === "verification" && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8, userSelect: "none" }}>
          {t("maj.verification")}
        </span>
      )}
      {maj && maj.statut === "a-jour" && (
        <span style={{ fontSize: 11, color: "#2a9d8f", marginRight: 8, userSelect: "none" }}>
          ✓ {t("maj.a-jour")}
        </span>
      )}
      {maj && maj.statut === "erreur" && (
        <span style={{ fontSize: 11, color: "#e44", marginRight: 8, userSelect: "none" }} title={maj.notes || ""}>
          ✗ {t("maj.erreur")}
        </span>
      )}
      {maj && maj.statut === "disponible" && (
        <button
          onClick={() => (window as any).api?.majTelecharger?.()}
          style={{
            fontSize: 11, marginRight: 8, cursor: "pointer",
            border: "1px solid #e9b949", borderRadius: 4,
            background: "rgba(233,185,73,0.15)", color: "#e9b949",
            padding: "2px 8px",
          }}
          title={t("maj.disponible")}
        >
          ↓ v{maj.version}
        </button>
      )}
      {maj && maj.statut === "telechargement" && (
        <span style={{ fontSize: 11, color: "#4c6ef5", marginRight: 8, userSelect: "none" }}>
          {t("maj.telechargement")} {maj.progression}%
        </span>
      )}
      {maj && maj.statut === "pret" && (
        <button
          onClick={() => (window as any).api?.majInstallerRelancer?.()}
          style={{
            fontSize: 11, marginRight: 8, cursor: "pointer",
            border: "1px solid #2a9d8f", borderRadius: 4,
            background: "rgba(42,157,143,0.15)", color: "#2a9d8f",
            padding: "2px 8px",
          }}
          title={t("maj.pret")}
        >
          ⟳ {t("maj.relancer")}
        </button>
      )}
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8, userSelect: "none" }}>v{__APP_VERSION__}</span>
      </Groupe>
      <span className="attic-sep" />

      <Groupe famille="execution">
      <button
        className="attic-btn-icon"
        title={eti("audio")}
        aria-label={eti("audio")}
        onClick={async () => {
          try {
            await onResumeAudio();
            setEtatAudio("✓");
            setTimeout(() => setEtatAudio(""), 1200);
          } catch {
            setEtatAudio("✗");
            setTimeout(() => setEtatAudio(""), 2000);
          }
        }}
      >
        {etatAudio ? (
          <span style={{ fontSize: 12, color: etatAudio === "✓" ? "#2a9d8f" : "#e44" }}>{etatAudio}</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 9V7h2.5l3.5-2.5v7L6.5 9H4z" />
            <path d="M12 5a3 3 0 010 6" />
          </svg>
        )}
      </button>
      <button className="attic-btn-icon" title={eti("reinitialiser")} aria-label={eti("reinitialiser")} onClick={onReinitialiser} disabled={enExecution}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13.5 8a5.5 5.5 0 1 0-11 0 5.5 5.5 0 0 0 8.5 4.5" />
          <path d="M12.5 4v4h-4" />
        </svg>
      </button>
      {/* La mémoire de l'application, à droite de la réinitialisation : c'est là qu'on la
          regarde, juste avant de relancer. L'infobulle détaille par processus, parce que le
          gros du chiffre ne vient pas toujours de celui qui calcule (cf. ui/memoire-vive.ts). */}
      {memoire && (
        <span className="attic-memoire" title={`${t("barre.memoire.titre")}\n${detailParProcessus(memoire)}`}>
          {formaterMo(memoire.total)}
        </span>
      )}
      {/* Un seul bouton pour les deux états : pendant l'exécution il devient « Arrêter »,
          au lieu d'un « … » désactivé qui ne laissait aucun moyen d'interrompre un run. */}
      <button
        className={`attic-btn-lancer${enExecution ? " attic-btn-arreter" : ""}`}
        onClick={enExecution ? onArreter : onLancer}
        title={enExecution ? eti("arreter", t("barre.execution.conserve")) : eti("lancer")}
      >
        {enExecution ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6V2z"/></svg>
        )}
        {enExecution ? t("btn.arreter") : t("btn.lancer")}
      </button>
      </Groupe>
    </div>
  );
}
