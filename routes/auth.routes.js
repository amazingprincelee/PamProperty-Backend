const router  = require('express').Router();
const { register, login, googleAuth, getMe } = require('../controllers/auth.controller');
const { protect }      = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const validate         = require('../middleware/validate');
const { object, string } = require('yup');

const registerSchema = object({ name: string().required(), email: string().email().required(), password: string().min(6).required(), phone: string() });
const loginSchema    = object({ email: string().email().required(), password: string().required() });

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login',    authLimiter, validate(loginSchema),    login);
router.post('/google',   authLimiter, googleAuth);
router.get('/me',        protect,     getMe);

module.exports = router;
