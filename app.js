'use strict';

/* ============================================================
   Instrument — offline-first weather dashboard
   Data: Open-Meteo (no API key required)
   ============================================================ */

const CACHE_KEY = 'instrument:lastReading';
const DIAL_MIN = -20;
const DIAL_MAX = 45;

const WEATHER_CODES = {
  0: { label: 'Clear sky', category: 'clear' },
  1: { label: 'Mainly clear', category: 'clear' },
  2: { label: 'Partly cloudy', category: 'cloud' },
  3: { label: 'Overcast', category: 'cloud' },
  45: { label: 'Fog', category: 'fog' },
  48: { label: 'Depositing rime fog', category: 'fog' },
  51: { label: 'Light drizzle', category: 'rain' },
  53: { label: 'Drizzle', category: 'rain' },
  55: { label: 'Dense drizzle', category: 'rain' },
  56: { label: 'Freezing drizzle', category: 'snow' },
  57: { label: 'Dense freezing drizzle', category: 'snow' },
  61: { label: 'Slight rain', category: 'rain' },
  63: { label: 'Rain', category: 'rain' },
  65: { label: 'Heavy rain', category: 'rain' },
  66: { label: 'Freezing rain', category: 'snow' },
  67: { label: 'Heavy freezing rain', category: 'snow' },
  71: { label: 'Slight snow', category: 'snow' },
  73: { label: 'Snow fall', category: 'snow' },
  75: { label: 'Heavy snow', category: 'snow' },
  77: { label: 'Snow grains', category: 'snow' },
  80: { label: 'Rain showers', category: 'rain' },
  81: { label: 'Rain showers', category: 'rain' },
  82: { label: 'Violent rain showers', category: 'rain' },
  85: { label: 'Snow showers', category: 'snow' },
  86: { label: 'Heavy snow showers', category: 'snow' },
  95: { label: 'Thunderstorm', category: 'storm' },
  96: { label: 'Thunderstorm, hail', category: 'storm' },
  99: { label: 'Thunderstorm, heavy hail', category: 'storm' },
};

const CATEGORY_COLOR = {
  clear: '#c98a3e',
  cloud: 'rgba(238,240,240,0.56)',
  fog: 'rgba(238,240,240,0.56)',
  rain: '#6ea3aa',
  snow: '#eef0f0',
  storm: '#c06a4d',
};

function weatherInfo(code) {
  return WEATHER_CODES[code] || { label: 'Unknown', category: 'cloud' };
}

/* ---------- DOM refs ---------- */

const $ = (id) => document.getElementById(id);
const offlineFlag = $('offline-flag');
const searchForm = $('search-form');
const searchInput = $('search-input');
const searchResults = $('search-results');
const locateBtn = $('locate-btn');
const dialSvg = $('dial');
const tempValue = $('temp-value');
const conditionLabel = $('condition-label');
const feelsLike = $('feels-like');
const hiLo = $('hi-lo');
const humidity = $('humidity');
const wind = $('wind');
const pressure = $('pressure');
const uv = $('uv');
const forecastStrip = $('forecast-strip');
const placeLabel = $('place-label');
const updatedLabel = $('updated-label');

/* ---------- geometry helpers for the analog dial ---------- */

function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function tempToAngle(tempC, min = DIAL_MIN, max = DIAL_MAX) {
  const pct = Math.min(1, Math.max(0, (tempC - min) / (max - min)));
  return -135 + pct * 270;
}

function buildMainDial(tempC) {
  const cx = 120, cy = 120, r = 88;
  const ticks = [];
  const TICK_COUNT = 20;
  for (let i = 0; i <= TICK_COUNT; i++) {
    const angle = -135 + i * (270 / TICK_COUNT);
    const major = i % 5 === 0;
    const outer = polar(cx, cy, r + 8, angle);
    const inner = polar(cx, cy, r + (major ? -2 : 3), angle);
    ticks.push(
      `<line class="dial-tick${major ? ' dial-tick--major' : ''}" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke-width="${major ? 2 : 1}" />`
    );
  }
  const trackR = 74;
  const track = arcPath(cx, cy, trackR, -135, 135);
  const valueAngle = tempToAngle(tempC);
  const value = arcPath(cx, cy, trackR, -135, valueAngle);

  dialSvg.innerHTML = `
    <path class="dial-arc-track" d="${track}" />
    <path class="dial-arc-value" d="${value}" />
    ${ticks.join('')}
    <line class="dial-needle" id="dial-needle" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 66}" />
    <circle class="dial-hub" cx="${cx}" cy="${cy}" r="6" />
  `;
  requestAnimationFrame(() => {
    const needle = $('dial-needle');
    if (needle) needle.style.transform = `rotate(${valueAngle}deg)`;
  });
}

function buildMiniArc(hi, weekMin, weekMax, color) {
  const cx = 22, cy = 22, r = 15;
  const track = arcPath(cx, cy, r, -135, 135);
  const angle = tempToAngle(hi, weekMin, weekMax);
  const value = arcPath(cx, cy, r, -135, angle);
  return `<svg class="day-chip__arc" viewBox="0 0 44 44">
    <path d="${track}" fill="none" stroke="rgba(238,240,240,0.14)" stroke-width="4" />
    <path d="${value}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" />
  </svg>`;
}

/* ---------- rendering ---------- */

function fmtTemp(v) {
  return typeof v === 'number' ? `${Math.round(v)}°` : '—';
}

function renderWeather(payload, placeName) {
  const { current, daily } = payload;
  const info = weatherInfo(current.weather_code);

  buildMainDial(current.temperature_2m);
  tempValue.textContent = Math.round(current.temperature_2m);
  conditionLabel.textContent = info.label;
  conditionLabel.style.color = CATEGORY_COLOR[info.category];

  feelsLike.textContent = fmtTemp(current.apparent_temperature);
  hiLo.textContent = `${fmtTemp(daily.temperature_2m_max[0])} / ${fmtTemp(daily.temperature_2m_min[0])}`;
  humidity.textContent = `${Math.round(current.relative_humidity_2m)}%`;
  wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  pressure.textContent = `${Math.round(current.surface_pressure)} hPa`;
  uv.textContent = daily.uv_index_max && daily.uv_index_max[0] != null ? daily.uv_index_max[0].toFixed(1) : '—';

  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);

  forecastStrip.innerHTML = daily.time
    .map((dateStr, i) => {
      const date = new Date(dateStr + 'T00:00:00');
      const label = i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' });
      const dayInfo = weatherInfo(daily.weather_code[i]);
      const color = CATEGORY_COLOR[dayInfo.category];
      return `
        <div class="day-chip" title="${dayInfo.label}">
          <span class="day-chip__label">${label}</span>
          ${buildMiniArc(daily.temperature_2m_max[i], weekMin, weekMax, color)}
          <span class="day-chip__hi">${fmtTemp(daily.temperature_2m_max[i])}</span>
          <span class="day-chip__lo">${fmtTemp(daily.temperature_2m_min[i])}</span>
        </div>`;
    })
    .join('');

  placeLabel.textContent = placeName || 'Unknown location';
  const now = new Date();
  updatedLabel.textContent = `Updated ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function renderFromCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return false;
  try {
    const { payload, placeName, savedAt } = JSON.parse(raw);
    renderWeather(payload, placeName);
    updatedLabel.textContent = `Last saved ${new Date(savedAt).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })}`;
    return true;
  } catch {
    return false;
  }
}

function saveToCache(payload, placeName) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, placeName, savedAt: Date.now() }));
}

/* ---------- networking ---------- */

async function fetchWeather(lat, lon, placeName) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max');
  url.searchParams.set('forecast_days', '7');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const payload = await res.json();
  renderWeather(payload, placeName);
  saveToCache(payload, placeName);
  localStorage.setItem('instrument:lastCoords', JSON.stringify({ lat, lon, placeName }));
}

async function geocodeSearch(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '5');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  return data.results || [];
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return [data.city || data.locality, data.principalSubdivision, data.countryName].filter(Boolean).join(', ');
  } catch {
    return 'Current location';
  }
}

/* ---------- offline handling ---------- */

function updateOnlineStatus() {
  offlineFlag.hidden = navigator.onLine;
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

/* ---------- search UI ---------- */

let searchTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResults.hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    if (!navigator.onLine) return;
    try {
      const results = await geocodeSearch(q);
      if (!results.length) {
        searchResults.hidden = true;
        return;
      }
      searchResults.innerHTML = results
        .map((r, i) => {
          const region = [r.admin1, r.country].filter(Boolean).join(', ');
          return `<li><button type="button" data-idx="${i}">${r.name}<small>${region}</small></button></li>`;
        })
        .join('');
      searchResults.hidden = false;
      searchResults.querySelectorAll('button').forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const r = results[i];
          searchResults.hidden = true;
          searchInput.value = '';
          const placeName = [r.name, r.country].filter(Boolean).join(', ');
          fetchWeather(r.latitude, r.longitude, placeName).catch(() => {});
        });
      });
    } catch {
      /* silently ignore — likely offline mid-typing */
    }
  }, 350);
});

document.addEventListener('click', (e) => {
  if (!searchForm.contains(e.target)) searchResults.hidden = true;
});

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q || !navigator.onLine) return;
  try {
    const results = await geocodeSearch(q);
    if (results.length) {
      const r = results[0];
      const placeName = [r.name, r.country].filter(Boolean).join(', ');
      searchInput.value = '';
      searchResults.hidden = true;
      await fetchWeather(r.latitude, r.longitude, placeName);
    }
  } catch {
    /* ignore */
  }
});

locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const placeName = navigator.onLine ? await reverseGeocode(latitude, longitude) : 'Current location';
      locateBtn.disabled = false;
      fetchWeather(latitude, longitude, placeName).catch(() => {});
    },
    () => {
      locateBtn.disabled = false;
    },
    { timeout: 8000 }
  );
});

/* ---------- boot ---------- */

async function init() {
  updateOnlineStatus();

  const hadCache = renderFromCache();

  if (!navigator.onLine) {
    if (!hadCache) {
      conditionLabel.textContent = 'Offline — no saved reading yet';
    }
    return;
  }

  const lastCoords = localStorage.getItem('instrument:lastCoords');
  if (lastCoords) {
    const { lat, lon, placeName } = JSON.parse(lastCoords);
    fetchWeather(lat, lon, placeName).catch(() => {});
    return;
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const placeName = await reverseGeocode(latitude, longitude);
        fetchWeather(latitude, longitude, placeName).catch(() => {});
      },
      () => {
        // fall back to a default city so the panel is never empty
        fetchWeather(51.5072, -0.1276, 'London, United Kingdom').catch(() => {});
      },
      { timeout: 8000 }
    );
  } else {
    fetchWeather(51.5072, -0.1276, 'London, United Kingdom').catch(() => {});
  }
}

init();

/* ---------- service worker ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
