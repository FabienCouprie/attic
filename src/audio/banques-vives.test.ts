// audio/banques-vives.test.ts — Un cache minuscule, mais qui doit borner sa mémoire.
//
// Ce qui mérite un test ici n'est pas « déposer puis relire » : c'est la BORNE. Une banque pèse
// quelques mégaoctets, et un cache qui garde tout finirait par tenir en mémoire chaque banque jamais
// calculée dans une session de travail. Le test vérifie donc surtout ce qui est jeté, et dans quel
// ordre.
import "./polyfill-audiobuffer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_BANQUES, banqueVive, deposerBanque, nombreBanquesVives, oublierBanque,
} from "./banques-vives";
import { banqueDepuisRendus } from "./clavier-banque";

const banque = (racine: number) => banqueDepuisRendus(
  [racine], [new AudioBuffer({ numberOfChannels: 1, length: 64, sampleRate: 44100 })],
  { largeur: 2, noteBasse: 21, noteHaute: 108 },
);

describe("les banques vives", () => {
  beforeEach(() => {
    for (let i = 0; i < 20; i++) oublierBanque(`n${i}`);
  });

  it("rend la banque déposée par un nœud, et rien pour les autres", () => {
    const b = banque(60);
    deposerBanque("n1", b, "piano.sfz");
    expect(banqueVive("n1")?.banque).toBe(b);
    expect(banqueVive("n1")?.nom).toBe("piano.sfz");
    expect(banqueVive("n2")).toBeNull();
  });

  it("accepte un dépôt sans nom : c'est la banque du graphe, et la vue le dira", () => {
    deposerBanque("n1", banque(60));
    expect(banqueVive("n1")?.nom).toBe("");
  });

  it("remplace la banque d'un nœud sans en garder deux", () => {
    deposerBanque("n1", banque(60));
    const seconde = banque(72);
    deposerBanque("n1", seconde);
    expect(banqueVive("n1")?.banque).toBe(seconde);
    expect(nombreBanquesVives()).toBe(1);
  });

  it("ne garde que les dernières, et jette la plus ancienne", () => {
    for (let i = 0; i <= MAX_BANQUES; i++) deposerBanque(`n${i}`, banque(60 + i));
    expect(nombreBanquesVives()).toBe(MAX_BANQUES);
    expect(banqueVive("n0")).toBeNull();
    expect(banqueVive(`n${MAX_BANQUES}`)).not.toBeNull();
  });

  it("compte un dépôt répété comme récent : ce n'est pas lui qu'on jette", () => {
    for (let i = 0; i < MAX_BANQUES; i++) deposerBanque(`n${i}`, banque(60 + i));
    deposerBanque("n0", banque(90));          // le plus ancien redevient le plus récent
    deposerBanque("n9", banque(91));          // un de plus : c'est n1 qui doit partir
    expect(banqueVive("n0")).not.toBeNull();
    expect(banqueVive("n1")).toBeNull();
  });

  it("oublie sur demande", () => {
    deposerBanque("n1", banque(60));
    oublierBanque("n1");
    expect(banqueVive("n1")).toBeNull();
  });
});
