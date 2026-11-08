import { OracleApp } from "@/components/oracle/OracleApp";

/**
 * 首页只做一件事：把主流程挂上去。
 * 所有业务状态都在 OracleApp 内部（client component），
 * 因此这里保持 server component，首屏 HTML 由 Next 直接吐出来。
 */
export default function Home() {
  return (
    <main className="relative min-h-screen">
      <div className="grain pointer-events-none fixed inset-0 z-0 opacity-[0.35]" aria-hidden="true" />
      <div className="relative z-10">
        <OracleApp />
      </div>
    </main>
  );
}
