const fs = require('fs');
const path = require('path');

const REMOTE_BASE = process.env.REMOTE_API_BASE || 'https://worldcup26.ir';
const REMOTE_TIMEOUT_MS = Number(process.env.REMOTE_TIMEOUT_MS || 6000);
const CACHE_TTL_MS = Number(process.env.REMOTE_CACHE_TTL_MS || 60 * 1000);
const APIFOOTBALL_BASE = process.env.APIFOOTBALL_BASE || 'https://v3.football.api-sports.io';
const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY || process.env.API_FOOTBALL_KEY || '';
const APIFOOTBALL_LEAGUE = process.env.APIFOOTBALL_LEAGUE || '1';
const APIFOOTBALL_SEASON = process.env.APIFOOTBALL_SEASON || '2026';

const memoryCache = new Map();

function readJson(filename) {
    const full = path.join(__dirname, '..', filename);
    return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function normalizeLocalPayload(type, data) {
    if (Array.isArray(data)) {
        return { [type]: data, source: 'local' };
    }
    if (data && typeof data === 'object') {
        if (Array.isArray(data[type])) return { ...data, source: data.source || 'local' };
        return { [type]: data[type] || data.response || data.data || [], source: 'local' };
    }
    return { [type]: [], source: 'local' };
}

function normalizeRemotePayload(type, data) {
    if (Array.isArray(data)) {
        return { [type]: data, source: 'remote' };
    }
    if (data && typeof data === 'object') {
        if (Array.isArray(data[type])) return { ...data, source: 'remote' };
        if (Array.isArray(data.response)) return { [type]: data.response, source: 'remote' };
        if (Array.isArray(data.data)) return { [type]: data.data, source: 'remote' };
    }
    return { [type]: [], source: 'remote' };
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/gi, ' ')
        .trim()
        .toLowerCase();
}

function teamAliases(name) {
    const normalized = normalizeText(name);
    const aliases = {
        usa: 'united states',
        'u s a': 'united states',
        korea: 'south korea',
        czech: 'czech republic',
        's africa': 'south africa',
        bosnia: 'bosnia and herzegovina',
        drc: 'congo dr',
        cod: 'congo dr',
        'cote divoire': 'ivory coast',
        curacao: 'curacao'
    };
    return aliases[normalized] || normalized;
}

function buildTeamLookup(teams) {
    const lookup = new Map();
    teams.forEach((team) => {
        const keys = [
            team.name_en,
            team.fifa_code,
            team.iso2,
            teamAliases(team.name_en),
            teamAliases(team.fifa_code)
        ].filter(Boolean);

        keys.forEach((key) => {
            const normalized = teamAliases(key);
            if (normalized) lookup.set(normalized, team);
        });
    });
    return lookup;
}

function findLocalTeam(lookup, apiTeam) {
    const name = apiTeam && apiTeam.name;
    const code = apiTeam && apiTeam.code;
    return lookup.get(teamAliases(name)) || lookup.get(teamAliases(code)) || null;
}

function findLocalStadium(stadiums, venue) {
    const venueName = normalizeText(venue && venue.name);
    const venueCity = normalizeText(venue && venue.city);
    if (!venueName && !venueCity) return null;

    return stadiums.find((stadium) => {
        const names = [
            stadium.name_en,
            stadium.fifa_name,
            stadium.city_en
        ].map(normalizeText);
        return names.some((name) => name && (name === venueName || name.includes(venueName) || venueName.includes(name))) ||
            (venueCity && names.includes(venueCity));
    }) || null;
}

function findLocalGame(localGames, homeTeam, awayTeam, apiFixtureDate) {
    if (!homeTeam || !awayTeam) return null;
    const homeId = String(homeTeam.id);
    const awayId = String(awayTeam.id);
    const candidates = localGames.filter((game) =>
        String(game.home_team_id) === homeId && String(game.away_team_id) === awayId
    );

    if (candidates.length <= 1 || !apiFixtureDate) return candidates[0] || null;

    const targetTime = new Date(apiFixtureDate).getTime();
    return candidates
        .map((game) => ({ game, delta: Math.abs(new Date(game.api_utc_date || 0).getTime() - targetTime) }))
        .sort((a, b) => a.delta - b.delta)[0].game;
}

function groupFromRound(round, fallbackGroup) {
    const text = String(round || '').toLowerCase();
    if (fallbackGroup) return fallbackGroup;
    if (text.includes('round of 32')) return 'R32';
    if (text.includes('round of 16')) return 'R16';
    if (text.includes('quarter')) return 'QF';
    if (text.includes('semi')) return 'SF';
    if (text.includes('third')) return '3RD';
    if (text.includes('final')) return 'FINAL';
    return '';
}

function matchdayFromRound(round, fallbackMatchday) {
    const match = String(round || '').match(/(?:stage|round)\s*-\s*(\d+)/i);
    return match ? match[1] : (fallbackMatchday || '');
}

function apiFootballStatus(status) {
    const short = String(status && status.short || '').toUpperCase();
    const finished = ['FT', 'AET', 'PEN'].includes(short);
    const notStarted = ['TBD', 'NS', 'PST', 'CANC'].includes(short);
    return {
        finished: finished ? 'TRUE' : 'FALSE',
        time_elapsed: finished ? 'finished' : (notStarted ? 'notstarted' : String(status && status.elapsed || short || 'live')),
        status: short
    };
}

function formatUsDateFromUtc(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hour}:${minute}`;
}

function mapApiFootballFixture(fixture, context) {
    const localHome = findLocalTeam(context.teamLookup, fixture.teams && fixture.teams.home);
    const localAway = findLocalTeam(context.teamLookup, fixture.teams && fixture.teams.away);
    const localStadium = findLocalStadium(context.stadiums, fixture.fixture && fixture.fixture.venue);
    const localGame = findLocalGame(context.localGames, localHome, localAway, fixture.fixture && fixture.fixture.date);
    const status = apiFootballStatus(fixture.fixture && fixture.fixture.status);
    const apiDate = fixture.fixture && fixture.fixture.date;

    return {
        _id: localGame && localGame._id ? localGame._id : { api_football_id: fixture.fixture && fixture.fixture.id },
        id: localGame && localGame.id ? String(localGame.id) : String(fixture.fixture && fixture.fixture.id),
        api_football_id: fixture.fixture && fixture.fixture.id,
        api_utc_date: apiDate,
        home_team_id: localHome ? String(localHome.id) : String(fixture.teams && fixture.teams.home && fixture.teams.home.id || ''),
        away_team_id: localAway ? String(localAway.id) : String(fixture.teams && fixture.teams.away && fixture.teams.away.id || ''),
        home_team_name_en: fixture.teams && fixture.teams.home && fixture.teams.home.name,
        away_team_name_en: fixture.teams && fixture.teams.away && fixture.teams.away.name,
        home_score: String(fixture.goals && fixture.goals.home != null ? fixture.goals.home : 0),
        away_score: String(fixture.goals && fixture.goals.away != null ? fixture.goals.away : 0),
        home_scorers: localGame && localGame.home_scorers || 'null',
        away_scorers: localGame && localGame.away_scorers || 'null',
        group: groupFromRound(fixture.league && fixture.league.round, localGame && localGame.group),
        matchday: matchdayFromRound(fixture.league && fixture.league.round, localGame && localGame.matchday),
        local_date: localGame && localGame.local_date ? localGame.local_date : formatUsDateFromUtc(apiDate),
        stadium_id: localStadium ? String(localStadium.id) : (localGame && localGame.stadium_id || ''),
        finished: status.finished,
        time_elapsed: status.time_elapsed,
        status: status.status,
        type: localGame && localGame.type || (String(fixture.league && fixture.league.round || '').toLowerCase().includes('group') ? 'group' : 'knockout'),
        source: 'api-football'
    };
}

async function fetchApiFootballGames() {
    if (!APIFOOTBALL_KEY) {
        throw new Error('APIFOOTBALL_KEY is not configured');
    }

    const endpoint = `/fixtures?league=${encodeURIComponent(APIFOOTBALL_LEAGUE)}&season=${encodeURIComponent(APIFOOTBALL_SEASON)}`;
    const cacheKey = `api-football:${endpoint}`;
    const cached = memoryCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.time) < CACHE_TTL_MS) {
        return cached.payload;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

    try {
        const response = await fetch(`${APIFOOTBALL_BASE}${endpoint}`, {
            signal: controller.signal,
            headers: {
                'accept': 'application/json',
                'x-apisports-key': APIFOOTBALL_KEY,
                'user-agent': 'wc2026-by-anton/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`API-Football ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.errors && Object.keys(data.errors).length > 0) {
            throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
        }
        if (!Array.isArray(data.response) || data.response.length === 0) {
            throw new Error('API-Football returned empty fixtures');
        }

        const context = {
            localGames: normalizeLocalPayload('games', readJson('football.matches.json')).games,
            teams: normalizeLocalPayload('teams', readJson('football.teams.json')).teams,
            stadiums: normalizeLocalPayload('stadiums', readJson('football.stadiums.json')).stadiums
        };
        context.teamLookup = buildTeamLookup(context.teams);

        const payload = {
            games: data.response.map((fixture) => mapApiFootballFixture(fixture, context)),
            source: 'api-football',
            league: APIFOOTBALL_LEAGUE,
            season: APIFOOTBALL_SEASON
        };

        memoryCache.set(cacheKey, { time: now, payload });
        return payload;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchRemote(endpoint, type) {
    const url = `${REMOTE_BASE}${endpoint}`;
    const cached = memoryCache.get(endpoint);
    const now = Date.now();

    if (cached && (now - cached.time) < CACHE_TTL_MS) {
        return cached.payload;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'accept': 'application/json',
                'user-agent': 'wc2026-by-anton/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Remote API ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const payload = normalizeRemotePayload(type, data);
        memoryCache.set(endpoint, { time: now, payload });
        return payload;
    } finally {
        clearTimeout(timeout);
    }
}

async function sendRemoteFirst(req, res, endpoint, type, localFile) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');

    try {
        const remote = await fetchRemote(endpoint, type);
        if (Array.isArray(remote[type]) && remote[type].length > 0) {
            return res.send(remote);
        }
        throw new Error('Remote API returned empty data');
    } catch (err) {
        console.log(`⚠️ Remote API failed for ${endpoint}, using local fallback: ${err.message}`);
        try {
            const local = normalizeLocalPayload(type, readJson(localFile));
            local.remote_error = err.message;
            return res.send(local);
        } catch (localErr) {
            return res.status(500).send({
                [type]: [],
                source: 'error',
                error: `Remote failed: ${err.message}; Local failed: ${localErr.message}`
            });
        }
    }
}

async function sendGames(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');

    try {
        const apiFootball = await fetchApiFootballGames();
        return res.send(apiFootball);
    } catch (apiFootballErr) {
        console.log(`API-Football failed for /get/games, trying remote fallback: ${apiFootballErr.message}`);
        try {
            const remote = await fetchRemote('/get/games', 'games');
            if (Array.isArray(remote.games) && remote.games.length > 0) {
                remote.api_football_error = apiFootballErr.message;
                return res.send(remote);
            }
            throw new Error('Remote API returned empty data');
        } catch (remoteErr) {
            console.log(`Remote API failed for /get/games, using local fallback: ${remoteErr.message}`);
            try {
                const local = normalizeLocalPayload('games', readJson('football.matches.json'));
                local.api_football_error = apiFootballErr.message;
                local.remote_error = remoteErr.message;
                return res.send(local);
            } catch (localErr) {
                return res.status(500).send({
                    games: [],
                    source: 'error',
                    error: `API-Football failed: ${apiFootballErr.message}; Remote failed: ${remoteErr.message}; Local failed: ${localErr.message}`
                });
            }
        }
    }
}

module.exports = (app) => {
    app.get('/get/teams', (req, res) => {
        return sendRemoteFirst(req, res, '/get/teams', 'teams', 'football.teams.json');
    });

    app.get('/get/games', (req, res) => {
        return sendGames(req, res);
    });

    app.get('/get/stadiums', (req, res) => {
        return sendRemoteFirst(req, res, '/get/stadiums', 'stadiums', 'football.stadiums.json');
    });

    app.get('/get/groups', (req, res) => {
        return sendRemoteFirst(req, res, '/get/groups', 'groups', 'football.matchtables.json');
    });

    app.get('/get/source-status', async (req, res) => {
        const checks = [
            ['/get/games', 'games'],
            ['/get/teams', 'teams'],
            ['/get/groups', 'groups'],
            ['/get/stadiums', 'stadiums']
        ];

        const results = [];
        for (const [endpoint, type] of checks) {
            try {
                const data = endpoint === '/get/games' ? await fetchApiFootballGames() : await fetchRemote(endpoint, type);
                results.push({
                    endpoint,
                    source: endpoint === '/get/games' ? 'api-football' : 'remote',
                    count: Array.isArray(data[type]) ? data[type].length : 0
                });
            } catch (err) {
                results.push({
                    endpoint,
                    source: 'local-fallback',
                    error: err.message
                });
            }
        }

        res.send({
            remote_base: REMOTE_BASE,
            cache_ttl_ms: CACHE_TTL_MS,
            results
        });
    });
};
