// mehfooz-backend/server.js
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const dotenv     = require('dotenv');
const connectDB  = require('./config/db');
const initSocket = require('./socket/socket');

dotenv.config();
console.log('DEBUG MONGO_URI:', process.env.MONGO_URI);
connectDB();

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/authRoutes'));
app.use('/api/rides',  require('./routes/rideRoutes'));
app.use('/api/driver', require('./routes/driverRoutes'));
app.use('/api/admin',  require('./routes/adminRoutes'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success:   true,
    message:   '🛡️ Mehfooz Ride API is running!',
    version:   '1.0.0',
    platform:  'Women-Only Ride Hailing — Lahore, Pakistan',
    endpoints: {
      auth:   '/api/auth   (signup, login, profile)',
      rides:  '/api/rides  (book, accept, OTP, complete, SOS)',
      driver: '/api/driver (docs, toggle-online, stats)',
      admin:  '/api/admin  (approve-drivers, sos-incidents, stats)',
    },
  });
});

app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));
app.use((err, req, res, _next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
initSocket(io);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log('\n════════════════════════════════════');
  console.log('  🛡️  Mehfooz Ride Server Started');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log('  📡  Socket.IO ready');
  console.log('  🌸  Women-Only Platform — Lahore PK');
  console.log('════════════════════════════════════\n');
});
