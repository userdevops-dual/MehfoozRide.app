// src/components/OSMMap.js
// Free map with no API key: Leaflet + OpenStreetMap tiles inside a WebView.
//
// Props:
//   center        { latitude, longitude }  — used when there is nothing to fit
//   zoom          number (default 14)
//   markers       [{ id, latitude, longitude, label?, color?, emoji?, accuracy? }]
//                 emoji → shown as the pin (e.g. '🚗'); otherwise a coloured dot.
//                 accuracy (metres) → light circle showing GPS uncertainty.
//   routes        [{ id, coordinates: [[lat, lng], ...], color?, weight?, opacity?, dashed? }]
//                 drawn in order — put the selected route last so it is on top
//   polyline / polylineColor — single line (older screens)
//   fitToContent  boolean — zoom to show all markers + routes
//   fitKey        any — when set, re-zoom only when this value changes
//                 (so GPS updates don't keep resetting the user's zoom)
//   onMapPress    ({ latitude, longitude }) => void — tap on the map
//   onRoutePress  (id) => void — tap on a route line
//   interactive   boolean (default true) — allow pan / zoom
//   style         container style (give it a height or flex)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

const buildHtml = (interactive) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="${LEAFLET}/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #FBF0F7; }
    .pin { font-size: 26px; line-height: 30px; text-align: center; }
    #offline { display: none; height: 100%; align-items: center; justify-content: center;
               font-family: sans-serif; color: #9A607A; font-size: 13px; text-align: center; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="offline">Map unavailable — check internet connection</div>
  <script src="${LEAFLET}/leaflet.js"></script>
  <script>
    (function () {
      var post = function (msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); };
      if (typeof L === 'undefined') {
        document.getElementById('map').style.display = 'none';
        document.getElementById('offline').style.display = 'flex';
        post({ type: 'offline' });
        return;
      }
      var interactive = ${interactive ? 'true' : 'false'};
      var map = L.map('map', {
        zoomControl: false,
        dragging: interactive, touchZoom: interactive, doubleClickZoom: interactive,
        scrollWheelZoom: interactive, boxZoom: interactive, keyboard: interactive,
      }).setView([31.5204, 74.3587], 13);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      map.on('click', function (e) { post({ type: 'press', latitude: e.latlng.lat, longitude: e.latlng.lng }); });

      var layer = L.layerGroup().addTo(map);
      var lastFitKey = null;
      var firstUpdate = true;

      window.updateMap = function (d) {
        layer.clearLayers();
        var points = [];

        (d.routes || []).forEach(function (r) {
          if (!r.coordinates || r.coordinates.length < 2) return;
          var line = L.polyline(r.coordinates, {
            color: r.color || '#C84B7A', weight: r.weight || 5, opacity: r.opacity == null ? 0.9 : r.opacity,
            dashArray: r.dashed ? '8 8' : null,
          }).addTo(layer);
          if (r.id != null) line.on('click', function (ev) { L.DomEvent.stopPropagation(ev); post({ type: 'route', id: r.id }); });
          points = points.concat(r.coordinates);
        });

        (d.markers || []).forEach(function (m) {
          var ll = [m.latitude, m.longitude];
          if (m.accuracy && m.accuracy > 15) {
            L.circle(ll, { radius: m.accuracy, color: m.color || '#C84B7A', weight: 1, fillOpacity: 0.12 }).addTo(layer);
          }
          var mk = m.emoji
            ? L.marker(ll, { icon: L.divIcon({ className: 'pin', html: m.emoji, iconSize: [30, 30], iconAnchor: [15, 15] }) })
            : L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 3, fillColor: m.color || '#C84B7A', fillOpacity: 1 });
          if (m.label) mk.bindTooltip(m.label);
          mk.addTo(layer);
          points.push(ll);
        });

        var shouldFit = d.fitKey == null ? true : (d.fitKey !== lastFitKey || firstUpdate);
        firstUpdate = false;
        if (!shouldFit) return;
        lastFitKey = d.fitKey;

        if (d.fitToContent && points.length > 1) {
          map.fitBounds(points, { padding: [36, 36], maxZoom: 16 });
        } else if (d.center) {
          map.setView([d.center.latitude, d.center.longitude], d.zoom || 14);
        } else if (points.length === 1) {
          map.setView(points[0], d.zoom || 15);
        }
      };

      post({ type: 'ready' });
    })();
  </script>
</body>
</html>`;

export default function OSMMap({
  center, zoom = 14, markers = [], routes, polyline = [], polylineColor,
  fitToContent = false, fitKey, onMapPress, onRoutePress, interactive = true, style,
}) {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Built once per `interactive` value — data updates are injected, not reloaded
  const source = useMemo(
    // baseUrl gives tile requests a Referer, as the OpenStreetMap tile policy asks
    () => ({ html: buildHtml(interactive), baseUrl: 'https://mehfoozride.local/' }),
    [interactive]
  );

  // Older screens pass a single `polyline` of { latitude, longitude }
  const allRoutes = routes || (polyline.length > 1
    ? [{ id: 'route', coordinates: polyline.map(p => [p.latitude, p.longitude]), color: polylineColor }]
    : []);

  const payload = JSON.stringify({
    center, zoom, markers, routes: allRoutes, fitToContent,
    fitKey: fitKey === undefined ? null : String(fitKey),
  });

  useEffect(() => {
    if (ready) webRef.current?.injectJavaScript(`window.updateMap && window.updateMap(${payload}); true;`);
  }, [ready, payload]);

  const onMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'press') onMapPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'route') onRoutePress?.(msg.id);
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        source={source}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        userAgent="MehfoozRide/1.0 (student project; react-native-webview)"
        onMessage={onMessage}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#FBF0F7' },
  web:       { flex: 1, backgroundColor: 'transparent' },
});
