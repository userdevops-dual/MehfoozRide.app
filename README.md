# 🛡️ Mehfooz Ride

Women-only safe ride-hailing app for Lahore, Pakistan — Final Year Project.

- **Mobile app:** React Native + Expo (Android) — `App.js`, `frontend/src`
- **Backend:** Node.js, Express, Socket.IO, MongoDB — `backend/`

**Safety features:** CNIC-based female verification, verified female drivers with admin approval, OTP ride start with fake-ride detection, same-gender pickup check, live GPS tracking, route-deviation alerts, guardian notifications, one-tap SOS (Police 15 / 1122 / 1043), fake call, safe drop points and 5-category driver ratings.

## Quick start

```bash
# Backend
cd backend
npm install
copy .env.example .env     # set MONGO_URI and JWT_SECRET
npm run seed
npm start

# App (new terminal, project root, Android emulator running)
npm install
npx expo run:android
```

Requires **Node.js LTS**, **JDK 17** and **Android Studio**. No Google Maps key needed (OpenStreetMap).

👉 Full instructions, demo accounts, presentation flow and troubleshooting: **[SETUP_GUIDE.md](SETUP_GUIDE.md)**
