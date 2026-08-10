// plugins/extraction-pdf.ts — Nœud « Extraction PDF » : extrait le texte
// intégré d'un PDF (pas de reconnaissance optique — le texte doit déjà être
// numérique dans le fichier), dans le même esprit que le nœud OCR mais pour
// les documents plutôt que les images. Moteur : pdf-inspector (Rust/WASM,
// https://github.com/firecrawl/pdf-inspector), 100% local, aucun envoi réseau.
// Détecte aussi si le PDF est scanné/image (donc sans texte récupérable) et
// le signale clairement plutôt que de renvoyer silencieusement un texte vide
// — ce nœud n'inclut PAS d'OCR de repli : un PDF scanné doit être rasterisé
// puis passé au nœud OCR séparément (hors scope ici).
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let initPromise: Promise<typeof import("@firecrawl/pdf-inspector-wasm")> | null = null;

// Le WASM n'est initialisé qu'une fois (coût non négligeable), pas à chaque
// exécution du nœud — mêmes bénéfices que le worker Tesseract d'OCR, mais un
// module WASM se prête à un singleton simple plutôt qu'un worker par run.
async function moduleWasm() {
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("@firecrawl/pdf-inspector-wasm");
      await mod.default();
      return mod;
    })();
  }
  return initPromise;
}

const extractionPdfPlugins: FicheAudio[] = [
  {
    id: "extraction-pdf",
    nom: "Extraction PDF",
    nomEn: "PDF Extraction",
    univers: "Traitement",
    famille: "Texte",
    resume: "Extrait le texte déjà numérique d'un PDF (pas d'OCR) — détecte aussi les PDF scannés/image sans texte récupérable.",
    resumeEn: "Extracts already-digital text from a PDF (no OCR) — also detects scanned/image PDFs with no recoverable text.",
    entrees: [{ nom: "Fichier PDF", nomEn: "PDF file", type: "fichier", requis: true }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Format", nomEn: "Format", type: "choix",
        options: ["Texte brut", "Markdown"], optionsEn: ["Plain text", "Markdown"],
        optionIds: ["brut", "markdown"], defaut: "Texte brut", defautEn: "Plain text",
        doc: "Texte brut : contenu seul. Markdown : titres, listes et tableaux reconstruits depuis la mise en page du PDF.",
        docEn: "Plain text: content only. Markdown: headings, lists and tables reconstructed from the PDF's layout.",
      },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0) as File | null;
      if (!(fichier instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter_fichier_pdf") };
      }
      try {
        const mod = await moduleWasm();
        const octets = new Uint8Array(await fichier.arrayBuffer());
        const resultat = mod.processPdf(octets);

        const formatId = ctx.paramTexte("Format", "Texte brut");
        const markdown = formatId === "markdown" || formatId === "Markdown";
        const texte = markdown ? (resultat.markdown ?? "") : mod.extractText(octets);

        // `pagesNeedingOcr` s'est révélé signaler des pages même quand du
        // texte EST bien extrait (heuristique de la lib plus conservatrice
        // que la seule présence de Tj/TJ) — se fier d'abord au texte
        // réellement obtenu, pas seulement à ce signal, pour ne pas afficher
        // « nécessite l'OCR » sur un résultat qui a pourtant réussi.
        const pagesOcr = resultat.pagesNeedingOcr ?? [];
        let messageType: string;
        if (texte.trim().length === 0) {
          messageType = resultat.pdfType === "Scanned" || resultat.pdfType === "ImageBased"
            ? traduire("msg.pdf_scanne_sans_texte")
            : traduire("msg.pdf_pages_sans_texte_var_0_var_1", pagesOcr.length || resultat.pageCount, resultat.pageCount);
        } else {
          messageType = traduire("msg.pdf_texte_extrait_var_0", resultat.pageCount);
        }

        return {
          valeurs: [texte],
          message: `${texte.length ? `${texte.length} caractères` : traduire("msg.pdf_vide")} — ${messageType}`,
        };
      } catch (e: any) {
        console.error("[extraction-pdf]", e);
        const detail = e?.message || String(e);
        return { valeurs: [null], erreur: true, message: `${traduire("msg.pdf_erreur")} ${detail}` };
      }
    },
  },
];

export const fiches: FicheAudio[] = extractionPdfPlugins.map(avecDoc) as FicheAudio[];
