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
//   5. LES CHOIX SONT CANONISÉS COMME L'APPLICATION LE FAIT. Un paramètre « choix » porte une
//      ÉTIQUETTE et un IDENTIFIANT, et le moteur réel canonise l'une vers l'autre. Une première
//      version de ce banc rendait l'étiquette brute : la tolérance de la reconstruction de phase
//      valait alors `parseFloat("10⁻⁶")`, c'est-à-dire DIX, les exposants en exposant n'étant pas des
//      chiffres. Le composant annonçait « 0 % intégré » et je l'ai pris pour un défaut du composant.
//      Il intègre 99,8 % avec le bon réglage. L'instrument mesurait un chemin que personne n'emprunte.

import type { Page } from "@playwright/test";

import type { Descripteurs } from "../src/audio/descripteurs-comparaison";

export type { Descripteurs };

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
  /**
   * Les descripteurs de la première sortie audio, quand on les demande.
   *
   * Leur calcul vit dans `src/audio/descripteurs-comparaison.ts`, avec ses cas : écrit ici, il
   * aurait été dans un `page.evaluate`, donc hors d'atteinte de tout garde.
   */
  descripteurs: Descripteurs | null;
  /**
   * Chaque sortie audio, encodée en WAV, quand on la demande — et le son d'essai avec.
   *
   * POURQUOI LE SON D'ESSAI EN FAIT PARTIE. On ne juge pas un effet sans entendre ce qui y est
   * entré : une réverbération sur un son qu'on n'a jamais entendu sec ne dit rien. Il part donc
   * avec, une fois, sous le rang −1.
   */
  wavs: { rang: number; base64: string; secondes: number; crete: number }[];
  erreur: string | null;
}

/**
 * Exécute un composant dans la page et rend sa mesure.
 *
 * La page est rechargée à chaque appel : c'est la précaution 2, et elle coûte une seconde.
 */
export async function mesurerComposant(
  page: Page, url: string, ficheId: string,
  options: {
    marqueurs?: string[];
    parametres?: Record<string, string | number>;
    /**
     * Les rangs d'entrée qui reçoivent le son d'essai. Par défaut la seule entrée 0.
     *
     * UN COMPOSANT QUI EN DEMANDE DEUX NE SE MESURE PAS AVEC UNE. La convolution de deux sons rend
     * null sans son second son, et son empreinte serait vide. Le rang est déclaré plutôt que deviné
     * du type des entrées : nourrir toutes les entrées audio par défaut changerait ce que mesurent
     * les composants à seconde entrée facultative, dont les empreintes sont déjà enregistrées.
     */
    entreesAudio?: number[];
    /**
     * Relever en plus les descripteurs de la première sortie audio.
     *
     * Ils coûtent une analyse spectrale de plus par mesure, et ne servent qu'à COMPARER : la base
     * d'empreintes, elle, n'en a pas besoin et ne doit pas ralentir pour eux.
     */
    descripteurs?: boolean;
    /**
     * Encoder les sorties audio en WAV, pour les ÉCOUTER.
     *
     * Le verbe `écouter` est le seul des cinq qui rende autre chose qu'un texte, et c'est le seul
     * qui rende ce pour quoi ce logiciel existe. Le banc tenait déjà le son ; il le jetait.
     */
    wav?: boolean;
  } = {},
): Promise<Mesure> {
  await page.goto(url);
  await page.waitForSelector(".attic-app", { timeout: 15000 });
  return await page.evaluate(async ([id, marqueurs, parametres, frequence, dureeSec, entreesAudio, veutDescripteurs, veutWav]) => {
    const idx = await import("/src/plugins/index.ts");
    // La canonisation du moteur réel, importée plutôt que réécrite : une seconde version dériverait.
    const { defautCanoniqueChoix } = await import("/src/i18n.tsx");
    const fiche = (idx as any).toutesLesFiches.find((f: any) => f.id === id);
    if (!fiche) {
      return { version: {}, ms: 0, gelMs: null, messages: 0, message: null, empreintes: [],
        descripteurs: null, wavs: [], erreur: `fiche « ${id} » absente du registre` };
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
    const rangs = entreesAudio as number[];

    // UN PORT « SPECTROGRAMME » NE REÇOIT PAS UN TAMPON AUDIO. Le composant le refuserait et le banc
    // mesurerait un refus, c'est-à-dire rien. Le spectrogramme d'essai est l'analyse du MÊME son
    // déterministe, au paramétrage de la référence : il reste donc reproductible d'une passe à
    // l'autre, ce qui est la condition pour qu'une empreinte veuille dire quelque chose.
    const veutSpectre = (fiche.entrees || []).some((p: any, i: number) => rangs.includes(i) && p?.type === "spectrogramme");
    let spectre: any = null;
    if (veutSpectre) {
      const sm = await import("/src/audio/spectrogramme-mel.ts");
      const mel = await import("/src/audio/mel.ts");
      const p = { ...(mel as any).PARAMETRES_RIFFUSION, echantillonnage: frequence };
      spectre = { canaux: [(sm as any).melDepuisSignal(buf.getChannelData(0), p)], parametres: p };
    }
    const pourRang = (i: number) => {
      if (!rangs.includes(i)) return null;
      return (fiche.entrees || [])[i]?.type === "spectrogramme" ? spectre : buf;
    };

    const ctx = {
      noeud: { id: "banc", data: { ficheId: id, parametres: reglages } },
      runtime: null, repertoireTravail: null,
      entree: (i: number) => pourRang(i),
      entrees: () => rangs.map((i) => pourRang(i)),
      paramNombre: (nom: string, def: number) => {
        if (typeof reglages[nom] === "number") return reglages[nom] as number;
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        return typeof p?.defaut === "number" ? p.defaut : def;
      },
      paramTexte: (nom: string, def: string) => {
        const p = (fiche.parametres || []).find((q: any) => q.nom === nom);
        // Un réglage imposé est canonisé comme le ferait l'inspecteur, pour qu'on puisse l'écrire
        // sous son étiquette lisible sans que le composant reçoive autre chose que son identifiant.
        if (typeof reglages[nom] === "string") {
          return p ? String((defautCanoniqueChoix as any)({ ...p, defaut: reglages[nom] })) : reglages[nom] as string;
        }
        if (!p || typeof p.defaut !== "string") return def;
        return String((defautCanoniqueChoix as any)(p));
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
      if (v instanceof AudioBuffer) {
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
      }
      // UNE COURBE SE SURVEILLE AUSSI, et le défaut de la suite logistique l'a montré : elle ne
      // portait que cinq paliers là où l'on en attend des dizaines, et aucune empreinte ne l'aurait
      // dit. Le nombre de PALIERS est donc relevé en plus du niveau : c'est lui qui distingue une
      // suite d'un escalier, à valeur efficace presque égale.
      if (v && ArrayBuffer.isView(v.valeurs) && typeof v.cadence === "number") {
        const d = v.valeurs as Float32Array;
        let somme = 0, crete = 0, paliers = 0, prec: number | null = null;
        for (let i = 0; i < d.length; i++) {
          somme += d[i] * d[i];
          crete = Math.max(crete, Math.abs(d[i]));
          const arrondi = Math.round(d[i] * 1e6) / 1e6;
          if (arrondi !== prec) { paliers++; prec = arrondi; }
        }
        const rms = d.length ? Math.sqrt(somme / d.length) : 0;
        return `courbe ${rms.toFixed(9)}/${crete.toFixed(9)} · ${d.length} valeurs · ${paliers} paliers`;
      }
      // UN SPECTROGRAMME SE SURVEILLE AUSSI, et sans cela le composant qui l'ANALYSE échapperait à la
      // base : sa sortie n'est pas de l'audio, donc son empreinte aurait été vide, et le garde de
      // couverture l'aurait refusé à juste titre. Les trois dimensions sont relevées avec le niveau,
      // pour la même raison que les paliers d'une courbe : un spectrogramme qui perdrait une trame ou
      // une bande garderait à peu près la même valeur efficace.
      if (v && Array.isArray(v.canaux) && v.parametres) {
        let somme = 0, crete = 0, n = 0;
        for (const trames of v.canaux) {
          for (const t of trames as Float32Array[]) {
            for (let i = 0; i < t.length; i++) { somme += t[i] * t[i]; crete = Math.max(crete, t[i]); n++; }
          }
        }
        const rms = n ? Math.sqrt(somme / n) : 0;
        const dim = `${v.canaux.length}×${v.canaux[0]?.length ?? 0}×${v.canaux[0]?.[0]?.length ?? 0}`;
        return `spectrogramme ${rms.toFixed(9)}/${crete.toFixed(9)} · ${dim}`;
      }
      return null;
    });

    // LES DESCRIPTEURS, SUR LA PREMIÈRE SORTIE AUDIO SEULEMENT. Un composant à deux sorties audio
    // n'a pas « deux timbres » à comparer : il en a un, et des variantes. Les relever sur toutes
    // rendrait un tableau que personne ne lit, et il faudrait choisir laquelle compte — ce qui est
    // exactement la décision qu'on veut éviter de prendre à la place de celui qui mesure.
    let descripteurs: any = null;
    const premiere = ((resultat && resultat.valeurs) || []).find((v: any) => v instanceof AudioBuffer);
    if (veutDescripteurs && premiere) {
      try {
        // LE CALCUL N'EST PAS ICI, ET C'EST VOULU : écrit dans ce `page.evaluate`, il aurait été
        // hors d'atteinte de tout cas. Un canal confondu ou une entrée et une sortie échangées
        // auraient rendu le même beau tableau. Il vit donc dans un module du domaine, éprouvé par
        // des cas à réponse connue, et le banc ne fait que l'appeler.
        const dc = await import("/src/audio/descripteurs-comparaison.ts");
        descripteurs = (dc as any).descripteursComparaison(premiere as AudioBuffer, buf);
      } catch (e) {
        // UN DESCRIPTEUR QUI LÈVE NE DOIT PAS FAIRE PASSER LE COMPOSANT POUR FAUTIF : la mesure du
        // composant, elle, a réussi, et c'est elle que la base d'empreintes surveille.
        descripteurs = { erreurDescripteurs: String((e as Error)?.message ?? e).slice(0, 120) };
      }
    }

    // ─── LE SON, ENCODÉ POUR QU'ON L'ENTENDE ───
    //
    // L'encodeur est celui du dépôt, `bufferVersWavBlob` : écrire un second en-tête WAV ici serait
    // la faute que ce dépôt répare le plus souvent. Le base64 se fait PAR TRANCHES, sans quoi
    // `String.fromCharCode(...octets)` fait déborder la pile dès le mégaoctet — une sortie de trois
    // secondes en seize bits stéréo en pèse 1,15.
    const wavs: any[] = [];
    if (veutWav) {
      const io = await import("/src/audio/io.ts");
      const enBase64 = async (b: AudioBuffer) => {
        const octets = new Uint8Array(await (io as any).bufferVersWavBlob(b).arrayBuffer());
        let s = "";
        for (let i = 0; i < octets.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000) as any);
        }
        let crete = 0;
        for (let c = 0; c < b.numberOfChannels; c++) {
          const d = b.getChannelData(c);
          for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));
        }
        return { base64: btoa(s), secondes: b.duration, crete };
      };
      // LE SON D'ESSAI PORTE LE RANG −1 : on ne juge pas un effet sans entendre ce qui y est entré.
      wavs.push({ rang: -1, ...(await enBase64(buf)) });
      const valeurs = (resultat && resultat.valeurs) || [];
      for (let rang = 0; rang < valeurs.length; rang++) {
        const v = valeurs[rang];
        if (v instanceof AudioBuffer && v.length > 0) wavs.push({ rang, ...(await enBase64(v)) });
      }
    }

    return {
      version, ms,
      // Zéro message : le gel a duré toute l'exécution, ce qui n'est pas « aucun gel ».
      gelMs: instants.length === 0 ? null : Math.round(plusLong),
      messages: instants.length,
      message: resultat && typeof resultat.message === "string" ? resultat.message : null,
      empreintes, descripteurs, wavs, erreur,
    };
  }, [ficheId, options.marqueurs ?? [], options.parametres ?? {}, FREQUENCE, DUREE_SEC,
      options.entreesAudio ?? [0], options.descripteurs ?? false, options.wav ?? false] as const);
}
