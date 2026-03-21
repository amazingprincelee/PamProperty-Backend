const jwt                  = require('jsonwebtoken');
const { OAuth2Client }     = require('google-auth-library');
const User                 = require('../models/User');
const { sendEmail, emailTemplates } = require('../services/email.service');
const { ok, fail }         = require('../utils/response');

const getGoogleClient = () => new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.SERVER_URL}/api/auth/google/callback`
);

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

    await sendEmail({ to: email, ...emailTemplates.welcome(name) });

    return ok(res, { token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, kycVerified: user.kycVerified } }, 'Registration successful', 201);
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

// GET /api/auth/google — redirect to Google consent screen
const googleInitiate = (req, res) => {
  const client = getGoogleClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
};

// GET /api/auth/google/callback — exchange code, find/create user, redirect to frontend
const googleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.CLIENT_URL}?error=google_auth_failed`);

    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      user = await User.create({ name, email, googleId, isGoogleUser: true, avatar: picture });
      await sendEmail({ to: email, ...emailTemplates.welcome(name) });
    } else if (!user.googleId) {
      user.googleId     = googleId;
      user.isGoogleUser = true;
      if (!user.avatar) user.avatar = picture;
      await user.save();
    }

    const token = signToken(user._id);
    res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect(`${process.env.CLIENT_URL}?error=google_auth_failed`);
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
