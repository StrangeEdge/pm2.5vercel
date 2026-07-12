"""
Test script: run traffic_counter_v2 against video files and
push the final vehicle counts to Firebase RTDB.
Usage:
  python traffic_counter_test.py --input <video.mp4|rpi>
"""

import supervision as sv
import numpy as np
import json
import os
import signal
from datetime import datetime, timezone, timedelta

import requests
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
import hailo
from hailo_apps.python.core.gstreamer.gstreamer_app import app_callback_class
from hailo_apps.python.pipeline_apps.detection_simple.detection_simple_pipeline import GStreamerDetectionSimpleApp

# ── Configuration ─────────────────────────────────────────────
RTDB_URL    = "https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app"
SENSOR_KEY  = "esp32-sensor-01"
PATCH_PATH  = f"/pm25_data/{SENSOR_KEY}.json"

CLASS_NAMES = ["Bus", "Car", "Jeepney", "Motorcycle", "Tricycle", "Truck"]

# Dashboard expects these 7 types (Van not in Hailo model, always 0)
DASHBOARD_VEHICLE_TYPES = ["Car", "Van", "Jeepney", "Truck", "Tricycle", "Motorcycle", "Bus"]

PH_TIMEZONE = timezone(timedelta(hours=8))  # Philippine Standard Time

MAX_FRAMES = 1011


class TrafficCounterData(app_callback_class):
    def __init__(self):
        super().__init__()
        self.tracker = sv.ByteTrack(
            track_activation_threshold=0.25,
            lost_track_buffer=30,
            minimum_matching_threshold=0.95,
            minimum_consecutive_frames=5
        )
        self.frame_count = 0
        self.seen_ids = {name: set() for name in CLASS_NAMES}


def app_callback(element, buffer, user_data):
    if buffer is None:
        return Gst.PadProbeReturn.OK

    user_data.frame_count += 1
    if user_data.frame_count >= MAX_FRAMES:
        print(f"\nVideo complete ({MAX_FRAMES} frames) — stopping...")
        print_summary(user_data)
        push_to_firebase(user_data)
        os._exit(0)

    roi = hailo.get_roi_from_buffer(buffer)
    detections = roi.get_objects_typed(hailo.HAILO_DETECTION)

    boxes, scores, class_ids = [], [], []
    for det in detections:
        label = det.get_label()
        conf = det.get_confidence()
        if label not in CLASS_NAMES:
            continue
        bbox = det.get_bbox()
        boxes.append([bbox.xmin() * 640, bbox.ymin() * 640,
                      bbox.xmax() * 640, bbox.ymax() * 640])
        scores.append(conf)
        class_ids.append(CLASS_NAMES.index(label))

    if len(boxes) > 0:
        sv_dets = sv.Detections(
            xyxy=np.array(boxes, dtype=np.float32),
            confidence=np.array(scores, dtype=np.float32),
            class_id=np.array(class_ids, dtype=int)
        )
        sv_dets = user_data.tracker.update_with_detections(sv_dets)

        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        if sv_dets.tracker_id is not None:
            for i, tid in enumerate(sv_dets.tracker_id):
                cls_name = CLASS_NAMES[sv_dets.class_id[i]]
                if tid not in user_data.seen_ids[cls_name]:
                    user_data.seen_ids[cls_name].add(tid)
                    total = sum(len(s) for s in user_data.seen_ids.values())
                    print(f"[{timestamp}] New {cls_name} | Track:{tid} | Total:{total}")

    return Gst.PadProbeReturn.OK


def print_summary(user_data):
    print("\n" + "=" * 40)
    print("FINAL VEHICLE COUNT SUMMARY")
    print("=" * 40)
    total = 0
    for cls_name in CLASS_NAMES:
        count = len(user_data.seen_ids[cls_name])
        total += count
        print(f"  {cls_name}: {count}")
    print(f"  TOTAL: {total}")


def push_to_firebase(user_data):
    counts = {}
    for vt in DASHBOARD_VEHICLE_TYPES:
        counts[vt] = len(user_data.seen_ids.get(vt, set()))

    payload = {
        "vehicles": counts,
        "vehicles_timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
    }

    print(f"\nPushing vehicle counts to Firebase: {json.dumps(payload)}")

    try:
        resp = requests.patch(
            f"{RTDB_URL}{PATCH_PATH}",
            json=payload,
            timeout=10,
        )
        if resp.status_code == 200:
            print("Firebase updated successfully")
        else:
            print(f"Firebase push failed: HTTP {resp.status_code}")
    except Exception as e:
        print(f"Firebase push error: {e}")


def signal_handler(sig, frame):
    print("\nInterrupted — performing final push...")
    # On interrupt, push whatever counts we have
    user_data = main_user_data  # populated in __main__
    if user_data is not None:
        print_summary(user_data)
        push_to_firebase(user_data)
    exit(0)


main_user_data = None

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    user_data = TrafficCounterData()
    main_user_data = user_data

    app = GStreamerDetectionSimpleApp(app_callback, user_data)
    app.run()
