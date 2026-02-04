import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aldersgate College - Queue System',
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
        <header className="bg-[#1b4d3e] text-white shadow-lg border-b-4 border-[#fcc200] shrink-0 z-50">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center border-2 border-[#fcc200] text-xl shadow-md">
                🛡️
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-lg md:text-xl font-bold uppercase tracking-wide text-[#fcc200]">
                  Aldersgate College
                </h1>
                <p className="text-[10px] text-green-100 tracking-wider uppercase leading-none">
                  Medical Services
                </p>
              </div>
            </div>
            <div className="mt-2 md:mt-0 hidden md:block text-xs text-green-200 italic">
              "Seek Ye The Truth • Serve The People"
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-4 overflow-hidden flex flex-col">
          {children}
        </main>

        {/* FOOTER - Added pb-8 to lift the text up */}
        <footer className="bg-[#153a2f] text-green-400 py-3 pb-8 text-center text-xs border-t border-green-900 shrink-0">
          <p>© {new Date().getFullYear()} Aldersgate College, Inc. | Solano, Nueva Vizcaya</p>
        </footer>
      </body>
    </html>
  );
}