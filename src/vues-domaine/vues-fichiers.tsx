// ui/vues-fichiers.tsx — Forme d'onde, zones, et chargement d'un fichier.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useI18n } from "../i18n";
import { useStatut } from "../ui/statuts";
import { FormeOnde } from "./FormeOnde";
import { SelecteurMultiZones } from "./SelecteurMultiZones";
import type { VueProps } from "../ui/registre-vues";

import { LecteurAudio } from "../ui/lecteur-audio";
export function VueFormeOnde({ data }: VueProps) {
  return (
    <FormeOnde
      audioUrl={data.audioResultatUrl}
      multi={false}
      zones={[]}
    />
  );
}

// ── Sélecteur multi-zones (canvas natif) ──
export function VueSelecteurMultiZones({ id, data }: VueProps) {
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
export function estActif(valeur: unknown): boolean {
  const v = String(valeur ?? "").trim().toLowerCase();
  return v === "oui" || v === "on";
}

export function estLog(valeur: unknown): boolean {
  const v = String(valeur ?? "log").trim().toLowerCase();
  // Défaut historique = échelle logarithmique : tout ce qui n'est pas
  // explicitement linéaire reste logarithmique.
  return v !== "lineaire" && v !== "linéaire" && v !== "linear";
}

export function VueUploadAudio({ id, data }: VueProps) {
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
        <LecteurAudio key={data.audioUrl} src={data.audioUrl} />
      )}
    </div>
  );
}

// ── Chargement d'un fichier image ──
export function VueUploadImage({ id, data }: VueProps) {
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
export function VueUploadSvg({ id, data }: VueProps) {
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
export function VueUploadPdf({ id, data }: VueProps) {
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
