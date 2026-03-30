# Setup Instructions - 2 Minutes

## Step 1: Install Node.js (if not already installed)
Download and install from: https://nodejs.org (LTS version)

## Step 2: Install Dependencies
Open terminal/command prompt in this folder and run:
```
npm install
```

## Step 3: Start Server
```
npm start
```

You should see:
```
╔════════════════════════════════════════════╗
║   Kovaaks Tracker Server Running          ║
╠════════════════════════════════════════════╣
║   URL: http://localhost:3000                  ║
║   File: scores.json                       ║
║   Location: C:\Users\meow\Pictures\sopksite\  ║
╚════════════════════════════════════════════╝
```

## Step 4: Open Tracker
Visit: **http://localhost:3000** in your browser

## Step 5: Click "sync now"
- Your Kovaaks scores will be pulled
- ALL scores (not just 10) are saved to `scores.json`
- File updates every time you sync

## Done!
- `scores.json` contains all your scores
- File is in the same folder as this README
- You can backup/share the file

## To stop server
Press `Ctrl+C` in the terminal
