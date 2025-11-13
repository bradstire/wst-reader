import path from 'path';

const nullLoaderPath = path.resolve(process.cwd(), 'scripts', 'null-loader.cjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.module.rules.push({
        test: /\.[jt]sx?$/,
        include: [path.resolve(process.cwd(), 'archive')],
        use: {
          loader: nullLoaderPath,
        },
      });
    }
    return config;
  },
};

export default nextConfig;
