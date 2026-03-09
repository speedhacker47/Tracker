/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker deployment — produces a self-contained .next/standalone
  // directory with a minimal Node.js server (server.js). This removes the need
  // to copy all node_modules into the Docker image.
  output: 'standalone',

  // Allow Traccar server images if needed in future
  images: {
    remotePatterns: [],
  },

  // Allow the Next.js API routes to be called cross-origin from Vercel frontend
  async headers() {
    return [
      {
        // Apply CORS headers to all API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            // In production: restrict to your Vercel frontend domain
            // e.g., 'https://trackpro.vercel.app'
            value: process.env.ALLOWED_ORIGIN || '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
