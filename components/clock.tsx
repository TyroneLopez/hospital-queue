'use client';

import { useState, useEffect } from 'react';

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Update every second
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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