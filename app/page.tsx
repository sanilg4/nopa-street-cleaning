'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import PinGate from '@/components/PinGate';
import ActiveParkingCard from '@/components/ActiveParkingCard';
import SegmentDrawer from '@/components/SegmentDrawer';
import { StreetSegment, calculateNextSweeping } from '@/lib/sweeping';

// Dynamic import for Leaflet map with no SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
      <span className="text-sm font-medium">Loading NOPA Map...</span>
    </div>
  ),
});

const STORAGE_KEY = 'nopa_active_parking_session_v1';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [segments, setSegments] = useState<StreetSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<StreetSegment | null>(null);
  const [parkingStatus, setParkingStatus] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Tracks the timestamp of user actions initiated locally on this specific device
  const lastLocalActionRef = useRef<number>(0);

  // Restore active parking session from localStorage immediately on load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.isParked && parsed.session) {
            setParkingStatus(parsed);
          }
        }
      } catch (err) {
        console.error('Error reading localStorage session:', err);
      }
    }
  }, []);

  // Fetch active parking status from server (Supabase)
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/status?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      if (res.ok) {
        const data = await res.json();

        // If this device just performed a local tap within the last 3.5 seconds,
        // let the optimistic update stay active while the server request finishes.
        if (Date.now() - lastLocalActionRef.current < 3500) {
          return;
        }

        if (data && data.isParked && data.session) {
          setParkingStatus(data);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          }
        } else if (data && data.isParked === false) {
          setParkingStatus({ isParked: false, session: null });
          if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching parking status:', err);
    }
  }, []);

  // Fetch segments
  const fetchSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments');
      if (res.ok) {
        const data = await res.json();
        setSegments(data);
      }
    } catch (err) {
      console.error('Error fetching segments:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSegments();
      fetchStatus();

      // Poll every 5 seconds for fast live synchronization across devices
      const interval = setInterval(fetchStatus, 5000);

      // Re-sync immediately when phone unlocks, screen turns on, or user returns to tab
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchStatus();
        }
      };
      const handleFocus = () => {
        fetchStatus();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);
      window.addEventListener('pageshow', handleFocus);

      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('pageshow', handleFocus);
      };
    }
  }, [isAuthenticated, fetchSegments, fetchStatus]);

  const handleConfirmPark = async (segment: StreetSegment) => {
    lastLocalActionRef.current = Date.now();
    const now = new Date();
    const sweeping = calculateNextSweeping(segment, now);

    // 1. Optimistic Instant UI Update (0ms delay)
    // The car pin, glowing line, and clear button appear immediately!
    const newStatus = {
      isParked: true,
      session: {
        id: `local_${Date.now()}`,
        segmentId: String(segment.id),
        corridor: segment.corridor,
        limits: segment.limits,
        side: segment.side,
        sideLR: segment.sideLR || 'L',
        coordinates: segment.coordinates,
        weekday: segment.weekday,
        fromHour: segment.fromHour,
        toHour: segment.toHour,
        sweepingStart: sweeping ? sweeping.startTime.toISOString() : '',
        sweepingEnd: sweeping ? sweeping.endTime.toISOString() : '',
        alertTime: sweeping ? sweeping.alertTime.toISOString() : '',
        parkedAt: now.toISOString(),
      },
      details: sweeping
        ? {
            formattedNextSweeping: sweeping.formattedNextSweeping,
            formattedAlertTime: sweeping.formattedAlertTime,
            hoursUntilSweeping: sweeping.hoursUntilSweeping,
            isSweepingNow: sweeping.isSweepingNow,
          }
        : null,
    };

    setParkingStatus(newStatus);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newStatus));
    }

    // 2. Send to backend (saves to Supabase / sends Telegram alert)
    try {
      const res = await fetch('/api/park', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, segmentId: String(segment.id) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.session) {
          const verifiedStatus = {
            isParked: true,
            session: {
              ...data.session,
              coordinates: segment.coordinates,
              sideLR: segment.sideLR || 'L',
            },
            details: data.details || newStatus.details,
          };
          setParkingStatus(verifiedStatus);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(verifiedStatus));
          }
        }
      } else {
        const errData = await res.json();
        console.error('Server park error:', errData);
      }
    } catch (err) {
      console.error('Error setting parking spot:', err);
    }
  };

  const handleClearParking = async () => {
    lastLocalActionRef.current = Date.now();

    // 1. Instant UI Clear (0ms delay)
    setParkingStatus({ isParked: false, session: null });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSelectedSegment(null);

    // 2. Dispatch to server (clears Supabase & triggers Telegram "Car Moved" alert)
    try {
      await fetch('/api/clear', { method: 'POST' });
      fetchStatus();
    } catch (err) {
      console.error('Error clearing parking:', err);
    }
  };

  if (!isAuthenticated) {
    return <PinGate onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Top Active Parking Card with Clear Parking / I Moved Button */}
      <ActiveParkingCard status={parkingStatus} onClear={handleClearParking} />

      {/* Map View with 🚗 Parked Car Pin and glowing cyan curb */}
      <MapView
        segments={segments}
        selectedSegment={selectedSegment}
        currentSession={parkingStatus}
        onSelectSegment={(seg) => setSelectedSegment(seg)}
      />

      {/* Bottom Segment Detail Drawer */}
      <SegmentDrawer
        segment={selectedSegment}
        currentSession={parkingStatus}
        onClose={() => setSelectedSegment(null)}
        onConfirmPark={handleConfirmPark}
        onClearParking={handleClearParking}
      />
    </main>
  );
}
