// mehfooz-backend/server.js
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const dotenv     = require('dotenv');
const connectDB  = require('./config/db');
const initSocket = require('./socket/socket');

dotenv.config();
const { securityHeaders, sanitizeInput, rateLimit, hideServerErrors, corsOptions, originAllowed, isProd } = require('./middleware/security');
const weakSecret = (s) => !s || s.length < 32 || /your_super_secret|change_me|secret123/i.test(s);
if (process.env.JWT_SECRET && weakSecret(process.env.JWT_SECRET)) {
  if (isProd()) { console.error('JWT_SECRET is too weak for production (use 32+ random characters)'); process.exit(1); }
  console.warn('⚠️  JWT_SECRET is weak — fine for development, replace it before production');
}
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('❌ MONGO_URI and JWT_SECRET must be set in backend/.env (see .env.example)');
  process.exit(1);
}
connectDB();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                       // correct client IP behind one proxy (rate limits)
app.use(securityHeaders);
app.use(cors(corsOptions));                      // browsers only from CORS_ORIGINS; the app sends no Origin
app.use(express.json({ limit: '100kb' }));       // CNIC photos use multipart, not JSON
app.use(sanitizeInput);
app.use(hideServerErrors);
app.use('/api', rateLimit({ name: 'api', windowMs: 60 * 1000, max: 300 }));   // general ceiling per IP

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/authRoutes'));
app.use('/api/rides',  require('./routes/rideRoutes'));
app.use('/api/driver', require('./routes/driverRoutes'));
app.use('/api/admin',  require('./routes/adminRoutes'));
app.use('/api/geo',    require('./routes/geoRoutes'));
app.use('/api/emergency', require('./routes/emergencyRoutes'));

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
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request is too large' });
  console.error('Server Error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)), methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5,                        // 100 KB per message
});
initSocket(io);
require('./services/realtime').setIO(io);          // lets controllers notify users
require('./services/matching').startSweeper();     // expires old requests, re-offers open ones

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log('\n════════════════════════════════════');
  console.log('  🛡️  Mehfooz Ride Server Started');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log('  📡  Socket.IO ready');
  console.log('  🌸  Women-Only Platform — Lahore PK');
  console.log('════════════════════════════════════\n');
});
