"""Saved empirical calibration checks, not held-out field accuracy claims."""

import numpy as np
import pytest

from umbra.position import fit_position_mapping, map_shadow_to_body
from umbra.store import Store


def mapping():
    xs = np.linspace(0.65, 0.95, 8)
    tips = np.column_stack([xs, 0.42 + xs * 0.03])
    bodies = np.column_stack([xs * 0.4 + 0.03, 0.37 + xs * 0.02, 0.45 + xs * 0.01])
    model = fit_position_mapping(tips, bodies, 480, 270)
    model.update(aspect_ratio=480 / 270, wall_edge_norm=[0.31, 0, 0.31, 1], visible_side=1)
    return model


def test_mapping_predicts_body_centre_from_shadow_tip_not_wall_intersection():
    model = mapping()
    outputs = [map_shadow_to_body(model, {"tip": [x, 0.42 + x * 0.03], "shadow_box": [180, 140, 50, 20]}) for x in [0.35, 0.45, 0.55]]
    assert all(value is not None for value in outputs)
    assert outputs[0]["position_norm"][0] < outputs[1]["position_norm"][0] < outputs[2]["position_norm"][0]
    assert all(0.35 < value["position_norm"][1] < 0.42 for value in outputs)
    assert outputs[0]["uncertainty_norm"][0] > outputs[2]["uncertainty_norm"][0]


def test_mapping_refuses_different_route_excessive_extrapolation_and_visible_side():
    model = mapping()
    for tip in [[0.4, 0.8], [0.05, 0.4215], [0.9, 0.447]]:
        assert map_shadow_to_body(model, {"tip": tip, "shadow_box": [1, 1, 10, 10]}) is None


def test_calibration_requires_motion_pairs_and_consistent_correspondence():
    with pytest.raises(ValueError, match="five"):
        fit_position_mapping(np.zeros((3, 2)), np.zeros((3, 3)), 480, 270)
    with pytest.raises(ValueError, match="movement"):
        fit_position_mapping(np.zeros((8, 2)), np.zeros((8, 3)), 480, 270)
    tips = np.column_stack([np.linspace(0.4, 0.9, 8), np.full(8, 0.4)])
    bodies = np.column_stack([[0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6], np.full(8, 0.4), np.full(8, 0.5)])
    with pytest.raises(ValueError, match="repeatable"):
        fit_position_mapping(tips, bodies, 480, 270)


def test_position_calibration_survives_store_restart_and_is_deleted_with_scene(tmp_path):
    store = Store(tmp_path / "data.sqlite3")
    scene = store.create_scene({"name": "camera"})
    def media(role):
        return store.create_media({"scene_id": scene["id"], "role": role, "original_name": "clip.mp4", "path": "/tmp/clip.mp4"})
    empty, main = media("calibration"), media("main")
    store.save_position_calibration(scene["id"], "map-1", empty["id"], main["id"], mapping(), "/tmp/reference.npz")
    restarted = Store(store.database_path)
    saved = restarted.get_position_calibration(scene["id"])
    assert saved["model"]["pair_count"] == 8
    assert saved["calibration_media_id"] == empty["id"]
    deleted = restarted.delete_scene(scene["id"])
    assert deleted["position_reference_path"] == "/tmp/reference.npz"
    assert restarted.get_position_calibration(scene["id"]) is None
