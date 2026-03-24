const Notification  = require('../models/Notification');
const { getIO }     = require('../config/socket');
const { sendEmailIfOffline } = require('./email.service');

const sendNotification = async ({
  recipientId, recipientEmail,
  title, message, type = 'system',
  relatedEscrow, relatedHotelBooking, relatedProperty, relatedConversation,
  emailSubject, emailHtml,
}) => {
  // 1. Save to MongoDB
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

  // 2. Push real-time via Socket.io
  try {
    const io = getIO();
    io.to(recipientId.toString()).emit('notification', notif);
  } catch (_) {}

  // 3. Send email only if user is offline and email details are provided
  if (recipientEmail && emailSubject && emailHtml) {
    await sendEmailIfOffline({
      recipientId,
      recipientEmail,
      subject: emailSubject,
      html:    emailHtml,
    });
  }

  return notif;
};

module.exports = { sendNotification };
