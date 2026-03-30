# Kovaaks Tracker Backend

Node.js/Express backend with PostgreSQL for storing and sharing benchmark scores globally.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (local or hosted)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL connection string
   ```

3. **Run server:**
   ```bash
   npm run dev
   ```

   Server will be at `http://localhost:5000`

## Deployment to Railway

1. **Create Railway account:** https://railway.app

2. **Create PostgreSQL database:**
   - Click "Create" → "Database" → "PostgreSQL"
   - Wait for it to be created

3. **Create Node.js service:**
   - Click "Create" → "GitHub Repo" (or paste code)
   - Select your repository and `/backend` folder
   - Add environment variable: `DATABASE_URL` (get from PostgreSQL plugin)

4. **Deploy:**
   - Push to GitHub, Railway will auto-deploy

## API Endpoints

### Submit Score
```
POST /api/scores
Content-Type: application/json

{
  "username": "username",
  "scenario_name": "Gridshot",
  "benchmark_key": "voltaic",
  "score": 859.03,
  "attributes": {
    "cm360": 100,
    "kills": 93,
    "avgFps": 541,
    "avgTtk": 0.644,
    "horizSens": 100,
    "fov": 103,
    "resolution": "1920x1080"
  }
}
```

### Get Leaderboard
```
GET /api/leaderboard?benchmark_key=voltaic&scenario_name=Gridshot&days=30
```

Response:
```json
{
  "success": true,
  "leaderboard": [
    {
      "username": "player1",
      "best_score": 950.25,
      "avg_score": 887.5,
      "attempt_count": 8,
      "best_cm360": 105,
      "best_kills": 95
    },
    ...
  ]
}
```

### Get User Stats
```
GET /api/users/:username?benchmark_key=voltaic
```

### Submit multiple scores
The frontend will automatically upload scores when user clicks "upload to cloud" or similar.

## Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (from Railway) |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default: 5000) |
