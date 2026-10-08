import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from platform_backend.workflows.research_catalog import METHODS, research_templates
from platform_backend.workflows.research_runtime import analyze
from platform_backend.workflows.validation import validate_workflow_graph


def stage(path, date, nir=0.5, red=0.1, shift=0):
    values = np.ones((8, 48, 32), dtype="float32")
    values[:3] *= 100
    values[3:] *= 0.1
    values[6] = 0.2
    values[7] = nir
    values[5] = red
    values[:, :4] = np.nan
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=32,
        height=48,
        count=8,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(115 + shift, 37, 0.00001, 0.00001),
        nodata=np.nan,
    ) as ds:
        ds.write(values)
        ds.update_tags(research_demo_schema="wheat-eight-band-v1", capture_date=date)
    return path


@pytest.mark.parametrize("method", list(METHODS))
def test_real_raster_outputs_preserve_mask_and_coordinates(tmp_path, method):
    source = stage(tmp_path / "input.tif", "2025-03-25")
    path, preview = analyze([source], method, {}, tmp_path / "output")
    report = preview["value"]
    assert report["rows"][0]["ndvi"] == pytest.approx(2 / 3, abs=0.0001)
    assert report["rows"][0]["date"] == "2025-03-25"
    assert report["images"][0]["result"].startswith("data:image/png;base64,")
    assert report["unit"].endswith("（0–1）")
    with rasterio.open(path) as ds:
        values = ds.read(1, masked=True)
        assert values.mask.any()
        assert values.count() > 0
        assert values.min() >= 0 and values.max() <= 1
        assert str(ds.crs) == "EPSG:4326"
        assert ds.descriptions == ("2025-03-25",)


def test_temporal_alignment_and_input_sensitivity(tmp_path):
    a = stage(tmp_path / "a.tif", "2024-10-06", nir=0.2)
    b = stage(tmp_path / "b.tif", "2025-03-25", nir=0.6, shift=0.00002)
    path, preview = analyze([a, b], "research.carbon_potential", {}, tmp_path / "output")
    rows = preview["value"]["rows"]
    assert rows[1]["mean"] > rows[0]["mean"]
    with rasterio.open(path) as ds:
        values = ds.read(masked=True)
        assert ds.count == 2
        assert np.array_equal(values.mask[0], values.mask[1])


def test_roi_and_invalid_input_are_explicit(tmp_path):
    source = stage(tmp_path / "input.tif", "2025-03-25")
    with pytest.raises(ValueError, match="intersect"):
        analyze([source], "research.structure_tiller", {}, tmp_path / "bad", [0, 0, 1, 1])
    with pytest.raises(ValueError, match="parameters"):
        analyze([source], "research.structure_tiller", {"structureWeight": 2}, tmp_path / "bad")
    _, full = analyze([source], "research.structure_tiller", {}, tmp_path / "full")
    _, crop = analyze(
        [source],
        "research.structure_tiller",
        {},
        tmp_path / "crop",
        [115.00005, 36.9996, 115.0002, 36.9999],
    )
    assert crop["value"]["bbox"] != full["value"]["bbox"]


def test_templates_have_valid_graph_bindings():
    for template in research_templates():
        result = validate_workflow_graph(template.graph)
        # No resolver is needed to check graph topology and declared port contracts.
        assert not result.errors, result.errors
