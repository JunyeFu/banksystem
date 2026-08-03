#!/usr/bin/env python3
"""Verify the reproducible Python toolchain required by this repository."""

from __future__ import annotations

import importlib
import importlib.metadata
import sys


REQUIRED_PYTHON = (3, 14)
REQUIRED_DISTRIBUTIONS = {
    "PyYAML": "yaml",
    "python-docx": "docx",
    "reportlab": "reportlab",
    "pypdf": "pypdf",
    "Flask": "flask",
    "gunicorn": "gunicorn",
}


def main() -> int:
    if sys.version_info[:2] != REQUIRED_PYTHON:
        print(
            "PYTHON_ENVIRONMENT=FAIL "
            f"expected={REQUIRED_PYTHON[0]}.{REQUIRED_PYTHON[1]} "
            f"actual={sys.version_info.major}.{sys.version_info.minor}"
        )
        return 1

    missing: list[str] = []
    versions: list[str] = []
    for distribution, module in REQUIRED_DISTRIBUTIONS.items():
        try:
            importlib.import_module(module)
            versions.append(f"{distribution}={importlib.metadata.version(distribution)}")
        except (ImportError, importlib.metadata.PackageNotFoundError):
            missing.append(distribution)

    if missing:
        print(f"PYTHON_ENVIRONMENT=FAIL missing={','.join(sorted(missing))}")
        return 1

    print(
        "PYTHON_ENVIRONMENT=PASS "
        f"python={sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro} "
        + " ".join(versions)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
