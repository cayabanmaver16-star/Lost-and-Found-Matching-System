# Database

The system uses a JSON-file store (`backend/src/store.js`), chosen and justified in
`docs/w17/adr/`. There is no separate database server.

- Runtime file: `backend/data/db.json` (created on first start; git-ignored; `.bak` is the previous good copy).
- Writes: group commit, atomic temp-file + rename, and the API replies 2xx only after the data is on disk.
- `seed/demo-users.json`: test-only accounts (stu1, stu2, emp1, sec1, cust1). The backend loads its own copy at
  `backend/seed/demo-users.json`; keep the two identical if you change one.

See `DATA_MODEL.md` for the structure.
