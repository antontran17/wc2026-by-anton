import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update capsule padding to 15px
capsule_regex = r'padding: 12px 24px;'
html = re.sub(capsule_regex, 'padding: 15px;', html)

# 2. Update favorite card CSS for carousel to match the PinkBlue Breath effect
fav_card_regex = r'\.swiper-slide-active \.next-match-card\.is-favorite-card \{.*?@keyframes pulseFav \{.*?\}'
fav_card_new = r'''.swiper-slide-active .next-match-card.is-favorite-card {
            border-color: rgba(123,220,255,.62) !important;
            animation: favoritePinkBlueBreath 2.4s ease-in-out infinite !important;
            box-shadow: 0 18px 44px rgba(0,0,0,.24), 0 0 22px rgba(255,88,174,.26), 0 0 54px rgba(123,220,255,.20), inset 0 1px 0 rgba(255,255,255,.14) !important;
            position: relative !important;
            overflow: visible !important;
            z-index: 2;
        }
        .swiper-slide-active .next-match-card.is-favorite-card::after {
            content: "" !important;
            position: absolute !important;
            inset: -12px !important;
            border-radius: calc(12px + 12px) !important;
            background: radial-gradient(circle at 0% 0%, rgba(255,88,174,.18) 0%, transparent 64%),
                        radial-gradient(circle at 100% 100%, rgba(123,220,255,.24) 0%, transparent 64%) !important;
            z-index: -1 !important;
            filter: blur(8px) !important;
            pointer-events: none !important;
        }
        .swiper-slide-active .next-match-card.is-favorite-card::before {
            content: "" !important;
            position: absolute !important;
            inset: -2px !important;
            border-radius: inherit !important;
            pointer-events: none !important;
            background: linear-gradient(135deg, rgba(255,88,174,.3) 0%, rgba(123,220,255,.3) 100%) !important;
            z-index: 1 !important;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) !important;
            -webkit-mask-composite: xor !important;
            mask-composite: exclude !important;
            padding: 2px !important;
        }'''
html = re.sub(fav_card_regex, fav_card_new, html, flags=re.DOTALL)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Favorite effect and padding updated!")
