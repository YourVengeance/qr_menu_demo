/* ============================================
   VERIFY PAGE — Logic & API Integration
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const tableId = getTableIdFromURL();

    if (!tableId) {
        showNoTableError();
        return;
    }

    initTableDisplay(tableId);
    initDetailsForm(tableId);
    initOTPInput();
});

/* ============================================
   STATE
   ============================================ */
let currentRequestId = null;
let currentExpiresAt = null;
let timerInterval = null;

/* ============================================
   URL & TABLE SETUP
   ============================================ */
function getTableIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('table');
}

function initTableDisplay(tableId) {
    const name = tableId.replace('table_', 'Table ').replace(/_/g, ' ');
    document.getElementById('tableName').textContent = name;
}

function showNoTableError() {
    document.getElementById('tableIndicator').style.display = 'none';
    document.getElementById('stepIndicator').style.display = 'none';
    document.getElementById('step1Card').classList.add('hidden');
    document.getElementById('noTableCard').classList.remove('hidden');
}

/* ============================================
   STEP 1: DETAILS FORM
   ============================================ */
function initDetailsForm(tableId) {
    const form = document.getElementById('detailsForm');
    const phoneInput = document.getElementById('customerPhone');

    // Only allow digits in phone input
    phoneInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('customerName').value.trim();
        const phone = phoneInput.value.trim();

        if (!name) {
            showToast('Please enter your name');
            return;
        }

        if (!/^\d{10}$/.test(phone)) {
            showToast('Please enter a valid 10-digit phone number');
            return;
        }

        await requestOTP(name, phone, tableId);
    });
}

async function requestOTP(name, phone, tableId) {
    const btn = document.getElementById('submitDetailsBtn');
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/verify/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, tableId })
        });

        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Something went wrong');
            btn.classList.remove('loading');
            return;
        }

        currentRequestId = data.requestId;
        currentExpiresAt = data.expiresAt;

        // Transition to step 2
        goToStep2();
    } catch (error) {
        showToast('Network error. Please check your connection.');
        btn.classList.remove('loading');
    }
}

function goToStep2() {
    // Update step indicators
    document.getElementById('step1Dot').classList.remove('active');
    document.getElementById('step1Dot').classList.add('completed');
    document.getElementById('stepLine').classList.add('filled');
    document.getElementById('step2Dot').classList.add('active');

    // Transition cards
    document.getElementById('step1Card').classList.add('hidden');

    setTimeout(() => {
        document.getElementById('step2Card').classList.remove('hidden');
        // Focus first OTP digit
        document.querySelector('.otp-digit[data-index="0"]').focus();
        // Start timer
        startTimer();
    }, 150);
}

/* ============================================
   STEP 2: OTP INPUT
   ============================================ */
function initOTPInput() {
    const digits = document.querySelectorAll('.otp-digit');
    const verifyBtn = document.getElementById('verifyOtpBtn');
    const resendBtn = document.getElementById('resendBtn');

    digits.forEach((input, idx) => {
        // Handle input
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val.slice(0, 1);

            // Clear error state
            document.getElementById('otpError').classList.add('hidden');
            digits.forEach(d => d.classList.remove('error'));

            if (val && idx < 3) {
                // Auto-advance to next digit
                digits[idx + 1].focus();
            }

            // Update filled state
            input.classList.toggle('filled', val.length > 0);

            // Enable/disable verify button
            const allFilled = Array.from(digits).every(d => d.value.length === 1);
            verifyBtn.disabled = !allFilled;
        });

        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                digits[idx - 1].focus();
                digits[idx - 1].value = '';
                digits[idx - 1].classList.remove('filled');
            }

            // Handle paste
            if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                // Handled by paste event
            }
        });

        // Handle paste
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');

            if (pasteData.length >= 4) {
                digits.forEach((d, i) => {
                    d.value = pasteData[i] || '';
                    d.classList.toggle('filled', d.value.length > 0);
                });
                digits[3].focus();
                verifyBtn.disabled = false;
            }
        });

        // Select all on focus
        input.addEventListener('focus', () => {
            input.select();
        });
    });

    // Verify button
    verifyBtn.addEventListener('click', () => {
        const otp = Array.from(digits).map(d => d.value).join('');
        if (otp.length === 4) {
            validateOTP(otp);
        }
    });

    // Resend button
    resendBtn.addEventListener('click', () => {
        // Go back to step 1
        clearInterval(timerInterval);
        document.getElementById('step1Dot').classList.add('active');
        document.getElementById('step1Dot').classList.remove('completed');
        document.getElementById('stepLine').classList.remove('filled');
        document.getElementById('step2Dot').classList.remove('active');
        document.getElementById('step2Card').classList.add('hidden');
        document.getElementById('step1Card').classList.remove('hidden');
        document.getElementById('submitDetailsBtn').classList.remove('loading');

        // Clear OTP digits
        digits.forEach(d => {
            d.value = '';
            d.classList.remove('filled', 'error');
        });
        verifyBtn.disabled = true;
        document.getElementById('otpError').classList.add('hidden');
    });
}

/* ============================================
   OTP VALIDATION
   ============================================ */
async function validateOTP(otp) {
    const btn = document.getElementById('verifyOtpBtn');
    btn.classList.add('loading');

    try {
        const res = await fetch('/api/verify/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: currentRequestId, otp })
        });

        const data = await res.json();

        if (!res.ok) {
            btn.classList.remove('loading');

            if (data.error && data.error.includes('expired')) {
                document.getElementById('otpError').textContent = 'OTP expired. Please request a new one.';
            } else {
                document.getElementById('otpError').textContent = data.error || 'Invalid OTP. Please try again.';
            }

            document.getElementById('otpError').classList.remove('hidden');
            document.querySelectorAll('.otp-digit').forEach(d => d.classList.add('error'));

            // Remove error animation after it plays
            setTimeout(() => {
                document.querySelectorAll('.otp-digit').forEach(d => d.classList.remove('error'));
            }, 500);
            return;
        }

        // SUCCESS — Store session and redirect
        clearInterval(timerInterval);

        sessionStorage.setItem('qrMenuSession', JSON.stringify({
            token: data.sessionToken,
            tableId: data.tableId,
            tableName: data.tableName,
            customerName: data.customerName
        }));

        showSuccess(data.customerName);
    } catch (error) {
        btn.classList.remove('loading');
        showToast('Network error. Please try again.');
    }
}

function showSuccess(customerName) {
    document.getElementById('step2Card').classList.add('hidden');
    document.getElementById('step2Dot').classList.remove('active');
    document.getElementById('step2Dot').classList.add('completed');

    const successCard = document.getElementById('successCard');
    document.getElementById('successMessage').textContent =
        `Welcome, ${customerName}! Redirecting to menu...`;
    successCard.classList.remove('hidden');

    // Redirect to menu after animation
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

/* ============================================
   TIMER
   ============================================ */
function startTimer() {
    const timerEl = document.getElementById('otpTimer');
    const timerText = document.getElementById('timerText');

    function updateTimer() {
        const remaining = Math.max(0, currentExpiresAt - Date.now());
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerText.textContent = 'OTP expired';
            timerEl.classList.add('expired');
            timerEl.classList.remove('expiring');
            return;
        }

        if (remaining < 120000) {
            timerEl.classList.add('expiring');
        }

        timerText.textContent = `Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

/* ============================================
   TOAST NOTIFICATION
   ============================================ */
function showToast(message) {
    const toast = document.getElementById('errorToast');
    document.getElementById('toastMessage').textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3500);
}
