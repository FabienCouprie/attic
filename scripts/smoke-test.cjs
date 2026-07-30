// scripts/smoke-test.cjs — Vérifications avant build / release.
// Ce script est intentionnellement simple : il lance les tests, le typage et le
// lint, puis affiche les fichiers critiques modifiés pour forcer une relecture.

const { execSync } = require("child_process");
const path = require("path");

const CRITICAL_PATHS = [
  "src/ui/hooks/useExecutionGraphe.ts",
  "src/ui/App.tsx",
  "src/core/types.ts",
  "src/i18n.tsx",
  "src/plugins/montage.ts",
  "src/plugins/effets.ts",
  "src/plugins/generateurs.ts",
  "src/plugins/pixeltone.ts",
  "src/plugins/pure-data.ts",
  "src/plugins/visualisation.ts",
  "src/ui/Inspector.tsx",
];

const root = path.resolve(__dirname, "..");

function run(cmd, args) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  try {
    execSync(`${cmd} ${args.join(" ")}`, { stdio: "inherit", cwd: root });
  } catch {
    process.exit(1);
  }
}

run("npm", ["run", "lint"]);
run("npx", ["tsc", "--noEmit"]);
run("npm", ["run", "test"]);

console.log("\n✅ Lint, typage et tests passent.");

// Fichiers modifiés non commités
try {
  const modified = execSync("git diff --name-only", { cwd: path.resolve(__dirname, ".."), encoding: "utf8" }).trim();
  const modifiedFiles = modified ? modified.split("\n") : [];
  const criticalTouched = modifiedFiles.filter((f) => CRITICAL_PATHS.includes(f));
  if (criticalTouched.length > 0) {
    console.warn("\n⚠️  Fichiers critiques modifiés depuis le dernier commit :");
    for (const f of criticalTouched) console.warn(`   - ${f}`);
    console.warn("   Penser à faire une QA manuelle sur les chaînes audio / zones / paramètres de choix.");
  } else {
    console.log("\n✅ Aucun fichier critique modifié depuis le dernier commit.");
  }
} catch {
  // Pas de repo git ou git non disponible — on ignore silencieusement.
}

console.log("\n🚀 Prêt pour le build.");
