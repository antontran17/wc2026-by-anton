import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Clean up duplicated custom-swiper-nav CSS blocks completely
old_css_regex = r"        \.custom-swiper-nav \{.*?@keyframes bounceRight \{.*?        \}"
html = re.sub(old_css_regex, "", html, flags=re.DOTALL)

# 2. Insert ONE clean CSS block
css_correct = """        .custom-swiper-nav {
            color: #fff !important;
            transition: all 0.3s ease;
            width: 40px;
            height: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            /* no background */
            /* no border-radius */
            z-index: 100;
        }
        .swiper-button-next::after, .swiper-button-prev::after {
            content: none !important;
        }
        .custom-swiper-nav:hover {
            color: #ffcc00 !important;
            transform: scale(1.2);
            /* no background */
        }
        .swiper-button-prev.custom-swiper-nav {
            animation: bounceLeft 2s infinite ease-in-out;
            left: 50%;
            margin-left: -350px;
        }
        .swiper-button-next.custom-swiper-nav {
            animation: bounceRight 2s infinite ease-in-out;
            right: 50%;
            margin-right: -350px;
        }
        @media (max-width: 768px) {
            .swiper-button-prev.custom-swiper-nav {
                left: 10px;
                margin-left: 0;
            }
            .swiper-button-next.custom-swiper-nav {
                right: 10px;
                margin-right: 0;
            }
        }
        @keyframes bounceLeft {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(-10px); }
        }
        @keyframes bounceRight {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(10px); }
        }"""
html = html.replace('        .carousel-container {', css_correct + '\n        .carousel-container {')

# 3. Use SVG for arrows
arrow_left_regex = r'<div class="swiper-button-prev custom-swiper-nav".*?</div>'
arrow_right_regex = r'<div class="swiper-button-next custom-swiper-nav".*?</div>'

svg_left = '<div class="swiper-button-prev custom-swiper-nav"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></div>'
svg_right = '<div class="swiper-button-next custom-swiper-nav"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></div>'

html = re.sub(arrow_left_regex, svg_left, html)
html = re.sub(arrow_right_regex, svg_right, html)

# 4. Fix Countdown Capsule to match reference image (padding 6px 18px, font-weight 700)
countdown_regex = r'topStatusHtml = `<div class="carousel-countdown".*?DANG TINH\.\.\.</div>`;'
countdown_new = 'topStatusHtml = `<div class="carousel-countdown" data-date="${d ? d.toISOString() : \'\'}" style="display: inline-block; background-color: #ff0000; border-radius: 50px; padding: 6px 20px; font-weight: 700; color: #fff; font-size: 15px; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(255, 0, 0, 0.5);">ĐANG TÍNH...</div>`;'

# And for the JS logic that replaces "DANG TINH":
countdown_js_regex = r'topStatusHtml = `<div class="carousel-countdown" data-date="\$\{d \? d\.toISOString\(\) : \'\'\}" style=".*?>ĐANG TÍNH\.\.\.</div>`;'
html = re.sub(countdown_js_regex, countdown_new, html)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Arrows fixed with SVGs and Capsule resized!")
