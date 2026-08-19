/* ============================================
   ADMIN DASHBOARD — Firebase + Real-time Logic
   ============================================ */

/* ============================================
   FIREBASE INITIALIZATION
   ============================================ */
let db = null;
let isConnected = false;

function initFirebase() {
    try {
        if (!window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
            showConfigError();
            return;
        }

        firebase.initializeApp(window.FIREBASE_CONFIG);
        db = firebase.database();

        // Listen to Auth State
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                // Logged in
                document.getElementById('loginOverlay').classList.add('hidden');
                
                // Monitor connection state
                db.ref('.info/connected').on('value', (snap) => {
                    isConnected = snap.val() === true;
                    updateConnectionStatus(isConnected);
                });

                initRequestsListener();
                loadTables();
            } else {
                // Not logged in
                document.getElementById('loginOverlay').classList.remove('hidden');
                updateConnectionStatus(false, 'Not logged in');
                
                // Disconnect database listeners if they exist
                db.ref('.info/connected').off();
                db.ref('verifications').off();
                db.ref('tables').off();
            }
        });

        setupAuthUI();

    } catch (err) {
        console.error('Firebase init error:', err);
        showConfigError();
    }
}

function setupAuthUI() {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminEmail').value;
        const password = document.getElementById('adminPassword').value;
        
        loginBtn.classList.add('loading');
        loginError.classList.add('hidden');
        loginBtn.disabled = true;

        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            // onAuthStateChanged will handle the UI update
        } catch (error) {
            loginError.textContent = error.message;
            loginError.classList.remove('hidden');
        } finally {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
        }
    });

    // Logout Button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            firebase.auth().signOut();
        });
    }
}

function showConfigError() {
    updateConnectionStatus(false, 'Not configured');

    const grid = document.getElementById('requestsGrid');
    grid.innerHTML = `
        <div class="empty-state" style="color: #EF4444;">
            <div class="empty-icon">⚙️</div>
            <h3 style="color: #EF4444;">Firebase Not Configured</h3>
            <p style="color: #8990A5;">
                Open <strong>admin.html</strong> and replace the Firebase config with your project credentials.<br><br>
                <a href="https://console.firebase.google.com" target="_blank"
                   style="color: #C9980A; text-decoration: none;">
                    Open Firebase Console →
                </a>
            </p>
        </div>
    `;
}

function updateConnectionStatus(connected, customText = null) {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');

    if (connected) {
        dot.className = 'status-dot connected';
        text.textContent = 'Live';
    } else {
        dot.className = 'status-dot error';
        text.textContent = customText || 'Disconnected';
    }
}

/* ============================================
   NAVIGATION
   ============================================ */
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;

        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`panel${capitalize(panel)}`).classList.add('active');

        // Update top-bar
        const headings = {
            requests: ['Verification Requests', 'Real-time customer check-ins'],
            qrcodes: ['Table QR Codes', 'Scan to access the digital menu']
        };
        document.getElementById('panelHeading').textContent = headings[panel][0];
        document.getElementById('panelSubtext').textContent = headings[panel][1];

        // Show/hide top-bar buttons
        document.getElementById('clearExpiredBtn').classList.toggle('hidden', panel !== 'requests');
        document.getElementById('clearVerifiedBtn').classList.toggle('hidden', panel !== 'requests');
        document.getElementById('printAllBtn').classList.toggle('hidden', panel !== 'qrcodes');
    });
});

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ============================================
   REQUESTS LISTENER
   ============================================ */
const requestsCache = {}; // requestId → data

function initRequestsListener() {
    if (!db) return;

    // Listen for all verifications, ordered by creation time
    db.ref('verifications').orderByChild('createdAt').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const grid = document.getElementById('requestsGrid');
        const emptyState = document.getElementById('emptyRequests');

        // Check for newly added pending requests
        Object.entries(data).forEach(([id, entry]) => {
            const isNew = !requestsCache[id] && entry.status === 'pending';
            if (isNew) {
                playNotificationSound();
                showAdminToast(`🪑 ${entry.tableName}`, `${entry.customerName} · ${maskPhone(entry.customerPhone)}`);
            }
            requestsCache[id] = entry;
        });

        // Sort by createdAt descending (newest first)
        const sorted = Object.entries(data).sort((a, b) => b[1].createdAt - a[1].createdAt);

        if (sorted.length === 0) {
            emptyState.style.display = 'flex';
            emptyState.style.flexDirection = 'column';
            emptyState.style.alignItems = 'center';
            grid.innerHTML = '';
            grid.appendChild(emptyState);
            updatePendingBadge(0);
            return;
        }

        emptyState.style.display = 'none';

        const pendingCount = sorted.filter(([, e]) => e.status === 'pending').length;
        updatePendingBadge(pendingCount);

        // Re-render all cards
        const fragment = document.createDocumentFragment();

        sorted.forEach(([id, entry]) => {
            const card = createRequestCard(id, entry);
            fragment.appendChild(card);
        });

        grid.innerHTML = '';
        grid.appendChild(fragment);
    });
}

function createRequestCard(id, entry) {
    const card = document.createElement('div');
    card.className = `request-card ${entry.status}`;
    card.dataset.id = id;

    const timeAgo = formatTimeAgo(entry.createdAt);
    const expiresIn = formatExpiry(entry.expiresAt, entry.status);

    let statusEmoji = '⏳';
    let statusLabel = 'Pending';
    if (entry.status === 'verified') { statusEmoji = '✅'; statusLabel = 'Verified'; }
    if (entry.status === 'expired') { statusEmoji = '⌛'; statusLabel = 'Expired'; }

    card.innerHTML = `
        <div class="card-table">🪑 ${entry.tableName || entry.tableId}</div>
        <div class="card-customer">${escHtml(entry.customerName)}</div>
        <div class="card-phone">+91 ${maskPhone(entry.customerPhone)}</div>
        <div class="otp-display">
            <div>
                <div class="otp-label">OTP Code</div>
                <div class="otp-value">${entry.otp}</div>
            </div>
            <span class="status-pill ${entry.status}">${statusEmoji} ${statusLabel}</span>
        </div>
        <div class="card-footer">
            <span class="card-time">${timeAgo} · ${expiresIn}</span>
        </div>
    `;

    return card;
}

function updatePendingBadge(count) {
    const badge = document.getElementById('pendingBadge');
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/* ============================================
   CLEAR EXPIRED & VERIFIED
   ============================================ */
document.getElementById('clearExpiredBtn').addEventListener('click', async () => {
    if (!db) return;
    const snapshot = await db.ref('verifications').orderByChild('status').equalTo('expired').once('value');
    const updates = {};
    snapshot.forEach(child => { updates[child.key] = null; });
    if (Object.keys(updates).length === 0) {
        showAdminToast('ℹ️ Nothing to clear', 'No expired requests found');
        return;
    }
    await db.ref('verifications').update(updates);
    showAdminToast('🗑 Cleared', `Removed ${Object.keys(updates).length} expired request(s)`);
});

document.getElementById('clearVerifiedBtn').addEventListener('click', async () => {
    if (!db) return;
    const snapshot = await db.ref('verifications').orderByChild('status').equalTo('verified').once('value');
    const updates = {};
    snapshot.forEach(child => { updates[child.key] = null; });
    if (Object.keys(updates).length === 0) {
        showAdminToast('ℹ️ Nothing to clear', 'No verified requests found');
        return;
    }
    await db.ref('verifications').update(updates);
    showAdminToast('🧹 Cleared', `Removed ${Object.keys(updates).length} verified request(s)`);
});

/* ============================================
   QR CODE GENERATION
   ============================================ */
let tablesData = {};

async function loadTables() {
    if (!db) return;

    db.ref('tables').on('value', async (snapshot) => {
        tablesData = snapshot.val();
        
        // Fallback: If tables were somehow deleted or not initialized by the server, create them here
        if (!tablesData) {
            const defaultTables = {};
            for (let i = 1; i <= 10; i++) {
                defaultTables[`table_${i}`] = {
                    name: `Table ${i}`,
                    status: 'available'
                };
            }
            try {
                await db.ref('tables').set(defaultTables);
            } catch (e) {
                console.error("Could not create tables:", e);
            }
            return; // The 'on' listener will automatically fire again once set() completes
        }

        renderQRCodes();
    });
}

function renderQRCodes() {
    const grid = document.getElementById('qrGrid');
    const baseUrl = document.getElementById('baseUrlInput').value.trim().replace(/\/$/, '');

    grid.innerHTML = '';

    Object.entries(tablesData).forEach(([tableId, tableInfo]) => {
        const verifyUrl = `${baseUrl}/verify.html?table=${tableId}`;
        const card = createQRCard(tableId, tableInfo.name, verifyUrl);
        grid.appendChild(card);
    });
}

function createQRCard(tableId, tableName, url) {
    const card = document.createElement('div');
    card.className = 'qr-card';

    const qrWrapper = document.createElement('div');
    qrWrapper.className = 'qr-code-wrapper';

    card.innerHTML = `
        <div class="qr-table-name">${escHtml(tableName)}</div>
    `;
    card.appendChild(qrWrapper);

    const urlEl = document.createElement('div');
    urlEl.className = 'qr-url';
    urlEl.textContent = url;

    const actions = document.createElement('div');
    actions.className = 'qr-card-actions';
    actions.innerHTML = `
        <button class="qr-btn download" data-table="${tableId}" data-url="${url}" data-name="${escHtml(tableName)}">
            ⬇ Download
        </button>
    `;

    card.appendChild(urlEl);
    card.appendChild(actions);

    // Generate QR code into the wrapper
    try {
        new QRCode(qrWrapper, {
            text: url,
            width: 140,
            height: 140,
            colorDark: '#1A1410',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (e) {
        qrWrapper.innerHTML = `<div style="width:140px;height:140px;display:flex;align-items:center;justify-content:center;color:#555;font-size:0.7rem;text-align:center;">QR lib error</div>`;
    }

    // Download button
    actions.querySelector('.qr-btn.download').addEventListener('click', () => {
        downloadQRCode(qrWrapper, tableName);
    });

    return card;
}

function downloadQRCode(wrapper, tableName) {
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) {
        showAdminToast('⚠️ Error', 'QR canvas not ready yet');
        return;
    }

    // Add restaurant name + table name to the downloaded image
    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width + 40;
    offCanvas.height = canvas.height + 90;
    const ctx = offCanvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    ctx.drawImage(canvas, 20, 20);

    ctx.fillStyle = '#1A1410';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tableName, offCanvas.width / 2, canvas.height + 46);

    ctx.fillStyle = '#9B8E82';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('Scan to Order', offCanvas.width / 2, canvas.height + 66);

    const link = document.createElement('a');
    link.download = `QR_${tableName.replace(/\s/g, '_')}.png`;
    link.href = offCanvas.toDataURL('image/png');
    link.click();
}

/* ============================================
   UPDATE URL / REGENERATE QR
   ============================================ */
document.getElementById('updateUrlBtn').addEventListener('click', () => {
    renderQRCodes();
    showAdminToast('✅ Updated', 'QR codes regenerated with new URL');
});

document.getElementById('printAllBtn').addEventListener('click', () => {
    // Temporarily show the QR panel for printing
    window.print();
});

/* ============================================
   NOTIFICATIONS
   ============================================ */
function playNotificationSound() {
    // Simple beep using Web Audio API
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        // Audio not available — fail silently
    }
}

let toastTimeout = null;

function showAdminToast(title, msg) {
    const toast = document.getElementById('adminToast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMsg').textContent = msg;

    toast.classList.add('visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
    }, 4500);
}

/* ============================================
   HELPERS
   ============================================ */
function maskPhone(phone) {
    if (!phone || phone.length < 4) return phone;
    return '•'.repeat(phone.length - 4) + phone.slice(-4);
}

function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
}

function formatExpiry(expiresAt, status) {
    if (status === 'verified') return 'Verified ✓';
    if (status === 'expired') return 'Expired';

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expired';
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    return `Expires in ${min}:${sec.toString().padStart(2, '0')}`;
}

function escHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

// Live update of expiry timers every 10 seconds
setInterval(() => {
    document.querySelectorAll('.request-card.pending').forEach(card => {
        const id = card.dataset.id;
        const entry = requestsCache[id];
        if (!entry) return;
        const timeEl = card.querySelector('.card-time');
        if (timeEl) {
            timeEl.textContent = `${formatTimeAgo(entry.createdAt)} · ${formatExpiry(entry.expiresAt, entry.status)}`;
        }
    });
}, 10000);

/* ============================================
   INIT
   ============================================ */
initFirebase();
