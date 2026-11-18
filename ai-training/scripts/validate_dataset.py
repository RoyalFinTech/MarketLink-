#!/usr/bin/env python3
"""Validate MarketLink chat fine-tuning JSONL without loading a model."""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "datasets" / "marketlink_seed.jsonl"
REQUIRED = {"system", "user", "assistant"}

def main():
    rows = 0
    with DATA.open(encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            item = json.loads(line)
            messages = item.get("messages")
            assert isinstance(messages, list) and len(messages) == 3, f"line {line_no}: expected 3 messages"
            roles = [m.get("role") for m in messages]
            assert set(roles) == REQUIRED and len(set(roles)) == 3, f"line {line_no}: roles must be system/user/assistant"
            for msg in messages:
                assert isinstance(msg.get("content"), str) and msg["content"].strip(), f"line {line_no}: empty content"
            assert len(messages[1]["content"]) <= 1000, f"line {line_no}: user prompt too long"
            assert len(messages[2]["content"]) <= 2000, f"line {line_no}: assistant answer too long"
            rows += 1
    assert rows >= 20, f"Expected at least 20 examples, found {rows}"
    print(f"OK: {rows} MarketLink training examples validated.")

if __name__ == "__main__":
    main()
