const router = require('express').Router();
const { getUser, updateUser, toggleFollow, getUserListings, toggleSaved, submitKyc } = require('../controllers/users.controller');
const { protect }      = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');

router.get('/:id',               getUser);
router.put('/:id',               protect, handleUpload('pamprop/avatars'), updateUser);
router.post('/:id/follow',       protect, toggleFollow);
router.get('/:id/listings',      getUserListings);
router.post('/saved/:propertyId',protect, toggleSaved);
router.post('/kyc',              protect, handleUpload('pamprop/kyc'), submitKyc);

module.exports = router;
