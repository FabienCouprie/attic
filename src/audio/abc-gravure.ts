// audio/abc-gravure.ts — Ce que le graveur reçoit d'un texte ABC.
//
// LA REVUE DES NOTATIONS EN TEXTE, quatrième format, 2026-11-22. Le lecteur ABC de Verovio lit faux
// des écritures justes. Ce module écrit autrement, avant la gravure, celles qui ont une écriture
// équivalente qu'il lit juste. La partition dessinée dit alors ce que dit le texte.
//
// Le texte n'est touché que dans le corps des airs, hors des champs, des commentaires, des chaînes
// entre guillemets, des ornements entre points d'exclamation ou entre plus, et des notes d'ornement
// entre accolades.
//
// CE QUE VEROVIO NE SAIT PAS GRAVER du tout, il ne le reçoit pas : `tournuresNonGravees` le relève,
// pour que le nœud refuse l'air en le nommant.

import { traduire } from "../i18n";
import { lireMetrique, qParDefaut, uniteParDefaut, type Metrique } from "./abc";

/** Une durée ABC, « 2 », « / », « 3/2 », « // », en fraction de l'unité L. */
function lireDuree(texte: string): [number, number] {
  const m = /^(\d*)(\/*)(\d*)$/.exec(texte);
  if (!m || !texte) return [1, 1];
  const num = m[1] ? Number(m[1]) : 1;
  if (!m[2]) return [num, 1];
  return [num, m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length];
}

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));
function ecrireDuree([n, d]: [number, number]): string {
  const g = pgcd(n, d);
  n /= g; d /= g;
  return `${n === 1 ? "" : n}${d === 1 ? "" : `/${d}`}`;
}

/** Les morceaux d'une ligne du corps : ce qui se lit comme musique, et ce qui se recopie tel quel. */
const HORS_MUSIQUE = /("[^"]*"|![^!\n]*!|\+[^+\n]*\+|\{[^}]*\}|\[[A-Za-z]:[^\]]*\]|%.*$)/;

/**
 * UN ACCORD DONT LA DURÉE SUIT LE CROCHET : « [CEG]2 » s'écrit « [C2E2G2] ».
 *
 * La norme ABC 2.1 (§4.17) applique la durée qui suit le crochet à chaque note de l'accord : « [CEG]2 »
 * est un accord de blanches en L:1/4. Verovio le gravait à l'unité, en noires, et c'est la forme
 * qu'écrit « MIDI → ABC » : deux blanches y devenaient deux croches. Une note qui a déjà sa durée la
 * voit multipliée, « [C2E]2 » valant « [C4E2] ».
 */
export function dureesDansLesAccords(texte: string): string {
  let corps = false;
  return texte.split(/(\r?\n)/).map((ligne) => {
    if (/^\r?\n$/.test(ligne)) return ligne;
    if (ligne.startsWith("X:")) corps = false;
    if (/^[A-Za-z+]:/.test(ligne) || /^\s*%/.test(ligne)) {
      if (ligne.startsWith("K:")) corps = true;
      return ligne;
    }
    if (!corps) return ligne;
    return ligne.split(HORS_MUSIQUE).map((morceau, i) => (i % 2 === 1 ? morceau
      // Un accord ne contient que des hauteurs, leurs durées, leurs liaisons et leurs points ; le
      // crochet d'une fin, « [2 E |] », n'en est pas un.
      : morceau.replace(/\[([\^=_A-Ga-g,'0-9/.~-]+)\](\d*\/*\d*)/g, (tout, notes: string, duree: string) => {
        if (!duree) return tout;
        const facteur = lireDuree(duree);
        const dedans = notes.replace(/([\^=_]*[A-Ga-g][,']*)(\d*\/*\d*)/g, (_n, hauteur: string, propre: string) => {
          const [a, b] = lireDuree(propre);
          return hauteur + ecrireDuree([a * facteur[0], b * facteur[1]]);
        });
        return `[${dedans}]`;
      }))).join("");
  }).join("");
}

/** Les figures de note, en Unicode : un glyphe SMuFL de la zone privée resterait un carré dans le texte. */
const FIGURES: Record<string, string> = {
  "1/1": "\u{1D15D}", "1/2": "\u{1D15E}", "1/4": "♩", "1/8": "♪", "1/16": "\u{1D161}",
  "3/2": "\u{1D15E}.", "3/4": "♩.", "3/8": "♪.", "3/16": "\u{1D161}.",
};

/** Le texte d'un tempo comme on le grave, « Allegro ♩ = 120 », ou null si Q: ne donne pas de mouvement. */
export function texteDeTempo(valeur: string, unite: [number, number]): string | null {
  const textes = [...valeur.matchAll(/"([^"]*)"/g)].map((m) => m[1].trim()).filter(Boolean);
  const v = valeur.replace(/"[^"]*"/g, "").trim();
  const m = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+(?:\.\d+)?)/.exec(v) ?? /^()()(\d+(?:\.\d+)?)$/.exec(v);
  if (!m) return null;
  const [n, d] = m[1] ? [Number(m[1]), Number(m[2])] : unite;
  const g = pgcd(n, d);
  const figure = FIGURES[`${n / g}/${d / g}`] ?? `${n / g}/${d / g}`;
  return [...textes, `${figure} = ${m[3]}`].join(" ");
}

/**
 * LE TEMPO SE GRAVE. Décision de Fabien du 2026-11-22, « Engrave the tempo » : Verovio ne dessine un
 * Q: que par son texte, et « Q:1/4=60 » se gravait en texte vide. Chaque Q:, en tête ou en ligne,
 * reçoit le texte de son mouvement, « ♩ = 60 », après le sien s'il en a un. L'ancienne forme « Q:120 »
 * se compte en unités L, comme le lecteur ABC la compte (`lireTempo`).
 */
export function tempoGrave(texte: string): string {
  return decouper(texte).map((air) => {
    const champ = (c: string) => air.match(new RegExp(`^${c}:(.*)$`, "m"))?.[1].trim();
    const l = champ("L");
    const unite: [number, number] = l && /^\d+\/\d+$/.test(l) ? (l.split("/").map(Number) as [number, number])
      : (() => { const u = uniteParDefaut(lireMetrique(champ("M") ?? "")); return [u.n, u.d] as [number, number]; })();
    const recrire = (valeur: string) => {
      const t = texteDeTempo(valeur, unite);
      return t === null ? null : `"${t}" ${valeur.replace(/"[^"]*"/g, "").trim()}`;
    };
    return air.replace(/^Q:(.*)$/gm, (tout, valeur: string) => { const r = recrire(valeur); return r === null ? tout : `Q:${r}`; })
      .replace(/\[Q:([^\]]*)\]/g, (tout, valeur: string) => { const r = recrire(valeur); return r === null ? tout : `[Q:${r}]`; });
  }).join("");
}

/** Le texte coupé avant chaque X:, sans rien perdre : ses morceaux, mis bout à bout, le refont. */
const decouper = (texte: string) => texte.split(/(?=^X:)/m);

/** Le texte ABC tel que le graveur doit le recevoir. */
export function abcPourGravure(texte: string): string {
  return tempoGrave(dureesDansLesAccords(texte));
}

export type TournureNonGravee = {
  raison: "voix" | "fin" | "tonalite" | "liaison" | "nolet";
  /** Comptée dans l'air, depuis son X:, comme les fautes du lecteur ABC. */
  ligne: number;
  texte: string;
  fragment: string;
  /** Les nombres que le message cite : les voix, ou le n-olet et ses deux lectures. */
  valeurs: (string | number)[];
};

/** Un n-olet marqué de son seul chiffre se lit selon l'usage : p notes dans le temps de… */
const USAGE: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 8: 6, 9: 8 };
const premierMot = (s: string) => s.trim().split(/\s+/)[0];
/** Un K: qui nomme une tonique, et non la seule clé : « [K:clef=bass] » se grave juste. */
const changeLaTonalite = (valeur: string) => /^\s*([A-G]|none\b)/.test(valeur);

/**
 * CE QUE VEROVIO NE SAIT PAS GRAVER, relevé dans un air. Décision de Fabien du 2026-11-22, « Refuse
 * them, named » : le nœud refuse l'air, et le message nomme chaque tournure, sa ligne et le fragment.
 * Mesuré ce jour-là, en relisant la gravure, et sous toutes les écritures que la norme permet :
 *   - « voix » : deux voix se gravent bout à bout, sur une seule portée ;
 *   - « fin » : une fin alternative, « |1 », « [2 », « :|2 », se grave sans son crochet ;
 *   - « tonalite » : un K: en cours de morceau se grave comme un changement de clé, sans armure ;
 *   - « liaison » : une liaison dans un accord ne se dessine qu'en partie, ou pas du tout ;
 *   - « nolet » : un n-olet dont le second nombre, écrit ou tiré de la norme (§4.13), n'est pas celui
 *     que l'usage lit sous le chiffre seul. Cinq notes dans le temps de deux se gravent « 5 », et se
 *     lisent cinq pour quatre. Le second nombre est celui du lecteur ABC (`qParDefaut`).
 */
export function tournuresNonGravees(air: string): TournureNonGravee[] {
  const trouvees: (TournureNonGravee & { colonne: number })[] = [];
  const voix: string[] = [];
  let corps = false, metrique: Metrique | null = null;
  air.split(/\r?\n/).forEach((ligne, i) => {
    let colonne = 0;
    const ajouter = (raison: TournureNonGravee["raison"], fragment: string, valeurs: (string | number)[] = [], ici = 0) =>
      trouvees.push({ raison, ligne: i + 1, texte: ligne.trim(), fragment, valeurs, colonne: colonne + ici });
    const voixVue = (id: string, fragment: string) => {
      if (voix.includes(id)) return;
      voix.push(id);
      if (voix.length === 2) ajouter("voix", fragment, [voix.join(", ")]);
    };
    const champ = /^([A-Za-z]):(.*)$/.exec(ligne);
    if (champ) {
      if (champ[1] === "M") metrique = lireMetrique(champ[2].trim());
      if (champ[1] === "V") voixVue(premierMot(champ[2]), ligne.trim());
      if (champ[1] === "K") { if (corps && changeLaTonalite(champ[2])) ajouter("tonalite", ligne.trim()); corps = true; }
      return;
    }
    if (!corps || /^\s*%/.test(ligne)) return;
    for (const [k, morceau] of ligne.split(HORS_MUSIQUE).entries()) {
      if (k % 2 === 1) {
        const enLigne = /^\[([A-Za-z]):([^\]]*)\]$/.exec(morceau);
        if (enLigne?.[1] === "K" && changeLaTonalite(enLigne[2])) ajouter("tonalite", morceau);
        if (enLigne?.[1] === "V") voixVue(premierMot(enLigne[2]), morceau);
        if (enLigne?.[1] === "M") metrique = lireMetrique(enLigne[2].trim());
      } else {
        // La musique écrite avant tout V: est celle d'une première voix, que la norme nomme « 1 ».
        if (!voix.length && morceau.trim()) voix.push("1");
        for (const f of morceau.matchAll(/(?:\||\[)\d[\d,-]*/g)) ajouter("fin", f[0], [], f.index);
        for (const a of morceau.matchAll(/\[([\^=_A-Ga-g,'0-9/.~-]+)\](\d*\/*\d*)(-?)/g)) {
          if (a[1].includes("-") || a[3]) ajouter("liaison", a[0], [], a.index);
        }
        for (const t of morceau.matchAll(/\((\d+)(?::(\d*))?(?::(\d*))?/g)) {
          const p = Number(t[1]);
          const q = t[2] ? Number(t[2]) : qParDefaut(p, metrique);
          if (USAGE[p] !== q) ajouter("nolet", t[0], [p, q, USAGE[p] ?? "?"], t.index);
        }
      }
      colonne += morceau.length;
    }
  });
  // Dans l'ordre où on les lit : ligne par ligne, puis de gauche à droite.
  return trouvees.sort((a, b) => a.ligne - b.ligne || a.colonne - b.colonne).map(({ colonne: _, ...t }) => t);
}

/** Le refus d'un air qui porte des tournures que le graveur ne sait pas dessiner, ou null. `quoi` nomme l'air. */
export function refusTournures(air: string, quoi: string): string | null {
  const tournures = tournuresNonGravees(air);
  if (tournures.length === 0) return null;
  return [
    traduire("msg.verovio.tournures_var_0_var_1", quoi, tournures.length),
    ...tournures.slice(0, 8).map((t) => traduire(`msg.verovio.tournure.${t.raison}`, t.ligne, t.texte, t.fragment, ...t.valeurs)),
    ...(tournures.length > 8 ? ["…"] : []),
  ].join("\n");
}
