"""Validate starter contracts and fixtures; this is not a lab simulator."""
import json
import math
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = json.loads((ROOT / "contracts/labops.schema.json").read_text())


def validate_shape(value, definition="Fixture"):
    schema = dict(SCHEMA, **{"$ref": f"#/$defs/{definition}"})
    Draft202012Validator(schema).validate(value)


def unique(items, key, label):
    values = [item[key] for item in items]
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {label}")


def validate_context(bundle):
    """Reject malformed task/catalog/workflow, independent of a candidate design."""
    validate_shape(bundle)
    c, w, t, r = (bundle[k] for k in ("catalog", "workflow", "task", "request"))
    for key, actual in [("catalog_id", c["catalog_id"]), ("catalog_version", c["version"]),
                        ("workflow_id", w["workflow_id"]), ("workflow_version", w["version"])]:
        if t[key] != actual:
            raise ValueError(f"reference mismatch: {key}")
    if (r["task_id"], r["task_version"]) != (t["task_id"], t["version"]):
        raise ValueError("request task mismatch")
    for items, key in [(c["devices"], "device_type"), (w["steps"], "step_id"),
                       (t["jobs"], "job_id"), (t["slots"], "slot_id"),
                       (t["transport"]["nodes"], "node_id")]:
        unique(items, key, key)
    devices = {d["device_type"]: d for d in c["devices"]}
    if set(devices) != set(r["equipment_counts"]):
        raise ValueError("catalog must define exactly the supported device types")
    if any(d["batch_capacity"] != 1 for d in devices.values()):
        raise ValueError("batch_capacity > 1 requires a new implemented batch policy")
    for i, step in enumerate(w["steps"]):
        previous = [] if i == 0 else [w["steps"][i - 1]["step_id"]]
        if step["depends_on"] != previous:
            raise ValueError("v0.1 supports a sequential workflow only")
        if step["operation"] not in devices[step["device_type"]]["supported_operations"]:
            raise ValueError("unsupported operation")
    if t["drain_limit_s"] < t["horizon_s"]:
        raise ValueError("drain limit precedes observation horizon")
    if any(j["release_at_s"] > t["horizon_s"] for j in t["jobs"]):
        raise ValueError("job released after horizon")
    for i, a in enumerate(t["slots"]):
        if a["x_m"] + a["width_m"] > t["room"]["width_m"] or a["y_m"] + a["depth_m"] > t["room"]["depth_m"]:
            raise ValueError("slot outside room")
        for b in t["slots"][:i]:
            if (a["x_m"] < b["x_m"] + b["width_m"] and b["x_m"] < a["x_m"] + a["width_m"]
                    and a["y_m"] < b["y_m"] + b["depth_m"] and b["y_m"] < a["y_m"] + a["depth_m"]):
                raise ValueError("overlapping slots")
    tr = t["transport"]
    nodes = {n["node_id"]: n for n in tr["nodes"]}
    graph = {n: set() for n in nodes}
    needed = {tr["entry_node"], tr["exit_node"]} | {s["port_node"] for s in t["slots"]}
    if not needed <= nodes.keys():
        raise ValueError("unknown port or entry/exit node")
    for e in tr["edges"]:
        a, b = e["from_node"], e["to_node"]
        if a not in nodes or b not in nodes or a == b:
            raise ValueError("invalid graph edge")
        direct = math.hypot(nodes[a]["x_m"] - nodes[b]["x_m"], nodes[a]["y_m"] - nodes[b]["y_m"])
        if e["distance_m"] + 1e-9 < direct:
            raise ValueError("edge shorter than straight-line distance")
        graph[a].add(b)
        graph[b].add(a)
    seen, pending = set(), [tr["entry_node"]]
    while pending:
        node = pending.pop()
        if node not in seen:
            seen.add(node)
            pending.extend(graph[node] - seen)
    if not needed <= seen:
        raise ValueError("unreachable slot/exit")


def design_violations(bundle):
    c, w, t, r = (bundle[k] for k in ("catalog", "workflow", "task", "request"))
    devices = {d["device_type"]: d for d in c["devices"]}
    counts = r["equipment_counts"]
    errors = set()
    cost = sum(devices[k]["unit_cost_credits"] * n for k, n in counts.items())
    if cost > t["equipment_budget_credits"]:
        errors.add("BUDGET_EXCEEDED")
    if any(n > devices[k]["max_instances"] for k, n in counts.items()):
        errors.add("MAX_INSTANCES")
    if any(counts[s["device_type"]] == 0 for s in w["steps"]):
        errors.add("MISSING_DEVICE")
    instances = [devices[k] for k, n in sorted(counts.items()) for _ in range(n)]
    if len(instances) > len(t["slots"]):
        errors.add("INSUFFICIENT_SLOTS")
    for d, s in zip(instances, sorted(t["slots"], key=lambda x: x["slot_id"])):
        if d["width_m"] > s["width_m"] or d["depth_m"] > s["depth_m"]:
            errors.add("FOOTPRINT_MISMATCH")
    return sorted(errors)


def close(actual, expected, label):
    if not math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9):
        raise ValueError(f"{label}: {actual} != {expected}")


def check_fixture(bundle):
    validate_context(bundle)
    violations = design_violations(bundle)
    if violations != sorted(bundle["expected_violation_codes"]):
        raise ValueError(f"unexpected design violations: {violations}")
    if "result" not in bundle:
        return
    result, task, request = (bundle[k] for k in ("result", "task", "request"))
    if result["result_origin"] != "hand_calculated_fixture":
        raise ValueError("starter fixtures must not claim simulation measurements")
    for key in ("submission_id", "task_id", "task_version"):
        if result[key] != request[key]:
            raise ValueError(f"result/request mismatch: {key}")
    if violations:
        if result["status"] != "invalid" or sorted(v["code"] for v in result["violations"]) != violations:
            raise ValueError("invalid response does not match design violations")
        return
    if result["status"] not in ("completed", "truncated"):
        raise ValueError("valid fixture needs completed or truncated result")
    events = result["events"]
    unique(events, "event_id", "event_id")
    unique(result["resolved_placement"], "instance_id", "instance_id")
    counts = Counter(p["device_type"] for p in result["resolved_placement"])
    if any(counts[k] != n for k, n in request["equipment_counts"].items()):
        raise ValueError("resolved instance count mismatch")
    job_ids = {j["job_id"] for j in task["jobs"]}
    step_ids = {s["step_id"] for s in bundle["workflow"]["steps"]}
    nodes = {n["node_id"] for n in task["transport"]["nodes"]}
    for e in events:
        if e["end_s"] < e["start_s"] or e["end_s"] > task["drain_limit_s"]:
            raise ValueError("invalid event time")
        if e["kind"] == "job_complete":
            if e["start_s"] != e["end_s"]:
                raise ValueError("job_complete must have zero duration")
        elif e["end_s"] == e["start_s"]:
            raise ValueError("zero duration intervals should be omitted")
        if e["job_id"] not in job_ids or (e["step_id"] is not None and e["step_id"] not in step_ids):
            raise ValueError("event references unknown job/step")
        if not set(e["path_nodes"]) <= nodes:
            raise ValueError("event references unknown node")
    completions = [e for e in events if e["kind"] == "job_complete"]
    unique(completions, "job_id", "job completion")
    h, m = task["horizon_s"], result["metrics"]
    completed = sum(e["end_s"] <= h for e in completions)
    close(m["completed_jobs"], completed, "completed_jobs")
    close(m["throughput_jobs_per_hour"], completed * 3600 / h, "throughput")
    cost = sum(d["unit_cost_credits"] * request["equipment_counts"][d["device_type"]] for d in bundle["catalog"]["devices"])
    close(m["equipment_cost_credits"], cost, "cost")
    close(m["cost_efficiency"], m["throughput_jobs_per_hour"] / cost, "efficiency")
    if result["status"] == "completed":
        if {e["job_id"] for e in completions} != job_ids:
            raise ValueError("completed status without all job completions")
        close(m["makespan_s"], max(e["end_s"] for e in completions), "makespan")
    distance = 0
    for e in events:
        if e["kind"].startswith("transport_"):
            overlap = max(0, min(e["end_s"], h) - e["start_s"])
            distance += e["distance_m"] * overlap / (e["end_s"] - e["start_s"])
    close(m["transport_distance_m"], distance, "transport distance")
    expected_instances = {p["instance_id"] for p in result["resolved_placement"]}
    if set(m["utilization"]) != expected_instances:
        raise ValueError("utilization instance mismatch")
    for inst, util in m["utilization"].items():
        busy = sum(max(0, min(e["end_s"], h) - e["start_s"]) for e in events if e["kind"] == "process" and e["resource_id"] == inst)
        close(util, busy / h, "utilization")


def main():
    Draft202012Validator.check_schema(SCHEMA)
    paths = sorted((ROOT / "fixtures").glob("*.json"))
    if not paths:
        raise ValueError("no fixtures found")
    for path in paths:
        check_fixture(json.loads(path.read_text()))
        print(f"PASS {path.name}")
    print("Contract checks passed. Simulator behavior is not implemented or tested here.")


if __name__ == "__main__":
    main()
