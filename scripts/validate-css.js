#!/usr/bin/env node

/**
 * CSS Validation Script - Post-build checks for generated CSS
 *
 * Validates all generated CSS files in dist/css/ for:
 *   1. Self-referencing variables (--X: var(--X)) — circular references
 *   2. Undefined var() references (not defined in file or @import chain)
 *   3. Spurious RGB decomposition on non-colour tokens
 *   4. Broken @import paths (file doesn't exist on disk)
 *   5. Duplicate variable definitions within a :root block
 *
 * Reference resolution strategy:
 *   - Files with @import: validate against file + resolved @import chain
 *   - Bundled files (*.bundled.css): self-contained, validate against file only
 *   - Fragment files (no @imports, not bundled): validate against global scope
 *     (all definitions from all CSS files — these are loaded together at runtime)
 *
 * Usage:
 *   node scripts/validate-css.js
 *   npm run validate:css
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more errors found
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const cssDir = join(rootDir, "dist/css");

let totalErrors = 0;
let totalWarnings = 0;
let filesChecked = 0;

/**
 * Strip CSS block comments (/* ... *\/) while preserving line numbers.
 */
function stripComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ""),
  );
}

/**
 * Parse CSS to extract defined variables and var() references.
 * Comments are stripped first to avoid false positives (e.g. @import in headers).
 */
function parseCSS(rawContent) {
  const content = stripComments(rawContent);
  const defined = new Set();
  const references = []; // { ref: string, line: number }
  const imports = [];
  const duplicates = [];

  const lines = content.split("\n");
  let inMediaQuery = false;
  const mediaDefinitions = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track @media blocks (simple heuristic)
    if (line.match(/@media\b/)) {
      inMediaQuery = true;
    }

    // Detect @import statements (only real ones, comments already stripped)
    const importMatch = line.match(/@import\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }

    // Detect variable definitions: --name: value;
    const defMatch = line.match(/^\s*(--[\w-]+)\s*:/);
    if (defMatch) {
      const varName = defMatch[1];
      if (inMediaQuery) {
        // Definitions inside @media are responsive overrides, not duplicates
        mediaDefinitions.add(varName);
      } else if (defined.has(varName)) {
        duplicates.push({ name: varName, line: lineNum });
      }
      defined.add(varName);
    }

    // Detect var() references (can be multiple per line)
    const varRegex = /var\((--[\w-]+)\)/g;
    let refMatch;
    while ((refMatch = varRegex.exec(line)) !== null) {
      references.push({ ref: refMatch[1], line: lineNum });
    }
  }

  return { defined, references, imports, duplicates };
}

/**
 * Resolve all defined variables across a file and its @import chain.
 */
function collectAllDefined(filePath, visited = new Set()) {
  if (visited.has(filePath)) return new Set();
  visited.add(filePath);

  if (!existsSync(filePath)) return new Set();

  const content = readFileSync(filePath, "utf-8");
  const { defined, imports } = parseCSS(content);

  const allDefined = new Set(defined);
  for (const imp of imports) {
    const importPath = resolve(dirname(filePath), imp);
    const importDefined = collectAllDefined(importPath, visited);
    for (const d of importDefined) {
      allDefined.add(d);
    }
  }

  return allDefined;
}

/**
 * Build a global definition set from all CSS files (for fragment file validation).
 */
function buildGlobalDefinitions(cssFiles) {
  const globalDefined = new Set();
  for (const file of cssFiles) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf-8");
    const { defined } = parseCSS(content);
    for (const d of defined) {
      globalDefined.add(d);
    }
  }
  return globalDefined;
}

/**
 * Validate a single CSS file.
 */
function validateFile(filePath, globalDefined) {
  const relPath = filePath
    .replace(rootDir + "\\", "")
    .replace(rootDir + "/", "");
  const fileName = basename(filePath);
  const isBundled = fileName.endsWith(".bundled.css");

  if (!existsSync(filePath)) {
    console.error(`  ❌ File not found: ${relPath}`);
    totalErrors++;
    return;
  }

  const rawContent = readFileSync(filePath, "utf-8");
  const { defined, references, imports, duplicates } = parseCSS(rawContent);
  let fileErrors = 0;
  let fileWarnings = 0;

  // Check 1: Self-referencing variables
  const strippedLines = stripComments(rawContent).split("\n");
  for (let i = 0; i < strippedLines.length; i++) {
    const line = strippedLines[i];
    const selfRefMatch = line.match(
      /^\s*(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/,
    );
    if (selfRefMatch && selfRefMatch[1] === selfRefMatch[2]) {
      console.error(
        `  ❌ Self-reference: ${selfRefMatch[1]}: var(${selfRefMatch[2]}) [${relPath}:${i + 1}]`,
      );
      fileErrors++;
    }
  }

  // Check 2: Broken @import paths
  for (const imp of imports) {
    const importPath = resolve(dirname(filePath), imp);
    if (!existsSync(importPath)) {
      console.error(`  ❌ Broken @import: '${imp}' [${relPath}]`);
      fileErrors++;
    }
  }

  // Check 3: Undefined var() references
  // Resolution strategy depends on file type:
  //   - Files with @imports: file + @import chain
  //   - Bundled files: file only (self-contained)
  //   - Fragment files (no @imports, not bundled): global scope
  let resolutionScope;
  if (imports.length > 0) {
    resolutionScope = collectAllDefined(filePath);
  } else if (isBundled) {
    resolutionScope = defined;
  } else {
    resolutionScope = globalDefined;
  }

  for (const { ref, line } of references) {
    if (!resolutionScope.has(ref)) {
      // Exclude references to --bs-* (Bootstrap), --literal-* (separate layer)
      if (ref.startsWith("--bs-") || ref.startsWith("--literal-")) continue;
      console.error(
        `  ❌ Undefined reference: var(${ref}) [${relPath}:${line}]`,
      );
      fileErrors++;
    }
  }

  // Check 4: Spurious RGB decomposition on non-colour tokens
  for (const name of defined) {
    if (
      (name.endsWith("-r") ||
        name.endsWith("-g") ||
        name.endsWith("-b") ||
        name.endsWith("-rgb")) &&
      !name.includes("clr-") &&
      !isPrimitiveColour(name, rawContent)
    ) {
      const base = name.replace(/-(r|g|b|rgb)$/, "");
      if (
        base.includes("type-") ||
        base.includes("radii-") ||
        base.includes("sp-") ||
        base.includes("border-width-") ||
        base.includes("shadow-")
      ) {
        console.error(
          `  ❌ Spurious RGB decomposition on non-colour token: ${name} [${relPath}]`,
        );
        fileErrors++;
      }
    }
  }

  // Check 5: Duplicate definitions
  // Skip for bundled files (they merge multiple layers, duplicates are expected)
  if (!isBundled) {
    for (const { name, line } of duplicates) {
      const lineContent = strippedLines[line - 1] || "";
      if (lineContent.includes("@deprecated")) continue;
      console.warn(`  ⚠ Duplicate definition: ${name} [${relPath}:${line}]`);
      fileWarnings++;
    }
  }

  totalErrors += fileErrors;
  totalWarnings += fileWarnings;
  filesChecked++;

  if (fileErrors === 0 && fileWarnings === 0) {
    console.log(
      `  ✓ ${relPath} (${defined.size} vars, ${references.length} refs)`,
    );
  }
}

/**
 * Check if a variable name corresponds to a primitive colour (hex value).
 */
function isPrimitiveColour(name, content) {
  const base = name.replace(/-(r|g|b|rgb)$/, "");
  const regex = new RegExp(
    `${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*#[0-9a-f]{6}`,
    "i",
  );
  return regex.test(content);
}

// --- Main ---

console.log("🔍 Validating generated CSS files...\n");

if (!existsSync(cssDir)) {
  console.error(
    "❌ dist/css/ directory not found. Run `npm run tokens:build` first.",
  );
  process.exit(1);
}

function findCSSFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findCSSFiles(full));
    } else if (entry.endsWith(".css")) {
      files.push(full);
    }
  }
  return files;
}

const cssFiles = findCSSFiles(cssDir);
console.log(`Found ${cssFiles.length} CSS files to validate.\n`);

// Build global definition set for fragment file validation
const globalDefined = buildGlobalDefinitions(cssFiles);

for (const file of cssFiles) {
  validateFile(file, globalDefined);
}

console.log(`\n📊 Validation summary:`);
console.log(`   Files checked: ${filesChecked}`);
console.log(`   Errors: ${totalErrors}`);
console.log(`   Warnings: ${totalWarnings}`);

if (totalErrors > 0) {
  console.error(`\n❌ CSS validation failed with ${totalErrors} error(s).`);
  process.exit(1);
} else {
  console.log("\n✅ CSS validation passed.");
  process.exit(0);
}
