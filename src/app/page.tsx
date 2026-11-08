export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <p className="label">CYBER ORACLE · 全国高校 Vibe Coding 开发挑战赛</p>
      <h1 className="mt-6 font-serif text-5xl leading-tight text-balance md:text-7xl">
        <span className="text-gradient-brass">赛博卦账</span>
      </h1>
      <p className="mt-5 max-w-xl text-paper-300">
        把一个月的生活账单，算成一卦。看清你的消费人格、钱在哪一天开始不够花，
        再拿到三条今天就能执行的开源节流处方。
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled>
          开始起卦（第三步接入）
        </button>
        <span className="chip text-paper-500">工程骨架已就绪</span>
      </div>
    </main>
  );
}
