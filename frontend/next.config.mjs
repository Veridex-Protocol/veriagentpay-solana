import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  output: 'standalone',
  // Keep development artifacts away from production builds. A build or a
  // second dev command must never delete files underneath the active server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@veridex/sdk', '@veriagent/chain-solana', 'js-sha3'],

  // This app is a workspace member of the parent `veridex-protocol` monorepo
  // (whose workspaces include `veriagent-pay/*`) and also carries its own
  // lockfile, so Next warns about multiple lockfiles and infers a root.
  //
  // The root must be the PARENT, not veriagent-pay. Dependencies hoist above
  // this package: `zustand` resolves inside veriagent-pay, but its transitive
  // `use-sync-external-store` resolves to the parent's node_modules. Rooting
  // at veriagent-pay cuts the tree below a module the bundle needs, which
  // surfaces as "Cannot read properties of undefined (reading 'call')" from
  // use-sync-external-store/shim/with-selector.
  //
  // Set explicitly rather than left inferred so the choice is deliberate and
  // the warning stops.
  outputFileTracingRoot: path.join(__dirname, '..'),

  // Fix for dev tunnels and proxy issues
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  generateBuildId: async () => {
    // Use timestamp for dev to avoid caching issues
    return process.env.NODE_ENV === 'production'
      ? null
      : `dev-${Date.now()}`;
  },



  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async rewrites() {
    // Server-side only: the browser never sees this host. Leaving
    // NEXT_PUBLIC_API_URL empty makes the browser call /api on its own origin
    // and Next proxies here, so there is no cross-origin preflight to fail.
    // In Docker production this is the backend service name; otherwise localhost.
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'http://localhost:4000';

    return {
      beforeFiles: [
        {
          source: '/api/auth/:path*',
          destination: '/api/auth/:path*',
        },
      ],
      fallback: [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },

  async redirects() {
    return [
      // `/claim-envelope/:id` is deliberately NOT redirected here. It renders
      // the recipient claim flow directly, and so does `/claim/:id` — routing
      // one into the other only fought the permanent redirect this rule had
      // already planted in recipients' browsers.
      {
        source: '/claim/envelope',
        destination: '/claim',
        permanent: true,
      },
    ];
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const frameAncestors = [
      "'self'",
      'https://*.discord.com',
      'https://*.telegram.org',
      'https://web.telegram.org',
      ...(isProd ? [] : ['https://*.devtunnels.ms']),
    ].join(' ');
    // Every origin the browser may open a connection to.
    //
    // Built from both public URLs, not just the API one: the socket dials
    // `NEXT_PUBLIC_WS_URL` when set, and leaving it out blocked every realtime
    // update behind a CSP violation. Each origin also contributes its
    // websocket scheme — CSP compares schemes literally, so an `http://` source
    // does not reliably cover the `ws://` handshake socket.io actually makes.
    const connectSrc = (() => {
      const sources = new Set(['https://rpc.bohr.life', 'https://scan.bohr.life']);

      for (const configured of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_WS_URL]) {
        const value = (configured || '').trim();
        if (!value) continue; // Empty means same-origin, already covered by 'self'.
        try {
          const { origin, protocol, host } = new URL(value);
          sources.add(origin);
          // Keep the transport security of whatever was configured: a secure
          // origin must not be granted a plaintext ws:// exception.
          const secure = protocol === 'https:' || protocol === 'wss:';
          sources.add(`${secure ? 'wss' : 'ws'}://${host}`);
        } catch {
          // Not an absolute URL (a bare path, say) — nothing to allow.
        }
      }

      if (!isProd) {
        // The dev API runs on its own port, and is often reached through a
        // tunnel when testing on a phone. Both stay out of production.
        for (const source of [
          'http://localhost:*',
          'ws://localhost:*',
          'https://*.devtunnels.ms',
          'wss://*.devtunnels.ms',
        ]) {
          sources.add(source);
        }
      }

      return [...sources].join(' ');
    })();

    const csp = [
      "default-src 'self'",
      // https://telegram.org serves telegram-web-app.js, loaded in layout.tsx and
      // waited on by onboard/page.tsx and lib/veridex.ts. Without it the Telegram
      // Mini App has no bridge and onboarding stalls — `frame-ancestors` below
      // already expects to run inside Telegram.
      `script-src 'self' 'unsafe-inline' https://telegram.org${isProd ? '' : " 'unsafe-eval'"}`,
      // globals.css @imports Google Fonts: the stylesheet comes from
      // fonts.googleapis.com and the font files it references from
      // fonts.gstatic.com, so both hosts are required.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      `connect-src 'self' ${connectSrc}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
      'upgrade-insecure-requests',
    ].join('; ');
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            // Production chunks are content-hashed and safe to cache forever.
            // Development chunk names are stable, so marking them immutable can
            // make the browser execute modules from an older Next.js version.
            value: isProd
              ? 'public, max-age=31536000, immutable'
              : 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
