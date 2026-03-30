# @ntgovernment/web-design-tokens

Design tokens for the NT Government web design system, exported as CSS custom properties and JavaScript/TypeScript objects.

## Installation

```bash
# .npmrc must include:
# @ntgovernment:registry=https://npm.pkg.github.com
npm install @ntgovernment/web-design-tokens
```

## Usage

### CSS Custom Properties

Import a complete theme (recommended — pulls in all token layers automatically):

```css
/* NT.GOV.AU theme */
@import '@ntgovernment/web-design-tokens/css/theme-ntg';

/* OR: NTG Central theme */
@import '@ntgovernment/web-design-tokens/css/theme-central';
```

Import individual token layers:

```css
@import '@ntgovernment/web-design-tokens/css/common';       /* shadows, spacing, borders */
@import '@ntgovernment/web-design-tokens/css/grid';         /* Bootstrap-compatible grid */
@import '@ntgovernment/web-design-tokens/css/typography';   /* typography scale */
@import '@ntgovernment/web-design-tokens/css/base-variables'; /* semantic defaults (NTG) */
```

Import the full barrel (all tokens, NTG defaults):

```css
@import '@ntgovernment/web-design-tokens/css';
```

Bootstrap typography overrides:

```css
@import '@ntgovernment/web-design-tokens/css/typography-ntg';
@import '@ntgovernment/web-design-tokens/css/typography-central';
```

### JavaScript / TypeScript

```ts
import { colors, spacing, typography, shadows, borders, grid } from '@ntgovernment/web-design-tokens';

// NTG primitive colors
console.log(colors.ntg.blue['03-d']); // '#1f1f5f'

// Spacing scale
console.log(spacing.xs); // '8px'

// Typography scale (desktop)
console.log(typography.heading.h1.size);   // 40
console.log(typography.heading.h1.weight); // '700'

// Shadows
console.log(shadows.md); // CSS box-shadow string

// Border radii
console.log(borders.radii.md); // '20px'
```

### Raw tokens

```js
import tokens from '@ntgovernment/web-design-tokens/tokens.json' assert { type: 'json' };
```

## Token layers

| File | Variables | Content |
|------|-----------|---------|
| `dist/css/common.css` | 25 | Shadows, spacing, border widths, radii |
| `dist/css/grid.css` | 15 | Bootstrap-compatible grid breakpoints |
| `dist/css/typography.css` | 144 | Theme-agnostic typography scale |
| `dist/css/typography-literals.css` | 3 | Literal `text-transform` values |
| `dist/css/base-variables.css` | 82 | Unprefixed semantic defaults (NTG) |
| `dist/css/themes/theme-ntg.css` | 796 | NT.GOV.AU theme — Lato, ochre accent |
| `dist/css/themes/theme-central.css` | 696 | NTG Central theme — Roboto, green accent |
| `dist/css/themes/typography-ntg.css` | 40 | Bootstrap `--bs-*` overrides (NTG) |
| `dist/css/themes/typography-central.css` | 40 | Bootstrap `--bs-*` overrides (Central) |

Theme files (`theme-ntg.css`, `theme-central.css`) automatically import `common.css`, `grid.css`, `typography.css`, and `typography-literals.css` via relative `../` paths — so importing one theme file is all you need.

## Package structure

```
@ntgovernment/web-design-tokens/
├── tokens.json                # Source of truth — 849 tokens exported from Figma
├── dist/                      # Generated output (do not edit manually)
│   ├── index.mjs              # ES module
│   ├── index.cjs              # CommonJS module
│   ├── index.d.ts             # TypeScript declarations
│   └── css/                   # Generated CSS custom properties
│       ├── common.css         # Shadows, spacing, border widths, radii (25 vars)
│       ├── grid.css           # Bootstrap-compatible grid (15 vars)
│       ├── typography.css     # Theme-agnostic typography scale (144 vars)
│       ├── typography-literals.css  # Literal text-transform values (3 vars)
│       ├── base-variables.css # Unprefixed semantic defaults — NTG (82 vars)
│       ├── index.css          # Barrel: all layers with NTG defaults
│       └── themes/
│           ├── theme-ntg.css          # NT.GOV.AU theme — Lato, ochre (796 vars)
│           ├── theme-central.css      # NTG Central theme — Roboto, green (696 vars)
│           ├── typography-ntg.css     # Bootstrap --bs-* overrides, NTG (40 vars)
│           └── typography-central.css # Bootstrap --bs-* overrides, Central (40 vars)
└── scripts/                   # Build scripts
    ├── build-tokens.js        # CSS generator
    ├── validate-tokens.js     # Validates tokens.json structure
    └── generate-js-tokens.js  # JS/TS generator
```

## Contributing / Token workflow

All files in `dist/` are auto-generated — **never edit them manually**.

To update tokens:
1. Export updated tokens from Figma and replace `tokens.json` at the package root.
2. Validate, build, and verify:

```bash
npm run build          # validate + generate CSS + generate JS/TS
```

Individual steps:

```bash
npm run tokens:validate  # Validate tokens.json structure and report statistics
npm run tokens:build     # Generate CSS files into dist/css/
npm run build:js         # Generate JS/TS files into dist/
```

## Publishing

This package is published to GitHub Packages under the `@ntgovernment` scope.

```bash
npm publish
```
