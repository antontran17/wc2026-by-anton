
// Preloader logic
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('loaded');
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 1000); // Wait for transition to finish
        }, 2000); // Artificial delay to ensure user sees it briefly
    }
});

function getTeamAbbr(team) { return team.id === '360' ? 'MUN' : (team.abbreviation || team.shortDisplayName); }
let countdownInterval;
let currentCarouselIndex = 0;
const TEAM_ID = "360"; // Manchester United
const API_SCHEDULE = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${TEAM_ID}/schedule`;
const API_STANDINGS = `https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings`;
const API_ROSTER = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${TEAM_ID}/roster`;


function formatMatchTime(dateObj) {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const day = dayNames[dateObj.getDay()];
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hh}:${min}, ${day} ${dd}.${mm}.${yyyy}`;
}

// State
let allMatches = [];
let allPlayers = [];
let currentFilter = "all"; // all, upcoming, completed

document.addEventListener("DOMContentLoaded", () => {
    loadSchedule();
    loadStandings();
    loadRoster();
});

const leagueAcronyms = {
    "English Premier League": "EPL",
    "English FA Cup": "FA",
    "English Carabao Cup": "EFL",
    "UEFA Champions League": "CL",
    "UEFA Europa League": "EL",
    "Club Friendlies": "FM"
};

function initNavigation() {
    const filterContainer = document.getElementById("league-filters");
    if (!filterContainer) return;
    
    // Find unique leagues from allMatches
    const uniqueLeagues = [...new Set(allMatches.map(m => m.leagueName))].filter(Boolean);
    
    let buttonsHTML = `<button class="tab-btn active" data-filter="all">Tất cả</button>`;
    uniqueLeagues.forEach(league => {
        const acronym = leagueAcronyms[league] || league;
        buttonsHTML += `<button class="tab-btn" data-filter="${league}">${acronym}</button>`;
    });
    
    filterContainer.innerHTML = buttonsHTML;
    
    const tabs = filterContainer.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");
            currentFilter = e.target.getAttribute("data-filter");
            renderMatchesGrid();
        });
    });
}

async function loadSchedule() {
    try {
        const fetchSeason = async (year) => {
            try {
                if (year === "2026") {
                    // Fetch both EPL and Club Friendlies for 2026
                    const [resEpl, resFriendly, resFA, resLC, resUCL, resUEL] = await Promise.all([
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260801-20270530&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/club.friendly/scoreboard?dates=20260701-20260830&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.fa/scoreboard?dates=20260801-20270530&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.league_cup/scoreboard?dates=20260801-20270530&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20260801-20270530&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=20260801-20270530&limit=380`)
                    ]);
                    const dataEpl = await resEpl.json();
                    const dataFriendly = await resFriendly.json();
                    const dataFA = await resFA.json();
                    const dataLC = await resLC.json();
                    const dataUCL = await resUCL.json();
                    const dataUEL = await resUEL.json();
                    
                    const mapEvents = (data, defaultName) => (data.events || []).map(e => ({...e, leagueName: data.leagues?.[0]?.name || defaultName}));
                    
                    const allMatches2026 = [
                        ...mapEvents(dataEpl, "English Premier League"),
                        ...mapEvents(dataFriendly, "Club Friendlies"),
                        ...mapEvents(dataFA, "English FA Cup"),
                        ...mapEvents(dataLC, "English Carabao Cup"),
                        ...mapEvents(dataUCL, "UEFA Champions League"),
                        ...mapEvents(dataUEL, "UEFA Europa League")
                    ];
                    return allMatches2026.filter(m => {
                        return m.competitions[0].competitors.some(c => c.team.id === TEAM_ID);
                    });
                } else {
                    const res = await fetch(`${API_SCHEDULE}?season=${year}`);
                    const data = await res.json();
                    return data.events || [];
                }
            } catch (e) {
                return [];
            }
        };

        const [events2026] = await Promise.all([
            fetchSeason("2026")
        ]);
        
        allMatches = [...events2026];
        
        // Find next match
        const now = new Date();
        const upcomingMatches = allMatches.filter(m => new Date(m.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (upcomingMatches.length > 0) {
            renderNextMatchesCarousel(upcomingMatches.slice(0, 7));
        } else {
            document.getElementById("next-match-container").innerHTML = `<p style="text-align:center; color: var(--text-secondary)">Hiện chưa có lịch thi đấu tiếp theo.</p>`;
        }
        
        initNavigation(); // Initialize dynamic filters now that allMatches is populated
        renderMatchesGrid();
    } catch (err) {
        console.error("Lỗi khi tải lịch thi đấu:", err);
        document.getElementById("matches-grid").innerHTML = `<p style="color: red;">Không thể tải dữ liệu. Vui lòng thử lại sau.</p>`;
    }
}

function renderNextMatchesCarousel(matches) {
    const container = document.getElementById("next-match-container");
    if (countdownInterval) clearInterval(countdownInterval);
    
    if (!matches || matches.length === 0) {
        container.innerHTML = `<p style="text-align:center; color: var(--text-secondary)">Hiện chưa có lịch thi đấu tiếp theo.</p>`;
        return;
    }
    
    let slidesHTML = "";
    
    const renderMatches = [...matches, ...matches, ...matches]; // Duplicate 3x to ensure enough slides for auto loop
    renderMatches.forEach((match, index) => {
        const comp = match.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        
        const dateObj = new Date(match.date);
        const formattedTime = formatMatchTime(dateObj);
        
        const leagueName = match.leagueName || match.season?.displayName || "Tournament";
        
        const opponent = home.team.id === "360" ? away : home;
        const opponentId = opponent.team.id;
        let derbyName = "";
        let derbyClass = "";
        if (["364", "382", "357"].includes(opponentId)) {
            derbyName = "DERBY";
            derbyClass = "derby-match";
        } else if (["359", "363", "367", "361"].includes(opponentId)) {
            derbyName = "SUPER MATCH";
            derbyClass = "super-match";
        }

        
        
        const isLive = match.status.type.state === 'in';
        let homeScorersHTML = '';
        let awayScorersHTML = '';
        
        if (isLive) {
            const details = match.competitions[0].details || [];
            const goals = details.filter(d => d.scoringPlay === true || d.type.text === "Goal" || d.type.text === "Penalty - Scored");
            
            const homeGoals = goals.filter(g => g.team.id === home.team.id);
            const awayGoals = goals.filter(g => g.team.id === away.team.id);
            
            homeScorersHTML = homeGoals.map(g => {
                const scorer = g.athletesInvolved?.[0]?.displayName || 'Unknown';
                const assist = g.athletesInvolved?.[1]?.displayName ? `<br><span class="scorer-assist">(${g.athletesInvolved[1].displayName})</span>` : '';
                return `<div class="scorer-item" style="margin-bottom:4px;"><strong>${scorer} ${g.clock.displayValue}</strong>${assist}</div>`;
            }).join('');
            
            awayScorersHTML = awayGoals.map(g => {
                const scorer = g.athletesInvolved?.[0]?.displayName || 'Unknown';
                const assist = g.athletesInvolved?.[1]?.displayName ? `<br><span class="scorer-assist">(${g.athletesInvolved[1].displayName})</span>` : '';
                return `<div class="scorer-item" style="margin-bottom:4px;"><strong>${scorer} ${g.clock.displayValue}</strong>${assist}</div>`;
            }).join('');
        }
        
        slidesHTML += `
            <div class="swiper-slide">
                <div class="next-match-card clickable-card ${derbyClass}" onclick="openMatchModal('${match.id}')" style="margin: 0; width: 100%; box-sizing: border-box; position: relative;">
                    <div style="text-align: center;">
                        ${derbyName ? `<div class="derby-label" style="display:inline-block; background: linear-gradient(90deg, #ff0000, #8b0000); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 15px; border-radius: 12px; letter-spacing: 1px; box-shadow: 0 0 15px rgba(255,0,0,0.6); position: absolute; top: -12px; left: 50%; transform: translateX(-50%); z-index: 5;">${derbyName}</div>` : ''}
                        ${isLive && match.status.displayClock ? `
                            <div style="background: #000; color: #fff; border-radius: 20px; padding: 6px 20px; display: inline-block; font-family: 'Google Sans Flex', sans-serif; font-weight: 700; font-size: 16px; margin-bottom: 15px; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                                ${match.status.displayClock}'
                            </div>
                        ` : `
                            <div class="countdown-box" id="countdown-${match.id}" data-date="${match.date}">
                                <span class="countdown-value">--:--:--:--</span>
                            </div>
                        `}
                    </div>
                    <div class="match-teams" style="margin: auto 0;">
                        <div class="team-box">
                            <img src="${home.team.logo || home.team.logos?.[0]?.href || ''}" alt="${home.team.name}" style="width: 90px; height: 90px; object-fit: contain;">
                            <span style="font-size: 20px; text-transform: uppercase;">${getTeamAbbr(home.team)}</span>
                        </div>
                        
                        <div class="match-vs-container" style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex: 1;">
                            <div class="match-vs" style="font-size: ${isLive ? '48px' : '30px'}; font-weight: 700; color: #fff; margin-bottom: 5px; text-shadow: ${isLive ? '0 5px 15px rgba(0,0,0,0.5)' : 'none'};">
                                ${isLive ? (home.score !== undefined ? home.score : "0") + ' : ' + (away.score !== undefined ? away.score : "0") : 'VS'}
                            </div>
                        </div>

                        <div class="team-box">
                            <img src="${away.team.logo || away.team.logos?.[0]?.href || ''}" alt="${away.team.name}" style="width: 90px; height: 90px; object-fit: contain;">
                            <span style="font-size: 20px; text-transform: uppercase;">${getTeamAbbr(away.team)}</span>
                        </div>
                    </div>
                    
                    ${isLive ? `
                    <div class="live-scorers-panel" style="background: rgba(0,0,0,0.6); display: flex; justify-content: space-between; padding: 20px 30px; box-sizing: border-box; margin: 0 -30px 0 -30px;">
                        <div class="home-scorers" style="text-align:left; flex:1; font-size: 13px; color: #fff; font-family: 'Google Sans Flex', sans-serif;">${homeScorersHTML}</div>
                        <div class="away-scorers" style="text-align:right; flex:1; font-size: 13px; color: #fff; font-family: 'Google Sans Flex', sans-serif;">${awayScorersHTML}</div>
                    </div>
                    ` : `
                    <div class="match-time-info">
                        <strong>${formattedTime}</strong> <br>
                        <span style="font-weight: 700; color:#fff; text-transform:uppercase; font-size:18px; letter-spacing:1px;">${leagueName}</span> <br>
                        <small>${comp.venue?.fullName || "Sân chưa xác định"}</small>
                    </div>
                    `}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = `
        <div class="carousel-wrapper-full">
            <div class="swiper mySwiper">
                <div class="swiper-wrapper">
                    ${slidesHTML}
                </div>
                ${matches.length > 1 ? `
                <div class="swiper-button-next custom-nav-btn"></div>
                <div class="swiper-button-prev custom-nav-btn"></div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Initialize Swiper
    if (matches.length > 1) {
        new Swiper('.mySwiper', {
            grabCursor: true,
            centeredSlides: true,
            slidesPerView: 'auto',
            spaceBetween: 120,
            loop: true,
            
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
        });
    }
    
    startCountdown();
}

function startCountdown() {
    countdownInterval = setInterval(() => {
        const countdowns = document.querySelectorAll('.countdown-box');
        const now = new Date().getTime();
        
        countdowns.forEach(box => {
            const matchDate = new Date(box.getAttribute('data-date')).getTime();
            const distance = matchDate - now;
            
            const valueSpan = box.querySelector('.countdown-value');
            if(!valueSpan) return;
            
            if (distance < 0) {
                valueSpan.innerHTML = "MATCH STARTED";
                return;
            }
            
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            
            const pad = (n) => n < 10 ? '0' + n : n;
            valueSpan.innerHTML = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        });
    }, 1000);
}





function renderMatchesGrid() {
    const grid = document.getElementById("matches-grid");
    grid.innerHTML = "";
    
    const now = new Date();
    
    let filtered = allMatches;
    if (currentFilter !== "all") {
        filtered = allMatches.filter(m => m.leagueName === currentFilter);
    }
    
    // Sort logic: closest match first
    filtered.sort((a, b) => {
        return Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now);
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = `<p style="text-align:center; grid-column: 1/-1; color: var(--text-secondary)">Không có trận đấu nào.</p>`;
        return;
    }
    
    filtered.forEach(match => {
        const comp = match.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === "home");
        const away = comp.competitors.find(c => c.homeAway === "away");
        
        const dateObj = new Date(match.date);
    const formattedTime = formatMatchTime(dateObj);
        
        const statusType = comp.status.type.state; // "pre", "in", "post"
        const isLive = statusType === "in";
        
        let scoreDisplay = "VS";
        if (statusType === "in" || statusType === "post") {
            let hs = home.score !== undefined ? home.score : "0";
            let as = away.score !== undefined ? away.score : "0";
            scoreDisplay = `${hs} : ${as}`;
        }
        
        const opponent = home.team.id === TEAM_ID ? away : home;
        const opponentId = opponent.team.id;
        
        let derbyName = "";
        let derbyClass = "";
        if (["364", "382", "357"].includes(opponentId)) {
            derbyName = "DERBY";
            derbyClass = "derby-match";
        } else if (["359", "363", "367", "361"].includes(opponentId)) {
            derbyName = "SUPER MATCH";
            derbyClass = "super-match";
        }
        
        const isBigMatch = ["359", "363", "364", "382", "367", "361"].includes(opponentId);
        const bigMatchClass = isBigMatch ? "big-match" : "";
        const finalClasses = `match-card clickable-card ${bigMatchClass} ${derbyClass}`.trim();
        
        grid.innerHTML += `
            <div class="${finalClasses}" onclick="openMatchModal('${match.id}')" style="position: relative;">
                ${derbyName ? `<div class="derby-label" style="display:inline-block; background: linear-gradient(90deg, #ff0000, #8b0000); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 15px; border-radius: 12px; margin-bottom: 10px; letter-spacing: 1px; box-shadow: 0 0 15px rgba(255,0,0,0.6); position: absolute; top: -12px; left: 50%; transform: translateX(-50%); z-index: 5;">${derbyName}</div>` : ''}
                <div class="card-header" style="justify-content:center; flex-direction:column; align-items:center; color:var(--text-secondary); font-weight:700; font-size:14px; margin-bottom:20px; border-bottom: none; gap:4px;">
                    <div>${formattedTime} ${isLive ? '<span class="card-status live" style="margin-left:8px;">LIVE</span>' : ''}</div>
                    <div style="font-size:14px; color:#fff; font-weight: 700;">${match.leagueName || match.season?.displayName || "Tournament"}</div>
                </div>
                <div class="card-teams-inline" style="display:flex; justify-content:center; align-items:center; gap: 24px;">
                    <div class="team-left" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                        <img src="${home.team.logo || home.team.logos?.[0]?.href || ''}" alt="${home.team.name}" style="width:50px; height:50px; object-fit:contain;">
                        <span class="card-team-name ${home.winner ? 'card-winner' : ''}" style="font-size:18px; font-weight: 700; font-family: 'Google Sans Flex', sans-serif; text-transform: uppercase;">${getTeamAbbr(home.team)}</span>
                    </div>
                    <div class="match-score" style="font-weight: 700; font-size:32px; font-family: 'Google Sans Flex', sans-serif; white-space:nowrap; padding:0 10px; color: ${isLive ? 'var(--primary-color)' : 'var(--text-primary)'}; text-shadow: ${isLive ? '0 0 15px var(--primary-color)' : 'none'};">
                        ${scoreDisplay}
                    </div>
                    <div class="team-right" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                        <img src="${away.team.logo || away.team.logos?.[0]?.href || ''}" alt="${away.team.name}" style="width:50px; height:50px; object-fit:contain;">
                        <span class="card-team-name ${away.winner ? 'card-winner' : ''}" style="font-size:18px; font-weight: 700; font-family: 'Google Sans Flex', sans-serif; text-transform: uppercase;">${getTeamAbbr(away.team)}</span>
                    </div>
                </div>
                <div class="card-footer" style="text-align:center; color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; margin-top:20px; font-family: 'Google Sans Flex', sans-serif; opacity: 0.8;">
                    ${comp.venue?.fullName || "Sân chưa xác định"}
                </div>
            </div>
        `;
    });
}

async function loadStandings() {
    const tbody = document.getElementById("standings-body");
    try {
        const res = await fetch(API_STANDINGS);
        const data = await res.json();
        
        const standings = data.children?.[0]?.standings?.entries || [];
        
        if (standings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">Không có dữ liệu bảng xếp hạng.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = "";
        standings.forEach(row => {
            const team = row.team;
            const stats = row.stats; // Array of stat objects
            
            // Helper to find stat
            const getStat = (name) => {
                const s = stats.find(x => x.name === name || x.abbreviation === name);
                return s ? s.displayValue : "0";
            };
            
            const isMU = String(team.id) === TEAM_ID;
            
            tbody.innerHTML += `
                <tr class="${isMU ? "highlight-mu" : ""}">
                    <td class="col-pos">${getStat("rank") || row.stats.find(s=>s.type==="rank")?.displayValue || "-"}</td>
                    <td class="col-team">
                        <img src="${team.logos?.[0]?.href || ''}" alt="${team.name}">
                        <span class="desktop-name">${team.name}</span>
                    </td>
                    <td class="col-pld">${getStat("GP") || getStat("gamesPlayed")}</td>
                    <td class="col-gd">${getStat("GD") || getStat("pointDifferential")}</td>
                    <td class="col-pts">${getStat("P") || getStat("points")}</td>
                    <td class="col-w">${getStat("W") || getStat("wins")}</td>
                    <td class="col-d">${getStat("D") || getStat("ties")}</td>
                    <td class="col-l">${getStat("L") || getStat("losses")}</td>
                </tr>
            `;
        });
        
    } catch (err) {
        console.error("Lỗi khi tải bảng xếp hạng:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="color:red;">Lỗi tải dữ liệu.</td></tr>`;
    }
}

async function loadRoster() {
    const grid = document.getElementById("squad-grid");
    try {
        const res = await fetch('roster.json');
        const data = await res.json();
        
        
        const athletes = data.athletes || [];
        
        // Sắp xếp Đội hình:
        // 1. Group: GK, DF, MF, FW
        // 2. Không có số (hoặc '-') thì cho xuống cuối
        // 3. Có số thì xếp theo số
        const posOrder = {
            "Goalkeeper": 1,
            "Defender": 2,
            "Midfielder": 3,
            "Forward": 4
        };
        
        allPlayers = athletes;
        athletes.sort((a, b) => {
            const numA = parseInt(a.jersey);
            const numB = parseInt(b.jersey);
            
            const hasNumA = !isNaN(numA);
            const hasNumB = !isNaN(numB);
            
            // Xử lý không có số xuống cuối
            if (hasNumA && !hasNumB) return -1;
            if (!hasNumA && hasNumB) return 1;
            
            // Nếu cả 2 đều không có số hoặc đều có số, xét tiếp vị trí
            const pA = posOrder[a.position?.name] || 5;
            const pB = posOrder[b.position?.name] || 5;
            
            if (pA !== pB) return pA - pB;
            
            // Nếu cùng vị trí và có số, xét theo số
            if (hasNumA && hasNumB) {
                return numA - numB;
            }
            return 0;
        });


        
        if (athletes.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center;">Không có dữ liệu đội hình.</p>`;
            return;
        }
        
        grid.innerHTML = "";
        
        const renderPlayer = (player) => {
            const firstName = player.firstName || player.displayName.split(' ')[0] || '';
            const lastName = player.lastName || player.displayName.substring(firstName.length).trim() || '';
            return `
                <div class="player-card clickable-card" onclick="openPlayerModal('${player.id}')">
                    ${player.displayName === 'Bruno Fernandes' ? '<div class="captain-badge">C</div>' : ''}
                    <img class="player-photo" src="${player.headshot?.href || 'nopic.png'}" alt="${player.displayName}">
                    <div class="player-info">
                        <div class="player-name-wrapper">
                            <span class="first-name">${firstName}</span>
                            <span class="last-name">${lastName}</span>
                        </div>
                        <div class="player-number-wrapper">
                            
                            <span class="player-number">${player.jersey || "-"}</span>
                        </div>
                    </div>
                </div>
            `;
        };

        // Handle ESPN's grouped vs flat roster structure
        // Usually athletes array contains objects that either have `items` (grouped) or are flat.
        if (athletes[0] && athletes[0].items) {
            // Grouped structure
            athletes.forEach(group => {
                group.items.forEach(player => {
                    grid.innerHTML += renderPlayer(player);
                });
            });
        } else {
            // Flat structure
            athletes.forEach(player => {
                grid.innerHTML += renderPlayer(player);
            });
        }
        
    } catch (err) {
        console.error("Lỗi tải đội hình:", err);
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:red;">Lỗi tải dữ liệu.</p>`;
    }
}

// Hamburger menu logic
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = hamburger.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = hamburger.querySelector('i');
                if(icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }
});


// Modal Logic
function openMatchModal(matchId) {
    const match = allMatches.find(m => m.id === matchId);
    if (!match) return;
    
    const dateObj = new Date(match.date);
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${dayNames[dateObj.getDay()]}, ${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
    
    const comp = match.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    
    const isLive = comp.status.type.state === 'in';
    const isPost = comp.status.type.state === 'post';
    
    let scoreDisplay = "VS";
    let statusDisplay = timeStr;
    
    if (isLive || isPost) {
        scoreDisplay = `${home.score || 0} - ${away.score || 0}`;
        statusDisplay = isLive ? (comp.status.displayClock ? comp.status.displayClock + "'" : "LIVE") : "FT";
    }
    
    // Parse Scorers
    let homeScorersHTML = '';
    let awayScorersHTML = '';
    
    if (isLive || isPost) {
        const details = comp.details || [];
        const goals = details.filter(d => d.scoringPlay === true || d.type.text === "Goal" || d.type.text === "Penalty - Scored");
        
        goals.forEach(g => {
            let scorer = "Unknown";
            let teamId = null;
            if (g.participants && g.participants[0] && g.participants[0].athlete) {
                scorer = g.participants[0].athlete.shortName || g.participants[0].athlete.displayName;
            }
            if (g.team && g.team.id) {
                teamId = g.team.id;
            }
            const isPenalty = g.type.text.includes("Penalty") ? " (P)" : "";
            const isOwnGoal = g.type.text.includes("Own") ? " (OG)" : "";
            const time = g.clock && g.clock.displayValue ? g.clock.displayValue : "?'";
            
            const itemHTML = `<div class="modal-scorer-item">⚽ ${scorer} ${time}${isPenalty}${isOwnGoal}</div>`;
            if (teamId === home.team.id) homeScorersHTML += itemHTML;
            if (teamId === away.team.id) awayScorersHTML += itemHTML;
        });
    }

    const venue = comp.venue && comp.venue.fullName ? comp.venue.fullName : "Chưa xác định";
    const leagueName = match.leagueName || "Tournament";

    
    // Determine card classes
    const TEAM_ID = "360";
    const opponent = home.team.id === TEAM_ID ? away : home;
    const opponentId = opponent.team.id;
    let derbyName = "";
    let derbyClass = "";
    if (["364", "382", "357"].includes(opponentId)) {
        derbyName = "DERBY";
        derbyClass = "derby-match";
    } else if (["359", "363", "367", "361"].includes(opponentId)) {
        derbyName = "SUPER MATCH";
        derbyClass = "super-match";
    }
    const isBigMatch = ["359", "363", "364", "382", "367", "361"].includes(opponentId);
    const bigMatchClass = isBigMatch ? "big-match" : "";
    const finalClasses = `match-card ${bigMatchClass} ${derbyClass}`.trim();

    const modalContent = `
        <div class="${finalClasses}" style="margin: 0; width: 100%; cursor: default; transform: none; position: relative; overflow: visible;">
            ${derbyName ? `<div class="derby-label" style="display:inline-block; background: linear-gradient(90deg, #ff0000, #8b0000); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 15px; border-radius: 12px; margin-bottom: 10px; letter-spacing: 1px; box-shadow: 0 0 15px rgba(255,0,0,0.6); position: absolute; top: -12px; left: 50%; transform: translateX(-50%); z-index: 5;">${derbyName}</div>` : ''}
            ${!derbyClass ? `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, var(--primary-color), #8b0000); border-radius: 20px 20px 0 0;"></div>` : ''}
            
            <div class="card-header" style="justify-content:center; flex-direction:column; align-items:center; color:var(--text-secondary); font-weight:700; font-size:14px; margin-bottom:20px; border-bottom: none; gap:4px;">
                <div>${timeStr}, ${dateStr} ${isLive ? '<span class="card-status live" style="margin-left:8px;">LIVE</span>' : ''}</div>
                <div style="font-size:14px; color:#fff; font-weight: 700; text-transform: uppercase;">${leagueName}</div>
            </div>
            
            <div class="card-teams-inline" style="display:flex; justify-content:center; align-items:center; gap: 24px;">
                <div class="team-left" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                    <img src="${home.team.logo || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png'}" alt="${home.team.name}" style="width:60px; height:60px; object-fit:contain;">
                    <span class="card-team-name" style="font-size:20px; font-weight: 700; font-family: 'Google Sans Flex', sans-serif; text-transform: uppercase;">${home.team.abbreviation || home.team.name}</span>
                </div>
                <div class="match-score" style="font-weight: 700; font-size:36px; font-family: 'Google Sans Flex', sans-serif; white-space:nowrap; padding:0 10px; color: ${isLive ? 'var(--primary-color)' : 'var(--text-primary)'}; text-shadow: ${isLive ? '0 0 15px var(--primary-color)' : 'none'};">
                    ${scoreDisplay}
                </div>
                <div class="team-right" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                    <img src="${away.team.logo || 'https://a.espncdn.com/i/teamlogos/soccer/500/default-team-logo-500.png'}" alt="${away.team.name}" style="width:60px; height:60px; object-fit:contain;">
                    <span class="card-team-name" style="font-size:20px; font-weight: 700; font-family: 'Google Sans Flex', sans-serif; text-transform: uppercase;">${away.team.abbreviation || away.team.name}</span>
                </div>
            </div>
            
            <div style="text-align: center; font-size: 13px; color: var(--text-secondary); margin-top: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                ${venue}
            </div>
            
            ${(homeScorersHTML || awayScorersHTML) ? `
            <div class="modal-scorers" style="margin-top: 25px; display:flex; justify-content:space-between; font-size:13px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                <div class="modal-scorers-home" style="width:48%; text-align: left;">${homeScorersHTML}</div>
                <div class="modal-scorers-away" style="width:48%; text-align: right;">${awayScorersHTML}</div>
            </div>` : ''}
        </div>
    `;
    
    document.getElementById("modal-match-details").innerHTML = modalContent;
    document.getElementById("match-modal").classList.add("active");
    document.body.style.overflow = "hidden"; // Prevent background scrolling
}

function closeMatchModal() {
    document.getElementById("match-modal").classList.remove("active");
    document.body.style.overflow = "";
}

// Close on overlay click
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("match-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeMatchModal();
        });
    }
});


function openPlayerModal(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    const avatarUrl = player.headshot && player.headshot.href ? player.headshot.href : 'https://a.espncdn.com/i/headshots/soccer/players/full/default-player.png';
    const flagUrl = player.flag && player.flag.href ? player.flag.href : '';
    
    const flagImg = flagUrl ? `<img src="${flagUrl}" alt="${player.citizenship}">` : '';
    const numberDisplay = player.jersey && player.jersey !== "-" ? player.jersey : "N/A";
    const heightDisplay = player.displayHeight || "N/A";
    const weightDisplay = player.displayWeight || "N/A";
    const ageDisplay = player.age ? `${player.age} tuổi` : "N/A";
    const positionName = player.position && player.position.displayName ? player.position.displayName : "Unknown";

    const modalContent = `
        <img src="${avatarUrl}" alt="${player.fullName}" class="player-modal-avatar">
        <div class="player-modal-name">${player.displayName || player.fullName}</div>
        <div class="player-modal-pos">${positionName}</div>
        
        <div class="player-modal-grid">
            <div class="player-modal-stat">
                <div class="player-modal-stat-label">Số Áo</div>
                <div class="player-modal-stat-value">#${numberDisplay}</div>
            </div>
            <div class="player-modal-stat">
                <div class="player-modal-stat-label">Quốc Tịch</div>
                <div class="player-modal-stat-value">${flagImg} ${player.citizenship || "N/A"}</div>
            </div>
            <div class="player-modal-stat">
                <div class="player-modal-stat-label">Tuổi</div>
                <div class="player-modal-stat-value">${ageDisplay}</div>
            </div>
            <div class="player-modal-stat">
                <div class="player-modal-stat-label">Chiều Cao</div>
                <div class="player-modal-stat-value">${heightDisplay}</div>
            </div>
            <div class="player-modal-stat">
                <div class="player-modal-stat-label">Cân Nặng</div>
                <div class="player-modal-stat-value">${weightDisplay}</div>
            </div>
        </div>
    `;
    
    document.getElementById("modal-player-details").innerHTML = modalContent;
    document.getElementById("player-modal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closePlayerModal() {
    document.getElementById("player-modal").classList.remove("active");
    document.body.style.overflow = "";
}

// Attach overlay click for player modal
document.addEventListener("DOMContentLoaded", () => {
    const pModal = document.getElementById("player-modal");
    if (pModal) {
        pModal.addEventListener("click", (e) => {
            if (e.target === pModal) closePlayerModal();
        });
    }
});
