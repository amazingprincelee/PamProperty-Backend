const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { sendEmail, emailTemplates } = require('../services/email.service');
const { ok, fail } = require('../utils/response');

// Redirects the popup to a same-origin frontend relay page that postMessages the token
// and calls window.close(). Same-origin close is always reliable; cross-origin is not.
function popupRelay(res, clientUrl, payload) {
  const callbackBase = `${clientUrl}/auth-callback.html`;
  const url = payload.token
    ? `${callbackBase}?token=${encodeURIComponent(payload.token)}`
    : `${callbackBase}?error=${encodeURIComponent(payload.error || 'google_auth_failed')}`;
  return res.redirect(url);
}

// In-memory deduplication: prevents two concurrent requests with the same auth code
// (Node.js is single-threaded so the Set.has check + Set.add is atomic before any await)
const _usedCodes = new Set();

// ─── Google OAuth helpers ──────────────────────────────────────────────────────
const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL  = 'https://www.googleapis.com/oauth2/v3/userinfo';

function buildGoogleRedirectUri() {
  const base = (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  return `${base}/api/auth/google/callback`;
}

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// POST /api/auth/register
const register = async (req, res) => {
 
  try {
    const { name, email, password, phone, referralCode } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return fail(res, 'Email already registered.', 400);

    // Resolve referral code → referredBy
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode }).select('_id');
      if (referrer) referredBy = referrer._id;
    }

    const user = await User.create({ name, email, password, phone, referredBy });
    const token = signToken(user._id);

    // Fire-and-forget — don't let email failure block registration
    sendEmail({ to: email, ...emailTemplates.welcome(name) }).catch(e =>
      console.error('[register] welcome email failed:', e.message)
    );

    user.password = undefined;
    return ok(res, { token, user }, 'Registration successful', 201);
  } catch (err) {
    return fail(res, err.message);
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  

  try {
    const { email, password } = req.body;


    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) return fail(res, 'Invalid credentials.', 401);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return fail(res, 'Invalid credentials.', 401);

    const token = signToken(user._id);
    user.password = undefined;

    return ok(res, { token, user }, 'Login successful');
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/auth/google — redirect user to Google consent screen
const googleInitiate = (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  buildGoogleRedirectUri(),
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
};

// GET /api/auth/google/callback — Google redirects here with ?code=
const googleCallback = async (req, res) => {
  const clientUrl = (process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL
    : 'http://localhost:5173'
  ).replace(/\/$/, '');

  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${clientUrl}?error=google_auth_failed`);

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  buildGoogleRedirectUri(),
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${clientUrl}?error=google_auth_failed`);

    // Fetch user info from Google
    const userRes    = await fetch(GOOGLE_USER_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) return res.redirect(`${clientUrl}?error=google_auth_failed`);

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId: googleUser.sub }, { email: googleUser.email.toLowerCase() }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId     = googleUser.sub;
        user.isGoogleUser = true;
        if (!user.avatar) user.avatar = googleUser.picture;
        await user.save();
      }
    } else {
      user = await User.create({
        name:         googleUser.name,
        email:        googleUser.email.toLowerCase(),
        googleId:     googleUser.sub,
        isGoogleUser: true,
        avatar:       googleUser.picture,
        password:     await bcrypt.hash(googleUser.sub + process.env.JWT_SECRET, 10),
      });
      await sendEmail({ to: user.email, ...emailTemplates.welcome(user.name) });
    }

    const token = signToken(user._id);
    return res.redirect(`${clientUrl}?token=${token}`);
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err.message);
    return res.redirect(`${clientUrl}?error=google_auth_failed`);
  }
};

// POST /api/auth/google/mobile
// Body: { idToken }  — id_token from @react-native-google-signin/google-signin
const googleMobile = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return fail(res, 'idToken is required', 400);

    // Verify with Google's tokeninfo endpoint (no extra package needed)
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const googleUser = await r.json();
    if (googleUser.error || !googleUser.email) return fail(res, 'Invalid Google token', 401);

    let user = await User.findOne({
      $or: [{ googleId: googleUser.sub }, { email: googleUser.email.toLowerCase() }],
    });

    if (user) {
      if (!user.googleId) {
        user.googleId     = googleUser.sub;
        user.isGoogleUser = true;
        if (!user.avatar) user.avatar = googleUser.picture;
        await user.save();
      }
    } else {
      user = await User.create({
        name:         googleUser.name,
        email:        googleUser.email.toLowerCase(),
        googleId:     googleUser.sub,
        isGoogleUser: true,
        avatar:       googleUser.picture || '',
        password:     await bcrypt.hash(googleUser.sub + process.env.JWT_SECRET, 10),
      });
      sendEmail({ to: user.email, ...emailTemplates.welcome(user.name) }).catch(() => {});
    }

    const token = signToken(user._id);
    return ok(res, { token, user });
  } catch (err) {
    return fail(res, err.message || 'Google auth failed', 500);
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    return ok(res, { user: req.user });
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { register, login, googleInitiate, googleCallback, googleMobile, getMe };
