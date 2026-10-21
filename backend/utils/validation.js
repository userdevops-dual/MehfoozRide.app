// utils/validation.js — CNIC, phone and password rules (server is the source of truth)
const config = require("../config/appConfig");

const CNIC_NOT_ELIGIBLE =
  "This CNIC is not eligible for registration in Mehfooz Ride because this application is currently restricted to female users.";

// Accepts "35202-1234567-2", "35202 1234567 2" or "3520212345672"
const checkCNIC = (input) => {
  const digits = String(input ?? "").replace(/[\s-]/g, "");
  const fail = (reason) => ({ valid: false, eligible: false, reason });

  if (!digits)               return fail("CNIC is required.");
  if (!/^\d+$/.test(digits)) return fail("CNIC can only contain digits (spaces and hyphens are allowed).");
  if (digits.length !== 13)  return fail(`CNIC must be exactly 13 digits (you entered ${digits.length}).`);
  // First digit is the province/region code (1–7)
  if (!/^[1-7]/.test(digits)) return fail("Invalid CNIC: the first digit must be a region code from 1 to 7.");

  const formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  // Pakistani CNIC rule used by this app: last digit even = female, odd = male
  const eligible = Number(digits[12]) % 2 === 0;

  return eligible
    ? { valid: true, eligible: true, digits, formatted }
    : { valid: true, eligible: false, digits, formatted, reason: CNIC_NOT_ELIGIBLE };
};

// Pakistani mobile → +923XXXXXXXXX. Accepts 03001234567, 3001234567, 923001234567, +92 300 1234567
const normalizePhone = (input) => {
  const d = String(input ?? "").replace(/[\s\-()]/g, "").replace(/^\+/, "");
  let local;
  if (/^03\d{9}$/.test(d))       local = d.slice(1);
  else if (/^3\d{9}$/.test(d))   local = d;
  else if (/^923\d{9}$/.test(d)) local = d.slice(2);
  else return null;
  return `+92${local}`;
};

const checkPassword = (password) => {
  const p = String(password ?? "");
  if (p.length < config.password.minLength) return `Password must be at least ${config.password.minLength} characters.`;
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p))  return "Password must contain at least one letter and one number.";
  return null;
};

const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ""));

module.exports = { checkCNIC, normalizePhone, checkPassword, isEmail, CNIC_NOT_ELIGIBLE };
