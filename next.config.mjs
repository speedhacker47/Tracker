/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  images: {
    remotePatterns: [],
  },

  // Proxy API requests to EC2 backend when NEXT_PUBLIC_API_URL is set (Vercel).
  // 'beforeFiles' rewrites run BEFORE checking the filesystem, so they
  // override the local API route files — the request is proxied server-side
  // from Vercel to EC2. No CORS, no mixed-content issues.
  //
  // On EC2 Docker (NEXT_PUBLIC_API_URL is empty), no rewrites are added
  // and the local API route files handle requests directly.
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL;
    if (backendUrl) {
      return {
        beforeFiles: [
          {
            source: '/api/:path*',
            destination: `${backendUrl}/api/:path*`,
          },
        ],
        afterFiles: [],
        fallback: [],
      };
    }
    return { beforeFiles: [], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;