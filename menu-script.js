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
    fetchMyBill();
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
                    if (s.dataset.section === 'mybill') {
                        s.classList.add('hidden');
                    } else {
                        s.classList.remove('hidden');
                        animateItems(s);
                    }
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

/* ============================================
   SLIDE TO ORDER LOGIC
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
    const thumb = document.getElementById('cartSliderThumb');
    const wrapper = document.getElementById('cartSliderWrapper');
    const bg = document.getElementById('cartSliderBg');
    const text = document.getElementById('cartSliderText');
    const successOverlay = document.getElementById('orderSuccessOverlay');
    
    if (!thumb || !wrapper) return;

    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    let maxDrag = 0;
    let isProcessing = false;

    function onDragStart(e) {
        if (isProcessing) return;
        isDragging = true;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        maxDrag = wrapper.offsetWidth - thumb.offsetWidth - 8; // 4px padding on each side
        thumb.style.transition = 'none';
        bg.style.transition = 'none';
    }

    function onDragMove(e) {
        if (!isDragging || isProcessing) return;
        const x = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        currentX = Math.max(0, Math.min(x - startX, maxDrag));
        
        thumb.style.transform = `translateX(${currentX}px)`;
        bg.style.width = `${currentX + (thumb.offsetWidth / 2)}px`;

        if (currentX > maxDrag * 0.8) {
            text.style.color = '#fff';
        } else {
            text.style.color = '';
        }

        // Trigger order if reached the end
        if (currentX >= maxDrag - 2) {
            isDragging = false;
            placeOrder();
        }
    }

    function onDragEnd() {
        if (!isDragging || isProcessing) return;
        isDragging = false;
        
        // Snap back
        thumb.style.transition = 'transform 0.3s var(--ease)';
        bg.style.transition = 'width 0.3s var(--ease)';
        thumb.style.transform = 'translateX(0)';
        bg.style.width = '0';
        text.style.color = '';
    }

    thumb.addEventListener('mousedown', onDragStart);
    thumb.addEventListener('touchstart', onDragStart, { passive: true });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('touchmove', onDragMove, { passive: false });

    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);

    async function placeOrder() {
        isProcessing = true;
        text.textContent = 'PLACING ORDER...';
        
        // Collect cart items
        const items = [];
        let totalPrice = 0;
        
        document.querySelectorAll('.menu-item').forEach(item => {
            const qty = parseInt(item.querySelector('.qty-value').textContent);
            if (qty > 0) {
                const name = item.dataset.name;
                const price = parseInt(item.dataset.price);
                items.push({ name, price, qty });
                totalPrice += (price * qty);
            }
        });

        // Get session
        const raw = sessionStorage.getItem('qrMenuSession');
        if (!raw || items.length === 0) {
            resetSlider();
            return;
        }
        
        const session = JSON.parse(raw);

        try {
            const res = await fetch('/api/orders/place', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionToken: session.token,
                    items,
                    totalPrice
                })
            });

            const data = await res.json();
            
            if (res.ok) {
                // Success UI
                bg.classList.add('success');
                thumb.classList.add('success');
                text.textContent = 'ORDER PLACED!';
                
                setTimeout(() => {
                    successOverlay.classList.add('visible');
                    // Reset cart
                    document.querySelectorAll('.menu-item').forEach(item => {
                        item.querySelector('.qty-value').textContent = '0';
                        updateItemState(item, 0);
                    });
                    updateCart();
                }, 800);

                setTimeout(() => {
                    successOverlay.classList.remove('visible');
                    closeCart();
                    resetSlider();
                    fetchMyBill(); // Refresh bill after successful order
                }, 3500);
            } else {
                alert(data.error || 'Failed to place order.');
                resetSlider();
            }
        } catch (error) {
            console.error('Order error:', error);
            alert('Network error. Please try again.');
            resetSlider();
        }
    }

    function resetSlider() {
        isProcessing = false;
        bg.classList.remove('success');
        thumb.classList.remove('success');
        text.textContent = 'Slide to Order >>>';
        thumb.style.transition = 'transform 0.3s var(--ease)';
        bg.style.transition = 'width 0.3s var(--ease)';
        thumb.style.transform = 'translateX(0)';
        bg.style.width = '0';
        text.style.color = '';
    }
});

/* ============================================
   LIVE BILL LOGIC
   ============================================ */
async function fetchMyBill() {
    const raw = sessionStorage.getItem('qrMenuSession');
    if (!raw) return;
    const session = JSON.parse(raw);
    
    try {
        const res = await fetch(`/api/orders/my-bill?sessionToken=${encodeURIComponent(session.token)}`);
        const data = await res.json();
        
        if (res.ok) {
            renderBill(data.items, data.totalFoodPrice);
        }
    } catch (error) {
        console.error('Failed to fetch bill:', error);
    }
}

function renderBill(items, foodTotal) {
    const container = document.getElementById('billContainer');
    const empty = document.getElementById('billEmpty');
    const list = document.getElementById('billItemsList');
    
    if (!items || items.length === 0) {
        container.classList.remove('visible');
        empty.classList.add('visible');
        return;
    }
    
    empty.classList.remove('visible');
    container.classList.add('visible');
    
    // Render Items
    list.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'bill-item';
        row.innerHTML = `
            <div class="bill-item-name">
                <span class="bill-item-qty">${item.qty}x</span> ${item.name}
            </div>
            <div class="bill-item-price">₹${item.price * item.qty}</div>
        `;
        list.appendChild(row);
    });
    
    // Calculate Taxes
    const cgst = Math.round(foodTotal * 0.025);
    const sgst = Math.round(foodTotal * 0.025);
    const grandTotal = foodTotal + cgst + sgst;
    
    document.getElementById('billFoodTotal').textContent = `₹${foodTotal}`;
    document.getElementById('billCgst').textContent = `₹${cgst}`;
    document.getElementById('billSgst').textContent = `₹${sgst}`;
    document.getElementById('billGrandTotal').textContent = `₹${grandTotal}`;
}
