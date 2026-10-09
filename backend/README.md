# 🛡️ Mehfooz Ride — Backend Setup Guide

A complete Node.js + Express + MongoDB + Socket.IO backend
for the Mehfooz Ride women-safety ride-hailing app.

---

## 📁 Folder Structure

```
mehfooz-backend/
│
├── server.js              ← START HERE — main entry point
├── package.json           ← dependencies list
├── .env.example           ← copy to .env and fill values
│
├── config/
│   └── db.js              ← MongoDB connection
│
├── models/
│   ├── User.js            ← passengers & drivers schema
│   ├── Ride.js            ← ride booking schema
│   └── Rating.js          ← ratings & complaints schema
│
├── controllers/
│   ├── authController.js  ← signup, login, profile logic
│   └── rideController.js  ← book, accept, OTP, complete, rate
│
├── routes/
│   ├── authRoutes.js      ← /api/auth/*
│   └── rideRoutes.js      ← /api/rides/*
│
├── middleware/
│   └── auth.js            ← JWT token checker
│
└── socket/
    └── socket.js          ← real-time: location, SOS, matching
```

---

## 🚀 HOW TO RUN (Step by Step)

### Step 1 — Install Node.js
Download from: https://nodejs.org (choose LTS version)
After install, open terminal and check:
```
node --version
npm --version
```

### Step 2 — Open Terminal in backend folder
```
cd mehfooz-backend
```

### Step 3 — Install all packages
```
npm install
```
This installs: express, mongoose, socket.io, jwt, bcrypt, etc.

### Step 4 — Create MongoDB Database (FREE)
1. Go to https://cloud.mongodb.com
2. Create a free account
3. Create a new cluster (free tier)
4. Click "Connect" → "Connect your application"
5. Copy the connection string — looks like:
   mongodb+srv://username:password@cluster0.mongodb.net/mehfooz_db

### Step 5 — Create your .env file
Copy .env.example to .env:
```
cp .env.example .env
```
Then open .env and paste your MongoDB connection string.

### Step 6 — Start the server
```
npm run dev
```
You should see:
```
✅ MongoDB Connected: cluster0.mongodb.net
════════════════════════════════════
  🛡️  Mehfooz Ride Server Started
  🌐  Running on: http://localhost:5000
════════════════════════════════════
```

---

## 📡 API Endpoints Reference

### AUTH
| Method | URL | Description | Auth Required |
|--------|-----|-------------|---------------|
| POST | /api/auth/signup | Register new user | No |
| POST | /api/auth/login | Login | No |
| GET | /api/auth/me | Get my profile | Yes |
| PUT | /api/auth/update-profile | Update profile | Yes |
| PUT | /api/auth/change-password | Change password | Yes |

### RIDES
| Method | URL | Description | Who |
|--------|-----|-------------|-----|
| POST | /api/rides/book | Book a ride | Passenger |
| GET | /api/rides/my-rides | Ride history | Both |
| GET | /api/rides/:id | Ride details | Both |
| PUT | /api/rides/:id/accept | Accept ride | Driver |
| PUT | /api/rides/:id/arrived | Mark arrived | Driver |
| POST | /api/rides/:id/verify-otp | Enter OTP | Driver |
| PUT | /api/rides/:id/complete | Complete ride | Driver |
| PUT | /api/rides/:id/cancel | Cancel ride | Both |
| POST | /api/rides/:id/rate | Rate driver | Passenger |
| POST | /api/rides/:id/sos | SOS emergency | Both |

---

## 🔐 How Authentication Works

1. User signs up → password gets hashed automatically
2. Server returns a JWT token
3. Save this token in your app (AsyncStorage in React Native)
4. Send token in every protected request:
   ```
   Authorization: Bearer YOUR_TOKEN_HERE
   ```

---

## 🧪 Test with These Sample Requests

### Sign up as Passenger:
```json
POST /api/auth/signup
{
  "name": "Ayesha Khan",
  "email": "ayesha@test.com",
  "phone": "+923001234567",
  "password": "password123",
  "role": "passenger"
}
```

### Sign up as Driver:
```json
POST /api/auth/signup
{
  "name": "Fatima Malik",
  "email": "fatima@test.com",
  "phone": "+923219876543",
  "password": "password123",
  "role": "driver"
}
```

### Login:
```json
POST /api/auth/login
{
  "email": "ayesha@test.com",
  "password": "password123"
}
```
→ Returns a token. Copy it for the next requests.

### Book a Ride (Passenger):
```json
POST /api/rides/book
Header: Authorization: Bearer YOUR_TOKEN
{
  "pickupAddress": "DHA Phase 5, Lahore",
  "pickupCoordinates": [74.3436, 31.4804],
  "dropoffAddress": "Gulberg III, Lahore",
  "dropoffCoordinates": [74.3587, 31.5204],
  "distanceKm": 7.2,
  "moodPreference": "quiet",
  "isPooled": false
}
```

---

## 🔌 Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| user:join | Client → Server | User connects |
| driver:location | Client → Server | GPS update |
| driver:location:update | Server → Client | Live location to passenger |
| ride:new-request | Client → Server | New booking broadcast |
| ride:incoming | Server → Driver | Incoming ride notification |
| ride:accepted | Client → Server | Driver accepts |
| ride:driver-found | Server → Passenger | Driver info sent |
| ride:started | Server → Passenger | OTP verified, ride begun |
| sos:activated | Client → Server | Emergency |
| sos:confirmed | Server → Client | SOS confirmed |

---

## ⚠️ Important Notes for FYP

1. **Gender Lock:** Only "female" gender is accepted — enforced in User model
2. **Driver Verification:** Drivers start as unverified — admin must approve
3. **Auto Suspension:** Drivers with rating < 2.0 after 5 rides are auto-suspended
4. **OTP:** Generated per ride, 4 digits, verified before ride starts
5. **Real-time:** Socket.IO handles live GPS, notifications, SOS
