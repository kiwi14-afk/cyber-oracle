/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 账单解析与 AI 调用都依赖 Node 运行时；不启用静态导出，保证 /api 路由可用
  poweredByHeader: false,
};

export default nextConfig;
