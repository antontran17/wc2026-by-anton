import teams from '../worker-data/football.teams.json';
import matches from '../worker-data/football.matches.json';
import groups from '../worker-data/football.matchtables.json';
import stadiums from '../worker-data/football.stadiums.json';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_DATA_COMPETITION = 'WC';
const FOOTBALL_DATA_SEASON = '2026';
const ESPN_SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const ESPN_STATISTICS_ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics?season=2026';
const LIVE_SOURCE_TIMEOUT_MS = 6500;
const SCORER_SOURCE_TIMEOUT_MS = 5000;
const CACHE_ORIGIN = 'https://attak.online';
const CRON_INTERVAL_MS = 15 * 60 * 1000;
const GROUP_STAGE_SETTLE_MS = 135 * 60 * 1000;
const KNOCKOUT_SETTLE_MS = 195 * 60 * 1000;
let gamesFetchInFlight = null;
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
  const aliases = { usa: 'united states', 'u s a': 'united states', korea: 'south korea', czech: 'czech republic', 's africa': 'south africa', bosnia: 'bosnia and herzegovina', 'bosnia h': 'bosnia and herzegovina', drc: 'congo dr', cod: 'congo dr', 'cote divoire': 'ivory coast' };
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

function apiTeamName(apiTeam) {
  const values = [apiTeam?.shortName, apiTeam?.name, apiTeam?.tla]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const value = values.find((item) => !/^(undefined|null|tbd)$/i.test(item));
  return value || '';
}

function mergeApiTeam(localId, localName, apiTeam) {
  const team = localTeam(apiTeam);
  const name = apiTeamName(apiTeam);
  return {
    id: String(team?.id || localId || ''),
    name: name || localName || ''
  };
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
    home_team_label: local?.home_team_label || '',
    away_team_label: local?.away_team_label || '',
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

function completedScheduleCacheKey(request) {
  return new Request(new URL('/__wc2026/completed-games', request.url));
}

async function cacheCompletedMatches(games, request) {
  const completed = games.filter(isFinishedMatch);
  const snapshot = json({ games: completed }, { headers: { 'cache-control': 'public, max-age=2592000, immutable' } });
  await caches.default.put(completedScheduleCacheKey(request), snapshot);
}

async function completedScheduleFallback(request) {
  const cached = await caches.default.match(completedScheduleCacheKey(request));
  const snapshot = cached ? await cached.json() : { games: [] };
  const byId = new Map((snapshot.games || []).map((match) => [String(match.id), match]));
  return matches.map((match) => byId.has(String(match.id)) ? { ...match, ...byId.get(String(match.id)) } : match);
}

function freshGamesResponse(data) {
  return json(data, { headers: { 'cache-control': 'no-store, max-age=0, must-revalidate', 'cdn-cache-control': 'no-store' } });
}

async function fetchLatestGames(env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_SOURCE_TIMEOUT_MS);
  try {
    const source = await fetch(`${FOOTBALL_DATA_BASE}/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=${FOOTBALL_DATA_SEASON}`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN, 'cache-control': 'no-cache' }
    });
    if (!source.ok) throw new Error(`football-data.org ${source.status}`);
    const data = await source.json();
    const apiMatches = data.matches || [];
    
    // Map directly from local matches to ensure all 104 games (especially R32 onwards with ID 73+) are returned properly.
    return matches.map((local, index) => {
        // Try to find the corresponding apiMatch
        let apiMatch = null;
        if (local.home_team_id && local.home_team_id !== '0' && local.away_team_id && local.away_team_id !== '0') {
            apiMatch = apiMatches.find(m => {
                const mHome = localTeam(m.homeTeam);
                const mAway = localTeam(m.awayTeam);
                return String(mHome?.id) === String(local.home_team_id) && String(mAway?.id) === String(local.away_team_id);
            });
        }
        
        // If not found by team, try chronological order for knockout matches
        if (!apiMatch && local.type !== 'group') {
            const localKnockouts = matches.filter(m => m.type !== 'group');
            const apiKnockouts = apiMatches.filter(m => String(m.stage || '').toLowerCase().indexOf('group') === -1);
            const knockoutIndex = localKnockouts.findIndex(m => String(m.id) === String(local.id));
            if (knockoutIndex >= 0 && knockoutIndex < apiKnockouts.length) {
                apiMatch = apiKnockouts[knockoutIndex];
            }
        }
        
        const apiHome = mergeApiTeam(local.home_team_id, local.home_team_name_en, apiMatch?.homeTeam);
        const apiAway = mergeApiTeam(local.away_team_id, local.away_team_name_en, apiMatch?.awayTeam);
        const status = String(apiMatch?.status || '').toUpperCase();
        const finished = ['FINISHED', 'AWARDED'].includes(status);
        const score = apiMatch?.score?.fullTime || {};
        const penalties = apiMatch?.score?.penalties || {};
        
        return {
            ...local,
            id: String(local.id),
            football_data_id: apiMatch?.id || '',
            api_utc_date: apiMatch?.utcDate || '',
            home_team_id: apiHome.id,
            away_team_id: apiAway.id,
            home_team_name_en: apiHome.name,
            away_team_name_en: apiAway.name,
            home_team_label: local.home_team_label || '',
            away_team_label: local.away_team_label || '',
            home_score: String(score.home ?? local.home_score ?? 0),
            away_score: String(score.away ?? local.away_score ?? 0),
            score_duration: apiMatch?.score?.duration || '',
            home_penalties: penalties.home == null ? '' : String(penalties.home),
            away_penalties: penalties.away == null ? '' : String(penalties.away),
            finished: finished ? 'TRUE' : 'FALSE',
            status: status || local.status || '',
            time_elapsed: apiMatch ? (finished ? 'finished' : (['IN_PLAY', 'PAUSED'].includes(status) ? 'in_play' : 'notstarted')) : 'notstarted'
        };
    });
  } finally {
    clearTimeout(timeout);
  }
}

function espnScoreboardDate(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

function espnMatchStatus(event) {
  const type = event?.status?.type || {};
  const name = String(type.name || '').toUpperCase();
  const completed = Boolean(type.completed) || /FINAL|POST/.test(name);
  const live = String(type.state || '').toLowerCase() === 'in' || /HALF|OVERTIME|PENALT/.test(name);
  return { completed, live, status: completed ? 'FINISHED' : (live ? 'IN_PLAY' : 'TIMED') };
}

async function fetchEspnFallbackGames() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_SOURCE_TIMEOUT_MS);
  try {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const responses = await Promise.all([today, yesterday].map((date) => fetch(`${ESPN_SCOREBOARD_BASE}/scoreboard?dates=${espnScoreboardDate(date)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'cache-control': 'no-cache' }
    })));
    const payloads = await Promise.all(responses.filter((response) => response.ok).map((response) => response.json()));
    const events = payloads.flatMap((payload) => payload.events || []);
    const games = events.map((event) => {
      const competitors = event.competitions?.[0]?.competitors || [];
      const home = competitors.find((team) => team.homeAway === 'home');
      const away = competitors.find((team) => team.homeAway === 'away');
      const homeTeam = localTeam({ name: home?.team?.displayName, shortName: home?.team?.shortDisplayName, tla: home?.team?.abbreviation });
      const awayTeam = localTeam({ name: away?.team?.displayName, shortName: away?.team?.shortDisplayName, tla: away?.team?.abbreviation });
      const local = localMatch(homeTeam, awayTeam, event.date);
      const matchStatus = espnMatchStatus(event);
      if (!local || (!matchStatus.live && !matchStatus.completed)) return null;
      return {
        ...local,
        home_score: String(home?.score ?? 0),
        away_score: String(away?.score ?? 0),
        home_penalties: home?.shootoutScore == null ? '' : String(home.shootoutScore),
        away_penalties: away?.shootoutScore == null ? '' : String(away.shootoutScore),
        api_utc_date: event.date || local.api_utc_date,
        finished: matchStatus.completed ? 'TRUE' : 'FALSE',
        time_elapsed: matchStatus.completed ? 'finished' : 'live',
        status: matchStatus.status,
        score_duration: event.status?.type?.detail || '',
        source: 'espn'
      };
    }).filter(Boolean);
    return [...new Map(games.map((game) => [String(game.id), game])).values()];
  } finally {
    clearTimeout(timeout);
  }
}

function mergeGameOverrides(schedule, overrides) {
  const byId = new Map(overrides.map((game) => [String(game.id), game]));
  return schedule.map((game) => byId.has(String(game.id)) ? { ...game, ...byId.get(String(game.id)) } : game);
}

async function liveGames(request, env, ctx) {
  if (!env.FOOTBALL_DATA_TOKEN) return freshGamesResponse({ games: await completedScheduleFallback(request), source: 'local', error: 'FOOTBALL_DATA_TOKEN is not configured', cache_ttl_ms: 0 });
  try {
    if (!gamesFetchInFlight) {
      gamesFetchInFlight = fetchLatestGames(env).finally(() => { gamesFetchInFlight = null; });
    }
    const mappedGames = await gamesFetchInFlight;
    let responseGames = mappedGames;
    try {
      const espnOverrides = await fetchEspnOverridesForGames(mappedGames);
      if (espnOverrides.length) responseGames = mergeGameOverrides(mappedGames, espnOverrides);
    } catch (_) {
      // Football-data remains the baseline; ESPN only corrects known live/penalty edge cases.
    }
    ctx.waitUntil(cacheCompletedMatches(responseGames, request));
    return freshGamesResponse({ games: responseGames, source: 'football-data+espn', cache_ttl_ms: 0 });
  } catch (error) {
    const localSchedule = await completedScheduleFallback(request);
    try {
      const espnGames = await fetchEspnFallbackGames();
      if (espnGames.length) {
        return freshGamesResponse({ games: mergeGameOverrides(localSchedule, espnGames), source: 'espn-fallback', remote_error: error.message, cache_ttl_ms: 0 });
      }
    } catch (_) {
      // Fall through to the saved final scores and bundled schedule.
    }
    return freshGamesResponse({ games: localSchedule, source: 'local', remote_error: error.message, cache_ttl_ms: 0 });
  }
}

function localTeamName(teamId) {
  return teams.find((team) => String(team.id) === String(teamId))?.name_en || '';
}

function espnDate(localDate) {
  const match = String(localDate || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}${match[1]}${match[2]}` : '';
}

function espnDateCandidates(localDate) {
  const match = String(localDate || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return [];
  const [, month, day, year] = match;
  const base = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return [0, 1, -1].map((offset) => {
    const value = new Date(base);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10).replaceAll('-', '');
  });
}

function espnDateCandidatesForMatch(match) {
  const dates = new Set(espnDateCandidates(match?.local_date));
  const apiDate = Date.parse(match?.api_utc_date || '');
  if (!Number.isNaN(apiDate)) {
    [-1, 0, 1].forEach((offset) => {
      const value = new Date(apiDate);
      value.setUTCDate(value.getUTCDate() + offset);
      dates.add(espnScoreboardDate(value));
    });
  }
  return [...dates].filter(Boolean);
}

function concreteTeamName(value) {
  const text = String(value || '').trim();
  if (!text || /^(undefined|null|tbd|-)$/i.test(text)) return '';
  if (/^(winner|runner-up|3rd|loser)\s+/i.test(text)) return '';
  return text;
}

function matchTeamName(match, side) {
  const id = match?.[`${side}_team_id`];
  return concreteTeamName(match?.[`${side}_team_name_en`]) || localTeamName(id);
}

function espnTeamAlias(value) {
  const key = normalized(value).replace(/[^a-z0-9]/g, '');
  const aliases = {
    usa: 'unitedstates',
    unitedstates: 'unitedstates',
    czechrepublic: 'czechia',
    czechia: 'czechia',
    turkey: 'turkiye',
    turkiye: 'turkiye',
    bosniaandherzegovina: 'bosnia',
    bosniaherzegovina: 'bosnia',
    bosnia: 'bosnia',
    bosniah: 'bosnia',
    democraticrepublicofthecongo: 'drcongo',
    congodr: 'drcongo',
    drcongo: 'drcongo',
    congo: 'drcongo',
    cod: 'drcongo',
    ivorycoast: 'cotedivoire',
    cotedivoire: 'cotedivoire',
    curacao: 'curacao',
    curaçao: 'curacao'
  };
  return aliases[key] || key;
}

function espnCompetitors(event) {
  const competitors = event?.competitions?.[0]?.competitors || event?.header?.competitions?.[0]?.competitors || [];
  return {
    home: competitors.find((team) => team.homeAway === 'home'),
    away: competitors.find((team) => team.homeAway === 'away')
  };
}

function espnTeamMatches(espnTeam, localName, localId) {
  const candidates = [localName, localTeamName(localId), teams.find((team) => String(team.id) === String(localId))?.fifa_code]
    .map(concreteTeamName)
    .filter(Boolean)
    .map(espnTeamAlias);
  const values = [
    espnTeam?.team?.displayName,
    espnTeam?.team?.shortDisplayName,
    espnTeam?.team?.name,
    espnTeam?.team?.abbreviation,
    espnTeam?.displayName,
    espnTeam?.name,
    espnTeam?.abbreviation
  ].map(espnTeamAlias);
  return candidates.some((candidate) => values.includes(candidate));
}

function espnEventMatchesGame(event, match) {
  const { home, away } = espnCompetitors(event);
  if (!home || !away) return false;
  return espnTeamMatches(home, matchTeamName(match, 'home'), match?.home_team_id)
    && espnTeamMatches(away, matchTeamName(match, 'away'), match?.away_team_id);
}

async function fetchEspnScoreboards(dates, signal) {
  const responses = await Promise.all([...new Set(dates)].map((date) =>
    fetch(`${ESPN_SCOREBOARD_BASE}/scoreboard?dates=${date}`, { signal, headers: { accept: 'application/json', 'cache-control': 'no-cache' } })
      .then((response) => response.ok ? response.json() : { events: [] })
      .catch(() => ({ events: [] }))
  ));
  return responses.flatMap((payload) => payload.events || []);
}

function espnGameOverride(game, event) {
  const { home, away } = espnCompetitors(event);
  const matchStatus = espnMatchStatus(event);
  const type = event?.status?.type || event?.competitions?.[0]?.status?.type || {};
  const name = String(type.name || '').toUpperCase();
  let status = 'TIMED';
  if (matchStatus.completed) status = 'FINISHED';
  else if (name.includes('PENALT') || name.includes('SHOOTOUT')) status = 'PENALTY';
  else if (name.includes('OVERTIME') || name.includes('EXTRA')) status = 'ET';
  else if (name.includes('HALFTIME')) status = 'HT';
  else if (matchStatus.live) status = 'IN_PLAY';
  return {
    home_score: String(home?.score ?? game.home_score ?? 0),
    away_score: String(away?.score ?? game.away_score ?? 0),
    home_penalties: home?.shootoutScore == null ? (game.home_penalties || '') : String(home.shootoutScore),
    away_penalties: away?.shootoutScore == null ? (game.away_penalties || '') : String(away.shootoutScore),
    api_utc_date: event?.date || game.api_utc_date || '',
    finished: matchStatus.completed ? 'TRUE' : 'FALSE',
    time_elapsed: matchStatus.completed ? 'finished' : (event?.status?.displayClock || event?.status?.type?.detail || 'live'),
    status,
    score_duration: event?.status?.type?.shortDetail || event?.status?.type?.detail || game.score_duration || '',
    source: 'espn'
  };
}

async function fetchEspnOverridesForGames(games) {
  const candidates = games.filter((game) => {
    const hasTeams = matchTeamName(game, 'home') && matchTeamName(game, 'away');
    const hasPenalty = String(game.home_penalties || game.away_penalties || game.score_duration || '').toUpperCase().includes('PEN');
    const active = ['IN_PLAY', 'PAUSED', 'PENALTY', 'ET', 'HT'].includes(String(game.status || '').toUpperCase());
    return hasTeams && (hasPenalty || active);
  });
  if (!candidates.length) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_SOURCE_TIMEOUT_MS);
  try {
    const dates = candidates.flatMap(espnDateCandidatesForMatch);
    const events = await fetchEspnScoreboards(dates, controller.signal);
    return candidates.map((game) => {
      const event = events.find((candidate) => espnEventMatchesGame(candidate, game));
      return event ? { ...game, ...espnGameOverride(game, event) } : null;
    }).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

function scorerMatchFromRequest(id, request) {
  const url = new URL(request.url);
  const local = matches.find((item) => String(item.id) === String(id)) || {};
  return {
    ...local,
    home_team_id: url.searchParams.get('homeTeamId') || local.home_team_id || '',
    away_team_id: url.searchParams.get('awayTeamId') || local.away_team_id || '',
    home_team_name_en: url.searchParams.get('homeName') || local.home_team_name_en || '',
    away_team_name_en: url.searchParams.get('awayName') || local.away_team_name_en || '',
    local_date: url.searchParams.get('localDate') || local.local_date || '',
    api_utc_date: url.searchParams.get('apiDate') || local.api_utc_date || ''
  };
}

function espnGoalMinute(play) {
  const base = String(play.clock?.displayValue || '').replace(/'/g, '').trim();
  if (!base) return '';
  const added = String(play.addedClock?.displayValue || '').replace(/'/g, '').trim();
  if (base.includes('+')) return `${base}'`;
  if (added && added !== '0') return `${base}+${added}'`;
  return `${base}'`;
}

async function espnScorers(id, matchHint) {
  const local = matchHint || matches.find((item) => String(item.id) === String(id));
  const dates = espnDateCandidatesForMatch(local);
  const homeName = matchTeamName(local, 'home');
  const awayName = matchTeamName(local, 'away');
  if (!dates.length || !homeName || !awayName) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCORER_SOURCE_TIMEOUT_MS);
  try {
    const events = await fetchEspnScoreboards(dates, controller.signal);
    const event = events.find((candidate) => espnEventMatchesGame(candidate, local));
    if (!event?.id) return null;

    const summary = await fetch(`${ESPN_SCOREBOARD_BASE}/summary?event=${event.id}`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!summary.ok) throw new Error(`ESPN summary ${summary.status}`);
    const summaryData = await summary.json();
    const homeGoals = [];
    const awayGoals = [];
    const homeGoalDetails = [];
    const awayGoalDetails = [];
    const scoringEvents = (summaryData.keyEvents?.length ? summaryData.keyEvents : summaryData.header?.competitions?.[0]?.details) || [];
    for (const play of scoringEvents) {
      if (!play.scoringPlay || play.shootout) continue;
      const player = play.participants?.[0]?.athlete?.displayName || play.shortText || 'Goal';
      const scorerId = String(play.participants?.[0]?.athlete?.id || '');
      const minute = espnGoalMinute(play);
      const textAssist = String(play.text || '').match(/assisted by\s+([^\.]+)/i)?.[1]?.trim();
      const participantAssist = play.participants?.[1]?.athlete?.displayName || '';
      const assistId = String(play.participants?.[1]?.athlete?.id || '');
      // ESPN occasionally appends play-by-play prose to the text; the participant is the clean player name.
      const assist = participantAssist || textAssist;
      const penalty = Boolean(play.penaltyKick) || /penalty/i.test(`${play.type?.text || ''} ${play.shortText || ''}`);
      const item = `${player}${minute ? ` ${minute}` : ''}${penalty ? ' (P)' : ''}`;
      const detail = { scorer: player, scorer_id: scorerId, minute, assist, assist_id: assistId, penalty };
      if (espnTeamMatches(play.team, homeName, local?.home_team_id)) {
        homeGoals.push(item);
        homeGoalDetails.push(detail);
      }
      if (espnTeamMatches(play.team, awayName, local?.away_team_id)) {
        awayGoals.push(item);
        awayGoalDetails.push(detail);
      }
    }
    const scoreOverride = espnGameOverride(local, event);
    return {
      id: String(id),
      home_scorers: homeGoals.join(', ') || 'null',
      away_scorers: awayGoals.join(', ') || 'null',
      home_goal_details: homeGoalDetails,
      away_goal_details: awayGoalDetails,
      home_score: scoreOverride.home_score,
      away_score: scoreOverride.away_score,
      home_penalties: scoreOverride.home_penalties,
      away_penalties: scoreOverride.away_penalties,
      source: 'espn'
    };
  } finally {
    clearTimeout(timeout);
  }
}

function finalScorerCacheKey(id, request) {
  // Versioning discards event payloads cached before score completeness was checked.
  return new Request(new URL(`/__wc2026/final-scorers-v6/${encodeURIComponent(id)}`, request.url));
}

function scorerCount(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'null') return 0;
  return raw.split(/\s*[,;]\s*/).map((item) => item.trim()).filter(Boolean).length;
}

function scorerPayloadMatchesScore(payload, expectedHome, expectedAway) {
  if (!Number.isFinite(expectedHome) || !Number.isFinite(expectedAway)) return true;
  return scorerCount(payload?.home_scorers) >= expectedHome
    && scorerCount(payload?.away_scorers) >= expectedAway;
}

async function scorers(id, request, ctx) {
  const url = new URL(request.url);
  const isFinal = url.searchParams.get('final') === '1';
  const expectedHome = url.searchParams.has('home') ? Number(url.searchParams.get('home')) : null;
  const expectedAway = url.searchParams.has('away') ? Number(url.searchParams.get('away')) : null;
  const cacheKey = finalScorerCacheKey(id, request);
  if (isFinal) {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const cachedPayload = await cached.json();
      if (scorerPayloadMatchesScore(cachedPayload, expectedHome, expectedAway)) return json(cachedPayload);
      // Never retain a partial scorer list as the final record for a match.
      await caches.default.delete(cacheKey);
    }
  }

  let payload;
  try {
    payload = await espnScorers(id, scorerMatchFromRequest(id, request));
  } catch (_) {
    // ESPN is the only trusted scorer feed. A miss is safer than showing goals from another match.
  }

  if (!payload) {
    const local = matches.find((item) => String(item.id) === String(id));
    payload = { id: String(id), home_scorers: local?.home_scorers || 'null', away_scorers: local?.away_scorers || 'null', source: 'local-fallback' };
  }

  if (isFinal && scorerPayloadMatchesScore(payload, expectedHome, expectedAway)) {
    const cacheResponse = json(payload, { headers: { 'cache-control': 'public, max-age=2592000, immutable' } });
    ctx.waitUntil(caches.default.put(cacheKey, cacheResponse.clone()));
  }
  return json(payload);
}

async function tournamentStatistics() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(ESPN_STATISTICS_ENDPOINT, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'cache-control': 'no-cache' }
    });
    if (!response.ok) throw new Error(`ESPN statistics ${response.status}`);
    const data = await response.json();
    const leaders = (name) => (data.stats || []).find((stat) => stat.name === name)?.leaders || [];
    const goalLeaders = leaders('goalsLeaders');
    const assistLeaders = leaders('assistsLeaders');
    const goalValues = new Map(goalLeaders.map((leader) => [String(leader.athlete?.id || ''), Number(leader.value) || 0]));
    const assistValues = new Map(assistLeaders.map((leader) => [String(leader.athlete?.id || ''), Number(leader.value) || 0]));
    const rows = (source, secondaryValues) => {
      const ordered = source.map((leader) => {
      const athlete = leader.athlete || {};
      const espnTeam = athlete.team || {};
      const local = localTeam({ name: espnTeam.displayName, shortName: espnTeam.name, tla: espnTeam.abbreviation });
      const id = String(athlete.id || '');
      const appStat = athlete.statistics?.find(s => s.name === 'appearances');
      return {
        id,
        name: athlete.displayName || 'Unknown',
        team_id: String(local?.id || ''),
        team: local?.fifa_code || espnTeam.abbreviation || espnTeam.displayName || '',
        flag: local?.flag || espnTeam.logos?.[0]?.href || '',
        value: Number(leader.value) || 0,
        secondary: secondaryValues.get(id) || 0,
        matches_played: appStat ? Number(appStat.value) : undefined
      };
      }).sort((a, b) => b.value - a.value || b.secondary - a.secondary || a.name.localeCompare(b.name));
      let previous = null;
      let rank = 0;
      return ordered.map((player, index) => {
        if (!previous || player.value !== previous.value || player.secondary !== previous.secondary) rank = index + 1;
        previous = player;
        return { ...player, rank };
      }).slice(0, 12);
    };
    return { goals: rows(goalLeaders, assistValues), assists: rows(assistLeaders, goalValues), source: 'espn', updated_at: data.timestamp || new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

function scheduledMatchDate(match) {
  const parts = String(match?.local_date || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!parts) return null;
  const [, month, day, year, hour, minute] = parts;
  // Fixture times are Vietnam time (UTC+7); use an absolute UTC instant for cron comparisons.
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute)));
}

function scheduledMatchClusters() {
  const dated = matches
    .map((match) => ({ match, start: scheduledMatchDate(match) }))
    .filter((item) => item.start)
    .sort((a, b) => a.start - b.start);
  const clusters = [];
  for (const item of dated) {
    const current = clusters.at(-1);
    if (!current || item.start.getTime() - current.lastStart.getTime() > 6 * 60 * 60 * 1000) {
      clusters.push({ games: [item.match], firstStart: item.start, lastStart: item.start });
    } else {
      current.games.push(item.match);
      current.lastStart = item.start;
    }
  }
  return clusters;
}

function isKnockoutCluster(cluster) {
  return cluster.games.some((game) => !/^[A-L]$/i.test(String(game.group || '').trim()));
}

function dueScheduledRefreshes(now = new Date()) {
  const tasks = [];
  const clusters = scheduledMatchClusters();
  clusters.forEach((cluster, index) => {
    const settleDelay = isKnockoutCluster(cluster) ? KNOCKOUT_SETTLE_MS : GROUP_STAGE_SETTLE_MS;
    const previous = clusters[index - 1];
    tasks.push({
      kind: 'pre',
      target: new Date(cluster.firstStart.getTime() - CRON_INTERVAL_MS),
      games: previous?.games || []
    });
    [0, 1, 2, 3].forEach((retry) => tasks.push({
      kind: retry ? 'retry' : 'final',
      target: new Date(cluster.lastStart.getTime() + settleDelay + retry * CRON_INTERVAL_MS),
      games: cluster.games
    }));
  });
  return tasks.filter((task) => {
    const elapsed = now.getTime() - task.target.getTime();
    return elapsed >= 0 && elapsed < CRON_INTERVAL_MS;
  });
}

async function warmFinalScorers(games, task, ctx) {
  const queue = games.filter(isFinishedMatch);
  const requestFor = (game) => {
    const url = new URL(`/get/games/${encodeURIComponent(game.id)}/scorers`, CACHE_ORIGIN);
    url.searchParams.set('final', '1');
    url.searchParams.set('home', String(Number(game.home_score) || 0));
    url.searchParams.set('away', String(Number(game.away_score) || 0));
    url.searchParams.set('homeTeamId', game.home_team_id || '');
    url.searchParams.set('awayTeamId', game.away_team_id || '');
    url.searchParams.set('homeName', game.home_team_name_en || '');
    url.searchParams.set('awayName', game.away_team_name_en || '');
    url.searchParams.set('localDate', game.local_date || '');
    url.searchParams.set('apiDate', game.api_utc_date || '');
    return new Request(url);
  };
  const worker = async () => {
    while (queue.length) {
      const game = queue.shift();
      await scorers(String(game.id), requestFor(game), ctx);
    }
  };
  await Promise.all([worker(), worker()]);
}

async function refreshScheduledCache(task, env, ctx) {
  const request = new Request(`${CACHE_ORIGIN}/__wc2026/cron/${task.kind}`);
  // This always asks the upstream source for fresh scores. Only confirmed final games are persisted.
  const response = await liveGames(request, env, ctx);
  const payload = await response.json();
  const byId = new Map((payload.games || []).map((game) => [String(game.id), game]));
  const taskGames = task.games.map((game) => byId.get(String(game.id)) || game);
  await warmFinalScorers(taskGames, task, ctx);
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
    if (url.pathname === '/get/statistics') return json(await tournamentStatistics(), { headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } });
    if (url.pathname === '/get/source-status') return json({ results: [{ endpoint: '/get/games', source: env.FOOTBALL_DATA_TOKEN ? 'football-data' : 'local' }, { endpoint: '/get/teams', source: 'local' }, { endpoint: '/get/groups', source: 'local' }, { endpoint: '/get/stadiums', source: 'local' }] });
    const scorerMatch = url.pathname.match(/^\/get\/games\/([^/]+)\/scorers$/);
    if (scorerMatch) return scorers(decodeURIComponent(scorerMatch[1]), request, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    const tasks = dueScheduledRefreshes(new Date(controller.scheduledTime || Date.now()));
    for (const task of tasks) ctx.waitUntil(refreshScheduledCache(task, env, ctx));
  }
};
