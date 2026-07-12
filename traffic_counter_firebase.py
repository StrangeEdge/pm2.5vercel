"""
Vehicle detection with Hailo-8L + live camera → Firebase RTDB.
Counts unique vehicles via ByteTrack and PATCHes vehicle counts
onto the existing esp32-sensor-01 RTDB key every 5 seconds.
Offline data is queued locally and synced on reconnect.
"""

import supervision as sv
import numpy as np
import json
import os
import signal
import time
import threading
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import requests
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
import hailo
from hailo_apps.python.core.gstreamer.gstreamer_app import app_callback_class
from hailo_apps.python.pipeline_apps.detection_simple.detection_simple_pipeline import GStreamerDetectionSimpleApp

# ── Configuration ─────────────────────────────────────────────
RTDB_URL      = "https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app"
SENSOR_KEY    = "esp32-sensor-01"
PATCH_PATH    = f"/pm25_data/{SENSOR_KEY}.json"
SEND_INTERVAL = 5        # seconds between Firebase pushes
SYNC_INTERVAL = 30       # seconds between backlog sync attempts
MAX_BACKLOG_AGE = 86400  # 24 hours in seconds
BACKLOG_FILE  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vehicle_backlog.json")

PH_TIMEZONE   = timezone(timedelta(hours=8))  # Philippine Standard Time

CLASS_NAMES  = ["Bus", "Car", "Jeepney", "Motorcycle", "Tricycle", "Truck"]

# Dashboard expects these 7 types (Van is not in the Hailo model, always 0)
DASHBOARD_VEHICLE_TYPES = ["Car", "Van", "Jeepney", "Truck", "Tricycle", "Motorcycle", "Bus"]

# ── Shared state (thread-safe between detection callback & Firebase thread) ──
state_lock      = threading.Lock()
seen_ids        = {name: set() for name in CLASS_NAMES}
last_push_time  = 0
running         = True


# ═══════════════════════════════════════════════════════════════
#  Firebase helpers
# ═══════════════════════════════════════════════════════════════

def get_current_counts():
    """Return dict matching DASHBOARD_VEHICLE_TYPES from seen_ids."""
    with state_lock:
        result = {}
        for vt in DASHBOARD_VEHICLE_TYPES:
            if vt in seen_ids:
                result[vt] = len(seen_ids[vt])
            else:
                result[vt] = 0
        return result


def patch_vehicles_to_firebase(counts):
    """PATCH vehicles + Philippine-time timestamp onto the existing sensor key."""
    payload = {
        "vehicles": counts,
        "vehicles_timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
    }
    try:
        resp = requests.patch(
            f"{RTDB_URL}{PATCH_PATH}",
            json=payload,
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


def save_vehicles_locally(counts):
    """Append counts to local backlog JSON array."""
    backlog = []
    if os.path.exists(BACKLOG_FILE):
        try:
            with open(BACKLOG_FILE, "r") as f:
                backlog = json.load(f)
        except (json.JSONDecodeError, IOError):
            backlog = []

    backlog.append({
        "timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
        "vehicles": counts
    })

    with open(BACKLOG_FILE, "w") as f:
        json.dump(backlog, f)


def sync_backlog():
    """Push queued vehicle counts from backlog file to Firebase, oldest first."""
    if not os.path.exists(BACKLOG_FILE):
        return

    try:
        with open(BACKLOG_FILE, "r") as f:
            backlog = json.load(f)
    except (json.JSONDecodeError, IOError):
        os.remove(BACKLOG_FILE)
        return

    if not backlog:
        os.remove(BACKLOG_FILE)
        return

    # Clean entries older than MAX_BACKLOG_AGE
    now_epoch = time.time()
    cutoff = now_epoch - MAX_BACKLOG_AGE
    original_len = len(backlog)
    backlog = [entry for entry in backlog if iso_to_epoch(entry.get("timestamp", "")) >= cutoff]

    if len(backlog) < original_len:
        print(f"[SYNC] Removed {original_len - len(backlog)} expired backlog entries")

    if not backlog:
        os.remove(BACKLOG_FILE)
        return

    print(f"[SYNC] Pushing {len(backlog)} backlog entries...")

    # Try sending only the latest (we just need current counts on the dashboard)
    latest = backlog[-1]

    if patch_vehicles_to_firebase(latest["vehicles"]):
        print("[SYNC] Backlog synced and cleared")
        os.remove(BACKLOG_FILE)
    else:
        # Keep only the latest entry for next retry
        print("[SYNC] Send failed, keeping latest entry for retry")
        with open(BACKLOG_FILE, "w") as f:
            json.dump([latest], f)


def iso_to_epoch(iso_str):
    """ISO-8601 → Unix epoch (handles Z and +08:00 offsets)."""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.timestamp()
    except Exception:
        return 0


# ═══════════════════════════════════════════════════════════════
#  Firebase background thread
# ═══════════════════════════════════════════════════════════════

def firebase_thread():
    """Periodically push vehicle counts to Firebase, sync backlog on reconnect."""
    global running, last_push_time
    last_sync = 0
    was_offline = False

    while running:
        now = time.time()

        if now - last_push_time >= SEND_INTERVAL:
            last_push_time = now
            counts = get_current_counts()
            if patch_vehicles_to_firebase(counts):
                if was_offline:
                    print("[FB] Reconnected — syncing backlog")
                    sync_backlog()
                    was_offline = False
            else:
                if not was_offline:
                    print("[FB] Offline — saving counts locally")
                save_vehicles_locally(counts)
                was_offline = True

        # Periodic backlog sync
        if now - last_sync >= SYNC_INTERVAL:
            last_sync = now
            if not was_offline:
                sync_backlog()

        time.sleep(1)


# ═══════════════════════════════════════════════════════════════
#  Hailo detection callback (runs in GStreamer pipeline thread)
# ═══════════════════════════════════════════════════════════════

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


def app_callback(element, buffer, user_data):
    if buffer is None:
        return Gst.PadProbeReturn.OK

    user_data.frame_count += 1

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
            with state_lock:
                for i, tid in enumerate(sv_dets.tracker_id):
                    cls_name = CLASS_NAMES[sv_dets.class_id[i]]
                    if tid not in seen_ids[cls_name]:
                        seen_ids[cls_name].add(tid)
                        total = sum(len(s) for s in seen_ids.values())
                        print(f"[{timestamp}] New {cls_name} | Track:{tid} | Total:{total}")

    return Gst.PadProbeReturn.OK


def signal_handler(sig, frame):
    global running
    print("\nShutting down...")
    running = False


# ═══════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Default to Raspberry Pi camera if no --input specified
    if "--input" not in sys.argv:
        sys.argv += ["--input", "rpi"]
        print("[CAM] Using Raspberry Pi Camera Module v2 (--input rpi)")

    # Start Firebase background thread
    fb_thread = threading.Thread(target=firebase_thread, daemon=True)
    fb_thread.start()

    user_data = TrafficCounterData()
    app = GStreamerDetectionSimpleApp(app_callback, user_data)
    app.run()

    # Cleanup
    running = False
    fb_thread.join(timeout=2)

    # Print final summary
    print("\n" + "=" * 40)
    print("FINAL VEHICLE COUNT SUMMARY")
    print("=" * 40)
    with state_lock:
        total = 0
        for cls_name in CLASS_NAMES:
            count = len(seen_ids[cls_name])
            total += count
            print(f"  {cls_name}: {count}")
        print(f"  TOTAL: {total}")
