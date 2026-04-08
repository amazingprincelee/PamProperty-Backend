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

// ─── Property Share Page (OG tags for WhatsApp / social media) ───
app.get('/share/property/:id', async (req, res) => {
  try {
    const Property = require('./models/Property');
    const prop = await Property.findById(req.params.id).lean();
    const frontendBase = process.env.CLIENT_URL || 'https://pamproperty.com';
    const apiBase      = (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');

    if (!prop) {
      return res.redirect(302, frontendBase);
    }

    const title   = prop.title || prop.name || 'Property on PamProperty';
    const type    = prop.type  || 'rental';
    const price   = prop.price ? `₦${Number(prop.price).toLocaleString()}` : '';
    const loc     = [prop.lga, prop.state].filter(Boolean).join(', ') || prop.location || '';
    const beds    = prop.bedrooms ? `${prop.bedrooms} bed` : '';
    const desc    = [price, beds, loc, prop.description?.slice(0, 120)].filter(Boolean).join(' · ');
    const image   = prop.images?.[0] || `${apiBase}/og-default.jpg`;
    const pageUrl = `${frontendBase}/property/${type}/${prop._id}`;
    const shareUrl = `${apiBase}/share/property/${prop._id}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title} — PamProperty</title>
  <meta name="description" content="${desc}"/>

  <!-- Open Graph (WhatsApp, Facebook, LinkedIn) -->
  <meta property="og:type"        content="website"/>
  <meta property="og:site_name"   content="PamProperty"/>
  <meta property="og:title"       content="${title}"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:image"       content="${image}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url"         content="${shareUrl}"/>

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${title}"/>
  <meta name="twitter:description" content="${desc}"/>
  <meta name="twitter:image"       content="${image}"/>

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0; url=${pageUrl}"/>
</head>
<body>
  <p>Redirecting to <a href="${pageUrl}">${title}</a>…</p>
  <script>window.location.replace("${pageUrl}");</script>
</body>
</html>`);
  } catch (err) {
    res.redirect(302, process.env.CLIENT_URL || 'https://pamproperty.com');
  }
});

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


