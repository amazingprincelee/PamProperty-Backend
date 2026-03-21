const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Pamprop" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
};

const emailTemplates = {
  welcome: (name) => ({
    subject: 'Welcome to Pamprop!',
    html: `<h2>Welcome, ${name}!</h2><p>Your account has been created successfully. Start exploring properties on Pamprop.</p>`,
  }),
  escrowCreated: (seekerName, amount, propertyTitle) => ({
    subject: 'Escrow Deposit Initiated',
    html: `<h2>Escrow Created</h2><p>${seekerName} has placed ₦${amount.toLocaleString()} in escrow for <strong>${propertyTitle}</strong>. Please confirm the inspection date.</p>`,
  }),
  escrowConfirmed: (listerName, date, time) => ({
    subject: 'Inspection Date Confirmed',
    html: `<h2>Inspection Confirmed</h2><p>${listerName} has confirmed your inspection for <strong>${date}</strong> at <strong>${time}</strong>.</p>`,
  }),
  escrowReleased: (amount) => ({
    subject: 'Funds Released to Your Wallet',
    html: `<h2>Payment Released</h2><p>₦${amount.toLocaleString()} has been released to your Pamprop wallet.</p>`,
  }),
  escrowRefunded: (amount) => ({
    subject: 'Escrow Refunded',
    html: `<h2>Refund Processed</h2><p>₦${amount.toLocaleString()} has been refunded to your Pamprop wallet.</p>`,
  }),
  hotelBookingConfirmed: (hotelName, checkIn, checkOut) => ({
    subject: 'Hotel Booking Confirmed',
    html: `<h2>Booking Confirmed</h2><p>Your booking at <strong>${hotelName}</strong> from <strong>${checkIn}</strong> to <strong>${checkOut}</strong> has been confirmed.</p>`,
  }),
};

module.exports = { sendEmail, emailTemplates };
