const map = L.map('map').setView([0, 0], 13);
const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const trackLayer = L.layerGroup().addTo(map);

async function loadTracks() {
  const res = await fetch('/api/tracks');
  const tracks = await res.json();
  trackLayer.clearLayers();
  let bounds = null;
  tracks.forEach(t => {
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const poly = L.polyline(t.coords, { color }).addTo(trackLayer);
    bounds = bounds ? bounds.extend(poly.getBounds()) : poly.getBounds();
  });
  if (bounds) {
    map.fitBounds(bounds);
  }
}

loadTracks();

document.getElementById('toggleMap').addEventListener('click', () => {
  if (map.hasLayer(tileLayer)) {
    map.removeLayer(tileLayer);
  } else {
    tileLayer.addTo(map);
  }
});

document.getElementById('uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch('/api/upload', { method: 'POST', body: formData });
  e.target.reset();
  loadTracks();
});
