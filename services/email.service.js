const nodemailer    = require('nodemailer');
const { isUserOnline } = require('../config/socket');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const CLIENT_URL  = process.env.CLIENT_URL || 'https://pamprop.vercel.app';
const LOGO_URL    = `${CLIENT_URL}/logo-icon.png`;
const BRAND_NAVY  = '#0e1f45';
const BRAND_GOLD  = '#fbbf24';

/* ─────────────────────────────────────────────
   BASE LAYOUT
   Replicates the PampropLogo box styling:
   - Dark navy gradient box, 28% border-radius
   - Gold shield accent dot
   - "pam" white + "prop" gold wordmark
─────────────────────────────────────────────── */
const baseTemplate = ({ title, bodyHtml, ctaText, ctaUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4ff;padding:40px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;">

        <!-- ── HEADER ── -->
        <tr>
          <td align="center" style="
            background:linear-gradient(160deg,#022c22 0%,#080e1e 45%,#0b1a38 100%);
            border-radius:20px 20px 0 0;
            padding:40px 32px 32px;
          ">
            <!-- Logo box (mirrors PampropLogo component) -->
            <div style="display:inline-block;position:relative;margin-bottom:20px;">
              <div style="
                width:72px;height:72px;
                border-radius:20px;
                background:linear-gradient(145deg,#080e1e 0%,#0e1f45 50%,#0b1a38 100%);
                border:1.5px solid rgba(255,255,255,0.18);
                box-shadow:0 8px 32px rgba(14,31,69,0.45);
                display:flex;align-items:center;justify-content:center;
                overflow:hidden;
                text-align:center;
                line-height:72px;
              ">
                <img src="${LOGO_URL}" alt="Pamprop" width="60" height="60"
                  style="width:60px;height:60px;object-fit:contain;display:block;margin:6px auto 0;"/>
              </div>
              <!-- Gold badge dot -->
              <div style="
                position:absolute;bottom:-5px;right:-5px;
                width:22px;height:22px;border-radius:50%;
                background:linear-gradient(135deg,#fbbf24,#f59e0b);
                border:2px solid #fff;
                box-shadow:0 2px 8px rgba(251,191,36,0.5);
                text-align:center;line-height:20px;font-size:11px;
              ">🛡</div>
            </div>

            <!-- Wordmark -->
            <div style="margin-bottom:6px;">
              <span style="font-size:30px;font-weight:900;color:#ffffff;letter-spacing:-1px;">pam</span><span style="font-size:30px;font-weight:900;color:${BRAND_GOLD};letter-spacing:-1px;">prop</span>
            </div>
            <div style="color:rgba(167,243,208,0.85);font-size:12px;font-weight:500;letter-spacing:0.5px;">
              Land · Rent · Stay — All in One
            </div>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="
            background:#ffffff;
            padding:36px 36px 28px;
            border-left:1px solid #e2e8f0;
            border-right:1px solid #e2e8f0;
          ">
            <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:${BRAND_NAVY};letter-spacing:-0.5px;">${title}</h2>
            <div style="font-size:15px;line-height:1.7;color:#334155;">
              ${bodyHtml}
            </div>

            ${ctaText && ctaUrl ? `
            <!-- CTA Button -->
            <div style="margin-top:28px;text-align:center;">
              <a href="${ctaUrl}"
                style="
                  display:inline-block;
                  background:linear-gradient(135deg,${BRAND_NAVY},#1e3a8a);
                  color:#fff;
                  font-size:15px;font-weight:700;
                  padding:14px 36px;
                  border-radius:14px;
                  text-decoration:none;
                  letter-spacing:0.2px;
                  box-shadow:0 4px 16px rgba(14,31,69,0.3);
                ">${ctaText}</a>
            </div>` : ''}
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="
            background:#f8faff;
            border:1px solid #e2e8f0;
            border-top:none;
            border-radius:0 0 20px 20px;
            padding:20px 32px;
            text-align:center;
          ">
            <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">
              This email was sent by <strong style="color:${BRAND_NAVY};">PamProperty</strong> — Property Acquisition &amp; Management
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e1;">
              © ${new Date().getFullYear()} Pamprop. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

/* ─────────────────────────────────────────────
   SEND HELPER
─────────────────────────────────────────────── */
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Pamprop" <${process.env.EMAIL_USER}>`,
      to, subject, html,
    });
  } catch (err) {
    console.error('[Email failed]', err.message);
  }
};

/* ─────────────────────────────────────────────
   SEND ONLY IF USER IS OFFLINE
─────────────────────────────────────────────── */
const sendEmailIfOffline = async ({ recipientId, recipientEmail, subject, html }) => {
  if (!recipientEmail) return;
  if (isUserOnline(recipientId)) return; // user is active — skip email
  await sendEmail({ to: recipientEmail, subject, html });
};

/* ─────────────────────────────────────────────
   EMAIL TEMPLATES
─────────────────────────────────────────────── */
const emailTemplates = {

  welcome: (name) => ({
    subject: 'Welcome to Pamprop!',
    html: baseTemplate({
      title: `Welcome, ${name}! 👋`,
      bodyHtml: `
        <p>Your account has been created successfully. You can now explore thousands of verified properties across Nigeria.</p>
        <p>Here's what you can do on Pamprop:</p>
        <ul style="padding-left:20px;color:#334155;line-height:2;">
          <li>Browse land, rentals &amp; hotel listings</li>
          <li>Book inspections securely with escrow</li>
          <li>Chat directly with property listers</li>
          <li>Get KYC verified to list your own properties</li>
        </ul>
      `,
      ctaText: 'Explore Properties',
      ctaUrl: CLIENT_URL,
    }),
  }),

  newMessage: (senderName, preview) => ({
    subject: `New message from ${senderName}`,
    html: baseTemplate({
      title: `${senderName} sent you a message`,
      bodyHtml: `
        <p>You have a new message from <strong>${senderName}</strong>:</p>
        <div style="
          background:#f8faff;border-left:4px solid ${BRAND_NAVY};
          border-radius:0 12px 12px 0;padding:14px 18px;margin:16px 0;
          font-style:italic;color:#475569;
        ">"${preview}"</div>
        <p>Open the app to reply and continue your conversation.</p>
      `,
      ctaText: 'Reply Now',
      ctaUrl: CLIENT_URL,
    }),
  }),

  escrowCreated: (seekerName, amount, propertyTitle) => ({
    subject: 'New Escrow Request — Action Required',
    html: baseTemplate({
      title: 'New Escrow Request',
      bodyHtml: `
        <p><strong>${seekerName}</strong> has initiated an escrow session for your property:</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Property</div>
          <div style="font-weight:700;color:${BRAND_NAVY};font-size:16px;">${propertyTitle}</div>
          <div style="font-size:13px;color:#64748b;margin-top:10px;">Amount in Escrow</div>
          <div style="font-weight:800;color:#16a34a;font-size:20px;">₦${Number(amount).toLocaleString()}</div>
        </div>
        <p>Please log in to confirm the inspection date and move the session forward.</p>
      `,
      ctaText: 'View Escrow Session',
      ctaUrl: CLIENT_URL,
    }),
  }),

  escrowConfirmed: (listerName, date, time) => ({
    subject: 'Inspection Date Confirmed',
    html: baseTemplate({
      title: 'Inspection Confirmed ✅',
      bodyHtml: `
        <p><strong>${listerName}</strong> has confirmed your inspection date.</p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Date</div>
          <div style="font-weight:700;color:${BRAND_NAVY};font-size:16px;">${date}</div>
          ${time ? `<div style="font-size:13px;color:#64748b;margin-top:8px;">Time</div><div style="font-weight:700;color:${BRAND_NAVY};font-size:15px;">${time}</div>` : ''}
        </div>
        <p>Make sure you're available. You can also reach the lister via chat if you need to reschedule.</p>
      `,
      ctaText: 'Open App',
      ctaUrl: CLIENT_URL,
    }),
  }),

  paymentReleaseRequested: (listerName, propertyTitle) => ({
    subject: 'Payment Release Requested',
    html: baseTemplate({
      title: 'Payment Release Requested',
      bodyHtml: `
        <p><strong>${listerName}</strong> is requesting the release of escrow funds for <strong>${propertyTitle}</strong>.</p>
        <p>If you are satisfied with the inspection, please log in to release the funds. Your funds are safe in escrow until you approve.</p>
      `,
      ctaText: 'Review &amp; Release',
      ctaUrl: CLIENT_URL,
    }),
  }),

  escrowReleased: (amount) => ({
    subject: 'Funds Released to Your Wallet',
    html: baseTemplate({
      title: 'Payment Released 💰',
      bodyHtml: `
        <p>Great news! The escrow funds have been released to your Pamprop wallet.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Amount Received</div>
          <div style="font-weight:900;color:#16a34a;font-size:28px;">₦${Number(amount).toLocaleString()}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">(after 10% platform fee)</div>
        </div>
        <p>You can withdraw your funds or use them for transactions within Pamprop.</p>
      `,
      ctaText: 'View Wallet',
      ctaUrl: CLIENT_URL,
    }),
  }),

  escrowRefunded: (amount) => ({
    subject: 'Escrow Refunded to Your Wallet',
    html: baseTemplate({
      title: 'Refund Processed',
      bodyHtml: `
        <p>Your escrow funds have been refunded to your Pamprop wallet.</p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Amount Refunded</div>
          <div style="font-weight:900;color:#ea580c;font-size:28px;">₦${Number(amount).toLocaleString()}</div>
        </div>
        <p>If you have any questions, please contact our support team.</p>
      `,
      ctaText: 'View Wallet',
      ctaUrl: CLIENT_URL,
    }),
  }),

  kycApproved: (name) => ({
    subject: 'KYC Verification Approved',
    html: baseTemplate({
      title: 'Identity Verified ✅',
      bodyHtml: `
        <p>Hi <strong>${name}</strong>, your identity has been successfully verified on Pamprop.</p>
        <p>You can now:</p>
        <ul style="padding-left:20px;line-height:2;">
          <li>List properties on the platform</li>
          <li>Access all escrow features</li>
          <li>Display the verified badge on your profile</li>
        </ul>
      `,
      ctaText: 'Start Listing',
      ctaUrl: CLIENT_URL,
    }),
  }),

  newHotelBooking: (guestName, roomType, nights, amount) => ({
    subject: 'New Hotel Booking — Confirmation Required',
    html: baseTemplate({
      title: 'New Booking Request 🏨',
      bodyHtml: `
        <p><strong>${guestName}</strong> has booked a room at your hotel.</p>
        <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:13px;color:#64748b;padding-bottom:8px;">Room Type</td><td style="font-weight:700;color:${BRAND_NAVY};text-align:right;">${roomType}</td></tr>
            <tr><td style="font-size:13px;color:#64748b;padding-bottom:8px;">Nights</td><td style="font-weight:700;color:${BRAND_NAVY};text-align:right;">${nights}</td></tr>
            <tr><td style="font-size:13px;color:#64748b;">Amount</td><td style="font-weight:800;color:#16a34a;font-size:16px;text-align:right;">₦${Number(amount).toLocaleString()}</td></tr>
          </table>
        </div>
        <p style="color:#dc2626;font-weight:600;">⚠️ You must confirm within 2 hours or the booking will be automatically refunded.</p>
      `,
      ctaText: 'Confirm Booking Now',
      ctaUrl: CLIENT_URL,
    }),
  }),

  hotelBookingConfirmed: (hotelName, checkIn, checkOut) => ({
    subject: 'Hotel Booking Confirmed',
    html: baseTemplate({
      title: 'Booking Confirmed 🎉',
      bodyHtml: `
        <p>Your hotel booking has been confirmed! Here are your details:</p>
        <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:13px;color:#64748b;padding-bottom:8px;">Hotel</td><td style="font-weight:700;color:${BRAND_NAVY};text-align:right;">${hotelName}</td></tr>
            <tr><td style="font-size:13px;color:#64748b;padding-bottom:8px;">Check-In</td><td style="font-weight:700;color:${BRAND_NAVY};text-align:right;">${checkIn}</td></tr>
            <tr><td style="font-size:13px;color:#64748b;">Check-Out</td><td style="font-weight:700;color:${BRAND_NAVY};text-align:right;">${checkOut}</td></tr>
          </table>
        </div>
        <p>We wish you a pleasant stay! If you have any issues, contact us via the app.</p>
      `,
      ctaText: 'View Booking',
      ctaUrl: CLIENT_URL,
    }),
  }),

  disputeRaised: (raisedBy) => ({
    subject: 'A Dispute Has Been Raised on Your Escrow',
    html: baseTemplate({
      title: 'Dispute Raised',
      bodyHtml: `
        <p><strong>${raisedBy}</strong> has raised a dispute on your shared escrow session.</p>
        <p>Our admin team will review the case and reach a resolution. You may also provide your side of the story through the app.</p>
        <p>Funds remain locked in escrow until the dispute is resolved.</p>
      `,
      ctaText: 'View Dispute',
      ctaUrl: CLIENT_URL,
    }),
  }),

  listingApproved: (listerName, propertyTitle) => ({
    subject: '🎉 Your listing is now live on Pamprop!',
    html: baseTemplate({
      title: 'Listing Approved ✅',
      bodyHtml: `
        <p>Great news, <strong>${listerName}</strong>! Your listing has been reviewed and approved.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Property</div>
          <div style="font-weight:700;color:${BRAND_NAVY};font-size:16px;">${propertyTitle}</div>
          <div style="margin-top:10px;font-size:13px;color:#16a34a;font-weight:600;">✅ Now visible to all seekers</div>
        </div>
        <p>Your property is now live and seekers can book inspections immediately. Keep an eye on your Requests tab for incoming bookings.</p>
      `,
      ctaText: 'View My Listing',
      ctaUrl: CLIENT_URL,
    }),
  }),

  listingRejected: (listerName, propertyTitle, reason) => ({
    subject: 'Your listing needs some changes',
    html: baseTemplate({
      title: 'Listing Update Required',
      bodyHtml: `
        <p>Hi <strong>${listerName}</strong>, we reviewed your listing and need a few changes before it can go live.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin:16px 0;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Property</div>
          <div style="font-weight:700;color:${BRAND_NAVY};font-size:15px;">${propertyTitle}</div>
          <div style="margin-top:12px;font-size:13px;color:#64748b;margin-bottom:4px;">Reason</div>
          <div style="font-weight:600;color:#dc2626;font-size:14px;">${reason}</div>
        </div>
        <p>Please update your listing in the app and resubmit. Our team will re-review it promptly.</p>
      `,
      ctaText: 'Update My Listing',
      ctaUrl: CLIENT_URL,
    }),
  }),

  newFollower: (followerName) => ({
    subject: `${followerName} started following you on Pamprop`,
    html: baseTemplate({
      title: 'New Follower',
      bodyHtml: `
        <p><strong>${followerName}</strong> is now following you on Pamprop.</p>
        <p>They will see your listings in their feed. Keep posting quality properties!</p>
      `,
      ctaText: 'View Your Profile',
      ctaUrl: CLIENT_URL,
    }),
  }),
};

module.exports = { sendEmail, sendEmailIfOffline, emailTemplates };
