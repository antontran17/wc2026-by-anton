import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add favorite-flag class to home and away images in the carousel
# Find home team img
home_img_regex = r'<img src="\$\{homeTeam\.flag ||[ \n\r\t]*\'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'\}" alt="\$\{homeLabel\}">'
home_img_new = r'<img class="${favoriteTeams.has(String(homeTeam.id)) ? \'favorite-flag\' : \'\'}" src="${homeTeam.flag || \'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'}" alt="${homeLabel}">'
html = re.sub(home_img_regex, home_img_new, html)

# Find away team img
away_img_regex = r'<img src="\$\{awayTeam\.flag ||[ \n\r\t]*\'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'\}" alt="\$\{awayLabel\}">'
away_img_new = r'<img class="${favoriteTeams.has(String(awayTeam.id)) ? \'favorite-flag\' : \'\'}" src="${awayTeam.flag || \'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'}" alt="${awayLabel}">'
html = re.sub(away_img_regex, away_img_new, html)

# 2. Add padding-top: 50px to .carousel-container
# The current CSS is:
#         .carousel-container {
#             width: 100%;
#             padding-bottom: 30px;
#             overflow: visible;
#         }
carousel_container_regex = r'\.carousel-container \{\s*width: 100%;\s*padding-bottom: 30px;\s*overflow: visible;\s*\}'
carousel_container_new = r'''.carousel-container {
            width: 100%;
            padding-top: 50px;
            padding-bottom: 50px;
            overflow: visible;
        }'''
html = re.sub(carousel_container_regex, carousel_container_new, html)

# Also ensure that .team-box-carousel .favorite-flag triggers the sparkle correctly because the global CSS is `.team-flag.favorite-flag`.
# Wait, the carousel images might not have `.team-flag` class. The original selector is:
# `.team-card.favorite-team-card .team-flag, .team-flag.favorite-flag`
# If we add class="favorite-flag", it matches `.team-flag.favorite-flag` ONLY IF it also has `.team-flag`.
# Let's add `.team-flag` as well to the img.
home_img_new2 = r'<img class="team-flag ${favoriteTeams.has(String(homeTeam.id)) ? \'favorite-flag\' : \'\'}" src="${homeTeam.flag || \'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'}" alt="${homeLabel}">'
html = html.replace(home_img_new, home_img_new2)

away_img_new2 = r'<img class="team-flag ${favoriteTeams.has(String(awayTeam.id)) ? \'favorite-flag\' : \'\'}" src="${awayTeam.flag || \'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\'}" alt="${awayLabel}">'
html = html.replace(away_img_new, away_img_new2)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Sparkles and container padding applied!")
