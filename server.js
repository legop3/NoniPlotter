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
      const latRad = parseFloat(parts[3]);
      const lonRad = parseFloat(parts[4]);
      if (!Number.isNaN(latRad) && !Number.isNaN(lonRad)) {
        const latDeg = latRad * (180 / Math.PI);
        const lonDeg = lonRad * (180 / Math.PI);
        coords.push([latDeg, lonDeg]);
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
