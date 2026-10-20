# Contributing to WARDOGS Item Index

Contributions are welcome, whether that means reporting a bug, correcting an item or improving the website. This is a hobby project, so replies and updates may take time. Pull requests may be declined without further explanation.

## Expectations

Most of this project was built with AI. Some code is messy, some files are fucking huge, and I’m not pretending otherwise. This is a hobby project, so don’t expect professional support, quick replies or a neatly managed development process.

Contributions are welcome, but opening an issue or submitting a PR doesn’t guarantee a fix or a merge. PRs may be declined without further explanation.

## Reporting bugs and data mistakes

Open an issue with enough detail for someone else to reproduce the problem:

- Steps to reproduce, including the page, filters or Build Lab selections involved.
- What you expected and what happened instead.
- Your browser and version, operating system, and relevant screenshots or console errors.
- The affected item name or ID and the exact stat, price, unlock or comparison involved.
- For data corrections, the game build or date and a public source supporting the correction.

Separate observed values from interpretations. An in-game screenshot, official change note or existing public source reference helps. If something depends on attachments, ammunition or another condition, include that context. Missing data should stay missing until there is evidence for it.

## Working locally

Read [DEVELOPMENT.md](DEVELOPMENT.md) before changing the site. You need Python 3.10 or newer; the build scripts use the standard library and require no extra packages. The interface uses vanilla JavaScript, HTML and CSS.

Edit the maintainable interface in `src/`. The reviewed public snapshot is `site/data/catalogue.json`, and referenced icons are in `site/site-assets/`. The builder generates `site/index.html` and `site/release.json`; avoid patching generated HTML instead of its source.

From the repository root, build and validate site changes with:

```sh
python -B scripts/build_site.py
python -B scripts/check_release.py
```

Also check the affected interactions in a browser. The release checker does not replace testing the behavior you changed. Report checks you ran and anything you could not verify.

## Sending a pull request

1. Fork the repository and create a branch from `main`.
2. Keep the change small and focused. Discuss substantial features or architectural changes in an issue first.
3. Run relevant checks and inspect the diff, including regenerated site files where needed.
4. Explain the problem, the change and its validation. Include screenshots for visible changes and evidence for data corrections.
5. Open the pull request against `main`.

Keep the existing structure. Avoid large dependencies, unrelated cleanup and refactors without a clear reason. Data updates need deliberate review; do not automatically promote new exports into the public snapshot.

## AI-assisted contributions

AI assistance is welcome. You are responsible for everything you submit. Read and understand generated code, check its assumptions, run relevant checks and explain significant AI-generated changes or decisions in your pull request. Do not submit output you cannot explain or validate.

Never upload keys, credentials, private configuration, local machine paths, game binaries or raw exports in commits, issues or attachments. Share only the public evidence needed to explain a correction, with sensitive details removed.
