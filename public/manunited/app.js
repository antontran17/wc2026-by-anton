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
let currentFilter = "all"; // all, upcoming, completed

document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    loadSchedule();
    loadStandings();
    loadRoster();
});

function initNavigation() {
    const tabs = document.querySelectorAll(".tab-btn");
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
                    const [resEpl, resFriendly] = await Promise.all([
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260801-20270530&limit=380`),
                        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/club.friendly/scoreboard?dates=20260701-20260830&limit=380`)
                    ]);
                    const dataEpl = await resEpl.json();
                    const dataFriendly = await resFriendly.json();
                    
                    const eplEvents = (dataEpl.events || []).map(e => ({...e, leagueName: dataEpl.leagues?.[0]?.name || "English Premier League"}));
                    const friendlyEvents = (dataFriendly.events || []).map(e => ({...e, leagueName: dataFriendly.leagues?.[0]?.name || "Club Friendlies"}));
                    const allMatches2026 = [...eplEvents, ...friendlyEvents];
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
            renderNextMatch(upcomingMatches[0]);
        } else {
            document.getElementById("next-match-container").innerHTML = `<p style="text-align:center; color: var(--text-secondary)">Hiện chưa có lịch thi đấu tiếp theo.</p>`;
        }
        
        renderMatchesGrid();
    } catch (err) {
        console.error("Lỗi khi tải lịch thi đấu:", err);
        document.getElementById("matches-grid").innerHTML = `<p style="color: red;">Không thể tải dữ liệu. Vui lòng thử lại sau.</p>`;
    }
}

function renderNextMatch(match) {
    const container = document.getElementById("next-match-container");
    const comp = match.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === "home");
    const away = comp.competitors.find(c => c.homeAway === "away");
    
    const dateObj = new Date(match.date);
    const formattedTime = formatMatchTime(dateObj);
    
    const statusText = comp.status.type.detail;
    
    container.innerHTML = `
        <div class="next-match-card">
            <div style="text-align: center;">
                <div class="match-status-badge">${statusText}</div>
            </div>
            <div class="match-teams">
                <div class="team-box">
                    <img src="${home.team.logo || home.team.logos?.[0]?.href || ''}" alt="${home.team.name}">
                    <span>${home.team.shortDisplayName}</span>
                </div>
                <div class="match-vs">VS</div>
                <div class="team-box">
                    <img src="${away.team.logo || away.team.logos?.[0]?.href || ''}" alt="${away.team.name}">
                    <span>${away.team.shortDisplayName}</span>
                </div>
            </div>
            <div class="match-time-info">
                <strong>${formattedTime}</strong> <br>
                <span style="font-weight:700; color:#fff;">${match.leagueName || match.season?.displayName || "Tournament"}</span> <br>
                <small>${comp.venue?.fullName || "Sân chưa xác định"}</small>
            </div>
        </div>
    `;
}

function renderMatchesGrid() {
    const grid = document.getElementById("matches-grid");
    grid.innerHTML = "";
    
    const now = new Date();
    
    let filtered = allMatches;
    if (currentFilter === "upcoming") {
        filtered = allMatches.filter(m => new Date(m.date) > now);
    } else if (currentFilter === "completed") {
        filtered = allMatches.filter(m => new Date(m.date) <= now);
    }
    
    // Sort logic: if upcoming, ascending. If completed, descending. If all, closest match first.
    filtered.sort((a, b) => {
        if (currentFilter === "upcoming") {
            return new Date(a.date) - new Date(b.date);
        } else if (currentFilter === "completed") {
            return new Date(b.date) - new Date(a.date);
        } else {
            // "all": trận gần nhất (closest to now) lên đầu
            return Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now);
        }
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
        
        let homeScore = home.score !== undefined ? home.score : "-";
        let awayScore = away.score !== undefined ? away.score : "-";
        
        const opponent = home.team.id === TEAM_ID ? away : home;
        const isBigMatch = ["359", "363", "364", "382", "367", "361"].includes(opponent.team.id);
        const bigMatchClass = isBigMatch ? "big-match" : "";
        
        grid.innerHTML += `
            <div class="match-card ${bigMatchClass}">
                <div class="card-header" style="justify-content:center; flex-direction:column; align-items:center; color:var(--text-secondary); font-weight:700; font-size:14px; margin-bottom:20px; border-bottom: none; gap:4px;">
                    <div>${formattedTime} ${isLive ? '<span class="card-status live" style="margin-left:8px;">LIVE</span>' : ''}</div>
                    <div style="font-size:14px; color:#fff; font-weight:800;">${match.leagueName || match.season?.displayName || "Tournament"}</div>
                </div>
                <div class="card-teams-inline" style="display:flex; justify-content:center; align-items:center; gap: 24px;">
                    <div class="team-left" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                        <img src="${home.team.logo || home.team.logos?.[0]?.href || ''}" alt="${home.team.name}" style="width:50px; height:50px; object-fit:contain;">
                        <span class="card-team-name ${home.winner ? 'card-winner' : ''}" style="font-size:18px; font-weight:800; font-family:'Outfit', sans-serif; text-transform: uppercase;">${home.team.abbreviation || home.team.shortDisplayName}</span>
                    </div>
                    <div class="match-score" style="font-weight:800; font-size:32px; font-family:'Outfit', sans-serif; white-space:nowrap; padding:0 10px; color: ${isLive ? 'var(--primary-color)' : 'var(--text-primary)'}; text-shadow: ${isLive ? '0 0 15px var(--primary-color)' : 'none'};">
                        ${homeScore} : ${awayScore}
                    </div>
                    <div class="team-right" style="display:flex; flex-direction:column; align-items:center; flex:1; gap: 8px;">
                        <img src="${away.team.logo || away.team.logos?.[0]?.href || ''}" alt="${away.team.name}" style="width:50px; height:50px; object-fit:contain;">
                        <span class="card-team-name ${away.winner ? 'card-winner' : ''}" style="font-size:18px; font-weight:800; font-family:'Outfit', sans-serif; text-transform: uppercase;">${away.team.abbreviation || away.team.shortDisplayName}</span>
                    </div>
                </div>
                <div class="card-footer" style="text-align:center; color:var(--text-secondary); font-size:12px; font-weight:700; text-transform:uppercase; margin-top:20px; font-family:'Outfit', sans-serif; opacity: 0.8;">
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
                    <td class="col-w">${getStat("W") || getStat("wins")}</td>
                    <td class="col-d">${getStat("D") || getStat("ties")}</td>
                    <td class="col-l">${getStat("L") || getStat("losses")}</td>
                    <td class="col-gd">${getStat("GD") || getStat("pointDifferential")}</td>
                    <td class="col-pts">${getStat("P") || getStat("points")}</td>
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
            return `
                <div class="player-card">
                    <img class="player-photo" src="${player.headshot?.href || 'placeholder.png'}" alt="${player.displayName}">
                    <div class="player-number">${player.jersey || "-"}</div>
                    <div class="player-name">${player.displayName}</div>
                    <div class="player-position">${player.position?.name || ""}</div>
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
