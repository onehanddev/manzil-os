/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/app",
        destination: "https://manzilos.vercel.app/app",
        permanent: false,
      },
    ];
  },
};
export default nextConfig;
