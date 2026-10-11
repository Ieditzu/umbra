import numpy as np

from umbra.reports import _pavement_shadow_box, _visible_body_box
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
