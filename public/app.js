const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
let tracks = [];
let bounds = null;

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);

function fitBounds() {
  const lats = [], lons = [];
  tracks.forEach(t => t.coords.forEach(([lat, lon]) => { lats.push(lat); lons.push(lon); }));
  if (!lats.length || !lons.length) return null;
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

function drawGrid() {
  const lines = 10;
  ctx.strokeStyle = '#eee';
  for (let i = 0; i <= lines; i++) {
    const x = (canvas.width / lines) * i;
    const y = (canvas.height / lines) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!bounds) return;
  drawGrid();
  tracks.forEach(t => {
    if (!t.visible) return;
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    t.coords.forEach(([lat, lon], idx) => {
      const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) * canvas.width;
      const y = canvas.height - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * canvas.height;
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function renderTrackList() {
  const list = document.getElementById('trackList');
  list.innerHTML = '';
  tracks.forEach(t => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = t.visible;
    checkbox.addEventListener('change', () => { t.visible = checkbox.checked; draw(); });
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = t.color;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(' ' + t.id));
    li.appendChild(label);
    list.appendChild(li);
  });
}

async function loadTracks() {
  const res = await fetch('/api/tracks');
  const data = await res.json();
  tracks = data.map(t => ({
    id: t.id,
    coords: t.coords,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
    visible: true
  }));
  bounds = fitBounds();
  renderTrackList();
  draw();
}

document.getElementById('uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch('/api/upload', { method: 'POST', body: formData });
  e.target.reset();
  loadTracks();
});

resizeCanvas();
loadTracks();
