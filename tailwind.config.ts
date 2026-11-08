import type { Config } from "tailwindcss";

/**
 * 设计令牌集中在本文件与 src/styles/globals.css 的 :root 变量中。
 * 原则：全部使用系统字体，不依赖任何在线字体 CDN —— 保证评委断网也能 10 分钟复现出同样的界面。
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#07080B",
          800: "#0C0E13",
          700: "#12151C",
          600: "#191D26",
          500: "#232834",
        },
        cinnabar: {
          500: "#E2453C",
          600: "#C63128",
        },
        brass: {
          400: "#E4B457",
          500: "#C9922F",
        },
        jade: {
          400: "#38D9A9",
          500: "#1FA98A",
        },
        paper: {
          100: "#F3EEE3",
          300: "#CFC6B6",
          500: "#9C9486",
          600: "#6E685E",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "Hiragino Sans GB",
          "Source Han Sans SC",
          "sans-serif",
        ],
        serif: ["Songti SC", "STSong", "SimSun", "Source Han Serif SC", "serif"],
        mono: ["SFMono-Regular", "Consolas", "Menlo", "monospace"],
      },
      borderRadius: {
        xl2: "18px",
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.9)",
      },
      keyframes: {
        breathe: {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        breathe: "breathe 3.6s ease-in-out infinite",
        riseIn: "riseIn 0.5s cubic-bezier(0.16,1,0.3,1) both",
        sweep: "sweep 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
