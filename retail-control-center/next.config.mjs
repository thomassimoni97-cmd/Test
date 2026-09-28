/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@googleapis/sheets', 'google-auth-library'],
};
export default nextConfig;
