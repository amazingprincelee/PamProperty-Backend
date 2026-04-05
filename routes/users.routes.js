const router = require('express').Router();
const { getUser, updateUser, toggleFollow, getUserListings, toggleSaved, submitKyc, getKycStatus, saveFcmToken } = require('../controllers/users.controller');
const { protect }      = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');

// Specific routes must come before param routes
router.put('/me/fcm-token',      protect, saveFcmToken);
router.post('/saved/:propertyId',protect, toggleSaved);
router.post('/kyc',              protect, handleUpload('pamprop/kyc'), submitKyc);
router.get('/kyc/status',        protect, getKycStatus);

// Param routes
router.get('/:id',               getUser);
router.put('/:id',               protect, handleUpload('pamprop/avatars'), updateUser);
router.post('/:id/follow',       protect, toggleFollow);
router.get('/:id/listings',      getUserListings);

module.exports = router;
