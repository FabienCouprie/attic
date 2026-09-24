// tests-e2e/banc-mesure.ts — Mesurer un composant sans se tromper sur ce qu'on mesure.
//
// POURQUOI CE FICHIER EXISTE, et c'est une faute de ma part qu'il répare.
//
// J'ai mesuré ces composants une vingtaine de fois par des scripts improvisés dans la console, et je
// me suis trompé trois fois sur la mesure elle-même, pas sur le code mesuré :
//
//   • j'ai annoncé « 6 ms de gel » pour un calcul synchrone, ce qui est impossible : le module venait
//     du cache du rechargement à chaud, et je mesurais la version d'après en croyant tenir celle
//     d'avant ;
//   • j'ai publié une liste de vingt et un composants « au-dessus de la seconde », obtenue en les
//     enchaînant dans une même page : la pression mémoire gonflait les temps jusqu'à cinquante-quatre
//     fois, et `echo-ping-pong` y figurait à 1 629 ms pour 30 ms réels ;
//   • j'ai comparé un temps à froid à un temps à chaud sans le dire.
//
// LES QUATRE PRÉCAUTIONS SONT DONC ÉCRITES ICI PLUTÔT QUE RÉINVENTÉES :
//
//   1. LA VERSION CHARGÉE EST PROUVÉE. `marqueurs` cherche des motifs dans la source de la fonction
//      exécutée. Sans cette preuve, une mesure « avant » peut porter sur le code d'après.
//   2. UN COMPOSANT PAR CONTEXTE NEUF. La page est rechargée entre deux mesures, sans quoi elles
//      s'influencent.
//   3. LE GEL SE MESURE PAR `MessageChannel`, que l'arrière-plan ne ralentit pas, là où
//      `requestAnimationFrame` ne tire pas du tout dans un onglet caché. Zéro message signifie un gel
//      TOTAL, non l'absence de gel.
//   4. L'ENTRÉE EST DÉTERMINISTE, sans quoi deux empreintes ne se comparent pas.

import type { Page } from "@playwright/test";

/** La fréquence et la durée de l'entrée d'essai. Changer l'une invalide toutes les empreintes. */
export const FREQUENCE = 48000;
export const DUREE_SEC = 3;

export interface Mesure {
  /** Les marqueurs demandés, et s'ils ont été trouvés dans la source exécutée. */
  version: Record<string, boolean>;
  /** Temps total de l'exécution, en millisecondes. */
  ms: number;
  /**
   * Le plus long intervalle sans que le fil principal ait pu tourner, en millisecondes.
   * `null` quand AUCUN message n'est passé : le gel a duré toute l'exécution.
   */
  gelMs: number | null;
  messages: number;
  message: string | null;
  /** Une empreinte par sortie audio, « rms/crête », neuf décimales ; `null` pour les autres. */
  empreintes: (string | null)[];
  erreur: string | null;
}

/**
 * Exécute un composant dans la page et rend sa mesure.
 *
 * La page est rechargée à chaque appel : c'est la précaution 2, et elle coûte une seconde.
 */
export async function mesurerComposant(
  page: Page, url: string, ficheId: string,
  options: { marqueurs?: string[]; parametres?: Record<string, string | number> } = {},
): Promise<Mesure> {
  await page.goto(url);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  return await page.evaluate(async ([id, marqueurs, parametres, frequence, dureeSec]) => {
    const idx = await import("/src/plugins/index.ts");
    const fiche = (idx as any).toutesLesFiches.find((f: any) => f.id === id);
    if (!fiche) {
      return { version: {}, ms: 0, gelMs: null, messages: 0, message: null, empreintes: [],
        erreur: `fiche « ${id} » absente du registre` };
    }

    const source = String(fiche.executer);
    const version: Record<string, boolean> = {};
    for (const m of marqueurs as string[]) version[m] = source.includes(m);

    // Entrée déterministe : un générateur congruentiel, jamais Math.random.
    const n = Math.round(frequence * dureeSec);
    const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: frequence });
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let x = 12345 + c;
      for (let i = 0; i < n; i++) {
        const t = i / frequence;
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        d[i] = 0.35 * Math.sin(2 * Math.PI * (220 + c) * t)
             + 0.15 * Math.sin(2 * Math.PI * 660 * t)
             + (x / 0x7fffffff - 0.5) * 0.06;
      }
    }

    const reglages = parametres as Record<string, string | number>;
    const ctx = {
      noeud: { id: "banc", data: { ficheId: id, parametres: reglages } },
      runtime: null, repertoireTravail: null,
      entree: (i: number) => (i === 0 ? buf : null),
      entrees: () => [buf],
      paramNombre: (nom: string, def: number) => {
        if (typeof reglages[nom] === "number") return reglages[nom] as number;
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        return typeof p?.defaut === "number" ? p.defaut : def;
      },
      paramTexte: (nom: string, def: string) => {
        if (typeof reglages[nom] === "string") return reglages[nom] as string;
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        return typeof p?.defaut === "string" ? p.defaut : def;
      },
      onProgress: () => {},
      signal: new AbortController().signal,
    };

    // La sonde : un MessageChannel que l'arrière-plan ne ralentit pas.
    const canal = new MessageChannel();
    const instants: number[] = [];
    let actif = true;
    canal.port1.onmessage = () => {
      instants.push(performance.now());
      if (actif) canal.port2.postMessage(0);
    };
    canal.port2.postMessage(0);

    const debut = performance.now();
    let resultat: any = null;
    let erreur: string | null = null;
    try {
      resultat = await fiche.executer(ctx);
    } catch (e) {
      erreur = String((e as Error)?.message ?? e).slice(0, 120);
    }
    const ms = Math.round(performance.now() - debut);
    actif = false;

    let plusLong = 0;
    for (let i = 1; i < instants.length; i++) {
      plusLong = Math.max(plusLong, instants[i] - instants[i - 1]);
    }

    const empreintes = ((resultat && resultat.valeurs) || []).map((v: any) => {
      if (!(v instanceof AudioBuffer)) return null;
      let somme = 0, crete = 0;
      for (let c = 0; c < v.numberOfChannels; c++) {
        const d = v.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          somme += d[i] * d[i];
          crete = Math.max(crete, Math.abs(d[i]));
        }
      }
      const rms = Math.sqrt(somme / (v.length * v.numberOfChannels));
      return `${rms.toFixed(9)}/${crete.toFixed(9)}`;
    });

    return {
      version, ms,
      // Zéro message : le gel a duré toute l'exécution, ce qui n'est pas « aucun gel ».
      gelMs: instants.length === 0 ? null : Math.round(plusLong),
      messages: instants.length,
      message: resultat && typeof resultat.message === "string" ? resultat.message : null,
      empreintes, erreur,
    };
  }, [ficheId, options.marqueurs ?? [], options.parametres ?? {}, FREQUENCE, DUREE_SEC] as const);
}
