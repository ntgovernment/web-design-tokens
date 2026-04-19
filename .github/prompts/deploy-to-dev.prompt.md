---
description: "Deploy @ntgovernment/web-design-tokens to the dev branch: stage all changes, determine the next semantic version, write a conventional commit message summarising the session's work, commit, and push to origin/dev."
name: "Deploy to Dev"
agent: agent
tools: [run_in_terminal, get_changed_files]
---

Deploy the current working state to the `dev` branch by following these steps in order. Stop and report any errors before continuing.

## Step 1 — Verify working directory

```bash
git -C "D:/Projects/web-design-tokens" status
```

Confirm you are in the `web-design-tokens` repo root. If there is no git repository, initialise one first:

```bash
git -C "D:/Projects/web-design-tokens" init
git -C "D:/Projects/web-design-tokens" checkout -b dev
```

## Step 2 — Stage all changes

```bash
git -C "D:/Projects/web-design-tokens" add .
```

## Step 3 — Determine the next semantic version

1. Check the current version in `package.json`
2. Read the git log to see recent version tags: `git tag --sort=-version:refname | head -10`
3. Choose the next version using [Semantic Versioning](https://semver.org/):
   - **patch** (x.x.+1) — bug fixes, documentation updates, regenerated output, encoding fixes
   - **minor** (x.+1.0) — new exports, new scripts, new token categories, new CSS layers
   - **major** (+1.0.0) — breaking changes to exports, renamed files, removed entries
4. Update the `version` field in `package.json` with the chosen version
5. Stage the updated `package.json`: `git add package.json`

## Step 4 — Write a conventional commit message

Compose a commit message that follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<body — bullet points summarising all significant changes>

<footer — breaking changes or issue references if applicable>
```

**Types**: `feat`, `fix`, `docs`, `chore`, `refactor`, `build`  
**Scope**: use `tokens`, `css`, `scripts`, `dist`, or the file area affected

Base the message on the changes staged in step 2. Use `git diff --cached --stat` and `git diff --cached` to read the actual diff rather than guessing.

Example:

```
feat(tokens): extract design tokens into standalone npm package

- Initialise @ntgovernment/web-design-tokens package
- Copy tokens.json (849 tokens, 110 KB) from web-design-system repo
- Add scripts/build-tokens.js (path-adjusted for new package layout)
- Add scripts/validate-tokens.js
- Add scripts/generate-js-tokens.js for ESM/CJS/DTS exports
- Generate 9 CSS token layers into css/
- Generate dist/index.{mjs,cjs,d.ts} with colors, spacing, typography, shadows, borders, grid exports
- Add .github/prompts for update-documentation and deploy-to-dev workflows
- Fix UTF-8 encoding corruption introduced by PowerShell path replacements
```

## Step 5 — Commit

```bash
git -C "D:/Projects/web-design-tokens" commit -m "<your message from step 4>"
```

## Step 6 — Push to dev

```bash
git -C "D:/Projects/web-design-tokens" push origin dev
```

If the remote `origin` does not exist yet, report it and ask the user to add it:

```bash
git remote add origin https://github.com/ntgovernment/web-design-tokens.git
```

## Step 7 — Tag the release

Create an annotated-style lightweight tag matching the version from step 3 and push it:

```bash
git -C "D:/Projects/web-design-tokens" tag v<version>
git -C "D:/Projects/web-design-tokens" push origin v<version>
```

Example for version 3.0.0:

```bash
git -C "D:/Projects/web-design-tokens" tag v3.0.0
git -C "D:/Projects/web-design-tokens" push origin v3.0.0
```

## After pushing

Report:

- The commit hash and short message
- The version number used
- The branch and remote it was pushed to
- The tag created and pushed
- Any warnings from git
