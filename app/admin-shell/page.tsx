import styles from "./shell.module.css";

export const dynamic = "force-dynamic";

const cards = [
  ["01", "목표를 알려주세요", "과목, 현재 수준과 원하는 결과를 정리합니다."],
  ["02", "선배를 찾아드려요", "검증된 학업 경험과 가능한 시간을 함께 봅니다."],
  ["03", "기록하며 성장해요", "수업, 숙제와 피드백을 한곳에 남깁니다."],
];

export default function AdminShellPage() {
  return (
    <main className={styles.page}>
      <div className={styles.utility}>EDUCATION TO THE WORLD</div>
      <header className={styles.header}>
        <a className={styles.brand} href="#top"><img src="/logo.png" alt="" /><b>Seonbae</b></a>
        <nav aria-label="페이지 메뉴">
          <a href="#method">이용 방법</a><a href="#subjects">과목</a><a href="#about">소개</a>
        </nav>
        <a className={styles.cta} href="#start">시작하기 <span>↗</span></a>
      </header>

      <section className={styles.hero} id="top">
        <div>
          <p>VERIFIED TUTORS · ONLINE WORLDWIDE</p>
          <h1>배움의 다음 장을<br /><em>함께 엽니다.</em></h1>
          <span>서울대학교, 고려대학교, 연세대학교 출신의 검증된 선배와 목표를 구체적인 학습 계획으로 바꿔 보세요.</span>
          <a href="#method">선배 알아보기 <i>→</i></a>
        </div>
        <div className={styles.visual} aria-label="서비스 연결 상태">
          <img src="/hero-1-lg.jpg" alt="온라인으로 공부하는 학생" />
          <aside>
            <small>PLATFORM STATUS</small>
            <b>학습 환경을 준비하고 있습니다</b>
            <div><i /><i /><i /><i /></div>
            <span>연결 확인 · 일정 동기화 · 자료 준비</span>
          </aside>
        </div>
      </section>

      <section className={styles.flow} id="method">
        <p>HOW IT WORKS</p><h2>복잡하지 않게,<br />필요한 것만.</h2>
        <div>{cards.map(([number, title, copy]) => <article key={number}><b>{number}</b><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className={styles.subjects} id="subjects">
        <div><p>CURRICULA</p><h2>IB부터 A Level,<br />입시 영어까지.</h2></div>
        <ul><li>IB Diploma</li><li>Advanced Placement</li><li>A Level</li><li>IGCSE</li><li>SAT · ACT</li><li>IELTS · TOEFL</li></ul>
      </section>

      <section className={styles.promise} id="about"><p>검증 가능한 성적, 같은 길을 걸은 경험, 그리고 기록으로 남는 수업.</p></section>

      <footer className={styles.footer} id="start">
        <div><img src="/logo-light.png" alt="" /><b>Seonbae</b><p>좋은 수업은 신뢰할 수 있는 연결에서 시작됩니다.</p></div>
        <div><h3>Explore</h3><a href="#method">이용 방법</a><a href="#subjects">과목</a><a href="#about">소개</a></div>
        <div><h3>Contact</h3><span>admissions@seonbaetutor.com</span><span>Seoul · Online worldwide</span></div>
        <div className={styles.socials}>
          <a href="/admin/entry" aria-label="Instagram" title="Instagram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm5-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" /></svg>
          </a>
          <button type="button" aria-label="LinkedIn">in</button>
          <button type="button" aria-label="KakaoTalk">K</button>
        </div>
      </footer>
    </main>
  );
}
