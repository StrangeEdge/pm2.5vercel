#Script to run with commands
#python3 /home/zaidparvez/Downloads/testData/traffic_counter_v2.py \
#    -n /home/zaidparvez/Downloads/yoloModel87-1.hef \
#    -i /home/zaidparvez/Downloads/testData/testDatav2/video6.mp4 \
#    --labels-json /home/zaidparvez/Downloads/traffic_labels.json \
#    --arch hailo8l \
#    --show-fps
import supervision as sv
import numpy as np
import csv
import os
import signal
from datetime import datetime
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst
import hailo
from hailo_apps.python.core.gstreamer.gstreamer_app import app_callback_class
from hailo_apps.python.pipeline_apps.detection_simple.detection_simple_pipeline import GStreamerDetectionSimpleApp

OUTPUT_CSV = "/home/zaidparvez/Downloads/vehicle_counts.csv"
CLASS_NAMES = ["Bus", "Car", "Jeepney", "Motorcycle", "Tricycle", "Truck"]
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
        # Track unique IDs seen per class
        self.seen_ids = {name: set() for name in CLASS_NAMES}
        self.csv_file = open(OUTPUT_CSV, 'w', newline='')
        self.csv_writer = csv.writer(self.csv_file)
        self.csv_writer.writerow(['timestamp', 'class', 'track_id', 'total_count'])
        self.csv_file.flush()
        print(f"Saving counts to {OUTPUT_CSV}")

def app_callback(element, buffer, user_data):
    if buffer is None:
        return Gst.PadProbeReturn.OK

    user_data.frame_count += 1
    if user_data.frame_count >= MAX_FRAMES:
        print(f"\nVideo complete ({MAX_FRAMES} frames) - stopping...")
        # Print summary
        print("\n" + "="*40)
        print("FINAL VEHICLE COUNT SUMMARY")
        print("="*40)
        total = 0
        for cls_name in CLASS_NAMES:
            count = len(user_data.seen_ids[cls_name])
            total += count
            print(f"  {cls_name}: {count}")
        print(f"  TOTAL: {total}")
        user_data.csv_file.close()
        os.kill(os.getpid(), signal.SIGINT)
        return Gst.PadProbeReturn.OK

    roi = hailo.get_roi_from_buffer(buffer)
    detections = roi.get_objects_typed(hailo.HAILO_DETECTION)

    boxes, scores, class_ids = [], [], []
    for det in detections:
        label = det.get_label()
        conf = det.get_confidence()
        if label not in CLASS_NAMES:
            continue
        bbox = det.get_bbox()
        x1 = bbox.xmin() * 640
        y1 = bbox.ymin() * 640
        x2 = bbox.xmax() * 640
        y2 = bbox.ymax() * 640
        boxes.append([x1, y1, x2, y2])
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
                    user_data.csv_writer.writerow([timestamp, cls_name, tid, total])
                    user_data.csv_file.flush()
                    print(f"[{timestamp}] New {cls_name} | Track:{tid} | Total:{total}")

    return Gst.PadProbeReturn.OK

if __name__ == "__main__":
    user_data = TrafficCounterData()
    app = GStreamerDetectionSimpleApp(app_callback, user_data)
    app.run()
    print(f"CSV saved to: {OUTPUT_CSV}")
