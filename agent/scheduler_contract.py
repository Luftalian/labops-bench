"""Read-only checks for the draft scheduler boundary, not engine acceptance.

Geometry, motion/setup models, resource reservations and transaction execution
must still be validated by the future engine bridge.
"""
from collections import Counter

from backend.counts.validate import validate


def unique(items, key, label):
    values = [item[key] for item in items]
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {label}")


def check_layout(layout, context):
    unique(layout["devices"], "id", "device id")
    unique(layout["robots"], "id", "arm id")
    arms = {r["id"] for r in layout["robots"]}
    if arms & {d["id"] for d in layout["devices"]}:
        raise ValueError("device and arm ids overlap")
    owned = layout["devices"] + layout.get("parked_devices", [])
    unique(owned, "id", "owned device id")
    if layout.get("parked_devices") and not context.get("external_staging"):
        raise ValueError("external staging disabled")
    counts = Counter(d["model"] for d in owned)
    if any(n > context["resource_limits"]["equipment"][k] for k, n in counts.items()):
        raise ValueError("equipment count limit")
    if not 1 <= len(arms) <= context["resource_limits"]["arms"]:
        raise ValueError("arm count limit")
    for device in layout["devices"]:
        if device["input_robot_id"] not in arms or device["output_robot_id"] not in arms:
            raise ValueError("unknown port arm")


def check_exchange(observation, decision):
    """Raise on malformed/stale proposals, without mutating either argument.

    Success only means the envelope is consistent. It is not a geometry
    certificate, receipt, reservation or authorization to change the engine.
    """
    validate(observation, "SchedulerObservation")
    validate(decision, "SchedulerDecision")
    for key in ("session_id", "snapshot_id", "epoch_id", "state_version"):
        if decision[key] != observation[key]:
            raise ValueError(f"stale or wrong {key}")
    if observation["phase"] == "done" or decision["type"] != observation["phase"]:
        raise ValueError("decision phase mismatch")
    jobs = observation["jobs"]
    unique(jobs, "job_id", "observed job")
    if observation["completed_jobs"] + len(jobs) != observation["total_jobs"]:
        raise ValueError("remaining workload is incomplete")
    for job in jobs:
        unique(job["nodes"], "node_id", "node")
        ids = {n["node_id"] for n in job["nodes"]}
        parents = {n["node_id"]: set(n["depends_on"]) for n in job["nodes"]}
        if any(not p <= ids for p in parents.values()):
            raise ValueError("unknown dependency")
        resolved = set()
        while len(resolved) < len(ids):
            ready = {n for n, p in parents.items() if n not in resolved and p <= resolved}
            if not ready:
                raise ValueError("dependency cycle")
            resolved |= ready
    priorities = decision["priorities"]
    unique(priorities, "job_id", "priority job")
    if {p["job_id"] for p in priorities} != {j["job_id"] for j in jobs}:
        raise ValueError("priorities must cover exactly the remaining jobs")
    context = observation["context"]
    catalog = observation["catalog"]
    if (context["catalog_id"], context["catalog_version"]) != (catalog["catalog_id"], catalog["version"]):
        raise ValueError("catalog context mismatch")
    if decision["type"] == "initial_design":
        design = decision["initial_design"]
        for key in ("task_id", "task_version", "simulation_seed"):
            if design[key] != context[key]:
                raise ValueError(f"design {key} mismatch")
        if design["submission_id"] != decision["decision_id"]:
            raise ValueError("initial submission identity mismatch")
        if any(n > context["resource_limits"]["equipment"][k] for k, n in design["equipment_counts"].items()):
            raise ValueError("equipment count limit")
        for field, limit in (("arm_count", "arms"), ("amr_count", "amrs")):
            if not 1 <= design[field] <= context["resource_limits"][limit]:
                raise ValueError(f"{field} limit")
        if "layout" in design:
            check_layout(design["layout"], context)
            counts = Counter(d["model"] for d in design["layout"]["devices"] + design["layout"].get("parked_devices", []))
            if any(counts[k] != n for k, n in design["equipment_counts"].items()):
                raise ValueError("exact equipment inventory mismatch")
            if len(design["layout"]["robots"]) != design["arm_count"]:
                raise ValueError("exact arm inventory mismatch")
        return
    if decision["reconfiguration"]["mode"] == "keep":
        return
    if observation["reconfiguration_state"]["phase"] != "idle":
        raise ValueError("reconfiguration_in_progress")
    target = decision["reconfiguration"]["layout"]
    check_layout(target, context)
    old = observation["layout"]
    config = observation["config"]
    for category in ("devices", "robots"):
        before = {d["id"]: d for d in old[category] + (old.get("parked_devices", []) if category == "devices" else [])}
        after = {d["id"]: d for d in target[category] + (target.get("parked_devices", []) if category == "devices" else [])}
        if before.keys() != after.keys():
            raise ValueError("physical inventory ids must be preserved")
        for key, a in before.items():
            b = after[key]
            if category == "robots":
                if a != b and not config["allow_arm_relocation"]:
                    raise ValueError("arm relocation disabled")
                continue
            if a["model"] != b["model"]:
                raise ValueError("equipment models must be preserved during relocation")
            moved = any(a.get(k) != b.get(k) for k in ("x", "y", "rotation", "input_robot_id", "output_robot_id"))
            if moved and (not config["allow_device_relocation"] or catalog["equipment"][a["model"]].get("mobility") != "mobile"):
                raise ValueError("device relocation disabled or fixed device")
