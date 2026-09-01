import { SiteHeader } from '../marketing/header/SiteHeader';
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
            <div className="w-8 h-8 rounded-lg bg-[#0C0C12] border border-[#F2D827]/30 p-1.5 flex items-center justify-center">
              <svg viewBox="0 0 446 423" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M183.48 126.69L122.643 232.061C115.027 245.252 115.027 261.503 122.643 274.692C130.258 287.882 144.332 296.008 159.562 296.008H262.061L201.224 401.38C193.608 414.57 179.535 422.695 164.304 422.695C149.074 422.695 135 414.57 127.385 401.38L5.71142 190.636C-1.9038 177.445 -1.9038 161.195 5.71142 148.005C13.3266 134.815 27.4004 126.69 42.6309 126.69H183.48ZM183.48 126.69L244.316 21.3173C251.931 8.12702 266.005 0.00192412 281.235 0.00192412C296.466 0.00192412 310.54 8.12702 318.155 21.3173L439.828 232.061C447.443 245.252 447.443 261.503 439.828 274.692C432.213 287.882 418.139 296.008 402.909 296.008H262.061L322.897 190.636C330.512 177.445 330.512 161.195 322.897 148.005C315.282 134.815 301.208 126.69 285.978 126.69H183.48Z"
                  fill="#F2D827"
                />
              </svg>
            </div>
            <span className="text-sm font-bold text-white">VeriAgent Pay © 2026</span>
          </div>
          <p className="text-xs text-slate-500 max-w-md text-center md:text-left">
            Built on BOTChain L1 with ERC-4337 Passkeys & Veridex zkTLS APY proofs. No seed phrase required.
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
