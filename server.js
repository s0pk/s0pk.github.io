const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const SCORES_FILE = path.join(__dirname, 'scores.json');
const BACKUP_FILE = path.join(__dirname, 'scores.backup.json');

// Initialize scores file if it doesn't exist
if (!fs.existsSync(SCORES_FILE)) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify({
    version: '1.0',
    created: new Date().toISOString(),
    scores: []
  }, null, 2));
  console.log('✓ Created scores.json');
}

// Get all scores
app.get('/api/scores', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    res.json({
      success: true,
      count: data.scores.length,
      scores: data.scores
    });
  } catch(e) {
    console.error('Error reading scores:', e);
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

// Get scores by scenario
app.get('/api/scores/:scenario', (req, res) => {
  try {
    const { scenario } = req.params;
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    const filtered = data.scores.filter(s => s.scenario_name === scenario);
    
    res.json({
      success: true,
      scenario,
      count: filtered.length,
      scores: filtered
    });
  } catch(e) {
    console.error('Error reading scores:', e);
    res.status(500).json({ error: 'Failed to read scores' });
  }
});

// Add/update scores
app.post('/api/scores', (req, res) => {
  try {
    const { scores } = req.body;
    
    if (!Array.isArray(scores)) {
      return res.status(400).json({ error: 'scores must be an array' });
    }
    
    // Read current scores
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    
    // Create a set for deduplication
    const existingKeys = new Set();
    data.scores.forEach(s => {
      const key = `${Math.round(s.score * 100)}-${s.timestamp}-${s.scenario_name}`;
      existingKeys.add(key);
    });
    
    // Add only new scores
    let added = 0;
    scores.forEach(score => {
      const key = `${Math.round(score.score * 100)}-${score.timestamp}-${score.scenario_name}`;
      if (!existingKeys.has(key)) {
        score.added_at = new Date().toISOString();
        data.scores.push(score);
        added++;
      }
    });
    
    // Cap total rows; keep newest by timestamp (not insertion order)
    const MAX_TOTAL = 50000;
    if (data.scores.length > MAX_TOTAL) {
      data.scores.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      data.scores = data.scores.slice(-MAX_TOTAL);
    }
    
    // Backup before write
    if (fs.existsSync(SCORES_FILE)) {
      fs.copyFileSync(SCORES_FILE, BACKUP_FILE);
    }
    
    // Write updated scores
    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));
    
    console.log(`✓ Added ${added} new scores (total: ${data.scores.length})`);
    
    res.json({
      success: true,
      added,
      total: data.scores.length,
      message: `Stored ${added} new scores`
    });
  } catch(e) {
    console.error('Error saving scores:', e);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

/**
 * Replace all scores for one scenario + benchmark with the merged backlog (authoritative sync).
 * Writes to scores.json next to this server.
 */
app.post('/api/scores/replace-backlog', (req, res) => {
  try {
    const { scenario_name, benchmark_key, username, scores: incoming } = req.body;
    if (!scenario_name || benchmark_key === undefined || benchmark_key === null || !Array.isArray(incoming)) {
      return res.status(400).json({ error: 'scenario_name, benchmark_key, and scores[] are required' });
    }

    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    const user = username || 'sopk';
    const bk = benchmark_key;

    data.scores = data.scores.filter(s => {
      const sameScen = s.scenario_name === scenario_name;
      const sameBench = s.benchmark_key === bk || String(s.benchmark_key) === String(bk);
      return !(sameScen && sameBench);
    });

    const now = new Date().toISOString();
    incoming.forEach(s => {
      const attr = s.attributes || {};
      data.scores.push({
        username: user,
        scenario_name,
        benchmark_key: bk,
        score: s.score,
        timestamp: s.timestamp,
        cm360: attr.cm360 ?? null,
        kills: attr.kills ?? null,
        avg_fps: attr.avgFps ?? null,
        avg_ttk: attr.avgTtk ?? null,
        fov: attr.fov ?? null,
        resolution: attr.resolution ?? null,
        attributes: attr,
        source: s.source || 'merged',
        backlog_sync_at: now
      });
    });

    const MAX_TOTAL = 50000;
    if (data.scores.length > MAX_TOTAL) {
      data.scores.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      data.scores = data.scores.slice(-MAX_TOTAL);
    }

    if (fs.existsSync(SCORES_FILE)) {
      fs.copyFileSync(SCORES_FILE, BACKUP_FILE);
    }
    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));

    console.log(`✓ Replaced backlog for ${scenario_name} (${bk}): ${incoming.length} plays`);
    res.json({
      success: true,
      scenario_name,
      benchmark_key: bk,
      stored: incoming.length,
      total_file_rows: data.scores.length
    });
  } catch (e) {
    console.error('Error replacing backlog:', e);
    res.status(500).json({ error: 'Failed to replace backlog' });
  }
});

// Delete a specific score
app.delete('/api/scores/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));

    const idx = data.scores.findIndex(s => {
      const key = `${Math.round(s.score * 100)}-${s.timestamp}-${s.scenario_name}`;
      return key === id;
    });

    if (idx === -1) {
      return res.status(404).json({ error: 'Score not found' });
    }

    fs.copyFileSync(SCORES_FILE, BACKUP_FILE);
    data.scores.splice(idx, 1);
    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));

    console.log(`✓ Deleted score (total: ${data.scores.length})`);
    res.json({ success: true, total: data.scores.length });
  } catch(e) {
    console.error('Error deleting score:', e);
    res.status(500).json({ error: 'Failed to delete score' });
  }
});

// Delete all scores for a scenario
app.delete('/api/scores/scenario/:scenario', (req, res) => {
  try {
    const { scenario } = req.params;
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    const before = data.scores.length;

    fs.copyFileSync(SCORES_FILE, BACKUP_FILE);
    data.scores = data.scores.filter(s => s.scenario_name !== scenario);
    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));

    const removed = before - data.scores.length;
    console.log(`✓ Deleted ${removed} scores for ${scenario}`);
    res.json({ success: true, removed, total: data.scores.length });
  } catch(e) {
    console.error('Error deleting scenario scores:', e);
    res.status(500).json({ error: 'Failed to delete scores' });
  }
});

// Get stats/summary grouped by scenario
app.get('/api/stats', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    const { benchmark_key } = req.query;

    let scores = data.scores;
    if (benchmark_key) {
      scores = scores.filter(s => s.benchmark_key === benchmark_key);
    }

    const grouped = {};
    scores.forEach(s => {
      const key = s.scenario_name;
      if (!grouped[key]) {
        grouped[key] = { scenario_name: key, benchmark_key: s.benchmark_key, scores: [] };
      }
      grouped[key].scores.push(s.score);
    });

    const stats = Object.values(grouped).map(g => {
      const vals = g.scores.map(Number);
      vals.sort((a, b) => a - b);
      return {
        scenario_name: g.scenario_name,
        benchmark_key: g.benchmark_key,
        count: vals.length,
        best: Math.max(...vals),
        worst: Math.min(...vals),
        average: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
        median: vals.length % 2 === 0
          ? +((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2).toFixed(2)
          : vals[Math.floor(vals.length / 2)]
      };
    });

    stats.sort((a, b) => b.count - a.count);
    res.json({ success: true, stats });
  } catch(e) {
    console.error('Error computing stats:', e);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

// Leaderboard - best score per username per scenario (local)
app.get('/api/leaderboard', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    const { scenario_name, benchmark_key, limit = 50 } = req.query;

    let scores = data.scores;
    if (scenario_name) {
      scores = scores.filter(s => s.scenario_name === scenario_name);
    }
    if (benchmark_key) {
      scores = scores.filter(s => s.benchmark_key === benchmark_key);
    }

    const byUser = {};
    scores.forEach(s => {
      const user = s.username || 'anonymous';
      const key = `${user}-${s.scenario_name}`;
      if (!byUser[key] || s.score > byUser[key].score) {
        byUser[key] = {
          username: user,
          scenario_name: s.scenario_name,
          score: s.score,
          timestamp: s.timestamp,
          attributes: s.attributes || {}
        };
      }
    });

    const leaderboard = Object.values(byUser)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Number(limit), 200));

    res.json({ success: true, leaderboard });
  } catch(e) {
    console.error('Error building leaderboard:', e);
    res.status(500).json({ error: 'Failed to build leaderboard' });
  }
});

// Bulk export - all data as downloadable JSON
app.get('/api/export', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    res.setHeader('Content-Disposition', 'attachment; filename=scores-export.json');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: 'Failed to export' });
  }
});

// Bulk import - replace or merge scores from uploaded JSON
app.post('/api/import', (req, res) => {
  try {
    const { scores: importedScores, mode = 'merge' } = req.body;

    if (!Array.isArray(importedScores)) {
      return res.status(400).json({ error: 'scores must be an array' });
    }

    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    fs.copyFileSync(SCORES_FILE, BACKUP_FILE);

    if (mode === 'replace') {
      data.scores = importedScores;
    } else {
      const existingKeys = new Set();
      data.scores.forEach(s => {
        existingKeys.add(`${Math.round(s.score * 100)}-${s.timestamp}-${s.scenario_name}`);
      });

      let added = 0;
      importedScores.forEach(score => {
        const key = `${Math.round(score.score * 100)}-${score.timestamp}-${score.scenario_name}`;
        if (!existingKeys.has(key)) {
          score.added_at = new Date().toISOString();
          data.scores.push(score);
          added++;
        }
      });

      console.log(`✓ Imported ${added} new scores (merge mode)`);
    }

    if (data.scores.length > 10000) {
      data.scores = data.scores.slice(-10000);
    }

    fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true, total: data.scores.length });
  } catch(e) {
    console.error('Error importing scores:', e);
    res.status(500).json({ error: 'Failed to import scores' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
    res.json({
      status: 'ok',
      scores_file_exists: fs.existsSync(SCORES_FILE),
      total_scores: data.scores.length,
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Kovaaks Tracker Server Running          ║
╠════════════════════════════════════════════╣
║   URL: http://localhost:${PORT}                  ║
║   File: ${path.basename(SCORES_FILE)}                       ║
║   Location: ${__dirname}  ║
╚════════════════════════════════════════════╝
  `);
});
