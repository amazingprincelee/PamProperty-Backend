const Notification  = require('../models/Notification');
const User          = require('../models/User');
const { getIO }     = require('../config/socket');
const { sendEmailIfOffline } = require('./email.service');
const { sendPush }  = require('./push.service');
const { sendWhatsApp } = require('./whatsapp.service');

const sendNotification = async ({
  recipientId, recipientEmail,
  title, message, type = 'system',
  relatedEscrow, relatedHotelBooking, relatedProperty, relatedConversation, relatedUser,
  emailSubject, emailHtml,
  // Optional overrides — set to false to suppress a channel for a specific notification
  pushEnabled      = true,
  whatsappEnabled  = false, // opt-in — only send WhatsApp for critical events
  whatsappMessage  = null,  // custom WhatsApp text (falls back to `message`)
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
    relatedUser:         relatedUser         || null,
  });

  // 2. Push real-time via Socket.io
  try {
    const io = getIO();
    io.to(recipientId.toString()).emit('notification', notif);
  } catch (_) {}

  // 3. FCM push notification
  if (pushEnabled) {
    try {
      const user = await User.findById(recipientId).select('fcmToken').lean();
      if (user?.fcmToken) {
        await sendPush({ token: user.fcmToken, title, body: message, data: { type, notifId: notif._id.toString() } });
      }
    } catch (_) {}
  }

  // 4. WhatsApp (only for critical events — caller must explicitly set whatsappEnabled: true)
  if (whatsappEnabled) {
    try {
      const user = await User.findById(recipientId).select('phone').lean();
      if (user?.phone) {
        await sendWhatsApp({ to: user.phone, message: whatsappMessage || `*${title}*\n${message}` });
      }
    } catch (_) {}
  }

  // 5. Email only if user is offline and email details are provided
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
