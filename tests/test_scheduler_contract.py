"""The draft boundary must reject unsafe envelopes before engine validation."""
import copy
import json
import unittest
from pathlib import Path

from jsonschema import ValidationError
from agent.scheduler_contract import check_exchange

ROOT = Path(__file__).resolve().parents[1]


class SchedulerContractTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads((ROOT / "fixtures/scheduler/exchange.json").read_text(encoding="utf-8"))
        self.obs = self.fixture["periodic_observation"]
        self.decision = self.fixture["periodic_decision"]

    def replacement(self):
        layout = copy.deepcopy(self.obs["layout"])
        self.decision["reconfiguration"] = {"mode": "replace_layout", "layout": layout}
        return layout

    def test_examples_are_checked_without_mutation(self):
        before = copy.deepcopy(self.fixture)
        for prefix in ("initial", "periodic"):
            check_exchange(self.fixture[prefix + "_observation"], self.fixture[prefix + "_decision"])
        self.assertEqual(self.fixture, before)

    def test_stale_or_wrong_session_cannot_reprioritize(self):
        for field, value in (("session_id", "another-session"), ("snapshot_id", "old-snapshot"),
                             ("epoch_id", 0), ("state_version", 6)):
            decision = {**self.decision, field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                check_exchange(self.obs, decision)

    def test_priorities_cover_all_remaining_jobs_exactly(self):
        for priorities in (self.decision["priorities"][:-1],
                           self.decision["priorities"] + [self.decision["priorities"][0]],
                           self.decision["priorities"][:-1] + [{"job_id": "unknown", "priority": 10}]):
            with self.subTest(priorities=priorities), self.assertRaises(ValueError):
                check_exchange(self.obs, {**self.decision, "priorities": priorities})

    def test_priority_cannot_override_engine_clock_or_operation_times(self):
        for extra in ({"time_s": 0}, {"dispatch": []}, {"makespan_s": 1}):
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                check_exchange(self.obs, {**self.decision, **extra})

    def test_priority_domain(self):
        for priority in (-1, 1001, 0.5):
            decision = copy.deepcopy(self.decision)
            decision["priorities"][0]["priority"] = priority
            with self.subTest(priority=priority), self.assertRaises(ValidationError):
                check_exchange(self.obs, decision)

    def test_completed_and_incomplete_workload_are_distinct(self):
        removed = self.obs["jobs"].pop()["job_id"]
        self.decision["priorities"] = [p for p in self.decision["priorities"] if p["job_id"] != removed]
        with self.assertRaisesRegex(ValueError, "workload"):
            check_exchange(self.obs, self.decision)
        self.obs["completed_jobs"] = 1
        check_exchange(self.obs, self.decision)
        self.obs["phase"] = "done"
        with self.assertRaisesRegex(ValueError, "phase"):
            check_exchange(self.obs, self.decision)

    def test_cyclic_and_unknown_dependencies_are_rejected(self):
        node = self.obs["jobs"][0]["nodes"][0]
        for dependency in (node["node_id"], "missing-node"):
            node["depends_on"] = [dependency]
            with self.subTest(dependency=dependency), self.assertRaises(ValueError):
                check_exchange(self.obs, self.decision)

    def test_initial_design_respects_context_counts_and_exact_inventory(self):
        obs = self.fixture["initial_observation"]
        for field, value in (("task_version", "other"), ("simulation_seed", 18),
                             ("arm_count", 0), ("amr_count", 3)):
            decision = copy.deepcopy(self.fixture["initial_decision"])
            decision["initial_design"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                check_exchange(obs, decision)
        decision = self.fixture["initial_decision"]
        decision["initial_design"]["layout"]["devices"].pop()
        with self.assertRaisesRegex(ValueError, "inventory"):
            check_exchange(obs, decision)

    def test_reconfiguration_preserves_resource_ids(self):
        layout = self.replacement()
        layout["devices"][0]["id"] = "invented-station"
        with self.assertRaisesRegex(ValueError, "ids"):
            check_exchange(self.obs, self.decision)

    def test_disabled_movements_are_rejected(self):
        layout = self.replacement()
        layout["devices"][0]["x"] += .2
        self.obs["config"]["allow_device_relocation"] = False
        with self.assertRaisesRegex(ValueError, "relocation"):
            check_exchange(self.obs, self.decision)
        layout["devices"][0]["x"] -= .2
        layout["robots"][0]["x"] += .2
        self.obs["config"]["allow_arm_relocation"] = False
        with self.assertRaisesRegex(ValueError, "arm relocation"):
            check_exchange(self.obs, self.decision)

    def test_only_one_reconfiguration_can_be_pending(self):
        self.replacement()
        self.obs["reconfiguration_state"]["phase"] = "draining"
        with self.assertRaisesRegex(ValueError, "in_progress"):
            check_exchange(self.obs, self.decision)
        self.decision["reconfiguration"] = {"mode": "keep"}
        check_exchange(self.obs, self.decision)

    def test_physical_relocation_preserves_models_and_counts(self):
        decision = self.fixture["relocation_decision"]
        check_exchange(self.obs, decision)
        old = self.obs["layout"]
        target = decision["reconfiguration"]["layout"]
        self.assertNotEqual(old["devices"][0]["x"], target["devices"][0]["x"])
        self.assertNotEqual(old["robots"][0]["x"], target["robots"][0]["x"])
        self.assertEqual({d["id"]: d["model"] for d in old["devices"]},
                         {d["id"]: d["model"] for d in target["devices"]})

    def test_model_swaps_are_rejected_even_when_counts_are_unchanged(self):
        layout = self.replacement()
        a, b = layout["devices"][:2]
        a["model"], b["model"] = b["model"], a["model"]
        with self.assertRaisesRegex(ValueError, "models must be preserved"):
            check_exchange(self.obs, self.decision)

    def test_module_management_is_outside_the_scheduler_contract(self):
        self.obs["config"]["allow_module_exchange"] = True
        with self.assertRaises(ValidationError):
            check_exchange(self.obs, self.decision)


if __name__ == "__main__":
    unittest.main()
