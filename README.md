# wc2026-by-anton

World Cup 2026 schedule web app by Anton.

## Data source

The server tries to pull data from:

```text
https://worldcup26.ir/get/games
https://worldcup26.ir/get/teams
https://worldcup26.ir/get/groups
https://worldcup26.ir/get/stadiums
```

If the remote API fails, the app automatically falls back to local JSON files.

## Render settings

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

No API key is required.

## Optional environment variables

```text
REMOTE_API_BASE=https://worldcup26.ir
REMOTE_TIMEOUT_MS=6000
REMOTE_CACHE_TTL_MS=60000
```

## Test source status

Open:

```text
/get/source-status
```


## Latest UI rules

- Upcoming highlight starts 17 hours before kickoff.
- Live matches use animated border and red LIVE pill.
- Favorite section includes starred matches and matches involving favorite teams.
