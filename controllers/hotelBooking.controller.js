const HotelBooking = require('../models/HotelBooking');
const Property     = require('../models/Property');
const User         = require('../models/User');
const { debitWallet, internalCredit } = require('../services/payment.service');
const { sendNotification }            = require('../services/notification.service');
const { emailTemplates }              = require('../services/email.service');
const { ok, fail } = require('../utils/response');

const PLATFORM_FEE_RATE = 0.10;

// POST /api/hotel-bookings
const createBooking = async (req, res) => {
  try {
    const { hotelId, roomType, checkIn, checkOut } = req.body;

    const hotel = await Property.findById(hotelId).populate('listedBy');
    if (!hotel || hotel.type !== 'hotel') return fail(res, 'Hotel not found.', 404);

    const room = hotel.rooms.find(r => r.type === roomType && r.available);
    if (!room) return fail(res, 'Room not available.', 400);

    const checkInDate  = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    if (nights < 1) return fail(res, 'Invalid dates.', 400);

    const roomCost    = room.pricePerNight * nights;
    const platformFee = Math.round(roomCost * PLATFORM_FEE_RATE);
    const total       = roomCost + platformFee;

    // Debit guest wallet
    await debitWallet({
      userId:              req.user._id,
      amount:              total,
      description:         `Hotel booking – ${hotel.hotelName || hotel.title} (${roomType})`,
      category:            'hotel_payment',
      relatedProperty:     hotelId,
    });

    // Auto-refund deadline: 2 hours from now if hotel doesn't confirm
    const autoRefundAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const booking = await HotelBooking.create({
      hotel:        hotelId,
      guest:        req.user._id,
      roomType,
      pricePerNight: room.pricePerNight,
      checkIn:      checkInDate,
      checkOut:     checkOutDate,
      nights,
      roomCost,
      platformFee,
      total,
      autoRefundAt,
      status:       'pending',
    });

    // Notify hotel owner
    const et1 = emailTemplates.newHotelBooking(req.user.name, hotel.hotelName || hotel.title, roomType, nights);
    await sendNotification({
      recipientId:         hotel.listedBy._id,
      recipientEmail:      hotel.listedBy.email,
      title:               'New Hotel Booking',
      message:             `${req.user.name} booked a ${roomType} room for ${nights} night(s). Confirm within 2 hours or funds will be refunded.`,
      type:                'booking',
      relatedHotelBooking: booking._id,
      emailSubject:        et1.subject,
      emailHtml:           et1.html,
      whatsappEnabled:     true,
    });

    return ok(res, { booking }, 'Booking placed. Awaiting hotel confirmation.', 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

// GET /api/hotel-bookings/:id
const getBooking = async (req, res) => {
  try {
    const booking = await HotelBooking.findById(req.params.id)
      .populate('hotel', 'hotelName title images')
      .populate('guest', 'name email phone');
    if (!booking) return fail(res, 'Booking not found.', 404);
    return ok(res, { booking });
  } catch (err) {
    return fail(res, err.message);
  }
};

// GET /api/hotel-bookings/my
const getMyBookings = async (req, res) => {
  try {
    const bookings = await HotelBooking.find({ guest: req.user._id })
      .populate('hotel', 'hotelName title images location')
      .sort({ createdAt: -1 });
    return ok(res, { bookings });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/hotel-bookings/:id/confirm — hotel owner confirms
const confirmBooking = async (req, res) => {
  try {
    const booking = await HotelBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed', confirmedAt: new Date() },
      { new: true }
    ).populate('guest hotel');

    const et2 = emailTemplates.hotelBookingConfirmed(
      booking.hotel.hotelName || booking.hotel.title,
      booking.checkIn.toDateString(),
      booking.checkOut.toDateString()
    );
    await sendNotification({
      recipientId:         booking.guest._id,
      recipientEmail:      booking.guest.email,
      title:               'Booking Confirmed',
      message:             `Your booking at ${booking.hotel.hotelName || booking.hotel.title} has been confirmed.`,
      type:                'booking',
      relatedHotelBooking: booking._id,
      emailSubject:        et2.subject,
      emailHtml:           et2.html,
      whatsappEnabled:     true,
    });

    return ok(res, { booking }, 'Booking confirmed.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/hotel-bookings/:id/checkin
const checkIn = async (req, res) => {
  try {
    const booking = await HotelBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'checked_in', checkedInAt: new Date() },
      { new: true }
    );
    return ok(res, { booking }, 'Checked in.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/hotel-bookings/:id/checkout
const checkOut = async (req, res) => {
  try {
    const booking = await HotelBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'checked_out', checkedOutAt: new Date() },
      { new: true }
    );
    return ok(res, { booking }, 'Checked out. Guest can now release funds.');
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/hotel-bookings/:id/release — guest releases funds to hotel
const releaseFunds = async (req, res) => {
  try {
    const booking = await HotelBooking.findById(req.params.id).populate('hotel');
    if (!booking) return fail(res, 'Booking not found.', 404);
    if (booking.status !== 'checked_out') return fail(res, 'Guest must check out first.', 400);

    const hotel = await Property.findById(booking.hotel._id).populate('listedBy');
    const listerAmount = booking.roomCost; // platform fee already deducted at booking time

    await internalCredit({
      userId:              hotel.listedBy._id,
      amount:              listerAmount,
      description:         `Hotel booking payout – ${hotel.hotelName || hotel.title}`,
      category:            'escrow_release',
      relatedHotelBooking: booking._id,
    });

    await HotelBooking.findByIdAndUpdate(req.params.id, { status: 'released', releasedAt: new Date() });

    const et3 = emailTemplates.escrowReleased(listerAmount);
    await sendNotification({
      recipientId:         hotel.listedBy._id,
      recipientEmail:      hotel.listedBy.email,
      title:               'Booking Funds Released',
      message:             `₦${listerAmount.toLocaleString()} has been released to your wallet.`,
      type:                'payment',
      relatedHotelBooking: booking._id,
      emailSubject:        et3.subject,
      emailHtml:           et3.html,
      whatsappEnabled:     true,
    });

    return ok(res, {}, 'Funds released to hotel.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { createBooking, getBooking, getMyBookings, confirmBooking, checkIn, checkOut, releaseFunds };
