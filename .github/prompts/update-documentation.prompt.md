---
description: "Update comprehensive documentation for @ntgovernment/web-design-tokens — README, inline comments, and JSDoc — so it is accurate, complete, and useful to both developers and coding agents."
name: "Update Documentation"
agent: agent
tools: [read_file, replace_string_in_file, multi_replace_string_in_file, semantic_search, grep_search, run_in_terminal]
---

Update the documentation for this package to be comprehensive, accurate, and agent-friendly. Work through each area below in order.

## 1. README.md

Review [README.md](../../README.md) against the current package state and update:

- **Installation** — verify `.npmrc` snippet and registry URL are correct
- **CSS usage examples** — confirm every `@import` path matches a real entry in the `exports` map in [package.json](../../package.json)
- **JS/TS usage examples** — verify exported names (`colors`, `spacing`, `typography`, `shadows`, `borders`, `grid`) match [scripts/generate-js-tokens.js](../../scripts/generate-js-tokens.js) and [dist/index.d.ts](../../dist/index.d.ts)
- **Token layers table** — update variable counts to match actual generated CSS (check `css/*.css`)
- **Correct any stale values** — e.g. `spacing.xs` example value, `colors.ntg.blue` key examples
- Add a **Package structure** section showing the directory tree
- Add a **Contributing / token workflow** section explaining how to update `tokens.json` and regenerate output

## 2. Inline comments in scripts/

Review and update comments in:
- [scripts/build-tokens.js](../../scripts/build-tokens.js) — file header, function JSDoc, section banners; ensure all path references say `tokens.json` and `css/` (not `design-tokens/tokens.json` or `src/themes/`)
- [scripts/validate-tokens.js](../../scripts/validate-tokens.js) — file header and any inline comments
- [scripts/generate-js-tokens.js](../../scripts/generate-js-tokens.js) — file header, function comments, section banners

## 3. css/index.css

Review and update the barrel file comment in [css/index.css](../../css/index.css) so it accurately describes what is imported and the correct cascade order.

## 4. package.json

Check [package.json](../../package.json):
- `description` field is accurate
- `keywords` include relevant terms
- All `exports` paths resolve to real files (run `ls css/ dist/` to verify)

## Quality bar

After editing, validate:
- No references to `src/themes/` or `design-tokens/tokens.json` anywhere in documentation
- Every code example in README.md is syntactically valid
- Run `node scripts/validate-tokens.js` to confirm the package still works
- Run `node scripts/generate-js-tokens.js` to confirm JS output still generates cleanly
