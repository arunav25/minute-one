/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  /** Workspace packages ship TypeScript source; Next compiles them. */
  transpilePackages: [
    "@minute-one/core",
    "@minute-one/web",
    "@minute-one/app-justcall",
    "@minute-one/voice-pyai",
    "@minute-one/voice-mock",
  ],
};

export default nextConfig;
