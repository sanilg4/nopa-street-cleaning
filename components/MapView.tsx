'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Locate, Home, AlertCircle, Car } from 'lucide-react';
import { StreetSegment, calculateNextSweeping } from '@/lib/sweeping';

interface MapViewProps {
  segments: StreetSegment[];
  selectedSegment: StreetSegment | null;
  currentSession: any;
  onSelectSegment: (segment: StreetSegment) => void;
}

// Official SF Parcel coordinate for 1958 Golden Gate Ave (Parcel 1151-017)
// Located on the North side of Golden Gate Ave, between Baker St and Lyon St
const HOME_COORDS: [number, number] = [37.778376, -122.443151];

/**
 * Offsets polyline coordinates perpendicular to the street direction so both
 * the Left and Right curbs render as separate parallel lines on opposite sides
 * of the street instead of overlapping on the same centerline.
 */
function getOffsetCoordinates(
  coordinates: [number, number][],
  sideLR: string,
  offsetMeters: number = 5.5
): [number, number][] {
  if (!coordinates || coordinates.length < 2) {
    return coordinates.map(([lng, lat]) => [lat, lng]);
  }

  const degPerMeterLat = 1.0 / 111111.0;
  const sign = sideLR === 'L' ? 1.0 : -1.0;
  const result: [number, number][] = [];

  for (let i = 0; i < coordinates.length; i++) {
    const pPrev = coordinates[Math.max(0, i - 1)];
    const pNext = coordinates[Math.min(coordinates.length - 1, i + 1)];

    const latRad = ((pPrev[1] + pNext[1]) / 2.0) * (Math.PI / 180.0);
    const degPerMeterLng = 1.0 / (111111.0 * Math.cos(latRad));

    const dx = (pNext[0] - pPrev[0]) * Math.cos(latRad);
    const dy = pNext[1] - pPrev[1];
    const len = Math.hypot(dx, dy);

    if (len === 0) {
      result.push([coordinates[i][1], coordinates[i][0]]);
      continue;
    }

    // Normal vector pointing Left of street heading
    const nx = -dy / len;
    const ny = dx / len;

    const dLat = sign * ny * offsetMeters * degPerMeterLat;
    const dLng = sign * nx * offsetMeters * degPerMeterLng;

    result.push([coordinates[i][1] + dLat, coordinates[i][0] + dLng]);
  }

  return result;
}

export default function MapView({
  segments,
  selectedSegment,
  currentSession,
  onSelectSegment,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const selectedLineRef = useRef<any>(null);
  const parkedMarkerRef = useRef<any>(null);
  const parkedLineRef = useRef<any>(null);
  const leafletModuleRef = useRef<any>(null);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      leafletModuleRef.current = L;

      // Center on 1958 Golden Gate Ave parcel
      const map = L.map(mapContainerRef.current, {
        center: HOME_COORDS,
        zoom: 17,
        zoomControl: false,
      });

      mapInstanceRef.current = map;

      // Clean OpenStreetMap basemap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
      }).addTo(map);

      // Home marker icon (1958 Golden Gate Ave)
      const homeIcon = L.divIcon({
        className: 'home-marker-wrapper',
        html: '<div class="home-pin">🏠</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker(HOME_COORDS, { icon: homeIcon, zIndexOffset: 800 })
        .addTo(map)
        .bindPopup(
          '<div class="text-xs font-bold text-slate-900">🏠 1958 Golden Gate Ave</div><div class="text-[10px] text-slate-600">Home</div>'
        );

      // Render Street Sweeping Curb Polylines with perpendicular offsets
      const now = new Date();

      segments.forEach((seg) => {
        if (!seg.coordinates || seg.coordinates.length < 2) return;

        const latLngs = getOffsetCoordinates(seg.coordinates, seg.sideLR || 'L', 5.5);

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
          weight: 4.5,
          opacity: 0.92,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Invisible wider touch buffer (20px) for effortless tapping on mobile
        const touchBuffer = L.polyline(latLngs, {
          color: '#ffffff',
          weight: 20,
          opacity: 0.001,
          lineCap: 'round',
        }).addTo(map);

        touchBuffer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectSegment(seg);
        });
      });

      // Update or create live GPS marker on map
      const updateLocationMarker = (lat: number, lng: number, accuracy?: number) => {
        const coords: [number, number] = [lat, lng];
        setUserLocation(coords);
        setGpsError(null);

        const gpsIcon = L.divIcon({
          className: 'gps-marker-wrapper',
          html: '<div class="live-gps-dot"><div class="live-gps-pulse"></div></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        if (!userMarkerRef.current) {
          userMarkerRef.current = L.marker(coords, {
            icon: gpsIcon,
            zIndexOffset: 1500,
          }).addTo(map);
        } else {
          userMarkerRef.current.setLatLng(coords);
        }

        // Accuracy aura
        if (accuracy && accuracy > 10 && accuracy < 200) {
          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(coords, {
              radius: accuracy,
              color: '#3b82f6',
              weight: 1,
              fillColor: '#3b82f6',
              fillOpacity: 0.12,
            }).addTo(map);
          } else {
            accuracyCircleRef.current.setLatLng(coords);
            accuracyCircleRef.current.setRadius(accuracy);
          }
        }
      };

      // Built-in Leaflet GPS tracking
      map.on('locationfound', (e: any) => {
        updateLocationMarker(e.latlng.lat, e.latlng.lng, e.accuracy);
      });

      map.on('locationerror', (e: any) => {
        console.warn('Leaflet location error:', e.message);
        setGpsError(e.message);
      });

      // Start watching user location with Leaflet
      map.locate({
        watch: true,
        enableHighAccuracy: true,
        setView: false,
        maxZoom: 18,
      });

      // Also trigger browser geolocation immediately
      if (typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            updateLocationMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          },
          (err) => {
            console.warn('Browser GPS error:', err.message);
            if (err.code === 1) {
              setGpsError('Location permission denied in Safari.');
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          }
        );
      }
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.stopLocate();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [segments, onSelectSegment]);

  // Render Parked Car Marker and highlight the parked curb
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletModuleRef.current) return;
    const L = leafletModuleRef.current;

    // Clean up previous parked layers
    if (parkedLineRef.current) {
      mapInstanceRef.current.removeLayer(parkedLineRef.current);
      parkedLineRef.current = null;
    }
    if (parkedMarkerRef.current) {
      mapInstanceRef.current.removeLayer(parkedMarkerRef.current);
      parkedMarkerRef.current = null;
    }

    if (currentSession && currentSession.isParked && currentSession.session) {
      const segId = currentSession.session.segmentId;
      const parkedSeg = segments.find((s) => s.id === segId);

      if (parkedSeg && parkedSeg.coordinates && parkedSeg.coordinates.length >= 2) {
        const latLngs = getOffsetCoordinates(
          parkedSeg.coordinates,
          parkedSeg.sideLR || 'L',
          5.5
        );

        // Glowing Cyan curb line for parked spot
        parkedLineRef.current = L.polyline(latLngs, {
          color: '#06b6d4',
          weight: 9,
          opacity: 0.95,
          lineCap: 'round',
        }).addTo(mapInstanceRef.current);

        // Calculate midpoint for the car pin
        const midIdx = Math.floor(latLngs.length / 2);
        const midCoord = latLngs[midIdx];

        const carIcon = L.divIcon({
          className: 'parked-car-wrapper',
          html: `
            <div class="parked-car-pin">
              <span class="text-xl leading-none">🚗</span>
              <div class="parked-car-pulse"></div>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });

        parkedMarkerRef.current = L.marker(midCoord, {
          icon: carIcon,
          zIndexOffset: 1200,
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(
            `<div class="text-xs font-bold text-slate-900">🚗 Your Car is Parked Here</div>` +
              `<div class="text-[11px] text-slate-700 font-semibold">${currentSession.session.corridor} (${currentSession.session.side} side)</div>` +
              `<div class="text-[10px] text-cyan-800 mt-0.5">Sweeping: ${currentSession.details?.formattedNextSweeping || ''}</div>`
          );
      }
    }
  }, [currentSession, segments]);

  // Highlight selected segment
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletModuleRef.current) return;
    const L = leafletModuleRef.current;

    if (selectedLineRef.current) {
      mapInstanceRef.current.removeLayer(selectedLineRef.current);
      selectedLineRef.current = null;
    }

    if (selectedSegment && selectedSegment.coordinates) {
      const latLngs = getOffsetCoordinates(
        selectedSegment.coordinates,
        selectedSegment.sideLR || 'L',
        5.5
      );

      selectedLineRef.current = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 8,
        opacity: 0.95,
        lineCap: 'round',
      }).addTo(mapInstanceRef.current);

      mapInstanceRef.current.panTo(latLngs[0], { animate: true });
    }
  }, [selectedSegment]);

  // Center on user GPS
  const handleCenterOnUser = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(userLocation, 18, { animate: true, duration: 0.8 });
    } else if (mapInstanceRef.current) {
      mapInstanceRef.current.locate({ setView: true, maxZoom: 18, enableHighAccuracy: true });

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setUserLocation(coords);
            mapInstanceRef.current?.flyTo(coords, 18, { animate: true, duration: 0.8 });
          },
          (err) => {
            if (err.code === 1) {
              alert(
                'Location access is blocked in Safari. To enable:\n1. Tap the "aA" icon in Safari URL bar\n2. Tap "Website Settings"\n3. Change Location to "Allow"'
              );
            }
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }
  };

  // Center on Home (1958 Golden Gate Ave)
  const handleCenterOnHome = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(HOME_COORDS, 17, { animate: true, duration: 0.8 });
    }
  };

  // Center on Parked Car
  const handleCenterOnCar = () => {
    if (!mapInstanceRef.current || !currentSession?.isParked) return;
    const segId = currentSession.session?.segmentId;
    const parkedSeg = segments.find((s) => s.id === segId);
    if (parkedSeg && parkedSeg.coordinates && parkedSeg.coordinates.length >= 2) {
      const latLngs = getOffsetCoordinates(parkedSeg.coordinates, parkedSeg.sideLR || 'L', 5.5);
      const midIdx = Math.floor(latLngs.length / 2);
      mapInstanceRef.current.flyTo(latLngs[midIdx], 18, { animate: true, duration: 0.8 });
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Action Buttons */}
      <div className="absolute right-4 bottom-28 z-30 flex flex-col gap-3 pointer-events-auto">
        {/* Car Button (appears when parked) */}
        {currentSession?.isParked && (
          <button
            type="button"
            onClick={handleCenterOnCar}
            className="w-13 h-13 p-3.5 rounded-2xl bg-cyan-600/95 text-white border border-cyan-400 shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center shadow-cyan-500/30 animate-in fade-in"
            title="Center on Parked Car"
          >
            <Car className="w-6 h-6" />
          </button>
        )}

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
          className={`w-13 h-13 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center ${
            userLocation
              ? 'bg-blue-600/90 text-white border-blue-400 shadow-blue-500/20'
              : 'bg-slate-900/90 text-blue-400 border-slate-700/80'
          }`}
          title="Center on my live location"
        >
          <Locate className="w-6 h-6" />
        </button>
      </div>

      {/* GPS Error Prompt */}
      {gpsError && !userLocation && (
        <div className="absolute top-24 inset-x-4 z-30 pointer-events-auto">
          <div className="bg-amber-950/90 border border-amber-500/50 rounded-2xl p-3 text-xs text-amber-200 flex items-center gap-2.5 shadow-xl backdrop-blur-md">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="flex-1 leading-tight">
              Location access is off. Tap <strong>aA</strong> in Safari &gt; <strong>Website Settings</strong> &gt; set <strong>Location</strong> to <strong>Allow</strong>.
            </span>
          </div>
        </div>
      )}

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
