const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

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

async function parseGpxFile(filePath) {
  const xml = await fs.readFile(filePath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const trks = data?.gpx?.trk;
  const segments = [];
  const pushPts = seg => {
    const pts = Array.isArray(seg.trkpt) ? seg.trkpt : seg.trkpt ? [seg.trkpt] : [];
    segments.push(...pts);
  };
  if (Array.isArray(trks)) {
    trks.forEach(trk => {
      const segs = Array.isArray(trk.trkseg) ? trk.trkseg : trk.trkseg ? [trk.trkseg] : [];
      segs.forEach(pushPts);
    });
  } else if (trks) {
    const segs = Array.isArray(trks.trkseg) ? trks.trkseg : trks.trkseg ? [trks.trkseg] : [];
    segs.forEach(pushPts);
  }
  return segments
    .map(pt => ({
      lat: parseFloat(pt['@_lat']),
      lon: parseFloat(pt['@_lon']),
      alt: pt.ele !== undefined ? parseFloat(pt.ele) : undefined,
      speed: pt.speed !== undefined ? parseFloat(pt.speed) : undefined,
      heading: pt.course !== undefined ? parseFloat(pt.course) : undefined
    }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tracks', async (req, res) => {
  try {
    const files = await fs.readdir(plotsDir);
    const trackPromises = files
      .filter(f => f.toLowerCase().endsWith('.gpx'))
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

app.post('/api/upload', upload.single('gpxfile'), (req, res) => {
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
