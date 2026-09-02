'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

  // Fetch active parking status from server (Supabase / serverless)
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data && data.isParked && data.session) {
          // Guard against stale server responses overwriting a newer locally confirmed spot
          const savedStr = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
          if (savedStr) {
            try {
              const localSaved = JSON.parse(savedStr);
              if (
                localSaved?.isParked &&
                localSaved.session?.parkedAt &&
                data.session?.parkedAt &&
                new Date(data.session.parkedAt).getTime() < new Date(localSaved.session.parkedAt).getTime()
              ) {
                // Server returned an older session than what this client just parked; ignore it
                return;
              }
            } catch (e) {}
          }

          setParkingStatus(data);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          }
        } else if (data && data.isParked === false && data.session === null) {
          const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (data.clearedAt && parsed.session?.parkedAt && new Date(data.clearedAt) > new Date(parsed.session.parkedAt)) {
                setParkingStatus({ isParked: false, session: null });
                localStorage.removeItem(STORAGE_KEY);
              }
            } catch (e) {}
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

      // Poll status every 15 seconds while page is open to stay synced
      const interval = setInterval(fetchStatus, 15000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchSegments, fetchStatus]);

  const handleConfirmPark = async (segment: StreetSegment) => {
    const now = new Date();
    const sweeping = calculateNextSweeping(segment, now);

    // 1. Optimistic Instant UI Update (0ms delay)
    // The car pin, glowing line, and clear button appear immediately!
    const newStatus = {
      isParked: true,
      session: {
        id: Date.now().toString(),
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
    // 1. Instant UI Clear (0ms delay)
    setParkingStatus({ isParked: false, session: null });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSelectedSegment(null);

    // 2. Dispatch to server (clears Supabase & triggers Telegram "Car Moved" alert)
    try {
      await fetch('/api/clear', { method: 'POST' });
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
