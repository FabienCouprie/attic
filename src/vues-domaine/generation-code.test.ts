// ui/generation-code.test.ts — Le prompt et le dépouillement de la réponse.
//
// CE QUI SE VÉRIFIE ICI NE SE VOIT PAS À L'ÉCRAN : un contrat qui perd un nom de variable donne du
// code plausible qui n'écrit nulle part, et un bloc mal dépouillé donne un script qui ne s'exécute
// pas. Dans les deux cas l'utilisateur accuserait le modèle.
import { describe, it, expect } from "vitest";
import { CONTRATS, EXEMPLES, construirePrompt, extraireCode, rangerModeles } from "./generation-code";

describe("le cadre imposé au modèle", () => {
  it("nomme les entrées et la sortie de chaque langage", () => {
    expect(CONTRATS.python).toContain("ATTIC_OUTPUT_PATH");
    expect(CONTRATS.python).toContain("sys.argv[1]");
    expect(CONTRATS.python).toContain("ATTIC_SAMPLE_RATE");
    expect(CONTRATS.julia).toContain("ATTIC_OUTPUT_PATH");
    expect(CONTRATS.julia).toContain("ARGS[2]");
    expect(CONTRATS.julia).toContain("ATTIC_CHANNELS");
  });

  it("annonce ce dont le script dispose, et rien de plus", () => {
    expect(CONTRATS.python).toMatch(/numpy/);
    expect(CONTRATS.julia).toMatch(/WAV/);
  });
});

describe("le prompt", () => {
  it("porte le cadre, la demande, et la forme attendue", () => {
    const p = construirePrompt({ langage: "python", consigne: "un filtre passe-bas à 800 Hz" });
    expect(p).toContain("Python 3");
    expect(p).toContain("ATTIC_OUTPUT_PATH");
    expect(p).toContain("un filtre passe-bas à 800 Hz");
    expect(p).toMatch(/UNIQUEMENT le code/);
  });

  it("joint le code actuel quand il y en a un, comme point de départ", () => {
    const p = construirePrompt({
      langage: "julia", consigne: "ajoute un fondu", codeActuel: "using WAV\naudio = audio .* 2",
    });
    expect(p).toContain("CODE ACTUEL");
    expect(p).toContain("audio .* 2");
  });

  it("JOINT L'EXEMPLE QUAND L'ÉDITEUR EST VIDE, et demande d'en respecter les conventions", () => {
    // C'est le cas où un petit modèle a le plus besoin d'un patron : sans code sous les yeux, une
    // spécification en prose lui laisse inventer les noms.
    const p = construirePrompt({ langage: "python", consigne: "un bruit rose", codeActuel: "   \n  " });
    expect(p).not.toContain("CODE ACTUEL");
    expect(p).toContain("PROGRAMME D'EXEMPLE");
    expect(p).toContain(EXEMPLES.python);
    expect(p).toContain("En respectant les conventions d'entrée et de sortie de ce programme d'exemple, écris un programme qui : un bruit rose");
  });

  it("NE MET JAMAIS LES DEUX PROGRAMMES : un à modifier ou un à imiter, pas les deux", () => {
    const p = construirePrompt({ langage: "julia", consigne: "ajoute un fondu", codeActuel: "using WAV\n# mon code" });
    expect(p).toContain("CODE ACTUEL");
    expect(p).not.toContain("PROGRAMME D'EXEMPLE");
    expect(p).not.toContain(EXEMPLES.julia);
  });

  it("L'EXEMPLE NOMME TOUT CE QUE LE CADRE NOMME, sans quoi les deux dériveraient", () => {
    // Le cadre annonce des variables d'environnement ; un exemple qui en oublierait une
    // apprendrait au modèle à s'en passer, et le composant ne recevrait rien.
    // Les deux sorties facultatives sont écartées : un script qui traite du son n'écrit ni MIDI
    // ni texte, et l'exemple aurait tort de le faire.
    const FACULTATIVES = new Set(["ATTIC_OUTPUT_MIDI", "ATTIC_OUTPUT_TEXT"]);
    for (const langage of ["python", "julia"] as const) {
      const variables = [...new Set([...CONTRATS[langage].matchAll(/ATTIC_[A-Z_]+/g)].map((m) => m[0]))]
        .filter((v) => !FACULTATIVES.has(v));
      expect(variables.length, langage).toBeGreaterThan(3);
      for (const v of variables) {
        expect(EXEMPLES[langage], `${langage} : ${v}`).toContain(v);
      }
    }
  });
});

describe("extraire le code d'une réponse", () => {
  it("dépouille le bloc encadré et sa phrase d'introduction", () => {
    const r = "Voici le script demandé :\n\n```python\nimport numpy as np\nprint(1)\n```\n\nIl double le volume.";
    expect(extraireCode(r)).toBe("import numpy as np\nprint(1)");
  });

  it("garde le bloc le plus long quand il y en a plusieurs", () => {
    // Les modèles font souvent précéder le script d'un court exemple d'appel.
    const r = "```bash\npython script.py\n```\net le script :\n```python\nimport wave\nimport numpy as np\nx = 1\n```";
    expect(extraireCode(r)).toContain("import wave");
    expect(extraireCode(r)).not.toContain("python script.py");
  });

  it("laisse passer un code nu, sans bloc", () => {
    expect(extraireCode("using WAV\nwavwrite(a, sr, p)")).toBe("using WAV\nwavwrite(a, sr, p)");
  });

  it("retire une clôture orpheline, qu'une réponse tronquée laisse traîner", () => {
    expect(extraireCode("```julia\nusing WAV\n")).toBe("using WAV");
    expect(extraireCode("using WAV\n```")).toBe("using WAV");
  });

  it("rend une chaîne vide plutôt que de planter sur une réponse absente", () => {
    expect(extraireCode("")).toBe("");
    expect(extraireCode(undefined as unknown as string)).toBe("");
  });
});

describe("l'ordre des modèles proposés", () => {
  it("met les modèles de code devant", () => {
    const r = rangerModeles(["llama3.2:3b", "qwen2.5-coder:7b", "gemma2:2b", "deepseek-coder:6.7b"]);
    expect(r.slice(0, 2)).toEqual(["deepseek-coder:6.7b", "qwen2.5-coder:7b"]);
    expect(r[r.length - 1]).toBe("gemma2:2b");
  });

  it("ne perd aucun modèle et ne modifie pas la liste reçue", () => {
    const source = ["b:1", "a:1", "coder:1"];
    const copie = [...source];
    expect(rangerModeles(source)).toHaveLength(3);
    expect(source).toEqual(copie);
  });
});
