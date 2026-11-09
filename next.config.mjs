/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // F4.1: readSnapshot อ่าน data/snapshots/*.json ด้วย path ที่ระบุตอน runtime
  // → Next.js file tracing มองไม่เห็น ต้องระบุชัดว่าต้องแพ็กโฟลเดอร์นี้ไปกับ serverless
  // เดี๋ยวไม่งั้นบน Vercel อ่าน snapshot ไม่ได้ แล้วกลับไปเรียก สนค. สด (ช้า 20-30 วิ)
  outputFileTracingIncludes: {
    "/prices": ["./data/snapshots/**/*"],
    "/api/prices/snapshot/[prov]/[year]": ["./data/snapshots/**/*"],
    "/api/prices/refresh": ["./data/snapshots/**/*"],
  },
};

export default nextConfig;
