import teams from '../worker-data/football.teams.json';
import matches from '../worker-data/football.matches.json';
import groups from '../worker-data/football.matchtables.json';
import stadiums from '../worker-data/football.stadiums.json';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITION = 'WC';
const FOOTBALL_DATA_SEASON = '2026';
const REMOTE_BASE = 'https://worldcup26.ir';
const ESPN_SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const SERVICE_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client);
    return existing ? existing.focus() : self.clients.openWindow('/#matches');
  }));
});
`;

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

function isFinishedMatch(match) {
  const status = String(match?.status || '').toUpperCase();
  return String(match?.finished || '').toUpperCase() === 'TRUE' || ['FINISHED', 'AWARDED'].includes(status);
}

function completedMatchCacheKey(match, request) {
  return new Request(new URL(`/__wc2026/final-match/${encodeURIComponent(match.id)}`, request.url));
}

async function cacheCompletedMatches(games, request) {
  await Promise.all(games.filter(isFinishedMatch).map(async (game) => {
    const key = completedMatchCacheKey(game, request);
    if (await caches.default.match(key)) return;
    const snapshot = json(game, { headers: { 'cache-control': 'public, max-age=2592000, immutable' } });
    await caches.default.put(key, snapshot);
  }));
}

async function completedScheduleFallback(request) {
  const snapshots = await Promise.all(matches.map(async (match) => {
    const cached = await caches.default.match(completedMatchCacheKey(match, request));
    return cached ? cached.json() : null;
  }));
  const byId = new Map(snapshots.filter(Boolean).map((match) => [String(match.id), match]));
  return matches.map((match) => byId.has(String(match.id)) ? { ...match, ...byId.get(String(match.id)) } : match);
}

function freshGamesResponse(data) {
  return json(data, { headers: { 'cache-control': 'no-store, max-age=0, must-revalidate', 'cdn-cache-control': 'no-store' } });
}

async function liveGames(request, env, ctx) {
  if (!env.FOOTBALL_DATA_TOKEN) return freshGamesResponse({ games: await completedScheduleFallback(request), source: 'local', error: 'FOOTBALL_DATA_TOKEN is not configured', cache_ttl_ms: 0 });
  try {
    const source = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=${FOOTBALL_DATA_SEASON}`, {
      headers: { accept: 'application/json', 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN, 'cache-control': 'no-cache' }
    });
    if (!source.ok) throw new Error(`football-data.org ${source.status}`);
    const data = await source.json();
    if (!Array.isArray(data.matches) || !data.matches.length) throw new Error('Empty fixtures response');
    const mappedGames = data.matches.map(mapMatch);
    ctx.waitUntil(cacheCompletedMatches(mappedGames, request));
    return freshGamesResponse({ games: mappedGames, source: 'football-data', cache_ttl_ms: 0 });
  } catch (error) {
    return freshGamesResponse({ games: await completedScheduleFallback(request), source: 'local', remote_error: error.message, cache_ttl_ms: 0 });
  }
}

async function scorerFeed(request, ctx) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${REMOTE_BASE}/get/games`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Scorer source ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function localTeamName(teamId) {
  return teams.find((team) => String(team.id) === String(teamId))?.name_en || '';
}

function espnDate(localDate) {
  const match = String(localDate || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}${match[1]}${match[2]}` : '';
}

async function espnScorers(id, request, ctx) {
  const cacheKey = new Request(new URL(`/__wc2026/espn-scorers/${id}`, request.url));
  const local = matches.find((item) => String(item.id) === String(id));
  if (isFinishedMatch(local)) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached.json();
  }
  const date = espnDate(local?.local_date);
  const homeName = localTeamName(local?.home_team_id);
  const awayName = localTeamName(local?.away_team_id);
  if (!date || !homeName || !awayName) return null;

  const scoreboard = await fetch(`${ESPN_SCOREBOARD_BASE}/scoreboard?dates=${date}`, { headers: { accept: 'application/json' } });
  if (!scoreboard.ok) throw new Error(`ESPN scoreboard ${scoreboard.status}`);
  const scoreboardData = await scoreboard.json();
  const event = (scoreboardData.events || []).find((candidate) => {
    const competitors = candidate.competitions?.[0]?.competitors || [];
    const home = competitors.find((team) => team.homeAway === 'home')?.team?.displayName;
    const away = competitors.find((team) => team.homeAway === 'away')?.team?.displayName;
    return alias(home) === alias(homeName) && alias(away) === alias(awayName);
  });
  if (!event?.id) return null;

  const summary = await fetch(`${ESPN_SCOREBOARD_BASE}/summary?event=${event.id}`, { headers: { accept: 'application/json' } });
  if (!summary.ok) throw new Error(`ESPN summary ${summary.status}`);
  const summaryData = await summary.json();
  const homeGoals = [];
  const awayGoals = [];
  for (const play of summaryData.keyEvents || []) {
    if (!play.scoringPlay) continue;
    const player = play.participants?.[0]?.athlete?.displayName || play.shortText || 'Goal';
    const minute = play.clock?.displayValue || '';
    const item = `${player}${minute ? ` ${minute}` : ''}`;
    if (alias(play.team?.displayName) === alias(homeName)) homeGoals.push(item);
    if (alias(play.team?.displayName) === alias(awayName)) awayGoals.push(item);
  }

  const payload = { id: String(id), home_scorers: homeGoals.join(', ') || 'null', away_scorers: awayGoals.join(', ') || 'null', source: 'espn' };
  if (event.status?.type?.completed) {
    const cacheResponse = json(payload, { headers: { 'cache-control': 'public, max-age=2592000, immutable' } });
    ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
  }
  return payload;
}

async function scorers(id, request, ctx) {
  try {
    const espn = await espnScorers(id, request, ctx);
    if (espn) return json(espn);
  } catch (_) {
    // ESPN is the primary event feed; the legacy feed below remains a fallback.
  }

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
    const visitorScheme = request.headers.get('cf-visitor')?.match(/"scheme"\s*:\s*"([^"]+)"/i)?.[1];
    const forwardedScheme = request.headers.get('x-forwarded-proto');
    if (url.hostname === 'attak.online' && (url.protocol === 'http:' || visitorScheme === 'http' || forwardedScheme === 'http')) {
      return Response.redirect(`https://attak.online${url.pathname}${url.search}`, 308);
    }
    if (url.pathname === '/sw.js') {
      return new Response(SERVICE_WORKER, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
    }
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
