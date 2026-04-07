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
app.set('trust proxy', 1); // Required for rate-limit behind DigitalOcean/reverse proxy
const server = http.createServer(app);

// ─── Connect DB ───
connectDB();

// ─── Init Socket.io ───
initSocket(server);

// ─── Global Middleware ───
app.use(helmet());
app.use(compression());
const allowedOrigins = [process.env.CLIENT_URL,'https://pamproperty.vercel.app', 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Raw body for Paystack webhook (must come before express.json)
app.use('/api/wallet/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ useTempFiles: false, parseNested: true, limits: { fileSize: 50 * 1024 * 1024 } })); // 50MB limit
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
app.use('/api/disputes',       require('./routes/disputes.routes'));
app.use('/api/support',        require('./routes/support.routes'));
app.use('/api/referrals',      require('./routes/referral.routes'));
app.use('/api/admin/settings', require('./routes/settings.routes'));

// ─── Health Check ───
app.get('/api/health', (req, res) => res.json({ status: 'PamProperty API is running.' }));

// ─── Sitemap ───
app.get('/sitemap.xml', async (req, res) => {
  try {
    const Property = require('./models/Property');
    const props = await Property.find({ status: 'approved' }, '_id type updatedAt').lean();
    const base  = 'https://pamproperty.com';
    const static_urls = [
      { loc: base, priority: '1.0' },
      { loc: `${base}/agents`, priority: '0.7' },
    ];
    const prop_urls = props.map(p => ({
      loc:      `${base}/property/${p.type}/${p._id}`,
      lastmod:  (p.updatedAt || new Date()).toISOString().split('T')[0],
      priority: p.type === 'hotel' ? '0.9' : '0.8',
    }));
    const all = [...static_urls, ...prop_urls];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority || '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    res.status(500).send('');
  }
});

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
server.listen(PORT, () => console.log(`PamProperty server running on port ${PORT}`));


