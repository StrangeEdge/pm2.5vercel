"""
PM2.5 Sensor Data Simulator - REST API Version
Sends simulated sensor data to Firebase Realtime Database via REST API
No authentication needed - works like the frontend
"""

import tkinter as tk
from tkinter import ttk, messagebox
import requests
import json
from datetime import datetime
import threading

# Firebase Realtime Database URL
RTDB_URL = "https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app"


class SensorSimulatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PM2.5 Sensor Data Simulator")
        self.root.geometry("700x800")
        self.root.resizable(False, False)
        
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
            text="Simulate sensor readings and send to Firebase Realtime Database",
            font=("Arial", 10),
            foreground="gray"
        )
        info_label.pack()
        
        # Connection status
        self.status_label = ttk.Label(
            self.root,
            text="Testing connection...",
            font=("Arial", 9),
            foreground="orange"
        )
        self.status_label.pack(pady=10)
        
        # Main form frame
        form_frame = ttk.LabelFrame(self.root, text="Sensor Data", padding=20)
        form_frame.pack(padx=20, pady=10, fill=tk.BOTH)
        
        # PM2.5 Value
        ttk.Label(form_frame, text="PM2.5 Value (μg/m³):", font=("Arial", 10)).grid(row=0, column=0, sticky=tk.W, pady=10)
        self.pm25_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.pm25_entry.grid(row=0, column=1, sticky=tk.EW, pady=10, padx=10)
        self.pm25_entry.insert(0, "45")
        
        # Location Name
        ttk.Label(form_frame, text="Location Name:", font=("Arial", 10)).grid(row=1, column=0, sticky=tk.W, pady=10)
        self.location_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.location_entry.grid(row=1, column=1, sticky=tk.EW, pady=10, padx=10)
        self.location_entry.insert(0, "Las Piñas Central")
        
        # Latitude
        ttk.Label(form_frame, text="Latitude:", font=("Arial", 10)).grid(row=2, column=0, sticky=tk.W, pady=10)
        self.lat_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.lat_entry.grid(row=2, column=1, sticky=tk.EW, pady=10, padx=10)
        self.lat_entry.insert(0, "14.3534")
        
        # Longitude
        ttk.Label(form_frame, text="Longitude:", font=("Arial", 10)).grid(row=3, column=0, sticky=tk.W, pady=10)
        self.lng_entry = ttk.Entry(form_frame, width=30, font=("Arial", 10))
        self.lng_entry.grid(row=3, column=1, sticky=tk.EW, pady=10, padx=10)
        self.lng_entry.insert(0, "120.9895")
        
        # Make columns resizable
        form_frame.columnconfigure(1, weight=1)
        
        # Preset locations
        preset_frame = ttk.LabelFrame(self.root, text="Preset Locations", padding=10)
        preset_frame.pack(padx=20, pady=10, fill=tk.BOTH)
        
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
            btn.grid(row=i, column=0, sticky=tk.EW, pady=3, padx=5)
        
        preset_frame.columnconfigure(0, weight=1)
        
        # Buttons frame
        button_frame = ttk.Frame(self.root)
        button_frame.pack(pady=15, padx=20, fill=tk.X)
        
        # Send button
        self.send_button = ttk.Button(
            button_frame,
            text="Send Data to Firebase",
            command=self.send_data_threaded
        )
        self.send_button.pack(side=tk.LEFT, padx=5)
        
        # Clear button
        clear_button = ttk.Button(
            button_frame,
            text="Clear Form",
            command=self.clear_form
        )
        clear_button.pack(side=tk.LEFT, padx=5)
        
        # Test Connection button
        test_button = ttk.Button(
            button_frame,
            text="Test Connection",
            command=self.test_connection
        )
        test_button.pack(side=tk.LEFT, padx=5)
        
        # Output log
        log_frame = ttk.LabelFrame(self.root, text="Activity Log", padding=10)
        log_frame.pack(padx=20, pady=10, fill=tk.BOTH, expand=True)
        
        # Scrollbar for log
        scrollbar = ttk.Scrollbar(log_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.log_text = tk.Text(log_frame, height=10, font=("Courier", 9), yscrollcommand=scrollbar.set)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.log_text.yview)
        
        self.log("Application started")
    
    def set_location(self, location_name, lat, lng):
        """Set location fields from preset"""
        self.location_entry.delete(0, tk.END)
        self.location_entry.insert(0, location_name)
        self.lat_entry.delete(0, tk.END)
        self.lat_entry.insert(0, str(lat))
        self.lng_entry.delete(0, tk.END)
        self.lng_entry.insert(0, str(lng))
        self.log(f"✓ Location set to: {location_name}")
    
    def test_connection(self):
        """Test Firebase connection"""
        self.log("Testing connection to Firebase...")
        self.status_label.config(text="Testing connection...", foreground="orange")
        self.root.update()
        
        try:
            response = requests.get(
                f"{RTDB_URL}/pm25_data.json",
                timeout=5
            )
            
            if response.status_code == 200:
                self.status_label.config(text="✓ Connected to Firebase", foreground="green")
                self.log("✓ Successfully connected to Firebase Realtime Database")
                self.send_button.config(state=tk.NORMAL)
            else:
                self.status_label.config(text=f"✗ HTTP {response.status_code}", foreground="red")
                self.log(f"✗ Connection failed with status: {response.status_code}")
                
        except requests.exceptions.Timeout:
            self.status_label.config(text="✗ Connection timeout", foreground="red")
            self.log("✗ Connection timeout - check your internet connection")
        except Exception as e:
            self.status_label.config(text="✗ Not connected", foreground="red")
            self.log(f"✗ Connection error: {str(e)}")
    
    def send_data_threaded(self):
        """Send data in a separate thread to avoid freezing UI"""
        thread = threading.Thread(target=self.send_data)
        thread.daemon = True
        thread.start()
    
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
            
            # Validate ranges
            if pm25 < 0:
                messagebox.showwarning("Validation Error", "PM2.5 value cannot be negative")
                return
            if lat < -90 or lat > 90:
                messagebox.showwarning("Validation Error", "Latitude must be between -90 and 90")
                return
            if lng < -180 or lng > 180:
                messagebox.showwarning("Validation Error", "Longitude must be between -180 and 180")
                return
            
            # Determine status based on PM2.5 value
            if pm25 <= 35:
                status = "good"
            elif pm25 <= 75:
                status = "moderate"
            elif pm25 <= 115:
                status = "unhealthy_for_sensitive"
            else:
                status = "unhealthy"
            
            # Create sensor data matching Firebase structure
            sensor_data = {
                "pm25": pm25,
                "lat": lat,
                "lng": lng,
                "name": location_name,
                "status": status,
                "timestamp": datetime.now().isoformat()
            }
            
            # Log the data being sent
            self.log(f"Sending data: PM2.5={pm25} μg/m³, Location={location_name}, Status={status}")
            
            # Send to Firebase via REST API
            response = requests.post(
                f"{RTDB_URL}/pm25_data.json",
                json=sensor_data,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                self.log(f"✓ Data sent successfully! Key: {result['name']}")
                messagebox.showinfo(
                    "Success",
                    f"✓ Data sent to Firebase!\n\n"
                    f"PM2.5: {pm25} μg/m³\n"
                    f"Status: {status}\n"
                    f"Location: {location_name}\n"
                    f"Coordinates: ({lat}, {lng})\n"
                    f"Database Key: {result['name']}\n\n"
                    f"Check the dashboard to see the data!"
                )
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                self.log(f"✗ Failed to send data: {error_msg}")
                messagebox.showerror("Error", f"Failed to send data:\n{error_msg}")
                
        except ValueError as e:
            messagebox.showerror("Input Error", f"Invalid input: {str(e)}")
            self.log(f"✗ Input error: {str(e)}")
        except requests.exceptions.Timeout:
            messagebox.showerror("Timeout Error", "Request timed out. Check your internet connection.")
            self.log("✗ Request timeout")
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
