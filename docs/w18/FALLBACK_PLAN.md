# Prepared fallback plan

Principle: the defence must still make its point if something breaks. Each level needs less to work than the one above, and each is rehearsed. Decide quickly: if a problem is not fixed within 30 seconds, drop one level and keep talking.

| Level | What you show | Needs | Switch when | Rehearsed by |
|---|---|---|---|---|
| L0 | Live web app, three tabs, seeded data | Preflight GO, `start-demo.js --seed` | normal | the demo script |
| L1 | Same, after a restart | the terminal | a tab misbehaves (reload and sign in again); an action returns an error | `start-demo.js --keep` keeps the data; plain `start-demo.js` starts clean |
| L2 | Narrated run of the same story in the terminal | Node only (no browser, no build) | the browser or the web build is unusable | `node demo/rehearse.js --pace 2500` (39 checks, about 7 s of work); segments with `--from N --to N` |
| L3 | Evidence pack: screenshots, diagrams, results, transcript | files only | the laptop cannot run Node, or the terminal fails | see the list below |
| L4 | The reports | any viewer | everything else fails | Word reports for Weeks 13-18 |

## What each failure looks like and what to do
| Symptom | Likely cause | Action |
|---|---|---|
| Page stays on the loading screen | The browser cached nothing and the first download is slow, or the static server is not running | Wait up to 10 s (the loading screen says so); check the start-demo terminal; restart it |
| "Cannot reach the server" on sign-in | API not running or wrong port | Restart `start-demo.js`; check http://localhost:3000/ready |
| Old screens appear (for example no item details) | Stale browser cache from an older build | Hard-reload (Ctrl+Shift+R); the server revalidates files, so a normal reload should also fetch the new build |
| "Port 3000 is already in use" | An earlier demo or dev server | Close it (`netstat -ano | findstr :3000`, then end that process) and start again |
| Sign-in says too many attempts | The lockout demonstration locked the account | The lock lasts 15 minutes or until restart: restart start-demo (data kept with `--keep`), or sign in as another test account |
| A click does nothing | Flutter ignores the first click after a layout change | Click again |
| Text field will not take typing | Focus lost | Click the field twice, then type |
| The demo database is odd | Leftover data | `node demo/start-demo.js --seed` for a clean start |
| No Flutter build at all | Build folder missing | L2 immediately. Rebuild takes about 2 minutes: `cd app && flutter build web --dart-define=API_BASE=http://localhost:3000 --dart-define=DEMO_TOOLS=true --output "<full path>/app/build/demo"` |

## L3 evidence pack (open these)
- `docs/w17/diagrams/architecture.png`, `data-flow.png`, `state-machines.png`
- `docs/w17/screens/`: UAT-05c (match with both items), UAT-05d (proof dialog), UAT-13a/13b (blank page vs loading screen), UAT-03a/03b (demo panel before/after)
- `docs/w18/fallback-transcript.txt`: output of the narrated run (39 of 39 checks)
- `docs/w17/uat-results-after-fixes.md`: 14 of 14 scenarios, step by step
- `docs/w16/` results and rehearsals; `docs/w15/traceability-matrix.md`
- `docs/w18/EVIDENCE_MAP.md` to navigate everything

## What to say when you switch
"The live screen has a problem, so I will show the same story through the narrated run against the real server. It performs the same requests the web app makes, and every line is a check that passed before today." Keep it matter of fact; do not apologise at length. The point of the defence is the decisions and the evidence, not the pixels.

## Hardware and environment checklist
- Laptop charged and on power; sleep disabled; notifications off.
- A copy of the project folder on a USB stick (or the submission bundle) in case the laptop fails; Node 20 on the replacement machine. Run `npm install` in `api/` there before the day (the bundle excludes `node_modules`).
- Browser zoom 100%, window wide, a second window ready with the architecture PNG and the evidence map.
- No dependence on the internet: everything runs on localhost (fonts and renderer are served locally).
