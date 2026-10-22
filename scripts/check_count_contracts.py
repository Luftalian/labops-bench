"""Check versioned count fixtures without executing a benchmark or model."""
import json
import subprocess
import sys
from pathlib import Path
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.counts.validate import SCHEMA, validate


def check(bundle):
    validate(bundle, "Fixture")
    catalog, workflow, task, request = (bundle[k] for k in ("catalog", "workflow", "task", "request"))
    assert (task["catalog_id"], task["catalog_version"]) == (catalog["catalog_id"], catalog["version"])
    assert (task["workflow_id"], task["workflow_version"]) == (workflow["workflow_id"], workflow["version"])
    assert (request["task_id"], request["task_version"]) == (task["task_id"], task["version"])
    assert request["simulation_seed"] == task["simulation_seed"]
    assert set(task["resource_limits"]["equipment"]) == set(catalog["equipment"])
    assert all(request["equipment_counts"][k] <= n for k, n in task["resource_limits"]["equipment"].items())
    assert request["arm_count"] <= task["resource_limits"]["arms"]
    assert request["amr_count"] <= task["resource_limits"]["amrs"]
    assert task["workload_parameters"]["seed"] == task["simulation_seed"]
    assert len({j["id"] for j in task["jobs"]}) == len(task["jobs"])
    for job in task["jobs"]:
        assert job["arrival_s"] < task["simulation_cutoff_s"]
        known = set()
        for node in job["nodes"]:
            assert node["id"] not in known
            assert set(node["parents"]) <= known
            assert node["duration_s"] > 0
            assert all(p["duration_s"] > 0 for p in node["program"])
            known.add(node["id"])


def main():
    Draft202012Validator.check_schema(SCHEMA)
    paths = sorted((ROOT / "fixtures/counts").glob("*.json"))
    assert paths, "No count fixtures"
    for path in paths:
        check(json.loads(path.read_text()))
        print(f"PASS counts/{path.name}")
    subprocess.run(["node", str(ROOT / "scripts/check-count-fixtures.mjs")], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
