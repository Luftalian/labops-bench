import copy
import json
import unittest

from jsonschema.exceptions import ValidationError
from scripts.check_contracts import ROOT, check_fixture, design_violations, validate_context, validate_shape


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.f = json.loads((ROOT / "fixtures/single-mix-valid.json").read_text())

    def test_hand_computed_fixture(self):
        check_fixture(self.f)

    def test_negative_and_fractional_device_counts(self):
        for value in (-1, 1.5):
            with self.subTest(value=value):
                candidate = copy.deepcopy(self.f)
                candidate["request"]["equipment_counts"]["mixer"] = value
                with self.assertRaises(ValidationError):
                    validate_shape(candidate)

    def test_literature_duration_needs_reference(self):
        self.f["workflow"]["steps"][0]["duration_provenance"]["kind"] = "literature"
        with self.assertRaises(ValidationError):
            validate_shape(self.f)

    def test_budget_overrun(self):
        self.f["task"]["equipment_budget_credits"] = 1
        self.assertIn("BUDGET_EXCEEDED", design_violations(self.f))

    def test_missing_required_instrument(self):
        self.f["request"]["equipment_counts"]["mixer"] = 0
        self.assertIn("MISSING_DEVICE", design_violations(self.f))

    def test_true_batching_is_not_silently_parallelized(self):
        self.f["catalog"]["devices"][0]["batch_capacity"] = 4
        with self.assertRaisesRegex(ValueError, "batch"):
            validate_context(self.f)

    def test_cycle_rejected(self):
        self.f["workflow"]["steps"][0]["depends_on"] = ["mix-1"]
        with self.assertRaisesRegex(ValueError, "sequential"):
            validate_context(self.f)

    def test_disconnected_port_rejected(self):
        self.f["task"]["transport"]["nodes"].append({"node_id": "lost", "x_m": 3, "y_m": 2})
        self.f["task"]["slots"][0]["port_node"] = "lost"
        with self.assertRaisesRegex(ValueError, "unreachable"):
            validate_context(self.f)

    def test_invalid_response_cannot_have_scores(self):
        self.f["result"]["valid"] = False
        self.f["result"]["status"] = "invalid"
        self.f["result"]["violations"] = [{"code": "MISSING_DEVICE", "message": "missing"}]
        with self.assertRaises(ValidationError):
            validate_shape(self.f)

    def test_horizon_boundary_includes_completion(self):
        self.f["task"]["horizon_s"] = 12
        m = self.f["result"]["metrics"]
        m.update(throughput_jobs_per_hour=300, cost_efficiency=150, utilization={"mixer-001": 10 / 12})
        check_fixture(self.f)

    def test_horizon_cuts_transport_and_excludes_future_completion(self):
        self.f["task"]["horizon_s"] = 11.5
        m = self.f["result"]["metrics"]
        m.update(completed_jobs=0, throughput_jobs_per_hour=0, cost_efficiency=0,
                 transport_distance_m=1.5, utilization={"mixer-001": 10 / 11.5})
        check_fixture(self.f)

    def test_fake_improvement_is_detected(self):
        self.f["result"]["metrics"]["throughput_jobs_per_hour"] = 600
        with self.assertRaisesRegex(ValueError, "throughput"):
            check_fixture(self.f)


if __name__ == "__main__":
    unittest.main()
