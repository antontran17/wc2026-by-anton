import teams from '../worker-data/football.teams.json';
import matches from '../worker-data/football.matches.json';
import groups from '../worker-data/football.matchtables.json';
import stadiums from '../worker-data/football.stadiums.json';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITION = 'WC';
const FOOTBALL_DATA_SEASON = '2026';
const REMOTE_BASE = 'https://worldcup26.ir';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers
    }
  });
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

function alias(value) {
  const aliases = { usa: 'united states', 'u s a': 'united states', korea: 'south korea', czech: 'czech republic', 's africa': 'south africa', bosnia: 'bosnia and herzegovina', drc: 'congo dr', cod: 'congo dr', 'cote divoire': 'ivory coast' };
  const key = normalized(value);
  return aliases[key] || key;
}

const teamLookup = new Map();
for (const team of teams) {
  for (const key of [team.name_en, team.fifa_code, team.iso2]) {
    if (key) teamLookup.set(alias(key), team);
  }
}

function localTeam(apiTeam) {
  return teamLookup.get(alias(apiTeam?.name)) || teamLookup.get(alias(apiTeam?.shortName)) || teamLookup.get(alias(apiTeam?.tla)) || null;
}

function localMatch(home, away, utcDate) {
  const candidates = matches.filter((match) => String(match.home_team_id) === String(home?.id) && String(match.away_team_id) === String(away?.id));
  if (candidates.length < 2 || !utcDate) return candidates[0] || null;
  const time = Date.parse(utcDate);
  return candidates.map((match) => ({ match, delta: Math.abs(Date.parse(match.api_utc_date || 0) - time) })).sort((a, b) => a.delta - b.delta)[0]?.match || null;
}

function matchGroup(match, fallback) {
  if (fallback) return fallback;
  const group = String(match.group || '').toUpperCase().match(/^GROUP_([A-L])$/);
  if (group) return group[1];
  return { LAST_32: 'R32', LAST_16: 'R16', QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', THIRD_PLACE: '3RD', FINAL: 'FINAL' }[String(match.stage || '').toUpperCase()] || '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function mapMatch(match) {
  const home = localTeam(match.homeTeam);
  const away = localTeam(match.awayTeam);
  const local = localMatch(home, away, match.utcDate);
  const status = String(match.status || '').toUpperCase();
  const finished = ['FINISHED', 'AWARDED'].includes(status);
  const score = match.score?.fullTime || {};
  const penalties = match.score?.penalties || {};
  return {
    ...(local || {}),
    id: String(local?.id || match.id),
    football_data_id: match.id,
    api_utc_date: match.utcDate,
    home_team_id: String(home?.id || match.homeTeam?.id || ''),
    away_team_id: String(away?.id || match.awayTeam?.id || ''),
    home_team_name_en: match.homeTeam?.shortName || match.homeTeam?.name || local?.home_team_name_en,
    away_team_name_en: match.awayTeam?.shortName || match.awayTeam?.name || local?.away_team_name_en,
    home_score: String(score.home ?? 0),
    away_score: String(score.away ?? 0),
    score_duration: match.score?.duration || '',
    home_penalties: penalties.home == null ? '' : String(penalties.home),
    away_penalties: penalties.away == null ? '' : String(penalties.away),
    group: matchGroup(match, local?.group),
    matchday: String(match.matchday || local?.matchday || ''),
    local_date: local?.local_date || formatDate(match.utcDate),
    finished: finished ? 'TRUE' : 'FALSE',
    time_elapsed: finished ? 'finished' : (['IN_PLAY', 'PAUSED'].includes(status) ? 'live' : 'notstarted'),
    status,
    type: local?.type || (String(match.stage || '').toUpperCase() === 'GROUP_STAGE' ? 'group' : 'knockout'),
    source: 'football-data'
  };
}

async function liveGames(request, env, ctx) {
  const cacheKey = new Request(new URL('/__wc2026/games', request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;
  if (!env.FOOTBALL_DATA_TOKEN) return json({ games: matches, source: 'local', error: 'FOOTBALL_DATA_TOKEN is not configured' });
  try {
    const source = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=${FOOTBALL_DATA_SEASON}`, {
      headers: { accept: 'application/json', 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN }
    });
    if (!source.ok) throw new Error(`football-data.org ${source.status}`);
    const data = await source.json();
    if (!Array.isArray(data.matches) || !data.matches.length) throw new Error('Empty fixtures response');
    const response = json({ games: data.matches.map(mapMatch), source: 'football-data', cache_ttl_ms: 30000 }, { headers: { 'cache-control': 'public, max-age=30' } });
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return json({ games: matches, source: 'local', remote_error: error.message });
  }
}

async function scorerFeed(request, ctx) {
  const cacheKey = new Request(new URL('/__wc2026/scorer-feed', request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached.json();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${REMOTE_BASE}/get/games`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Scorer source ${response.status}`);
    const data = await response.json();
    const cacheResponse = json(data, { headers: { 'cache-control': 'public, max-age=300' } });
    ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function scorers(id, request, ctx) {
  try {
    const data = await scorerFeed(request, ctx);
    const game = (data.games || data).find((item) => String(item.id) === String(id));
    if (game) {
      return json({ id: String(game.id), home_scorers: game.home_scorers || 'null', away_scorers: game.away_scorers || 'null', source: 'worldcup26.ir' });
    }
  } catch (_) {
    // Fall through to the local schedule so a slow scorer source never breaks the popup.
  }

  const local = matches.find((item) => String(item.id) === String(id));
  return json({
    id: String(id),
    home_scorers: local?.home_scorers || 'null',
    away_scorers: local?.away_scorers || 'null',
    source: 'local-fallback'
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
    if (url.pathname === '/health') return json({ ok: true, service: 'wc2026-by-anton' });
    if (url.pathname === '/get/games') return liveGames(request, env, ctx);
    if (url.pathname === '/get/teams') return json({ teams, source: 'local' });
    if (url.pathname === '/get/groups') return json({ groups, source: 'local' });
    if (url.pathname === '/get/stadiums') return json({ stadiums, source: 'local' });
    if (url.pathname === '/get/source-status') return json({ results: [{ endpoint: '/get/games', source: env.FOOTBALL_DATA_TOKEN ? 'football-data' : 'local' }, { endpoint: '/get/teams', source: 'local' }, { endpoint: '/get/groups', source: 'local' }, { endpoint: '/get/stadiums', source: 'local' }] });
    const scorerMatch = url.pathname.match(/^\/get\/games\/([^/]+)\/scorers$/);
    if (scorerMatch) return scorers(decodeURIComponent(scorerMatch[1]), request, ctx);
    return env.ASSETS.fetch(request);
  }
};
