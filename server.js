require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const { pool, query } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Juf!2025';
const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: SESSION_MAX_AGE }
  })
);

io.on('connection', () => {
  // No-op for now, but useful for future debug/logging
});

function formatDateTime(date) {
  const pad = (num) => (num < 10 ? `0${num}` : `${num}`);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function getTrafficState() {
  const rows = await query('SELECT state, updated_at FROM traffic_state WHERE id = 1 LIMIT 1');
  if (rows.length === 0) {
    return { state: 'green', updated_at: new Date() };
  }
  return rows[0];
}

async function getStudentsWithTotals() {
  const sql = `
    SELECT s.id, s.name, s.group_name, s.avatar_url, s.avatar_type, s.avatar_config,
           s.is_active, IFNULL(SUM(p.delta),0) AS total_points
    FROM students s
    LEFT JOIN point_events p ON p.student_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    ORDER BY s.group_name, s.name;
  `;
  return query(sql);
}

async function getStudentTotal(studentId) {
  const rows = await query('SELECT IFNULL(SUM(delta),0) AS total FROM point_events WHERE student_id = ?', [studentId]);
  return rows[0]?.total || 0;
}

function adminAuth(req, res, next) {
  const openPaths = ['/login', '/logout'];
  if (openPaths.includes(req.path)) return next();

  if (!req.session.isAdmin) {
    return res.redirect('/admin/login');
  }

  const now = Date.now();
  if (req.session.lastActivity && now - req.session.lastActivity > SESSION_MAX_AGE) {
    return req.session.destroy(() => res.redirect('/admin/login?timeout=1'));
  }
  req.session.lastActivity = now;
  next();
}

app.get('/', (req, res) => {
  res.redirect('/board');
});

app.get('/board', async (req, res, next) => {
  try {
    const [students, traffic] = await Promise.all([
      getStudentsWithTotals(),
      getTrafficState()
    ]);
    res.render('board', { students, traffic });
  } catch (err) {
    next(err);
  }
});

// Admin auth routes
app.get('/admin/login', (req, res) => {
  const { error, timeout } = req.query;
  res.render('admin_login', { error, timeout });
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.lastActivity = Date.now();
    return res.redirect('/admin/students');
  }
  return res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.use('/admin', adminAuth);

// Admin students
app.get('/admin/students', async (req, res, next) => {
  try {
    const students = await query('SELECT * FROM students ORDER BY group_name, name');
    res.render('admin_students', { students });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/students/add', async (req, res, next) => {
  const { name, group_name, avatar_url, avatar_mode, avatar_config } = req.body;
  const avatar_type = avatar_mode === 'avataaars' ? 'avataaars' : 'url';
  const finalAvatarUrl = avatar_type === 'url' ? avatar_url || null : null;
  const finalAvatarConfig = avatar_type === 'avataaars' ? avatar_config || null : null;
  if (!name) return res.redirect('/admin/students');

  try {
    await query(
      `INSERT INTO students (name, group_name, avatar_url, avatar_type, avatar_config, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name, group_name || null, finalAvatarUrl, avatar_type, finalAvatarConfig]
    );
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/students/edit/:id', async (req, res, next) => {
  const { name, group_name, avatar_url, avatar_mode, avatar_config } = req.body;
  const avatar_type = avatar_mode === 'avataaars' ? 'avataaars' : 'url';
  const finalAvatarUrl = avatar_type === 'url' ? avatar_url || null : null;
  const finalAvatarConfig = avatar_type === 'avataaars' ? avatar_config || null : null;

  try {
    await query(
      `UPDATE students SET name = ?, group_name = ?, avatar_url = ?, avatar_type = ?, avatar_config = ? WHERE id = ?`,
      [name, group_name || null, finalAvatarUrl, avatar_type, finalAvatarConfig, req.params.id]
    );
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/students/archive/:id', async (req, res, next) => {
  try {
    await query('UPDATE students SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

// Admin points
const REASONS = ['Goed gewerkt', 'Hulp geboden', 'Afleiding', 'Onrust', 'Taak af', 'Extra inzet'];

app.get('/admin/points', async (req, res, next) => {
  try {
    const [students, recentEvents, presets] = await Promise.all([
      getStudentsWithTotals(),
      query(`
        SELECT p.id, p.student_id, p.delta, p.reason, p.created_at, s.name AS student_name
        FROM point_events p
        LEFT JOIN students s ON s.id = p.student_id
        ORDER BY p.created_at DESC
        LIMIT 20
      `),
      query('SELECT * FROM point_presets WHERE is_active = 1 ORDER BY delta DESC, label')
    ]);

    res.render('admin_points', {
      students,
      recentEvents,
      reasons: REASONS,
      presets
    });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/points', async (req, res, next) => {
  const { student_id, delta, reason } = req.body;
  const parsedDelta = parseInt(delta, 10);
  if (!student_id || Number.isNaN(parsedDelta) || parsedDelta === 0) return res.redirect('/admin/points');

  try {
    await query(
      'INSERT INTO point_events (student_id, delta, reason, created_at) VALUES (?, ?, ?, NOW())',
      [student_id, parsedDelta, reason || null]
    );
    const newTotal = await getStudentTotal(student_id);
    io.emit('pointsUpdate', {
      studentId: Number(student_id),
      newTotal,
      delta: parsedDelta,
      reason: reason || ''
    });
    res.redirect('/admin/points');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/points/presets/add', async (req, res, next) => {
  const { label, delta } = req.body;
  const parsedDelta = parseInt(delta, 10);
  if (!label || Number.isNaN(parsedDelta) || parsedDelta === 0) return res.redirect('/admin/points');

  try {
    await query('INSERT INTO point_presets (label, delta, is_active) VALUES (?, ?, 1)', [label, parsedDelta]);
    res.redirect('/admin/points');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/points/presets/delete/:id', async (req, res, next) => {
  try {
    await query('UPDATE point_presets SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.redirect('/admin/points');
  } catch (err) {
    next(err);
  }
});

// Admin traffic
app.get('/admin/traffic', async (req, res, next) => {
  try {
    const traffic = await getTrafficState();
    res.render('admin_traffic', { traffic });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/traffic', async (req, res, next) => {
  const { state } = req.body;
  const allowed = ['green', 'orange', 'red'];
  if (!allowed.includes(state)) return res.redirect('/admin/traffic');

  try {
    await query('UPDATE traffic_state SET state = ?, updated_at = NOW() WHERE id = 1', [state]);
    const [newState] = await query('SELECT state, updated_at FROM traffic_state WHERE id = 1');
    io.emit('trafficUpdate', {
      state: newState.state,
      updatedAt: newState.updated_at
    });
    res.redirect('/admin/traffic');
  } catch (err) {
    next(err);
  }
});

function getPeriodRange(period) {
  const now = new Date();
  const start = new Date(now);
  switch (period) {
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'day':
    default:
      start.setDate(start.getDate() - 1);
  }
  return { start, end: now };
}

app.get('/admin/reports', async (req, res, next) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  const { start, end } = getPeriodRange(period);
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

  try {
    const [studentTotals, groupTotals, timeline, reasons] = await Promise.all([
      query(
        `SELECT s.id, s.name, s.group_name, IFNULL(SUM(p.delta),0) AS total_points
         FROM students s
         LEFT JOIN point_events p ON p.student_id = s.id AND p.created_at BETWEEN ? AND ?
         WHERE s.is_active = 1
         GROUP BY s.id
         ORDER BY total_points DESC, s.name`,
        [startStr, endStr]
      ),
      query(
        `SELECT IFNULL(s.group_name,'Onbekend') AS group_name, IFNULL(SUM(p.delta),0) AS total_points
         FROM students s
         LEFT JOIN point_events p ON p.student_id = s.id AND p.created_at BETWEEN ? AND ?
         WHERE s.is_active = 1
         GROUP BY group_name
         ORDER BY total_points DESC` ,
        [startStr, endStr]
      ),
      query(
        `SELECT DATE(p.created_at) AS day, SUM(p.delta) AS total
         FROM point_events p
         WHERE p.created_at BETWEEN ? AND ?
         GROUP BY day
         ORDER BY day`,
        [startStr, endStr]
      ),
      query(
        `SELECT COALESCE(p.reason, 'Geen reden') AS reason, COUNT(*) AS count
         FROM point_events p
         WHERE p.created_at BETWEEN ? AND ?
         GROUP BY reason
         ORDER BY count DESC
         LIMIT 20`,
        [startStr, endStr]
      )
    ]);

    res.render('admin_reports', {
      period,
      studentTotals,
      groupTotals,
      timeline,
      reasons,
      startStr,
      endStr
    });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/reports/export/csv', async (req, res, next) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  const { start, end } = getPeriodRange(period);
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

  try {
    const events = await query(
      `SELECT p.id, p.student_id, s.name AS student_name, p.delta, p.reason, p.created_at
       FROM point_events p
       LEFT JOIN students s ON s.id = p.student_id
       WHERE p.created_at BETWEEN ? AND ?
       ORDER BY p.created_at DESC`,
      [startStr, endStr]
    );

    let csv = 'id;student_id;student_name;delta;reason;created_at\n';
    for (const ev of events) {
      const reason = ev.reason ? ev.reason.replace(/;/g, ',') : '';
      csv += `${ev.id};${ev.student_id};${ev.student_name || ''};${ev.delta};${reason};${formatDateTime(new Date(ev.created_at))}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="klassencoach-${period}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// Error handling
app.use((req, res) => {
  res.status(404).render('error', { message: 'Pagina niet gevonden.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Er ging iets mis. Probeer het later opnieuw.' });
});

server.listen(PORT, () => {
  console.log(`KlassenCoach draait op poort ${PORT}`);
});
