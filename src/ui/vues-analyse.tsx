// ui/vues-analyse.tsx — Analyse, sequenceurs, et apercus de listes.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import type { CSSProperties } from "react";
import { useI18n } from "../i18n";
import { SpectreFFT } from "./Spectre";
import { Spectrogramme } from "./Spectrogramme";
import { OscilloVue } from "./OscilloVue";
import { ReponseFiltre } from "./ReponseFiltre";
import { plageDe } from "./reponse-filtre-calcul";
import { useNodeConnections } from "@xyflow/react";
import { SequenceurBatterieAvance } from "./SequenceurBatterieAvance";
import { SequenceurMelodique } from "./SequenceurMelodique";
import { SequenceurAccords } from "./SequenceurAccords";
import { EnveloppeADSR } from "./EnveloppeADSR";
import { construireListeInstruments } from "../plugins/instruments";
import { construireListeStyles } from "../plugins/styles-musicaux";
import { construireListeEmotions } from "../plugins/emotions";
import { construireListeTessitures } from "../plugins/tessitures";
import { estLog } from "./vues-fichiers";
import type { VueProps } from "./vues";

export function VueSpectre({ data }: VueProps) {
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
export function VueSpectrogramme({ data }: VueProps) {
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
export function VueOscillo({ data }: VueProps) {
  const p = data.parametres ?? {};
  return <OscilloVue audioUrl={data.audioResultatUrl} frequence={Number(p["Fréquence"] ?? 220) || 220} />;
}

// ── Réponse en fréquence d'un filtre (courbe théorique depuis les paramètres) ──
export function VueReponseFiltre({ id, data }: VueProps) {
  const p = data.parametres ?? {};
  // CE QUI EST BRANCHÉ DÉCIDE DE CE QU'ON MONTRE — relevé par Fabien : la vue lisait les réglages
  // seuls, si bien qu'un filtre balayé par une courbe affichait sa coupure au repos. Les deux
  // entrées de modulation se lisent ici : branchées, le réglage cesse d'agir et ce sont ses bornes
  // que le filtre traverse. Les rangs sont ceux de la fiche, un port se désignant par son rang.
  const entrees = useNodeConnections({ handleType: "target", id });
  const branchee = (rang: number) => entrees.some((c) => String(c.targetHandle ?? "") === `in:${rang}`);
  const nb = (nom: string, defaut: number) => Number(p[nom] ?? defaut) || defaut;
  return (
    <ReponseFiltre
      type={String(p["Type"] ?? "Passe-bas")}
      cutoff={nb("Fréquence de coupure", 1000)}
      q={nb("Résonance", 0.7)}
      plageCoupure={plageDe(nb("Fréquence de coupure", 1000), branchee(1),
        nb("Modulation min", 200), nb("Modulation max", 6000))}
      plageQ={plageDe(nb("Résonance", 0.7), branchee(2),
        nb("Résonance min", 0.7), nb("Résonance max", 8))}
    />
  );
}

// ── Séquenceur mélodique (grille piano-roll pas-à-pas) ──
export function VueSequenceurMelodique({ id, data }: VueProps) {
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
export function VueSequenceurAccords({ id, data }: VueProps) {
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
export function VueSequenceurBatterieAvance({ id, data }: VueProps) {
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
export function VueADSR({ data }: VueProps) {
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
export function VueNomsInstruments({ data }: VueProps) {
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
export function VueStylesMusicaux({ data }: VueProps) {
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
export function VueEmotions({ data }: VueProps) {
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
export function VueTessituresVoix({ data }: VueProps) {
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
export function VueGenerateurScriptIA({ data }: VueProps) {
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
export function VueComparateurAB({ id, data }: VueProps) {
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
export function VueDetecteurAccords({ data }: VueProps) {
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
export const COULEURS_PYTHON: Record<string, string> = {
  keyword: "#569cd6", string: "#ce9178", comment: "#6a9955",
  number: "#b5cea8", ident: "#d4d4d4", plain: "#d4d4d4",
};

