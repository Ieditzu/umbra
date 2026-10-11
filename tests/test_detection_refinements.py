import numpy as np

from umbra.reports import (
    _follow_pavement_shadow,
    _new_shadow_pixels,
    _pavement_shadow_box,
    _visible_body_box,
)
from umbra.vision import build_calibration_model, extract_temporal_signal


def test_body_box_does_not_attach_a_distant_pavement_patch():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[35:155, 190:215] = 1
    mask[210:260, 195:220] = 1
    box = _visible_body_box(mask)
    assert box is not None
    assert box[1] + box[3] < 180


def test_shadow_box_joins_nearby_fragments_not_remote_noise():
    mask = np.zeros((100, 180), dtype=np.uint8)
    mask[40:55, 15:50] = 1
    mask[43:56, 56:85] = 1
    mask[80:90, 150:165] = 1
    box = _pavement_shadow_box(mask)
    assert box is not None
    x, y, width, height = box
    assert x <= 15 and x + width >= 85
    assert x + width < 100 and y + height < 65


def test_small_connected_shadow_survives_large_pavement_average():
    empty = np.full((180, 320, 3), 180, dtype=np.uint8)
    shadow = empty.copy()
    shadow[128:142, 150:170] = 80
    model = build_calibration_model([empty.copy() for _ in range(12)])
    signal = extract_temporal_signal([empty, shadow], model, (60, 100, 240, 70))
    assert float(signal[0]["energy"]) == 0
    assert float(signal[1]["energy"]) > 3


def test_isolated_dark_noise_does_not_receive_component_boost():
    empty = np.full((180, 320, 3), 180, dtype=np.uint8)
    noisy = empty.copy()
    noisy[110:160:10, 70:290:10] = 80
    model = build_calibration_model([empty.copy() for _ in range(12)])
    signal = extract_temporal_signal([empty, noisy], model, (60, 100, 240, 70))
    assert float(signal[1]["energy"]) < 1.5


def test_global_exposure_drop_does_not_become_a_shadow():
    empty = np.full((180, 320, 3), 180, dtype=np.uint8)
    dimmed = np.full_like(empty, 135)
    model = build_calibration_model([empty.copy() for _ in range(12)])
    signal = extract_temporal_signal([empty, dimmed], model, (60, 100, 240, 70))
    assert float(signal[1]["energy"]) < 0.1
    assert float(signal[1]["los_energy"]) < 0.1


def test_body_remains_detectable_at_right_edge_of_frame():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[40:170, 440:470] = 1
    box = _visible_body_box(mask)
    assert box is not None and box[0] >= 430


def test_body_does_not_join_a_building_shadow_just_below_feet():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[20:178, 325:360] = 1
    mask[200:265, 330:360] = 1
    box = _visible_body_box(mask)
    assert box is not None
    assert box[1] + box[3] <= 180


def test_ground_only_vertical_shadow_is_not_an_upright_body():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[150:265, 320:355] = 1
    assert _visible_body_box(mask) is None


def test_shadow_follows_outside_initial_roi_without_inventing_missing_evidence():
    roi = (40, 120, 80, 60)
    previous = None
    for x in range(80, 180, 10):
        mask = np.zeros((220, 320), dtype=np.uint8)
        mask[140:153, x:x + 30] = 1
        previous = _follow_pavement_shadow(mask, roi, previous, None)
        assert previous is not None
        assert previous[0] <= x and previous[0] + previous[2] >= x + 30
    assert previous[0] > roi[0] + roi[2]
    assert _follow_pavement_shadow(np.zeros((220, 320), dtype=np.uint8), roi, previous, None) is None


def test_shadow_can_be_reacquired_near_visible_feet_after_leaving_roi():
    mask = np.zeros((220, 320), dtype=np.uint8)
    mask[145:160, 240:280] = 1
    box = _follow_pavement_shadow(mask, (40, 120, 80, 60), None, (210, 20, 30, 130))
    assert box is not None and box[0] >= 230


def test_building_shadow_patch_far_from_feet_is_not_attributed_to_walker():
    mask = np.zeros((270, 480), dtype=np.uint8)
    mask[220:245, 370:395] = 1
    assert _follow_pavement_shadow(mask, (183, 156, 134, 102), None, (330, 20, 40, 160)) is None


def test_shadow_mask_rejects_existing_mismatch_and_paired_building_edges():
    opening = np.zeros((80, 120), dtype=np.float32)
    opening[10:30, 10:30] = -35
    residual = opening.copy()
    residual[45:65, 40:43] = -35
    residual[45:65, 43:46] = 35
    residual[45:65, 80:105] = -35
    mask = _new_shadow_pixels(residual, opening, np.full_like(residual, 10), np.ones_like(residual, dtype=bool))
    assert not mask[10:30, 10:30].any()
    assert not mask[45:65, 40:43].any()
    assert mask[45:65, 80:105].all()
