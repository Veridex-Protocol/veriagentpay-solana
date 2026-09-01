import { SiteHeader } from '../marketing/header/SiteHeader';
import { OfficialLogoMark } from '../ui/OfficialBrand';
import '../marketing/styles/system.css';

export function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-navy text-slate-100 flex flex-col selection:bg-[#F2D827] selection:text-black">
      {/* Top Header Navigation */}
      <SiteHeader />

      {/* Main Marketing Page Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-slate-950 py-12 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <OfficialLogoMark size={32} withSquircle />
            <span className="text-sm font-bold text-white">VeriAgent Pay © 2026</span>
          </div>
          <p className="text-xs text-slate-500 max-w-md text-center md:text-left">
            Built on Solana with WebAuthn passkeys and sponsored USDC settlement. No seed phrase required.
          </p>
          <div className="flex gap-6 text-xs text-slate-400">
            <a href="#" className="hover:text-white">Docs</a>
            <a href="#" className="hover:text-white">Twitter</a>
            <a href="#" className="hover:text-white">Telegram</a>
            <a href="#" className="hover:text-white">Security Report</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
