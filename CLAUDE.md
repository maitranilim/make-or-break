# Notes for Claude

## Naming

- The product is **Brickflux**. Use that name in UI copy, docs, PR titles and deploy names. The GitHub repo is still `make-or-break` until it is renamed.
- Branches: `claude/<what-the-change-does>` in kebab-case, e.g. `claude/pages-deploy-link-previews` or `claude/prediction-streaks`. Never push work on an auto-generated name (random words like `brave-mendel`); create a descriptive branch first.
- PR titles: a plain sentence saying what changes for the player or the repo, e.g. "Deploy to GitHub Pages with link previews". Match the style of earlier PRs.
- Keep names coherent across GitHub and Vercel. If the GitHub repo can't be renamed, rename the Vercel project to match the GitHub repo instead.

## Checks before pushing

- `npm test` (set `CHROMIUM_PATH` if Chromium is already installed).
- After a visual change, `npm run media` regenerates `og.png` and `brickflux.gif`.
