
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // Check ETA
  function checkETA() {
    const result = document.getElementById('eta-result');
    result.style.display = 'block';
  }

  // Report form
  function handleReport(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Report submitted — thank you!';
    btn.disabled = true;
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.disabled = false;
      btn.style.background = '';
      e.target.reset();
    }, 3000);
  }

  // Enquiry
  function handleEnquiry() {
    const q = document.getElementById('e-query').value.trim();
    if (!q) { alert('Please describe your enquiry first.'); return; }
    alert('Enquiry submitted. Reference: UAS-' + Date.now().toString().slice(-5));
  }

  // Subscribe
  function handleSubscribe(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '✅ Subscribed!';
    btn.disabled = true;
    setTimeout(() => {
      btn.innerHTML = '🔔 Subscribe to alerts';
      btn.disabled = false;
    }, 2500);
  }
