// ============================================================
//  PMS5003 + SSD1306 — PM2.5 only, with Philippine time via NTP
//
//  PMS5003 wiring (UART2):
//    TX  →  ESP32 GPIO 16  (UART2 RX)
//    RX  →  ESP32 GPIO 17  (UART2 TX)
//    VCC →  5V
//    GND →  GND
//
//  SSD1306 wiring (I2C):
//    SDA →  ESP32 GPIO 21
//    SCL →  ESP32 GPIO 22
//    VCC →  3.3V
//    GND →  GND
// ============================================================

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include "time.h"

// ── WiFi ─────────────────────────────────────────────────────
const char* WIFI_SSID = "Testt";
const char* WIFI_PASS = "pocotestx7";

// ── NTP (Philippine Standard Time = UTC+8, no DST) ───────────
const char* NTP_SERVER   = "pool.ntp.org";
const long  GMT_OFFSET   = 8 * 3600;   // +8 hours
const int   DST_OFFSET   = 0;          // Philippines has no DST

// ── Firebase RTDB ────────────────────────────────────────────
const char*  RTDB_HOST    = "pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app";
const char*  RTDB_PATH    = "/pm25_data/esp32-sensor-01.json";   // live state (PATCH)
const char*  HIST_PATH    = "/pm25_history/esp32-sensor-01.json"; // time series (POST)
const int    HTTPS_PORT   = 443;

// ── Sensor location (fixed) ───────────────────────────────────
const double SENSOR_LAT = 14.448133836842521;
const double SENSOR_LNG = 120.98502011120459;

// ── Intervals ─────────────────────────────────────────────────
const unsigned long SEND_INTERVAL       =  5000;   // push to Firebase every 5 s
const unsigned long SYNC_CHECK_INTERVAL = 30000;   // retry backlog sync every 30 s
const unsigned long MAX_BACKLOG_AGE_MS  = 86400000; // 24 h

// ── SPIFFS ────────────────────────────────────────────────────
const char* BACKLOG_FILE = "/backlog.json";

// ── OLED ─────────────────────────────────────────────────────
#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1
#define OLED_I2C_ADDR  0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ── UART2 for PMS5003 ─────────────────────────────────────────
#define PMS_RX_PIN  16
#define PMS_TX_PIN  17
#define PMS_BAUD    9600

HardwareSerial pmsSerial(2);

// ── State ─────────────────────────────────────────────────────
struct PmsData {
  uint16_t pm2_5_atm;
  bool valid;
};

PmsData latest = {0, false};

// Running average (circular buffer, 10 samples)
#define AVG_WINDOW 10
uint16_t readings[AVG_WINDOW] = {0};
uint8_t  readingIdx    = 0;
uint8_t  readingCount  = 0;
uint16_t smoothedPm25  = 0;

// Sensor health — if no valid frame in 10 s, sensor is dead
unsigned long lastValidFrame = 0;
const unsigned long SENSOR_TIMEOUT_MS = 10000;

unsigned long lastRead      = 0;
unsigned long lastDisplay   = 0;
unsigned long lastSend      = 0;
unsigned long lastSyncCheck = 0;
bool wifiWasDisconnected    = false;

// Warmup — discard first 30 s of readings
const unsigned long WARMUP_MS = 30000;

const unsigned long READ_INTERVAL    = 1000;
const unsigned long DISPLAY_INTERVAL = 1000;

// ─────────────────────────────────────────────────────────────
//  Parse one PMS5003 frame (32 bytes, validated against spec)
// ─────────────────────────────────────────────────────────────
bool readPms(PmsData &out) {
  if (pmsSerial.available() < 32) return false;

  while (pmsSerial.available() >= 32) {
    if (pmsSerial.peek() != 0x42) { pmsSerial.read(); continue; }

    uint8_t buf[32];
    if (pmsSerial.readBytes(buf, 32) != 32) return false;

    // Start bytes
    if (buf[0] != 0x42 || buf[1] != 0x4D) continue;

    // Frame length: bytes 2-3 must equal 0x001C (28 data bytes after header)
    uint16_t frameLen = (buf[2] << 8) | buf[3];
    if (frameLen != 0x001C) continue;

    // Checksum: sum of first 30 bytes must match bytes 30-31
    uint16_t sum = 0;
    for (int i = 0; i < 30; i++) sum += buf[i];
    if (sum != ((buf[30] << 8) | buf[31])) continue;

    out.pm2_5_atm = (buf[12] << 8) | buf[13];
    out.valid = true;
    lastValidFrame = millis();
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
//  AQI label for PM2.5 (US EPA breakpoints, 24-hr avg)
// ─────────────────────────────────────────────────────────────
const char* aqiLabel(uint16_t pm25) {
  if (pm25 <=  12) return "GOOD";
  if (pm25 <=  35) return "MODERATE";
  if (pm25 <=  55) return "UNHLTH SENS";
  if (pm25 <= 150) return "UNHEALTHY";
  if (pm25 <= 250) return "VERY UNHLTHY";
  return "HAZARDOUS";
}

// ─────────────────────────────────────────────────────────────
//  Rolling average — smooths PMS5003 noise (±15-20% per sample)
// ─────────────────────────────────────────────────────────────
uint16_t addToAverage(uint16_t raw) {
  readings[readingIdx] = raw;
  readingIdx = (readingIdx + 1) % AVG_WINDOW;
  if (readingCount < AVG_WINDOW) readingCount++;

  uint32_t total = 0;
  for (uint8_t i = 0; i < readingCount; i++) total += readings[i];
  return (uint16_t)(total / readingCount);
}

// ─────────────────────────────────────────────────────────────
//  Draw the OLED screen
// ─────────────────────────────────────────────────────────────
void updateDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // ── Time (top row) ──
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    char timeBuf[12];
    strftime(timeBuf, sizeof(timeBuf), "%I:%M:%S %p", &timeinfo);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(timeBuf);
  } else {
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("Syncing time...");
  }

  // ── WiFi signal indicator (top‑right) ──
  int bars = 0;
  if (WiFi.status() == WL_CONNECTED) {
    int rssi = WiFi.RSSI();
    if      (rssi > -50) bars = 4;
    else if (rssi > -60) bars = 3;
    else if (rssi > -70) bars = 2;
    else if (rssi > -80) bars = 1;
  }
  int barX = 103;
  for (int i = 0; i < 4; i++) {
    int x = barX + i * 5;
    int h = 2 + i * 2;          // heights: 2, 4, 6, 8
    int y = 8 - h;
    if (i < bars)
      display.fillRect(x, y, 3, h, SSD1306_WHITE);
    else
      display.drawRect(x, y, 3, h, SSD1306_WHITE);
  }

  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // ── Check for sensor fault ──
  if (millis() - lastValidFrame > SENSOR_TIMEOUT_MS) {
    display.setTextSize(1);
    display.setCursor(10, 28);
    display.print("SENSOR FAULT");
    display.setCursor(10, 42);
    display.print("Check wiring");
    display.drawLine(0, 54, 127, 54, SSD1306_WHITE);
  }
  // ── Warmup countdown ──
  else if (millis() < WARMUP_MS) {
    unsigned long remaining = (WARMUP_MS - millis()) / 1000 + 1;
    display.setTextSize(1);
    display.setCursor(18, 22);
    display.print("Sensor warmup");
    display.setTextSize(2);
    char countBuf[6];
    snprintf(countBuf, sizeof(countBuf), "%lu", remaining);
    int16_t bx, by; uint16_t bw, bh;
    display.getTextBounds(countBuf, 0, 0, &bx, &by, &bw, &bh);
    display.setCursor(56 - bw, 36);
    display.print(countBuf);
    display.setTextSize(1);
    display.setCursor(56, 36);
    if (remaining == 1)
      display.print(" second");
    else
      display.print(" seconds");
    display.drawLine(0, 54, 127, 54, SSD1306_WHITE);
  }
  // ── PM2.5 value (large, centred) ──
  else if (!latest.valid) {
    display.setTextSize(1);
    display.setCursor(10, 30);
    display.print("Waiting for sensor...");
  } else {
    // Label
    display.setTextSize(1);
    display.setCursor(0, 14);
    display.print("PM2.5  ug/m3");

    // Big number — use smoothed value
    char valBuf[8];
    snprintf(valBuf, sizeof(valBuf), "%u", smoothedPm25);
    display.setTextSize(3);
    // Right-align the number in the left ~70 px
    int16_t bx, by; uint16_t bw, bh;
    display.getTextBounds(valBuf, 0, 0, &bx, &by, &bw, &bh);
    display.setCursor(64 - bw, 26);
    display.print(valBuf);

    // AQI label (right side, small)
    display.setTextSize(1);
    display.setCursor(70, 32);
    display.print(aqiLabel(smoothedPm25));

    // Separator
    display.drawLine(0, 54, 127, 54, SSD1306_WHITE);

    // Date (bottom row)
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      char dateBuf[18];
      strftime(dateBuf, sizeof(dateBuf), "%a %b %d %Y", &timeinfo);
      display.setTextSize(1);
      display.setCursor(0, 57);
      display.print(dateBuf);
    }
  }

  display.display();
}

// ─────────────────────────────────────────────────────────────
//  ISO‑8601 timestamp from NTP (UTC)
// ─────────────────────────────────────────────────────────────
String getISOTimestamp() {
  time_t now;
  time(&now);  // UTC epoch
  if (now < 1700000000) return ""; // NTP not synced yet

  struct tm* tu = gmtime(&now);
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S.000Z", tu);
  return String(buf);
}

// ─────────────────────────────────────────────────────────────
//  ISO string → Unix epoch (UTC seconds) — manual calc for ESP32
// ─────────────────────────────────────────────────────────────
unsigned long isoToEpoch(const char* iso) {
  int Y, M, D, h, m, s, ms;
  if (sscanf(iso, "%d-%d-%dT%d:%d:%d.%dZ", &Y, &M, &D, &h, &m, &s, &ms) < 6)
    return 0;

  // Days from 1970-01-01
  unsigned long days = 0;
  for (int y = 1970; y < Y; y++)
    days += ((y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 366 : 365);

  static const uint16_t monthDays[] = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 };
  days += monthDays[M - 1] + (D - 1);

  // Leap day correction for current year (if after Feb)
  if (M > 2 && (Y % 4 == 0 && (Y % 100 != 0 || Y % 400 == 0)))
    days += 1;

  return days * 86400UL + h * 3600UL + m * 60UL + s;
}

// ─────────────────────────────────────────────────────────────
//  PATCH sensor reading to Firebase (merges — won't clobber
//  vehicle counts written by the Raspberry Pi)
// ─────────────────────────────────────────────────────────────
bool sendToFirebase(uint16_t pm25, const char* timestamp) {
  WiFiClientSecure client;
  client.setInsecure();  // skip cert validation (ESP32 memory constrained)

  if (!client.connect(RTDB_HOST, HTTPS_PORT)) {
    Serial.println("[PATCH] Connection failed");
    return false;
  }

  StaticJsonDocument<192> doc;
  doc["latitude"]  = SENSOR_LAT;
  doc["longitude"] = SENSOR_LNG;
  doc["pm25"]      = pm25;
  doc["timestamp"] = timestamp;

  String body;
  serializeJson(doc, body);

  String req = String("PATCH ") + RTDB_PATH + " HTTP/1.1\r\n" +
               "Host: " + RTDB_HOST + "\r\n" +
               "Content-Type: application/json\r\n" +
               "Content-Length: " + body.length() + "\r\n" +
               "Connection: close\r\n\r\n" +
               body;

  client.print(req);

  unsigned long timeout = millis() + 5000;
  while (!client.available() && millis() < timeout) delay(10);

  String statusLine = client.readStringUntil('\n');
  client.stop();

  bool ok = statusLine.indexOf("200") > 0;
  Serial.printf("[PATCH] PM2.5=%u -> %s\n", pm25, ok ? "200 OK" : statusLine.c_str());

  // Also POST to history path for time-series (best-effort, return
  // success based on the live PATCH since dashboard needs current state)
  if (WiFiClientSecure histClient; histClient.setInsecure(),
      histClient.connect(RTDB_HOST, HTTPS_PORT)) {

    String histBody = String("{\"pm25\":") + pm25 + ",\"timestamp\":\"" + timestamp + "\"}";

    String histReq = String("POST ") + HIST_PATH + " HTTP/1.1\r\n" +
                     "Host: " + RTDB_HOST + "\r\n" +
                     "Content-Type: application/json\r\n" +
                     "Content-Length: " + histBody.length() + "\r\n" +
                     "Connection: close\r\n\r\n" +
                     histBody;

    histClient.print(histReq);

    unsigned long hTimeout = millis() + 3000;
    while (!histClient.available() && millis() < hTimeout) delay(5);
    bool histOk = histClient.readStringUntil('\n').indexOf("200") > 0;
    histClient.stop();

    if (!histOk) Serial.println("[HIST] POST failed (history may be incomplete)");
  }

  return ok;
}

// ─────────────────────────────────────────────────────────────
//  Save a reading to SPIFFS backlog when offline
// ─────────────────────────────────────────────────────────────
void saveLocally(uint16_t pm25, const char* timestamp) {
  File f = SPIFFS.open(BACKLOG_FILE, FILE_READ);
  DynamicJsonDocument doc(16384);   // 16 KB buffer

  if (f) {
    DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
      Serial.printf("[SPIFFS] Parse error, creating new file. %s\n", err.c_str());
      doc.clear();
      doc.to<JsonArray>();
    }
  } else {
    doc.to<JsonArray>();
  }

  JsonArray arr = doc.as<JsonArray>();
  JsonObject entry = arr.createNestedObject();
  entry["pm25"]      = pm25;
  entry["timestamp"] = timestamp;

  f = SPIFFS.open(BACKLOG_FILE, FILE_WRITE);
  if (!f) {
    Serial.println("[SPIFFS] Write open failed");
    return;
  }
  serializeJson(doc, f);
  f.close();

  Serial.printf("[SPIFFS] Saved PM2.5=%u (backlog size=%d)\n", pm25, arr.size());
}

// ─────────────────────────────────────────────────────────────
//  Push all queued backlog entries to Firebase, then clear
// ─────────────────────────────────────────────────────────────
void syncBacklog() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (!SPIFFS.exists(BACKLOG_FILE)) return;

  File f = SPIFFS.open(BACKLOG_FILE, FILE_READ);
  if (!f) return;

  DynamicJsonDocument doc(16384);
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.printf("[SYNC] JSON parse error: %s\n", err.c_str());
    SPIFFS.remove(BACKLOG_FILE);
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) {
    SPIFFS.remove(BACKLOG_FILE);
    return;
  }

  // Clean entries older than MAX_BACKLOG_AGE
  time_t nowEpoch;
  time(&nowEpoch);

  unsigned long cutoff = nowEpoch > (long)(MAX_BACKLOG_AGE_MS / 1000)
                           ? (unsigned long)nowEpoch - (MAX_BACKLOG_AGE_MS / 1000)
                           : 0;

  int removed = 0;
  for (int i = arr.size() - 1; i >= 0; i--) {
    unsigned long tsEpoch = isoToEpoch(arr[i]["timestamp"]);
    if (cutoff > 0 && tsEpoch < cutoff) {
      arr.remove(i);
      removed++;
    }
  }
  if (removed > 0)
    Serial.printf("[SYNC] Removed %d expired entries\n", removed);

  if (arr.size() == 0) {
    SPIFFS.remove(BACKLOG_FILE);
    return;
  }

  Serial.printf("[SYNC] Backlog has %d entries. Sending latest.\n", arr.size());

  // With a fixed sensor key, only the latest reading matters.
  // Send the most recent entry, discard the rest from the backlog.
  JsonObject latestEntry = arr[arr.size() - 1];
  uint16_t pm25 = latestEntry["pm25"];
  const char* ts = latestEntry["timestamp"];

  if (sendToFirebase(pm25, ts)) {
    Serial.println("[SYNC] Latest entry sent. Clearing backlog.");
    SPIFFS.remove(BACKLOG_FILE);
  } else {
    // Keep only the latest entry for next retry (drop older ones)
    DynamicJsonDocument newDoc(16384);
    JsonArray newArr = newDoc.to<JsonArray>();
    newArr.add(latestEntry);
    f = SPIFFS.open(BACKLOG_FILE, FILE_WRITE);
    if (f) {
      serializeJson(newDoc, f);
      f.close();
      Serial.println("[SYNC] Send failed. Keeping latest entry for retry.");
    }
  }
}

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // I2C — SDA=21, SCL=22
  Wire.begin(26, 25);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("SSD1306 not found!");
    while (true) delay(1000);
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("Connecting WiFi...");
  display.display();

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected.");
    configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER);
    Serial.println("NTP syncing...");
  } else {
    Serial.println("\nWiFi failed — time will show 'Syncing...'");
  }

  // UART2 for PMS5003
  pmsSerial.begin(PMS_BAUD, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);

  // SPIFFS for offline backlog
  if (!SPIFFS.begin(true)) {
    Serial.println("SPIFFS mount failed — offline storage disabled");
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Ready.");
  display.display();
  delay(1000);
}

// ─────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Read sensor every 1 s ──
  if (now - lastRead >= READ_INTERVAL) {
    lastRead = now;
    PmsData raw;
    if (readPms(raw)) {
      // Warmup: discard first 30 s of readings (laser + fan stabilize)
      if (now < WARMUP_MS) {
        Serial.printf("[WARMUP] %lu s remaining — raw=%u discarded\n",
                      (WARMUP_MS - now) / 1000, raw.pm2_5_atm);
      } else {
        smoothedPm25 = addToAverage(raw.pm2_5_atm);
        latest = raw;
        Serial.printf("[%lu s] raw=%u  avg=%u ug/m3\n",
                      now / 1000, raw.pm2_5_atm, smoothedPm25);
      }
    }

    // Check sensor timeout — if no valid frame in SENSOR_TIMEOUT_MS, mark stale
    if (now - lastValidFrame > SENSOR_TIMEOUT_MS) {
      latest.valid = false;
    }
  }

  if (now - lastDisplay >= DISPLAY_INTERVAL) {
    lastDisplay = now;
    updateDisplay();
  }

  // Send to Firebase every SEND_INTERVAL — use smoothed value
  if (now - lastSend >= SEND_INTERVAL && latest.valid) {
    lastSend = now;
    String ts = getISOTimestamp();
    if (ts.length() == 0) {
      Serial.println("[PATCH] No NTP time yet, skipping");
    } else if (!sendToFirebase(smoothedPm25, ts.c_str())) {
      saveLocally(smoothedPm25, ts.c_str());
      Serial.println("[PATCH] Offline — saved to backlog");
    }
  }

  // Periodic backlog sync
  if (now - lastSyncCheck >= SYNC_CHECK_INTERVAL) {
    lastSyncCheck = now;
    syncBacklog();
  }

  // Detect WiFi reconnection → immediate sync
  bool wifiConnected = (WiFi.status() == WL_CONNECTED);
  if (wifiConnected && wifiWasDisconnected) {
    Serial.println("[WIFI] Reconnected — syncing backlog now");
    syncBacklog();
  }
  wifiWasDisconnected = !wifiConnected;
}