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

## 4. Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@mehfooz.com | admin123 |
| Passengers | ayesha@ · zainab@ · sana@ · hira@ · nadia@ `demo.com` | password123 |
| Drivers | fatima@ · mariam@ · sara@ · amna@ · rabia@ `demo.com` | password123 |

The login screen has quick-fill buttons for one passenger, one driver and the admin.

---

## 5. Demo flow (needs two devices — e.g. two emulators, or emulator + phone)

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

---

## 6. What is simulated (say so in the presentation)

- **CNIC gender check** — last digit even = female (NADRA rule); not checked against NADRA.
- **Selfie / face match** — selfie is captured but not compared.
- **Phone OTP** — any 6 digits are accepted (`123456` in demo); no SMS is sent.
- **Guardian SMS** — messages are printed in the backend console, not actually sent.
- **Pickup / dropoff coordinates** — fixed DHA → Gulberg demo route on the booking screen.

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm` / `node` not recognized | Open a new terminal after installing Node.js |
| `JAVA_HOME is not set` | Set `JAVA_HOME` to JDK 17 (section 1), open a new terminal |
| `configureCMakeDebug FAILED` / restricted method warning | You are on Java 25 — switch to JDK 17 |
| Gradle path error after moving the folder | Delete `android/app/.cxx` and `android/app/build`, or run `npx expo prebuild --clean` |
| `Missing script: "seed"` | Run it inside the `backend` folder |
| Map says *Map unavailable* | The emulator/phone has no internet |
| Login fails / "Server error" | Backend not running, or wrong `BACKEND_URL` |
