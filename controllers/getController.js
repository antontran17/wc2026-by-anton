const fs = require('fs');
const path = require('path');

const REMOTE_BASE = process.env.REMOTE_API_BASE || 'https://worldcup26.ir';
const REMOTE_TIMEOUT_MS = Number(process.env.REMOTE_TIMEOUT_MS || 6000);
const CACHE_TTL_MS = Number(process.env.REMOTE_CACHE_TTL_MS || 60 * 1000);

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

module.exports = (app) => {
    app.get('/get/teams', (req, res) => {
        return sendRemoteFirst(req, res, '/get/teams', 'teams', 'football.teams.json');
    });

    app.get('/get/games', (req, res) => {
        return sendRemoteFirst(req, res, '/get/games', 'games', 'football.matches.json');
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
                const data = await fetchRemote(endpoint, type);
                results.push({
                    endpoint,
                    source: 'remote',
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
