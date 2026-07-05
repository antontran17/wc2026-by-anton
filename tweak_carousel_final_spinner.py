import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Fix .spinner to be circular
spinner_regex = r'\.spinner \{\s*width: 50px;\s*height: 50px;\s*border: 3px solid rgba\(255,255,255,0\.1\);\s*border-top-color: var\(--primary\);\s*/\* no border-radius \*/\s*\}'
spinner_new = r'''.spinner {
            width: 50px;
            height: 50px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--primary);
            border-radius: 50%;
        }'''
html = re.sub(spinner_regex, spinner_new, html)

# If the above didn't match because someone changed the comment, let's use a safer regex:
spinner_regex_2 = r'\.spinner \{\s*width: 50px;\s*height: 50px;\s*border: 3px solid rgba\(255,255,255,0\.1\);\s*border-top-color: var\(--primary\);\s*\}'
html = re.sub(spinner_regex_2, spinner_new, html)

# Actually, my previous search output literally showed `/* no border-radius */`!

# 2. Inject global loading overlay HTML after <body>
body_regex = r'<body.*?>'
overlay_html = r'''
    <!-- Global Loading Overlay -->
    <div id="global-loading-overlay">
        <img src="https://upload.wikimedia.org/wikipedia/en/thumb/0/05/2026_FIFA_World_Cup_logo.svg/1200px-2026_FIFA_World_Cup_logo.svg.png" alt="WC2026">
    </div>
'''
html = re.sub(body_regex, lambda m: m.group(0) + overlay_html, html, count=1)

# 3. Inject CSS for the overlay
css_inject_target = r'</style>'
overlay_css = r'''
        #global-loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #111;
            z-index: 9999999;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: opacity 1s ease-out, visibility 1s ease-out;
        }
        #global-loading-overlay.hidden {
            opacity: 0;
            visibility: hidden;
        }
        #global-loading-overlay img {
            width: 250px;
            filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.2));
            animation: pulseFav 2s infinite;
        }
    </style>'''
html = html.replace('</style>', overlay_css, 1)

# 4. Inject JS to hide the overlay after 2 seconds
js_inject_target = r'document\.addEventListener\("DOMContentLoaded", \(\) => \{'
overlay_js = r'''
        // Global Loading Overlay Logic
        window.addEventListener('load', () => {
            setTimeout(() => {
                const overlay = document.getElementById('global-loading-overlay');
                if (overlay) overlay.classList.add('hidden');
            }, 2000);
        });

        document.addEventListener("DOMContentLoaded", () => {'''
html = html.replace('document.addEventListener("DOMContentLoaded", () => {', overlay_js, 1)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Spinner rounded and overlay added!")
