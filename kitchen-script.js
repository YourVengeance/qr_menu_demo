// Initialize Firebase
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.database();

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const kdsClock = document.getElementById('kdsClock');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');

// Update Clock
setInterval(() => {
    const now = new Date();
    kdsClock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}, 1000);

// Auth state listener
auth.onAuthStateChanged((user) => {
    if (user) {
        loginOverlay.classList.add('hidden');
        initOrdersListener();
    } else {
        loginOverlay.classList.remove('hidden');
    }
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('kdsEmail').value;
    const pwd = document.getElementById('kdsPassword').value;
    
    loginError.style.display = 'none';
    const submitBtn = loginForm.querySelector('button');
    submitBtn.textContent = 'Logging in...';
    
    try {
        await auth.signInWithEmailAndPassword(email, pwd);
        submitBtn.textContent = 'Access Kitchen Board';
    } catch (err) {
        loginError.textContent = 'Login failed: ' + err.message;
        loginError.style.display = 'block';
        submitBtn.textContent = 'Access Kitchen Board';
    }
});

// Logout
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });
}

// Orders Logic
let initialLoad = true;
let ordersData = {};

function initOrdersListener() {
    db.ref('orders').on('value', (snapshot) => {
        const newData = snapshot.val() || {};
        
        // Check for new pending orders to play sound
        if (!initialLoad) {
            const currentPendingCount = Object.values(ordersData).filter(o => o.status === 'pending').length;
            const newPendingCount = Object.values(newData).filter(o => o.status === 'pending').length;
            
            if (newPendingCount > currentPendingCount) {
                const sound = document.getElementById('orderDing');
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play blocked', e));
            }
        }
        
        ordersData = newData;
        initialLoad = false;
        renderBoard();
    });
}

function renderBoard() {
    const colNew = document.getElementById('colNew');
    const colPrep = document.getElementById('colPrep');
    
    colNew.innerHTML = '';
    colPrep.innerHTML = '';
    
    let newCount = 0;
    let prepCount = 0;
    
    // Sort orders by createdAt (oldest first)
    const sortedOrders = Object.entries(ordersData).sort((a, b) => a[1].createdAt - b[1].createdAt);
    
    sortedOrders.forEach(([id, order]) => {
        if (order.status === 'completed') return;
        
        const card = document.createElement('div');
        
        // Urgent if older than 15 minutes
        const isUrgent = (Date.now() - order.createdAt) > (15 * 60 * 1000);
        card.className = `ticket ${isUrgent ? 'urgent' : ''}`;
        
        const timeStr = new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let itemsHtml = '<ul class="ticket-items">';
        order.items.forEach(item => {
            itemsHtml += `
                <li class="ticket-item">
                    <span><span class="item-qty">${item.qty}x</span> ${item.name}</span>
                </li>
            `;
        });
        itemsHtml += '</ul>';
        
        let actionsHtml = '';
        if (order.status === 'pending') {
            actionsHtml = `
                <button class="btn btn-primary" onclick="updateOrderStatus('${id}', 'preparing')">Start</button>
                <button class="btn" style="background:#555; color:#fff;" onclick="printTicket('${id}')">🖨</button>
            `;
            newCount++;
        } else if (order.status === 'preparing') {
            actionsHtml = `
                <button class="btn btn-success" onclick="updateOrderStatus('${id}', 'completed')">Done</button>
                <button class="btn" style="background:#555; color:#fff;" onclick="printTicket('${id}')">🖨</button>
            `;
            prepCount++;
        }
        
        card.innerHTML = `
            <div class="ticket-header">
                <div class="ticket-table">${order.tableName}</div>
                <div class="ticket-time">${timeStr}</div>
            </div>
            ${itemsHtml}
            <div class="ticket-actions" style="margin-top:12px;">${actionsHtml}</div>
        `;
        
        if (order.status === 'pending') {
            colNew.appendChild(card);
        } else {
            colPrep.appendChild(card);
        }
    });
    
    document.getElementById('newCount').textContent = newCount;
    document.getElementById('prepCount').textContent = prepCount;
}

window.printTicket = function(orderId) {
    const order = ordersData[orderId];
    if (!order) return;
    
    let itemsHtml = '<ul class="ticket-items">';
    order.items.forEach(item => {
        itemsHtml += `
            <li class="ticket-item">
                <span><strong>${item.qty}x</strong> ${item.name}</span>
            </li>
        `;
    });
    itemsHtml += '</ul>';

    const timeStr = new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const printWindow = window.open('', '', 'width=400,height=600');
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Ticket</title>
                <style>
                    @page { margin: 0; }
                    body { font-family: monospace; padding: 10px; margin: 0; color: #000; font-size: 14px; }
                    .ticket-header { border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; text-align: center; }
                    .ticket-table { font-size: 24px; font-weight: bold; margin-bottom: 4px; }
                    .ticket-time { font-size: 14px; }
                    .ticket-items { list-style: none; padding: 0; margin: 0; }
                    .ticket-item { display: flex; justify-content: space-between; font-size: 16px; margin-bottom: 8px; }
                    .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="ticket-header">
                    <div class="ticket-table">${order.tableName}</div>
                    <div class="ticket-time">Order Time: ${timeStr}</div>
                </div>
                ${itemsHtml}
                <div class="divider"></div>
                <div style="text-align:center;">Kitchen Ticket</div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    // Use a slight timeout to ensure styles load
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
};

window.updateOrderStatus = async function(orderId, newStatus) {
    try {
        await db.ref(`orders/${orderId}`).update({
            status: newStatus,
            updatedAt: Date.now()
        });
    } catch (err) {
        console.error('Failed to update status:', err);
    }
};
