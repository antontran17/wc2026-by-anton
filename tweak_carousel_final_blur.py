import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Fix the font sizes for team-name and vs-box
team_name_regex = r'\.team-box-carousel \.team-name \{\s*font-size: 40px;\s*font-weight: bold;\s*text-shadow: 0 2px 4px rgba\(0,0,0,0\.6\);\s*margin-top: 5px;\s*\}'
team_name_new = r'''.team-box-carousel .team-name {
            font-size: 28px;
            font-weight: 800;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
            margin-top: 8px;
        }
        .vs-box h2 {
            font-size: 28px !important;
            margin: 0;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
        }'''
html = re.sub(team_name_regex, team_name_new, html)

# 2. Add blur and opacity scaling for distant cards
# Base card
base_card_regex = r'opacity: 0\.15;\s*border-radius: 12px;'
base_card_new = r'opacity: 0.1; filter: blur(6px); border-radius: 12px;'
html = re.sub(base_card_regex, base_card_new, html)

# Next/Prev card
next_prev_regex = r'transform: scale\(0\.95\);\s*opacity: 0\.4;'
next_prev_new = r'transform: scale(0.95); opacity: 0.4; filter: blur(2px);'
html = re.sub(next_prev_regex, next_prev_new, html)

# Active card
active_regex = r'backdrop-filter: blur\(10px\);\s*opacity: 1;'
active_new = r'backdrop-filter: blur(10px); opacity: 1; filter: blur(0);'
html = re.sub(active_regex, active_new, html)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Font size and blur scaling applied!")
