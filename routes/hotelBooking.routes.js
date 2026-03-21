const router = require('express').Router();
const { createBooking, getBooking, getMyBookings, confirmBooking, checkIn, checkOut, releaseFunds } = require('../controllers/hotelBooking.controller');
const { protect } = require('../middleware/auth');

router.post('/',             protect, createBooking);
router.get('/my',            protect, getMyBookings);
router.get('/:id',           protect, getBooking);
router.put('/:id/confirm',   protect, confirmBooking);
router.put('/:id/checkin',   protect, checkIn);
router.put('/:id/checkout',  protect, checkOut);
router.put('/:id/release',   protect, releaseFunds);

module.exports = router;
