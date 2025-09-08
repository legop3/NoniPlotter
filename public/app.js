const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
let tracks = [];
let worldBounds = null;
let view = { scale: 1, originLat: 0, originLon: 0 };
let isDragging = false;
let lastX = 0;
let lastY = 0;

function resizeCanvas() {
  const prevW = canvas.width || 0;
  const prevH = canvas.height || 0;
  const centerLon = view.originLon + prevW / (2 * view.scale);
  const centerLat = view.originLat - prevH / (2 * view.scale);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  view.originLon = centerLon - canvas.width / (2 * view.scale);
  view.originLat = centerLat + canvas.height / (2 * view.scale);
  draw();
}
window.addEventListener('resize', resizeCanvas);

function computeWorldBounds() {
  const lats = [];
  const lons = [];
  tracks.forEach(t => t.coords.forEach(([lat, lon]) => { lats.push(lat); lons.push(lon); }));
  if (!lats.length || !lons.length) return null;
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons)
  };
}

function fitView() {
  if (!worldBounds) return;
  const lonRange = worldBounds.maxLon - worldBounds.minLon;
  const latRange = worldBounds.maxLat - worldBounds.minLat;
  view.scale = Math.min(
    canvas.width / lonRange,
    canvas.height / latRange
  );
  const centerLon = (worldBounds.minLon + worldBounds.maxLon) / 2;
  const centerLat = (worldBounds.minLat + worldBounds.maxLat) / 2;
  view.originLon = centerLon - canvas.width / (2 * view.scale);
  view.originLat = centerLat + canvas.height / (2 * view.scale);
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
  drawGrid();
  tracks.forEach(t => {
    if (!t.visible) return;
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    t.coords.forEach(([lat, lon], idx) => {
      const x = (lon - view.originLon) * view.scale;
      const y = (view.originLat - lat) * view.scale;
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
  worldBounds = computeWorldBounds();
  fitView();
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

canvas.addEventListener('mousedown', e => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  view.originLon -= dx / view.scale;
  view.originLat += dy / view.scale;
  lastX = e.clientX;
  lastY = e.clientY;
  draw();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  canvas.style.cursor = 'grab';
});

resizeCanvas();
canvas.style.cursor = 'grab';
loadTracks();
