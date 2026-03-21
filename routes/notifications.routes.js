const router = require('express').Router();
const { getNotifications, markAllRead, markRead } = require('../controllers/notifications.controller');
const { protect } = require('../middleware/auth');

router.get('/',              protect, getNotifications);
router.put('/read-all',      protect, markAllRead);
router.put('/:id/read',      protect, markRead);

module.exports = router;
