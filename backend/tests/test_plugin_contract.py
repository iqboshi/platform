import pytest

from platform_backend.plugins.base import ModelPlugin, PluginMetadata, validate_plugin


class GoodPlugin(ModelPlugin):
    metadata = PluginMetadata(name="demo", task_type="segmentation", framework="PyTorch")
    input_spec = {"image": "raster"}
    output_spec = {"prediction": "artifact"}

    def predict(self, inputs: dict[str, object]) -> dict[str, object]:
        return {"received": inputs}


class BadPlugin(ModelPlugin):
    metadata = PluginMetadata(name="bad", task_type="segmentation", framework="PyTorch")
    input_spec = {}
    output_spec = {"prediction": "artifact"}

    def predict(self, inputs: dict[str, object]) -> dict[str, object]:
        return {"received": inputs}


def test_validate_plugin_accepts_valid_plugin() -> None:
    validate_plugin(GoodPlugin())


def test_validate_plugin_rejects_missing_input_spec() -> None:
    with pytest.raises(TypeError):
        validate_plugin(BadPlugin())
