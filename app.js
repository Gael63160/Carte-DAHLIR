/* Carte ruralité AURA – DAHLIR
 * Leaflet + MarkerCluster + PapaParse (tous open source).
 * Données attendues dans ./data : frr_aura.geojson, qpv_aura.geojson, actions_dahlir.csv
 */
(function () {
  'use strict';

  var FILES = {
    frr: 'data/frr_aura.geojson',
    qpv: 'data/qpv_aura.geojson',
    actions: 'data/actions_dahlir.csv'
  };

  var COLORS = { frr: '#2e7d32', frrplus: '#145a1a', qpv: '#c2410c' };
  var TYPE_COLORS = ['#1d4ed8', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#475569', '#0d9488', '#b91c1c'];

  var DEPARTEMENTS = {
    '01': 'Ain', '03': 'Allier', '07': 'Ardèche', '15': 'Cantal', '26': 'Drôme', '38': 'Isère',
    '42': 'Loire', '43': 'Haute-Loire', '63': 'Puy-de-Dôme', '69': 'Rhône', '73': 'Savoie', '74': 'Haute-Savoie'
  };

  // ---------- utilitaires ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function alerte(msg) {
    var a = $('alerte');
    a.style.display = 'block';
    a.innerHTML += (a.innerHTML ? '<br>' : '') + msg;
  }
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' : HTTP ' + r.status);
      return r.json();
    });
  }
  function getCSV(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' : HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      return Papa.parse(txt, { header: true, skipEmptyLines: true }).data;
    });
  }

  // ---------- géométrie : point dans polygone (ray casting) ----------
  function inRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(x, y, rings) {
    if (!inRing(x, y, rings[0])) return false;
    for (var k = 1; k < rings.length; k++) if (inRing(x, y, rings[k])) return false;
    return true;
  }
  function bboxOf(coords, b) {
    b = b || [Infinity, Infinity, -Infinity, -Infinity];
    if (typeof coords[0] === 'number') {
      if (coords[0] < b[0]) b[0] = coords[0];
      if (coords[1] < b[1]) b[1] = coords[1];
      if (coords[0] > b[2]) b[2] = coords[0];
      if (coords[1] > b[3]) b[3] = coords[1];
      return b;
    }
    for (var i = 0; i < coords.length; i++) bboxOf(coords[i], b);
    return b;
  }
  function buildIndex(fc) {
    return fc.features.filter(function (f) { return f.geometry; }).map(function (f) {
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return { f: f, polys: polys, bbox: bboxOf(f.geometry.coordinates) };
    });
  }
  function findFeature(index, lon, lat) {
    for (var i = 0; i < index.length; i++) {
      var e = index[i], b = e.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      for (var p = 0; p < e.polys.length; p++) {
        if (inPolygon(lon, lat, e.polys[p])) return e.f;
      }
    }
    return null;
  }

  // ---------- carte ----------
  var map = L.map('map', { zoomControl: true }).setView([45.45, 4.6], 7);
  var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });
  var positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '© OpenStreetMap, © <a href="https://carto.com/attributions">CARTO</a>'
  });
  positron.addTo(map);
  L.control.layers({ 'Fond clair (CARTO)': positron, 'OpenStreetMap': osm }, null, { position: 'topright' }).addTo(map);

  var layerFRR = L.layerGroup().addTo(map);
  var layerFRRplus = L.layerGroup().addTo(map);
  var layerQPV = L.layerGroup().addTo(map);
  var cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 }).addTo(map);

  var state = { frrIdx: [], qpvIdx: [], frrByCode: {}, actions: [], markers: [], typeColor: {} };

  // ---------- chargement des couches de zonage ----------
  function loadZones() {
    var pFRR = getJSON(FILES.frr).then(function (fc) {
      state.frrIdx = buildIndex(fc);
      fc.features.forEach(function (f) {
        var p = f.properties || {};
        var code = String(p.code || p.insee || '');
        var plus = String(p.statut || '').indexOf('+') !== -1;
        if (code) state.frrByCode[code] = plus ? 'FRR+' : 'FRR';
        var layer = L.geoJSON(f, {
          style: {
            color: plus ? COLORS.frrplus : COLORS.frr, weight: 0.8, opacity: 0.9,
            fillColor: plus ? COLORS.frrplus : COLORS.frr, fillOpacity: plus ? 0.42 : 0.22
          },
          onEachFeature: function (ft, l) {
            l.bindTooltip(esc(p.nom || code) + ' – ' + (plus ? 'FRR+' : 'FRR'), { sticky: true });
          }
        });
        (plus ? layerFRRplus : layerFRR).addLayer(layer);
      });
    }).catch(function (e) {
      console.warn(e);
      alerte('Couche FRR introuvable (<code>' + esc(FILES.frr) + '</code>). Lancez <code>python scripts/prepare_data.py</code>.');
    });

    var pQPV = getJSON(FILES.qpv).then(function (fc) {
      state.qpvIdx = buildIndex(fc);
      L.geoJSON(fc, {
        style: { color: COLORS.qpv, weight: 1.6, fillColor: COLORS.qpv, fillOpacity: 0.35 },
        onEachFeature: function (ft, l) {
          var p = ft.properties || {};
          l.bindTooltip('QPV ' + esc(p.lib_qp || p.nom_qp || p.code_qp || ''), { sticky: true });
        }
      }).addTo(layerQPV);
    }).catch(function (e) {
      console.warn(e);
      alerte('Couche QPV introuvable (<code>' + esc(FILES.qpv) + '</code>). Lancez <code>python scripts/prepare_data.py</code>.');
    });

    return Promise.all([pFRR, pQPV]);
  }

  // ---------- actions ----------
  function zoneOf(a) {
    var zones = [];
    var code = String(a.code_insee || '').trim();
    var frr = code ? state.frrByCode[code] : null;
    if (!frr && !code && state.frrIdx.length) {
      var f = findFeature(state.frrIdx, a.lon, a.lat);
      if (f) frr = String((f.properties || {}).statut || '').indexOf('+') !== -1 ? 'FRR+' : 'FRR';
    }
    if (frr) zones.push(frr);
    if (state.qpvIdx.length && findFeature(state.qpvIdx, a.lon, a.lat)) zones.push('QPV');
    return zones;
  }

  function loadActions() {
    return getCSV(FILES.actions).then(function (rows) {
      var types = {};
      state.actions = rows.map(function (r, i) {
        var lat = parseFloat(String(r.lat).replace(',', '.'));
        var lon = parseFloat(String(r.lon).replace(',', '.'));
        var a = {
          id: r.id || String(i + 1), titre: r.titre || '(sans titre)', type: r.type || 'Autre',
          commune: r.commune || '', code_insee: r.code_insee || '', lat: lat, lon: lon,
          date: r.date || '', statut: r.statut || '', partenaires: r.partenaires || '',
          description: r.description || '', lien: r.lien || ''
        };
        a.dep = String(a.code_insee).slice(0, 2);
        types[a.type] = true;
        return a;
      }).filter(function (a) { return isFinite(a.lat) && isFinite(a.lon); });

      state.actions.forEach(function (a) { a.zones = zoneOf(a); });

      Object.keys(types).sort().forEach(function (t, i) {
        state.typeColor[t] = TYPE_COLORS[i % TYPE_COLORS.length];
        var o = document.createElement('option'); o.value = t; o.textContent = t;
        $('f-type').appendChild(o);
      });
      Object.keys(DEPARTEMENTS).forEach(function (d) {
        var o = document.createElement('option'); o.value = d; o.textContent = d + ' – ' + DEPARTEMENTS[d];
        $('f-dep').appendChild(o);
      });

      state.markers = state.actions.map(function (a) {
        var m = L.circleMarker([a.lat, a.lon], {
          radius: 8, color: '#fff', weight: 1.5, fillColor: state.typeColor[a.type], fillOpacity: 0.95
        });
        m.bindPopup(popupHTML(a), { maxWidth: 320 });
        m._action = a;
        return m;
      });
    }).catch(function (e) {
      console.warn(e);
      alerte('Fichier des actions introuvable (<code>' + esc(FILES.actions) + '</code>).');
    });
  }

  function popupHTML(a) {
    var h = '<h3>' + esc(a.titre) + '</h3>';
    h += '<p><span class="badge">' + esc(a.type) + '</span>';
    a.zones.forEach(function (z) { h += '<span class="badge">' + esc(z) + '</span>'; });
    if (!a.zones.length) h += '<span class="badge">hors zonage</span>';
    h += '</p>';
    h += '<p>' + esc(a.commune) + (a.date ? ' · ' + esc(a.date) : '') + (a.statut ? ' · ' + esc(a.statut) : '') + '</p>';
    if (a.description) h += '<p>' + esc(a.description) + '</p>';
    if (a.partenaires) h += '<p><b>Partenaires :</b> ' + esc(a.partenaires) + '</p>';
    if (/^https?:\/\//i.test(a.lien)) h += '<p><a href="' + esc(a.lien) + '" target="_blank" rel="noopener">En savoir plus</a></p>';
    return h;
  }

  // ---------- filtrage ----------
  function matches(a) {
    var q = norm($('f-q').value), t = $('f-type').value, z = $('f-zone').value, d = $('f-dep').value;
    if (t && a.type !== t) return false;
    if (d && a.dep !== d) return false;
    if (q && norm([a.titre, a.commune, a.partenaires, a.description, a.type].join(' ')).indexOf(q) === -1) return false;
    var inFRR = a.zones.indexOf('FRR') !== -1 || a.zones.indexOf('FRR+') !== -1;
    var inQPV = a.zones.indexOf('QPV') !== -1;
    if (z === 'zonees' && !(inFRR || inQPV)) return false;
    if (z === 'FRR' && a.zones.indexOf('FRR') === -1) return false;
    if (z === 'FRR+' && a.zones.indexOf('FRR+') === -1) return false;
    if (z === 'QPV' && !inQPV) return false;
    if (z === 'hors' && (inFRR || inQPV)) return false;
    return true;
  }

  var visible = [];
  function refresh() {
    cluster.clearLayers();
    visible = state.markers.filter(function (m) { return matches(m._action); });
    if ($('c-actions').checked) cluster.addLayers(visible);

    var nFRR = 0, nQPV = 0;
    visible.forEach(function (m) {
      var z = m._action.zones;
      if (z.indexOf('FRR') !== -1 || z.indexOf('FRR+') !== -1) nFRR++;
      if (z.indexOf('QPV') !== -1) nQPV++;
    });
    $('n-total').textContent = visible.length;
    $('n-frr').textContent = nFRR;
    $('n-qpv').textContent = nQPV;

    var ul = $('liste'); ul.innerHTML = '';
    visible.slice(0, 200).forEach(function (m) {
      var a = m._action;
      var li = document.createElement('li');
      li.tabIndex = 0;
      li.innerHTML = '<b>' + esc(a.titre) + '</b><small>' + esc(a.commune) + ' · ' + esc(a.type) +
        (a.zones.length ? ' · ' + esc(a.zones.join(', ')) : '') + '</small>';
      function go() {
        cluster.zoomToShowLayer(m, function () { m.openPopup(); });
      }
      li.addEventListener('click', go);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      ul.appendChild(li);
    });
  }

  function toggle(id, layer) {
    $(id).addEventListener('change', function () {
      if (this.checked) map.addLayer(layer); else map.removeLayer(layer);
    });
  }
  toggle('c-frr', layerFRR);
  toggle('c-frrplus', layerFRRplus);
  toggle('c-qpv', layerQPV);
  $('c-actions').addEventListener('change', refresh);
  ['f-q', 'f-type', 'f-zone', 'f-dep'].forEach(function (id) {
    $(id).addEventListener(id === 'f-q' ? 'input' : 'change', refresh);
  });

  $('export').addEventListener('click', function () {
    var rows = visible.map(function (m) {
      var a = m._action;
      return {
        id: a.id, titre: a.titre, type: a.type, commune: a.commune, code_insee: a.code_insee,
        lat: a.lat, lon: a.lon, date: a.date, statut: a.statut, partenaires: a.partenaires,
        zones: a.zones.join('|')
      };
    });
    var csv = Papa.unparse(rows);
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url; link.download = 'actions_dahlir_selection.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  // ---------- démarrage : zones d'abord, pour que le zonage des actions soit calculé ----------
  loadZones().then(loadActions).then(refresh);
})();
