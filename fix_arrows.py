import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove all old custom-swiper-nav CSS blocks that were duplicated
old_css_regex = r"        \.custom-swiper-nav \{.*?@keyframes bounceRight \{.*?        \}"
html = re.sub(old_css_regex, "", html, flags=re.DOTALL)

# 2. Insert the CORRECT CSS once
css_correct = """        .custom-swiper-nav {
            color: #fff !important;
            font-size: 24px;
            text-shadow: 0 0 15px rgba(0,0,0,0.9);
            transition: all 0.3s ease;
            width: 40px;
            height: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0,0,0,0.3);
            border-radius: 50%;
        }
        .swiper-button-next::after, .swiper-button-prev::after {
            content: none !important;
        }
        .custom-swiper-nav:hover {
            color: #ffcc00 !important;
            transform: scale(1.2);
            background: rgba(0,0,0,0.6);
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

# 3. Update HTML buttons to include FontAwesome icons
html = html.replace(
    '<div class="swiper-button-next custom-swiper-nav"></div>',
    '<div class="swiper-button-next custom-swiper-nav"><i class="fa-solid fa-chevron-right"></i></div>'
)
html = html.replace(
    '<div class="swiper-button-prev custom-swiper-nav"></div>',
    '<div class="swiper-button-prev custom-swiper-nav"><i class="fa-solid fa-chevron-left"></i></div>'
)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Arrows fixed!")
