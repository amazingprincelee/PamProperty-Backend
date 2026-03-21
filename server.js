require('dotenv').config();

const express      = require('express');
const http         = require('http');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const fileUpload   = require('express-fileupload');

const connectDB         = require('./config/db');
const { initSocket }    = require('./config/socket');
const { startCronJobs } = require('./jobs/escrow.cron');
const { apiLimiter }    = require('./middleware/rateLimiter');

const app    = express();
const server = http.createServer(app);

// ─── Connect DB ───
connectDB();

// ─── Init Socket.io ───
initSocket(server);

// ─── Global Middleware ───
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// Raw body for Paystack webhook (must come before express.json)
app.use('/api/wallet/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ useTempFiles: false, limits: { fileSize: 50 * 1024 * 1024 } })); // 50MB limit
app.use(apiLimiter);

// ─── Routes (mounted directly — no index barrel) ───
app.use('/api/auth',           require('./routes/auth.routes'));
app.use('/api/properties',     require('./routes/properties.routes'));
app.use('/api/wallet',         require('./routes/wallet.routes'));
app.use('/api/chat',           require('./routes/chat.routes'));
app.use('/api/escrow',         require('./routes/escrow.routes'));
app.use('/api/hotel-bookings', require('./routes/hotelBooking.routes'));
app.use('/api/users',          require('./routes/users.routes'));
app.use('/api/notifications',  require('./routes/notifications.routes'));
app.use('/api/upload',         require('./routes/upload.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));

// ─── Health Check ───
app.get('/api/health', (req, res) => res.json({ status: 'Pamprop API is running.' }));

// ─── 404 Handler ───
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

// ─── Global Error Handler ───
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

// ─── Start Cron Jobs ───
startCronJobs();

// ─── Start Server ───
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Pamprop server running on port ${PORT}`));
