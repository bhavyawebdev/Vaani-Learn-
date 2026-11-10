import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const iconDimensions = {
    sm: 'w-5 h-5',
    md: 'w-7 h-7',
    lg: 'w-9 h-9'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl'
  };

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Official Emblem: Open Book + Central Microphone + Soundwave Bars */}
      <svg 
        viewBox="0 0 100 75" 
        fill="currentColor" 
        className={`${iconDimensions[size]} text-black flex-shrink-0`}
      >
        {/* Left soundwave bars */}
        <rect x="18" y="22" width="3" height="12" rx="1.5" />
        <rect x="25" y="15" width="3.5" height="26" rx="1.75" />
        <rect x="33" y="23" width="3" height="10" rx="1.5" fill="#6B7280" />

        {/* Central Microphone */}
        <rect x="44.5" y="10" width="11" height="20" rx="5.5" />
        <path d="M39 23C39 29.1 43.9 34 50 34C56.1 34 61 29.1 61 23" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M50 34V41" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path d="M43 41H57" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none" />

        {/* Right soundwave bars */}
        <rect x="64" y="23" width="3" height="10" rx="1.5" fill="#6B7280" />
        <rect x="71.5" y="15" width="3.5" height="26" rx="1.75" />
        <rect x="79" y="22" width="3" height="12" rx="1.5" />

        {/* Open Book Pages */}
        <path 
          d="M12 47C23 46 38 42 49 52C49.5 52.5 50.5 52.5 51 52C62 42 77 46 88 47C88 50 86 61 80 61C70 61 58 55 50 61C42 55 30 61 20 61C14 61 12 50 12 47Z" 
        />
        <path 
          d="M16 43C25 41 39 37 49 44C49.5 44.4 50.5 44.4 51 44C61 37 75 41 84 43C78 39 65 37 50 41C35 37 22 39 16 43Z" 
          fill="#D1D5DB"
        />
      </svg>
      
      <span className={`${textSizes[size]} font-bold tracking-tight text-black`}>
        VaaniLearn <span className="font-semibold text-slate-800">AI</span>
      </span>
    </div>
  );
};
