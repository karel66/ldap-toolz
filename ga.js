// JavaScript source code

(function () {
    const consent = localStorage.getItem('cookie-consent');

    function loadGA() {
        const script = document.createElement('script');
        script.async = true;
        script.src = "https://www.googletagmanager.com/gtag/js?id=G-GDK3Q7RWM4";
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;

        gtag('js', new Date());
        gtag('config', 'G-GDK3Q7RWM4');
    }

    if (consent === 'accepted') {
        loadGA();
    } else if (!consent) {
        document.getElementById('cookie-banner').style.display = 'block';
    }

    document.addEventListener('DOMContentLoaded', function () {
        const banner = document.getElementById('cookie-banner');

        document.getElementById('accept-cookies').onclick = function () {
            localStorage.setItem('cookie-consent', 'accepted');
            banner.style.display = 'none';
            loadGA();
        };

        document.getElementById('decline-cookies').onclick = function () {
            localStorage.setItem('cookie-consent', 'declined');
            banner.style.display = 'none';
        };
    });
})();
