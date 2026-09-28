// ui/vues-images.tsx — Ce qui se regarde : partitions, pochettes, images, niveaux.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useState } from "react";
import { useI18n } from "../i18n";
import { copierTexte } from "./copier";
import { VuMetre } from "./VuMetre";
import { VueScoreEsthetique, VueComparaisonEsthetique } from "./ScoreEsthetique";
import { ColorSynth } from "./ColorSynth";
import { PochetteGen } from "./PochetteGen";
import { SongseeVue } from "./Songsee";
import { COULEURS, cleCouleur } from "../audio";
import type { VueProps } from "./vues";

import { ouvrirAuNiveauDEcoute } from "./niveau-ecoute";
export function VueCouleurSunoIA({ data }: VueProps) {
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
export function VueGalerieExposition({ data }: VueProps) {
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
export function VueGravure({ data }: VueProps) {
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

export function VueVexFlow({ data }: VueProps) {
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
export function VuePochette({ data }: VueProps) {
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
export function VueImageDepuisAudio({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.audio")} />;
}

// ── Tracé d'une courbe de modulation ──
// Une sortie image ne s'affiche pas d'elle-même : il faut une vue enregistrée. Celle-ci est celle
// du goniomètre à un mot près — ce nœud attend une courbe, non un son.
export function VueTraceCourbe({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.courbe")} />;
}

// ── Attracteur / IFS (image générée) ──
// ── Une animation SVG posée par le nœud, et qui ne sort pas par un port ──
// ── Le goût d'un son : quatre parts, du plus fort au plus faible ──
const COULEURS_GOUT: Record<string, string> = {
  "sucré": "#e08bb5", "acide": "#c9d94a", "amer": "#8a6f4a", "salé": "#7fb3d5",
};

export function VueGout({ data }: VueProps) {
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

export function VueAnimationSvg({ data }: VueProps) {
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
          onLoadedMetadata={ouvrirAuNiveauDEcoute}
        />
      )}
    </div>
  );
}

export function VueAttracteurIFS({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.image")} />;
}

// ── Rendu image (affiche une image reçue) ──
export function VueRenduImage({ data, def }: VueProps) {
  const { t } = useI18n();
  const pasDeMessage = def?.id === "entree-image" || def?.id === "lecteur-svg" || def?.id === "texte-image";
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={pasDeMessage ? "" : t("msg.connecter.image")} />;
}

// ── ColorSynth (spectre → palette de couleurs) ──
export function VueColorSynth({ data }: VueProps) {
  return <ColorSynth audioUrl={data.audioResultatUrl} />;
}

// ── VU-mètre / LUFS (bargraphes de niveau) ──
// ── Score et comparaison esthétiques ──
// Affichés seulement une fois le nœud terminé : `_esthetique` survit à une
// réinitialisation (les champs `_` ne sont pas effacés), et une courbe périmée
// affichée à côté d'un nœud « en attente » se lirait comme le résultat courant.
export function VueEsthetique({ data }: VueProps) {
  const d = data as { statut?: string; _esthetique?: any };
  return d.statut === "termine" ? <VueScoreEsthetique analyse={d._esthetique} /> : null;
}
export function VueComparaisonEsth({ data }: VueProps) {
  const d = data as { statut?: string; _comparaisonEsthetique?: { a: any; b: any } };
  return d.statut === "termine" ? <VueComparaisonEsthetique a={d._comparaisonEsthetique?.a} b={d._comparaisonEsthetique?.b} /> : null;
}

export function VueVuMetre({ data }: VueProps) {
  return <VuMetre audioUrl={data.audioResultatUrl} />;
}

// ── Source de texte (zone de texte éditable et redimensionnable) ──
