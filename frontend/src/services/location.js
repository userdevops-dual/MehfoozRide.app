// src/services/location.js — device GPS with clear error states.
// Every function resolves/calls back with { coords } or { error: { code, message } }
// so screens can show the right message instead of a fake location.
import { PermissionsAndroid, Platform, Linking } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

// Readings worse than this are shown with an "approximate" warning
export const LOW_ACCURACY_METERS = 100;

Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'auto' });

export const LocationError = {
  PERMISSION_DENIED: 'permission_denied',
  PERMISSION_BLOCKED: 'permission_blocked', // "Don't ask again" — only Settings can fix it
  UNAVAILABLE:       'unavailable',         // GPS / location services switched off
  TIMEOUT:           'timeout',
};

const MESSAGES = {
  permission_denied:  'Location permission is needed to show where you are and set your pickup.',
  permission_blocked: 'Location permission is turned off for Mehfooz Ride. Enable it in Settings to use your current location.',
  unavailable:        'Your location could not be found. Turn on Location (GPS) on your phone and try again.',
  timeout:            'Finding your location is taking too long. Move to an open area or try again.',
};

const err = (code) => ({ error: { code, message: MESSAGES[code] } });

export const openLocationSettings = () => Linking.openSettings();

// → { granted: true } or { error }
export const requestLocationPermission = async () => {
  if (Platform.OS !== 'android') return { granted: true };
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  if (await PermissionsAndroid.check(fine)) return { granted: true };
  const result = await PermissionsAndroid.request(fine, {
    title: 'Allow location access',
    message: 'Mehfooz Ride uses your location to set your pickup point and keep your ride safe.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return { granted: true };
  return err(result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? LocationError.PERMISSION_BLOCKED : LocationError.PERMISSION_DENIED);
};

const toCoords = (pos) => ({
  latitude:  pos.coords.latitude,
  longitude: pos.coords.longitude,
  accuracy:  Math.round(pos.coords.accuracy || 0),
  timestamp: pos.timestamp,
});

const fromGeoError = (e) =>
  err(e?.code === 1 ? LocationError.PERMISSION_DENIED : e?.code === 3 ? LocationError.TIMEOUT : LocationError.UNAVAILABLE);

// One reading → { coords } or { error }
export const getCurrentLocation = async ({ timeout = 15000 } = {}) => {
  const perm = await requestLocationPermission();
  if (perm.error) return perm;
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ coords: toCoords(pos) }),
      // High accuracy failed (e.g. indoors) → retry once with network location
      () => Geolocation.getCurrentPosition(
        (pos) => resolve({ coords: toCoords(pos) }),
        (e) => resolve(fromGeoError(e)),
        { enableHighAccuracy: false, timeout, maximumAge: 60000 }
      ),
      { enableHighAccuracy: true, timeout, maximumAge: 10000 }
    );
  });
};

// Live updates. onUpdate({ coords }) / onUpdate({ error }). Returns a stop() function.
export const watchLocation = (onUpdate, { distanceFilter = 10 } = {}) => {
  let watchId = null;
  let stopped = false;
  requestLocationPermission().then((perm) => {
    if (stopped) return;
    if (perm.error) { onUpdate(perm); return; }
    watchId = Geolocation.watchPosition(
      (pos) => onUpdate({ coords: toCoords(pos) }),
      (e) => onUpdate(fromGeoError(e)),
      { enableHighAccuracy: true, distanceFilter, interval: 5000, fastestInterval: 2000 }
    );
  });
  return () => { stopped = true; if (watchId !== null) Geolocation.clearWatch(watchId); };
};
