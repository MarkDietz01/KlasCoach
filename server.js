require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const MySQLStore = require('express-mysql-session')(session);
const { pool, query, sessionOptions } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Juf!2025';
const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes

const sessionStore = new MySQLStore({
  ...sessionOptions,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: SESSION_MAX_AGE,
  createDatabaseTable: true
});

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
    store: sessionStore,
    cookie: { maxAge: SESSION_MAX_AGE }
  })
);

// Load classes + selected class into session and locals
app.use(async (req, res, next) => {
  try {
    const classes = await getClasses();
    const selectedClassId = await ensureSelectedClass(req);
    res.locals.classes = classes;
    res.locals.selectedClassId = selectedClassId;
    next();
  } catch (err) {
    next(err);
  }
});

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
  return null;
}

async function getClasses() {
  return query('SELECT id, name FROM classes ORDER BY name');
}

async function getDefaultClassId() {
  const classes = await getClasses();
  return classes[0]?.id || null;
}

async function ensureSelectedClass(req) {
  if (!req.session.selectedClassId) {
    req.session.selectedClassId = await getDefaultClassId();
  }
  return req.session.selectedClassId;
}

async function getTrafficStateByClass(classId) {
  const rows = await query('SELECT state, updated_at FROM traffic_state WHERE class_id = ? LIMIT 1', [classId]);
  if (rows.length === 0) {
    return { state: 'green', updated_at: new Date() };
  }
  return rows[0];
}

async function getTimerByClass(classId) {
  const [timer] = await query('SELECT label, ends_at FROM class_timers WHERE class_id = ?', [classId]);
  return timer || { label: null, ends_at: null };
}

async function getStudentsWithTotals(classId) {
  const sql = `
    SELECT s.id, s.name, s.group_name, s.avatar_url, s.avatar_type, s.avatar_config,
           s.is_active, IFNULL(SUM(p.delta),0) AS total_points
    FROM students s
    LEFT JOIN point_events p ON p.student_id = s.id AND p.class_id = s.class_id
    WHERE s.is_active = 1 AND s.class_id = ?
    GROUP BY s.id
    ORDER BY s.group_name, s.name;
  `;
  return query(sql, [classId]);
}

async function getStudentTotal(studentId) {
  const rows = await query('SELECT IFNULL(SUM(delta),0) AS total FROM point_events WHERE student_id = ?', [studentId]);
  return rows[0]?.total || 0;
}

async function getClassPresets(classId) {
  return query('SELECT * FROM point_presets WHERE class_id = ? AND is_active = 1 ORDER BY delta DESC, label', [classId]);
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
    if (req.query.classId) {
      req.session.selectedClassId = Number(req.query.classId);
    }
    const classId = await ensureSelectedClass(req);
    const [students, traffic, timer] = await Promise.all([
      getStudentsWithTotals(classId),
      getTrafficStateByClass(classId),
      getTimerByClass(classId)
    ]);
    res.render('board', { students, traffic, timer });
  } catch (err) {
    next(err);
  }
});

app.post('/class/select', async (req, res, next) => {
  try {
    const { class_id } = req.body;
    req.session.selectedClassId = Number(class_id);
    const redirectTo = req.get('referer') || '/board';
    res.redirect(redirectTo);
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
    const classId = await ensureSelectedClass(req);
    const students = await query('SELECT * FROM students WHERE class_id = ? ORDER BY group_name, name', [classId]);
    res.render('admin_students', { students });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/classes/add', async (req, res, next) => {
  const { name } = req.body;
  if (!name) return res.redirect('/admin/students');

  try {
    const result = await query('INSERT INTO classes (name) VALUES (?)', [name]);
    const newClassId = result.insertId;
    await Promise.all([
      query('INSERT INTO traffic_state (class_id, state, updated_at) VALUES (?, "green", NOW())', [newClassId]),
      query('INSERT INTO class_timers (class_id, label, ends_at) VALUES (?, NULL, NULL)', [newClassId]),
      query('INSERT INTO point_presets (class_id, label, delta, is_active) VALUES (?, "+1", 1, 1), (?, "+2", 2, 1), (?, "-1", -1, 1)', [newClassId, newClassId, newClassId])
    ]);
    req.session.selectedClassId = newClassId;
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/students/add', async (req, res, next) => {
  const { name, group_name, avatar_url, avatar_mode, avatar_config, class_id } = req.body;
  const avatar_type = avatar_mode === 'avataaars' ? 'avataaars' : 'url';
  const finalAvatarUrl = avatar_type === 'url' ? avatar_url || null : null;
  const finalAvatarConfig = avatar_type === 'avataaars' ? avatar_config || null : null;
  const classId = Number(class_id) || (await ensureSelectedClass(req));
  if (!name) return res.redirect('/admin/students');

  try {
    await query(
      `INSERT INTO students (class_id, name, group_name, avatar_url, avatar_type, avatar_config, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [classId, name, group_name || null, finalAvatarUrl, avatar_type, finalAvatarConfig]
    );
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/students/edit/:id', async (req, res, next) => {
  const { name, group_name, avatar_url, avatar_mode, avatar_config, class_id } = req.body;
  const avatar_type = avatar_mode === 'avataaars' ? 'avataaars' : 'url';
  const finalAvatarUrl = avatar_type === 'url' ? avatar_url || null : null;
  const finalAvatarConfig = avatar_type === 'avataaars' ? avatar_config || null : null;
  const classId = Number(class_id) || (await ensureSelectedClass(req));

  try {
    await query(
      `UPDATE students SET class_id = ?, name = ?, group_name = ?, avatar_url = ?, avatar_type = ?, avatar_config = ? WHERE id = ?`,
      [classId, name, group_name || null, finalAvatarUrl, avatar_type, finalAvatarConfig, req.params.id]
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

app.post('/admin/students/delete/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.redirect('/admin/students');
  } catch (err) {
    next(err);
  }
});

// Admin points
const REASONS = ['Goed gewerkt', 'Hulp geboden', 'Afleiding', 'Onrust', 'Taak af', 'Extra inzet'];

app.get('/admin/points', async (req, res, next) => {
  try {
    const classId = await ensureSelectedClass(req);
    const [students, recentEvents, presets] = await Promise.all([
      getStudentsWithTotals(classId),
      query(`
        SELECT p.id, p.student_id, p.delta, p.reason, p.created_at, s.name AS student_name
        FROM point_events p
        LEFT JOIN students s ON s.id = p.student_id
        WHERE p.class_id = ?
        ORDER BY p.created_at DESC
        LIMIT 20
      `, [classId]),
      getClassPresets(classId)
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
    const classId = await ensureSelectedClass(req);
    await query(
      'INSERT INTO point_events (class_id, student_id, delta, reason, created_at) VALUES (?, ?, ?, ?, NOW())',
      [classId, student_id, parsedDelta, reason || null]
    );
    const newTotal = await getStudentTotal(student_id);
    io.emit('pointsUpdate', {
      classId,
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
    const classId = await ensureSelectedClass(req);
    await query('INSERT INTO point_presets (class_id, label, delta, is_active) VALUES (?, ?, ?, 1)', [classId, label, parsedDelta]);
    res.redirect('/admin/points');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/points/presets/delete/:id', async (req, res, next) => {
  try {
    const classId = await ensureSelectedClass(req);
    await query('UPDATE point_presets SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.redirect('/admin/points');
  } catch (err) {
    next(err);
  }
});

// Admin traffic
app.get('/admin/traffic', async (req, res, next) => {
  try {
    const classId = await ensureSelectedClass(req);
    const [traffic, timer] = await Promise.all([
      getTrafficStateByClass(classId),
      getTimerByClass(classId)
    ]);
    res.render('admin_traffic', { traffic, timer });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/traffic', async (req, res, next) => {
  const { state } = req.body;
  const allowed = ['green', 'orange', 'red'];
  if (!allowed.includes(state)) return res.redirect('/admin/traffic');

  try {
    const classId = await ensureSelectedClass(req);
    await query('UPDATE traffic_state SET state = ?, updated_at = NOW() WHERE class_id = ?', [state, classId]);
    const [newState] = await query('SELECT state, updated_at FROM traffic_state WHERE class_id = ?', [classId]);
    io.emit('trafficUpdate', {
      classId,
      state: newState.state,
      updatedAt: newState.updated_at
    });
    res.redirect('/admin/traffic');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/timer', async (req, res, next) => {
  try {
    const classId = await ensureSelectedClass(req);
    const { minutes, label } = req.body;
    const mins = parseInt(minutes, 10);
    let endsAt = null;
    if (!Number.isNaN(mins) && mins > 0) {
      endsAt = new Date(Date.now() + mins * 60 * 1000);
    }
    await query(
      'INSERT INTO class_timers (class_id, label, ends_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), ends_at = VALUES(ends_at)',
      [classId, label || null, endsAt ? formatDateTime(endsAt) : null]
    );
    io.emit('timerUpdate', {
      classId,
      label: label || null,
      endsAt: endsAt ? endsAt.toISOString() : null
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
    const classId = await ensureSelectedClass(req);
    const [studentTotals, groupTotals, timeline, reasons] = await Promise.all([
      query(
        `SELECT s.id, s.name, s.group_name, IFNULL(SUM(p.delta),0) AS total_points
         FROM students s
         LEFT JOIN point_events p ON p.student_id = s.id AND p.created_at BETWEEN ? AND ?
         WHERE s.is_active = 1 AND s.class_id = ?
         GROUP BY s.id
         ORDER BY total_points DESC, s.name`,
        [startStr, endStr, classId]
      ),
      query(
        `SELECT IFNULL(s.group_name,'Onbekend') AS group_name, IFNULL(SUM(p.delta),0) AS total_points
         FROM students s
         LEFT JOIN point_events p ON p.student_id = s.id AND p.created_at BETWEEN ? AND ?
         WHERE s.is_active = 1 AND s.class_id = ?
         GROUP BY group_name
         ORDER BY total_points DESC` ,
        [startStr, endStr, classId]
      ),
      query(
        `SELECT DATE(p.created_at) AS day, SUM(p.delta) AS total
         FROM point_events p
         WHERE p.created_at BETWEEN ? AND ? AND p.class_id = ?
         GROUP BY day
         ORDER BY day`,
        [startStr, endStr, classId]
      ),
      query(
        `SELECT COALESCE(p.reason, 'Geen reden') AS reason, COUNT(*) AS count
         FROM point_events p
         WHERE p.created_at BETWEEN ? AND ? AND p.class_id = ?
         GROUP BY reason
         ORDER BY count DESC
         LIMIT 20`,
        [startStr, endStr, classId]
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
    const classId = await ensureSelectedClass(req);
    const events = await query(
      `SELECT p.id, p.student_id, s.name AS student_name, p.delta, p.reason, p.created_at
       FROM point_events p
       LEFT JOIN students s ON s.id = p.student_id
       WHERE p.created_at BETWEEN ? AND ? AND p.class_id = ?
       ORDER BY p.created_at DESC`,
      [startStr, endStr, classId]
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
