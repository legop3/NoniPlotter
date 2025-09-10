const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
const glCanvas = document.getElementById('glCanvas');
let gl = null;
let tracks = [];
let worldBounds = null;
let view = { scale: 1, originLat: 0, originLon: 0 };
let isDragging = false;
let lastX = 0;
let lastY = 0;
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('backdrop');
const menuToggle = document.getElementById('menuToggle');
const themeToggle = document.getElementById('themeToggle');
const altToggle = document.getElementById('altitudeToggle');
const passwordInput = document.getElementById('adminPassword');
let colorByAltitude = altToggle ? altToggle.checked : true;
glCanvas.style.display = colorByAltitude ? 'block' : 'none';
const altLegend = document.getElementById('altLegend');

function toggleMenu() {
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('show');
}

menuToggle.addEventListener('click', toggleMenu);
backdrop.addEventListener('click', toggleMenu);

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
  draw();
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

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
}

if (altToggle) {
  altToggle.addEventListener('change', () => {
    colorByAltitude = altToggle.checked;
    glCanvas.style.display = colorByAltitude ? 'block' : 'none';
    draw();
  });
}


function zoom(factor, centerX, centerY) {
  const worldX = view.originLon + centerX / view.scale;
  const worldY = view.originLat - centerY / view.scale;
  view.scale *= factor;
  view.originLon = worldX - centerX / view.scale;
  view.originLat = worldY + centerY / view.scale;
  draw();
}

function resizeCanvas() {
  const prevW = canvas.width || 0;
  const prevH = canvas.height || 0;
  const centerLon = view.originLon + prevW / (2 * view.scale);
  const centerLat = view.originLat - prevH / (2 * view.scale);
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  if (glCanvas) {
    glCanvas.width = canvas.width;
    glCanvas.height = canvas.height;
  }
  view.originLon = centerLon - canvas.width / (2 * view.scale);
  view.originLat = centerLat + canvas.height / (2 * view.scale);
  draw();
}
window.addEventListener('resize', resizeCanvas);

function computeBounds(points) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  points.forEach(p => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  });
  return { minLat, maxLat, minLon, maxLon };
}

function computeWorldBounds() {
  if (!tracks.length) return null;
  const lats = [];
  const lons = [];
  tracks.forEach(t => {
    lats.push(t.bounds.minLat, t.bounds.maxLat);
    lons.push(t.bounds.minLon, t.bounds.maxLon);
  });
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
  const targetPx = 100;
  const degPerLine = targetPx / view.scale;
  const pow = Math.pow(10, Math.floor(Math.log10(degPerLine)));
  const step = [1, 2, 5, 10].find(s => degPerLine <= s * pow) * pow;
  const startLon = Math.floor(view.originLon / step) * step;
  const endLon = view.originLon + canvas.width / view.scale;
  const startLat = Math.ceil(view.originLat / step) * step;
  const endLat = view.originLat - canvas.height / view.scale;
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.strokeStyle = gridColor;
  for (let lon = startLon; lon <= endLon; lon += step) {
    const x = (lon - view.originLon) * view.scale;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let lat = startLat; lat >= endLat; lat -= step) {
    const y = (view.originLat - lat) * view.scale;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function altToRgb(alt, min, max) {
  const range = max - min || 1;
  const ratio = (alt - min) / range;
  const hue = 240 - 240 * ratio;
  return hslToRgb(hue, 100, 50);
}

function getAltRange() {
  const mins = [];
  const maxs = [];
  tracks.forEach(t => {
    if (!t.visible) return;
    const { minAlt, maxAlt } = t.stats;
    if (minAlt != null && maxAlt != null) {
      mins.push(minAlt);
      maxs.push(maxAlt);
    }
  });
  if (!mins.length) return null;
  return { min: Math.min(...mins), max: Math.max(...maxs) };
}

function updateAltLegend() {
  if (!altLegend) return;
  if (!colorByAltitude) {
    altLegend.style.display = 'none';
    return;
  }
  const range = getAltRange();
  if (!range) {
    altLegend.style.display = 'none';
    return;
  }
  altLegend.style.display = 'flex';
  altLegend.querySelector('.min').textContent = `${range.min.toFixed(1)} m`;
  altLegend.querySelector('.max').textContent = `${range.max.toFixed(1)} m`;
}

function compileShader(type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return shader;
}

function initGL() {
  gl = glCanvas.getContext('webgl');
  if (!gl) return;
  gl.clearColor(0, 0, 0, 0);
  const vs = compileShader(gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    attribute vec3 a_color;
    uniform float u_originLon;
    uniform float u_originLat;
    uniform float u_scale;
    uniform float u_width;
    uniform float u_height;
    varying vec3 v_color;
    void main() {
      float x = (a_pos.x - u_originLon) * u_scale;
      float y = (u_originLat - a_pos.y) * u_scale;
      float clipX = (x / u_width) * 2.0 - 1.0;
      float clipY = (y / u_height) * -2.0 + 1.0;
      gl_Position = vec4(clipX, clipY, 0.0, 1.0);
      v_color = a_color;
    }
  `);
  const fs = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 v_color;
    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.attrs = {
    pos: gl.getAttribLocation(program, 'a_pos'),
    color: gl.getAttribLocation(program, 'a_color')
  };
  gl.enableVertexAttribArray(gl.attrs.pos);
  gl.enableVertexAttribArray(gl.attrs.color);
  gl.uniforms = {
    originLon: gl.getUniformLocation(program, 'u_originLon'),
    originLat: gl.getUniformLocation(program, 'u_originLat'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    width: gl.getUniformLocation(program, 'u_width'),
    height: gl.getUniformLocation(program, 'u_height')
  };
}

function buildGlTrack(track) {
  if (!gl) return;
  const data = new Float32Array(track.points.length * 5);
  const { minAlt, maxAlt } = track.stats;
  let defaultRgb = [0, 0, 0];
  const m = /hsl\((\d+),/.exec(track.color);
  if (m) defaultRgb = hslToRgb(parseFloat(m[1]), 100, 60);
  track.points.forEach((p, i) => {
    const base = i * 5;
    data[base] = p.lon;
    data[base + 1] = p.lat;
    let rgb = defaultRgb;
    if (Number.isFinite(p.alt) && minAlt != null && maxAlt != null) {
      rgb = altToRgb(p.alt, minAlt, maxAlt);
    }
    data[base + 2] = rgb[0];
    data[base + 3] = rgb[1];
    data[base + 4] = rgb[2];
  });
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  track.glBuffer = buffer;
  track.glCount = track.points.length;
}

function drawPlainTracks() {
  tracks.forEach(t => {
    if (!t.visible) return;
    ctx.strokeStyle = t.color;
    ctx.beginPath();
    t.points.forEach((p, idx) => {
      const x = (p.lon - view.originLon) * view.scale;
      const y = (view.originLat - p.lat) * view.scale;
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function drawGLTracks() {
  if (!gl) return;
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(gl.uniforms.originLon, view.originLon);
  gl.uniform1f(gl.uniforms.originLat, view.originLat);
  gl.uniform1f(gl.uniforms.scale, view.scale);
  gl.uniform1f(gl.uniforms.width, glCanvas.width);
  gl.uniform1f(gl.uniforms.height, glCanvas.height);
  tracks.forEach(t => {
    if (!t.visible || !t.glBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, t.glBuffer);
    gl.vertexAttribPointer(gl.attrs.pos, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(gl.attrs.color, 3, gl.FLOAT, false, 20, 8);
    gl.drawArrays(gl.LINE_STRIP, 0, t.glCount);
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  if (colorByAltitude) {
    drawGLTracks();
  } else {
    drawPlainTracks();
  }
  updateAltLegend();
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

    const infoBtn = document.createElement('button');
    infoBtn.textContent = 'info';
    infoBtn.className = 'infoBtn';
    infoBtn.addEventListener('click', () => showTrackInfo(t));
    li.appendChild(infoBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'delete';
    delBtn.className = 'deleteBtn';
    delBtn.addEventListener('click', async () => {
      const pwd = passwordInput ? passwordInput.value : '';
      await fetch(`/api/delete/${encodeURIComponent(t.id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': pwd }
      });
      loadTracks();
    });
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

function haversine(a, b) {
  const R = 6371000; // metres
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

async function loadTracks() {
  const res = await fetch('/api/tracks');
  const data = await res.json();
  tracks = data.map(t => {
    const pts = t.points;
    const bounds = computeBounds(pts);
    const track = {
      id: t.id,
      points: pts,
      stats: computeStats(pts),
      bounds,
      color: `hsl(${hashString(t.id) % 360}, 100%, 60%)`,
      visible: true,
      glBuffer: null,
      glCount: 0
    };
    buildGlTrack(track);
    return track;
  });
  worldBounds = computeWorldBounds();
  fitView();
  renderTrackList();
  document.getElementById('trackInfo').innerHTML = '<em>Select a track above</em>';
  draw();
}

document.getElementById('uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const pwd = passwordInput ? passwordInput.value : '';
  await fetch('/api/upload', {
    method: 'POST',
    headers: { 'x-admin-password': pwd },
    body: formData
  });
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

document.getElementById('zoomIn').addEventListener('click', () => {
  zoom(1.2, canvas.width / 2, canvas.height / 2);
});
document.getElementById('zoomOut').addEventListener('click', () => {
  zoom(1 / 1.2, canvas.width / 2, canvas.height / 2);
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.002);
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  zoom(factor, x, y);
}, { passive: false });

// Touch support: pan with one finger, pinch with two, with a dash of inertia
let pinchDist = 0;
let pinchMidX = 0;
let pinchMidY = 0;
let velocityX = 0;
let velocityY = 0;
let lastMoveTime = 0;
let momentumId = null;

function applyMomentum() {
  const decay = 0.95;
  const step = () => {
    view.originLon -= velocityX * 16 / view.scale;
    view.originLat += velocityY * 16 / view.scale;
    velocityX *= decay;
    velocityY *= decay;
    draw();
    if (Math.abs(velocityX) > 0.01 || Math.abs(velocityY) > 0.01) {
      momentumId = requestAnimationFrame(step);
    } else {
      momentumId = null;
    }
  };
  if (momentumId) cancelAnimationFrame(momentumId);
  momentumId = requestAnimationFrame(step);
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (momentumId) {
    cancelAnimationFrame(momentumId);
    momentumId = null;
  }
  if (e.touches.length === 1) {
    const t = e.touches[0];
    isDragging = true;
    lastX = t.clientX;
    lastY = t.clientY;
    lastMoveTime = Date.now();
    velocityX = 0;
    velocityY = 0;
  } else if (e.touches.length === 2) {
    isDragging = false;
    const [t1, t2] = e.touches;
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    pinchDist = Math.hypot(dx, dy);
    const rect = canvas.getBoundingClientRect();
    pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
    pinchMidY = (t1.clientY + t2.clientY) / 2 - rect.top;
    velocityX = 0;
    velocityY = 0;
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const t = e.touches[0];
    const dx = t.clientX - lastX;
    const dy = t.clientY - lastY;
    const now = Date.now();
    const dt = now - lastMoveTime;
    view.originLon -= dx / view.scale;
    view.originLat += dy / view.scale;
    lastX = t.clientX;
    lastY = t.clientY;
    if (dt > 0) {
      velocityX = dx / dt;
      velocityY = dy / dt;
    }
    lastMoveTime = now;
    draw();
  } else if (e.touches.length === 2) {
    const [t1, t2] = e.touches;
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    const dist = Math.hypot(dx, dy);
    const rect = canvas.getBoundingClientRect();
    const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
    const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
    const midDx = midX - pinchMidX;
    const midDy = midY - pinchMidY;
    view.originLon -= midDx / view.scale;
    view.originLat += midDy / view.scale;
    const factor = dist / pinchDist;
    zoom(factor, midX, midY);
    pinchDist = dist;
    pinchMidX = midX;
    pinchMidY = midY;
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  if (e.touches.length === 0) {
    isDragging = false;
    applyMomentum();
  }
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
  isDragging = false;
  applyMomentum();
}, { passive: false });

window.addEventListener('mouseup', () => {
  isDragging = false;
  canvas.style.cursor = 'grab';
});

initTheme();
initGL();
resizeCanvas();
canvas.style.cursor = 'grab';
loadTracks();
