#!/usr/bin/env node

/**
 * Build Design Tokens - Custom CSS Generation System
 *
 * Transforms design tokens from Figma (JSON format) into a layered CSS custom property architecture.
 *
 * LAYERED ARCHITECTURE:
 *   1. common.css - Shared tokens (shadows, spacing, borders, radii)
 *   2. grid.css - Bootstrap-compatible grid configuration
 *   3. typography.css - Theme-agnostic typography (excludes fontFamily)
 *   4. theme-ntg.css - NT.GOV.AU theme (Lato font, ochre accent)
 *   5. theme-central.css - NTG Central theme (Roboto font, green accent)
 *
 * PROPERTY MAPPINGS (tokens.json → CSS variables):
 *   fontSize → -size
 *   fontWeight → -weight
 *   lineHeight → -lh
 *   letterSpacing → -ls
 *   textDecoration → -decoration
 *   textCase → -text-transform
 *   paragraphSpacing → -paragraph-spacing
 *   fontStyle → -style
 *
 * KEY FEATURES:
 *   - Zero duplication: Typography values shared via typography.css
 *   - Variable references: Themes use var() to reference shared values
 *   - Post-processing: Automatically generates missing property references
 *   - Complete coverage: All 7 typography properties properly handled
 *
 * DEBUGGING:
 *   - Missing properties? Check extractTypographyTokens() extracts that property
 *   - Wrong type conversion? Check processDimension(), processShadow(), processColor()
 *   - Duplicate prefixes? Check resolveReference() logic
 *   - Missing theme references? Check generateCSS() post-processing logic
 *
 * Usage:
 *   node scripts/build-tokens.js
 *   npm run tokens:build
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
mkdirSync(join(rootDir, "css"), { recursive: true });

console.log("🎨 Building Design Tokens...\n");

// Check if tokens.json exists
const tokensPath = join(rootDir, "tokens.json");
if (!existsSync(tokensPath)) {
  console.error("❌ Error: tokens.json not found!");
  console.error(
    "   Please export design tokens from Figma and place the file at:",
  );
  console.error("   tokens.json\n");
  process.exit(1);
}

// Load and validate tokens
let tokens;
try {
  const tokensContent = readFileSync(tokensPath, "utf-8");
  tokens = JSON.parse(tokensContent);
  console.log("✓ Loaded and validated tokens.json");
} catch (error) {
  console.error("❌ Error: Invalid JSON in tokens.json");
  console.error(`   ${error.message}\n`);
  process.exit(1);
}

// Helper to process color values (remove alpha if fully opaque)
function processColor(value) {
  if (typeof value === "string" && value.match(/^#[0-9a-f]{8}$/i)) {
    return value.slice(0, 7);
  }
  return value;
}

// Helper to convert hex color to RGB triplet
function hexToRgb(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, "");

  // Handle 8-digit hex (with alpha)
  if (hex.length === 8) {
    hex = hex.slice(0, 6);
  }

  // Parse RGB components
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return { r, g, b, triplet: `${r}, ${g}, ${b}` };
}

// Helper to resolve color variable references to final hex value
function resolveColorValue(tokenPath, themeData) {
  const parts = tokenPath.split(".");
  let current = themeData;

  // Navigate through the token path
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }

  // If we found a token object, get its value
  if (current && typeof current === "object" && current.value !== undefined) {
    let value = current.value;

    // If it's a reference, resolve it recursively
    if (
      typeof value === "string" &&
      value.startsWith("{") &&
      value.endsWith("}")
    ) {
      // Remove braces and clean up the reference
      const ref = value
        .slice(1, -1)
        .replace(/^primitives\.(ntg|central)\./, "") // Remove primitives.ntg. or primitives.central.
        .replace(/\s*\(d\)/g, "-d") // Convert (d) to -d
        .replace(/\s+d$/g, "-d") // Convert " d" at end to -d
        .replace(/\s+/g, "."); // Replace remaining spaces with dot for navigation
      return resolveColorValue(ref, themeData);
    }

    // Return the final color value
    return processColor(value);
  }

  return null;
}

// Helper to process dimension values
// category: 'typography' (uses rem for accessibility) or 'layout' (uses exact pixels)
function processDimension(value, category = "layout") {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  // Typography uses rem for accessibility (scales with user preferences)
  if (category === "typography" && num >= 12) {
    return `${num / 16}rem`;
  }

  // Everything else (spacing, borders, layouts) uses exact pixels from Figma
  return `${num}px`;
}

// Helper to process shadow objects
function processShadow(shadowObj) {
  if (typeof shadowObj !== "object") return shadowObj;

  const x = shadowObj.offsetX !== undefined ? `${shadowObj.offsetX}px` : "0";
  const y = shadowObj.offsetY !== undefined ? `${shadowObj.offsetY}px` : "0";
  const blur = shadowObj.radius !== undefined ? `${shadowObj.radius}px` : "0";
  const spread = shadowObj.spread !== undefined ? `${shadowObj.spread}px` : "0";
  const color = shadowObj.color || "rgba(0,0,0,0.1)";

  return `${x} ${y} ${blur} ${spread} ${color}`;
}

// Helper to resolve token references
function resolveReference(ref, prefix) {
  // Clean up reference path: remove 'primitives.', spaces, and convert (d) to -d
  let cleaned = ref
    .replace(/^primitives\./, "")
    .replace(/\s*\(d\)/g, "-d") // Convert " (d)" or "(d)" to "-d"
    .replace(/\s+d$/g, "-d") // Convert " d" at end to "-d"
    .replace(/\s+/g, "-"); // Replace remaining spaces with dash

  // Split into parts and check if first part matches prefix (without trailing dash)
  const parts = cleaned.split(".");
  const prefixWithoutDash = prefix.replace(/-$/, "");

  // If first part matches the prefix, skip it to avoid duplication
  if (parts[0] === prefixWithoutDash) {
    cleaned = parts.slice(1).join("-");
  } else {
    cleaned = parts.join("-");
  }

  return `var(--${prefix}${cleaned})`;
}

// Helper to extract grid tokens
function extractGridTokens() {
  const grid = [];

  if (tokens.grid && tokens.grid["ntg-breakpoint"]) {
    Object.entries(tokens.grid["ntg-breakpoint"]).forEach(
      ([breakpoint, config]) => {
        if (config.value) {
          const bp = breakpoint.replace(/[()]/g, "").replace(/\s+/g, "-");
          const val = config.value;

          if (val.gutterSize !== undefined) {
            grid.push({
              name: `--grid-gutter-${bp}`,
              value: `${val.gutterSize}px`,
              description: config.description,
            });
          }
          if (val.count !== undefined) {
            grid.push({
              name: `--grid-columns-${bp}`,
              value: val.count,
              description: null,
            });
          }
          if (val.offset !== undefined) {
            grid.push({
              name: `--grid-offset-${bp}`,
              value: `${val.offset}px`,
              description: null,
            });
          }
          if (val.sectionSize !== undefined) {
            grid.push({
              name: `--grid-section-size-${bp}`,
              value: `${val.sectionSize}px`,
              description: null,
            });
          }
        }
      },
    );
  }

  return grid;
}

/**
 * Extract Typography Tokens (Theme-Agnostic)
 *
 * Extracts font properties from tokens.json font.ntg-type and font.ntg-type-sm sections.
 * These become variables in typography.css that both themes reference.
 *
 * IMPORTANT: This function EXCLUDES fontFamily (theme-specific: Lato for NTG, Roboto for Central)
 *
 * Extracted Properties:
 *   - fontSize → --type-{category}-{variant}-size
 *   - fontWeight → --type-{category}-{variant}-weight
 *   - lineHeight → --type-{category}-{variant}-lh
 *   - letterSpacing → --type-{category}-{variant}-ls
 *   - textDecoration → --type-{category}-{variant}-decoration (if not 'none')
 *   - textCase → --type-{category}-{variant}-text-transform (if not 'none')
 *   - paragraphSpacing → --type-{category}-{variant}-paragraph-spacing (if not 0)
 *   - fontStyle → --type-{category}-{variant}-style (if not 'normal')
 *
 * Example mapping:
 *   tokens.json: font.ntg-type.heading.h1.value.fontSize: "40px"
 *   Output: --type-heading-h1-size: 2.5rem
 *
 * Note: Properties with default values ('none', 0, 'normal') are excluded to reduce file size.
 */
// Helper to extract typography tokens from font section (theme-agnostic, excludes fontFamily)
function extractTypographyTokens() {
  const typography = [];

  // Process font.ntg-type (Desktop/default styles)
  if (tokens.font && tokens.font["ntg-type"]) {
    Object.entries(tokens.font["ntg-type"]).forEach(([category, styles]) => {
      Object.entries(styles).forEach(([variant, token]) => {
        if (token.type === "custom-fontStyle" && token.value) {
          const prefix = `type-${category}-${variant}`
            .replace(/[()]/g, "")
            .replace(/\s+/g, "-");
          const props = token.value;

          // Extract all font properties EXCEPT fontFamily (which is theme-specific)
          if (props.fontSize !== undefined) {
            typography.push({
              name: `--${prefix}-size`,
              value: processDimension(props.fontSize, "typography"),
              description: token.description,
            });
          }
          if (props.fontWeight !== undefined) {
            typography.push({
              name: `--${prefix}-weight`,
              value: props.fontWeight,
              description: null,
            });
          }
          if (props.lineHeight !== undefined) {
            typography.push({
              name: `--${prefix}-lh`,
              value: processDimension(props.lineHeight, "typography"),
              description: null,
            });
          }
          if (props.letterSpacing !== undefined) {
            typography.push({
              name: `--${prefix}-ls`,
              value:
                props.letterSpacing === 0
                  ? "0px"
                  : processDimension(props.letterSpacing, "typography"),
              description: null,
            });
          }
          if (props.textDecoration && props.textDecoration !== "none") {
            typography.push({
              name: `--${prefix}-decoration`,
              value: props.textDecoration,
              description: null,
            });
          }
          if (props.textCase && props.textCase !== "none") {
            typography.push({
              name: `--${prefix}-text-transform`,
              value: props.textCase,
              description: null,
            });
          }
          if (props.paragraphSpacing && props.paragraphSpacing !== 0) {
            typography.push({
              name: `--${prefix}-paragraph-spacing`,
              value: processDimension(props.paragraphSpacing, "typography"),
              description: null,
            });
          }
          if (props.fontStyle && props.fontStyle !== "normal") {
            typography.push({
              name: `--${prefix}-style`,
              value: props.fontStyle,
              description: null,
            });
          }
        }
      });
    });
  }

  // Process font.ntg-type-sm (Mobile styles)
  if (tokens.font && tokens.font["ntg-type-sm"]) {
    Object.entries(tokens.font["ntg-type-sm"]).forEach(([variant, token]) => {
      if (token.type === "custom-fontStyle" && token.value) {
        const prefix = `type-mobile-${variant}`
          .replace(/[()]/g, "")
          .replace(/\s+/g, "-");
        const props = token.value;

        // Extract all font properties EXCEPT fontFamily
        if (props.fontSize !== undefined) {
          typography.push({
            name: `--${prefix}-size`,
            value: processDimension(props.fontSize, "typography"),
            description: token.description,
          });
        }
        if (props.fontWeight !== undefined) {
          typography.push({
            name: `--${prefix}-weight`,
            value: props.fontWeight,
            description: null,
          });
        }
        if (props.lineHeight !== undefined) {
          typography.push({
            name: `--${prefix}-lh`,
            value: processDimension(props.lineHeight, "typography"),
            description: null,
          });
        }
        if (props.letterSpacing !== undefined) {
          typography.push({
            name: `--${prefix}-ls`,
            value:
              props.letterSpacing === 0
                ? "0px"
                : processDimension(props.letterSpacing, "typography"),
            description: null,
          });
        }
        if (props.textDecoration && props.textDecoration !== "none") {
          typography.push({
            name: `--${prefix}-decoration`,
            value: props.textDecoration,
            description: null,
          });
        }
        if (props.textCase && props.textCase !== "none") {
          typography.push({
            name: `--${prefix}-text-transform`,
            value: props.textCase,
            description: null,
          });
        }
        if (props.paragraphSpacing && props.paragraphSpacing !== 0) {
          typography.push({
            name: `--${prefix}-paragraph-spacing`,
            value: processDimension(props.paragraphSpacing, "typography"),
            description: null,
          });
        }
      }
    });
  }

  return typography;
}

// Helper to map theme token paths to typography variable names
function mapToTypographyVar(path) {
  // Map: themes.ntg.type.desktop.h1.size -> --type-heading-h1-size
  // Map: themes.ntg.type.mobile.h2.weight -> --type-mobile-heading-h2-weight
  const parts = path.split(".");

  // Skip themes.ntg/central.type prefix
  if (parts[0] === "themes" && parts[2] === "type") {
    const context = parts[3]; // 'desktop' or 'mobile'
    const variant = parts[4]; // 'h1', 'h2', 'body-default', etc
    const property = parts[5]; // 'size', 'weight', 'lh', 'ls'

    if (context === "desktop") {
      // Map h1-h6 to heading-h1, etc
      let category = variant.match(/^h[1-6]$/) ? `heading-${variant}` : variant;
      return `--type-${category}-${property}`;
    } else if (context === "mobile") {
      let category = variant.match(/^h[1-6]$/) ? `heading-${variant}` : variant;
      return `--type-mobile-${category}-${property}`;
    }
  }

  return null;
}

// Helper to extract common tokens shared across themes
function extractCommonTokens() {
  const common = {
    shadows: [],
    spacing: [],
    borderWidths: [],
    radii: [],
  };

  // Extract shadows from effect section
  if (tokens.effect && tokens.effect["ntg-shadow"]) {
    Object.entries(tokens.effect["ntg-shadow"]).forEach(([key, token]) => {
      if (token.type === "custom-shadow" && token.value) {
        const varName = `--shadow-${key}`;
        const cssValue = processShadow(token.value);
        common.shadows.push({
          name: varName,
          value: cssValue,
          description: token.description,
        });
      }
    });
  }

  // Extract spacing, border-widths, and common radii from ntg theme as baseline
  const ntgTheme = tokens.themes?.ntg;
  if (ntgTheme) {
    // Spacing
    if (ntgTheme.sp) {
      Object.entries(ntgTheme.sp).forEach(([key, token]) => {
        if (token.value !== undefined) {
          const varName = `--sp-${key}`;
          const cssValue = processDimension(token.value, "layout");
          common.spacing.push({
            name: varName,
            value: cssValue,
            description: token.description,
          });
        }
      });
    }

    // Border widths
    if (ntgTheme["border-width"]) {
      Object.entries(ntgTheme["border-width"]).forEach(([key, token]) => {
        if (token.value !== undefined) {
          const varName = `--border-width-${key}`;
          const cssValue = `${token.value}px`;
          common.borderWidths.push({
            name: varName,
            value: cssValue,
            description: token.description,
          });
        }
      });
    }

    // Common radii (none, sm, lg)
    if (ntgTheme.radii) {
      const commonRadiiKeys = ["none", "sm", "lg"];
      Object.entries(ntgTheme.radii).forEach(([key, token]) => {
        if (commonRadiiKeys.includes(key) && token.value !== undefined) {
          const varName = `--radii-${key}`;
          const cssValue = processDimension(token.value, "layout");
          common.radii.push({
            name: varName,
            value: cssValue,
            description: token.description,
          });
        }
      });
    }
  }

  return common;
}

// Helper to extract CSS variables from token object (updated for common vars)
function extractVariables(obj, prefix = "", path = [], useCommonVars = false) {
  const variables = [];

  for (const [key, value] of Object.entries(obj)) {
    // Clean up key names (remove spaces, convert (d) to -d)
    const cleanKey = key
      .replace(/\s+d$/, "-d")
      .replace(/\(d\)/, "-d")
      .replace(/\s+/g, "-");
    const currentPath = [...path, cleanKey];

    // Skip common token categories if using common vars
    if (useCommonVars && path.length === 0) {
      if (key === "sp" || key === "border-width") {
        continue; // Skip entirely - will reference common vars
      }
    }

    if (value && typeof value === "object") {
      // Check if this is a token with type and value
      if (value.type && value.value !== undefined) {
        const varName = `--${prefix}${currentPath.join("-")}`;
        let cssValue = value.value;

        // Handle token references first
        if (
          typeof cssValue === "string" &&
          cssValue.startsWith("{") &&
          cssValue.endsWith("}")
        ) {
          const ref = cssValue.slice(1, -1);
          cssValue = resolveReference(ref, prefix);
        }
        // Font weights should stay as numbers even if marked as dimension
        else if (key === "weight" || key.includes("weight")) {
          cssValue = value.value;
        }
        // Transform based on type
        else if (value.type === "color") {
          cssValue = processColor(cssValue);
        } else if (value.type === "dimension") {
          cssValue = processDimension(cssValue, "layout");
        } else if (value.type === "custom-shadow") {
          cssValue = processShadow(cssValue);
        } else if (value.type === "number") {
          // Keep numbers as-is (e.g., font weights like 700)
          cssValue = value.value;
        } else if (value.type === "string") {
          cssValue = value.value;
        }

        // For common radii, reference common vars
        if (useCommonVars && path.length === 1 && path[0] === "radii") {
          const commonRadiiKeys = ["none", "sm", "lg"];
          if (commonRadiiKeys.includes(key)) {
            cssValue = `var(--radii-${key})`;
          }
        }

        variables.push({
          name: varName,
          value: cssValue,
          description: value.description,
        });
      } else {
        // Recursively process nested objects
        variables.push(
          ...extractVariables(value, prefix, currentPath, useCommonVars),
        );
      }
    }
  }

  return variables;
}

// Generate common CSS file content
function generateCommonCSS(commonTokens) {
  const header = `/**
 * Common Design Tokens - Auto-generated
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * This file contains design tokens shared across all themes.
 * To make changes:
 * 1. Update tokens.json
 * 2. Run: npm run tokens:build
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Figma Design Tokens
 */

:root {`;

  const sections = [];

  if (commonTokens.shadows.length > 0) {
    sections.push("  /* Shadows */");
    commonTokens.shadows.forEach((v) => {
      const comment = v.description ? `  /* ${v.description} */\n` : "";
      sections.push(`${comment}  ${v.name}: ${v.value};`);
    });
  }

  if (commonTokens.spacing.length > 0) {
    sections.push("\n  /* Spacing */");
    commonTokens.spacing.forEach((v) => {
      sections.push(`  ${v.name}: ${v.value};`);
    });
  }

  if (commonTokens.borderWidths.length > 0) {
    sections.push("\n  /* Border Widths */");
    commonTokens.borderWidths.forEach((v) => {
      sections.push(`  ${v.name}: ${v.value};`);
    });
  }

  if (commonTokens.radii.length > 0) {
    sections.push("\n  /* Border Radius */");
    commonTokens.radii.forEach((v) => {
      sections.push(`  ${v.name}: ${v.value};`);
    });
  }

  const footer = `\n}\n`;

  return header + "\n" + sections.join("\n") + footer;
}

// Generate grid CSS file content
function generateGridCSS(grid) {
  const header = `/**
 * Grid System Tokens - Auto-generated
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * Bootstrap-compatible grid configuration from Figma.
 * To make changes:
 * 1. Update tokens.json
 * 2. Run: npm run tokens:build
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Figma Design Tokens
 */

:root {`;

  const lines = [];

  grid.forEach((v) => {
    const comment = v.description ? `  /* ${v.description} */\n` : "";
    lines.push(`${comment}  ${v.name}: ${v.value};`);
  });

  const footer = `\n}\n`;

  return header + "\n" + lines.join("\n") + footer;
}

// Generate typography CSS file content
function generateTypographyCSS(typography) {
  const header = `/**
 * Typography Tokens - Auto-generated
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * Theme-agnostic typography definitions (excludes fontFamily).
 * Font families are defined per-theme to allow Lato vs Roboto.
 * 
 * Properties: size, weight, line-height, letter-spacing, decoration, text-transform
 * 
 * To make changes:
 * 1. Update tokens.json
 * 2. Run: npm run tokens:build
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Figma Design Tokens
 */

:root {`;

  const lines = [];

  // Group by style category for better readability
  const groups = {};
  typography.forEach((v) => {
    const parts = v.name.split("-");
    const category = parts.slice(0, 3).join("-"); // e.g., --font-heading-h1
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(v);
  });

  Object.entries(groups).forEach(([category, vars], index) => {
    if (index > 0) lines.push("");
    lines.push(`  /* ${category} */`);
    vars.forEach((v) => {
      const comment = v.description ? `  /* ${v.description} */\n` : "";
      lines.push(`${comment}  ${v.name}: ${v.value};`);
    });
  });

  const footer = `\n}\n`;

  return header + "\n" + lines.join("\n") + footer;
}

/**
 * Generate typography literals for properties that don't work with CSS variables
 *
 * Some CSS properties like text-transform don't work reliably when their values
 * come from CSS custom properties (variables). This function generates a separate
 * CSS file with literal values that auto-updates when tokens are rebuilt.
 *
 * @param {Array} typography - Typography tokens from extractTypographyTokens()
 * @returns {string} CSS file content with literal text-transform values
 */
function generateTypographyLiterals(typography) {
  const header = `/**
 * Typography Literals - Auto-generated
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * Contains literal values for CSS properties that don't work reliably
 * with CSS custom properties (variables).
 * 
 * Currently includes:
 * - text-transform values (uppercase, lowercase, capitalize, none)
 * 
 * These values are extracted from design tokens and applied directly.
 * Components should use these literal variables for text-transform properties.
 * 
 * Generated: ${new Date().toISOString()}
 * Source: tokens.json
 */

:root {`;

  const lines = [];
  const processedKeys = new Set();

  // Find all text-transform tokens and create literal mappings
  typography.forEach((token) => {
    if (token.name.endsWith("-text-transform") && token.value) {
      // Extract the base name (e.g., --type-uppercase-small-text-transform -> uppercase-small)
      const baseName = token.name
        .replace("--type-", "")
        .replace("-text-transform", "");

      // Avoid duplicates
      if (!processedKeys.has(baseName)) {
        processedKeys.add(baseName);

        // Add comment for clarity
        if (lines.length > 0) lines.push("");
        lines.push(`  /* ${baseName} - literal value: ${token.value} */`);
        lines.push(`  --literal-text-transform-${baseName}: ${token.value};`);
      }
    }
  });

  const footer = `\n}\n`;

  return header + "\n" + lines.join("\n") + footer;
}

/**
 * Extract Semantic Variables (Unprefixed)
 *
 * Identifies semantic variables (clr-*, type-*) from theme data and extracts them
 * without theme prefix for use in theme switching scenarios.
 *
 * Semantic variables are "purpose-based" rather than "primitive" values:
 *   - Primitives: --ntg-blue-04, --central-neutrals-01
 *   - Semantics: --clr-bg-default, --type-desktop-h1-size
 *
 * This allows components to use unprefixed variables like var(--clr-bg-default)
 * which can be overridden by different themes.
 *
 * @param {Array} variables - Array of {name, value, description} from generateCSS
 * @param {string} prefix - Theme prefix to remove (e.g., "ntg-", "central-")
 * @returns {Array} Array of {name, value, description} with unprefixed semantic variables
 */
function extractSemanticVariables(variables, prefix) {
  const semanticVars = [];
  const semanticPrefixes = ["clr-", "type-"];

  variables.forEach((v) => {
    // Check if variable name contains semantic prefixes after the theme prefix
    const withoutPrefix = v.name.replace(`--${prefix}`, "--");

    for (const semanticPrefix of semanticPrefixes) {
      if (withoutPrefix.startsWith(`--${semanticPrefix}`)) {
        semanticVars.push({
          name: withoutPrefix,
          value: v.value,
          description: v.description,
        });
        break;
      }
    }
  });

  return semanticVars;
}

/**
 * Generate Base Semantic Variables CSS
 *
 * Creates a base-variables.css file with unprefixed semantic variables.
 * These serve as defaults and can be overridden by theme-specific files.
 *
 * @param {Array} semanticVars - Array of {name, value, description}
 * @param {string} baseThemeName - Name of theme used as defaults (e.g., "NT.GOV.AU")
 * @returns {string} CSS file content
 */
function generateBaseVariablesCSS(semanticVars, baseThemeName) {
  const header = `/**
 * Base Semantic Variables - Auto-generated from design tokens
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * This file contains unprefixed semantic variables for theme switching.
 * Components should use these variables instead of theme-prefixed ones.
 * 
 * Usage in components:
 *   color: var(--clr-text-default);
 *   font-size: var(--type-desktop-h1-size);
 * 
 * Theme switching approaches:
 *   1. Load different theme CSS files (overrides these defaults)
 *   2. Use [data-theme] attribute (requires theme-specific override files)
 *   3. JavaScript: document.body.dataset.theme = 'central';
 * 
 * Default values from: ${baseThemeName} Theme
 * Generated: ${new Date().toISOString()}
 */

:root {`;

  const lines = [];

  semanticVars.forEach((v) => {
    const comment = v.description ? `  /* ${v.description} */\n` : "";
    lines.push(`${comment}  ${v.name}: ${v.value};`);
  });

  const footer = `\n}\n`;

  return header + "\n" + lines.join("\n") + footer;
}

/**
 * Generate Theme CSS with Typography References
 *
 * Creates theme-specific CSS files (theme-ntg.css, theme-central.css) that:
 * 1. Import foundation layers (common.css, grid.css, typography.css)
 * 2. Define theme-specific font families (Lato for NTG, Roboto for Central)
 * 3. Define primitive and semantic color variables
 * 4. Reference typography.css variables using var()
 * 5. Add extension variables for properties missing from theme definitions
 *
 * POST-PROCESSING LOGIC:
 *   The function scans font.ntg-type and font.ntg-type-sm in tokens.json to find
 *   textDecoration, textCase, and paragraphSpacing properties. If a variant has
 *   these properties in the source tokens but NOT in the theme definition, the
 *   function automatically generates a theme reference variable.
 *
 * Example:
 *   Source (tokens.json): font.ntg-type.link.default.value.textDecoration = "underline"
 *   Typography.css: --type-link-default-decoration: underline
 *   Theme doesn't define: themes.ntg.type.desktop.link.default.decoration
 *   Result: Auto-generated in theme: --ntg-type-link-default-decoration: var(--type-link-default-decoration)
 *
 * This ensures complete property coverage even when theme definitions are incomplete.
 *
 * @param {string} themeName - Display name for the theme (e.g., "NT.GOV.AU")
 * @param {object} themeData - Theme token data from tokens.json
 * @param {string} prefix - CSS variable prefix (e.g., "ntg" or "central")
 * @param {boolean} useCommonVars - Whether to use common variables (legacy parameter)
 * @returns {string} Complete CSS file content with imports and variables
 */
// Generate CSS file content with typography variable references
function generateCSS(themeName, themeData, prefix, useCommonVars = false) {
  const header = `/**
 * ${themeName} Theme - Auto-generated from design tokens
 * 
 * ⚠️ DO NOT EDIT THIS FILE MANUALLY ⚠️
 * 
 * This file is automatically generated from tokens.json
 * To make changes:
 * 1. Update tokens.json
 * 2. Run: npm run tokens:build
 * 
 * Import order: common.css → grid.css → typography.css → typography-literals.css → theme
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Figma Design Tokens
 */

@import './common.css';
@import './grid.css';
@import './typography.css';
@import './typography-literals.css';

:root {`;

  const variables = [];
  const fontFamilies = [];

  // Extract variables, separating typography into font families and references
  function processVariables(obj, currentPrefix = "", path = []) {
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = key
        .replace(/\s+d$/, "-d")
        .replace(/\(d\)/, "-d")
        .replace(/\s+/g, "-");
      const currentPath = [...path, cleanKey];
      const fullPath = currentPath.join(".");

      // Skip common token categories if using common vars
      if (useCommonVars && path.length === 0) {
        if (key === "sp" || key === "border-width") {
          continue;
        }
      }

      if (value && typeof value === "object") {
        if (value.type && value.value !== undefined) {
          const varName = `--${currentPrefix}${currentPath.join("-")}`;
          let cssValue = value.value;

          // Check if this is a typography token (type.desktop.* or type.mobile.*)
          const isTypography =
            path.length >= 2 &&
            path[0] === "type" &&
            (path[1] === "desktop" || path[1] === "mobile");

          if (isTypography) {
            const property = currentPath[currentPath.length - 1];

            // Font family is theme-specific, keep as raw value
            if (property === "family") {
              fontFamilies.push({
                name: varName,
                value: cssValue,
                description: value.description,
              });
              return; // Don't add to regular variables
            }

            // For other properties (size, weight, lh, ls), reference typography vars
            if (
              [
                "size",
                "weight",
                "lh",
                "ls",
                "decoration",
                "text-transform",
                "style",
              ].includes(property)
            ) {
              const typographyVar = mapToTypographyVar(
                `themes.${prefix.replace(/-$/, "")}.${fullPath}`,
              );
              if (typographyVar) {
                variables.push({
                  name: varName,
                  value: `var(${typographyVar})`,
                  description: value.description,
                });
                return;
              }
            }
          }

          // Handle token references
          if (
            typeof cssValue === "string" &&
            cssValue.startsWith("{") &&
            cssValue.endsWith("}")
          ) {
            const ref = cssValue.slice(1, -1);
            cssValue = resolveReference(ref, currentPrefix);
          }
          // Font weights should stay as numbers
          else if (key === "weight" || key.includes("weight")) {
            cssValue = value.value;
          }
          // Transform based on type
          else if (value.type === "color") {
            cssValue = processColor(cssValue);
          } else if (value.type === "dimension") {
            cssValue = processDimension(cssValue, "layout");
          } else if (value.type === "custom-shadow") {
            cssValue = processShadow(cssValue);
          } else if (value.type === "number") {
            cssValue = value.value;
          } else if (value.type === "string") {
            cssValue = value.value;
          }

          // For common radii, reference common vars
          if (useCommonVars && path.length === 1 && path[0] === "radii") {
            const commonRadiiKeys = ["none", "sm", "lg"];
            if (commonRadiiKeys.includes(key)) {
              cssValue = `var(--radii-${key})`;
            }
          }

          variables.push({
            name: varName,
            value: cssValue,
            description: value.description,
          });
        } else {
          processVariables(value, currentPrefix, currentPath);
        }
      }
    }
  }

  processVariables(themeData, prefix, []);

  // Add missing typography property references (decoration, text-transform, paragraph-spacing)
  // These exist in typography.css but not in theme tokens
  if (tokens.font && tokens.font["ntg-type"]) {
    // Map of typography variants with their additional properties
    const typographyExtras = new Map();

    // Scan font.ntg-type for decoration, textCase, and paragraphSpacing
    Object.entries(tokens.font["ntg-type"]).forEach(([category, styles]) => {
      Object.entries(styles).forEach(([variant, token]) => {
        if (token.type === "custom-fontStyle" && token.value) {
          const props = token.value;
          const variantName = `${category}-${variant}`;
          const extras = [];

          if (props.textDecoration && props.textDecoration !== "none") {
            extras.push("decoration");
          }
          if (props.textCase && props.textCase !== "none") {
            extras.push("text-transform");
          }
          if (props.paragraphSpacing && props.paragraphSpacing !== 0) {
            extras.push("paragraph-spacing");
          }

          if (extras.length > 0) {
            typographyExtras.set(variantName, extras);
          }
        }
      });
    });

    // Scan mobile typography as well
    if (tokens.font["ntg-type-sm"]) {
      Object.entries(tokens.font["ntg-type-sm"]).forEach(([variant, token]) => {
        if (token.type === "custom-fontStyle" && token.value) {
          const props = token.value;
          const extras = [];

          if (props.textDecoration && props.textDecoration !== "none") {
            extras.push("decoration");
          }
          if (props.textCase && props.textCase !== "none") {
            extras.push("text-transform");
          }
          if (props.paragraphSpacing && props.paragraphSpacing !== 0) {
            extras.push("paragraph-spacing");
          }

          if (extras.length > 0) {
            typographyExtras.set(`mobile-${variant}`, extras);
          }
        }
      });
    }

    // Generate theme variable references for these extra properties
    typographyExtras.forEach((props, variantKey) => {
      props.forEach((prop) => {
        const themeVarName = `--${prefix}type-${variantKey.replace("mobile-", "mobile-")}-${prop}`;
        const typoVarName = `--type-${variantKey}-${prop}`;

        // Only add if not already present
        const exists = variables.some((v) => v.name === themeVarName);
        if (!exists) {
          variables.push({
            name: themeVarName,
            value: `var(${typoVarName})`,
            description: null,
          });
        }
      });
    });
  }

  // Build CSS: font families first, then other variables
  const cssLines = [];

  if (fontFamilies.length > 0) {
    fontFamilies.forEach((v) => {
      const comment = v.description ? `  /* ${v.description} */\n` : "";
      cssLines.push(`${comment}  ${v.name}: ${v.value};`);
    });
  }

  // Add regular variables and generate RGB components for colors
  const rgbComponents = [];

  variables.forEach((v) => {
    const comment = v.description ? `  /* ${v.description} */\n` : "";
    cssLines.push(`${comment}  ${v.name}: ${v.value};`);

    // If this is a color value (hex format), generate RGB components
    if (typeof v.value === "string" && v.value.match(/^#[0-9a-f]{6}$/i)) {
      const rgb = hexToRgb(v.value);
      rgbComponents.push({
        name: `${v.name}-r`,
        value: rgb.r,
        description: null,
      });
      rgbComponents.push({
        name: `${v.name}-g`,
        value: rgb.g,
        description: null,
      });
      rgbComponents.push({
        name: `${v.name}-b`,
        value: rgb.b,
        description: null,
      });
      rgbComponents.push({
        name: `${v.name}-rgb`,
        value: `var(${v.name}-r), var(${v.name}-g), var(${v.name}-b)`,
        description: null,
      });
    }
    // If this is a var() reference to another color, also generate RGB components
    else if (typeof v.value === "string" && v.value.match(/^var\(--[^)]+\)$/)) {
      // Extract the referenced variable name
      const refMatch = v.value.match(/^var\((--[^)]+)\)$/);
      if (refMatch) {
        const refVarName = refMatch[1];
        // Generate RGB components that reference the primitive's RGB components
        rgbComponents.push({
          name: `${v.name}-r`,
          value: `var(${refVarName}-r)`,
          description: null,
        });
        rgbComponents.push({
          name: `${v.name}-g`,
          value: `var(${refVarName}-g)`,
          description: null,
        });
        rgbComponents.push({
          name: `${v.name}-b`,
          value: `var(${refVarName}-b)`,
          description: null,
        });
        rgbComponents.push({
          name: `${v.name}-rgb`,
          value: `var(${v.name}-r), var(${v.name}-g), var(${v.name}-b)`,
          description: null,
        });
      }
    }
  });

  // Add RGB component variables
  if (rgbComponents.length > 0) {
    cssLines.push("");
    cssLines.push("  /* RGB components for color variables */");
    rgbComponents.forEach((v) => {
      cssLines.push(`  ${v.name}: ${v.value};`);
    });
  }

  // Add unprefixed semantic variables that reference prefixed ones
  const semanticVars = extractSemanticVariables(variables, prefix);

  if (semanticVars.length > 0) {
    cssLines.push("");
    cssLines.push("  /* Unprefixed semantic variables for theme switching */");
    semanticVars.forEach((v) => {
      const prefixedVarName = `--${prefix}${v.name.slice(2)}`; // Remove -- and add prefix
      cssLines.push(`  ${v.name}: var(${prefixedVarName});`);
    });
  }

  const footer = `\n}\n`;
  const css = header + "\n" + cssLines.join("\n") + footer;

  return { css, variables, fontFamilies };
}

/**
 * Generate Bootstrap Typography Override CSS
 *
 * Creates Bootstrap-specific CSS variable overrides that bridge Bootstrap's
 * CSS variable system with the design token architecture.
 *
 * Key features:
 * - Extracts RGB color values for Bootstrap's rgba() usage
 * - Maps typography tokens to --bs-* variables
 * - Includes theme-specific font families
 * - Adds direct element overrides for maximum specificity
 *
 * @param {string} themeName - Display name (e.g., "NT.GOV.AU")
 * @param {object} themeData - Complete theme token data
 * @param {string} prefix - Variable prefix (e.g., "ntg", "central")
 * @returns {string} Complete Bootstrap override CSS content
 */
function generateBootstrapCSS(themeName, themeData, prefix) {
  // Resolve link colors to hex values
  const linkDefaultHex = resolveColorValue("clr.link.default", themeData);
  const linkHoverHex = resolveColorValue("clr.link.hover", themeData);

  // Convert to RGB triplets
  const linkDefaultRgb = linkDefaultHex ? hexToRgb(linkDefaultHex) : null;
  const linkHoverRgb = linkHoverHex ? hexToRgb(linkHoverHex) : null;

  // Get primitive color names for comments
  const linkDefaultToken = themeData.clr?.link?.default?.value || "";
  const linkHoverToken = themeData.clr?.link?.hover?.value || "";
  const linkDefaultName = linkDefaultToken
    ? linkDefaultToken
        .replace(/[{}]/g, "")
        .split(".")
        .pop()
        .replace(/\s+/g, "-")
        .replace(/\(d\)/g, "-d")
    : "";
  const linkHoverName = linkHoverToken
    ? linkHoverToken
        .replace(/[{}]/g, "")
        .split(".")
        .pop()
        .replace(/\s+/g, "-")
        .replace(/\(d\)/g, "-d")
    : "";

  const header = `/**
 * Bootstrap Typography Overrides - ${themeName} Theme
 * 
 * ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️
 * 
 * This file maps Bootstrap CSS variables to ${themeName} theme design tokens.
 * Load order: Bootstrap CDN → this file → ${prefix}-theme.css
 * 
 * Purpose: Connect Bootstrap's typography system to theme-specific values
 * for seamless theme switching.
 * 
 * To regenerate:
 * 1. Update tokens.json
 * 2. Run: npm run tokens:build
 * 
 * Generated: ${new Date().toISOString()}
 * Source: Figma Design Tokens
 */

:root {
  /* ===== TYPOGRAPHY ===== */
  
  /* Font Families */
  --bs-font-sans-serif: var(--${prefix}-type-font-default), system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --bs-body-font-family: var(--${prefix}-type-font-default), system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  
  /* Body Typography */
  --bs-body-font-size: var(--${prefix}-type-desktop-body-default-size);
  --bs-body-font-weight: var(--type-body-default-weight);
  --bs-body-line-height: var(--type-body-default-lh);
  --bs-body-color: var(--${prefix}-clr-text-default);
  --bs-body-bg: var(--${prefix}-clr-bg-default);
  
  /* Headings */
  --bs-heading-color: var(--${prefix}-clr-text-default);
  --bs-headings-font-weight: var(--type-heading-h2-weight);
  
  /* Links */
  --bs-link-color: var(--${prefix}-clr-link-default);
  --bs-link-hover-color: var(--${prefix}-clr-link-hover);
  --bs-link-decoration: var(--${prefix}-type-link-default-decoration);
  
  /* Bootstrap Reboot uses RGB variants - Override Strategy Layer 1 */`;

  const rgbVars = `
  --bs-link-color-rgb: var(--${prefix}-clr-link-default-rgb);
  --bs-link-hover-color-rgb: var(--${prefix}-clr-link-hover-rgb);`;

  const colorSection = `
  
  /* ===== COLORS ===== */
  
  /* Primary Brand Colors mapped to ${themeName} palette */
  --bs-primary: var(--${prefix}-clr-action-pirmary);
  --bs-secondary: var(--${prefix}-neutral-06);
  --bs-success: var(--${prefix}-success-03-d);
  --bs-info: var(--${prefix}-info-03-d);
  --bs-warning: var(--${prefix}-warning-03-d);
  --bs-danger: var(--${prefix}-danger-03-d);
  --bs-light: var(--${prefix}-neutral-01);
  --bs-dark: var(--${prefix}-blue-03-d);
  
  /* Emphasis Colors */
  --bs-emphasis-color: var(--${prefix}-clr-text-emphasis);
  --bs-secondary-color: var(--${prefix}-clr-text-muted);
  
  /* Background Colors */
  --bs-secondary-bg: var(--${prefix}-clr-bg-shade-alt);
  --bs-tertiary-bg: var(--${prefix}-clr-bg-shade);
  
  /* Border Colors */
  --bs-border-color: var(--${prefix}-clr-border-subtle);
  
  /* Focus Ring */
  --bs-focus-ring-color: rgba(236, 140, 88, 0.25); /* ${prefix}-orange-02 with opacity */
  
  /* ===== COMPONENT-SPECIFIC ===== */
  
  /* Code */
  --bs-code-color: var(--${prefix}-coral-03-d);
  
  /* Highlight/Mark */
  --bs-highlight-color: var(--${prefix}-clr-text-default);
  --bs-highlight-bg: var(--${prefix}-warning-01);
  
  /* Status/Alert Backgrounds */
  --bs-info-bg-subtle: var(--${prefix}-info-01);
  --bs-success-bg-subtle: var(--${prefix}-success-01);
  --bs-warning-bg-subtle: var(--${prefix}-warning-01);
  --bs-danger-bg-subtle: var(--${prefix}-danger-01);
  
  /* Border Radius - ${themeName} uses sharp corners for buttons */
  --bs-border-radius: var(--${prefix}-radii-sm);
  --bs-border-radius-sm: var(--${prefix}-radii-none);
  --bs-border-radius-lg: var(--${prefix}-radii-md);
}

/* Inline Link Typography - Figma Spec Compliance */
/* Override Strategy Layer 3: Direct element override for maximum specificity */
a {
  color: var(--${prefix}-clr-link-default);
  font-size: var(--type-link-default-size);
  font-weight: var(--type-link-default-weight);
  line-height: var(--type-link-default-lh);
  letter-spacing: var(--type-link-default-ls);
}

a:hover {
  color: var(--${prefix}-clr-link-hover);
  text-decoration: none;
}

a:focus,
a:focus-visible {
  background: var(--${prefix}-clr-focus-focus);
  border-bottom: 4px solid var(--${prefix}-clr-border-strong-01);
  text-decoration: none;
  outline: none;
}

a:visited {
  color: var(--${prefix}-clr-link-visited);
}

/* Mobile Typography Adjustments */
@media (max-width: 768px) {
  :root {
    --bs-body-font-size: var(--${prefix}-type-mobile-body-default-size);
    --bs-body-line-height: var(--type-mobile-body-default-lh);
  }
  
  a {
    font-size: var(--type-mobile-link-default-size);
    line-height: var(--type-mobile-link-default-lh);
  }
}
`;

  return header + rgbVars + colorSection;
}

// Build common tokens file
try {
  console.log("\n📦 Building common tokens...");

  const commonTokens = extractCommonTokens();
  const commonCSS = generateCommonCSS(commonTokens);
  const commonPath = join(rootDir, "css/common.css");
  writeFileSync(commonPath, commonCSS, "utf-8");

  const totalCommon =
    commonTokens.shadows.length +
    commonTokens.spacing.length +
    commonTokens.borderWidths.length +
    commonTokens.radii.length;
  console.log(
    `  ✓ Generated css/common.css (${totalCommon} shared variables)`,
  );
} catch (error) {
  console.error("  ❌ Failed to generate common tokens:", error.message);
  process.exit(1);
}

// Build grid tokens file
try {
  console.log("\n📦 Building grid tokens...");

  const gridTokens = extractGridTokens();
  if (gridTokens.length > 0) {
    const gridCSS = generateGridCSS(gridTokens);
    const gridPath = join(rootDir, "css/grid.css");
    writeFileSync(gridPath, gridCSS, "utf-8");

    console.log(
      `  ✓ Generated css/grid.css (${gridTokens.length} variables)`,
    );
  } else {
    console.log("  ⚠ No grid tokens found");
  }
} catch (error) {
  console.error("  ❌ Failed to generate grid tokens:", error.message);
  process.exit(1);
}

// Build typography tokens file
try {
  console.log("\n📦 Building typography tokens...");

  const typographyTokens = extractTypographyTokens();
  if (typographyTokens.length > 0) {
    const typographyCSS = generateTypographyCSS(typographyTokens);
    const typographyPath = join(rootDir, "css/typography.css");
    writeFileSync(typographyPath, typographyCSS, "utf-8");

    console.log(
      `  ✓ Generated css/typography.css (${typographyTokens.length} variables)`,
    );
  } else {
    console.log("  ⚠ No typography tokens found");
  }
} catch (error) {
  console.error("  ❌ Failed to generate typography tokens:", error.message);
  process.exit(1);
}

// Build typography literals file
try {
  console.log("\n📦 Building typography literals...");

  const typographyTokens = extractTypographyTokens();
  if (typographyTokens.length > 0) {
    const literalsCSS = generateTypographyLiterals(typographyTokens);
    const literalsPath = join(rootDir, "css/typography-literals.css");
    writeFileSync(literalsPath, literalsCSS, "utf-8");

    const literalCount = (literalsCSS.match(/--literal-text-transform-/g) || [])
      .length;
    console.log(
      `  ✓ Generated css/typography-literals.css (${literalCount} literal values)`,
    );
  } else {
    console.log("  ⚠ No typography tokens found for literals");
  }
} catch (error) {
  console.error("  ❌ Failed to generate typography literals:", error.message);
  process.exit(1);
}

// Build NT.GOV.AU theme
try {
  console.log("\n📦 Building NT.GOV.AU theme...");

  const ntgData = {
    ...tokens.primitives?.ntg,
    ...tokens.themes?.ntg,
  };

  const ntgResult = generateCSS("NT.GOV.AU", ntgData, "ntg-", true);
  const ntgPath = join(rootDir, "css/theme-ntg.css");
  writeFileSync(ntgPath, ntgResult.css, "utf-8");

  console.log("  ✓ Generated css/theme-ntg.css");

  // Generate base-variables.css using NTG as defaults
  const semanticVars = extractSemanticVariables(ntgResult.variables, "ntg-");
  const baseVarsCSS = generateBaseVariablesCSS(semanticVars, "NT.GOV.AU");
  const baseVarsPath = join(rootDir, "css/base-variables.css");
  writeFileSync(baseVarsPath, baseVarsCSS, "utf-8");

  console.log(
    `  ✓ Generated css/base-variables.css (${semanticVars.length} semantic variables)`,
  );
} catch (error) {
  console.error("  ❌ Failed to generate NT.GOV.AU theme:", error.message);
  process.exit(1);
}

// Build NTG Central theme
try {
  console.log("\n📦 Building NTG Central theme...");

  const centralData = {
    ...tokens.primitives?.central,
    ...tokens.themes?.central,
  };

  const centralResult = generateCSS(
    "NTG Central",
    centralData,
    "central-",
    true,
  );
  const centralPath = join(rootDir, "css/theme-central.css");
  writeFileSync(centralPath, centralResult.css, "utf-8");

  console.log("  ✓ Generated css/theme-central.css");
} catch (error) {
  console.error("  ❌ Failed to generate NTG Central theme:", error.message);
  process.exit(1);
}

// Build Bootstrap typography overrides
try {
  console.log("\n📦 Building Bootstrap typography overrides...");

  // NTG Bootstrap overrides
  const ntgBootstrapData = {
    ...tokens.primitives?.ntg,
    ...tokens.themes?.ntg,
  };
  const ntgBootstrapCSS = generateBootstrapCSS(
    "NT.GOV.AU",
    ntgBootstrapData,
    "ntg",
  );
  const ntgBootstrapPath = join(rootDir, "css/typography-ntg.css");
  writeFileSync(ntgBootstrapPath, ntgBootstrapCSS, "utf-8");
  console.log("  ✓ Generated css/typography-ntg.css");

  // Central Bootstrap overrides
  const centralBootstrapData = {
    ...tokens.primitives?.central,
    ...tokens.themes?.central,
  };
  const centralBootstrapCSS = generateBootstrapCSS(
    "NTG Central",
    centralBootstrapData,
    "central",
  );
  const centralBootstrapPath = join(
    rootDir,
    "css/typography-central.css",
  );
  writeFileSync(centralBootstrapPath, centralBootstrapCSS, "utf-8");
  console.log("  ✓ Generated css/typography-central.css");
} catch (error) {
  console.error(
    "  ❌ Failed to generate Bootstrap typography overrides:",
    error.message,
  );
  process.exit(1);
}

console.log("\n✅ Design tokens successfully built!");
console.log("\nGenerated files:");
console.log("  - css/common.css (shared tokens)");
console.log("  - css/grid.css (Bootstrap grid)");
console.log("  - css/typography.css (theme-agnostic fonts)");
console.log(
  "  - css/typography-literals.css (literal values for text-transform)",
);
console.log(
  "  - css/base-variables.css (unprefixed semantic variables)",
);
console.log("  - css/theme-ntg.css (NT.GOV.AU theme)");
console.log("  - css/theme-central.css (NTG Central theme)");
console.log("  - css/typography-ntg.css (Bootstrap overrides for NTG)");
console.log(
  "  - css/typography-central.css (Bootstrap overrides for Central)",
);
console.log(
  "\n💡 Remember to commit the generated CSS files to version control.\n",
);
