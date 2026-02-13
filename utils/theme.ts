// src/utils/theme.ts

export const BRAND = {
    // 🎨 COLORS
    colors: {
        primary: '#15803d',     // Main Backgrounds (NVSU Green)
        primaryText: '#ffffff', // Text on Primary (White)
        secondary: '#facc15',   // Accents/Borders (Gold)
        secondaryText: '#854d0e', // Text on Gold (Dark Gold/Brown)
        
        // Light shades for backgrounds
        bgLight: '#f0fdf4',     // Very light green
        bgHover: '#dcfce7',     // Light green for hover states
        
        // Status Colors
        danger: '#ef4444',      // Red (Closed/Stop)
        success: '#22c55e',     // Green (Go/Active)
    },

    // 🏫 TEXT & IDENTITY
    identity: {
        name: 'NVSU',
        systemName: 'SmartQueue',
        subtext: 'Nueva Vizcaya State University',
        campus: 'Bayombong Campus',
        logo: '🌲' // You can put an <img> url here if you want
    },

    // 🔠 FONT
    font: 'font-sans' // Tailwind classes: font-sans, font-serif, font-mono
};