from __future__ import annotations

import json
import logging
import logging.config
from pathlib import Path


def configure_logging() -> None:
    config_path = Path(__file__).resolve().parents[4] / "config" / "logging" / "logging.json"
    if not config_path.exists():
        logging.basicConfig(level=logging.INFO)
        return
    config = json.loads(config_path.read_text(encoding="utf-8"))
    logging.config.dictConfig(config)
