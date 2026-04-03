from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class PluginMetadata:
    name: str
    task_type: str
    framework: str


class ModelPlugin(ABC):
    metadata: PluginMetadata
    input_spec: dict[str, Any]
    output_spec: dict[str, Any]

    @abstractmethod
    def predict(self, inputs: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


def validate_plugin(plugin: ModelPlugin) -> None:
    if not isinstance(plugin.metadata, PluginMetadata):
        raise TypeError("Plugin metadata must be a PluginMetadata instance.")
    if not plugin.input_spec:
        raise TypeError("Plugin input_spec must be defined.")
    if not plugin.output_spec:
        raise TypeError("Plugin output_spec must be defined.")
    result = plugin.predict({"dry_run": True})
    if not isinstance(result, dict):
        raise TypeError("Plugin predict() must return a dict payload.")
