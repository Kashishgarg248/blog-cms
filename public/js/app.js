(function () {
  'use strict';

  // ── Sidebar / hamburger ──────────────────────────────────────────────────
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');
  const closeBtn  = document.getElementById('sidebarToggle');

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('visible');
    document.body.classList.add('sidebar-open');
  }
  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
  }

  if (hamburger) hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar && sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay)  overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  // ── Active nav link ──────────────────────────────────────────────────────
const currentPath = window.location.pathname;

document.querySelectorAll('.nav-item').forEach(function (link) {
  const href = link.getAttribute('href');
  if (!href) return;

  if (currentPath === href) {
    link.classList.add('active');
  }
});

  // ── Auto-dismiss flash banners ───────────────────────────────────────────
  document.querySelectorAll('.flash-banner, .auth-flash').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 450);
    }, 5000);
  });

  // NOTE: Per-form submit buttons are disabled only inside each form's own
  // validation handler (in the EJS views), and only when validation passes.
  // No global submit disabler here — that caused the button to stay locked
  // after a failed validation attempt.

})();
