/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker standalone 출력 (프로덕션 배포용)
  output: 'standalone',

  // React Strict Mode 활성화 — 기본값 false이므로 명시 필요
  reactStrictMode: true,

  // avif 포맷 추가 — 기본값은 ['image/webp']만 포함
  images: {
    formats: ['image/webp', 'image/avif'],
  },
};

module.exports = nextConfig;