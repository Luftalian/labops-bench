"""Validate canonical 0.2 shapes directly from the shared schema."""
import json
import sys
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "contracts/labops.schema.json").read_text())


def validate(value, definition):
    Draft202012Validator(dict(SCHEMA, **{"$ref": f"#/$defs/{definition}"})).validate(value)


if __name__ == "__main__":
    data = json.load(sys.stdin)
    try:
        validate(data["value"], data["definition"])
        print(json.dumps({"status": 200}))
    except ValidationError as error:
        print(json.dumps({"status": 422, "body": {"error": "invalid_input", "message": error.message}}))
