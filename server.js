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
  const coords = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length > 4) {
      const lat = parseFloat(parts[3]);
      const lon = parseFloat(parts[4]);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
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
    .filter(f => fs.statSync(path.join(plotsDir, f)).isFile());
  const tracks = files.map(f => ({
    id: f,
    coords: parsePlotFile(path.join(plotsDir, f))
  }));
  res.json(tracks);
});

app.post('/api/upload', upload.single('plotfile'), (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server grooving on port ${PORT}`);
});
