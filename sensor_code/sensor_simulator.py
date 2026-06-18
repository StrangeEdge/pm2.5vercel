"""
PM2.5 Sensor Data Simulator
Sends simulated sensor data to Firebase Realtime Database
"""

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
from datetime import datetime
from pathlib import Path
import pyrebase4

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
        self.root.geometry("600x700")
        self.root.resizable(False, False)
        
        # Initialize Firebase
        self.firebase = pyrebase4.initialize_app(firebase_config)
        self.db = self.firebase.database()
        
        # Set up the GUI
        self.setup_ui()
        
        # Test connection on startup
        self.test_connection()
    
    def setup_ui(self):
        """Create the user interface"""
        # Header
        header_frame = ttk.Frame(self.root)
        header_frame.pack(pady=20, padx=20, fill=tk.X)
        
        header_label = ttk.Label(
            header_frame,
            text="PM2.5 Sensor Data Simulator",
            font=("Arial", 18, "bold")
        )
        header_label.pack()
        
        info_label = ttk.Label(
            header_frame,
            text="Simulate sensor readings and send to Firebase",
            font=("Arial", 10),
            foreground="gray"
        )
        info_label.pack()
        
        # Connection status
        self.status_label = ttk.Label(
            self.root,
            text="Connecting to Firebase...",
            font=("Arial", 9),
            foreground="orange"
        )
        self.status_label.pack(pady=10)
        
        # Main form frame
        form_frame = ttk.LabelFrame(self.root, text="Sensor Data", padding=20)
        form_frame.pack(padx=20, pady=10, fill=tk.BOTH, expand=True)
        
        # PM2.5 Value
        ttk.Label(form_frame, text="PM2.5 Value (μg/m³):", font=("Arial", 10)).grid(row=0, column=0, sticky=tk.W, pady=10)
        self.pm25_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.pm25_entry.grid(row=0, column=1, sticky=tk.EW, pady=10)
        self.pm25_entry.insert(0, "45")
        
        # Location Name
        ttk.Label(form_frame, text="Location Name:", font=("Arial", 10)).grid(row=1, column=0, sticky=tk.W, pady=10)
        self.location_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.location_entry.grid(row=1, column=1, sticky=tk.EW, pady=10)
        self.location_entry.insert(0, "Las Piñas Central")
        
        # Latitude
        ttk.Label(form_frame, text="Latitude:", font=("Arial", 10)).grid(row=2, column=0, sticky=tk.W, pady=10)
        self.lat_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.lat_entry.grid(row=2, column=1, sticky=tk.EW, pady=10)
        self.lat_entry.insert(0, "14.3534")
        
        # Longitude
        ttk.Label(form_frame, text="Longitude:", font=("Arial", 10)).grid(row=3, column=0, sticky=tk.W, pady=10)
        self.lng_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.lng_entry.grid(row=3, column=1, sticky=tk.EW, pady=10)
        self.lng_entry.insert(0, "120.9895")
        
        # Make columns resizable
        form_frame.columnconfigure(1, weight=1)
        
        # Preset locations dropdown
        ttk.Label(form_frame, text="Or select preset location:", font=("Arial", 10)).grid(row=4, column=0, sticky=tk.W, pady=10)
        self.location_var = tk.StringVar(value="custom")
        
        preset_frame = ttk.Frame(form_frame)
        preset_frame.grid(row=4, column=1, sticky=tk.EW, pady=10)
        
        presets = {
            "Las Piñas Central": (14.3534, 120.9895),
            "Pacita Complex": (14.3450, 120.9850),
            "CBD Area": (14.3620, 120.9920),
            "Industrial Zone": (14.3380, 121.0050),
            "Residential Area": (14.3700, 120.9750),
        }
        
        for location_name, (lat, lng) in presets.items():
            btn = ttk.Button(
                preset_frame,
                text=location_name,
                command=lambda l=location_name, la=lat, lo=lng: self.set_location(l, la, lo),
                width=20
            )
            btn.pack(pady=3)
        
        # Buttons frame
        button_frame = ttk.Frame(self.root)
        button_frame.pack(pady=20, padx=20, fill=tk.X)
        
        # Send button
        self.send_button = ttk.Button(
            button_frame,
            text="Send Data to Firebase",
            command=self.send_data
        )
        self.send_button.pack(side=tk.LEFT, padx=5)
        
        # Clear button
        clear_button = ttk.Button(
            button_frame,
            text="Clear Form",
            command=self.clear_form
        )
        clear_button.pack(side=tk.LEFT, padx=5)
        
        # Output log
        log_frame = ttk.LabelFrame(self.root, text="Log", padding=10)
        log_frame.pack(padx=20, pady=10, fill=tk.BOTH, expand=True)
        
        # Scrollbar for log
        scrollbar = ttk.Scrollbar(log_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.log_text = tk.Text(log_frame, height=8, font=("Courier", 9), yscrollcommand=scrollbar.set)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.log_text.yview)
        
        self.log("Application started. Ready to send sensor data.")
    
    def set_location(self, location_name, lat, lng):
        """Set location fields from preset"""
        self.location_entry.delete(0, tk.END)
        self.location_entry.insert(0, location_name)
        self.lat_entry.delete(0, tk.END)
        self.lat_entry.insert(0, str(lat))
        self.lng_entry.delete(0, tk.END)
        self.lng_entry.insert(0, str(lng))
        self.log(f"Location set to: {location_name} ({lat}, {lng})")
    
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
            location_name = self.location_entry.get().strip()
            lat_str = self.lat_entry.get().strip()
            lng_str = self.lng_entry.get().strip()
            
            if not pm25_str:
                messagebox.showwarning("Input Error", "Please enter PM2.5 value")
                return
            if not location_name:
                messagebox.showwarning("Input Error", "Please enter location name")
                return
            if not lat_str or not lng_str:
                messagebox.showwarning("Input Error", "Please enter latitude and longitude")
                return
            
            # Convert to appropriate types
            pm25 = float(pm25_str)
            lat = float(lat_str)
            lng = float(lng_str)
            
            # Determine status based on PM2.5 value
            if pm25 <= 35:
                status = "good"
            elif pm25 <= 75:
                status = "moderate"
            elif pm25 <= 115:
                status = "unhealthy_for_sensitive"
            else:
                status = "unhealthy"
            
            # Create sensor data
            sensor_data = {
                "pm25": pm25,
                "location": {
                    "name": location_name,
                    "lat": lat,
                    "lng": lng
                },
                "status": status,
                "timestamp": datetime.now().isoformat()
            }
            
            # Send to Firebase
            self.log(f"Sending data: {json.dumps(sensor_data, indent=2)}")
            
            # Push data to Firebase (creates new child with auto-generated key)
            result = self.db.child("pm25_data").push(sensor_data)
            
            self.log(f"✓ Data sent successfully! ID: {result['name']}")
            messagebox.showinfo(
                "Success",
                f"Data sent successfully!\n\n"
                f"PM2.5: {pm25} μg/m³\n"
                f"Location: {location_name}\n"
                f"Status: {status}\n"
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
        self.pm25_entry.insert(0, "45")
        self.location_entry.delete(0, tk.END)
        self.location_entry.insert(0, "Las Piñas Central")
        self.lat_entry.delete(0, tk.END)
        self.lat_entry.insert(0, "14.3534")
        self.lng_entry.delete(0, tk.END)
        self.lng_entry.insert(0, "120.9895")
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
