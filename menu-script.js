/* ============================================
   QR DIGITAL MENU — Cart + Qty + Search
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
    await verifySession();
    initCategoryFilter();
    initSearch();
    initQuantityControls();
    initCart();
    initAnimations();
});

/* ============================================
   SESSION VERIFICATION GATE
   ============================================ */
async function verifySession() {
    const overlay = document.getElementById('sessionOverlay');

    try {
        const raw = sessionStorage.getItem('qrMenuSession');
        if (!raw) {
            redirectToVerify();
            return;
        }

        const session = JSON.parse(raw);
        if (!session || !session.token) {
            redirectToVerify();
            return;
        }

        // Validate token with server
        const res = await fetch(`/api/verify/session?token=${encodeURIComponent(session.token)}`);
        const data = await res.json();

        if (!data.valid) {
            sessionStorage.removeItem('qrMenuSession');
            redirectToVerify();
            return;
        }

        // Session valid — show table badge and hide overlay
        const tableBadge = document.getElementById('tableBadge');
        const tableLabel = document.getElementById('tableLabel');

        if (tableBadge && tableLabel) {
            tableLabel.textContent = data.tableName || session.tableName || 'Your Table';
            tableBadge.style.display = 'inline-flex';
        }

    } catch (err) {
        // Network error — if we have a local session, allow access (offline-tolerant)
        const raw = sessionStorage.getItem('qrMenuSession');
        if (!raw) {
            redirectToVerify();
            return;
        }
        console.warn('Session check failed (offline?). Allowing cached session.');
    }

    // Hide overlay — menu is accessible
    if (overlay) overlay.style.display = 'none';
}

function redirectToVerify() {
    // Preserve the table param if somehow passed directly
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    const dest = table ? `verify.html?table=${table}` : 'verify.html';
    window.location.replace(dest);
}



/* ============================================
   CATEGORY FILTER
   ============================================ */
function initCategoryFilter() {
    const tabs = document.querySelectorAll('.cat-tab');
    const sections = document.querySelectorAll('.menu-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const category = tab.dataset.category;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Clear search
            const searchInput = document.getElementById('searchInput');
            if (searchInput.value) {
                searchInput.value = '';
                document.getElementById('searchClear').classList.remove('visible');
                document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('hidden'));
            }

            if (category === 'all') {
                sections.forEach(s => {
                    s.classList.remove('hidden');
                    animateItems(s);
                });
            } else {
                sections.forEach(s => {
                    if (s.dataset.section === category) {
                        s.classList.remove('hidden');
                        animateItems(s);
                    } else {
                        s.classList.add('hidden');
                    }
                });
            }

            document.getElementById('noResults').classList.remove('visible');
            document.getElementById('menuContent').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

/* ============================================
   SEARCH
   ============================================ */
function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const noResults = document.getElementById('noResults');
    let debounceTimer;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = searchInput.value.trim().toLowerCase();
            searchClear.classList.toggle('visible', query.length > 0);

            if (query === '') {
                resetSearch();
                return;
            }

            // Reset to "All" category
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-category="all"]').classList.add('active');
            document.querySelectorAll('.menu-section').forEach(s => s.classList.remove('hidden'));

            let visibleCount = 0;
            document.querySelectorAll('.menu-item').forEach(item => {
                const name = item.dataset.name.toLowerCase();
                const desc = item.querySelector('.item-desc').textContent.toLowerCase();
                const matches = name.includes(query) || desc.includes(query);
                item.classList.toggle('hidden', !matches);
                if (matches) visibleCount++;
            });

            document.querySelectorAll('.menu-section').forEach(section => {
                const visible = section.querySelectorAll('.menu-item:not(.hidden)');
                section.classList.toggle('hidden', visible.length === 0);
            });

            noResults.classList.toggle('visible', visibleCount === 0);
        }, 200);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.remove('visible');
        resetSearch();
        searchInput.focus();
    });
}

function resetSearch() {
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('hidden'));
    document.querySelectorAll('.menu-section').forEach(s => s.classList.remove('hidden'));
    document.getElementById('noResults').classList.remove('visible');
}

/* ============================================
   QUANTITY CONTROLS
   ============================================ */
function initQuantityControls() {
    document.querySelectorAll('.menu-item').forEach(item => {
        const minusBtn = item.querySelector('.qty-minus');
        const plusBtn = item.querySelector('.qty-plus');
        const qtyDisplay = item.querySelector('.qty-value');

        minusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            let qty = parseInt(qtyDisplay.textContent);
            if (qty > 0) {
                qty--;
                qtyDisplay.textContent = qty;
                updateItemState(item, qty);
                updateCart();
            }
        });

        plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            let qty = parseInt(qtyDisplay.textContent);
            if (qty < 10) {
                qty++;
                qtyDisplay.textContent = qty;
                updateItemState(item, qty);
                updateCart();
            }
        });
    });
}

function updateItemState(item, qty) {
    const qtyDisplay = item.querySelector('.qty-value');
    if (qty > 0) {
        item.classList.add('in-cart');
        qtyDisplay.classList.add('has-value');
    } else {
        item.classList.remove('in-cart');
        qtyDisplay.classList.remove('has-value');
    }
}

/* ============================================
   CART
   ============================================ */
function initCart() {
    const floatingCart = document.getElementById('floatingCart');
    const floatingCartBtn = document.getElementById('floatingCartBtn');
    const cartOverlay = document.getElementById('cartOverlay');
    const cartClose = document.getElementById('cartClose');
    const cartDrawer = document.getElementById('cartDrawer');

    floatingCartBtn.addEventListener('click', openCart);
    cartOverlay.addEventListener('click', closeCart);
    cartClose.addEventListener('click', closeCart);

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCart();
    });
}

function openCart() {
    document.getElementById('cartOverlay').classList.add('visible');
    document.getElementById('cartDrawer').classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cartOverlay').classList.remove('visible');
    document.getElementById('cartDrawer').classList.remove('visible');
    document.body.style.overflow = '';
}

function updateCart() {
    const items = document.querySelectorAll('.menu-item');
    const cartItemsContainer = document.getElementById('cartItems');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartFooter = document.getElementById('cartFooter');
    const floatingCart = document.getElementById('floatingCart');
    const floatingCount = document.getElementById('floatingCount');
    const floatingTotal = document.getElementById('floatingTotal');
    const cartTotalPrice = document.getElementById('cartTotalPrice');

    let totalItems = 0;
    let totalPrice = 0;
    let cartHTML = '';

    items.forEach(item => {
        const qty = parseInt(item.querySelector('.qty-value').textContent);
        if (qty > 0) {
            const name = item.dataset.name;
            const price = parseInt(item.dataset.price);
            const type = item.dataset.type;
            const subtotal = price * qty;

            totalItems += qty;
            totalPrice += subtotal;

            let symbolClass = 'veg-symbol';
            if (type === 'nonveg') symbolClass = 'nonveg-symbol';
            if (type === 'egg') symbolClass = 'egg-symbol';

            cartHTML += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name"><span class="food-symbol ${symbolClass}"></span>${name}</div>
                        <div class="cart-item-meta">₹${price} × ${qty}</div>
                    </div>
                    <div class="cart-item-price">₹${subtotal}</div>
                </div>
            `;
        }
    });

    // Update cart drawer
    cartItemsContainer.innerHTML = cartHTML;
    cartEmpty.classList.toggle('visible', totalItems === 0);
    cartFooter.classList.toggle('visible', totalItems > 0);
    cartTotalPrice.textContent = `₹${totalPrice}`;

    // Update floating bar
    floatingCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    floatingTotal.textContent = `₹${totalPrice}`;
    floatingCart.classList.toggle('visible', totalItems > 0);
}

/* ============================================
   ANIMATIONS
   ============================================ */
function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateItems(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.menu-section').forEach(section => {
        observer.observe(section);
    });
}

function animateItems(section) {
    const items = section.querySelectorAll('.menu-item');
    items.forEach((item, i) => {
        item.style.animation = 'none';
        item.offsetHeight;
        item.style.animation = `fadeUp 0.4s var(--ease) ${i * 0.06}s both`;
    });
}
