// src/services/sms.js — SMS from the passenger's own SIM (free: uses her own SMS
// balance/package; no paid SMS service). Android only. Used for SOS alerts and
// the Guardian Mode trip link. Every result says what really happened:
//   sent | failed (reason) | unknown (Android gave no confirmation) | unavailable
import { Platform, PermissionsAndroid } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = Platform.OS === 'android' ? requireOptionalNativeModule('DirectSms') : null;

export const smsSupported = () => {
  try { return !!Native && Native.isAvailable(); } catch { return false; }
};

// Ask for SEND_SMS once (explains why). Returns true when granted.
export const ensureSmsPermission = async () => {
  if (!smsSupported()) return false;
  if (Native.hasPermission()) return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
    title: 'Send SMS to your guardians',
    message: 'In an emergency Mehfooz Ride texts your live location to your emergency contacts from your own SIM. Normal SMS charges of your network apply.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
};

const REASON = {
  permission_denied: 'SMS permission is off',
  no_service: 'no mobile signal',
  radio_off: 'airplane mode / mobile radio off',
  generic_failure: 'network refused it (no balance or SMS package?)',
  no_confirmation: 'phone did not confirm sending',
};
export const reasonText = (r) => REASON[r] || r || 'unknown error';

/**
 * Send one message to several contacts. Returns [{ name, phone, status, reason }].
 * Does not throw.
 */
export const sendSmsToContacts = async (contacts, message) => {
  if (!smsSupported()) return contacts.map(c => ({ name: c.name, phone: c.phone, status: 'unavailable', reason: 'This phone/app build cannot send SMS' }));
  const allowed = await ensureSmsPermission();
  const out = [];
  for (const c of contacts) {
    if (!allowed) { out.push({ name: c.name, phone: c.phone, status: 'failed', reason: 'permission_denied' }); continue; }
    try {
      const r = await Native.send(String(c.phone), message);
      out.push({ name: c.name, phone: c.phone, status: r?.status || 'unknown', reason: r?.reason });
    } catch (e) {
      out.push({ name: c.name, phone: c.phone, status: 'failed', reason: e?.message || 'send_error' });
    }
  }
  return out;
};
