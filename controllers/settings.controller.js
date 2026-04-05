const PlatformSettings = require('../models/PlatformSettings');
const { ok, fail }     = require('../utils/response');

const DEFAULT_SETTINGS = [
  { key: 'inspection_fee',         value: 5000,  label: 'Inspection Fee (₦)',          description: 'Fee paid by seeker to book a rental inspection' },
  { key: 'inspection_system_cut',  value: 1000,  label: 'Inspection System Cut (₦)',   description: 'Amount system keeps from inspection fee' },
  { key: 'bush_entry_fee',         value: 50000, label: 'Bush Entry Fee (₦)',           description: 'Fee paid by buyer to inspect land' },
  { key: 'bush_entry_system_cut',  value: 5000,  label: 'Bush Entry System Cut (₦)',   description: 'Amount system keeps from bush entry fee' },
  { key: 'hotel_commission_pct',   value: 5,     label: 'Hotel Commission (%)',         description: 'Platform commission on each hotel booking' },
  { key: 'referrer_bonus_pct',     value: 20,    label: 'Referrer Bonus (% of cut)',   description: 'Percentage of system cut paid to referrer' },
];

// Seed defaults if they don't exist
const seedDefaults = async () => {
  for (const s of DEFAULT_SETTINGS) {
    await PlatformSettings.findOneAndUpdate({ key: s.key }, s, { upsert: true, new: true });
  }
};

// GET /api/admin/settings
const getSettings = async (req, res) => {
  try {
    await seedDefaults();
    const settings = await PlatformSettings.find().sort({ key: 1 });
    return ok(res, { settings });
  } catch (err) {
    return fail(res, err.message);
  }
};

// PUT /api/admin/settings
const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body; // Array of { key, value }
    if (!Array.isArray(settings)) return fail(res, 'settings must be an array.', 400);

    const updated = [];
    for (const { key, value } of settings) {
      const doc = await PlatformSettings.findOneAndUpdate({ key }, { value }, { new: true });
      if (doc) updated.push(doc);
    }
    return ok(res, { updated }, 'Settings updated.');
  } catch (err) {
    return fail(res, err.message, 400);
  }
};

module.exports = { getSettings, updateSettings, seedDefaults };
