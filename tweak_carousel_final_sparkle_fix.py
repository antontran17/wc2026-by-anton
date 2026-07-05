import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove the problematic team-flag class and use carousel-team-flag instead
home_img_regex = r'<img class="team-flag \$\{favoriteTeams\.has\(String\(homeTeam\.id\)\) \? \'favorite-flag\' : \'\'\}"'
home_img_new = r'<div class="carousel-flag-wrapper ${favoriteTeams.has(String(homeTeam.id)) ? \'favorite-flag-wrap-carousel\' : \'\'}"><img class="carousel-team-flag ${favoriteTeams.has(String(homeTeam.id)) ? \'favorite-flag-carousel\' : \'\'}"'
html = re.sub(home_img_regex, home_img_new, html)

away_img_regex = r'<img class="team-flag \$\{favoriteTeams\.has\(String\(awayTeam\.id\)\) \? \'favorite-flag\' : \'\'\}"'
away_img_new = r'<div class="carousel-flag-wrapper ${favoriteTeams.has(String(awayTeam.id)) ? \'favorite-flag-wrap-carousel\' : \'\'}"><img class="carousel-team-flag ${favoriteTeams.has(String(awayTeam.id)) ? \'favorite-flag-carousel\' : \'\'}"'
html = re.sub(away_img_regex, away_img_new, html)

# We also need to close the wrapper div!
# Original:
# <img class="..." src="..." alt="...">
# <div class="team-name">
# Since we added <div class="carousel-flag-wrapper"> before <img, we must close it after <img>
wrapper_close_regex = r'(<img class="carousel-team-flag.*?alt="\$\{homeLabel\}">)'
html = re.sub(wrapper_close_regex, r'\1</div>', html)

wrapper_close_away_regex = r'(<img class="carousel-team-flag.*?alt="\$\{awayLabel\}">)'
html = re.sub(wrapper_close_away_regex, r'\1</div>', html)


# 2. Add the custom CSS for the carousel flags and sparkles
custom_css = r'''
        .carousel-team-flag {
            width: 100px;
            height: 80px;
            object-fit: contain;
            margin-bottom: 12px;
            filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));
            /* ensure no background */
            background: transparent !important;
            border: none !important;
        }
        .carousel-team-flag.favorite-flag-carousel {
            animation: favoriteFlagSparkle 1.8s ease-in-out infinite !important;
            filter: drop-shadow(0 0 10px rgba(255,230,145,.72)) drop-shadow(0 0 18px rgba(123,220,255,.36)) !important;
        }
        .carousel-flag-wrapper {
            position: relative;
            display: inline-block;
        }
        .carousel-flag-wrapper.favorite-flag-wrap-carousel::before {
            content: "" !important;
            position: absolute !important;
            inset: -4px !important;
            border-radius: 50% !important;
            pointer-events: none !important;
            background:
                radial-gradient(circle at 12% 16%, rgba(123,220,255,.95) 0 2px, transparent 3px),
                radial-gradient(circle at 84% 78%, rgba(255,82,168,.90) 0 2px, transparent 3px),
                radial-gradient(circle at 30% 84%, rgba(255,230,145,.76) 0 1.5px, transparent 3px);
            animation: favoriteCardSparkle 1.35s linear infinite !important;
            z-index: 1 !important;
        }
    </style>'''
html = html.replace('</style>', custom_css, 1)

# Ensure .team-box-carousel img original CSS doesn't conflict, wait, my old CSS had:
# .team-box-carousel img { width: 100px; height: 80px; object-fit: contain; ... }
# That will still match, but .carousel-team-flag will take precedence if needed.

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Flag box bug fixed and sparkles added!")
