require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const os = require('os');

const app = express();
app.use(express.json());

//  identify container
const instanceId = os.hostname();

//  count requests
let requestCount = 0;

//  middleware đếm request
app.use((req, res, next) => {
  requestCount++;
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

app.get('/api/dashboard', (req, res) => {
  res.json({
    instanceId,
    requestCount,
    uptime: process.uptime(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ${instanceId} running on port ${PORT}`);
});
