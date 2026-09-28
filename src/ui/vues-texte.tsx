// ui/vues-texte.tsx — Le texte qu'on lit et qu'on ecrit, et la video d'un noeud.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { EVENEMENT_FILMER } from "./demo/useRealisateurDemo";
import { useState, useEffect } from "react";
import { NodeResizer } from "@xyflow/react";
import { useI18n, traduire } from "../i18n";
import { copierTexte } from "./copier";
import type { VueProps } from "./vues";

export function VueSourceTexte({ id, data }: VueProps) {
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

export function VueDemonstration({ data }: VueProps) {
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
export function VueFilmApplication({ id, data }: VueProps) {
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

/**
 * La place que prend un ascenseur vertical, gouttière réservée comprise.
 *
 * Mesurée dans l'application plutôt que supposée : Chromium en donne quinze ici. On ne la calcule
 * pas à chaque rendu, les zones qui s'en servent réservant leur gouttière en permanence : la valeur
 * ne bouge donc pas selon la longueur du texte, et le bouton ne saute pas quand l'ascenseur paraît.
 */
const LARGEUR_ASCENSEUR = 15;

export function VueSortieTexte({ data }: VueProps) {
  const { t } = useI18n();
  const texte = data.audioResultatMessage ?? "";
  return (
    <div className="nodrag attic-node-sortie-texte" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <NodeResizer minWidth={260} minHeight={140} maxWidth={800} maxHeight={600} />
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Le bouton se tient à gauche de l'ascenseur, et non dessus : un texte reçu un peu long
            fait défiler la zone, et un bouton collé au bord droit chevauchait la barre. */}
        <button
          className="attic-node-copy-btn"
          style={{ position: "absolute", top: 4, right: LARGEUR_ASCENSEUR + 4, zIndex: 1 }}
          title={t("btn.copier")}
          onClick={(e) => { e.stopPropagation(); copierTexte(texte); }}
        >⧉</button>
        <textarea
          readOnly
          value={texte || t("export.avantLancer")}
          style={{
            width: "100%", flex: "1 1 auto", minHeight: 80,
            resize: "none",
            scrollbarGutter: "stable",
            fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
            background: "var(--bg-input, #0d1117)", color: "var(--texte, #cbd5e1)",
            border: "1px solid var(--border, #333)",
            borderRadius: 4, padding: "6px 8px", paddingRight: 34, outline: "none",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// ── Modifier le texte : ce qui arrive s'affiche, et s'écrit ──
//
// LA VALEUR EST TENUE EN LOCAL, ET LE RÉGLAGE SUIT. Écrire dans une zone dont le contenu vient du
// graphe fait remonter chaque frappe jusqu'au canevas avant de la réafficher : le curseur saute dès
// que le graphe est un peu gros. La zone garde donc sa valeur pour elle, et n'écrit dans le réglage
// que pour la sauvegarde et pour l'exécution.
//
// TANT QUE LA ZONE EST VIDE, ELLE MONTRE CE QUI ARRIVE. C'est le texte que l'exécution vient d'y
// déposer ; la première frappe le recopie dans le réglage, et il devient le texte du nœud.
export function VueModifierTexte({ id, data }: VueProps) {
  const { t } = useI18n();
  const d = data as { _texteRecu?: string; onChangerParametre?: (id: string, nom: string, v: string | number) => void };
  const recu = String(d._texteRecu ?? "");
  const ecrit = String(data.parametres?.["Texte"] ?? "");
  const [valeur, setValeur] = useState(ecrit || recu);

  useEffect(() => { if (ecrit === "") setValeur(recu); }, [recu, ecrit]);

  const changer = (v: string) => { setValeur(v); d.onChangerParametre?.(id, "Texte", v); };

  return (
    <div className="nodrag attic-node-sortie-texte" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <NodeResizer minWidth={260} minHeight={140} maxWidth={800} maxHeight={600} />
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* LE BOUTON SE TIENT À GAUCHE DE L'ASCENSEUR, ET NON DESSUS. Une zone où l'on écrit finit
            par défiler ; un bouton collé au bord droit chevauchait alors la barre de défilement,
            signalé par Fabien. La gouttière est réservée en permanence, de sorte que la place du
            bouton ne dépend pas de la longueur du texte, et il se pose juste avant elle. */}
        <button
          className="attic-node-copy-btn"
          style={{ position: "absolute", top: 4, right: LARGEUR_ASCENSEUR + 4, zIndex: 1 }}
          title={t("btn.copier")}
          onClick={(e) => { e.stopPropagation(); copierTexte(valeur); }}
        >⧉</button>
        <textarea
          value={valeur}
          onChange={(e) => changer(e.target.value)}
          placeholder={t("node.source_texte.placeholder")}
          style={{
            width: "100%", flex: "1 1 auto", minHeight: 80,
            resize: "none",
            scrollbarGutter: "stable",
            fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
            background: "var(--bg-input, #0d1117)", color: "var(--texte, #cbd5e1)",
            border: "1px solid var(--border, #333)",
            borderRadius: 4, padding: "6px 8px", paddingRight: 34, outline: "none",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, marginTop: 3, color: "var(--text-muted, #666)" }}>
        <button className="attic-node-fichier-btn" disabled={ecrit === ""}
          onClick={(e) => { e.stopPropagation(); changer(""); setValeur(recu); }}>
          {t("modifierTexte.reprendre")}
        </button>
        <span>{traduire("msg.var_0_caract_res", valeur.length)}</span>
      </div>
    </div>
  );
}

// ── Carte sonore (génère un HTML ouvrable dans le navigateur par défaut) ──
