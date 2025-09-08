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
  const coords = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length > 4) {
      // Files store longitude before latitude; flip them so north maps upward
      let lon = parseFloat(parts[3]);
      let lat = parseFloat(parts[4]);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        if (units === 'rad') {
          lat = (lat * 180) / Math.PI;
          lon = (lon * 180) / Math.PI;
        }
        coords.push([lat, lon]);
      }
    }
  }
  return coords;
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
        const coords = await parsePlotFile(full);
        return coords.length ? { id: f, coords } : null;
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

app.listen(PORT, () => {
  console.log(`Server grooving on port ${PORT}`);
});
