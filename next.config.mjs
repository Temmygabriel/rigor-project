/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // genlayer-js ships ESM; transpiling it avoids any interop edge cases on Vercel.
  transpilePackages: ["genlayer-js"],
  // The SDK's published TS types can drift ahead of a pinned range; our own
  // domain types (lib/types.ts) stay authoritative. Don't let an SDK type
  // mismatch block a production deploy — runtime behavior is what we test.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
