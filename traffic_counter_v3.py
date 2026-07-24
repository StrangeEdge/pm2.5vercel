"""
Vehicle detection with Hailo-8L + live camera/video -> Firebase RTDB.
Counts unique vehicles via ByteTrack and PATCHes vehicle counts
onto the existing esp32-sensor-01 RTDB key every 5 seconds.
Offline data is queued locally and synced on reconnect.

Usage (matches your existing test command):
python3 traffic_counter_v2.py \
    --hef-path /home/zaidparvez/Downloads/yoloModel87-1.hef \
    -i /home/zaidparvez/Downloads/testData/testDatav2/video2.mp4 \
    --labels-json /home/zaidparvez/Downloads/traffic_labels.json \
    --arch hailo8l \
    --show-fps
"""

import supervision as sv
import numpy as np
import json
import os
import signal
import sys
import time
import threading
from datetime import datetime, timezone, timedelta

import requests
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
import hailo
from hailo_apps.python.core.gstreamer.gstreamer_app import app_callback_class
from hailo_apps.python.pipeline_apps.detection_simple.detection_simple_pipeline import GStreamerDetectionSimpleApp

# â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
RTDB_URL      = "https://my-pm25-3edea-default-rtdb.asia-southeast1.firebasedatabase.app"
SENSOR_KEY    = "esp32-sensor-01"
PATCH_PATH    = f"/pm25_data/{SENSOR_KEY}.json"

# Database Secret used for authenticated PATCH/POST, same pattern as the
# ESP32 sketch and realtimeDatabaseHelpers.ts. Set this via env var rather
# than hardcoding it in the file.
RTDB_AUTH     = os.environ.get("FIREBASE_DB_SECRET", "")
if not RTDB_AUTH:
    print("[WARN] FIREBASE_DB_SECRET not set â€” PATCH requests will likely 401 "
          "if your RTDB rules require auth != null. "
          "Run: export FIREBASE_DB_SECRET=your_secret_here")

SEND_INTERVAL   = 5        # seconds between Firebase pushes
SYNC_INTERVAL   = 30       # seconds between backlog sync attempts
MAX_BACKLOG_AGE = 86400    # 24 hours in seconds
BACKLOG_FILE    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vehicle_backlog.json")
VHIST_PATH      = f"/vehicle_history/{SENSOR_KEY}.json"
MIN_CONFIDENCE  = 0.4      # filter weak detections before they ever reach the tracker

PH_TIMEZONE   = timezone(timedelta(hours=8))  # Philippine Standard Time

# NOTE: lowercase to match your traffic_labels.json convention
# ("unlabeled" at index 0, lowercase class names). Verify these six strings
# against your actual labels file â€” order/spelling must match exactly.
CLASS_NAMES = ["bus", "car", "jeep", "motorcycle", "tricycle", "truck"]

DASHBOARD_VEHICLE_TYPES = ["Car", "Jeep", "Truck", "Tricycle", "Motorcycle", "Bus"]

CLASS_TO_DASHBOARD = {
    "bus": "Bus",
    "car": "Car",
    "jeep": "Jeep",
    "motorcycle": "Motorcycle",
    "tricycle": "Tricycle",
    "truck": "Truck",
}

# â”€â”€ Shared state (thread-safe between detection callback & Firebase thread) â”€â”€
state_lock      = threading.Lock()
seen_ids        = {name: set() for name in CLASS_NAMES}
last_push_time  = 0
running         = True

# Set by main() once the app is constructed, so signal_handler can trigger a
# real pipeline shutdown instead of only flipping a flag the Firebase thread
# polls. Verify `app.shutdown` / `app.quit` against whichever method your
# working rpi-camera pipeline actually exposes -- these names are the most
# common in hailo_apps-based wrappers but weren't confirmed against your
# specific SingleRunApp subclass from the June fix.
app_ref = None


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Firebase helpers
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

def _auth_suffix():
    return f"?auth={RTDB_AUTH}" if RTDB_AUTH else ""


def get_current_counts():
    """Return dict matching DASHBOARD_VEHICLE_TYPES from seen_ids."""
    with state_lock:
        return {CLASS_TO_DASHBOARD[cls]: len(seen_ids[cls]) for cls in CLASS_NAMES}


def patch_vehicles_to_firebase(counts):
    """PATCH vehicles + Philippine-time timestamp onto the existing sensor key."""
    payload = {
        "vehicles": counts,
        "vehicles_timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
    }
    try:
        resp = requests.patch(
            f"{RTDB_URL}{PATCH_PATH}{_auth_suffix()}",
            json=payload,
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[FB] PATCH failed: {resp.status_code} {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"[FB] PATCH error: {e}")
        return False


def push_vehicle_history(counts):
    """POST vehicle counts to history path for time‑series chart."""
    payload = {
        "vehicles": counts,
        "timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
    }
    try:
        resp = requests.post(
            f"{RTDB_URL}{VHIST_PATH}{_auth_suffix()}",
            json=payload,
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[FB] Vehicle history POST failed: {resp.status_code} {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"[FB] Vehicle history error: {e}")
        return False


def save_vehicles_locally(counts):
    """Append counts to local backlog JSON array."""
    backlog = []
    if os.path.exists(BACKLOG_FILE):
        try:
            with open(BACKLOG_FILE, "r") as f:
                backlog = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"[BACKLOG] Read error, resetting backlog: {e}")
            backlog = []

    backlog.append({
        "timestamp": datetime.now(PH_TIMEZONE).strftime("%Y-%m-%dT%H:%M:%S.000+08:00"),
        "vehicles": counts
    })

    try:
        with open(BACKLOG_FILE, "w") as f:
            json.dump(backlog, f)
    except IOError as e:
        print(f"[BACKLOG] Write error: {e}")


def sync_backlog():
    """Push queued vehicle counts from backlog file to Firebase, oldest first."""
    if not os.path.exists(BACKLOG_FILE):
        return

    try:
        with open(BACKLOG_FILE, "r") as f:
            backlog = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[SYNC] Backlog read error, discarding file: {e}")
        os.remove(BACKLOG_FILE)
        return

    if not backlog:
        os.remove(BACKLOG_FILE)
        return

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
    latest = backlog[-1]

    if patch_vehicles_to_firebase(latest["vehicles"]):
        print("[SYNC] Backlog synced and cleared")
        os.remove(BACKLOG_FILE)
    else:
        print("[SYNC] Send failed, keeping latest entry for retry")
        try:
            with open(BACKLOG_FILE, "w") as f:
                json.dump([latest], f)
        except IOError as e:
            print(f"[SYNC] Backlog write error: {e}")


def iso_to_epoch(iso_str):
    """ISO-8601 -> Unix epoch (handles Z and +08:00 offsets)."""
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.timestamp()
    except Exception as e:
        print(f"[SYNC] Timestamp parse error for '{iso_str}': {e}")
        return 0


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Firebase background thread
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
                    print("[FB] Reconnected â€” syncing backlog")
                    sync_backlog()
                    was_offline = False
            else:
                if not was_offline:
                    print("[FB] Offline â€” saving counts locally")
                save_vehicles_locally(counts)
                was_offline = True

            push_vehicle_history(counts)

        if now - last_sync >= SYNC_INTERVAL:
            last_sync = now
            if not was_offline:
                sync_backlog()

        time.sleep(1)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Hailo detection callback (runs in GStreamer pipeline thread)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        label = det.get_label().strip().lower()
        conf = det.get_confidence()

        if label not in CLASS_NAMES:
            continue
        if conf < MIN_CONFIDENCE:
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

    # Actually stop the pipeline, not just the polling flag â€” otherwise
    # app.run() below never returns and the Hailo vdevice doesn't get
    # released cleanly (root cause of the HAILO_OUT_OF_PHYSICAL_DEVICES(74)
    # orphaned-PID issue from before). Verify one of these paths matches
    # your framework version; if none apply, check what your working
    # rpi-camera script does on Ctrl+C and mirror that here.
    if app_ref is not None:
        for method_name in ("quit", "shutdown", "stop"):
            method = getattr(app_ref, method_name, None)
            if callable(method):
                try:
                    method()
                except Exception as e:
                    print(f"[SHUTDOWN] {method_name}() raised: {e}")
                break
        else:
            print("[SHUTDOWN] No quit/shutdown/stop method found on app â€” "
                  "pipeline may not exit cleanly. If it hangs, check for an "
                  "orphaned Hailo process afterward (pkill pattern from before).")


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  App subclass â€” forces the correct HEF and labels file to be used.
#  The framework silently ignores --hef-path/-n and --labels-json CLI args
#  (confirmed in the June debugging session), so both must be set directly
#  on the instance after super().__init__() runs.
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class SingleRunApp(GStreamerDetectionSimpleApp):
    def __init__(self, app_callback, user_data):
        super().__init__(app_callback, user_data)

        # Re-apply CLI args that the base class ignores.
        # Verify these attribute names against your working June setup â€”
        # they may differ slightly by hailo_apps version.
        if hasattr(self, "hef_path"):
            self.hef_path = self.options_menu.hef_path or self.hef_path
        if hasattr(self, "labels_json"):
            self.labels_json = self.options_menu.labels_json or self.labels_json

        print(f"[INIT] Using HEF: {getattr(self, 'hef_path', 'UNKNOWN')}")
        print(f"[INIT] Using labels: {getattr(self, 'labels_json', 'UNKNOWN')}")

    def on_eos(self):
        """Quit cleanly when a video file (rather than a live stream) ends."""
        print("[EOS] End of stream reached, shutting down")
        global running
        running = False
        try:
            super().on_eos()
        except AttributeError:
            # base class may not implement on_eos; fall back to quitting
            for method_name in ("quit", "shutdown", "stop"):
                method = getattr(self, method_name, None)
                if callable(method):
                    method()
                    break


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  Main
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Default to Raspberry Pi camera only if the user hasn't specified an
    # input at all (either -i or --input). Your usual test command passes
    # -i explicitly, so this must not clobber that.
    if "--input" not in sys.argv and "-i" not in sys.argv:
        sys.argv += ["--input", "rpi"]
        print("[CAM] No --input/-i given, defaulting to Raspberry Pi Camera (rpi)")

    # Start Firebase background thread
    fb_thread = threading.Thread(target=firebase_thread, daemon=True)
    fb_thread.start()

    user_data = TrafficCounterData()
    app = SingleRunApp(app_callback, user_data)
    app_ref = app
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
            print(f"  {CLASS_TO_DASHBOARD[cls_name]}: {count}")
        print(f"  TOTAL: {total}")

