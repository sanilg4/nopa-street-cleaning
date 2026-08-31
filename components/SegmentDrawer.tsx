'use client';

import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  Bell,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { StreetSegment, calculateNextSweeping } from '@/lib/sweeping';

interface SegmentDrawerProps {
  segment: StreetSegment | null;
  currentSession: any;
  onClose: () => void;
  onConfirmPark: (segment: StreetSegment) => Promise<void>;
  onClearParking?: () => Promise<void>;
}

export default function SegmentDrawer({
  segment,
  currentSession,
  onClose,
  onConfirmPark,
  onClearParking,
}: SegmentDrawerProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!segment) return null;

  const sweeping = calculateNextSweeping(segment);
  const isCurrentlyParkedHere =
    currentSession &&
    currentSession.isParked &&
    String(currentSession.session?.segmentId) === String(segment.id);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirmPark(segment);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!onClearParking) return;
    setSubmitting(true);
    try {
      await onClearParking();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 p-4 safe-bottom pointer-events-auto">
      <div className="rounded-3xl bg-slate-900/95 border border-slate-700/80 p-5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-200">
        {/* Mobile Pull Handle */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto -mt-1 mb-4 opacity-80" />

        {/* Header with Close */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                {segment.side} side
              </span>
              <span className="text-xs text-slate-400">
                {segment.sideLR === 'L' ? 'Left Curb' : 'Right Curb'}
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1 leading-tight">
              {segment.corridor}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{segment.limits}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sweeping Schedule Box */}
        <div className="rounded-2xl bg-slate-950/60 border border-slate-800/80 p-3.5 mb-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Routine Schedule:</span>
            </div>
            <span className="font-bold text-white">
              {segment.fullname} ({segment.fromHour % 12 || 12}
              {segment.fromHour >= 12 ? 'pm' : 'am'}–{segment.toHour % 12 || 12}
              {segment.toHour >= 12 ? 'pm' : 'am'})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Next Sweeping:</span>
            </div>
            <span
              className={`font-bold ${
                sweeping?.isSweepingNow
                  ? 'text-red-400 font-extrabold'
                  : (sweeping?.hoursUntilSweeping || 999) <= 24
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {sweeping?.formattedNextSweeping}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300">
              <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>12h Reminder:</span>
            </div>
            <span className="font-bold text-slate-200">
              {sweeping?.formattedAlertTime}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        {isCurrentlyParkedHere ? (
          <div className="flex flex-col gap-2">
            <div className="w-full py-2.5 px-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-xs flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Your Car is Currently Parked Here
            </div>
            {onClearParking && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleClear}
                className="w-full py-3 px-4 rounded-2xl bg-rose-600/90 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-sm shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <XCircle className="w-4 h-4" />
                {submitting ? 'Clearing...' : '🚗 I Moved the Car (Clear Spot)'}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <MapPin className="w-5 h-5" />
            {submitting
              ? 'Saving Spot...'
              : currentSession?.isParked
              ? '📍 Park Here Instead (Change Spot)'
              : '📍 Confirm Parked Here'}
          </button>
        )}
      </div>
    </div>
  );
}
