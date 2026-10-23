// services/notifier.js — messages to emergency contacts / guardians.
//
// Provider (config.emergency.notifyProvider / NOTIFY_PROVIDER):
//   demo   — nothing leaves the server; the message is printed in the backend
//            console and every result has status "simulated".
//   twilio — real SMS through Twilio's REST API. Needs TWILIO_ACCOUNT_SID,
//            TWILIO_AUTH_TOKEN and TWILIO_FROM in the environment.
//
// Every result says honestly what happened: simulated | sent | failed | not_configured.
const config = require("../config/appConfig");

const twilioConfigured = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const sendTwilio = async (to, body) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return data.sid;
};

/**
 * Send one message to each contact. Returns one record per contact:
 * { name, phone, relation, channel, status, detail, at }
 */
const notifyContacts = async (contacts, message) => {
  const provider = config.emergency.notifyProvider;
  const results = [];
  for (const c of contacts || []) {
    const base = { name: c.name, phone: c.phone, relation: c.relation || "", channel: "sms", at: new Date() };
    if (provider === "twilio") {
      if (!twilioConfigured()) {
        results.push({ ...base, status: "not_configured", detail: "NOTIFY_PROVIDER=twilio but TWILIO_* variables are missing" });
        continue;
      }
      try {
        const id = await sendTwilio(c.phone, message);
        results.push({ ...base, status: "sent", detail: `Twilio message ${id}` });
      } catch (e) {
        results.push({ ...base, status: "failed", detail: e.message });
      }
    } else {
      console.log(`📱 [DEMO SMS — not sent] to ${c.name} (${c.phone}): ${message}`);
      results.push({ ...base, status: "simulated", detail: "Demo mode: logged on the server, no SMS sent" });
    }
  }
  return results;
};

module.exports = { notifyContacts };
