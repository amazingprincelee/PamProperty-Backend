const Notification = require('../models/Notification');
const { getIO }    = require('../config/socket');

const sendNotification = async ({ recipientId, title, message, type = 'system', relatedEscrow, relatedHotelBooking, relatedProperty, relatedConversation }) => {
  const notif = await Notification.create({
    recipient:           recipientId,
    title,
    message,
    type,
    relatedEscrow:       relatedEscrow       || null,
    relatedHotelBooking: relatedHotelBooking || null,
    relatedProperty:     relatedProperty     || null,
    relatedConversation: relatedConversation || null,
  });

  // Push real-time notification via Socket.io
  try {
    const io = getIO();
    io.to(recipientId.toString()).emit('notification', notif);
  } catch (_) {
    // Socket not yet initialised in test environments — ignore
  }

  return notif;
};

module.exports = { sendNotification };
