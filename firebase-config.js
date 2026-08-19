/* ============================================
   Firebase Admin SDK Configuration
   ============================================
   
   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create a new project (or use an existing one)
   3. Enable "Realtime Database" (Build → Realtime Database → Create Database)
      - Choose a location closest to you
      - Start in "test mode" for development
   4. Go to Project Settings → Service Accounts
   5. Click "Generate New Private Key" → downloads a JSON file
   6. Rename the downloaded file to "serviceAccountKey.json"
   7. Place it in this directory (qr-menu-demo/)
   8. Update the databaseURL below with YOUR project's database URL
      (found at: Realtime Database → top of the page, looks like https://your-project-default-rtdb.firebaseio.com)

   ⚠️  NEVER commit serviceAccountKey.json to version control!
   ============================================ */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccount;

// When on Vercel, we can't upload the JSON file, so we read it from an Environment Variable
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error('\n❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env variable!');
        process.exit(1);
    }
} else {
    // Local development: read from the file
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
       console.error('\n❌  Firebase service account key not found!');
       console.error('    Please follow the setup instructions in firebase-config.js');
       console.error(`    Expected file: ${keyPath}\n`);
       process.exit(1);
    }
    serviceAccount = require(keyPath);
}

admin.initializeApp({
   credential: admin.credential.cert(serviceAccount),
   // ⚠️ REPLACE with YOUR database URL from Firebase Console
   databaseURL: 'https://hotel-ca71b-default-rtdb.asia-southeast1.firebasedatabase.app'
});

const db = admin.database();

module.exports = { db, admin };
