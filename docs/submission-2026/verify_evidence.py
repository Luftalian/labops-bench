#!/usr/bin/env python3
"""Check the submitted package against its existing recorded evidence, offline."""
import gzip
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    inventory = read_json(HERE / "evidence/package-manifest.json")
    for item in inventory["files"]:
        data = (HERE / item["path"]).read_bytes()
        require(len(data) == item["bytes"], f"Size mismatch: {item['path']}")
        require(digest(data) == item["sha256"], f"Hash mismatch: {item['path']}")

    provenance = read_json(HERE / "evidence/submission-provenance.json")
    for item in provenance["unchanged_evaluation_inputs"]:
        require(digest((REPO / item["path"]).read_bytes()) == item["sha256"],
                f"Evaluation input changed: {item['path']}")

    recordings = REPO / "benchmark/published"
    manifest = read_json(recordings / "manifest.json")
    results = {}
    counts = Counter()
    for item in manifest["files"]:
        packed = (recordings / item["path"]).read_bytes()
        raw = gzip.decompress(packed)
        require(digest(packed) == item["gzip_sha256"], f"Compressed hash: {item['path']}")
        require(digest(raw) == item["source_sha256"], f"Result hash: {item['path']}")
        result = json.loads(raw)
        metrics = result["metrics"]
        require(result["status"] == "completed", f"Incomplete run: {item['path']}")
        require(metrics["completed_jobs"] == metrics["total_jobs"], item["path"])
        require(math.isfinite(metrics["makespan_s"]), item["path"])
        key = (item["method"], item["task_id"])
        require(key not in results, f"Duplicate selected result: {key}")
        results[key] = (item, metrics)
        counts[item["method"]] += 1
    require(len(results) == 80, "Expected 80 selected trials")
    require(len({task for _, task in results}) == 16, "Expected 16 scenarios")
    require(len(counts) == 5 and set(counts.values()) == {16},
            "Expected five methods on every scenario")

    validation = read_json(REPO / "docs/SCHEDULER_REFRESH_VALIDATION.json")
    require(validation["complete"] and validation["source_report_sha256"] == manifest["source_report_sha256"],
            "Refresh validation does not match the selected recordings")
    require(validation["selected_results"] == validation["exact_recorded_replays"] == 80,
            "Refresh validation does not cover every selected trial")

    table = read_json(HERE / "evidence/benchmark-results.json")
    require(len(table["rows"]) == 80, "Incomplete evidence table")
    for row in table["rows"]:
        item, metrics = results[(row["method"], row["task_id"])]
        require(row["run_id"] == item["run_id"], "Run identity mismatch")
        require(row["makespan_s"] == metrics["makespan_s"], "Score mismatch")
        require(math.isclose(row["hours"], metrics["makespan_s"] / 3600,
                             rel_tol=0, abs_tol=1e-12), "Unit conversion mismatch")

    manuscript = read_json(HERE / "evidence/manuscript-validation.json")
    for row in manuscript["verified_result_rows"]:
        item, metrics = results[(row["method"], row["scenario"])]
        require(item["source_sha256"] == row["source_sha256"], "Quoted run mismatch")
        require(metrics["makespan_s"] == row["makespan_s"], "Quoted score mismatch")
        require(f"{metrics['makespan_s'] / 3600:.3f}" == row["hours_display"],
                "Quoted rounding mismatch")
    for name, item in manuscript["files"].items():
        require(digest((HERE / name).read_bytes()) == item["sha256"],
                f"Manuscript artifact changed: {name}")

    gallery = manuscript["gallery_submission"]
    require(gallery["selected_completed_trials"] == len(results)
            and gallery["scenarios"] == len({task for _, task in results})
            and gallery["methods"] == len(counts), "Gallery comparison scope mismatch")
    require(gallery["selected_recordings_manifest_sha256"]
            == digest((recordings / "manifest.json").read_bytes()),
            "Gallery selection manifest changed")
    for name, item in gallery["files"].items():
        data = (HERE / name).read_bytes()
        require(len(data) == item["bytes"] and digest(data) == item["sha256"],
                f"Gallery artifact changed: {name}")
        text = data.decode("utf-8")
        require(gallery["source_commit"] in text, "Missing pinned result reference")
        for row in gallery["verified_result_rows"]:
            selected, metrics = results[(row["method"], row["scenario"])]
            require(selected["run_id"] == row["run_id"]
                    and selected["source_sha256"] == row["source_sha256"],
                    "Gallery quoted run mismatch")
            require(metrics["makespan_s"] == row["makespan_s"]
                    and f"{metrics['makespan_s'] / 3600:.3f}" == row["hours_display"],
                    "Gallery quoted score mismatch")
            require(row["hours_display"] + " h" in text,
                    f"Gallery quoted value missing: {row['hours_display']}")

    sources = read_json(HERE / "evidence/source-records.json")
    require(len(sources["records"]) == 3, "Expected 3 public annotation records")
    for item in sources["records"]:
        require(digest((REPO / item["repository_file"]).read_bytes()) == item["sha256"],
                f"Annotation hash: {item['paper_id']}")
    workflows = read_json(REPO / "benchmark/lemat-sdl/workflows.json")
    require(len(workflows["workflows"]) == sources["workflow_count"] == 8,
            "Expected 8 scheduling templates")

    main_tex = (HERE / "latex/main.tex").read_text(encoding="utf-8")
    bib = (HERE / "latex/references.bib").read_text(encoding="utf-8")
    keys = set(re.findall(r"@\w+\{([^,]+),", bib))
    cited = {key for group in re.findall(r"\\cite\{([^}]+)\}", main_tex)
             for key in group.split(",")}
    require(keys == cited and len(keys) == 7, "Bibliography/citation mismatch")
    figure = (HERE / "latex/protocol-figure.tex").read_text(encoding="utf-8")
    for image in re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", figure):
        require((HERE / "latex" / image).is_file(), f"Missing figure asset: {image}")

    print(json.dumps({"package_files_verified": len(inventory["files"]),
                      "recordings_verified": len(results),
                      "scenarios": 16, "methods": dict(counts),
                      "quoted_result_rows": len(manuscript["verified_result_rows"]),
                      "gallery_quoted_result_rows": len(gallery["verified_result_rows"]),
                      "source_records": 3, "scheduling_templates": 8,
                      "bibliography_entries": 7, "model_calls": 0}, indent=2))


if __name__ == "__main__":
    main()
