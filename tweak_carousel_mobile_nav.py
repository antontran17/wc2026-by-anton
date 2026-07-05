import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update HTML container and add arrows
html = html.replace(
    '<div class="swiper mySwiper" style="margin-top: -80px; padding-bottom: 30px; position: relative; z-index: 10;">',
    '<div class="swiper mySwiper carousel-container">'
)
html = html.replace(
    '''                    <div class="swiper-wrapper" id="next-match-container">
                        <!-- Matches will be injected here -->
                    </div>
                </div>''',
    '''                    <div class="swiper-wrapper" id="next-match-container">
                        <!-- Matches will be injected here -->
                    </div>
                    <div class="swiper-button-next custom-swiper-nav"></div>
                    <div class="swiper-button-prev custom-swiper-nav"></div>
                </div>'''
)

# 2. Add CSS for carousel-container and custom-swiper-nav
css_to_add = """
        .carousel-container {
            margin-top: -80px;
            padding-bottom: 30px;
            position: relative;
            z-index: 10;
        }
        @media (max-width: 768px) {
            .carousel-container {
                margin-top: 20px;
            }
        }
        .custom-swiper-nav {
            color: #fff !important;
            text-shadow: 0 0 15px rgba(0,0,0,0.9);
            transition: all 0.3s ease;
        }
        .custom-swiper-nav:hover {
            color: #ffcc00 !important;
            transform: scale(1.2);
        }
        .swiper-button-prev.custom-swiper-nav {
            animation: bounceLeft 2s infinite ease-in-out;
            left: 20px;
        }
        .swiper-button-next.custom-swiper-nav {
            animation: bounceRight 2s infinite ease-in-out;
            right: 20px;
        }
        @keyframes bounceLeft {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(-10px); }
        }
        @keyframes bounceRight {
            0%, 100% { transform: translateX(0); }
            50% { transform: translateX(10px); }
        }
"""
# Insert CSS before </style>
html = html.replace('    </style>', css_to_add + '    </style>')

# 3. Add JS for Navigation
old_swiper_js = """                    carouselSwiper = new Swiper('.mySwiper', {
                        effect: 'coverflow',
                        grabCursor: true,
                        centeredSlides: true,
                        slidesPerView: 'auto',
                        loop: true,
                        mousewheel: true,
                        coverflowEffect: {"""
new_swiper_js = """                    carouselSwiper = new Swiper('.mySwiper', {
                        effect: 'coverflow',
                        grabCursor: true,
                        centeredSlides: true,
                        slidesPerView: 'auto',
                        loop: true,
                        mousewheel: true,
                        navigation: {
                            nextEl: '.swiper-button-next',
                            prevEl: '.swiper-button-prev',
                        },
                        coverflowEffect: {"""
html = html.replace(old_swiper_js, new_swiper_js)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Mobile margin and Navigation arrows successfully applied.")
