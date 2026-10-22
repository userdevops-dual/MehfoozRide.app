// services/verification.js — the "Verified Female Driver" status, built from
// the individual checks a driver has actually passed. Nothing here assumes a
// driver is verified; every badge traces back to stored data.
//
// Checks:
//   cnic            — female-eligible CNIC accepted at registration (server-validated)
//   documents       — CNIC, licence and vehicle registration photos uploaded
//   vehicle         — make/model and number plate on file
//   backgroundCheck — set to "passed" by an admin
//   adminApproved   — an admin approved the account (isVerified)
//
// source "demo_seed" marks accounts created by seedDemoAccounts.js so the app
// can label them as demo data instead of presenting them as real approvals.

const driverVerification = (user) => {
  const d = user?.driverDetails || {};
  const checks = {
    cnic:            !!user?.cnicVerified,
    documents:       !!(d.cnicPhoto && d.licensePhoto && d.registrationPhoto),
    vehicle:         !!((d.vehicleMake || d.vehicleModel) && d.licensePlate),
    backgroundCheck: d.backgroundCheck === "passed",
    adminApproved:   user?.isVerified === true,
  };
  const source = d.verificationSource || (checks.adminApproved ? "admin" : "none");
  // Demo accounts have no real photos, so documents are not required for them.
  const required = source === "demo_seed"
    ? ["cnic", "vehicle", "backgroundCheck", "adminApproved"]
    : ["cnic", "documents", "vehicle", "backgroundCheck", "adminApproved"];
  const verified = required.every(k => checks[k]);

  return {
    verified,
    label: verified ? "Verified Female Driver" : "Verification pending",
    status: verified ? "verified" : d.backgroundCheck === "failed" ? "rejected" : "pending",
    checks,
    source,
    isDemo: source === "demo_seed",
    verifiedAt: d.verifiedAt || null,
  };
};

module.exports = { driverVerification };
