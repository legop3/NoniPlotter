const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const fss = require('fs');
const path = require('path');
const sax = require('sax');

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

// Cache parsed tracks to avoid rereading files that haven't changed
const trackCache = new Map();

// Read a GPX file from disk and pluck out the tasty bits we need
async function parsePlotFile(filePath, mtimeMs) {
  if (mtimeMs === undefined) {
    mtimeMs = (await fs.stat(filePath)).mtimeMs;
  }
  const cached = trackCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.points;
  }
  return new Promise((resolve, reject) => {
    const points = [];
    let current = null;
    let tag = null;
    const parser = sax.createStream(true, { trim: true, normalize: true });

    parser.on('opentag', node => {
      tag = node.name;
      if (node.name === 'trkpt') {
        current = {
          lat: parseFloat(node.attributes.lat),
          lon: parseFloat(node.attributes.lon)
        };
      }
    });
    parser.on('text', text => {
      if (!current || !tag) return;
      switch (tag.toLowerCase()) {
        case 'ele':
          current.alt = parseFloat(text);
          break;
        case 'speed':
        case 'gpxtpx:speed':
          current.speed = parseFloat(text);
          break;
        case 'course':
        case 'heading':
          current.heading = parseFloat(text);
          break;
      }
    });
    parser.on('closetag', name => {
      if (name === 'trkpt' && current) {
        points.push(current);
        current = null;
      }
      tag = null;
    });
    parser.on('error', reject);
    parser.on('end', () => {
      trackCache.set(filePath, { mtimeMs, points });
      resolve(points);
    });

    fss.createReadStream(filePath).pipe(parser);
  });
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
        const points = await parsePlotFile(full, stat.mtimeMs);
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
      const stat = await fs.stat(full).catch(() => null);
      const points = stat ? await parsePlotFile(full, stat.mtimeMs).catch(() => []) : [];
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
