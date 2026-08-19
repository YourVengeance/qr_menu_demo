/* ============================================
   QR MENU SERVER — Express + Firebase
   OTP Verification System
   ============================================ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./firebase-config');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (menu, verify page, admin, etc.)
app.use(express.static(path.join(__dirname)));

// Admin dashboard route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

/* ============================================
   HELPERS
   ============================================ */
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/* ============================================
   API ROUTES
   ============================================ */

/**
 * POST /api/verify/request
 * Customer submits name + phone + tableId
 * → Generates OTP, stores in Firebase, returns requestId
 */
const rateLimit = require('express-rate-limit');

const otpLimiter = rateLimit({
    windowMs: 3 * 60 * 1000, // 3 minutes
    max: 5, // Limit each IP to 5 requests per `window` (here, per 3 minutes)
    message: { error: 'Too many OTP requests. Please try again in a few minutes.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.post('/api/verify/request', otpLimiter, async (req, res) => {
    try {
        const { name, phone, tableId } = req.body;

        if (!name || !phone || !tableId) {
            return res.status(400).json({ error: 'Name, phone number, and table ID are required.' });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
        }

        // Check table exists
        const tableSnap = await db.ref(`tables/${tableId}`).once('value');
        if (!tableSnap.exists()) {
            return res.status(404).json({ error: 'Invalid table. Please scan the correct QR code.' });
        }

        const otp = generateOTP();
        const now = Date.now();
        const expiresAt = now + 10 * 60 * 1000; // 10 minutes

        const requestRef = db.ref('verifications').push();
        const requestId = requestRef.key;

        await requestRef.set({
            tableId,
            tableName: tableSnap.val().name || tableId,
            customerName: name,
            customerPhone: phone,
            otp,
            status: 'pending',
            createdAt: now,
            expiresAt
        });

        console.log(`[OTP] ${tableSnap.val().name} | ${name} | ${phone} | OTP: ${otp}`);

        res.json({ requestId, expiresAt });
    } catch (error) {
        console.error('Error creating verification request:', error);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

/**
 * POST /api/verify/validate
 * Customer submits requestId + OTP
 * → Validates OTP, returns session token
 */
app.post('/api/verify/validate', async (req, res) => {
    try {
        const { requestId, otp } = req.body;

        if (!requestId || !otp) {
            return res.status(400).json({ error: 'Request ID and OTP are required.' });
        }

        const snapshot = await db.ref(`verifications/${requestId}`).once('value');
        const data = snapshot.val();

        if (!data) {
            return res.status(404).json({ error: 'Verification request not found.' });
        }

        if (data.status === 'verified') {
            return res.status(400).json({ error: 'This request has already been verified.' });
        }

        if (data.status === 'expired' || Date.now() > data.expiresAt) {
            if (data.status !== 'expired') {
                await db.ref(`verifications/${requestId}`).update({ status: 'expired' });
            }
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        if (data.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP. Please check with the restaurant staff.' });
        }

        // OTP valid — generate session
        const sessionToken = generateToken();
        await db.ref(`verifications/${requestId}`).update({
            status: 'verified',
            sessionToken,
            verifiedAt: Date.now()
        });

        console.log(`[VERIFIED] ${data.tableName} | ${data.customerName}`);

        res.json({
            sessionToken,
            tableId: data.tableId,
            tableName: data.tableName,
            customerName: data.customerName
        });
    } catch (error) {
        console.error('Error validating OTP:', error);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

/**
 * GET /api/verify/session?token=xxx
 * Validates a session token
 */
app.get('/api/verify/session', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.status(401).json({ valid: false });
        }

        const snapshot = await db.ref('verifications')
            .orderByChild('sessionToken')
            .equalTo(token)
            .limitToFirst(1)
            .once('value');

        const data = snapshot.val();
        if (!data) {
            return res.status(401).json({ valid: false });
        }

        const entry = Object.values(data)[0];
        if (entry.status !== 'verified') {
            return res.status(401).json({ valid: false });
        }

        res.json({
            valid: true,
            tableId: entry.tableId,
            tableName: entry.tableName,
            customerName: entry.customerName
        });
    } catch (error) {
        console.error('Error validating session:', error);
        res.status(500).json({ valid: false });
    }
});

/**
 * GET /api/tables
 * Returns all configured tables
 */
app.get('/api/tables', async (req, res) => {
    try {
        const snapshot = await db.ref('tables').once('value');
        res.json(snapshot.val() || {});
    } catch (error) {
        console.error('Error fetching tables:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

/* ============================================
   INITIALIZATION
   ============================================ */

// Create default tables if none exist
async function initDefaultTables() {
    try {
        const snapshot = await db.ref('tables').once('value');
        if (!snapshot.exists()) {
            const defaults = {};
            for (let i = 1; i <= 10; i++) {
                defaults[`table_${i}`] = { name: `Table ${i}`, active: true };
            }
            await db.ref('tables').set(defaults);
            console.log('✅ Created 10 default tables');
        } else {
            const count = Object.keys(snapshot.val()).length;
            console.log(`✅ ${count} tables loaded`);
        }
    } catch (error) {
        console.error('Error initializing tables:', error);
    }
}

// Periodic cleanup: expire old pending OTPs
setInterval(async () => {
    try {
        const now = Date.now();
        const snapshot = await db.ref('verifications')
            .orderByChild('status')
            .equalTo('pending')
            .once('value');

        const updates = {};
        snapshot.forEach(child => {
            const data = child.val();
            if (data.expiresAt && now > data.expiresAt) {
                updates[`verifications/${child.key}/status`] = 'expired';
            }
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
            console.log(`[CLEANUP] Expired ${Object.keys(updates).length} OTP(s)`);
        }
    } catch (error) {
        // Silent cleanup failure
    }
}, 60 * 1000); // Every 60 seconds

/* ============================================
   START SERVER (Local only)
   ============================================ */
const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, async () => {
        await initDefaultTables();
        console.log('');
        console.log('🍽️  The Garden Bistro — QR Menu Server');
        console.log('────────────────────────────────────────');
        console.log(`   Menu:      http://localhost:${PORT}`);
        console.log(`   Admin:     http://localhost:${PORT}/admin`);
        console.log(`   Verify:    http://localhost:${PORT}/verify.html?table=table_1`);
        console.log('');
    });
} else {
    // When imported as a module (e.g. by Vercel), initialize tables in the background
    initDefaultTables();
}

// Export for Vercel
module.exports = app;
