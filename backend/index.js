require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const os = require('os');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const instanceId = os.hostname();

const redis = createClient({
  url: 'redis://redis:6379',
});

redis.on('error', (err) => console.log('Redis error', err));

(async () => {
  await redis.connect();
  console.log('Connected to Redis');
})();

app.use(async (req, res, next) => {
  try {
    if (req.path.startsWith('/api/')) {
      let route = req.path;

      if (/^\/api\/todos\/\d+$/.test(route)) {
        route = '/api/todos/:id';
      }

      const key = `requests:${instanceId}:${route}`;

      await redis.incr(key);
    }
  } catch (err) {
    console.error(err);
  }

  next();
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 5,
});

app.get('/api/todos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM todos ORDER BY id DESC');
    res.json({
      instanceId,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

app.post('/api/todos', async (req, res) => {
  try {
    const { title } = req.body;
    const result = await pool.query(
      'INSERT INTO todos(title) VALUES($1) RETURNING *',
      [title],
    );
    res.json({
      instanceId,
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM todos WHERE id=$1', [req.params.id]);
    res.json({
      instanceId,
      message: 'Deleted',
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'OK',
      instanceId,
    });
  } catch (err) {
    res.status(500).json({
      status: 'DB FAIL',
      instanceId,
    });
  }
});

async function buildMetrics() {
  const keys = [];

  for await (const key of redis.scanIterator({
    MATCH: 'requests:*',
    COUNT: 100,
  })) {
    keys.push(key);
  }

  if (keys.length === 0) return [];

  const values = await redis.mGet(keys);

  const result = {};

  keys.forEach((key, index) => {
    const count = Number(values[index] || 0);
    const [, instanceId, route] = key.split(':');

    if (!result[instanceId]) {
      result[instanceId] = { instanceId, routes: {} };
    }

    result[instanceId].routes[route] = count;
  });

  return Object.values(result);
}

app.get('/api/metrics', async (req, res) => {
  try {
    const data = await buildMetrics();
    res.json(data);
  } catch {
    res.status(500).send('Error');
  }
});

app.get('/api/metrics/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = async () => {
    const data = await buildMetrics();
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send();
  const interval = setInterval(send, 2000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${instanceId} running on port ${PORT}`);
});
