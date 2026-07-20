/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@clip-lab/contracts"],
  // El linting es opt-in vía `pnpm lint` (ESLint no es dependencia del build).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
