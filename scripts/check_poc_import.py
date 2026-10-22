"""Verify the unchanged imported source/assets/results against the PoC snapshot."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "backend/poc"
manifest = json.loads((root / "IMPORT_MANIFEST.json").read_text())
patches = json.loads((root / "IMPORT_PATCHES.json").read_text())["files"] if (root / "IMPORT_PATCHES.json").exists() else {}
for name, expected in manifest["files"].items():
    data = (root / name).read_bytes()
    if name in patches:
        patch = patches[name]
        original = (root / patch["original_path"]).read_bytes()
        assert patch["reason"] and patch["original_sha256"] == expected["sha256"]
        assert hashlib.sha256(original).hexdigest() == expected["sha256"] and len(original) == expected["bytes"]
        assert hashlib.sha256(data).hexdigest() == patch["patched_sha256"]
    elif hashlib.sha256(data).hexdigest() != expected["sha256"] or len(data) != expected["bytes"]:
        raise ValueError(f"Imported PoC file changed: {name}")
assert patches.keys() <= manifest["files"].keys()
print(f"PASS {len(manifest['files'])} imported originals verified; {len(patches)} explicit source patch(es) verified separately")
