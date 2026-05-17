(function () {
  var GA4_ID = window.__GA4_ID;
  if (!GA4_ID) return;

  function loadGA4() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA4_ID);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(script);
  }

  var consent = localStorage.getItem('cookie_consent');

  if (consent === 'accepted') {
    loadGA4();
    return;
  }

  if (consent === 'declined') {
    return;
  }

  var banner = document.getElementById('cookie-banner');
  if (!banner) return;
  banner.classList.remove('hidden');

  document.getElementById('btn-cookie-aceitar').addEventListener('click', function () {
    localStorage.setItem('cookie_consent', 'accepted');
    banner.classList.add('hidden');
    loadGA4();
  });

  document.getElementById('btn-cookie-recusar').addEventListener('click', function () {
    localStorage.setItem('cookie_consent', 'declined');
    banner.classList.add('hidden');
  });
})();
