'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Delete } from 'lucide-react';

interface PinGateProps {
  onSuccess: () => void;
}

export default function PinGate({ onSuccess }: PinGateProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already authenticated via cookie or localStorage
    const savedPin = localStorage.getItem('nopa_parking_auth');
    if (savedPin) {
      onSuccess();
    }
  }, [onSuccess]);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const verifyPin = async (inputPin: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('nopa_parking_auth', 'true');
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 800);
      }
    } catch (err) {
      setError(true);
      setTimeout(() => {
        setPin('');
        setError(false);
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-6 select-none">
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-500/10">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">NOPA Street Cleaning</h1>
        <p className="text-sm text-slate-400 mt-1">Enter your 4-digit passcode</p>
      </div>

      {/* 4 dots */}
      <div className={`flex gap-4 mb-10 transition-transform ${error ? 'animate-bounce text-red-500' : ''}`}>
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
              idx < pin.length
                ? error
                  ? 'bg-red-500 border-red-500 scale-110'
                  : 'bg-blue-500 border-blue-500 scale-110'
                : 'border-slate-600 bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Numeric Keypad */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            disabled={loading}
            onClick={() => handleDigit(d)}
            className="w-20 h-20 mx-auto rounded-full bg-slate-800/80 hover:bg-slate-700 active:bg-blue-600 text-2xl font-medium text-white transition-colors flex items-center justify-center border border-slate-700/50 active:scale-95"
          >
            {d}
          </button>
        ))}
        <div className="w-20 h-20 mx-auto" />
        <button
          type="button"
          disabled={loading}
          onClick={() => handleDigit('0')}
          className="w-20 h-20 mx-auto rounded-full bg-slate-800/80 hover:bg-slate-700 active:bg-blue-600 text-2xl font-medium text-white transition-colors flex items-center justify-center border border-slate-700/50 active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          disabled={loading || pin.length === 0}
          onClick={handleDelete}
          className="w-20 h-20 mx-auto rounded-full bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center justify-center active:scale-95"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
