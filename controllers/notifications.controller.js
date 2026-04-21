const Notification = require('../models/Notification');
const { ok, fail } = require('../utils/response');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('relatedUser', 'name avatar');
    return ok(res, { notifications });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    return ok(res, {}, 'All notifications marked as read.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/notifications/:id/read
const markRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    return ok(res, {}, 'Notification marked as read.');
  } catch (err) {
    return fail(res, err.message);
  }
};

module.exports = { getNotifications, markAllRead, markRead };
