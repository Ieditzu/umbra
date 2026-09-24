from pathlib import Path

from umbra.store import Store


def test_store_round_trip(tmp_path: Path) -> None:
    store = Store(tmp_path / "umbra.sqlite3")
    scene = store.create_scene({"name": "Corner A", "notes": "controlled"})
    media = store.create_media(
        {
            "scene_id": scene["id"],
            "role": "calibration",
            "original_name": "empty.mp4",
            "path": "/tmp/empty.mp4",
            "metadata": {"fps": 10},
        }
    )
    assert store.get_scene(scene["id"])["name"] == "Corner A"
    assert store.get_media(media["id"])["metadata"] == {"fps": 10}


def test_delete_scene_removes_dependent_records(tmp_path: Path) -> None:
    store = Store(tmp_path / "umbra.sqlite3")
    scene = store.create_scene({"name": "Delete me"})
    calibration = store.create_media({"scene_id": scene["id"], "role": "calibration", "original_name": "cal.mp4", "path": "/tmp/cal.mp4"})
    main = store.create_media({"scene_id": scene["id"], "role": "main", "original_name": "main.mp4", "path": "/tmp/main.mp4"})
    trial = store.create_trial(scene["id"], {"name": "Trial", "calibration_media_id": calibration["id"], "main_media_id": main["id"]})
    analysis = store.create_analysis(trial["id"], "/tmp/run/result.json")

    deleted = store.delete_scene(scene["id"])

    assert deleted is not None
    assert deleted["media_paths"] == ["/tmp/cal.mp4", "/tmp/main.mp4"]
    assert deleted["analyses"] == [{"id": analysis["id"], "path": "/tmp/run/result.json"}]
    assert store.get_scene(scene["id"]) is None
    assert store.get_media(calibration["id"]) is None
    assert store.get_trial(trial["id"]) is None
    assert store.get_analysis(analysis["id"]) is None


def test_reviewed_shadow_area_survives_replacing_trial_with_same_camera(tmp_path: Path) -> None:
    store = Store(tmp_path / "umbra.sqlite3")
    scene = store.create_scene({"name": "Reviewed corner"})
    def media(role: str) -> dict:
        return store.create_media({"scene_id": scene["id"], "role": role, "original_name": f"{role}.mp4", "path": f"/tmp/{role}.mp4"})

    calibration, main, truth = media("calibration"), media("main"), media("ground_truth")
    def trial() -> dict:
        return store.create_trial(scene["id"], {
            "name": "Walk", "calibration_media_id": calibration["id"],
            "main_media_id": main["id"], "ground_truth_media_id": truth["id"],
        })

    first = trial()
    region = {"x": 0.09, "y": 0.72, "width": 0.68, "height": 0.25}
    store.save_manual_ground_truth(first["id"], {"ground_truth_media_id": truth["id"], "main_shadow_region": region})
    store.delete_trial(first["id"])
    second = trial()
    inherited = store.get_manual_ground_truth(second["id"])
    assert inherited is not None
    assert inherited["main_shadow_region"] == region
    assert inherited["samples"] == []

    store.save_manual_ground_truth(second["id"], {"ground_truth_media_id": truth["id"], "main_shadow_region": None})
    assert store.get_manual_ground_truth(trial()["id"]) is None
    assert store.delete_scene(scene["id"]) is not None
