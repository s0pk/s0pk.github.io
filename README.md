# Kovaaks Voltaic Tracker

Personal benchmark tracker for Kovaaks with persistent score storage.

## Quick Start

### Prerequisites
- Node.js 16+ (download from https://nodejs.org)

### 1. Install Dependencies

Open terminal/command prompt in this folder and run:
```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

You'll see:
```
╔════════════════════════════════════════════╗
║   Kovaaks Tracker Server Running          ║
╠════════════════════════════════════════════╣
║   URL: http://localhost:3000                  ║
║   File: scores.json                       ║
║   Location: C:\Users\meow\Pictures\sopksite\  ║
╚════════════════════════════════════════════╝
```

### 3. Open the Tracker

Visit: **http://localhost:3000**

That's it! Every time you sync:
- Scores are pulled from Kovaaks API
- ALL scores (not just 10) are stored in `scores.json`
- History is loaded from the file on startup

## Files Created

| File | Purpose |
| --- | --- |
| `scores.json` | All your scores (updates automatically) |
| `scores.backup.json` | Automatic backup before each write |
| `server.js` | The server that manages the file |

## Features

✅ **Persistent Storage** - All scores saved to `scores.json`
✅ **All History** - No 10-score limit (unless you have 10k+)  
✅ **Auto Deduplication** - No duplicate scores
✅ **Auto Backup** - Creates backup before each update
✅ **Export/Import** - Still works for sharing data
✅ **Offline Access** - Works when scores.json is loaded

## How It Works

1. You click "sync now" → fetches 10 scores from Kovaaks API
2. Server stores **all scores ever fetched** in `scores.json`
3. When you open history for a scenario, it loads all scores from the file
4. Graph shows complete history instead of just 10 entries

## Stop the Server

Press `Ctrl+C` in the terminal

## Troubleshooting

**"Cannot find module 'express'"**
- Run: `npm install`

**Port 3000 already in use**
- Edit `server.js` line 5: `const PORT = process.env.PORT || 3000;`
- Change `3000` to another number like `3001`

**Scores not updating**
- Check server console for errors
- Make sure `SERVER_URL` in HTML matches your server address

## Server API (Advanced)

The server exposes these endpoints:

```
GET /api/health
  Returns server status and score count

GET /api/scores
  Returns all scores

GET /api/scores/:scenario
  Returns scores for a specific scenario

POST /api/scores
  Upload scores: { scores: [...] }
```

## Sharing Data

Export `scores.json` directly - it's a plain JSON file you can:
- Email to friends
- Store in Dropbox/Google Drive
- Backup anywhere
- Merge multiple files manually

## Next Steps

Ready to host online? See backend/README.md for deploying to Railroad or similar.
