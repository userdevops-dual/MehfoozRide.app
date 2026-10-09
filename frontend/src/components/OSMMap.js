// src/components/OSMMap.js
// Free map with no API key: Leaflet + OpenStreetMap tiles inside a WebView.
// Replaces react-native-maps (which needs a Google Maps key with billing).
//
// Props:
//   center        { latitude, longitude }  — used when there is nothing to fit
//   zoom          number (default 14)
//   markers       [{ id, latitude, longitude, label?, color?, emoji? }]
//                 emoji → shown as the pin (e.g. '🚗'); otherwise a coloured dot
//   polyline      [{ latitude, longitude }]
//   polylineColor string
//   fitToContent  boolean — zoom to show all markers + route
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
      var post = function (msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg); };
      if (typeof L === 'undefined') {
        document.getElementById('map').style.display = 'none';
        document.getElementById('offline').style.display = 'flex';
        post('offline');
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

      var layer = L.layerGroup().addTo(map);

      window.updateMap = function (d) {
        layer.clearLayers();
        var points = [];

        (d.markers || []).forEach(function (m) {
          var ll = [m.latitude, m.longitude];
          var mk = m.emoji
            ? L.marker(ll, { icon: L.divIcon({ className: 'pin', html: m.emoji, iconSize: [30, 30], iconAnchor: [15, 15] }) })
            : L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 3, fillColor: m.color || '#C84B7A', fillOpacity: 1 });
          if (m.label) mk.bindTooltip(m.label);
          mk.addTo(layer);
          points.push(ll);
        });

        if (d.polyline && d.polyline.length > 1) {
          var line = d.polyline.map(function (p) { return [p.latitude, p.longitude]; });
          L.polyline(line, { color: d.polylineColor || '#C84B7A', weight: 4 }).addTo(layer);
          points = points.concat(line);
        }

        if (d.fitToContent && points.length > 1) {
          map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
        } else if (d.center) {
          map.setView([d.center.latitude, d.center.longitude], d.zoom || 14);
        } else if (points.length === 1) {
          map.setView(points[0], d.zoom || 15);
        }
      };

      post('ready');
    })();
  </script>
</body>
</html>`;

export default function OSMMap({
  center, zoom = 14, markers = [], polyline = [], polylineColor,
  fitToContent = false, interactive = true, style,
}) {
  const webRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Built once per `interactive` value — data updates are injected, not reloaded
  const source = useMemo(
    // baseUrl gives tile requests a Referer, as the OpenStreetMap tile policy asks
    () => ({ html: buildHtml(interactive), baseUrl: 'https://mehfoozride.local/' }),
    [interactive]
  );

  const payload = JSON.stringify({ center, zoom, markers, polyline, polylineColor, fitToContent });

  useEffect(() => {
    if (ready) webRef.current?.injectJavaScript(`window.updateMap && window.updateMap(${payload}); true;`);
  }, [ready, payload]);

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
        userAgent="MehfoozRide/1.0 (student project; react-native-webview)"
        onMessage={(e) => { if (e.nativeEvent.data === 'ready') setReady(true); }}
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#FBF0F7' },
  web:       { flex: 1, backgroundColor: 'transparent' },
});
