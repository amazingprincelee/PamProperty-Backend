const cron         = require('node-cron');
const EscrowSession= require('../models/EscrowSession');
const HotelBooking = require('../models/HotelBooking');
const { refundEscrow } = require('../services/escrow.service');
const { internalCredit } = require('../services/payment.service');
const { sendNotification } = require('../services/notification.service');
const Property     = require('../models/Property');

const startCronJobs = () => {

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    const now = new Date();

    // ─── AUTO-REFUND ESCROW sessions lister didn't confirm in time ───
    const expiredEscrows = await EscrowSession.find({
      status:          'pending',
      autoRefundDate:  { $lte: now },
    });
    for (const session of expiredEscrows) {
      await refundEscrow(session._id, 'Lister did not confirm in time');
      console.log(`Auto-refunded escrow: ${session._id}`);
    }

    // ─── AUTO-RELEASE ESCROW funds after inspection window ───
    const releasableEscrows = await EscrowSession.find({
      status:           'confirmed',
      autoReleaseDate:  { $lte: now },
    });
    for (const session of releasableEscrows) {
      // Auto-release to lister after window — no platform fee on auto-release
      await internalCredit({
        userId:        session.lister,
        amount:        session.amount,
        description:   'Escrow auto-released after inspection window',
        category:      'escrow_release',
        relatedEscrow: session._id,
      });
      await EscrowSession.findByIdAndUpdate(session._id, { status: 'released', resolvedAt: now });
      console.log(`Auto-released escrow: ${session._id}`);
    }

    // ─── AUTO-REFUND HOTEL BOOKINGS hotel didn't confirm in 2hrs ───
    const expiredBookings = await HotelBooking.find({
      status:       'pending',
      autoRefundAt: { $lte: now },
    }).populate('hotel');

    for (const booking of expiredBookings) {
      await internalCredit({
        userId:              booking.guest,
        amount:              booking.total,
        description:         `Hotel booking auto-refund – ${booking.hotel?.hotelName || 'Hotel'}`,
        category:            'hotel_refund',
        relatedHotelBooking: booking._id,
      });
      await HotelBooking.findByIdAndUpdate(booking._id, { status: 'refunded' });

      await sendNotification({
        recipientId:         booking.guest,
        title:               'Hotel Booking Refunded',
        message:             `The hotel did not confirm your booking in time. ₦${booking.total.toLocaleString()} has been refunded.`,
        type:                'booking',
        relatedHotelBooking: booking._id,
      });
      console.log(`Auto-refunded hotel booking: ${booking._id}`);
    }
  });

  console.log('Cron jobs started.');
};

module.exports = { startCronJobs };
