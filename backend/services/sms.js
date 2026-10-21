// services/sms.js — SMS providers behind one interface: sendOtp(phone, code)
// Select with SMS_PROVIDER in backend/.env (demo | twilio).
const config = require("../config/appConfig");

const demoProvider = {
  name: "demo",
  isReal: false,
  async sendOtp(phone, code) {
    // Nothing is sent. The code is shown to the developer only.
    console.log(`📱 [DEMO — SMS NOT SENT] OTP for ${phone}: ${code}`);
    return { delivered: false, simulated: true };
  },
};

const twilioProvider = {
  name: "twilio",
  isReal: true,
  async sendOtp(phone, code) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE: from } = process.env;
    if (!sid || !token || !from) {
      throw new Error("Twilio is not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE");
    }
    let twilio;
    try { twilio = require("twilio"); }
    catch { throw new Error("The twilio package is not installed: run npm install twilio in backend/"); }

    await twilio(sid, token).messages.create({
      to: phone,
      from,
      body: `Your Mehfooz Ride verification code is ${code}. It expires in ${config.otp.expiresMinutes} minutes.`,
    });
    return { delivered: true, simulated: false };
  },
};

const providers = { demo: demoProvider, twilio: twilioProvider };

const getSmsProvider = () => providers[config.sms.provider] || demoProvider;

module.exports = { getSmsProvider };
