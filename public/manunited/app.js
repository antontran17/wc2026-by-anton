const TEAM_ID = "360"; // Manchester United
const API_SCHEDULE = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${TEAM_ID}/schedule`;
const API_STANDINGS = `https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings`;
const API_ROSTER = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/${TEAM_ID}/roster`;

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
                const res = await fetch(`${API_SCHEDULE}?season=${year}`);
                const data = await res.json();
                return data.events || [];
            } catch (e) {
                return [];
            }
        };

        const [events2025, events2026] = await Promise.all([
            fetchSeason("2025"),
            fetchSeason("2026")
        ]);
        
        allMatches = [...events2025, ...events2026];
        
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
    const dateStr = dateObj.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    const timeStr = dateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    
    const statusText = comp.status.type.detail;
    
    container.innerHTML = `
        <div class="next-match-card">
            <div style="text-align: center;">
                <div class="match-status-badge">${statusText}</div>
            </div>
            <div class="match-teams">
                <div class="team-box">
                    <img src="${home.team.logos?.[0]?.href || ''}" alt="${home.team.name}">
                    <span>${home.team.shortDisplayName}</span>
                </div>
                <div class="match-vs">VS</div>
                <div class="team-box">
                    <img src="${away.team.logos?.[0]?.href || ''}" alt="${away.team.name}">
                    <span>${away.team.shortDisplayName}</span>
                </div>
            </div>
            <div class="match-time-info">
                <strong>${timeStr}</strong> &bull; ${dateStr} <br>
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
    
    // Sort logic: if upcoming, ascending. If completed, descending. If all, descending.
    filtered.sort((a, b) => {
        if (currentFilter === "upcoming") {
            return new Date(a.date) - new Date(b.date);
        }
        return new Date(b.date) - new Date(a.date);
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
        const dateStr = dateObj.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
        const timeStr = dateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        
        const statusType = comp.status.type.state; // "pre", "in", "post"
        const isLive = statusType === "in";
        
        let homeScore = home.score !== undefined ? home.score : "-";
        let awayScore = away.score !== undefined ? away.score : "-";
        
        grid.innerHTML += `
            <div class="match-card">
                <div class="card-header">
                    <span>${dateStr} - ${timeStr}</span>
                    <span class="card-status ${isLive ? "live" : ""}">${isLive ? "LIVE" : comp.status.type.detail}</span>
                </div>
                <div class="card-teams">
                    <div class="card-team-row">
                        <img src="${home.team.logos?.[0]?.href || ''}" alt="${home.team.name}">
                        <div class="card-team-name">${home.team.displayName}</div>
                        <div class="card-team-score ${home.winner ? "card-winner" : ""}">${homeScore}</div>
                    </div>
                    <div class="card-team-row">
                        <img src="${away.team.logos?.[0]?.href || ''}" alt="${away.team.name}">
                        <div class="card-team-name">${away.team.displayName}</div>
                        <div class="card-team-score ${away.winner ? "card-winner" : ""}">${awayScore}</div>
                    </div>
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
        const res = await fetch(API_ROSTER);
        const data = await res.json();
        
        const athletes = data.athletes || [];
        
        if (athletes.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center;">Không có dữ liệu đội hình.</p>`;
            return;
        }
        
        grid.innerHTML = "";
        
        const renderPlayer = (player) => {
            return `
                <div class="player-card">
                    <img class="player-photo" src="${player.headshot?.href || 'https://a.espncdn.com/i/headshots/soccer/players/full/default.png'}" alt="${player.displayName}">
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
