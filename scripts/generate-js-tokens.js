#!/usr/bin/env node

/**
 * Generate JS/TS Token Exports
 *
 * Reads tokens.json and produces structured JavaScript objects
 * mirroring the CSS custom property values. Outputs:
 *   dist/index.mjs   — ES module
 *   dist/index.cjs   — CommonJS module
 *   dist/index.d.ts  — TypeScript declarations
 *
 * Exported names and shapes:
 *   colors     — { ntg, central, status } — primitive palette + status colours
 *   spacing    — { xxs, xs, sm, md, lg, xl, xxl, xxxl } — values in px
 *   typography — keyed by category → variant → property (size, weight, lineHeight, …)
 *   shadows    — { sm, sm-top, md, md-top, lg, lg-top, lg-right, focus-ntg, focus-central }
 *   borders    — { widths: { sm–xxl }, radii: { none, button, sm, md, lg } }
 *   grid       — { xs-575, sm-767, md-991, lg-1199, xl-1200 } — breakpoint configs
 *
 * Usage:
 *   node scripts/generate-js-tokens.js
 *   npm run build:js
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

console.log("⚡ Generating JS/TS token exports...\n");

// ---------------------------------------------------------------------------
// Load tokens.json
// ---------------------------------------------------------------------------
const tokensPath = join(rootDir, "tokens.json");
const tokens = JSON.parse(readFileSync(tokensPath, "utf-8"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip fully-opaque alpha from 8-char hex (#rrggbbff → #rrggbb). */
function normalizeColor(value) {
  if (typeof value !== "string") return value;
  if (/^#[0-9a-fA-F]{8}$/.test(value)) {
    const alpha = value.slice(-2).toLowerCase();
    if (alpha === "ff") return value.slice(0, 7);
  }
  return value;
}

/** Convert px dimension to rem (≥16px) or keep as px (<16px). */
function normalizeDimension(value) {
  if (typeof value !== "string") return value;
  const match = value.match(/^([\d.]+)px$/);
  if (!match) return value;
  const px = parseFloat(match[1]);
  if (px === 0) return "0px";
  return px >= 16 ? `${px / 16}rem` : `${px}px`;
}

/** Resolve a token reference like "{themes.ntg.bg.default}" to its value. */
function resolveReference(ref, obj) {
  if (typeof ref !== "string") return ref;
  const match = ref.match(/^\{(.+)\}$/);
  if (!match) return ref;
  const parts = match[1].split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return ref;
    current = current[part];
  }
  if (current && typeof current === "object" && "value" in current) {
    return resolveReference(current.value, obj);
  }
  return current ?? ref;
}

// ---------------------------------------------------------------------------
// Extract colors
// ---------------------------------------------------------------------------
function extractColors() {
  const result = { ntg: {}, central: {}, status: {} };

  // Primitive NTG colors
  const ntgPrimitives = tokens.primitives?.ntg ?? {};
  for (const [group, shades] of Object.entries(ntgPrimitives)) {
    if (typeof shades !== "object") continue;
    result.ntg[group] = {};
    for (const [shade, token] of Object.entries(shades)) {
      const raw = token?.value ?? token;
      result.ntg[group][shade] = normalizeColor(
        typeof raw === "string" ? raw : String(raw),
      );
    }
  }

  // Primitive Central colors
  const centralPrimitives = tokens.primitives?.central ?? {};
  for (const [group, shades] of Object.entries(centralPrimitives)) {
    if (typeof shades !== "object") continue;
    result.central[group] = {};
    for (const [shade, token] of Object.entries(shades)) {
      const raw = token?.value ?? token;
      result.central[group][shade] = normalizeColor(
        typeof raw === "string" ? raw : String(raw),
      );
    }
  }

  // Status colors (shared)
  for (const status of ["info", "success", "warning", "danger"]) {
    const statusTokens = tokens.primitives?.[status];
    if (!statusTokens) continue;
    result.status[status] = {};
    for (const [key, token] of Object.entries(statusTokens)) {
      if (typeof token !== "object") continue;
      const raw = token?.value ?? token;
      result.status[status][key] = normalizeColor(
        typeof raw === "string"
          ? raw
          : resolveReference(raw, tokens) ?? String(raw),
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extract spacing
// ---------------------------------------------------------------------------
function extractSpacing() {
  const result = {};
  // Spacing lives under themes.ntg.sp, generates CSS vars --sp-<key>
  const spData = tokens.themes?.ntg?.sp ?? {};
  for (const [key, token] of Object.entries(spData)) {
    if (typeof token !== "object") continue;
    const raw = token?.value ?? token;
    // Spacing values are stored as bare numbers (px) in tokens.json
    result[key] = typeof raw === "number" ? `${raw}px` : normalizeDimension(String(raw));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extract shadows
// ---------------------------------------------------------------------------
function extractShadows() {
  const result = {};
  const shadowData = tokens.effect?.["ntg-shadow"] ?? {};
  for (const [key, token] of Object.entries(shadowData)) {
    if (typeof token !== "object" || !("value" in token)) continue;
    const val = token.value;
    if (typeof val === "object" && val !== null) {
      const toPx = (v) => typeof v === "number" ? `${v}px` : (v || "0px");
      const offsetX = toPx(val.offsetX);
      const offsetY = toPx(val.offsetY);
      const radius  = toPx(val.radius);
      const spread  = toPx(val.spread);
      const color   = normalizeColor(val.color ?? "#000");
      result[key] = `${offsetX} ${offsetY} ${radius} ${spread} ${color}`;
    } else {
      result[key] = String(val);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extract typography
// ---------------------------------------------------------------------------
function extractTypography() {
  const result = {};
  const fontData = tokens.font?.["ntg-type"] ?? {};
  for (const [category, variants] of Object.entries(fontData)) {
    if (typeof variants !== "object") continue;
    result[category] = {};
    for (const [variant, token] of Object.entries(variants)) {
      if (typeof token !== "object" || !("value" in token)) continue;
      const val = token.value;
      const entry = {};
      if (val.fontSize)   entry.size       = normalizeDimension(val.fontSize);
      if (val.fontWeight) entry.weight     = String(val.fontWeight);
      if (val.lineHeight) entry.lineHeight = normalizeDimension(val.lineHeight);
      if (val.letterSpacing) entry.letterSpacing = normalizeDimension(val.letterSpacing);
      if (val.fontFamily) entry.fontFamily = val.fontFamily;
      if (val.textDecoration && val.textDecoration !== "none") entry.textDecoration = val.textDecoration;
      if (val.textCase && val.textCase !== "none") entry.textTransform = val.textCase;
      result[category][variant] = entry;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extract borders
// ---------------------------------------------------------------------------
function extractBorders() {
  const result = { widths: {}, radii: {} };
  const ntgTheme = tokens.themes?.ntg ?? {};

  // Border widths live under themes.ntg["border-width"], generates CSS vars --border-width-<key>
  const borderWidths = ntgTheme["border-width"] ?? {};
  for (const [key, token] of Object.entries(borderWidths)) {
    if (typeof token !== "object") continue;
    const raw = token?.value ?? token;
    // Values are stored as bare numbers (px) in tokens.json per extractCommonTokens
    result.widths[key] = typeof raw === "number" ? `${raw}px` : normalizeDimension(String(raw));
  }

  // Radii live under themes.ntg.radii, generates CSS vars --radii-<key>
  const radii = ntgTheme.radii ?? {};
  for (const [key, token] of Object.entries(radii)) {
    if (typeof token !== "object") continue;
    const raw = token?.value ?? token;
    if (raw !== undefined) {
      result.radii[key] = typeof raw === "number" ? `${raw}px` : normalizeDimension(String(raw));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extract grid
// ---------------------------------------------------------------------------
function extractGrid() {
  const result = {};
  const gridData = tokens.grid?.["ntg-breakpoint"] ?? {};
  for (const [breakpoint, config] of Object.entries(gridData)) {
    if (typeof config !== "object") continue;
    result[breakpoint] = {};
    for (const [key, token] of Object.entries(config)) {
      if (typeof token !== "object") continue;
      const raw = token?.value ?? token;
      result[breakpoint][key] =
        typeof raw === "string" ? normalizeDimension(raw) : raw;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assemble all tokens
// ---------------------------------------------------------------------------
const colors    = extractColors();
const spacing   = extractSpacing();
const shadows   = extractShadows();
const typography = extractTypography();
const borders   = extractBorders();
const grid      = extractGrid();

const allTokens = { colors, spacing, typography, shadows, borders, grid };

// ---------------------------------------------------------------------------
// Generate output
// ---------------------------------------------------------------------------
mkdirSync(join(rootDir, "dist"), { recursive: true });

// ESM
const esmContent = `// Auto-generated — do not edit manually. Run: npm run build:js
// Source: tokens.json

export const colors = ${JSON.stringify(colors, null, 2)};

export const spacing = ${JSON.stringify(spacing, null, 2)};

export const typography = ${JSON.stringify(typography, null, 2)};

export const shadows = ${JSON.stringify(shadows, null, 2)};

export const borders = ${JSON.stringify(borders, null, 2)};

export const grid = ${JSON.stringify(grid, null, 2)};

export default { colors, spacing, typography, shadows, borders, grid };
`;

// CJS
const cjsContent = `// Auto-generated — do not edit manually. Run: npm run build:js
// Source: tokens.json
'use strict';

const colors = ${JSON.stringify(colors, null, 2)};

const spacing = ${JSON.stringify(spacing, null, 2)};

const typography = ${JSON.stringify(typography, null, 2)};

const shadows = ${JSON.stringify(shadows, null, 2)};

const borders = ${JSON.stringify(borders, null, 2)};

const grid = ${JSON.stringify(grid, null, 2)};

module.exports = { colors, spacing, typography, shadows, borders, grid };
`;

// TypeScript declarations
function buildTypeFromObject(obj, indent = "  ") {
  if (typeof obj !== "object" || obj === null) return "string | number";
  const entries = Object.entries(obj);
  if (entries.length === 0) return "Record<string, never>";
  // Check if all values are primitives
  const allLeaf = entries.every(([, v]) => typeof v !== "object" || v === null);
  if (allLeaf) {
    return `{\n${entries.map(([k]) => `${indent}  "${k}": string;`).join("\n")}\n${indent}}`;
  }
  return `{\n${entries
    .map(([k, v]) => `${indent}  "${k}": ${buildTypeFromObject(v, indent + "  ")};`)
    .join("\n")}\n${indent}}`;
}

const dtsContent = `// Auto-generated — do not edit manually. Run: npm run build:js
// Source: tokens.json

export declare const colors: ${buildTypeFromObject(colors)};

export declare const spacing: { [key: string]: string };

export declare const typography: ${buildTypeFromObject(typography)};

export declare const shadows: { [key: string]: string };

export declare const borders: ${buildTypeFromObject(borders)};

export declare const grid: ${buildTypeFromObject(grid)};

declare const _default: { colors: typeof colors; spacing: typeof spacing; typography: typeof typography; shadows: typeof shadows; borders: typeof borders; grid: typeof grid };
export default _default;
`;

writeFileSync(join(rootDir, "dist/index.mjs"), esmContent, "utf-8");
writeFileSync(join(rootDir, "dist/index.cjs"), cjsContent, "utf-8");
writeFileSync(join(rootDir, "dist/index.d.ts"), dtsContent, "utf-8");

console.log("  ✓ dist/index.mjs (ES module)");
console.log("  ✓ dist/index.cjs (CommonJS module)");
console.log("  ✓ dist/index.d.ts (TypeScript declarations)");
console.log("\n✅ JS/TS token exports generated!\n");
