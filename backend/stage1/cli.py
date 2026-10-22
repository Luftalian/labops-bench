"""JSON stdin/stdout bridge; task inputs are resolved from the server registry."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from jsonschema import ValidationError
from backend.stage1.engine import evaluate_design
from scripts.check_contracts import validate_shape


def main():
    payload = json.load(sys.stdin)
    try:
        validate_shape(payload["request"], "DesignRequest")
        result = evaluate_design(payload["bundle"], payload["request"])
        print(json.dumps({"status": 200, "body": result}, allow_nan=False))
    except ValidationError as error:
        print(json.dumps({"status": 422, "body": {"error": "invalid_input", "message": error.message}}))


if __name__ == "__main__":
    main()
