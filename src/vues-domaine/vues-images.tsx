// ui/vues-images.tsx — Ce qui se regarde : partitions, pochettes, images, niveaux.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { copierTexte } from "../ui/copier";
import { VuMetre } from "./VuMetre";
import { VueScoreEsthetique, VueComparaisonEsthetique } from "./ScoreEsthetique";
import { ColorSynth } from "./ColorSynth";
import { PochetteGen } from "./PochetteGen";
import { SongseeVue } from "./Songsee";
import { COULEURS, cleCouleur } from "../audio";
import type { VueProps } from "../ui/registre-vues";
import type { DonneesNoeud } from "../ui/AtelierNode";
import { partsDeDegustation } from "../audio/accord-mets";

import { LecteurAudio } from "../ui/lecteur-audio";
export function VueCouleurSunoIA({ data }: VueProps) {
  const { t, lang } = useI18n();
  const p = data.parametres ?? {};
  const c1 = String(p["Couleur 1"] ?? "Bleu");
  const c2 = String(p["Couleur 2"] ?? "(aucune)");
  // Lecture directe de `parametres` (sans `paramTexte`), donc sans canonisation :
  // la valeur peut être l'id (« bleu »), l'ancien nom français ou l'anglais.
  // Indexer COULEURS avec elle telle quelle ne marchait qu'avec le nom français.
  const obj1 = COULEURS[cleCouleur(c1) ?? ""];
  const obj2 = COULEURS[cleCouleur(c2) ?? ""];
  const hex1 = obj1?.hex ?? "#999";
  const hex2 = obj2?.hex ?? "#333";
  const nom1 = obj1 ? obj1[lang] : c1;
  const nom2 = obj2 ? obj2[lang] : c2;
  const texte = (data as { scriptGenere?: string }).scriptGenere ?? "";
  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: hex1, boxShadow: `0 0 6px ${hex1}` }} />
        {/* `obj2` suffit : « (aucune) », « (none) » et l'id « aucune » ne
            résolvent vers aucune couleur, quel que soit leur libellé. */}
        {obj2 ? (
          <>
            <span style={{ fontSize: 14, opacity: 0.5 }}>+</span>
            <div style={{ width: 24, height: 24, borderRadius: 4, background: hex2, boxShadow: `0 0 6px ${hex2}` }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{nom1} + {nom2}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: hex1 }}>{nom1}</span>
        )}
      </div>
      {texte ? (
        <div style={{ position: "relative" }}>
          <button className="attic-node-copy-btn nodrag" title={t("btn.copier")}
            onClick={(e) => { e.stopPropagation(); copierTexte(texte); }}
            style={{ position: "absolute", top: 4, right: 20, zIndex: 1 }}>⧉</button>
          <div style={{
            maxHeight: 160, overflowY: "auto", fontSize: 10, lineHeight: 1.5, whiteSpace: "pre-wrap",
            background: "#0d1117", borderRadius: 4, padding: "6px 22px 6px 8px", color: "var(--texte, #cbd5e1)",
          }}>{texte}</div>
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── Galerie d'exposition (liste des pistes + ouverture du HTML généré) ──
export function VueGalerieExposition({ data }: VueProps) {
  const { t } = useI18n();
  const [erreur, setErreur] = useState<string | null>(null);
  const a = (data as any)._affichage as { htmlPath?: string; pistes?: { nom: string; url: string }[] } | undefined;
  const htmlPath = a?.htmlPath;
  const pistes = a?.pistes;

  async function ouvrirDansNavigateur() {
    if (!htmlPath) return;
    setErreur(null);
    const api = (window as any).api;
    if (!api?.ouvrirChemin) {
      setErreur(t("msg.n_cessite_electron"));
      return;
    }
    const res = await api.ouvrirChemin(htmlPath);
    if (!res?.ok) setErreur(res?.erreur || t("msg.erreur_ouverture"));
  }

  return (
    <div className="nodrag" onPointerDown={(e) => e.stopPropagation()} style={{ padding: "4px 2px" }}>
      {htmlPath ? (
        <>
          {pistes && pistes.length > 0 && (
            <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, marginBottom: 6 }}>
              {pistes.slice(0, 10).map((p, i) => (
                <div key={i} style={{ padding: "3px 0", color: "var(--text-secondary)", display: "flex", gap: 6 }}>
                  <span style={{ color: "#2a9d8f", fontWeight: 700, minWidth: 20 }}>{(i + 1).toString().padStart(2, "0")}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</span>
                </div>
              ))}
              {pistes.length > 10 && <div style={{ opacity: 0.5, padding: "3px 0" }}>… +{pistes.length - 10} autres</div>}
            </div>
          )}
          <button className="attic-node-fichier-btn" style={{ display: "block", width: "100%" }} onClick={ouvrirDansNavigateur}>
            🌐 {t("btn.ouvrir_navigateur")}
          </button>
          <div style={{ fontSize: 10, opacity: 0.55, wordBreak: "break-all", marginTop: 4 }}>{htmlPath}</div>
          {erreur && <div style={{ fontSize: 10, marginTop: 6, color: "#e76f51" }}>{erreur}</div>}
        </>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.5, padding: "4px" }}>{t("export.avantLancer")}</div>
      )}
    </div>
  );
}

// ── VexFlow (aperçu SVG de portée, tablature, grille d'accords) ──
// ── Partition gravée (Verovio) : le SVG est sur la sortie, le message reste lisible ──
export function VueGravure({ data }: VueProps) {
  const { t } = useI18n();
  const svg = typeof data.scriptGenere === "string" ? data.scriptGenere : "";
  if (!svg.includes("<svg")) {
    return <div className="attic-node-vue-gravure" style={{ padding: 4 }}><div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div></div>;
  }
  // La hauteur vient du dessin, pas du nœud : voir `.attic-node-vue-gravure` dans atelier.css. Les
  // classes VexFlow, qu'elle empruntait, exigent un nœud de taille explicite — ce composant n'en a
  // pas, et sa gravure était écrasée à zéro.
  return (
    <div className="attic-node-vue-gravure">
      <div className="attic-node-vue-gravure-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export function VueVexFlow({ data }: VueProps) {
  const { t } = useI18n();
  const svg = data.audioResultatMessage ?? "";
  const isSvg = svg.trim().startsWith("<svg");
  if (!isSvg) {
    return (
      <div className="attic-node-vue-vexflow" style={{ padding: "4px" }}>
        <div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div>
      </div>
    );
  }
  return (
    <div className="attic-node-vue-vexflow">
      <div className="attic-node-vue-vexflow-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

// ── Générateur de pochette (SVG procédural) ──
export function VuePochette({ data }: VueProps) {
  const p = data.parametres ?? {};
  return (
    <PochetteGen
      prompt={String(p["Prompt"] ?? "dark ambient night mysterious")}
      titre={String(p["Titre"] ?? "Album")}
      artiste={String(p["Artiste"] ?? "")}
      style={String(p["Style"] ?? "bauhaus")}
      palette={String(p["Palette"] ?? "auto")}
      complexite={Number(p["Complexité"] ?? 50)}
      bordure={String(p["Bordure"] ?? "non")}
      typographie={String(p["Typographie"] ?? "sans-serif")}
      largeur={Number(p["Largeur"] ?? 512)}
      hauteur={Number(p["Hauteur"] ?? 512)}
      graine={Number(p["Graine"] ?? 0)}
    />
  );
}

// ── Image engendree a partir d'un audio (Songsee, goniometre...) ──
// Le composant est le meme que pour les autres images ; seul le message d'attente change,
// puisque ces noeuds attendent un son et non une image.
export function VueImageDepuisAudio({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.audio")} />;
}

// ── Tracé d'une courbe de modulation ──
// Une sortie image ne s'affiche pas d'elle-même : il faut une vue enregistrée. Celle-ci est celle
// du goniomètre à un mot près — ce nœud attend une courbe, non un son.
export function VueTraceCourbe({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.courbe")} />;
}

// ── Attracteur / IFS (image générée) ──
// ── Une animation SVG posée par le nœud, et qui ne sort pas par un port ──
// ── Le goût d'un son : quatre parts, du plus fort au plus faible ──
const COULEURS_GOUT: Record<string, string> = {
  "sucré": "#e08bb5", "acide": "#c9d94a", "amer": "#8a6f4a", "salé": "#7fb3d5",
};

/** Les quatre barres d'un profil, du plus fort au plus faible. */
function BarresDeGout({ parts }: { parts: { gout: string; part: number }[] }) {
  return (
    <div className="attic-gout">
      {parts.map((p) => (
        <div key={p.gout} className="attic-gout-ligne">
          <span className="attic-gout-nom">{p.gout}</span>
          <span className="attic-gout-barre">
            <span style={{ width: `${Math.round(p.part * 100)}%`, background: COULEURS_GOUT[p.gout] ?? "var(--text-muted)" }} />
          </span>
          <span className="attic-gout-part">{Math.round(p.part * 100)} %</span>
        </div>
      ))}
    </div>
  );
}

const partsAffichees = (data: DonneesNoeud): { gout: string; part: number }[] => {
  const brut = (data as { _affichage?: { profilGout?: unknown } })._affichage?.profilGout;
  return Array.isArray(brut) ? (brut as { gout: string; part: number }[]) : [];
};

export function VueGout({ data }: VueProps) {
  const { t } = useI18n();
  const parts = partsAffichees(data);
  if (!parts.length) {
    return <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>;
  }
  return <BarresDeGout parts={parts} />;
}

/**
 * L'accord mets-musique montre DEUX profils, et c'est l'écart entre eux qui est le sujet.
 *
 * LE PREMIER SUIT LES CURSEURS, SANS LANCEMENT. Il se lit dans les réglages, les parts d'une
 * dégustation n'étant qu'une division : rien n'a besoin d'être rendu pour le connaître. Relevé par
 * Fabien, « faire varier les paramètres dans l'inspecteur ne modifie pas le graphique du nœud » :
 * la vue ne montrait que le second, qui vient d'une mesure sur la musique rendue et que tout
 * changement de réglage efface, à juste titre. Le graphique portait les quatre noms qu'on venait de
 * régler et ne bougeait pas.
 *
 * LE SECOND RESTE CE QU'IL ÉTAIT : le profil de goût MESURÉ sur la musique produite, qui n'existe
 * qu'après un rendu. Les deux diffèrent nettement, et c'est le propos du composant : relevé sur une
 * dégustation 70/30/10/0, la musique se mesure à 91 % sucrée. Les afficher ensemble montre ce que
 * le plan écrit disait déjà en deux tableaux.
 */
export function VueAccordMets({ data, def }: VueProps) {
  const { t } = useI18n();
  const p = (data.parametres ?? {}) as Record<string, number | string>;
  // LE DÉFAUT VIENT DE LA FICHE, et non d'un zéro écrit ici. Un projet enregistré avant qu'un
  // réglage n'existe ne le porte pas, et l'exécuteur prendrait alors le défaut déclaré : lire zéro
  // montrerait une dégustation que le composant ne jouerait pas.
  const nombre = (nom: string) => {
    const brut = p[nom] ?? def?.parametres?.find((x) => x.nom === nom)?.defaut;
    return Number(brut ?? 0) || 0;
  };
  const degustation = partsDeDegustation({
    "sucré": nombre("Sucré"), acide: nombre("Acide"), amer: nombre("Amer"), "salé": nombre("Salé"),
  });
  const mesure = partsAffichees(data);
  return (
    <div className="attic-gout-double">
      <div className="attic-gout-titre">{t("gout.degustation")}</div>
      {degustation.length
        ? <BarresDeGout parts={degustation} />
        : <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("gout.aucune")}</div>}
      <div className="attic-gout-titre">{t("gout.mesure")}</div>
      {mesure.length
        ? <BarresDeGout parts={mesure} />
        : <div className="attic-node-fichier-nom" style={{ opacity: 0.5 }}>{t("export.avantLancer")}</div>}
    </div>
  );
}

/**
 * L'écart au-delà duquel on recale l'image sur le son, en secondes.
 *
 * DEUX HORLOGES, ET ELLES DÉRIVENT. Le temps de SMIL et celui du lecteur audio avancent
 * séparément ; sur une pièce longue, quelques dizaines de millisecondes finissent par se voir. Un
 * recalage à CHAQUE battement de `timeupdate` se verrait davantage : une image qui saute en
 * arrière de trois millisecondes est un à-coup. On ne recale donc que ce qui se remarque, et le
 * seuil est sous la durée d'une image à soixante par seconde multipliée par cinq.
 */
const DERIVE_TOLEREE = 0.08;

/**
 * L'animation cale son temps sur celui du lecteur.
 *
 * LE DÉFAUT QUE CECI CORRIGE, relevé par Fabien : « décalage du son et du visuel ». Une animation
 * SMIL part dès qu'elle est posée dans la page et tourne en boucle, sans aucun rapport avec
 * l'instant où l'on appuie sur lecture : quand le son commence, l'image en est où elle en est. Les
 * deux décrivent pourtant la même suite de pulsations, et c'est tout l'objet du composant qu'elles
 * tombent ensemble.
 *
 * L'IMAGE N'EST JAMAIS ARRÊTÉE AVANT LA PREMIÈRE LECTURE, et c'est délibéré. On ne touche à son
 * horloge qu'à partir du moment où quelqu'un appuie sur lecture : tant que personne ne l'a fait,
 * elle tourne exactement comme avant. Le pire cas de ce code est donc le comportement d'origine,
 * et non une image figée. L'arrêter d'emblée aurait été plus simple à écrire et bien plus risqué :
 * il aurait suffi qu'un lecteur n'émette pas son événement pour que le dessin ne reparte jamais.
 */
function useImageCaleeSurLeSon() {
  const boite = useRef<HTMLDivElement | null>(null);

  // LE LECTEUR EST UN ÉTAT ET NON UNE RÉFÉRENCE, ET C'EST LA PREMIÈRE DES DEUX RAISONS QUI FAISAIENT
  // MANQUER LE CALAGE. Une référence ne prévient personne quand elle change : l'effet ci-dessous
  // attend le dessin ET le lecteur, et ne déclarait que le dessin. Le dessin arrivant le premier,
  // l'effet se rejouait sur lui, ne trouvait pas encore de lecteur, renonçait — et ne se rejouait
  // plus jamais, puisque le dessin ne changeait plus. RELEVÉ À LA TRACE : « dessin vrai, son faux »
  // était la dernière exécution de l'effet. En état, l'arrivée du lecteur est un rendu de plus, et
  // l'effet le voit.
  const [son, setSon] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!son) return;

    // ET LE DESSIN EST CHERCHÉ À CHAQUE FOIS PLUTÔT QUE GARDÉ, ce qui est la seconde raison. React
    // refait le contenu du cadre quand le nœud se redessine ; un élément gardé ici devient alors
    // DÉTACHÉ, et l'on cale consciencieusement l'horloge d'un SVG qui n'est plus dans la page
    // pendant que celui qu'on voit tourne librement. MESURÉ : l'élément capturé n'était plus dans
    // le document, et l'image dérivait d'une seconde du son.
    //
    // `pauseAnimations` n'existe que sur un SVG vivant : un environnement sans SMIL laisse
    // l'animation tourner comme avant plutôt que d'échouer.
    const dessin = (): SVGSVGElement | null => {
      const d = boite.current?.querySelector("svg") as SVGSVGElement | null;
      return d && typeof d.pauseAnimations === "function" ? d : null;
    };

    const caler = () => {
      const d = dessin();
      if (d) try { d.setCurrentTime(son.currentTime); } catch { /* horloge absente */ }
    };
    const jouer = () => { caler(); dessin()?.unpauseAnimations(); };
    const arreter = () => { dessin()?.pauseAnimations(); caler(); };
    const finir = () => {
      const d = dessin();
      if (!d) return;
      try { d.setCurrentTime(0); } catch { /* idem */ }
      d.unpauseAnimations();
    };
    const suivre = () => {
      const d = dessin();
      if (!d || son.paused) return;
      try {
        if (Math.abs(d.getCurrentTime() - son.currentTime) > DERIVE_TOLEREE) caler();
      } catch { /* horloge absente */ }
    };

    son.addEventListener("play", jouer);
    son.addEventListener("playing", jouer);
    son.addEventListener("pause", arreter);
    son.addEventListener("seeked", caler);
    son.addEventListener("ended", finir);
    son.addEventListener("timeupdate", suivre);
    return () => {
      son.removeEventListener("play", jouer);
      son.removeEventListener("playing", jouer);
      son.removeEventListener("pause", arreter);
      son.removeEventListener("seeked", caler);
      son.removeEventListener("ended", finir);
      son.removeEventListener("timeupdate", suivre);
    };
  }, [son]);

  return { boite, poserLecteur: setSon };
}

export function VueAnimationSvg({ data }: VueProps) {
  const { t } = useI18n();
  const dessine = (data as { _affichage?: { animationSvg?: unknown } })._affichage?.animationSvg;
  const svg = typeof dessine === "string" ? dessine : "";
  const { boite, poserLecteur } = useImageCaleeSurLeSon();
  if (!svg.includes("<svg")) {
    return <div className="attic-node-vue-animation" style={{ padding: 4 }}><div style={{ fontSize: 11, opacity: 0.5 }}>{t("export.avantLancer")}</div></div>;
  }
  // L'animation est écrite en SMIL : posée telle quelle dans la page, elle tourne.
  //
  // SA HAUTEUR EST SA LARGEUR, et ne se déduit d'aucun ancêtre : voir `.attic-node-vue-animation`
  // dans atelier.css. Ces classes-là ne sont pas celles des nœuds VexFlow, qu'elle empruntait et
  // dont la chaîne de hauteur exige un nœud de taille explicite — d'où une vue écrasée à zéro.
  //
  // LE LECTEUR EST POSÉ ICI, ET NON PAR LE NŒUD. Une vue « avant » masque le lecteur générique, au
  // motif qu'elle porte elle-même l'audio ; celle-ci ne montrait que l'image, et le son sorti par le
  // composant restait inaudible sans le brancher ailleurs. L'image et la mélodie étant la même
  // suite de pulsations, elles s'écoutent au même endroit.
  return (
    <div className="attic-node-vue-animation">
      <div ref={boite} className="attic-node-vue-animation-inner" dangerouslySetInnerHTML={{ __html: svg }} />
      {typeof data.audioResultatUrl === "string" && (
        <LecteurAudio
          key={data.audioResultatUrl}
          src={data.audioResultatUrl}
          style={{ flex: "0 0 auto", marginTop: 4 }}
          elementRef={poserLecteur}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

export function VueAttracteurIFS({ data }: VueProps) {
  const { t } = useI18n();
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={t("msg.connecter.image")} />;
}

// ── Rendu image (affiche une image reçue) ──
export function VueRenduImage({ data, def }: VueProps) {
  const { t } = useI18n();
  const pasDeMessage = def?.id === "entree-image" || def?.id === "lecteur-svg" || def?.id === "texte-image";
  return <SongseeVue fichier={data.imageResultatFile as File | undefined} url={data.imageResultatUrl as string | undefined} message={pasDeMessage ? "" : t("msg.connecter.image")} />;
}

// ── ColorSynth (spectre → palette de couleurs) ──
export function VueColorSynth({ data }: VueProps) {
  return <ColorSynth audioUrl={data.audioResultatUrl} />;
}

// ── VU-mètre / LUFS (bargraphes de niveau) ──
// ── Score et comparaison esthétiques ──
// LE GARDE SUR LE STATUT A ÉTÉ RETIRÉ, et il rendait ces deux vues muettes. Il existait parce que
// le champ survivait à une remise à zéro, « une courbe périmée affichée à côté d'un nœud en attente
// se lirait comme le résultat courant » ; mais `data.statut` n'est jamais passé à « termine » depuis
// que les statuts vivent dans leur magasin, et la condition était donc toujours fausse. Le canal
// déclaré efface vraiment ce qu'un run a produit : il n'y a plus rien à contourner.
export function VueEsthetique({ data }: VueProps) {
  const d = data as { _affichage?: { analyse?: any } };
  return d._affichage?.analyse ? <VueScoreEsthetique analyse={d._affichage.analyse} /> : null;
}
export function VueComparaisonEsth({ data }: VueProps) {
  const d = data as { _affichage?: { a?: any; b?: any } };
  return d._affichage?.a ? <VueComparaisonEsthetique a={d._affichage.a} b={d._affichage.b} /> : null;
}

export function VueVuMetre({ data }: VueProps) {
  return <VuMetre audioUrl={data.audioResultatUrl} />;
}

// ── Source de texte (zone de texte éditable et redimensionnable) ──
