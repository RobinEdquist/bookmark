import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  rewrites() {
    return [
      {
        // Exclude /api/events - handled by route handler for SSE streaming
        source: "/api/:path((?!events).*)",
        destination: `${process.env.API_URL}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
