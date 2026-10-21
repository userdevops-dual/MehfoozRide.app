// src/utils/validation.js — instant feedback while typing.
// The backend (backend/utils/validation.js) applies the same rules and has the final say.

export const CNIC_NOT_ELIGIBLE =
  'This CNIC is not eligible for registration in Mehfooz Ride because this application is currently restricted to female users.';

// Digits only → 12345-6789012-3 (dashes added automatically while typing)
export const formatCNIC = (text) => {
  const d = String(text ?? '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5)  return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
};

// → { complete, valid, eligible, message }
export const checkCNIC = (input) => {
  const digits = String(input ?? '').replace(/[\s-]/g, '');
  if (!digits)               return { complete: false, valid: false, eligible: false, message: '' };
  if (!/^\d+$/.test(digits)) return { complete: true,  valid: false, eligible: false, message: 'CNIC can only contain digits.' };
  if (digits.length < 13)    return { complete: false, valid: false, eligible: false, message: `${13 - digits.length} more digit${digits.length === 12 ? '' : 's'}` };
  if (digits.length > 13)    return { complete: true,  valid: false, eligible: false, message: 'CNIC must be exactly 13 digits.' };
  if (!/^[1-7]/.test(digits)) return { complete: true, valid: false, eligible: false, message: 'Invalid CNIC: the first digit must be a region code from 1 to 7.' };
  if (Number(digits[12]) % 2 !== 0) return { complete: true, valid: true, eligible: false, message: CNIC_NOT_ELIGIBLE };
  return { complete: true, valid: true, eligible: true, message: '' };
};

// Pakistani mobile → +923XXXXXXXXX, or null
export const normalizePhone = (input) => {
  const d = String(input ?? '').replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (/^03\d{9}$/.test(d))  return `+92${d.slice(1)}`;
  if (/^3\d{9}$/.test(d))   return `+92${d}`;
  if (/^923\d{9}$/.test(d)) return `+${d}`;
  return null;
};

export const PASSWORD_MIN = 8;

// → list of { label, ok } for the checklist under the password field
export const passwordRules = (p = '') => [
  { label: `At least ${PASSWORD_MIN} characters`, ok: p.length >= PASSWORD_MIN },
  { label: 'Contains a letter',                   ok: /[A-Za-z]/.test(p) },
  { label: 'Contains a number',                   ok: /\d/.test(p) },
];

export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? '').trim());
