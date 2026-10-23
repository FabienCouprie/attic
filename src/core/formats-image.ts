// core/formats-image.ts — Les formats d'image qu'un composant peut écrire.
//
// QUATRE COMPOSANTS LES OFFRAIENT, ET AUCUN IDENTIFIANT N'ÉTAIT COMMUN, pas même pour le PNG que
// les quatre savent écrire. Trois n'avaient pas d'`optionIds` du tout, de sorte que le LIBELLÉ
// était l'identifiant enregistré : deux écrivaient « PNG,JPEG » et un « JPEG,PNG », donc l'ordre
// aussi divergeait, et l'ordre s'enregistre. Le quatrième écrivait « png » en minuscules, qui n'est
// pas « PNG ». Un même projet gardait ainsi deux valeurs pour le même format.
//
// LES IDENTIFIANTS SONT CEUX DU TYPE MIME, sans le préfixe : c'est la seule écriture qui ne soit pas
// un choix arbitraire, et c'est déjà celle que le binaire de visualisation attend sur sa ligne de
// commande.

/** Un format d'image, avec son type MIME et son extension. */
export interface FormatImage {
  id: string;
  fr: string;
  en: string;
  mime: string;
  extension: string;
}

export const FORMATS_IMAGE: readonly FormatImage[] = [
  { id: "png", fr: "PNG", en: "PNG", mime: "image/png", extension: "png" },
  { id: "jpeg", fr: "JPEG", en: "JPEG", mime: "image/jpeg", extension: "jpg" },
  { id: "svg", fr: "SVG", en: "SVG", mime: "image/svg+xml", extension: "svg" },
];

/** Le format d'un identifiant, ou `undefined`. Accepte les libellés d'autrefois, casse comprise. */
export function formatImage(valeur: string): FormatImage | undefined {
  const v = String(valeur).trim().toLowerCase();
  return FORMATS_IMAGE.find((f) => f.id === v)
    ?? (v === "jpg" ? FORMATS_IMAGE.find((f) => f.id === "jpeg") : undefined);
}

/**
 * Le réglage d'un composant qui écrit certains de ces formats, dans l'ordre demandé.
 *
 * L'ORDRE EST CELUI DU COMPOSANT ET NON CELUI DE LA TABLE, parce qu'il décide du défaut affiché et
 * qu'il est enregistré : un composant dont le JPEG est le défaut le met en tête, et le changer
 * déplacerait ce que l'utilisateur voit en premier.
 */
export function choixFormats(ids: string[]): {
  options: string[]; optionsEn: string[]; optionIds: string[]; optionsHeritees: Record<string, string>;
} {
  const retenus = ids.map((id) => {
    const f = formatImage(id);
    if (!f) throw new Error(`format d'image inconnu : ${id}`);
    return f;
  });
  return {
    options: retenus.map((f) => f.fr),
    optionsEn: retenus.map((f) => f.en),
    optionIds: retenus.map((f) => f.id),
    optionsHeritees: LIBELLES_HERITES_FORMATS,
  };
}

/**
 * Les libellés que ces listes ont portés avant cette table, et ce qu'ils désignaient.
 *
 * Trois composants n'avaient pas d'`optionIds`, donc leurs libellés majuscules sont ce que les
 * projets ont enregistré. Déclarés plutôt que devinés.
 */
export const LIBELLES_HERITES_FORMATS: Record<string, string> = {
  PNG: "png", JPEG: "jpeg", SVG: "svg", JPG: "jpeg", jpg: "jpeg",
};
