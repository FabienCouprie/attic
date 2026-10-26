// plugins/noms-parles.test.ts — Ce qu'un nom parlé doit être pour servir à quelque chose.
//
// ═══ LE DÉFAUT, RELEVÉ PAR FABIEN ═══
//
// « La dictée ne peut pas différencier les différents types de réverbération ; réverbération à
// convolution n'est jamais détectée. » Vérifié, et la cause n'était pas le découpage, qui trie
// bien du plus long au plus court : LE COMPOSANT N'ÉTAIT PAS DANS LA LISTE DU TOUT. Le mot
// « convolution » manque au lexique du modèle vocal français, et un nom qui en porte un est écarté
// — sans quoi il entrerait AMPUTÉ dans la grammaire, « réverbération à » concurrençant
// « Réverbération ». Voir `lexique-vosk.ts`, qui porte la mesure.
//
// MESURÉ SUR LE CATALOGUE ENTIER : **142 composants sur 504** étaient ainsi indicibles, pour 115
// mots manquants. Flanger, Vocoder, Normaliseur, Compresseur multibande, De-esser, Tremolo,
// Paulstretch, Arpégiateur MIDI, Débruitage IA, Goniomètre.
//
// ET L'AMPUTATION NE PEUT PAS SERVIR D'ALIAS, c'est mesuré aussi : retirer les mots manquants
// donnerait « réverbération à ir », « midi » pour DEUX composants différents, « de » pour le
// de-esser, et « spectral » pour deux autres. Un nom parlé est donc une décision de nomenclature,
// et c'est pourquoi il se déclare sur la fiche plutôt que de se calculer.
import { describe, expect, it } from "vitest";

import { estDicible } from "./lexique-vosk";
import { normaliserPourDictee } from "./prompt-graphe";
import { registre } from "../audio/adaptateur";
import "../composition";

/** Les fiches du catalogue, hors nœuds de service. */
const fiches = () => registre.tousLesPlugins()
  .filter((d) => !d.id.startsWith("__") && !d.id.startsWith("frontiere"));

/**
 * Les composants qu'aucun nom ne permet de dire aujourd'hui.
 *
 * IL NE PEUT QUE DESCENDRE : un composant neuf dont le nom porte un mot hors lexique le fait
 * monter, et c'est précisément ce qu'on veut voir — sans ce chiffre, la dictée perdrait des
 * composants sans que rien ne le dise, ce qui est exactement ce qui s'est passé.
 */
const INDICIBLES = 140;

describe("les noms parlés du catalogue", () => {
  it("UN NOM PARLÉ DÉCLARÉ DOIT LUI-MÊME SE PRONONCER, sans quoi il ne sert à rien", () => {
    // Un alias qui porte à son tour un mot hors lexique est ignoré en silence : le composant reste
    // indicible, et l'on croit l'avoir réparé.
    const fautifs = fiches()
      .filter((d) => d.nomDicte && !estDicible(normaliserPourDictee(d.nomDicte), false))
      .map((d) => `${d.id} « ${d.nomDicte} »`);
    expect(fautifs, [
      "",
      "UN NOM PARLÉ PORTE UN MOT QUE LE MOTEUR NE SAIT PAS PRONONCER.",
      "",
      "Il sera écarté comme le nom qu'il remplace, et le composant restera indicible — en donnant",
      "l'impression d'avoir été réparé. Les mots manquants sont dans `plugins/lexique-vosk.ts`.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET IL NE DOIT PAS DOUBLER UN NOM DÉJÀ PRIS, sans quoi il est écarté en silence", () => {
    // La règle du premier venu vaut pour l'alias comme pour le nom : un doublon ne s'ajoute pas à
    // la liste, il disparaît. C'est ce qui rendrait « midi » inutilisable comme alias, deux
    // composants le réclamant.
    const pris = new Map<string, string>();
    const doublons: string[] = [];
    for (const d of fiches()) {
      const nom = normaliserPourDictee(d.nom);
      const retenu = estDicible(nom, false)
        ? nom
        : (d.nomDicte && estDicible(normaliserPourDictee(d.nomDicte), false)
          ? normaliserPourDictee(d.nomDicte) : "");
      if (!retenu) continue;
      const deja = pris.get(retenu);
      if (deja) doublons.push(`« ${retenu} » : ${deja} et ${d.id}`);
      else pris.set(retenu, d.id);
    }
    expect(doublons, [
      "",
      "DEUX COMPOSANTS SE DISENT DU MÊME NOM.",
      "",
      "Le premier l'emporte et le second disparaît de la dictée sans un mot. Un nom parlé doit",
      "désigner un composant et un seul.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET UN NOM PARLÉ SUR UN NOM QUI SE DIT DÉJÀ EST DU POIDS MORT", () => {
    // Il ne remplace rien : le nom de la fiche se prononce, donc c'est lui qui entre. Le déclarer
    // laisse croire qu'on peut dire l'un ou l'autre, alors que l'alias n'est jamais atteint.
    const inutiles = fiches()
      .filter((d) => d.nomDicte && estDicible(normaliserPourDictee(d.nom), false))
      .map((d) => `${d.id} : « ${d.nom} » se dit déjà, « ${d.nomDicte} » ne servira jamais`);
    expect(inutiles).toEqual([]);
  });

  it("LE NOMBRE DE COMPOSANTS INDICIBLES NE REMONTE PAS", () => {
    // ═══ C'EST CE CHIFFRE QUI MANQUAIT, ET SON ABSENCE A COÛTÉ LA DÉCOUVERTE PAR L'USAGE ═══
    //
    // Deux composants avaient disparu de la dictée, et c'est en essayant de les dire qu'on l'a su.
    // Il descend à chaque nom parlé déclaré, et un composant neuf dont le nom porte un mot hors
    // lexique le fait monter.
    const indicibles = fiches().filter((d) => {
      const nom = normaliserPourDictee(d.nom);
      if (!nom || estDicible(nom, false)) return false;
      return !(d.nomDicte && estDicible(normaliserPourDictee(d.nomDicte), false));
    });
    expect(indicibles.length, [
      "",
      `LE CATALOGUE COMPTE ${indicibles.length} COMPOSANTS QU'AUCUN NOM NE PERMET DE DIRE, CONTRE ${INDICIBLES} INSCRITS.`,
      "",
      "S'il a MONTÉ : un composant neuf porte un mot absent du lexique du moteur vocal. Lui donner",
      "un `nomDicte` dans sa fiche, ou inscrire le nouveau chiffre en disant pourquoi on l'accepte.",
      "",
      "S'il a DESCENDU : un nom parlé vient d'être déclaré. Abaisser le chiffre, une liste qu'on ne",
      "réduit pas finissant par décrire un état qui n'existe plus.",
      "",
      "Les premiers de la liste aujourd'hui :",
      ...indicibles.slice(0, 12).map((d) => `  ${d.id} « ${d.nom} »`),
      "",
    ].join("\n")).toBe(INDICIBLES);
  });

  it("et les deux réverbérations relevées se disent maintenant", () => {
    // Le cas qui a ouvert ce chantier, gardé nommément : ce sont elles qu'on ne pouvait pas dire.
    for (const [id, parle] of [
      ["reverbe-convolution", "réverbération à réponse"],
      ["reverbe-reseau", "réverbération à réseau"],
    ]) {
      const d = fiches().find((x) => x.id === id);
      expect(d?.nomDicte, id).toBe(parle);
      expect(estDicible(normaliserPourDictee(parle), false), parle).toBe(true);
    }
  });
});
