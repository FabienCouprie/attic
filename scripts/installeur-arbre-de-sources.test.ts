// scripts/installeur-arbre-de-sources.test.ts — Un installeur ne touche pas à un arbre de sources.
//
// CE FICHIER EXISTE À CAUSE D'UNE PERTE, le 2026-10-08. Une installation d'Attic vivait dans
// `E:\attic`, le dossier des sources : l'installeur y avait été pointé une fois, `.gitignore` en
// gardait la trace, et la note qu'il portait se terminait par « cela ne remplace pas de
// désinstaller l'application d'ici ». Installer la v5.0.0 — vers `C:\Program Files\Attic`, pas
// vers `E:\attic` — a lu l'ancien emplacement dans le registre et lancé l'ancien désinstalleur en
// silence. Un désinstalleur electron-builder fait `RMDir /r "$INSTDIR"`. Le dossier a été vidé :
// l'arbre de travail, `.git`, et tout ce que git ignorait — les modèles, la SoundFont, `presets/`,
// `work/`, les médias de l'utilisateur. Ce qui était commité a survécu sur le distant ; le reste
// non.
//
// CE QUE PERSONNE N'A VU VENIR, ET QUI EST LA LEÇON : l'effacement n'a été demandé par personne.
// Il a été fait par un installeur, en silence, sur un chemin choisi des mois plus tôt, pendant
// qu'on installait ailleurs. Aucune boîte de dialogue n'a nommé `E:\attic`.
//
// LES DEUX CAS CI-DESSOUS TIENNENT LE REFUS DANS `build/installer.nsh`, et le troisième tient
// l'état de ce dépôt-ci : qu'aucune application empaquetée n'y soit dépliée. Ils cherchent des
// FORMES — un arbre de travail, une application Electron — et non le nom « Attic » : le même
// accident sur le dépôt de quelqu'un d'autre est le même accident.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(__dirname, "..");
const NSH = readFileSync(join(RACINE, "build", "installer.nsh"), "utf8");

/** Le corps d'une macro NSIS, `!macro <nom> … !macroend`. */
function corpsDeMacro(nom: string): string | null {
  const m = new RegExp(`^!macro\\s+${nom}\\b([\\s\\S]*?)^!macroend`, "m").exec(NSH);
  return m ? m[1] : null;
}

// LES QUATRE MARQUES D'UN ARBRE DE TRAVAIL. Une seule suffit à refuser. Une installation réelle
// n'en porte aucune à son premier niveau — elle a `Attic.exe`, `resources\`, `locales\` et les
// `.pak` de Chromium —, de sorte qu'une installation ou une mise à jour ordinaire passe.
const MARQUES = [
  String.raw`$INSTDIR\.git\*.*`,
  String.raw`$INSTDIR\package.json`,
  String.raw`$INSTDIR\src\*.*`,
  String.raw`$INSTDIR\node_modules\*.*`,
];

describe("le refus d'un arbre de sources, dans l'installeur", () => {
  it("UNE MACRO SONDE LES QUATRE MARQUES ET S'ARRÊTE, plutôt qu'un test écrit deux fois", () => {
    // Écrit en double, l'un des deux finirait par diverger de l'autre, et ce serait celui du
    // désinstalleur — le moins regardé, et le seul qui efface.
    const garde = corpsDeMacro("atticRefuserArbreDeSources");
    expect(garde, "build/installer.nsh ne définit plus la macro de refus").toBeTruthy();
    for (const marque of MARQUES) {
      expect(garde, `la marque ${marque} n'est plus sondée`).toContain(marque);
    }
    expect(garde, "sonder sans s'arrêter ne protège rien").toMatch(/^\s*Abort\s*$/m);
  });

  it("ELLE EST POSÉE DANS LES DEUX CHEMINS, celui qui installe et celui qui efface", () => {
    for (const macro of ["customInit", "customUnInit"]) {
      const corps = corpsDeMacro(macro);
      expect(corps, `build/installer.nsh ne définit plus ${macro}`).toBeTruthy();
      expect(corps, `${macro} ne pose plus le refus`).toContain("!insertmacro atticRefuserArbreDeSources");
    }
  });

  it("et dans `customInit` elle vient EN PREMIER, avant que l'ancien désinstalleur ne soit lancé", () => {
    // `customInit` tourne dans `.onInit`, la section d'installation lance l'ancien désinstalleur
    // ensuite. Tout ce qu'on placerait avant le refus s'exécuterait sur un chemin qu'on s'apprête
    // à juger inacceptable — et le contrôle d'espace disque, par exemple, lit déjà `$INSTDIR`.
    const corps = corpsDeMacro("customInit") ?? "";
    const premiere = corps.split("\n").map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith(";"));
    expect(premiere, "le refus n'est plus la première instruction de customInit")
      .toContain("!insertmacro atticRefuserArbreDeSources");
  });
});

// ET L'ÉTAT QUI A RENDU LA PERTE POSSIBLE : une application empaquetée dépliée dans les sources.
// `.gitignore` la décrivait depuis des mois sans que rien ne la signale, parce qu'il la CACHAIT —
// c'était son objet. Un cas qui tombe est plus bruyant qu'un `git status` propre.
describe("ce dépôt ne contient pas d'application empaquetée", () => {
  // Les marques d'une application Electron dépliée, et d'aucun arbre de sources : le fichier de
  // données ICU, le fichier de licences de Chromium, et les archives `.pak` des ressources.
  // Aucune ne nomme Attic : une autre application dépliée ici serait le même accident.
  const marquesElectron = () => {
    const trouvees: string[] = [];
    for (const entree of readdirSync(RACINE)) {
      if (entree === "icudtl.dat" || entree === "LICENSES.chromium.html" || entree.endsWith(".pak")) {
        trouvees.push(entree);
      }
    }
    if (existsSync(join(RACINE, "resources", "app-update.yml"))) trouvees.push("resources/app-update.yml");
    return trouvees;
  };

  it("SINON LE DÉSINSTALLEUR DE CETTE APPLICATION EFFACERAIT LE DÉPÔT", () => {
    expect(marquesElectron(), [
      "Une application empaquetée est dépliée à la racine du dépôt.",
      "Son désinstalleur fait `RMDir /r` sur son dossier d'installation, et une simple mise à jour",
      "le lance sans rien demander : le dépôt partirait avec. C'est arrivé le 2026-10-08.",
      "Désinstallez-la proprement depuis son propre dossier, ou retirez ces fichiers à la main.",
    ].join("\n")).toEqual([]);
  });
});
