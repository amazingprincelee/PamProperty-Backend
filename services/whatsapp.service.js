// Meta WhatsApp Cloud API — free tier: 1,000 conversations/month
// Setup:
//   1. Create a Meta Business account → business.facebook.com
//   2. Add a WhatsApp product to a Meta app → developers.facebook.com
//   3. Get a test phone number (free) or add your real business number
//   4. Copy the WHATSAPP_TOKEN (System User access token) and WHATSAPP_PHONE_ID
//   5. Add to backend/.env:
//      WHATSAPP_TOKEN=your_permanent_access_token
//      WHATSAPP_PHONE_ID=your_phone_number_id

/**
 * Send a plain-text WhatsApp message.
 * @param {string} to      - recipient phone number (any format, e.g. 08012345678 or +2348012345678)
 * @param {string} message - text message body
 */
async function sendWhatsApp({ to, message }) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return; // Not configured — silently skip

  // Normalise Nigerian number to international format (2348XXXXXXXXX)
  let phone = to.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '234' + phone.slice(1);
  if (!phone.startsWith('234')) phone = '234' + phone;
  if (phone.length < 12) return; // Invalid number

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   phone,
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('[WhatsApp] API error:', err?.error?.message);
    }
  } catch (err) {
    console.error('[WhatsApp] sendWhatsApp error:', err.message);
  }
}

module.exports = { sendWhatsApp };
