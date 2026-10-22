// services/realtime.js — lets controllers send Socket.IO events.
// Every user is in a room named after her user id (see socket/socket.js).
let io = null;

module.exports = {
  setIO: (instance) => { io = instance; },
  // Send an event to one user (no-op if sockets are not initialised, e.g. in tests)
  toUser: (userId, event, payload) => {
    if (io && userId) io.to(String(userId)).emit(event, payload);
  },
  toAdmins: (event, payload) => {
    if (io) io.to("admins").emit(event, payload);
  },
};
