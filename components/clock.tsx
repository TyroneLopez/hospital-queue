'use client';

import { useState, useEffect } from 'react';

export default function Clock() {
  // 1. Add a "mounted" state
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // 2. Set mounted to true immediately on the client
    setMounted(true);
    // Initialize time immediately on client to avoid delay
    setTime(new Date());

    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. Return NULL during server rendering
  // This prevents the "Server text didn't match client" error
  if (!mounted || !time) {
    return null; 
    // Optional: Return an empty div of the same size to prevent layout shift
    // return <div className="mt-2 md:mt-0 hidden md:flex w-32 h-10" />;
  }

  return (
    <div className="mt-2 md:mt-0 hidden md:flex flex-col items-end font-medium text-green-200 tracking-wider">
      {/* Time Row with Seconds */}
      <div className="text-xl leading-none font-bold tabular-nums text-white">
        {time.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit', 
          hour12: true 
        })}
      </div>
      
      {/* Date Row */}
      <div className="text-[10px] uppercase opacity-80 mt-1">
        {time.toLocaleDateString([], { 
          month: 'short', 
          day: '2-digit', 
          year: 'numeric' 
        })}
      </div>
    </div>
  );
}