const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..')));
}

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) NOT NULL,
        scenario_name VARCHAR(255) NOT NULL,
        benchmark_key VARCHAR(50) NOT NULL,
        score DECIMAL(10, 4) NOT NULL,
        cm360 INTEGER,
        kills INTEGER,
        avg_fps DECIMAL(8, 2),
        avg_ttk DECIMAL(8, 4),
        sensitivity INTEGER,
        fov INTEGER,
        resolution VARCHAR(50),
        raw_attributes JSONB,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_scenario ON scores(scenario_name, benchmark_key);
      CREATE INDEX IF NOT EXISTS idx_username ON scores(username);
      CREATE INDEX IF NOT EXISTS idx_date ON scores(created_at);
    `);
    console.log('✓ Database initialized');
  } catch(err) {
    console.error('Database init error:', err);
  }
}

// Routes

// Submit a score
app.post('/api/scores', async (req, res) => {
  try {
    const { username, scenario_name, benchmark_key, score, attributes } = req.body;
    
    if (!username || !scenario_name || !benchmark_key || score === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const query = `
      INSERT INTO scores 
        (username, scenario_name, benchmark_key, score, cm360, kills, avg_fps, avg_ttk, sensitivity, fov, resolution, raw_attributes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    
    const values = [
      username,
      scenario_name,
      benchmark_key,
      score,
      attributes?.cm360 || null,
      attributes?.kills || null,
      attributes?.avgFps || null,
      attributes?.avgTtk || null,
      attributes?.horizSens || null,
      attributes?.fov || null,
      attributes?.resolution || null,
      JSON.stringify(attributes || {})
    ];
    
    const result = await pool.query(query, values);
    
    res.status(201).json({
      success: true,
      score: result.rows[0]
    });
  } catch(err) {
    console.error('Error submitting score:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all scores for a benchmark
app.get('/api/scores', async (req, res) => {
  try {
    const { benchmark_key, scenario_name, limit = 100 } = req.query;
    
    let query = 'SELECT * FROM scores WHERE 1=1';
    const params = [];
    
    if (benchmark_key) {
      query += ' AND benchmark_key = $' + (params.length + 1);
      params.push(benchmark_key);
    }
    
    if (scenario_name) {
      query += ' AND scenario_name = $' + (params.length + 1);
      params.push(scenario_name);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(Math.min(limit, 1000));
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      count: result.rows.length,
      scores: result.rows
    });
  } catch(err) {
    console.error('Error fetching scores:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get leaderboard for a scenario
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { benchmark_key, scenario_name, days = 30 } = req.query;
    
    if (!benchmark_key || !scenario_name) {
      return res.status(400).json({ error: 'benchmark_key and scenario_name required' });
    }
    
    const query = `
      SELECT 
        username,
        scenario_name,
        MAX(score) as best_score,
        AVG(score) as avg_score,
        COUNT(*) as attempt_count,
        MAX(created_at) as last_attempt,
        MAX(cm360) as best_cm360,
        MAX(kills) as best_kills,
        ROUND(AVG(avg_fps)::numeric, 1) as avg_fps
      FROM scores
      WHERE benchmark_key = $1 
        AND scenario_name = $2
        AND created_at > NOW() - INTERVAL '1 day' * $3
      GROUP BY username, scenario_name
      ORDER BY best_score DESC
      LIMIT 50;
    `;
    
    const result = await pool.query(query, [benchmark_key, scenario_name, days]);
    
    res.json({
      success: true,
      benchmark: benchmark_key,
      scenario: scenario_name,
      leaderboard: result.rows
    });
  } catch(err) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user stats
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { benchmark_key } = req.query;
    
    let query = `
      SELECT 
        scenario_name,
        benchmark_key,
        MAX(score) as best_score,
        AVG(score) as avg_score,
        COUNT(*) as attempt_count,
        MAX(created_at) as last_attempt
      FROM scores
      WHERE username = $1
    `;
    
    const params = [username];
    
    if (benchmark_key) {
      query += ' AND benchmark_key = $2';
      params.push(benchmark_key);
    }
    
    query += ' GROUP BY scenario_name, benchmark_key ORDER BY MAX(created_at) DESC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      username,
      stats: result.rows
    });
  } catch(err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk submit scores
app.post('/api/scores/bulk', async (req, res) => {
  try {
    const { scores } = req.body;

    if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ error: 'scores must be a non-empty array' });
    }

    let inserted = 0;
    let skipped = 0;

    for (const s of scores) {
      if (!s.username || !s.scenario_name || !s.benchmark_key || s.score === undefined) {
        skipped++;
        continue;
      }

      try {
        const attrs = s.attributes || {};
        await pool.query(`
          INSERT INTO scores
            (username, scenario_name, benchmark_key, score, cm360, kills, avg_fps, avg_ttk, sensitivity, fov, resolution, raw_attributes)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT DO NOTHING
        `, [
          s.username,
          s.scenario_name,
          s.benchmark_key,
          s.score,
          attrs.cm360 || null,
          attrs.kills || null,
          attrs.avgFps || null,
          attrs.avgTtk || null,
          attrs.horizSens || null,
          attrs.fov || null,
          attrs.resolution || null,
          JSON.stringify(attrs)
        ]);
        inserted++;
      } catch(insertErr) {
        skipped++;
      }
    }

    res.status(201).json({
      success: true,
      inserted,
      skipped,
      total: scores.length
    });
  } catch(err) {
    console.error('Error bulk submitting scores:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete scores for a user+scenario
app.delete('/api/scores', async (req, res) => {
  try {
    const { username, scenario_name, benchmark_key } = req.query;

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    let query = 'DELETE FROM scores WHERE username = $1';
    const params = [username];

    if (scenario_name) {
      query += ' AND scenario_name = $' + (params.length + 1);
      params.push(scenario_name);
    }

    if (benchmark_key) {
      query += ' AND benchmark_key = $' + (params.length + 1);
      params.push(benchmark_key);
    }

    const result = await pool.query(query + ' RETURNING id', params);

    res.json({
      success: true,
      deleted: result.rowCount
    });
  } catch(err) {
    console.error('Error deleting scores:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get global stats summary
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT username) as total_players,
        COUNT(*) as total_scores,
        COUNT(DISTINCT scenario_name) as total_scenarios,
        MAX(created_at) as last_submission
      FROM scores
    `);

    const topScenarios = await pool.query(`
      SELECT scenario_name, COUNT(*) as score_count, COUNT(DISTINCT username) as player_count
      FROM scores
      GROUP BY scenario_name
      ORDER BY score_count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      overview: result.rows[0],
      top_scenarios: topScenarios.rows
    });
  } catch(err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Catch-all: serve frontend for non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'kovaaks-voltaic-tracker.html'));
  });
}

// Start server
const PORT = process.env.PORT || 5000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ Database: ${process.env.DATABASE_URL ? 'connected' : 'local'}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
