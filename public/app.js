const map = L.map('map');
const mapDiv = document.getElementById('map');
const osmLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
});
osmLayer.addTo(map);

const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('backdrop');
const menuToggle = document.getElementById('menuToggle');
function toggleMenu() {
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('show');
}
menuToggle.addEventListener('click', toggleMenu);
backdrop.addEventListener('click', toggleMenu);

document.getElementById('mapToggle').addEventListener('click', () => {
  if (map.hasLayer(osmLayer)) {
    map.removeLayer(osmLayer);
    mapDiv.classList.add('grid');
  } else {
    osmLayer.addTo(map);
    mapDiv.classList.remove('grid');
  }
});

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? m[2] : null;
}

function setTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    document.cookie = `theme=${theme};path=/;max-age=31536000`;
  }
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }
}

function initTheme() {
  const saved = getCookie('theme');
  if (saved) {
    setTheme(saved, false);
  } else {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mq.matches ? 'dark' : 'light', false);
    mq.addEventListener('change', e => {
      if (!getCookie('theme')) setTheme(e.matches ? 'dark' : 'light', false);
    });
  }
}

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function computeStats(points) {
  const start = points[0];
  const end = points[points.length - 1];
  let minAlt = Infinity, maxAlt = -Infinity;
  let maxSpeed = -Infinity;
  let dist = 0;
  points.forEach((p, i) => {
    if (Number.isFinite(p.alt)) {
      if (p.alt < minAlt) minAlt = p.alt;
      if (p.alt > maxAlt) maxAlt = p.alt;
    }
    if (Number.isFinite(p.speed) && p.speed > maxSpeed) maxSpeed = p.speed;
    if (i > 0) dist += haversine(points[i - 1], p);
  });
  return {
    start,
    end,
    minAlt: Number.isFinite(minAlt) ? minAlt : null,
    maxAlt: Number.isFinite(maxAlt) ? maxAlt : null,
    maxSpeed: Number.isFinite(maxSpeed) ? maxSpeed : null,
    distance: dist
  };
}

function downloadCSV(track) {
  const header = 'lat,lon,alt,speed,heading\n';
  const rows = track.points.map(p => [p.lat, p.lon, p.alt ?? '', p.speed ?? '', p.heading ?? ''].join(',')).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${track.id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showTrackInfo(track) {
  const panel = document.getElementById('trackInfo');
  const { start, end, minAlt, maxAlt, maxSpeed, distance } = track.stats;
  const fmt = p => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  const items = [
    `<li><strong>Points:</strong> ${track.points.length}</li>`,
    `<li><strong>Start:</strong> ${fmt(start)}</li>`,
    `<li><strong>End:</strong> ${fmt(end)}</li>`,
    minAlt != null && maxAlt != null ? `<li><strong>Altitude:</strong> ${minAlt.toFixed(1)}–${maxAlt.toFixed(1)} m</li>` : '',
    maxSpeed != null ? `<li><strong>Top speed:</strong> ${maxSpeed.toFixed(2)} m/s</li>` : '',
    `<li><strong>Distance:</strong> ${(distance / 1000).toFixed(2)} km</li>`
  ].filter(Boolean).join('');
  panel.innerHTML = `<h3>${track.id}</h3><ul>${items}</ul><button id="csv${track.id}">Download CSV</button>`;
  document.getElementById(`csv${track.id}`).addEventListener('click', () => downloadCSV(track));
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0;
}

let tracks = [];
function renderTrackList() {
  const list = document.getElementById('trackList');
  list.innerHTML = '';
  tracks.forEach(t => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = t.visible;
    checkbox.addEventListener('change', () => {
      t.visible = checkbox.checked;
      if (checkbox.checked) {
        t.layer.addTo(map);
      } else {
        map.removeLayer(t.layer);
      }
    });
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = t.color;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(' ' + t.id));
    li.appendChild(label);

    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'info';
    infoBtn.className = 'infoBtn';
    infoBtn.addEventListener('click', () => showTrackInfo(t));
    li.appendChild(infoBtn);
    list.appendChild(li);
  });
}

async function loadTracks() {
  const res = await fetch('/api/tracks');
  const data = await res.json();
  tracks.forEach(t => map.removeLayer(t.layer));
  tracks = data.map(t => {
    const latlngs = t.points.map(p => [p.lat, p.lon]);
    const color = `hsl(${hashString(t.id) % 360}, 100%, 60%)`;
    const layer = L.polyline(latlngs, { color }).addTo(map);
    return { id: t.id, points: t.points, stats: computeStats(t.points), color, layer, visible: true };
  });
  if (tracks.length) {
    const all = tracks.flatMap(t => t.points.map(p => [p.lat, p.lon]));
    map.fitBounds(all);
  }
  renderTrackList();
  document.getElementById('trackInfo').innerHTML = '<em>Select a track above</em>';
}

document.getElementById('uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch('/api/upload', { method: 'POST', body: formData });
  e.target.reset();
  loadTracks();
});

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const ids = tracks.filter(t => t.visible).map(t => t.id);
  if (!ids.length) return;
  const res = await fetch(`/api/download?ids=${ids.map(encodeURIComponent).join(',')}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tracks.gpx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());

initTheme();
loadTracks();
