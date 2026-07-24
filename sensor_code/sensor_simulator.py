"""
PM2.5 Sensor Data Simulator
Sends simulated sensor data to Firebase Realtime Database
"""

import tkinter as tk
from tkinter import ttk, messagebox
import json
from datetime import datetime, timezone
import pyrebase4

VEHICLE_TYPES = [
    "Car",
    "Van",
    "Jeepney",
    "Truck",
    "Tricycle",
    "Motorcycle",
    "Bus",
]

DEFAULT_VEHICLE_COUNTS = {
    "Car": 5,
    "Van": 0,
    "Jeepney": 4,
    "Truck": 5,
    "Tricycle": 0,
    "Motorcycle": 0,
    "Bus": 0,
}

# Initialize Firebase configuration
firebase_config = {
    "apiKey": "AIzaSyDYauzEr-zZabiMK15OCWq_6acjyPxjH9w",
    "authDomain": "thesis-1dbf3.firebaseapp.com",
    "databaseURL": "https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app",
    "storageBucket": "thesis-1dbf3.firebasestorage.app"
}


class SensorSimulatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PM2.5 Sensor Data Simulator")
        self.root.geometry("980x560")
        self.root.resizable(True, True)
        self.root.minsize(900, 520)

        self.vehicle_entries = {}
        # Initialize Firebase
        self.firebase = pyrebase4.initialize_app(firebase_config)
        self.db = self.firebase.database()
        
        # Set up the GUI
        self.setup_ui()
        
        # Test connection on startup
        self.test_connection()
    
    def setup_ui(self):
        """Create the user interface"""
        header_frame = ttk.Frame(self.root)
        header_frame.pack(pady=(10, 4), padx=16, fill=tk.X)

        ttk.Label(
            header_frame,
            text="PM2.5 Sensor Data Simulator",
            font=("Arial", 16, "bold"),
        ).pack()

        ttk.Label(
            header_frame,
            text="Simulate sensor readings and send to Firebase",
            font=("Arial", 9),
            foreground="gray",
        ).pack()

        self.status_label = ttk.Label(
            self.root,
            text="Connecting to Firebase...",
            font=("Arial", 9),
            foreground="orange",
        )
        self.status_label.pack(pady=(0, 6))

        content_frame = ttk.Frame(self.root)
        content_frame.pack(padx=16, pady=4, fill=tk.BOTH, expand=True)

        form_frame = ttk.LabelFrame(content_frame, text="Sensor Data", padding=10)
        form_frame.grid(row=0, column=0, sticky=tk.NSEW, padx=(0, 8))

        ttk.Label(form_frame, text="PM2.5 (μg/m³):", font=("Arial", 10)).grid(
            row=0, column=0, sticky=tk.W, pady=4
        )
        self.pm25_entry = ttk.Entry(form_frame, width=18, font=("Arial", 10))
        self.pm25_entry.grid(row=0, column=1, sticky=tk.EW, pady=4, padx=(8, 0))
        self.pm25_entry.insert(0, "123")

        ttk.Label(form_frame, text="Latitude:", font=("Arial", 10)).grid(
            row=1, column=0, sticky=tk.W, pady=4
        )
        self.lat_entry = ttk.Entry(form_frame, width=18, font=("Arial", 10))
        self.lat_entry.grid(row=1, column=1, sticky=tk.EW, pady=4, padx=(8, 0))
        self.lat_entry.insert(0, "14.4451")

        ttk.Label(form_frame, text="Longitude:", font=("Arial", 10)).grid(
            row=2, column=0, sticky=tk.W, pady=4
        )
        self.lng_entry = ttk.Entry(form_frame, width=18, font=("Arial", 10))
        self.lng_entry.grid(row=2, column=1, sticky=tk.EW, pady=4, padx=(8, 0))
        self.lng_entry.insert(0, "120.982")

        form_frame.columnconfigure(1, weight=1)

        vehicle_frame = ttk.LabelFrame(content_frame, text="Vehicle Counts", padding=10)
        vehicle_frame.grid(row=0, column=1, sticky=tk.NSEW)

        for index, vehicle_type in enumerate(VEHICLE_TYPES):
            row = index // 4
            col = (index % 4) * 2
            ttk.Label(vehicle_frame, text=f"{vehicle_type}:", font=("Arial", 9)).grid(
                row=row, column=col, sticky=tk.W, pady=3, padx=(0, 4)
            )
            entry = ttk.Entry(vehicle_frame, width=6, font=("Arial", 10))
            entry.grid(row=row, column=col + 1, sticky=tk.W, pady=3, padx=(0, 12))
            entry.insert(0, str(DEFAULT_VEHICLE_COUNTS[vehicle_type]))
            self.vehicle_entries[vehicle_type] = entry

        content_frame.columnconfigure(0, weight=1)
        content_frame.columnconfigure(1, weight=2)

        preset_frame = ttk.LabelFrame(self.root, text="Preset Locations", padding=8)
        preset_frame.pack(padx=16, pady=4, fill=tk.X)

        presets = {
            "Las Piñas Central": (14.3534, 120.9895),
            "Pacita Complex": (14.3450, 120.9850),
            "CBD Area": (14.3620, 120.9920),
            "Industrial Zone": (14.3380, 121.0050),
            "Residential Area": (14.3700, 120.9750),
        }

        for i, (location_name, (lat, lng)) in enumerate(presets.items()):
            btn = ttk.Button(
                preset_frame,
                text=location_name,
                command=lambda l=location_name, la=lat, lo=lng: self.set_location(l, la, lo),
            )
            btn.grid(row=0, column=i, sticky=tk.EW, padx=4)

        for i in range(len(presets)):
            preset_frame.columnconfigure(i, weight=1)

        button_frame = ttk.Frame(self.root)
        button_frame.pack(pady=8, padx=16, fill=tk.X)

        self.send_button = ttk.Button(
            button_frame,
            text="Send Data to Firebase",
            command=self.send_data,
        )
        self.send_button.pack(side=tk.LEFT, padx=(0, 6))

        ttk.Button(
            button_frame,
            text="Clear Form",
            command=self.clear_form,
        ).pack(side=tk.LEFT, padx=6)

        log_frame = ttk.LabelFrame(self.root, text="Log", padding=6)
        log_frame.pack(padx=16, pady=(0, 10), fill=tk.BOTH)

        scrollbar = ttk.Scrollbar(log_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        self.log_text = tk.Text(log_frame, height=4, font=("Courier", 9), yscrollcommand=scrollbar.set)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.log_text.yview)

        self.log("Application started. Ready to send sensor data.")
    
    def set_location(self, location_name, lat, lng):
        """Set location fields from preset"""
        self.lat_entry.delete(0, tk.END)
        self.lat_entry.insert(0, str(lat))
        self.lng_entry.delete(0, tk.END)
        self.lng_entry.insert(0, str(lng))
        self.log(f"Location set to: {location_name} ({lat}, {lng})")

    def get_vehicle_counts(self):
        vehicles = {}
        for vehicle_type in VEHICLE_TYPES:
            value_str = self.vehicle_entries[vehicle_type].get().strip()
            if not value_str:
                raise ValueError(f"Please enter a count for {vehicle_type}")
            count = int(value_str)
            if count < 0:
                raise ValueError(f"{vehicle_type} count cannot be negative")
            vehicles[vehicle_type] = count
        return vehicles
    
    def test_connection(self):
        """Test Firebase connection"""
        try:
            # Try to read a small piece of data to test connection
            test_data = self.db.child("pm25_data").limit(1).get()
            self.status_label.config(text="✓ Connected to Firebase", foreground="green")
            self.log("✓ Successfully connected to Firebase Realtime Database")
            self.send_button.config(state=tk.NORMAL)
        except Exception as e:
            self.status_label.config(text="✗ Not connected to Firebase", foreground="red")
            self.log(f"✗ Connection failed: {str(e)}")
            self.send_button.config(state=tk.DISABLED)
            messagebox.showerror(
                "Connection Error",
                f"Failed to connect to Firebase:\n{str(e)}\n\n"
                "Make sure:\n"
                "1. You have internet connection\n"
                "2. Your Firebase database is accessible\n"
                "3. Database rules allow public read/write access"
            )
    
    def send_data(self):
        """Send sensor data to Firebase"""
        try:
            # Validate inputs
            pm25_str = self.pm25_entry.get().strip()
            lat_str = self.lat_entry.get().strip()
            lng_str = self.lng_entry.get().strip()
            
            if not pm25_str:
                messagebox.showwarning("Input Error", "Please enter PM2.5 value")
                return
            if not lat_str or not lng_str:
                messagebox.showwarning("Input Error", "Please enter latitude and longitude")
                return
            
            pm25 = float(pm25_str)
            latitude = float(lat_str)
            longitude = float(lng_str)
            vehicles = self.get_vehicle_counts()
            
            sensor_data = {
                "latitude": latitude,
                "longitude": longitude,
                "pm25": int(pm25) if pm25.is_integer() else pm25,
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "vehicles": vehicles,
            }
            
            # Send to Firebase
            self.log(f"Sending data: {json.dumps(sensor_data, indent=2)}")
            
            result = self.db.child("pm25_data").push(sensor_data)
            
            self.log(f"✓ Data sent successfully! ID: {result['name']}")
            messagebox.showinfo(
                "Success",
                f"Data sent successfully!\n\n"
                f"PM2.5: {sensor_data['pm25']} μg/m³\n"
                f"Coordinates: ({latitude}, {longitude})\n"
                f"Total vehicles: {sum(vehicles.values())}\n"
                f"ID: {result['name']}"
            )
            
        except ValueError as e:
            messagebox.showerror("Input Error", f"Invalid input: {str(e)}")
            self.log(f"✗ Input error: {str(e)}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to send data: {str(e)}")
            self.log(f"✗ Error: {str(e)}")
    
    def clear_form(self):
        """Clear all input fields"""
        self.pm25_entry.delete(0, tk.END)
        self.pm25_entry.insert(0, "123")
        self.lat_entry.delete(0, tk.END)
        self.lat_entry.insert(0, "14.4451")
        self.lng_entry.delete(0, tk.END)
        self.lng_entry.insert(0, "120.982")
        for vehicle_type, entry in self.vehicle_entries.items():
            entry.delete(0, tk.END)
            entry.insert(0, str(DEFAULT_VEHICLE_COUNTS[vehicle_type]))
        self.log("Form cleared")
    
    def log(self, message):
        """Add message to log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}\n"
        self.log_text.insert(tk.END, log_entry)
        self.log_text.see(tk.END)  # Auto-scroll to bottom
        self.root.update()


if __name__ == "__main__":
    root = tk.Tk()
    app = SensorSimulatorApp(root)
    root.mainloop()
