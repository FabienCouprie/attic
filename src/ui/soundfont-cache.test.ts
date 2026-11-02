// ui/soundfont-cache.test.ts — Le SoundFont qui arrive ne vide le cache que s'il change quelque chose,
// et jamais en plein run.
//
// L'ANCIENNE RÈGLE EST LE TÉMOIN : elle vidait à chaque arrivée, sans condition. Les deux cas qui la
// séparent de la nouvelle sont ceux du relevé du 2026-11-02 : le même instrument qui revient (le
// second passage de StrictMode) et un instrument qui arrive pendant une exécution.
import { describe, expect, it } from "vitest";

import { decisionDeVidage } from "./soundfont-cache";

/** Ce que faisait le crochet avant : `if (sf2) cacheExec.current.clear()`. */
const ancienne = () => "maintenant" as const;

describe("le cache d'exécution devant un SoundFont qui arrive", () => {
  it("UN INSTRUMENT INCHANGÉ NE VIDE RIEN, là où l'ancienne règle vidait", () => {
    const d = decisionDeVidage({ nomAvant: "FluidR3_GM.sf2", nomApres: "FluidR3_GM.sf2", enExecution: false });
    expect(d).toBe("non");
    expect(ancienne()).toBe("maintenant");
  });

  it("un instrument qui change hors de toute exécution vide tout de suite", () => {
    expect(decisionDeVidage({ nomAvant: "", nomApres: "FluidR3_GM.sf2", enExecution: false })).toBe("maintenant");
    expect(decisionDeVidage({ nomAvant: "FluidR3_GM.sf2", nomApres: "Autre.sf2", enExecution: false })).toBe("maintenant");
  });

  it("UN INSTRUMENT QUI ARRIVE EN PLEIN RUN ATTEND LA FIN DU RUN, là où l'ancienne règle vidait", () => {
    const d = decisionDeVidage({ nomAvant: "", nomApres: "FluidR3_GM.sf2", enExecution: true });
    expect(d).toBe("a-la-fin-du-run");
    expect(ancienne()).toBe("maintenant");
  });

  it("et le même instrument en plein run ne vide rien non plus, ni maintenant ni après", () => {
    expect(decisionDeVidage({ nomAvant: "X.sf2", nomApres: "X.sf2", enExecution: true })).toBe("non");
  });
});
