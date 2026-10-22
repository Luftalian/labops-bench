import copy
import json
import unittest
from pathlib import Path
from jsonschema import ValidationError
from backend.counts.validate import validate
from scripts.check_count_contracts import check

ROOT = Path(__file__).resolve().parents[1]


class CountContractTests(unittest.TestCase):
    def setUp(self):
        self.bundle = json.loads((ROOT / "fixtures/counts/room-14x10.json").read_text())

    def test_checked_in_fixture(self):
        check(self.bundle)

    def test_old_budget_and_horizon_cannot_override_task(self):
        for key in ("equipment_budget_credits", "horizon_s", "simulation_cutoff_s"):
            request = copy.deepcopy(self.bundle["request"])
            request[key] = 999999
            with self.assertRaises(ValidationError):
                validate(request, "DesignRequest")

    def test_arm_count_is_integer_and_required(self):
        for value in (True, 1.5, -1, "3"):
            request = copy.deepcopy(self.bundle["request"])
            request["arm_count"] = value
            with self.assertRaises(ValidationError):
                validate(request, "DesignRequest")
        del request["arm_count"]
        with self.assertRaises(ValidationError):
            validate(request, "DesignRequest")

    def test_unknown_equipment_is_rejected(self):
        self.bundle["request"]["equipment_counts"]["imaginary_device"] = 1
        with self.assertRaises(ValidationError):
            validate(self.bundle["request"], "DesignRequest")

    def test_versions_do_not_reinterpret_old_requests(self):
        request = copy.deepcopy(self.bundle["request"])
        request["schema_version"] = "0.1"
        with self.assertRaises(ValidationError):
            validate(request, "DesignRequest")


if __name__ == "__main__":
    unittest.main()
