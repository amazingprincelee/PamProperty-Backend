const router  = require('express').Router();
const { register, login, googleInitiate, googleCallback, googleMobile, getMe, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { protect }      = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const validate         = require('../middleware/validate');
const { object, string } = require('yup');

const registerSchema = object({ name: string().required(), email: string().email().required(), password: string().min(6).required(), phone: string() });
const loginSchema    = object({ email: string().email().required(), password: string().required() });

router.post('/register',        authLimiter, validate(registerSchema), register);
router.post('/login',           authLimiter, validate(loginSchema),    login);
router.get('/google',           googleInitiate);
router.get('/google/callback',  googleCallback);
router.post('/google/mobile',   authLimiter, googleMobile);
router.get('/me',               protect,     getMe);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password',  authLimiter, resetPassword);

module.exports = router;
