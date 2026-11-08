# Run on Windows and open it on a phone

The PC runs the API and the app. A phone on the **same Wi-Fi** opens the app in its browser.
This is for demonstration with test data only. The connection is plain HTTP, so do not use it with real passwords or on public Wi-Fi.

## 1. Find the PC's address
```
ipconfig
```
Use the "IPv4 Address" of your Wi-Fi adapter, for example `192.168.1.25`. Below, replace `PC_IP` with it.

## 2. Allow the API to be called from that address
In `backend\.env` add one line (keep your `JWT_SECRET`):
```
CORS_ORIGINS=http://localhost:8080,http://PC_IP:8080
```
Start the API (it listens on all network interfaces):
```
cd backend
npm start
```

## 3. Start the app so other devices can reach it
```
cd frontend
flutter run -d web-server --web-hostname 0.0.0.0 --web-port 8080 --dart-define=API_BASE=http://PC_IP:3000
```

## 4. Allow Windows Firewall
The first time, Windows asks whether Node and Dart may use the network: choose **Private networks**.
If it did not ask, allow inbound TCP ports 3000 and 8080 for private networks in Windows Defender Firewall.

## 5. Open it on the phone
Connect the phone to the same Wi-Fi, then open `http://PC_IP:8080` in Chrome or Safari and sign in with a test account
(`docs/database/seed/demo-users.json`).

## If the phone cannot connect
| Check | Fix |
|---|---|
| Phone can't open the page at all | Same Wi-Fi? Guest or "client isolation" Wi-Fi blocks devices from each other; use a phone hotspot with the PC joined to it. |
| Page opens but login fails or shows a network error | `API_BASE` must use `PC_IP`, not `localhost`; `CORS_ORIGINS` must contain exactly `http://PC_IP:8080`; restart both after changes. |
| Worked yesterday, not today | The PC's IP changed. Run `ipconfig` again and repeat steps 2-3. |
| Firewall blocks | Step 4. |

Do not use `NODE_ENV=production` for this: production mode requires HTTPS and refuses these settings on purpose.
