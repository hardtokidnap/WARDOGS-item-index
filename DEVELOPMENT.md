# Development

This repository contains the website, referenced icons and a public data
snapshot. Mining tools, local exports, machine paths, private research tasks and
game binaries stay outside this repository. Game virtual asset paths, hashes and
JSON pointers remain as provenance. Raw gameplay statistics remain available in
the interface; complete export graphs and local repair metadata are excluded.

## Validate

Requires Python 3.10 or newer, with no extra packages:

```sh
python -B scripts/build_site.py
python -B scripts/check_release.py
```

`site/release.json` records the snapshot hash and every deployed file hash.
The page embeds the same JSON snapshot, so loading it requires no data API.
Keep `index.html`, `data/` and `site-assets/` together under the project URL.
The maintainable UI lives in `src/`; edit it here. The public builder reads only
these UI sources, the reviewed snapshot and its referenced icons. It requires no
mining workspace, game installation, raw export, credentials or data API.

## Publish a reviewed update

1. Edit `src/` for UI changes, or manually promote a reviewed public snapshot and its referenced icons for data updates.
2. Run the builder and checker, then review the Git diff. Commit and push to `main`.
3. Open **Actions → Deploy reviewed website → Run workflow** on `main`.

Deployment runs only when manually dispatched. Pushing a commit does not deploy.
The workflow checks the public release before uploading the `site/` artifact.
Actions are pinned to verified commit hashes. No mining task runs in GitHub.
