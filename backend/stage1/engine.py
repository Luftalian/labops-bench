"""Main-repository Stage 1 policy; deliberately distinct from PoC hall policy.

No chemistry predictions or model calls. Inputs and metrics follow the existing
0.1 contract. The PoC's online reservation/batch policy cannot preserve these
semantics, so only the additional dynamic mode uses that engine unchanged.
"""
import copy
import heapq
import itertools

from scripts.check_contracts import design_violations, validate_context, validate_shape


def shortest_path(transport, source, target):
    """Positive undirected edges; equal distances break by the node-id sequence."""
    graph = {n["node_id"]: [] for n in transport["nodes"]}
    for edge in transport["edges"]:
        a, b, d = (edge[k] for k in ("from_node", "to_node", "distance_m"))
        graph[a].append((b, d))
        graph[b].append((a, d))
    pending = [(0, (source,))]
    visited = set()
    while pending:
        distance, path = heapq.heappop(pending)
        node = path[-1]
        if node in visited:
            continue
        if node == target:
            return distance, list(path)
        visited.add(node)
        for neighbor, length in graph[node]:
            if neighbor not in visited:
                heapq.heappush(pending, (distance + length, path + (neighbor,)))
    raise ValueError(f"Unreachable transport path: {source} -> {target}")


def evaluate_design(bundle, request=None):
    bundle = copy.deepcopy(bundle)
    bundle.pop("result", None)
    if request is not None:
        bundle["request"] = copy.deepcopy(request)
    validate_context(bundle)
    catalog, workflow, task, request = (bundle[k] for k in
                                        ("catalog", "workflow", "task", "request"))
    result = dict(schema_version="0.1", submission_id=request["submission_id"],
                  task_id=task["task_id"], task_version=task["version"],
                  result_origin="simulation", valid=False, status="invalid",
                  violations=[], metrics=None, resolved_placement=[], events=[])
    violations = design_violations(bundle)
    if violations:
        result["violations"] = [{"code": code, "message": code.replace("_", " ").lower()}
                                for code in violations]
        validate_shape(result, "EvaluationResult")
        return result
    devices = {d["device_type"]: d for d in catalog["devices"]}
    instances = [(kind, i + 1) for kind, count in sorted(request["equipment_counts"].items())
                 for i in range(count)]
    placement = [dict(instance_id=f"{kind}-{i:03d}", device_type=kind,
                      slot_id=slot["slot_id"], port_node=slot["port_node"])
                 for (kind, i), slot in zip(instances, sorted(task["slots"],
                                                           key=lambda x: x["slot_id"]))]
    Engine(task, workflow, placement, result).run()
    cost = sum(devices[k]["unit_cost_credits"] * count
               for k, count in request["equipment_counts"].items())
    h = task["horizon_s"]
    events = result["events"]
    completions = [e for e in events if e["kind"] == "job_complete"]
    completed = sum(e["end_s"] <= h for e in completions)
    throughput = completed * 3600 / h
    overlap = lambda e: max(0, min(e["end_s"], h) - e["start_s"])
    all_done = len(completions) == len(task["jobs"])
    result.update(valid=True, status="completed" if all_done else "truncated",
                  resolved_placement=placement,
                  metrics=dict(completed_jobs=completed, throughput_jobs_per_hour=throughput,
                               equipment_cost_credits=cost, cost_efficiency=throughput / cost,
                               makespan_s=max(e["end_s"] for e in completions) if all_done else None,
                               transport_distance_m=sum(e["distance_m"] * overlap(e) /
                                                        (e["end_s"] - e["start_s"])
                                                        for e in events if e["kind"].startswith("transport_")),
                               utilization={p["instance_id"]: sum(overlap(e) for e in events
                                            if e["kind"] == "process" and
                                            e["resource_id"] == p["instance_id"]) / h for p in placement}))
    validate_shape(result, "EvaluationResult")
    return result


class Engine:
    def __init__(self, task, workflow, placement, result):
        self.task, self.steps, self.placement, self.result = task, workflow["steps"], placement, result
        self.transport = task["transport"]
        self.jobs = {j["job_id"]: dict(j, index=0, state="future", ready_at_s=j["release_at_s"],
                                      source=self.transport["entry_node"], last_instance=None)
                     for j in task["jobs"]}
        self.time = 0
        self.pending, self.requests, self.busy = [], [], set()
        self.serial = itertools.count()
        self.robot_at, self.robot_busy = self.transport["entry_node"], False
        self.routes = {}
        for job in task["jobs"]:
            self.schedule(job["release_at_s"], "release", job["job_id"])

    def schedule(self, time, kind, job_id, instance=None):
        # All completions are processed before releases, then dispatch once.
        priority = 1 if kind == "release" else 0
        heapq.heappush(self.pending, (time, priority, job_id, next(self.serial), kind, instance))

    def event(self, kind, job, resource, start, end, path=None, distance=0, step=None):
        limit = self.task["drain_limit_s"]
        if start > limit or (end > start and start >= limit):
            return
        if end > limit:
            distance *= (limit - start) / (end - start)
            end = limit
        if kind != "job_complete" and end <= start:
            return
        self.result["events"].append(dict(event_id=f"e{len(self.result['events']) + 1:06d}",
            job_id=job["job_id"], step_id=step, resource_id=resource, kind=kind,
            start_s=start, end_s=end, path_nodes=path or [], distance_m=distance))

    def process(self, job, instance):
        step = self.steps[job["index"]]
        job["state"] = "processing"
        end = self.time + step["duration_s"]
        self.event("process", job, instance["instance_id"], self.time, end, step=step["step_id"])
        self.schedule(end, "process_done", job["job_id"], instance)

    def request(self, job, destination, instance=None):
        self.requests.append((self.time, job["job_id"], job["index"], destination, instance))
        job["state"] = "transport_wait"

    def dispatch(self):
        ready = sorted((j for j in self.jobs.values() if j["state"] == "ready"),
                       key=lambda j: (j["ready_at_s"], j["job_id"], j["index"]))
        for job in ready:
            kind = self.steps[job["index"]]["device_type"]
            instance = next((p for p in sorted(self.placement, key=lambda p: p["instance_id"])
                             if p["device_type"] == kind and p["instance_id"] not in self.busy), None)
            if instance is None:
                continue
            self.busy.add(instance["instance_id"])
            if instance["instance_id"] == job["last_instance"]:
                self.process(job, instance)
            else:
                self.request(job, instance["port_node"], instance)
        if not self.robot_busy and self.requests:
            self.requests.sort(key=lambda r: r[:3])
            _, job_id, _, destination, instance = self.requests.pop(0)
            job = self.jobs[job_id]
            self.robot_busy = True
            cursor = self.time
            step = self.steps[job["index"]]["step_id"] if instance else None
            for kind, source, target, handling in [
                    ("transport_empty", self.robot_at, job["source"], self.transport["pick_s"]),
                    ("transport_loaded", job["source"], destination, self.transport["drop_s"])]:
                key = (source, target)
                if key not in self.routes:
                    self.routes[key] = shortest_path(self.transport, source, target)
                length, path = self.routes[key]
                end = cursor + length / self.transport["velocity_m_s"]
                self.event(kind, job, "robot-001", cursor, end, path, length, step)
                self.event("handling", job, "robot-001", end, end + handling, step=step)
                cursor = end + handling
            job["destination"] = destination
            self.schedule(cursor, "drop_done", job_id, instance)

    def run(self):
        limit = self.task["drain_limit_s"]
        while self.pending and self.pending[0][0] <= limit:
            self.time = self.pending[0][0]
            while self.pending and self.pending[0][0] == self.time:
                _, _, job_id, _, kind, instance = heapq.heappop(self.pending)
                job = self.jobs[job_id]
                if kind == "release":
                    job["state"] = "ready"
                elif kind == "process_done":
                    self.busy.remove(instance["instance_id"])
                    job.update(index=job["index"] + 1, source=instance["port_node"],
                               last_instance=instance["instance_id"], ready_at_s=self.time)
                    if job["index"] == len(self.steps):
                        self.request(job, self.transport["exit_node"])
                    else:
                        job["state"] = "ready"
                elif kind == "drop_done":
                    self.robot_at, self.robot_busy = job["destination"], False
                    if instance:
                        self.process(job, instance)
                    else:
                        job["state"] = "done"
                        self.event("job_complete", job, "exit", self.time, self.time)
            self.dispatch()
        self.result["events"].sort(key=lambda e: (e["start_s"], e["end_s"], e["event_id"]))
