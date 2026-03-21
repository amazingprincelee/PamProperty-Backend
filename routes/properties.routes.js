const router = require('express').Router();
const { getProperties, getPropertyById, createProperty, updateProperty, deleteProperty, updateAvailability, getMyProperties } = require('../controllers/properties.controller');
const { protect }     = require('../middleware/auth');
const { handleUpload } = require('../middleware/upload');

router.get('/',          getProperties);
router.get('/my',        protect, getMyProperties);
router.get('/:id',       getPropertyById);
router.post('/',         protect, handleUpload('pamprop/properties'), createProperty);
router.put('/:id',       protect, handleUpload('pamprop/properties'), updateProperty);
router.delete('/:id',    protect, deleteProperty);
router.put('/:id/availability', protect, updateAvailability);

module.exports = router;
