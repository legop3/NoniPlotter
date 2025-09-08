const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const plotsDir = path.join(__dirname, 'plots');

// Make sure plots directory exists
if (!fs.existsSync(plotsDir)) {
  fs.mkdirSync(plotsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, plotsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

function parsePlotFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
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

app.get('/api/tracks', (req, res) => {
  const files = fs
    .readdirSync(plotsDir)
    .filter(f => fs.statSync(path.join(plotsDir, f)).isFile() && !f.startsWith('.'));
  const tracks = files
    .map(f => ({ id: f, coords: parsePlotFile(path.join(plotsDir, f)) }))
    .filter(t => t.coords.length);
  res.json(tracks);
});

app.post('/api/upload', upload.single('plotfile'), (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server grooving on port ${PORT}`);
});
