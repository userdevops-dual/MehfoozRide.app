// src/config/fakeCall.js — fake-call callers, ringtones and scripts (edit freely).
//
// In each script, "caller" lines are spoken aloud with the phone's offline
// text-to-speech; "you" lines are shown as subtitles for the passenger to say
// herself, with a pause long enough to say them. Nobody is actually called.

export const RINGTONES = [
  { id: 'classic', label: '📞 Classic ring', desc: 'Normal phone ring',  source: require('../../assets/sounds/ring_classic.wav') },
  { id: 'soft',    label: '🔔 Soft bell',    desc: 'Gentle chime',       source: require('../../assets/sounds/ring_soft.wav') },
  { id: 'vibrate', label: '📳 Vibrate only', desc: 'No sound',           source: null },
];

// voice: preferred TTS settings; pitch > 1 sounds younger, < 1 older
export const CALLERS = [
  {
    id: 'mother', name: 'Ammi', emoji: '👩‍👧', relation: 'Mother', voice: { pitch: 1.05, rate: 0.92 },
    script: [
      { who: 'caller', text: 'Hello? Where are you, beta?' },
      { who: 'you',    text: "I'm on my way home, Ammi." },
      { who: 'caller', text: 'How long will you take?' },
      { who: 'you',    text: "About ten minutes. I'll be home soon." },
      { who: 'caller', text: "Okay. Your father is waiting outside for you. Call me when you're near." },
      { who: 'you',    text: 'Okay Ammi, I will.' },
      { who: 'caller', text: 'Stay on the phone with me until you reach. Tell me, which road are you on now?' },
      { who: 'you',    text: "I'm almost there." },
      { who: 'caller', text: 'Good. Allah hafiz, beta. See you soon.' },
    ],
  },
  {
    id: 'father', name: 'Abbu', emoji: '👨', relation: 'Father', voice: { pitch: 0.8, rate: 0.9 },
    script: [
      { who: 'caller', text: 'Assalam o alaikum. Where have you reached?' },
      { who: 'you',    text: "Walaikum assalam Abbu, I'm in the car, coming home." },
      { who: 'caller', text: 'Send me your location. I am standing at the gate.' },
      { who: 'you',    text: 'Yes Abbu, sending it now.' },
      { who: 'caller', text: 'Good. I can see your location. Stay on the line until you reach.' },
      { who: 'you',    text: 'Okay.' },
      { who: 'caller', text: "Alright. I'm waiting. Come quickly." },
    ],
  },
  {
    id: 'sister', name: 'Baji Sara', emoji: '👧', relation: 'Sister', voice: { pitch: 1.2, rate: 1.0 },
    script: [
      { who: 'caller', text: 'Hey! Where are you? Everyone is waiting for you.' },
      { who: 'you',    text: "I'm on the way, almost there." },
      { who: 'caller', text: "Okay, I'm coming down to pick you up from the road." },
      { who: 'you',    text: "Okay, I'll see you there." },
      { who: 'caller', text: "Great, I'm leaving now. Stay on the phone." },
    ],
  },
  {
    id: 'office', name: 'Office', emoji: '💼', relation: 'Workplace', voice: { pitch: 0.95, rate: 0.95 },
    script: [
      { who: 'caller', text: 'Hello, this is the office. Are you on your way?' },
      { who: 'you',    text: "Yes, I'm in the car right now." },
      { who: 'caller', text: 'The meeting is starting soon. Our security guard is waiting at the entrance for you.' },
      { who: 'you',    text: "Okay, I'll be there shortly." },
      { who: 'caller', text: 'Fine, see you in a few minutes.' },
    ],
  },
];

// Pause for a "you" line: ~0.45 s per word, at least 2 s
export const replyPauseMs = (text) => Math.max(2000, text.split(/\s+/).length * 450);
