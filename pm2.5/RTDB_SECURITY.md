# Firebase Realtime Database Security Rules

The dashboard uses **Firebase Realtime Database** (not Firestore) for live sensor data. 
The Python simulators and the Raspberry Pi write to `/pm25_data` via REST API.

## Current Rules (Insecure — Development Only)

```
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

This allows **anyone** with the database URL to read or write data. 
The database URL is hardcoded in the frontend source code.

## Production Rules

Apply these rules in the Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "pm25_data": {
      ".read": true,
      ".write": "auth.uid != null",
      ".indexOn": ["timestamp"]
    }
  }
}
```

### If you have a fixed Raspberry Pi IP or service account

For a more secure setup with a backend service:

```json
{
  "rules": {
    "pm25_data": {
      ".read": true,
      ".write": "auth.token.isSensor == true",
      ".indexOn": ["timestamp"]
    }
  }
}
```

## How to Apply

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project
2. Click **Realtime Database** in the left sidebar
3. Click the **Rules** tab
4. Paste the production rules above
5. Click **Publish**

## Write Access Options

| Method | Security Level | Effort |
|--------|---------------|--------|
| Public write (current) | ❌ None | None |
| Firebase Auth UID check | ✅ Medium | Add Auth to Pi/simulator |
| Custom token + backend | ✅✅ High | Requires backend server |
| App Check + Secret | ✅ High | Firebase App Check setup |

**Recommended minimum:** Enable Firebase App Check in the Firebase Console
to restrict database access to your web app domain.
