import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Card CSS for absolute positioning of top/bottom and centering middle
css_old_card = r"""        \.swiper-slide \.next-match-card \{
            background: rgba\(255, 255, 255, 0\.05\);
            border: 1px solid rgba\(255, 255, 255, 0\.1\);
            backdrop-filter: blur\(10px\);
            transition: all 0\.5s ease;
            transform: scale\(0\.9\);
            opacity: 0\.15;
            border-radius: 12px;
            padding: 20px;
            color: #fff;
            min-height: 360px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        \}"""

css_new_card = """        .swiper-slide .next-match-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            transition: all 0.5s ease;
            transform: scale(0.9);
            opacity: 0.15;
            border-radius: 12px;
            padding: 20px;
            color: #fff;
            min-height: 360px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            position: relative;
        }
        .swiper-slide-active .next-match-card.is-favorite-card {
            box-shadow: 0 0 30px rgba(255, 204, 0, 0.6), inset 0 0 20px rgba(255, 204, 0, 0.3) !important;
            border: 1px solid rgba(255, 204, 0, 0.8) !important;
            animation: pulseFav 2s infinite;
        }
        @keyframes pulseFav {
            0% { box-shadow: 0 0 30px rgba(255, 204, 0, 0.6), inset 0 0 20px rgba(255, 204, 0, 0.3); }
            50% { box-shadow: 0 0 50px rgba(255, 204, 0, 0.9), inset 0 0 30px rgba(255, 204, 0, 0.5); }
            100% { box-shadow: 0 0 30px rgba(255, 204, 0, 0.6), inset 0 0 20px rgba(255, 204, 0, 0.3); }
        }"""
html = re.sub(css_old_card, css_new_card, html)

# 2. Enlarge team names
html = html.replace("""        .team-box-carousel .team-name {
            font-size: 20px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
        }""", """        .team-box-carousel .team-name {
            font-size: 24px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
            margin-top: 5px;
        }""")

# 3. Update JS Logic in renderNextMatchesCarousel
# Find the loop block
func_start_idx = html.find('            let html = \'\';')
if func_start_idx != -1:
    func_end_idx = html.find('container.innerHTML = html;', func_start_idx)
    if func_end_idx != -1:
        old_loop = html[func_start_idx:func_end_idx]
        
        # Replace stadiumName
        new_loop = old_loop.replace("?.name || '';", "?.name_en || '';")
        
        # We need to rewrite the HTML generation part inside the loop.
        # Let's just find the `html += \`...\`;` part and replace it.
        html_block_regex = r"html \+= `\n                    <div class=\"swiper-slide\">\n.*?</div>\n                    </div>\n                `;"
        
        new_html_block = """
                const isFavCard = favoriteMatches.has(String(game.id)) || favoriteTeams.has(String(homeTeam.id)) || favoriteTeams.has(String(awayTeam.id));
                const favClass = isFavCard ? 'is-favorite-card' : '';

                html += `
                    <div class="swiper-slide">
                        <div class="next-match-card ${isLive ? 'is-live' : ''} ${favClass}" onclick="handleMatchCardClick('${game.id}')">
                            <div style="position: absolute; top: 30px; left: 0; width: 100%; text-align: center;">${topStatusHtml}</div>
                            
                            <div class="match-teams-carousel" style="width: 100%; margin-top: 10px;">
                                <div class="team-box-carousel">
                                    <img src="${homeTeam.flag || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}" alt="${homeLabel}">
                                    <div class="team-name">${homeName}</div>
                                </div>
                                <div class="vs-box">${scoreDisplay}</div>
                                <div class="team-box-carousel">
                                    <img src="${awayTeam.flag || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}" alt="${awayLabel}">
                                    <div class="team-name">${awayName}</div>
                                </div>
                            </div>
                            
                            <div class="match-info-carousel" style="position: absolute; bottom: 30px; left: 0; width: 100%; text-align: center;">
                                <div style="color: #fff; font-size: 15px; font-weight: bold; line-height: 1.6; letter-spacing: 1px;">${timeStr} - ${dateStr.split('/').join('.')}</div>
                                <div style="color: #ccc; font-size: 14px; line-height: 1.6;">${stageName}${stadiumName ? ' • ' + stadiumName : ''}</div>
                                ${scorersHtml}
                            </div>
                        </div>
                    </div>
                `;"""
        new_loop = re.sub(html_block_regex, new_html_block.strip(), new_loop, flags=re.DOTALL)
        
        html = html[:func_start_idx] + new_loop + html[func_end_idx:]

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Card alignment, stadium name, and favorite effects successfully applied.")
