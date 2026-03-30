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
import { colors, spacing, typography, shadows, borders, radii, grid } from '@ntgovernment/web-design-tokens';

// NTG primitive colors
console.log(colors.ntg.blue['03-d']); // '#1F1F5F'

// Spacing scale
console.log(spacing.xs); // '0.5rem'

// Typography scale
console.log(typography.heading.h1.size); // '2.5rem'
```

### Raw tokens

```js
import tokens from '@ntgovernment/web-design-tokens/tokens.json' assert { type: 'json' };
```

## Token layers

| File | Variables | Content |
|------|-----------|---------|
| `css/common.css` | 25 | Shadows, spacing, border widths, radii |
| `css/grid.css` | 15 | Bootstrap-compatible grid breakpoints |
| `css/typography.css` | 144 | Theme-agnostic typography scale |
| `css/typography-literals.css` | — | Literal `text-transform` values |
| `css/base-variables.css` | — | Unprefixed semantic defaults (NTG) |
| `css/theme-ntg.css` | 131+ | NT.GOV.AU theme — Lato, ochre accent |
| `css/theme-central.css` | 131+ | NTG Central theme — Roboto, green accent |
| `css/typography-ntg.css` | — | Bootstrap `--bs-*` overrides (NTG) |
| `css/typography-central.css` | — | Bootstrap `--bs-*` overrides (Central) |

Theme files (`theme-ntg.css`, `theme-central.css`) automatically import `common.css`, `grid.css`, `typography.css`, and `typography-literals.css` — so importing one theme file is all you need.

## Updating tokens

Tokens are sourced from Figma via `tokens.json`. To regenerate all CSS and JS output after updating that file:

```bash
npm run build
```

Individual steps:

```bash
npm run tokens:validate   # Validate tokens.json structure
npm run tokens:build      # Generate CSS files into css/
npm run build:js          # Generate JS/TS files into dist/
```

## Publishing

This package is published to GitHub Packages under the `@ntgovernment` scope.

```bash
npm publish
```
