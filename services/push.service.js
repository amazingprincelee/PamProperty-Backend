// FCM Push Notifications via firebase-admin
// Requires:
//   npm install firebase-admin  (in backend/)
//   backend/config/firebase-service-account.json  (from Firebase console → Project Settings → Service Accounts)

let admin    = null;
let isReady  = false;

function init() {
  if (isReady) return;
  try {
    const serviceAccount = require('../config/firebase-service-account.json');
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    isReady = true;
    console.log('[FCM] Firebase Admin initialized');
  } catch (_) {
    // firebase-admin not installed or service account missing — push silently disabled
  }
}

/**
 * Send an FCM push notification to a single device token.
 * Silently no-ops if Firebase is not configured.
 */
async function sendPush({ token, title, body, data = {} }) {
  init();
  if (!isReady || !token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'pamproperty_default' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });
  } catch (err) {
    // Token expired / invalid — clear it from the user
    if (err.code === 'messaging/registration-token-not-registered') {
      const User = require('../models/User');
      await User.updateOne({ fcmToken: token }, { fcmToken: null }).catch(() => {});
    } else {
      console.error('[FCM] sendPush error:', err.message);
    }
  }
}

/**
 * Broadcast an FCM push to many device tokens (batches of 500).
 * Returns { successCount, failureCount }.
 */
async function sendMulticast({ tokens, title, body, data = {} }) {
  init();
  if (!isReady || !tokens?.length) return { successCount: 0, failureCount: tokens?.length || 0 };

  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  let successCount = 0, failureCount = 0;
  const invalidTokens = [];

  for (const chunk of chunks) {
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: stringData,
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'pamproperty_default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });
      successCount += res.successCount;
      failureCount += res.failureCount;
      res.responses.forEach((r, i) => {
        if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(chunk[i]);
        }
      });
    } catch (err) {
      console.error('[FCM] sendMulticast error:', err.message);
      failureCount += chunk.length;
    }
  }

  if (invalidTokens.length) {
    const User = require('../models/User');
    await User.updateMany({ fcmToken: { $in: invalidTokens } }, { fcmToken: null }).catch(() => {});
  }

  return { successCount, failureCount };
}

module.exports = { sendPush, sendMulticast };
