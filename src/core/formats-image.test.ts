// core/formats-image.test.ts — Un format d'image s'enregistre sous un seul nom.
//
// QUATRE COMPOSANTS LES OFFRAIENT, ET AUCUN IDENTIFIANT N'ÉTAIT COMMUN, pas même pour le PNG que
// les quatre savent écrire. Trois n'avaient pas d'`optionIds`, donc le LIBELLÉ était l'identifiant
// enregistré : deux écrivaient « PNG,JPEG » et un « JPEG,PNG », de sorte que l'ordre divergeait
// aussi, et l'ordre s'enregistre. Le quatrième écrivait « png » en minuscules, qui n'est pas
// « PNG ». Un même projet gardait ainsi deux valeurs pour le même format.
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins/index";
import { FORMATS_IMAGE, LIBELLES_HERITES_FORMATS, choixFormats, formatImage } from "./formats-image";

describe("la table des formats d'image", () => {
  it("chaque format porte son type MIME et son extension", () => {
    for (const f of FORMATS_IMAGE) {
      expect(f.mime, f.id).toMatch(/^image\//);
      expect(f.extension, f.id).toMatch(/^[a-z]+$/);
      expect(formatImage(f.id), f.id).toBe(f);
    }
  });

  it("L'EXTENSION N'EST PAS L'IDENTIFIANT, et le JPEG le montre", () => {
    // Son identifiant est celui du type MIME, « jpeg », et son extension est « jpg ». Les confondre
    // écrirait un fichier « pochette.jpeg » là où tout le monde attend « .jpg ».
    const jpeg = formatImage("jpeg")!;
    expect(jpeg.id).toBe("jpeg");
    expect(jpeg.extension).toBe("jpg");
    expect(formatImage("jpg"), "et « jpg » se relit").toBe(jpeg);
  });

  it("les libellés d'autrefois se relisent tous", () => {
    for (const [ancien, vise] of Object.entries(LIBELLES_HERITES_FORMATS)) {
      expect(formatImage(ancien)?.id, `« ${ancien} »`).toBe(vise);
    }
  });

  it("un format inconnu se dit, plutôt que de passer", () => {
    expect(formatImage("tiff")).toBe(undefined);
    expect(() => choixFormats(["png", "tiff"])).toThrow();
  });

  it("le réglage garde l'ordre demandé par le composant", () => {
    // L'ordre décide du défaut affiché et il est enregistré : un composant dont le JPEG est le
    // défaut le met en tête, et le réordonner déplacerait ce que l'utilisateur voit en premier.
    expect(choixFormats(["jpeg", "png"]).optionIds).toEqual(["jpeg", "png"]);
    expect(choixFormats(["png", "jpeg"]).optionIds).toEqual(["png", "jpeg"]);
  });
});

describe("ce que les composants offrent", () => {
  /** Les réglages à choix dont au moins deux identifiants nomment un format d'image. */
  function reglagesDeFormat(): { ou: string; ids: string[] }[] {
    const out: { ou: string; ids: string[] }[] = [];
    for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
      for (const p of (f.parametres ?? []) as {
        nom: string; type?: string; options?: unknown[]; optionIds?: string[];
      }[]) {
        const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
        if (ids.filter((x) => formatImage(x)).length < 2) continue;
        out.push({ ou: `${f.id}·${p.nom}`, ids });
      }
    }
    return out;
  }

  it("quatre composants offrent un format d'image", () => {
    expect(reglagesDeFormat().map((r) => r.ou).sort()).toEqual([
      "attracteur-ifs·Format",
      "generateur-pochette·Format",
      "spectrogramme-fractal·Format",
      "visualisation-songsee·Format",
    ]);
  });

  it("AUCUN N'OFFRE UN LIBELLÉ COMME IDENTIFIANT", () => {
    // C'est ici que tombent « PNG » et « JPEG » en majuscules : ils se voient à l'écran, mais ce
    // ne sont pas les identifiants sous lesquels un format s'enregistre.
    const fautifs: string[] = [];
    for (const r of reglagesDeFormat()) {
      for (const id of r.ids) {
        const f = formatImage(id);
        if (!f) continue;
        if (f.id !== id) fautifs.push(`${r.ou} : « ${id} » n'est pas l'identifiant de ${f.fr}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("LA POCHETTE SERT LES TROIS FORMATS, JPEG COMPRIS", () => {
    // Son absence n'était bornée par rien : son rastériseur est le même canevas que celui qui
    // produit déjà du JPEG ailleurs, et son type MIME y était simplement codé en dur.
    const pochette = reglagesDeFormat().find((r) => r.ou === "generateur-pochette·Format");
    expect(pochette?.ids).toEqual(["svg", "png", "jpeg"]);
  });
});
