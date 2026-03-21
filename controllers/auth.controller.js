const jwt                  = require('jsonwebtoken');
const { OAuth2Client }     = require('google-auth-library');
const User                 = require('../models/User');
const { sendEmail, emailTemplates } = require('../services/email.service');
const { ok, fail }         = require('../utils/response');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

// POST /api/auth/google
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return fail(res, 'Google ID token required.', 400);

    const ticket = await googleClient.verifyIdToken({
      idToken,
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
    return ok(res, { token, user }, 'Google login successful');
  } catch (err) {
    return fail(res, 'Google authentication failed.', 401);
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

module.exports = { register, login, googleAuth, getMe };
