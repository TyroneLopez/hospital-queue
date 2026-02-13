import Clock from '@/components/clock';
import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Image from "next/image";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SmartQueue',
  description: 'Medical & Health Services Queue',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* h-screen locks height, overflow-hidden stops main window scrolling */}
      <body className={`${inter.className} h-screen flex flex-col bg-gray-50 overflow-hidden`}>
        
{/* HEADER */}
      <header className="bg-[#1e3a8a] text-white shadow-lg border-b-4 border-[#fcc200] shrink-0 z-50">
        <div className="px-4 md:px-8 py-3 flex flex-col md:flex-row items-center justify-between">
          
          {/* Logo and Title Section */}
          <div className="flex items-center space-x-4">
            
            {/* LOGO CIRCLE */}
            <div className="h-12 w-12 bg-white rounded-full flex items-center justify-center border-2 border-[#fcc200] shadow-md overflow-hidden relative">
              <Image 
                src="/Nueva_Vizcaya_State_University.png"  // <--- Check your public folder for the exact filename
                alt="NVSU Logo"
                width={48}      
                height={48}
                className="object-cover"
              />
            </div>

            {/* TEXT */}
            <div className="text-center md:text-left">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-none text-white">
                SmartQueue
              </h1>
              <p className="text-[10px] text-green-100 tracking-wider uppercase leading-none mt-1">
                Nueva Vizcaya State University
              </p>
            </div>
          </div>

          {/* CLOCK SECTION */}
          <div className="mt-2 md:mt-0 hidden md:block text-xs text-green-200 italic">
             {/* Make sure <Clock /> is imported correctly at the top */}
            <Clock/>
          </div>

        </div>
      </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-4 overflow-hidden flex flex-col">
          {children}
        </main>

        {/* FOOTER - Added pb-8 to lift the text up */}
        <footer className="bg-[#1e3a8a] text-[#facc15] py-3 text-center text-xs border-t border-green-900 shrink-0">
          <p>© {new Date().getFullYear()} SmartQueue</p>
        </footer>
      </body>
    </html>
  );
}