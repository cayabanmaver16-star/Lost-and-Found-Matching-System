# Start here (Windows)

Run the Lost-and-Found Matching System on one Windows PC, in about 10 minutes.

## You need
- Node.js 20 or newer (https://nodejs.org) - check with `node -v`
- Flutter SDK with web enabled - check with `flutter doctor`
- Google Chrome

## 1. Start the API (first terminal)
```
cd backend
npm install
copy .env.example .env
```
Open `backend\.env` in Notepad and set `JWT_SECRET=` to any random text of 48 or more characters, then:
```
npm start
```
Leave it running. It listens on http://localhost:3000 (plain HTTP in development mode).
Check: open http://localhost:3000/ready in a browser - it should answer `{"status":"ready"}`.

## 2. Start the app (second terminal)
```
cd frontend
flutter pub get
flutter run -d chrome --web-port 8080 --dart-define=API_BASE=http://localhost:3000
```
Chrome opens the app at http://localhost:8080.

## 3. Sign in
Test-only accounts are in `docs/database/seed/demo-users.json`:
`stu1`, `stu2` (students), `emp1` (employee), `sec1` (security), `cust1` (custodian). Passwords are in that file.
Suggested walk-through: sign in as `stu1`, report a lost item; as `stu2`, report a matching found item; as `sec1`, verify the match with a proof note; release it; look at the audit trail.

## 4. Run the tests (optional)
```
cd backend
npm test
cd ..\frontend
flutter test
```
Expected: backend 96 pass + 1 skipped (the HTTPS test is skipped unless you create a certificate), frontend 37 pass.

## Problems
| Symptom | Fix |
|---|---|
| `JWT_SECRET` error at start | Set it in `backend\.env` (48+ characters). |
| App shows a network error | The API terminal must be running; `API_BASE` must match its address. |
| Login says too many attempts | 5 wrong passwords lock the account for 15 minutes; restart the API to clear it in development. |
| Port 3000 or 8080 busy | Close the other program, or change `PORT` in `.env` and `--web-port` / `API_BASE`. |

To use it from a phone, see `RUN_WINDOWS_AND_PHONE.md`.
