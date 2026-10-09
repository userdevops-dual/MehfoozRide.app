# 🛡️ Mehfooz Ride — Complete Setup & FYP Presentation Guide

## What This Project Does
Women-only ride hailing app built with React Native (mobile) + Node.js/Express (backend) + MongoDB.

---

## ✅ All Features Implemented

| Feature | Status | File |
|---------|--------|------|
| CNIC Verification Simulation | ✅ Complete | authController.js |
| Phone OTP Verification | ✅ Complete | authController.js |
| Same-Gender Pickup Verification | ✅ Complete | DriverAcceptRideScreen.js |
| OTP Ride Start + Fake Ride Detection | ✅ Complete | rideController.js |
| Live Fare Calculation | ✅ Complete | ActiveRideScreen.js |
| Route Deviation → Guardian Alert | ✅ Complete | socket.js |
| Guardian Auto-Sharing (ride start/end) | ✅ Complete | socket.js + rideController.js |
| Ride Pooling + Fare Split | ✅ Complete | rideController.js |
| Driver Background Check | ✅ Complete | adminRoutes.js |
| Admin Dashboard | ✅ Complete | AdminDriverApprovalScreen.js |
| SOS System | ✅ Complete | SOSScreen.js |
| Fake Call Feature | ✅ Complete | FakeCallScreen.js |
| Safe Points Map | ✅ Complete | SafePointsScreen.js |
| 5-Category Driver Rating | ✅ Complete | RideCompleteScreen.js |
| Guardian Mode Setup | ✅ Complete | GuardianSetupScreen.js |

---

## 🚀 Quick Start (Step by Step)

### Step 1: Install MongoDB
Download from https://www.mongodb.com/try/download/community
Start it: `mongod`

### Step 2: Start Backend
```bash
cd mehfooz-backend
npm install
npm run seed        ← Creates all 11 demo accounts
npm run dev         ← Starts backend on port 5000
```

### Step 3: Start Mobile App
```bash
# In root folder
npm install
npx react-native start      ← Metro bundler
npx react-native run-android ← OR run-ios
```

---

## 👥 Demo Accounts (11 total for FYP presentation)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@mehfooz.com | admin123 |
| Passenger 1 | ayesha@demo.com | password123 |
| Passenger 2 | zainab@demo.com | password123 |
| Passenger 3 | sana@demo.com | password123 |
| Passenger 4 | hira@demo.com | password123 |
| Passenger 5 | nadia@demo.com | password123 |
| Driver 1 | fatima@demo.com | password123 |
| Driver 2 | mariam@demo.com | password123 |
| Driver 3 | sara@demo.com | password123 |
| Driver 4 | amna@demo.com | password123 |
| Driver 5 | rabia@demo.com | password123 |

---

## 🎓 FYP Presentation Flow (2 devices / 2 browser tabs)

### Device/Tab 1 — Passenger Side
1. Login as `ayesha@demo.com`
2. Set guardian contacts (GuardianSetup screen)
3. Book a ride → enter pickup + dropoff
4. See "Finding Driver" screen
5. Get matched with driver — OTP shown
6. Show live fare updating during ride
7. Route deviation alert appears if driver deviates
8. SOS button always visible
9. After ride: rate driver on 5 categories

### Device/Tab 2 — Driver Side
1. Login as `fatima@demo.com`
2. Go Online (toggle switch)
3. See incoming ride request notification
4. Accept ride → same-gender verification popup appears
5. Confirm female passenger / cancel on mismatch
6. Arrive at pickup → Enter passenger OTP
7. OTP wrong 3x → ride auto-cancels (fake ride detection)
8. OTP correct → ride starts
9. Complete ride

### Tab 3 — Admin (optional)
1. Login as `admin@mehfooz.com`
2. See all pending driver approvals
3. Run background check → approve/reject
4. Monitor live rides
5. View SOS incidents
6. View fake ride detections

---

## 📱 Running Two Sessions (FYP Demo Trick)

**Android emulator + physical phone:**
- Run app on emulator → login as driver
- Run app on phone → login as passenger
- Both connect to same backend → socket events work in real time

**Two browser tabs (if using Expo web):**
- Tab 1: passenger@demo.com
- Tab 2: driver@demo.com

**Backend URL for real device:**
Change `10.0.2.2` to your PC's local IP in `frontend/src/services/api.js`:
```js
export const BACKEND_URL = 'http://192.168.1.X:5000';
```
Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

---

## 🔧 If Backend Not Running (Demo Mode)
All screens have demo/fallback data built in.
You can demo the full UI without a backend running.
