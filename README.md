# Campus Lost-and-Found Matching System (Project 18)

PFEBSIT 002, University of La Salette. Flutter Web UI + Node.js/Express API. Controlled test data only.

| Folder | Content |
|---|---|
| `backend/` | Express API: source, tests (97), OpenAPI description, `.env.example` |
| `frontend/` | Flutter Web app: source and tests (37) |
| `docs/database/` | Data model description and test-only seed accounts |
| `docs/` | Weekly reports (Weeks 13-18), ADRs, diagrams, runbook, UAT and performance evidence, known limitations, defense pack, changelog, contributing guide |

## Run
```
cd backend
npm install
sh scripts/gen-dev-cert.sh      # local self-signed HTTPS cert (git-ignored)
cp .env.example .env            # then set JWT_SECRET to 48+ random characters
npm start                       # https://localhost:3000
npm test

cd ../frontend
flutter pub get
flutter run -d chrome --dart-define=API_BASE=https://localhost:3000
flutter test
```
Test accounts: see `docs/database/seed/demo-users.json`.

## Status
Weeks 13-18 complete. Verdict: conditional go for a supervised single-instance pilot, not unrestricted production
(`docs/Project18_Week17_AS3_Advanced_Technical_Report.docx`, `docs/w17/KNOWN_LIMITATIONS.md`).

`docs/tools/` holds the delivery scripts (trace check, UAT, performance, demo, bundle) as reference copies.
They were written for the original single-folder layout and need their paths adjusted to run from here.
