const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const plotsDir = path.join(__dirname, 'plots');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cookies';

// Make sure plots directory exists
fs.mkdir(plotsDir, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, plotsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

function requirePassword(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function renderLegacyPage({ title, heading, message, status }) {
  const pageTitle = title || heading || 'NoniPlotter';
  const color = status === 'error' ? '#8b0000' : '#064600';
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8" />',
    `  <title>${pageTitle}</title>`,
    '  <style type="text/css">',
    '    body { background: #fdf9f2; color: #1a1a1a; font-family: Arial, Helvetica, sans-serif; margin: 2em; }',
    '    .panel { border: 1px solid #444; padding: 1em; max-width: 32em; background: #fff; }',
    '    h1 { font-size: 1.4em; color: ' + color + '; margin-top: 0; }',
    '    p { line-height: 1.4; }',
    '    .links { margin-top: 1.5em; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="panel">',
    `    <h1>${heading}</h1>`,
    `    <p>${message}</p>`,
    '    <div class="links">',
    '      <p><a href="/retro-upload.html">Return to the retro upload form</a></p>',
    '      <p><a href="/">Back to the fancy map</a></p>',
    '    </div>',
    '  </div>',
    '</body>',
    '</html>'
  ].join('\n');
}

async function parseGpxFile(filePath) {
  try {
    const xml = await fs.readFile(filePath, 'utf8');
    const pattern =
      '<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\\s\\S]*?)<\/trkpt>' +
      '|<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*\/>';
    const regex = new RegExp(pattern, 'gi');
    const points = [];
    let m;
    while ((m = regex.exec(xml))) {
      const lat = parseFloat(m[1] || m[4]);
      const lon = parseFloat(m[2] || m[5]);
      const inner = m[3] || '';
      const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/i);
      const alt = eleMatch ? parseFloat(eleMatch[1]) : undefined;
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        points.push({ lat, lon, alt });
      }
    }
    return points;
  } catch {
    return [];
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tracks', async (req, res) => {
  try {
    const files = await fs.readdir(plotsDir);
    const trackPromises = files
      .filter(f => !f.startsWith('.') && f.toLowerCase().endsWith('.gpx'))
      .map(async f => {
        const full = path.join(plotsDir, f);
        const stat = await fs.stat(full);
        if (!stat.isFile()) return null;
        const points = await parseGpxFile(full);
        return points.length ? { id: f, points } : null;
      });
    const tracks = (await Promise.all(trackPromises)).filter(Boolean);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tracks' });
  }
});

app.post('/api/upload', requirePassword, upload.single('plotfile'), (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/retro-upload', upload.single('plotfile'), async (req, res) => {
  const rawPassword = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  const password = rawPassword.trim();
  const file = req.file;

  if (password !== ADMIN_PASSWORD) {
    if (file) {
      await fs.unlink(file.path).catch(() => {});
    }
    return res
      .status(401)
      .send(
        renderLegacyPage({
          title: 'Upload failed',
          heading: 'Password incorrect',
          message: 'The password did not match. Please double-check the shared secret and try again.',
          status: 'error'
        })
      );
  }

  if (!file) {
    return res
      .status(400)
      .send(
        renderLegacyPage({
          title: 'No file uploaded',
          heading: 'Nothing was uploaded',
          message: 'We did not receive a GPX file. Please choose a file and submit the form again.',
          status: 'error'
        })
      );
  }

  const safeName = escapeHtml(file.originalname || file.filename || 'your GPX file');
  res.send(
    renderLegacyPage({
      title: 'Upload complete',
      heading: 'Upload complete',
      message: `The file <strong>${safeName}</strong> is now tucked safely into the plot stash.`,
      status: 'success'
    })
  );
});

app.delete('/api/delete/:id', requirePassword, async (req, res) => {
  const id = path.basename(req.params.id);
  try {
    await fs.unlink(path.join(plotsDir, id));
    res.json({ status: 'ok' });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

app.get('/api/download', async (req, res) => {
  const ids = (req.query.ids || '').split(',').map(id => path.basename(id)).filter(Boolean);
  if (!ids.length) {
    return res.status(400).send('No tracks specified');
  }
  try {
    const trks = [];
    for (const id of ids) {
      const full = path.join(plotsDir, id);
      const points = await parseGpxFile(full).catch(() => []);
      if (points.length) {
        const pts = points
          .map(p => {
            const ele = Number.isFinite(p.alt) ? `<ele>${p.alt}</ele>` : '';
            return `<trkpt lat="${p.lat}" lon="${p.lon}">${ele}</trkpt>`;
          })
          .join('');
        trks.push(`<trk><name>${id}</name><trkseg>${pts}</trkseg></trk>`);
      }
    }
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>` +
      `<gpx version="1.1" creator="NoniPlotter" xmlns="http://www.topografix.com/GPX/1/1">${trks.join('')}</gpx>`;
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="tracks.gpx"');
    res.send(gpx);
  } catch (err) {
    res.status(500).send('Failed to generate GPX');
  }
});

app.listen(PORT, () => {
  console.log(`Server grooving on port ${PORT}`);
});
