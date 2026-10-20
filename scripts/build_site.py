"""Render this repository's UI from its reviewed public snapshot. Stdlib only."""
from __future__ import annotations

import base64
import gzip
import hashlib
from html import escape
import io
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SOURCES = ("template.html", "metrics.js", "runtime.js", "comparison.js", "gear.js")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_link(target):
    """Only explicit web URLs and same-page fragments become links."""
    if not target or any(char.isspace() or ord(char) < 32 for char in target) or chr(92) in target:
        return False
    if target.startswith("#"):
        return True
    try:
        url = urlsplit(target)
        return url.scheme in {"https", "http"} and bool(url.hostname) and url.username is None and url.password is None
    except ValueError:
        return False


def render_markdown(text):
    """Render the docs' headings, paragraphs, bullets and safe links; HTML stays text."""
    def inline(value):
        result = []; start = 0
        for match in re.finditer(r"\[([^\]\n]+)\]\(([^)\n]+)\)", value):
            result.append(escape(value[start:match.start()]))
            label, target = match.groups()
            result.append(f'<a href="{escape(target, quote=True)}">{escape(label)}</a>' if safe_link(target) else escape(label))
            start = match.end()
        result.append(escape(value[start:]))
        return "".join(result)
    result = []; paragraph = []; bullets = []
    def flush():
        if paragraph:
            result.append("<p>" + inline(" ".join(paragraph)) + "</p>"); paragraph.clear()
        if bullets:
            result.append("<ul>" + "".join("<li>" + inline(item) + "</li>" for item in bullets) + "</ul>"); bullets.clear()
    for line in text.splitlines():
        heading = re.fullmatch(r"(#{1,3}) (.+)", line)
        if not line.strip():
            flush()
        elif heading:
            flush(); level = len(heading[1]); result.append(f"<h{level}>" + inline(heading[2]) + f"</h{level}>")
        elif line.startswith("- "):
            if paragraph: flush()
            bullets.append(line[2:])
        else:
            if bullets: flush()
            paragraph.append(line.strip())
    flush()
    return "\n".join(result)


def main():
    model_data = (SITE / "data/catalogue.json").read_bytes()
    model = json.loads(model_data)
    source_data = {name: (ROOT / "src" / name).read_bytes() for name in SOURCES}
    template = source_data["template.html"].decode("utf-8")
    assert template.count("__SITE_DATA__") == template.count("__SITE_RUNTIME__") == 1
    documents = {name: (ROOT / name).read_bytes() for name in ("README.md", "CHANGELOG.md")}
    for placeholder, name in (("__ABOUT_CONTENT__", "README.md"), ("__CHANGELOG_CONTENT__", "CHANGELOG.md")):
        assert template.count(placeholder) == 1
        template = template.replace(placeholder, render_markdown(documents[name].decode("utf-8")))
    roadmap_data = (ROOT / "src/roadmap.json").read_bytes()
    roadmap = json.loads(roadmap_data)
    assert roadmap and all(set(row) == {"id", "status", "label"} and row["status"] in {"done", "planned", "paused"} and isinstance(row["label"], str) and row["label"] for row in roadmap)
    assert template.count("__PUBLIC_ROADMAP__") == 1
    template = template.replace("__PUBLIC_ROADMAP__", json.dumps(roadmap, ensure_ascii=True).replace("<", r"\u003c"))
    runtime = "\n".join(source_data[name].decode("utf-8") for name in SOURCES[1:])
    # GzipFile fixes the OS header byte across Python/platform versions.
    encoded = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", compresslevel=9, fileobj=encoded, mtime=0) as stream:
        stream.write(model_data)
    compressed = base64.b64encode(encoded.getvalue()).decode("ascii")
    html = template.replace("__SITE_DATA__", compressed).replace("__SITE_RUNTIME__", runtime).encode("utf-8")
    refs = set()
    def visit(item):
        if isinstance(item, dict):
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, str) and item.startswith("site-assets/"):
            assert re.fullmatch(r"site-assets/[0-9a-f]{16}\.png", item)
            refs.add(item)
    visit(model)
    assert all((SITE / ref).is_file() and not (SITE / ref).is_symlink() for ref in refs)
    assert not any(path.is_symlink() for path in (ROOT / "src").iterdir())
    manifest_path = SITE / "release.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["snapshotSHA256"] = sha(model_data)
    manifest["publicRoadmapSHA256"] = sha(roadmap_data)
    manifest["documentSourceSHA256"] = {name: sha(data) for name, data in documents.items()}
    manifest["uiSourceSHA256"] = {name: sha(data) for name, data in source_data.items()}
    manifest["collections"] = {key: len(value) for key, value in model.items() if isinstance(value, (list, dict))}
    files = {"index.html": html, "data/catalogue.json": model_data}
    files.update({ref: (SITE / ref).read_bytes() for ref in sorted(refs)})
    manifest["files"] = {name: {"bytes": len(data), "sha256": sha(data)} for name, data in sorted(files.items())}
    (SITE / "index.html").write_bytes(html)
    manifest_path.write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "built", "snapshotSHA256": sha(model_data), "htmlSHA256": sha(html), "icons": len(refs)}, indent=2))


if __name__ == "__main__":
    main()
