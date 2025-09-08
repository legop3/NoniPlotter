const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const plotsDir = path.join(__dirname, 'plots');

// Make sure plots directory exists
fs.mkdir(plotsDir, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, plotsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

async function parsePlotFile(filePath) {
  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean);
  let units = 'deg';
  if (lines[0] && /^#?\s*units\s*=\s*rad/i.test(lines[0])) {
    units = 'rad';
    lines.shift();
  }
  const points = [];
  let maxAbs = 0;
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length > 7) {
      // column order: lon | lat | speed | heading | altitude
      let lon = parseFloat(parts[3]);
      let lat = parseFloat(parts[4]);
      const speed = parseFloat(parts[5]);
      const heading = parseFloat(parts[6]);
      const alt = parseFloat(parts[7]);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        maxAbs = Math.max(maxAbs, Math.abs(lat), Math.abs(lon));
        points.push({ lat, lon, speed, heading, alt });
      }
    }
  }
  if (units === 'rad' || maxAbs <= Math.PI) {
    points.forEach(p => {
      p.lat = (p.lat * 180) / Math.PI;
      p.lon = (p.lon * 180) / Math.PI;
    });
  }
  return points;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tracks', async (req, res) => {
  try {
    const files = await fs.readdir(plotsDir);
    const trackPromises = files
      .filter(f => !f.startsWith('.'))
      .map(async f => {
        const full = path.join(plotsDir, f);
        const stat = await fs.stat(full);
        if (!stat.isFile()) return null;
        const points = await parsePlotFile(full);
        return points.length ? { id: f, points } : null;
      });
    const tracks = (await Promise.all(trackPromises)).filter(Boolean);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tracks' });
  }
});

app.post('/api/upload', upload.single('plotfile'), (req, res) => {
  res.json({ status: 'ok' });
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
      const points = await parsePlotFile(full).catch(() => []);
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
