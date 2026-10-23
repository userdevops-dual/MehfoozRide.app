# 🛡️ Mehfooz Ride — Setup & FYP Presentation Guide

Women-only ride-hailing app for Lahore, Pakistan.
**Mobile app:** React Native + Expo (Android) · **Backend:** Node.js / Express / Socket.IO · **Database:** MongoDB

---

## 1. Requirements (one-time)

| Tool | Version | Install |
|------|---------|---------|
| Node.js | LTS (v20+) | `winget install OpenJS.NodeJS.LTS` or https://nodejs.org |
| Java JDK | **17** (not 21/25) | `winget install EclipseAdoptium.Temurin.17.JDK` |
| Android Studio | latest | https://developer.android.com/studio |
| MongoDB | Atlas free cluster or local | https://cloud.mongodb.com |

**Android Studio → More Actions → SDK Manager → SDK Tools**, tick and apply:
Android SDK Build-Tools · Android SDK Command-line Tools · Android Emulator · Android SDK Platform-Tools.
Then **Virtual Device Manager → Create Device → Pixel 8** and start it.

**Environment variables** (Windows, then open a *new* terminal):

```bat
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.<version>-hotspot"
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
```

> Java 25 (bundled with recent Android Studio) breaks the React Native native build with
> `WARNING: A restricted method in java.lang.System has been called`. Use JDK 17.

No Google Maps key is needed — maps use **OpenStreetMap** (Leaflet in a WebView).

---

## 2. Backend

```bash
cd backend
npm install
copy .env.example .env      # then edit .env — set MONGO_URI and a long random JWT_SECRET
npm run seed                # creates the 11 demo accounts (deletes old demo accounts first)
npm start                   # http://localhost:5000
```

Generate a JWT secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

The server refuses to start if `MONGO_URI` or `JWT_SECRET` is missing. **Never commit `backend/.env`** (it is git-ignored).

| Variable | Default | Meaning |
|----------|---------|---------|
| `DEMO_MODE` | `true` | Simulated services (SMS, dispatch, payments) are allowed and labelled as demo. `false` = refuse instead of simulating |
| `SMS_PROVIDER` | `demo` | `demo` = no SMS sent, app shows the demo code · `twilio` = real SMS (`npm install twilio` + `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE`) |
| `DEMO_OTP` | `123456` | Code accepted when `SMS_PROVIDER=demo` |
| `STORAGE_DRIVER` | `local` | CNIC photos saved privately in `backend/uploads/private` (git-ignored, not publicly served) |

| `GEOCODER_URL` | Nominatim public server | Place search / addresses (OpenStreetMap) |
| `ROUTING_URL` | OSRM public demo server | Road routes, distance and time |
| `GEO_CONTACT_EMAIL` | — | Your e-mail, sent to Nominatim as its usage policy asks |

Maps need **no API key**. The public OpenStreetMap servers allow light use only (search is limited to 1 request per second and cached by the backend); use your own servers for production.

Run the API tests (backend must be running): `node tests/phase1.api.test.js` (registration) and `node tests/phase2.api.test.js` (maps, routes, booking — needs internet).

---

## 3. Mobile app (Android)

Keep the backend running and the emulator open. In the project root:

```bash
npm install
npx expo run:android        # first build ~15–25 min, later builds are faster
```

After the first build, for JavaScript-only changes: `npx expo start`, then press `a` (or `r` to reload).

**Backend address:** `frontend/src/services/api.js` → `BACKEND_URL`
- Emulator: `http://10.0.2.2:5000` (default)
- Real phone on the same Wi-Fi: `http://<your-PC-IPv4>:5000` (find it with `ipconfig`) and allow port 5000 in Windows Firewall.

---

## 4. Registering a new account

Welcome screen → **Create Account**:

1. **Account** — name, email, mobile (`03001234567`) → **Send OTP** → enter the code → **Verify**
   (demo mode shows the code on screen; wrong code is refused, 5 attempts, 30 s resend wait).
2. **CNIC** — type the 13 digits (dashes are added). Last digit **even** → accepted; **odd** →
   *"This CNIC is not eligible for registration in Mehfooz Ride because this application is currently restricted to female users."*
   Then add the **front** and **back** photos (camera or gallery; preview, replace, remove).
3. **Selfie**.
4. **Password** (8+ characters, a letter and a number) + confirm, and choose Passenger or Driver.
5. **Driver details** (drivers only) — license, vehicle, plate. Drivers wait for admin approval.

Test CNICs: `35202-1234567-2` (eligible) · `35202-1234567-1` (rejected, odd) · `05202-1234567-2` (invalid region).

## 5. Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@mehfooz.com | admin123 |
| Passengers | ayesha@ · zainab@ · sana@ · hira@ · nadia@ `demo.com` | password123 |
| Drivers | fatima@ · mariam@ · sara@ · amna@ · rabia@ `demo.com` | password123 |

The login screen has quick-fill buttons for one passenger, one driver and the admin.

---

## 6. Demo flow (needs two devices — e.g. two emulators, or emulator + phone)

| Step | Device | Screen |
|------|--------|--------|
| 1 | Driver (`fatima@demo.com`) | Driver Home → tap **Online** |
| 2 | Passenger (`ayesha@demo.com`) | Home → *Search your destination* → **Book Ride** |
| 3 | Passenger | **Finding Your Safe Driver** (searches up to 2 min, can cancel) |
| 4 | Driver | **New Ride Request** opens automatically → **Accept** |
| 5 | Passenger | **Driver Found** — driver, plate, 4-digit **OTP** |
| 6 | Driver | **I've Arrived** → same-gender check → enter passenger's OTP |
| 7 | Passenger | Active ride — live map, live fare, SOS, Fake Call, Safe Drop |
| 8 | Driver | **Complete Ride** |
| 9 | Passenger | Rate driver (5 categories) / report a complaint |

Wrong OTP 3 times → ride auto-cancels and is flagged as a possible fake ride.
Admin panel: driver approvals, background checks, SOS incidents, fake rides, live rides, stats.

### Matching, fares and pooling (Phase 3)

- **Matching** — the server offers a request to the 5 nearest online, free drivers within 5 km whose GPS was updated in the last 3 minutes (`backend/config/appConfig.js` → `matching`). Unanswered requests expire after 2 minutes; drivers can decline.
- **Fares** — one place: `backend/config/fare.js` (base 80 + 25/km + 5/min, minimum 50, AC +50, bike −50). The final fare uses the GPS-tracked distance when it is plausible (60–200 % of the planned route), otherwise the planned route.
- **Pooling** — passengers who tick *Share ride* are grouped when pickups are within 1.5 km, drop-offs within 2.5 km and directions within 35°, up to 3 passengers. Each pays a share of (longest trip × 1.15 per extra passenger), in proportion to her solo fare; if nobody joins she pays the normal fare. The driver accepts the whole pool and handles each passenger (arrive → gender check → OTP → complete) separately.
- **Mood** — Talkative / Quiet / Introvert, shown to the driver on the request.

### Verification, tracking and route monitoring (Phase 4)

- **Verified Female Driver** — computed by `backend/services/verification.js` from real checks: female-eligible CNIC, documents uploaded, vehicle on file, background check passed, admin approval. Seeded demo drivers are marked `verificationSource: "demo_seed"` and the app labels them **🧪 Demo account**. Demo drivers start with no rating.
- **Ride OTP** — per-ride 4-digit code; wrong code → ride stays at pickup (3 failures cancel and flag it). Ride details include a `lifecycle` (REQUESTED → DRIVER_ASSIGNED → DRIVER_AT_PICKUP → OTP_VERIFIED → RIDE_IN_PROGRESS → RIDE_COMPLETED).
- **Live tracking** — before pickup the passenger sees the driver's distance/ETA; on the trip, remaining km, ETA and % progress along her chosen route, plus the driven path on the map.
- **Unusual-route detection** — the driver's GPS is compared with the passenger's chosen road route (`appConfig.routeMonitor`): more than 250 m away (900 m if only a straight line is known) for 3 readings in a row → "Unusual route detected"; fixes with accuracy worse than 80 m are ignored. Each deviation episode (start, end, worst distance) is saved on the ride, and the passenger is told when the driver is back on route. This is monitoring — no map provider can lock a driver to a road.

### Safety: safe points, fake call, SOS (Phase 5)

- **Safe points** — real police stations, hospitals and busy public places near you from OpenStreetMap (Overpass, with a Nominatim fallback when Overpass is busy), plus search and tap-on-map. During a ride the passenger marks points (saved on the ride) and can tap **Go here**: the driver gets the point and a road route, and acknowledges.
- **Fake call** — real ringtone (`frontend/assets/sounds`, generated by `make-ringtones.js`) and vibration, incoming-call screen, and the caller's lines spoken with the phone's on-device text-to-speech (works offline) with synced subtitles. Callers and scripts: `frontend/src/config/fakeCall.js`. Nobody is actually called.
- **SOS** — starts an emergency session on the server (`/api/emergency`) capturing GPS, ride, passenger, driver, vehicle, route, destination and safe points; keeps sending live GPS; shows "live" vs "last known" location; creates a live-location link contacts can open in any browser (`/api/emergency/live/<token>`, expires after 12 h); opens the dialer for 15. Pressing SOS again reuses the active session. Drivers have the same SOS button, and the other person on the ride is told.
- **Honest demo mode** — `DEMO_MODE=true` (default): contact SMS are logged on the server and shown as "Demo — not actually sent"; police dispatch is "simulated / not integrated". For real SMS set `NOTIFY_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; a police system can be connected later with `POLICE_API_URL`. Set `PUBLIC_BASE_URL` so live links work from contacts' phones.
- **Emergency contacts** — up to 5, with relation; phone numbers validated on the server.

After pulling Phase 5, rebuild the app once (`npx expo run:android`) — it adds `expo-speech` and `expo-audio`.

---

## 7. What is simulated (say so in the presentation)

- **CNIC gender check** — real validation (13 digits, region digit 1–7, even last digit = female), enforced by the server; the CNIC is not checked against NADRA records.
- **Selfie / face match** — selfie is captured but not compared automatically.
- **Phone OTP** — real server-side verification (expiry, attempt limit, single-use token), but with `SMS_PROVIDER=demo` no SMS is sent: the app shows the demo code and labels it as demo.
- **Guardian SMS** — messages are printed in the backend console, not actually sent.
- **Route times** — from OSRM (free-flow road speeds); real Lahore traffic is usually slower, so the final fare uses the actual trip time.

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm` / `node` not recognized | Open a new terminal after installing Node.js |
| `JAVA_HOME is not set` | Set `JAVA_HOME` to JDK 17 (section 1), open a new terminal |
| `configureCMakeDebug FAILED` / restricted method warning | You are on Java 25 — switch to JDK 17 |
| Gradle path error after moving the folder | Delete `android/app/.cxx` and `android/app/build`, or run `npx expo prebuild --clean` |
| `Missing script: "seed"` | Run it inside the `backend` folder |
| Map says *Map unavailable* | The emulator/phone has no internet |
| Login fails / "Server error" | Backend not running, or wrong `BACKEND_URL` |
