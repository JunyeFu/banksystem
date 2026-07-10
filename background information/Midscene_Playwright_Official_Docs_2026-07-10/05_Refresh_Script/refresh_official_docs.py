#!/usr/bin/env python3
"""Download current official Midscene and Playwright documentation sources.

This standalone script uses only the Python standard library. Run it on an
internet-connected staging machine, then move the output through your approved
intranet import process.
"""
from __future__ import annotations
import argparse, hashlib, io, json, tarfile, urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPOS = {
    "midscene": ("https://github.com/web-infra-dev/midscene/archive/refs/heads/main.tar.gz", "apps/site/docs"),
    "playwright": ("https://github.com/microsoft/playwright.dev/archive/refs/heads/main.tar.gz", ""),
}
PW_SECTIONS = {"agent-cli", "common", "community", "dotnet", "java", "mcp", "nodejs", "python"}

def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "official-docs-archiver/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default="official_docs_output")
    args = ap.parse_args()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for product, (url, marker) in REPOS.items():
        blob = download(url)
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tf:
            for m in tf.getmembers():
                if not m.isfile() or Path(m.name).suffix.lower() not in {".md", ".mdx"}:
                    continue
                parts = Path(m.name).parts[1:]  # remove archive root
                rel = Path(*parts)
                if product == "midscene":
                    try: rel = rel.relative_to(marker)
                    except ValueError: continue
                else:
                    if not rel.parts or rel.parts[0] not in PW_SECTIONS: continue
                data = tf.extractfile(m).read()
                dst = out / product / rel.with_suffix(".md")
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(data)
                manifest.append({"product": product, "source": rel.as_posix(), "output": str(dst), "sha256": hashlib.sha256(data).hexdigest()})
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} pages to {out.resolve()}")
if __name__ == "__main__": main()
