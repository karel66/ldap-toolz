/*
MIT License

Copyright (c) 2026 ldap-toolz contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

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
