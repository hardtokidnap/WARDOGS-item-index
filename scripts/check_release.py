"""Validate the portable public snapshot and Pages artifact. Python stdlib only."""
from __future__ import annotations

import base64
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from build_site import render_markdown, safe_link

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
PUBLIC_ROOTS = set("items weapons attachments ammo routes ammoRoutes rankings unlocks roles mastery economy rewards damage coverage categoryOrder utility impulseChoices weaponCurves comparisonEntities armorEffects armorEffectDefinitions loadoutUi globalProjectileConfig armorOperationModels armorOperationFormula queue".split())
PRIVATE_KEYS = set("rawJson rawExportFile localFile rawFile outputDirectory localPath absolutePath artifact inventoryPackages exports schemaRepair effectsSchemaRepair mappingSha256 originalMappingSha256 mappingOverride repairedInnerType repairedSha256 testMapping validation exportValidation repairedProperties".split())
LOCAL = re.compile(r"(?i)(?:(?<![a-z0-9_])[a-z]:[\\/]|\\\\|file:/{1,3}|(?:^|[\s\"'])(?:work|outputs)[\\/]|/(?:Users|home|tmp)/|localhost|127\.0\.0\.1)")
SECRET = re.compile(r"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{30,})")
SECRET_KEY = re.compile(r"(?i)^(?:password|secret|clientSecret|credential|credentials|apiKey|api_key|authorization|accessToken|access_token|refreshToken|refresh_token|cookie|sessionId)$")
ICON = re.compile(r"site-assets/[0-9a-f]{16}\.png\Z")


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.bases = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "base":
            self.bases.append(attrs.get("href"))
        for key in ("src", "href", "poster"):
            if key in attrs:
                self.links.append(attrs[key])


def main():
    manifest = json.loads((SITE / "release.json").read_text())
    assert manifest["schemaVersion"] == 1 and manifest["projectBase"] == "/WARDOGS-item-index/"
    files = {p.relative_to(SITE).as_posix(): p for p in SITE.rglob("*") if p.is_file()}
    assert set(files) == set(manifest["files"]) | {"release.json"}
    for name, expected in manifest["files"].items():
        path = files[name]; assert not path.is_symlink()
        data = path.read_bytes()
        assert len(data) == expected["bytes"] and sha(data) == expected["sha256"], "Release file changed: " + name
    model_data = files["data/catalogue.json"].read_bytes()
    assert sha(model_data) == manifest["snapshotSHA256"]
    model = json.loads(model_data)
    assert set(model) == PUBLIC_ROOTS and model["queue"] == []
    assert "nodes" not in model["utility"] and "ammo" not in model["damage"]
    refs = set(); scalars = 0
    def walk(value):
        nonlocal scalars
        if isinstance(value, dict):
            for key, child in value.items():
                assert key not in PRIVATE_KEYS and not LOCAL.search(key) and not SECRET_KEY.fullmatch(key)
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
        elif isinstance(value, str):
            assert not LOCAL.search(value) and not SECRET.search(value), "Private string rejected"
            if value.startswith("site-assets/"):
                assert ICON.fullmatch(value)
                refs.add(value)
            scalars += 1
        else:
            scalars += 1
    walk(model)
    assert refs == {n for n in files if n.startswith("site-assets/")}
    for name in refs:
        assert files[name].read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
        assert urljoin("https://example.invalid/" + manifest["projectBase"].strip("/") + "/", name).startswith("https://example.invalid/WARDOGS-item-index/site-assets/")
    html = files["index.html"].read_text(encoding="utf-8")
    packed = re.search(r'<script id="site-data" type="application/gzip\+base64">(.*?)</script>', html, re.S)
    assert packed
    encoded = base64.b64decode(packed[1], validate=True)
    assert encoded[4:8] == b"\x00\x00\x00\x00" and encoded[9] == 255
    assert gzip.decompress(encoded) == model_data
    assert "__SITE_DATA__" not in html and "__SITE_RUNTIME__" not in html
    page = Page(); page.feed(html)
    assert not page.bases and all(safe_link(link) for link in page.links)
    documents = {"about": "README.md", "changelog": "CHANGELOG.md"}
    assert set(manifest["documentSourceSHA256"]) == set(documents.values())
    for view, name in documents.items():
        text = (ROOT / name).read_text(encoding="utf-8")
        assert sha((ROOT / name).read_bytes()) == manifest["documentSourceSHA256"][name]
        section = re.search(r'<section id="' + view + r'" class="section document-page" hidden aria-label="[^"]+"><article class="panel content">(.*?)</article></section>', html, re.S)
        assert section and section[1] == render_markdown(text), "Document render differs: " + name
        assert f'data-view="{view}"' in html
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "## Validate" not in readme and "## Publish" not in readme
    assert "GPT-6.1 Sol" in readme and "## Sources" in readme and "## Important notice" in readme
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    assert re.findall(r"^## (.+)$", changelog, re.M) == ["[Unreleased]", "[0.1.0] - 2026-10-20"]
    assert re.findall(r"^### (.+)$", changelog, re.M) == ["Added"]
    roadmap_data = (ROOT / "src/roadmap.json").read_bytes()
    assert sha(roadmap_data) == manifest["publicRoadmapSHA256"]
    roadmap = json.loads(roadmap_data)
    roadmap_script = re.search(r'<script id="public-roadmap" type="application/json">(.*?)</script>', html, re.S)
    assert roadmap_script and json.loads(roadmap_script[1]) == roadmap and len(roadmap) >= 3
    assert {row["status"] for row in roadmap} == {"done", "planned", "paused"}
    assert all(set(row) == {"id", "status", "label"} for row in roadmap)
    walk(roadmap)
    assert all(not re.search(r"native decoding|currently active|in.progress|working.on", row["label"], re.I) for row in roadmap)
    assert '__PUBLIC_ROADMAP__' not in html
    assert '<section id="overview" class="section">' in html and '<section id="catalogue" class="section" hidden>' in html
    assert '<button data-view="overview" class="active">' in html
    assert "__ABOUT_CONTENT__" not in html and "__CHANGELOG_CONTENT__" not in html
    assert render_markdown("# Title\n\nA paragraph.\n\n- One\n- Two") == "<h1>Title</h1>\n<p>A paragraph.</p>\n<ul><li>One</li><li>Two</li></ul>"
    hostile = render_markdown('<script>alert(1)</script> [bad](javascript:alert) [data](data:text/html,x) [good](https://example.org/notes)')
    assert "<script>" not in hostile and "&lt;script&gt;" in hostile
    assert 'href="javascript:' not in hostile and 'href="data:' not in hostile
    assert 'href="https://example.org/notes"' in hostile
    for target in ("javascript:alert(1)", "data:text/html,x", "//example.org", "https://user:pass@example.org", "https://example.org/\nattack"):
        assert not safe_link(target)
    assert not re.search(r"url\(", html)
    runtime = re.search(r'<script type="module">(.*?)</script>', html, re.S)[1]
    assert not re.search(r"\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|serviceWorker|import\s*\()", runtime)
    assert (ROOT / "src/runtime.js").read_text(encoding="utf-8").rstrip().endswith("setView('overview');") and "PUBLIC_ROADMAP.map(t=>" in runtime
    assert "if(b.dataset.view)setView(b.dataset.view)" in runtime
    assert set(re.findall(r"\bM\.([A-Za-z_$][A-Za-z0-9_$]*)", runtime)) <= PUBLIC_ROOTS
    for key in ("items", "weapons", "attachments", "ammo", "routes", "unlocks"):
        assert len(model[key]) == manifest["collections"][key]
    assert len(model["weapons"]) == 47 and len(model["items"]) == 582
    assert len(model["globalProjectileConfig"]["fields"]) == 510
    assert model["weapons"]["id.item.m4"]["stats"] and model["weapons"]["id.item.m4"]["attributes"]
    for weapon in model["weapons"].values():
        assert "fragments" in weapon["raw"]
    for armor in model["damage"]["armor"]:
        assert isinstance(armor["raw"], dict) and armor["raw"]
    for item in model["utility"]["items"].values():
        assert not (set(item) & {"rawDefinitions", "armorRecords", "containers", "nodeKeys", "unsupportedStates"})
    # Whole checkout release boundary: no private mining helpers or stray exports.
    sources = {"template.html", "metrics.js", "runtime.js", "comparison.js", "gear.js"}
    assert set(manifest["uiSourceSHA256"]) == sources
    for name in sources:
        assert sha((ROOT / "src" / name).read_bytes()) == manifest["uiSourceSHA256"][name]
    allowed = {"README.md", "DEVELOPMENT.md", "CHANGELOG.md", "CONTRIBUTING.md", "src/roadmap.json", ".gitignore", ".gitattributes", ".github/workflows/deploy.yml", "scripts/check_release.py", "scripts/build_site.py", "scripts/check_ammo_offers.cjs", "scripts/check_curves.cjs", "scripts/check_magazines.cjs"}
    allowed |= {"src/" + name for name in sources}
    for path in ROOT.rglob("*"):
        if ".git" in path.relative_to(ROOT).parts or not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        assert rel.startswith("site/") or rel in allowed, "Unexpected checkout file: " + rel
        if path.suffix in {".md", ".py", ".yml", ".html", ".js"}:
            content = path.read_text(encoding="utf-8")
            # The checker's literal rejection regex is code, not leaked data.
            if rel != "scripts/check_release.py":
                assert not LOCAL.search(content) and not SECRET.search(content)
    print(json.dumps({"status": "passed", "siteFiles": len(files), "siteBytes": sum(p.stat().st_size for p in files.values()),
                      "icons": len(refs), "snapshotBytes": len(model_data), "snapshotSHA256": sha(model_data),
                      "checkedScalarValues": scalars, "localPaths": 0, "credentialPatterns": 0, "privateExportStructures": 0,
                      "defaultView": "Overview", "publicRoadmapEntries": len(roadmap), "documentTabs": ["About", "Changelog"], "markdownChecks": "Single-source content, headings/paragraphs/bullets/safe links, HTML escaping and rejected unsafe URL schemes",
                      "validationLimit": "Static data, exact hashes, decode, document/nav and project-subpath checks; no browser UX test."}, indent=2))


if __name__ == "__main__":
    main()
