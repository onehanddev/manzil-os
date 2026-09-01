/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const frontend = "https://manzilos-app.vercel.app";
    return [
      // PWA itself
      { source: "/app", destination: `${frontend}/` },
      { source: "/app/:path*", destination: `${frontend}/:path*` },
      // PWA static assets (Vite base "/") — proxied so index.html's /assets/* works on same domain
      { source: "/assets/:path*", destination: `${frontend}/assets/:path*` },
      { source: "/icons/:path*", destination: `${frontend}/icons/:path*` },
      { source: "/manifest.webmanifest", destination: `${frontend}/manifest.webmanifest` },
      { source: "/registerSW.js", destination: `${frontend}/registerSW.js` },
      { source: "/service-worker.js", destination: `${frontend}/service-worker.js` },
      { source: "/service-worker.mjs", destination: `${frontend}/service-worker.mjs` },
      { source: "/mockServiceWorker.js", destination: `${frontend}/mockServiceWorker.js` },
    ];
  },
};
export default nextConfig;
