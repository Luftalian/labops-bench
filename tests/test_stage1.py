import copy
import json
import unittest
from pathlib import Path

from backend.stage1.engine import evaluate_design, shortest_path
from scripts.check_contracts import validate_shape

ROOT = Path(__file__).resolve().parents[1]


def fixture(name="single-mix-valid"):
    return json.loads((ROOT / "fixtures" / f"{name}.json").read_text())


def two_devices():
    b = fixture()
    b.pop("result")
    b["task"]["jobs"] = [{"job_id": f"job-{i:03d}", "release_at_s": 0} for i in (1, 2)]
    b["task"]["slots"].append(dict(slot_id="slot-002", x_m=1, y_m=2, width_m=1,
                                    depth_m=1, port_node="mixer-port"))
    b["task"]["equipment_budget_credits"] = 4
    b["request"]["equipment_counts"]["mixer"] = 2
    return b


class Stage1Tests(unittest.TestCase):
    def test_hand_calculated_oracle(self):
        b = fixture()
        result = evaluate_design(b)
        self.assertEqual(result["metrics"], b["result"]["metrics"])
        self.assertEqual(result["resolved_placement"], b["result"]["resolved_placement"])
        self.assertEqual(result["result_origin"], "simulation")
        self.assertEqual([(e["kind"], e["start_s"], e["end_s"]) for e in result["events"]],
                         [(e["kind"], e["start_s"], e["end_s"]) for e in b["result"]["events"]])

    def test_parallelism_and_empty_travel(self):
        r = evaluate_design(two_devices())
        processes = [e for e in r["events"] if e["kind"] == "process"]
        self.assertEqual(len(processes), 2)
        self.assertNotEqual(processes[0]["resource_id"], processes[1]["resource_id"])
        self.assertLess(processes[1]["start_s"], processes[0]["end_s"])
        self.assertTrue(any(e["kind"] == "transport_empty" and e["distance_m"] > 0 for e in r["events"]))
        robot = [e for e in r["events"] if e["resource_id"] == "robot-001"]
        for a, b in zip(robot, robot[1:]):
            self.assertLessEqual(a["end_s"], b["start_s"])

    def test_replay_independent_of_job_input_order(self):
        b = two_devices()
        first = evaluate_design(b)
        b["task"]["jobs"].reverse()
        self.assertEqual(first, evaluate_design(b))

    def test_exact_counts_never_select_subset(self):
        b = two_devices()
        b["task"]["slots"].pop()
        r = evaluate_design(b)
        self.assertEqual(r["status"], "invalid")
        self.assertIn("INSUFFICIENT_SLOTS", [v["code"] for v in r["violations"]])
        self.assertIsNone(r["metrics"])
        self.assertEqual(r["events"], [])

    def test_budget_missing_device_and_footprint(self):
        for code, mutate in [
                ("BUDGET_EXCEEDED", lambda b: b["task"].update(equipment_budget_credits=1)),
                ("MISSING_DEVICE", lambda b: b["request"]["equipment_counts"].update(mixer=0)),
                ("FOOTPRINT_MISMATCH", lambda b: b["task"]["slots"][0].update(width_m=0.5))]:
            with self.subTest(code=code):
                b = fixture(); mutate(b)
                r = evaluate_design(b)
                self.assertIn(code, [v["code"] for v in r["violations"]])

    def test_horizon_before_at_after_exit(self):
        for h, expected in [(11.999, 0), (12, 1), (12.001, 1)]:
            b = fixture(); b["task"]["horizon_s"] = h
            r = evaluate_design(b)
            self.assertEqual(r["metrics"]["completed_jobs"], expected)
            self.assertEqual(r["metrics"]["makespan_s"], 12)
            self.assertEqual(r["metrics"]["throughput_jobs_per_hour"], expected * 3600 / h)

    def test_horizon_clips_process_and_distance(self):
        b = fixture(); b["task"]["horizon_s"] = 5
        r = evaluate_design(b)
        self.assertEqual(r["metrics"]["utilization"]["mixer-001"], 4 / 5)
        b["task"]["horizon_s"] = 0.5
        self.assertEqual(evaluate_design(b)["metrics"]["transport_distance_m"], 0.5)

    def test_drain_truncates_without_future_completion(self):
        b = fixture(); b["task"].update(horizon_s=5, drain_limit_s=6)
        r = evaluate_design(b)
        self.assertEqual(r["status"], "truncated")
        self.assertIsNone(r["metrics"]["makespan_s"])
        self.assertFalse(any(e["kind"] == "job_complete" for e in r["events"]))
        self.assertTrue(all(e["end_s"] <= 6 for e in r["events"]))
        self.assertEqual(r["metrics"]["utilization"]["mixer-001"], 4 / 5)

    def test_drain_at_exact_completion(self):
        b = fixture(); b["task"].update(horizon_s=12, drain_limit_s=12)
        self.assertEqual(evaluate_design(b)["status"], "completed")

    def test_positive_handling_and_exit_drop_define_completion(self):
        b = fixture(); b["task"]["transport"].update(pick_s=2, drop_s=3)
        r = evaluate_design(b)
        self.assertEqual(r["metrics"]["makespan_s"], 22)
        self.assertEqual(sum(e["end_s"] - e["start_s"] for e in r["events"] if e["kind"] == "handling"), 10)

    def test_same_instance_adjacent_steps_have_no_extra_transport(self):
        b = fixture()
        step = copy.deepcopy(b["workflow"]["steps"][0])
        step.update(step_id="mix-2", depends_on=[step["step_id"]])
        b["workflow"]["steps"].append(step)
        r = evaluate_design(b)
        self.assertEqual(r["metrics"]["makespan_s"], 22)
        self.assertEqual(len([e for e in r["events"] if e["kind"] == "transport_loaded"]), 2)

    def test_shortest_graph_distance_and_lexical_tie(self):
        tr = dict(nodes=[dict(node_id=n) for n in "abcd"], edges=[
            dict(from_node=a, to_node=b, distance_m=d)
            for a, b, d in [("a", "c", 1), ("c", "d", 1), ("a", "b", 1), ("b", "d", 1), ("a", "d", 4)]])
        self.assertEqual(shortest_path(tr, "a", "d"), (2, ["a", "b", "d"]))

    def test_batch_capacity_rejected(self):
        b = fixture(); b["catalog"]["devices"][0]["batch_capacity"] = 2
        with self.assertRaisesRegex(ValueError, "batch_capacity"):
            evaluate_design(b)

    def test_four_stage_no_resource_overlap_and_precedence(self):
        b = fixture("four-stage-input")
        r = evaluate_design(b)
        validate_shape(r, "EvaluationResult")
        self.assertTrue(r["valid"])
        for inst in r["resolved_placement"]:
            events = [e for e in r["events"] if e["resource_id"] == inst["instance_id"]]
            for a, z in zip(events, events[1:]):
                self.assertLessEqual(a["end_s"], z["start_s"])
        for job in b["task"]["jobs"]:
            events = [e for e in r["events"] if e["job_id"] == job["job_id"] and e["kind"] == "process"]
            self.assertEqual([e["step_id"] for e in events], [s["step_id"] for s in b["workflow"]["steps"]])
            for a, z in zip(events, events[1:]):
                self.assertLessEqual(a["end_s"], z["start_s"])

    def test_transport_bottleneck_no_assumed_scaling_gain(self):
        b = two_devices()
        b["workflow"]["steps"][0]["duration_s"] = 0.1
        b["task"]["transport"]["pick_s"] = 20
        two = evaluate_design(b)
        b["request"]["equipment_counts"]["mixer"] = 1
        one = evaluate_design(b)
        # A second destination reservation can delay the first exit in this
        # FIFO transport fixture. More devices do not imply higher throughput.
        self.assertLessEqual(two["metrics"]["throughput_jobs_per_hour"], one["metrics"]["throughput_jobs_per_hour"])


if __name__ == "__main__":
    unittest.main()
