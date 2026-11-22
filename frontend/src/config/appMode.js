// src/config/appMode.js — one switch for demo-only things in the app (demo login
// shortcuts and labels). Set EXPO_PUBLIC_DEMO_MODE=false in .env for real builds.
// Default: on in development builds, off in release builds.
const flag = process.env.EXPO_PUBLIC_DEMO_MODE;
export const DEMO_MODE = flag != null ? flag === 'true' : __DEV__;
