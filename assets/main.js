// Lead Broker Blueprint — site interactions
// Scroll reveal, waitlist form handling, smooth nav highlighting.

(function () {
  'use strict';

  // ── Scroll reveal ──────────────────────────────────────────────────
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  // ── Waitlist form ──────────────────────────────────────────────────
  const forms = document.querySelectorAll('form.waitlist-form');
  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailInput = form.querySelector('input[type="email"]');
      const button = form.querySelector('button');
      const email = (emailInput.value || '').trim();

      // Basic client-side validation
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showFormFeedback(form, 'Please enter a valid email address.', 'error');
        return;
      }

      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Joining…';

      try {
        // The form action attribute decides where the email is sent.
        // For v1 we default to a Formspree-style endpoint set in the markup.
        const endpoint = form.getAttribute('action') || '/api/waitlist';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ email, source: window.location.pathname, ts: new Date().toISOString() }),
        });
        if (!response.ok) throw new Error('Endpoint returned ' + response.status);

        emailInput.value = '';
        showFormFeedback(form, 'You\'re on the list. Watch your inbox for the launch email.', 'success');
      } catch (err) {
        console.warn('Waitlist signup error:', err);
        showFormFeedback(form, 'Hmm — something didn\'t go through. Email leadbrokerblueprint@gmail.com and we\'ll add you manually.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });

  function showFormFeedback(form, message, type) {
    let feedback = form.parentElement.querySelector('.form-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'form-feedback';
      feedback.style.cssText =
        'margin-top:16px;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:500;display:inline-block';
      form.parentElement.appendChild(feedback);
    }
    feedback.textContent = message;
    if (type === 'success') {
      feedback.style.background = 'rgba(255,255,255,.95)';
      feedback.style.color = '#0B1727';
    } else {
      feedback.style.background = 'rgba(255,255,255,.95)';
      feedback.style.color = '#DC2626';
    }
  }

  // ── Update copyright year ─────────────────────────────────────────
  const yearEls = document.querySelectorAll('[data-year]');
  yearEls.forEach((el) => (el.textContent = new Date().getFullYear()));
})();
