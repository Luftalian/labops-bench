"""Validate synthetic scheduler exchanges without running a model or session."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from agent.scheduler_contract import check_exchange
from backend.counts.validate import validate


def main():
    paths = sorted((ROOT / "fixtures/scheduler").glob("*.json"))
    if not paths:
        raise ValueError("No scheduler communication fixtures")
    for path in paths:
        fixture = json.loads(path.read_text(encoding="utf-8"))
        for prefix in ("initial", "periodic"):
            check_exchange(fixture[prefix + "_observation"], fixture[prefix + "_decision"])
        check_exchange(fixture["periodic_observation"], fixture["relocation_decision"])
        validate(fixture["receipt"], "SchedulerReceipt")
        print(f"PASS scheduler/{path.name} (contract only, no engine acceptance)")


if __name__ == "__main__":
    main()
