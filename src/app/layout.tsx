import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "赛博卦账 · 把一个月账单算成一卦",
  description:
    "上传账单，本地解析，生成消费人格卦象、现金流燃尽曲线与可执行的省钱处方。数据留在你的设备上。",
  applicationName: "赛博卦账",
};

export const viewport: Viewport = {
  themeColor: "#07080B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
