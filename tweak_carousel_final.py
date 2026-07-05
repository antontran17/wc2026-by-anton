import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Arrows (Thin arrows, no circle)
# Remove background and border-radius from .custom-swiper-nav
html = html.replace('background: rgba(0,0,0,0.3);', '/* no background */')
html = html.replace('border-radius: 50%;', '/* no border-radius */')
html = html.replace('background: rgba(0,0,0,0.6);', '/* no background */')

# Change fa-chevron to fa-angle
html = html.replace('fa-chevron-right', 'fa-angle-right')
html = html.replace('fa-chevron-left', 'fa-angle-left')

# Make the font-size even bigger so the thin angle looks good
html = html.replace('font-size: 24px;', 'font-size: 40px;')
html = html.replace('font-weight: 900;', 'font-weight: 300;')

# 2. Prettier Countdown Capsule
countdown_old = '''padding: 6px 16px; font-weight: bold; color: #fff; font-size: 16px; letter-spacing: 2px; box-shadow: 0 4px 12px rgba(209,0,34,0.5);'''
countdown_new = '''padding: 8px 28px; font-weight: bold; color: #fff; font-size: 16px; letter-spacing: 2px; box-shadow: 0 4px 16px rgba(209,0,34,0.8);'''
html = html.replace(countdown_old, countdown_new)

# 3. Card Padding to 50px
html = html.replace('padding: 20px;\n            color: #fff;\n            min-height: 360px;', 'padding: 50px 20px;\n            color: #fff;\n            min-height: 360px;')

# 4. Adjust Absolute Positioning of Top/Bottom elements
html = html.replace('top: 45px;', 'top: 50px;')
html = html.replace('bottom: 30px;', 'bottom: 50px;')

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Final Carousel tweaks applied!")
