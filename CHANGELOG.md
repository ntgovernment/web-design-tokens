# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-04-19

### Added

- **Standalone bundled theme files** (`theme-ntg.bundled.css`, `theme-central.bundled.css`) that inline all shared layers — no `@import` statements, safe for all bundler configurations.
- **CSS validation script** (`scripts/validate-css.js`) runs post-build to catch self-referencing variables, undefined `var()` references, spurious RGB decomposition, and broken `@import` paths.
- **CI workflow** (`.github/workflows/ci.yml`) runs `npm run build` (including CSS validation) on pushes to `dev`/`main` and on pull requests.
- **Backward-compatible deprecated aliases** for renamed tokens (see "Changed" below).

### Fixed

- **Broken desktop button aliases** in `base-variables.css`: `--type-desktop-button-default-size` and `--type-desktop-button-sm-size` now correctly reference `--type-button-label-default-size` and `--type-button-label-sm-size` from `typography.css`.
- **Broken mobile heading aliases** in `base-variables.css`: mobile heading aliases (`--type-mobile-h1-size` etc.) no longer reference non-existent `--type-mobile-heading-h1-size` variables.
- **20 self-referencing circular variables** in `base-variables.css` (`--X: var(--X)`) are now omitted — these tokens are defined with concrete values in `typography.css` and don't need aliases.
- **Spurious RGB decomposition** on non-colour tokens: `-r`, `-g`, `-b`, `-rgb` suffix variants are no longer generated for typography, radii, border-width, or text-transform tokens. RGB decomposition is now limited to colour tokens (`clr-*` prefix) and primitive hex values only.
- **Bootstrap override font family reference**: `--bs-font-sans-serif` and `--bs-body-font-family` now correctly reference `--${prefix}-type-font-family-default` (was `--${prefix}-type-font-default`).
- **Central theme Bootstrap overrides**: primitive colour references now use correct Central naming (`neutrals-06` not `neutral-06`, `success-03` not `success-03-d`, etc.).
- **Publish workflow** now runs `npm run build` before `npm publish` instead of using `--ignore-scripts`.

### Changed

- **`--type-button-label-small-*`** renamed to **`--type-button-label-sm-*`** for consistency with other small-variant tokens (`body-sm`, `link-sm`, `uppercase-sm`). Deprecated alias `--type-button-label-small-*` → `var(--type-button-label-sm-*)` provided for backward compatibility.
- **`--border-width-xxl`** renamed to **`--border-width-2xl`** for consistency with the spacing scale (`--sp-2xl`). Deprecated alias `--border-width-xxl` → `var(--border-width-2xl)` provided for backward compatibility.

## Migration guide: v2 → v3

The v3.0.0 release included the following token renames. If migrating from v2, update your CSS accordingly:

### Spacing

| v2         | v3         |
| ---------- | ---------- |
| `--sp-xxl` | `--sp-2xl` |

### Typography

| v2                         | v3                                                              |
| -------------------------- | --------------------------------------------------------------- |
| `--type-font-default`      | `--type-font-family-default`                                    |
| `--type-font-alt`          | `--type-font-family-alt`                                        |
| `--type-body-small-*`      | `--type-body-sm-*`                                              |
| `--type-uppercase-small-*` | `--type-uppercase-sm-*`                                         |
| `--type-button-default-*`  | `--type-button-label-default-*`                                 |
| `--type-button-small-*`    | `--type-button-label-sm-*` (was `button-label-small` in v3.0.x) |
