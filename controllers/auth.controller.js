const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const { sendEmail, emailTemplates } = require('../services/email.service');
const { ok, fail } = require('../utils/response');

// Sends a tiny HTML page that postMessages the payload to the opener then closes.
// Falls back to a query-string redirect if the window has no opener (direct nav).
function popupRelay(clientUrl, payload) {
  const json = JSON.stringify(payload);
  const redirect = payload.token
    ? `${clientUrl}?token=${payload.token}`
    : `${clientUrl}?error=${payload.error}`;
  return `<!DOCTYPE html><html><body><script>
    try {
      if (window.opener) {
        window.opener.postMessage(${json}, '${clientUrl}');
        window.close();
      } else {
        window.location.href = '${redirect}';
      }
    } catch(e) { window.location.href = '${redirect}'; }
  <\/script></body></html>`;
}

// ─── Google OAuth helpers ──────────────────────────────────────────────────────
const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL  = 'https://www.googleapis.com/oauth2/v3/userinfo';

function buildGoogleRedirectUri() {
  const base = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/api/auth/google/callback`;
}

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

// POST /api/auth/register
const register = async (req, res) => {
 
  try {
    const { name, email, password, phone } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return fail(res, 'Email already registered.', 400);

    const user = await User.create({ name, email, password, phone });
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
  const clientUrl = process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL
    : 'http://localhost:5173';
  try {
    const { code } = req.query;
    if (!code) throw new Error('No code from Google');

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
    if (!tokenData.access_token) throw new Error('Token exchange failed');

    // Fetch user info from Google
    const userRes    = await fetch(GOOGLE_USER_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) throw new Error('Could not get email from Google');

    // Find existing user by googleId or email
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
        // Google users have no password — set a hash they can never guess
        password:     await bcrypt.hash(googleUser.sub + process.env.JWT_SECRET, 10),
      });
      await sendEmail({ to: user.email, ...emailTemplates.welcome(user.name) });
    }

    const token = signToken(user._id);
    res.send(popupRelay(clientUrl, { type: 'GOOGLE_AUTH_TOKEN', token }));
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err.message);
    res.send(popupRelay(clientUrl, { type: 'GOOGLE_AUTH_ERROR', error: 'google_auth_failed' }));
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

module.exports = { register, login, googleInitiate, googleCallback, getMe };
