// plugins/extraction-pdf.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fiches } from "./extraction-pdf";

// Le glue code wasm-bindgen du plugin appelle `fetch(new URL(..., import.meta.url))`
// pour charger le binaire .wasm — un vrai navigateur (Electron, Vite dev)
// sait faire un fetch sur une URL locale, mais le fetch de Node (Vitest) ne
// supporte pas encore le schéma file:// ("not implemented... yet..."). Ce
// test-ci contourne UNIQUEMENT dans l'environnement de test (le code du
// plugin lui-même n'est pas touché) en lisant le .wasm depuis le disque pour
// les URL file://, et en laissant passer le reste tel quel.
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  if (typeof url === "string" && url.startsWith("file://")) {
    const octets = readFileSync(fileURLToPath(url));
    return new Response(octets, { status: 200, headers: { "Content-Type": "application/wasm" } });
  }
  return fetchOriginal(input, init);
}) as typeof fetch;

// PDF minimal mais valide (table xref avec offsets exacts) — lopdf (moteur de
// pdf-inspector) rejette un xref absent ou faux comme "Invalid PDF structure".
function construirePdf(texte: string, taillePolice = 18): Uint8Array {
  const objets: string[] = [];
  objets.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objets.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objets.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 200 100] /Contents 5 0 R >>\nendobj\n");
  objets.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  const stream = `BT /F1 ${taillePolice} Tf 10 50 Td (${texte}) Tj ET`;
  objets.push(`5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

  const header = "%PDF-1.4\n";
  let corps = header;
  const offsets: number[] = [0];
  for (const o of objets) {
    offsets.push(corps.length);
    corps += o;
  }
  const xrefDebut = corps.length;
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objets.length; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  const trailer = `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefDebut}\n%%EOF`;
  return new TextEncoder().encode(corps + xref + trailer);
}

function construirePdfScanne(): Uint8Array {
  // Une page au flux de contenu vide (aucun opérateur Tj/TJ) — imite un PDF
  // scanné (aucun texte numérique) sans construire un vrai XObject image, qui
  // s'est avéré déclencher un panic interne à pdf-inspector (bug de la lib
  // sur une image dégénérée 1×1, hors sujet ici : seul le signal "page sans
  // texte" nous intéresse pour ce test).
  const objets: string[] = [];
  objets.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objets.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objets.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 200 100] /Contents 4 0 R >>\nendobj\n");
  const stream = "";
  objets.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

  const header = "%PDF-1.4\n";
  let corps = header;
  const offsets: number[] = [0];
  for (const o of objets) {
    offsets.push(corps.length);
    corps += o;
  }
  const xrefDebut = corps.length;
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objets.length; i++) {
    xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  const trailer = `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefDebut}\n%%EOF`;
  return new TextEncoder().encode(corps + xref + trailer);
}

function fichierPdf(octets: Uint8Array, nom = "document.pdf"): File {
  return new File([octets as BlobPart], nom, { type: "application/pdf" });
}

const fiche = fiches.find((f) => f.id === "extraction-pdf")!;

function ctxDe(entree: File | null, params: Record<string, string> = {}) {
  return {
    entree: () => entree,
    paramTexte: (nom: string, defaut: string) => params[nom] ?? defaut,
    onProgress: () => {},
  };
}

describe("extraction-pdf (executer)", () => {
  it("extrait le texte numérique d'un PDF simple (format brut par défaut)", async () => {
    const octets = construirePdf("Hello Attic PDF extraction");
    const res = await fiche.executer(ctxDe(fichierPdf(octets)) as any);
    expect(res.erreur).toBeUndefined();
    expect(res.valeurs[0]).toContain("Hello Attic PDF extraction");
    expect(res.message).toContain("caractères");
  }, 15000);

  it("format Markdown : reconstruit une mise en forme (ex. titre) depuis la police", async () => {
    const octets = construirePdf("Titre du document", 24);
    const res = await fiche.executer(ctxDe(fichierPdf(octets), { Format: "Markdown" }) as any);
    expect(res.erreur).toBeUndefined();
    const texte = res.valeurs[0] as string;
    expect(texte).toContain("Titre du document");
    expect(texte).toMatch(/^#+\s/m); // au moins un titre Markdown détecté
  }, 15000);

  it("signale clairement un PDF sans texte numérique (scanné/image) plutôt que de retourner un texte vide silencieux", async () => {
    const octets = construirePdfScanne();
    const res = await fiche.executer(ctxDe(fichierPdf(octets)) as any);
    expect(res.erreur).toBeUndefined();
    expect(res.message?.toLowerCase()).toMatch(/scann|ocr/);
  }, 15000);

  it("message clair si l'entrée n'est pas un fichier", async () => {
    const res = await fiche.executer(ctxDe(null) as any);
    expect(res.valeurs).toEqual([null]);
    expect(res.message).toBeTruthy();
  });

  it("erreur claire (pas de plantage) sur un PDF invalide", async () => {
    const res = await fiche.executer(ctxDe(fichierPdf(new TextEncoder().encode("pas un pdf"))) as any);
    expect(res.erreur).toBe(true);
    expect(res.message).toBeTruthy();
  }, 15000);
});
