/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'yt3.ggpht.com' }, { protocol: 'https', hostname: '*.ytimg.com' }],
  },
};

module.exports = nextConfig;
