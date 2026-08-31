'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Locate, Home } from 'lucide-react';
import { StreetSegment, calculateNextSweeping } from '@/lib/sweeping';

interface MapViewProps {
  segments: StreetSegment[];
  selectedSegment: StreetSegment | null;
  currentSession: any;
  onSelectSegment: (segment: StreetSegment) => void;
}

// User's home at 1958 Golden Gate Ave (at Lyon St)
const HOME_COORDS: [number, number] = [37.7785, -122.4435];

export default function MapView({
  segments,
  selectedSegment,
  currentSession,
  onSelectSegment,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const selectedLineRef = useRef<any>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Default center: 1958 Golden Gate Ave
      const map = L.map(mapContainerRef.current, {
        center: HOME_COORDS,
        zoom: 17,
        zoomControl: false,
      });

      mapInstanceRef.current = map;

      // Clean, dark CartoDB Voyager basemap
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; CARTO',
          maxZoom: 19,
          subdomains: 'abcd',
        }
      ).addTo(map);

      // Home marker icon (1958 Golden Gate Ave)
      const homeIcon = L.divIcon({
        className: 'custom-home-marker',
        html: '<div class="home-pin">🏠</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker(HOME_COORDS, { icon: homeIcon, zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(
          '<div class="text-xs font-semibold text-slate-900">🏠 Home: 1958 Golden Gate Ave</div>'
        );

      // Render Street Sweeping Curb Polylines with touch-friendly hit areas
      const now = new Date();

      segments.forEach((seg) => {
        if (!seg.coordinates || seg.coordinates.length < 2) return;

        // Leaflet expects [lat, lng], DataSF coordinates are [lng, lat]
        const latLngs = seg.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);

        const nextSweep = calculateNextSweeping(seg, now);
        let strokeColor = '#10b981'; // Green: > 48 hours away

        if (nextSweep) {
          if (nextSweep.isSweepingNow || nextSweep.hoursUntilSweeping <= 24) {
            strokeColor = '#ef4444'; // Red: < 24h or today
          } else if (nextSweep.hoursUntilSweeping <= 48) {
            strokeColor = '#f59e0b'; // Amber: 24h - 48h
          }
        }

        // Visible colored curb line
        L.polyline(latLngs, {
          color: strokeColor,
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Invisible wider touch buffer (18px) for effortless tapping on mobile
        const touchBuffer = L.polyline(latLngs, {
          color: '#ffffff',
          weight: 22,
          opacity: 0.001,
          lineCap: 'round',
        }).addTo(map);

        touchBuffer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectSegment(seg);
        });
      });
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [segments, onSelectSegment]);

  // Live GPS tracking on mobile
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);

        if (mapInstanceRef.current) {
          import('leaflet').then((L) => {
            if (!mapInstanceRef.current) return;

            if (!userMarkerRef.current) {
              const gpsIcon = L.divIcon({
                className: 'custom-gps-marker',
                html: '<div class="live-gps-dot"><div class="live-gps-pulse"></div></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              });

              userMarkerRef.current = L.marker(coords, {
                icon: gpsIcon,
                zIndexOffset: 1000,
              }).addTo(mapInstanceRef.current);
            } else {
              userMarkerRef.current.setLatLng(coords);
            }
          });
        }
      },
      (err) => console.warn('GPS watch error:', err.message),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Highlight selected segment
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      if (!mapInstanceRef.current) return;

      if (selectedLineRef.current) {
        mapInstanceRef.current.removeLayer(selectedLineRef.current);
        selectedLineRef.current = null;
      }

      if (selectedSegment && selectedSegment.coordinates) {
        const latLngs = selectedSegment.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        selectedLineRef.current = L.polyline(latLngs, {
          color: '#38bdf8',
          weight: 9,
          opacity: 0.95,
          lineCap: 'round',
        }).addTo(mapInstanceRef.current);

        mapInstanceRef.current.panTo(latLngs[0], { animate: true });
      }
    });
  }, [selectedSegment]);

  // Center on user GPS
  const handleCenterOnUser = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(userLocation, 17, { animate: true, duration: 0.8 });
    } else {
      navigator.geolocation?.getCurrentPosition((pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        mapInstanceRef.current?.flyTo(coords, 17, { animate: true, duration: 0.8 });
      });
    }
  };

  // Center on Home
  const handleCenterOnHome = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(HOME_COORDS, 17, { animate: true, duration: 0.8 });
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Action Buttons (Safe for mobile bottoms) */}
      <div className="absolute right-4 bottom-28 z-30 flex flex-col gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={handleCenterOnHome}
          className="w-13 h-13 p-3.5 rounded-2xl bg-slate-900/90 text-amber-400 active:text-white border border-slate-700/80 shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center"
          title="Center on 1958 Golden Gate Ave"
        >
          <Home className="w-6 h-6" />
        </button>

        <button
          type="button"
          onClick={handleCenterOnUser}
          className="w-13 h-13 p-3.5 rounded-2xl bg-slate-900/90 text-blue-400 active:text-white border border-slate-700/80 shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center"
          title="Center on my live location"
        >
          <Locate className="w-6 h-6" />
        </button>
      </div>

      {/* Legend for Urgency */}
      <div className="absolute left-4 bottom-28 z-20 pointer-events-none">
        <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-2xl px-3.5 py-2.5 text-[11px] space-y-1.5 shadow-xl">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span>&gt; 48h (Safe)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <span>Next 24h – 48h</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <span>&lt; 24h / Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
