# Notes for Claude

## Naming

- The product is **Brickflux**. Use that name in UI copy, docs, PR titles and deploy names. The GitHub repo is still `make-or-break` until it is renamed; the Vercel project is already `brickflux`.
- Branches: kebab-case words that say what the change does, e.g. `lead-change-chart` or `challenge-mode`. No tool prefixes (`claude/`, `codex/`), no random words or codes (`brave-mendel`, `i7kr77`), no dates.
- PR titles: a plain sentence saying what changes for the player or the repo, e.g. "Show when the lead changed on the result screen". Match the style of earlier PRs.
- Keep names coherent across GitHub and Vercel. If the GitHub repo can't be renamed, rename the Vercel project to match the GitHub repo instead.

## Workflow

- Small changes (copy, a URL, a one-function fix): push straight to `main` after the checks below pass.
- Anything bigger: open a PR with a meaningful branch name and title, then merge it once CI is green.
- Don't post comments on PRs or issues, and don't add AI-tool attribution or links to PR descriptions or comments.

## Hosting

- Production is on Vercel (project `brickflux`), deployed from `main`. There is no GitHub Pages deploy.

## Checks before pushing

- `npm test` (set `CHROMIUM_PATH` if Chromium is already installed).
- After a visual change, `npm run media` regenerates `og.png` and `brickflux.gif`.
