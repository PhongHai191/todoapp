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

app.get('/api/dashboard', async (req, res) => {
  try {
    const keys = await redis.keys('requests:*');

    const result = {};

    for (let key of keys) {
      const count = await redis.get(key);

      const [, instanceId, route] = key.split(':');

      if (!result[instanceId]) {
        result[instanceId] = {
          instanceId,
          routes: {},
        };
      }

      result[instanceId].routes[route] = Number(count);
    }

    res.json(Object.values(result));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${instanceId} running on port ${PORT}`);
});
