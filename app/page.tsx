"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "home" | "tutors" | "verification" | "about" | "consult";
type Language = "ko" | "en";
type Tutor = {
  id:string;
  name:string;
  school:string;
  major:string;
  track:string;
  result:string;
  subject:string;
  color:string;
};
type Founder = {
  role:string;
  name:string;
  alternate:string;
  school:string;
  rows:string[][];
  copy:string;
  color:string;
};

const views: View[] = ["home", "tutors", "verification", "about", "consult"];

function routeFromHash(): { view:View; language:Language } {
  if (typeof window === "undefined") return { view:"home", language:"ko" };
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const language: Language = parts[0] === "en" ? "en" : "ko";
  const candidate = (language === "en" ? parts[1] : parts[0]) as View;
  return { view:views.includes(candidate) ? candidate : "home", language };
}

const initialTutors: Tutor[] = [];

const filters = ["all","IB","AP","A-Level","IGCSE","SAT","ACT","TOEFL","IELTS","TOEIC","내신","학습코칭"];

const schoolNames: Record<string,string> = {
  "서울대학교":"Seoul National University",
  "고려대학교":"Korea University",
  "연세대학교":"Yonsei University",
};

const majorNames: Record<string,string> = {
  "컴퓨터공학부":"Computer Science & Engineering",
  "국제학부":"International Studies",
  "생명공학과":"Biotechnology",
  "경제학부":"Economics",
  "경영학과":"Business Administration",
  "전기정보공학부":"Electrical & Computer Engineering",
  "수학과":"Mathematics",
  "정치외교학과":"Political Science & International Relations",
  "화학부":"Chemistry",
  "응용통계학과":"Applied Statistics",
  "영어영문학과":"English Language & Literature",
  "자유전공학부":"Liberal Studies",
  "언더우드국제대학":"Underwood International College",
  "미디어학부":"Media & Communication",
  "물리천문학부":"Physics & Astronomy",
  "화학공학과":"Chemical Engineering",
  "영어교육과":"English Education",
  "사회과학대학":"College of Social Sciences",
  "통계학과":"Statistics",
};

const filterLabels: Record<Language,Record<string,string>> = {
  ko:{all:"전체",내신:"내신",학습코칭:"학습코칭"},
  en:{all:"All",내신:"School Grades",학습코칭:"Study Coaching"},
};

const verificationByLanguage: Record<Language,string[][]> = {
  ko:[
    ["제1조","성적표 원본 확인","IB 최종 성적표, AP Score Report, A-Level Statement of Results, College Board 공식 리포트 — 가르칠 시험의 공식 성적 원본을 확인합니다.","확인 완료 시 통과"],
    ["제2조","재학증명서 확인","서울대학교·고려대학교·연세대학교 재학증명서 또는 졸업증명서를 확인합니다. 모든 튜터는 SKY 재외국민·국제 커뮤니티 출신입니다.","확인 완료 시 통과"],
    ["제3조","1:1 대면 면접","창업팀이 직접 모의 수업과 면접을 진행해 설명하는 힘과 책임감을 확인한 사람만 통과합니다.","통과율은 낮게 유지합니다"],
  ],
  en:[
    ["ARTICLE I","Original score report","We inspect the official score report for the exam each tutor teaches, including IB final results, AP Score Reports, A-Level Statements of Results, and College Board reports.","PASSED AFTER REVIEW"],
    ["ARTICLE II","Enrollment verification","We verify current enrollment or graduation at Seoul National, Korea, or Yonsei University. Every tutor comes from the SKY overseas-Korean or international-school community.","PASSED AFTER REVIEW"],
    ["ARTICLE III","One-to-one interview","Our founding team conducts a live interview and sample lesson. Only candidates who demonstrate clarity, responsibility, and teaching judgment are approved.","SELECTIVE BY DESIGN"],
  ],
};

const foundersByLanguage: Record<Language,Founder[]> = {
  ko:[
    {role:"CEO",name:"이윤재",alternate:"Raphael Lee",school:"고려대학교 · 국제학부",rows:[["역할","비전 · 최종 의사결정"],["경력","법률 · 금융 · 영업 실무"],["현직","Axiom Fund 매크로 애널리스트"]],copy:"회사의 장기 비전과 방향성을 설계하고 핵심 의사결정을 책임집니다. IB·IGCSE 경제 튜터링 경력으로 선배의 첫 튜터이기도 합니다.",color:"yellow"},
    {role:"COO",name:"오병국",alternate:"Byeongguk Oh",school:"고려대학교 · 경영학과",rows:[["역할","운영 · 재무 총괄"],["강점","운영 · 재무 실무"],["담당","매칭 · 정산 · 품질 관리"]],copy:"회사의 비전을 실제 실행으로 연결하고, 매칭부터 정산과 품질 관리까지 일상 운영을 책임집니다.",color:"coral"},
    {role:"CTO",name:"신승윤",alternate:"Seungyun Shin",school:"서울대학교 · 컴퓨터공학부",rows:[["역할","제품 · 기술 총괄"],["강점","제품 · 시스템 설계"],["담당","앱 · 서버 · AI 시스템"]],copy:"앱과 웹, 서버, AI, 시스템 아키텍처까지 서비스의 모든 기술 개발을 책임집니다.",color:"violet"},
  ],
  en:[
    {role:"CEO",name:"Raphael Lee",alternate:"이윤재",school:"Korea University · International Studies",rows:[["ROLE","Vision · final decisions"],["EXPERIENCE","Legal · finance · sales"],["CURRENT","Macro Analyst, Axiom Fund"]],copy:"Raphael shapes the company’s long-term direction and owns its core decisions. His IB and IGCSE economics tutoring experience also made him Seonbae’s first tutor.",color:"yellow"},
    {role:"COO",name:"Byeongguk Oh",alternate:"오병국",school:"Korea University · Business Administration",rows:[["ROLE","Operations · finance"],["STRENGTH","Operations · finance execution"],["FOCUS","Matching · billing · quality"]],copy:"Byeongguk turns the company vision into daily execution and oversees matching, billing, and quality management.",color:"coral"},
    {role:"CTO",name:"Seungyun Shin",alternate:"신승윤",school:"Seoul National University · Computer Science",rows:[["ROLE","Product · technology"],["STRENGTH","Product · systems design"],["FOCUS","Apps · servers · AI systems"]],copy:"Seungyun leads every technical layer of the service, from web and apps to servers, AI, and system architecture.",color:"violet"},
  ],
};

const pageCopy = {
  ko:{
    announcement:"24시간 이내 상담 답변",network:"서울대 · 고려대 · 연세대 검증 튜터 네트워크",
    nav:{home:"홈",tutors:"튜터 찾기",verification:"검증과 약속",about:"선배 소개",consult:"상담 신청"},
    freeConsult:"무료 상담",heroKicker:"검증된 재외국민 SKY 튜터 네트워크",
    heroBody:"IB Physics HL 7점이 IB Physics를 가르치고, SAT 1580점이 SAT를 가르칩니다. 성적표 원본·재학증명서·1:1 면접으로 직접 검증합니다.",
    findTutor:"튜터 찾아보기",trial:"상담 신청",
    manifestoBody:"모든 튜터는 성적표 원본, 재학증명서, 1:1 면접을 통과해야 합니다. 자기소개는 검증이 아닙니다.",
    principles:[["證","PROOF","확인 가능한 성적"],["路","PATH","같은 길을 걸은 선배"],["記","RECORD","기록이 남는 수업"]],
    stats:[["3","단계 검증 절차"],["SKY","서울대 · 고려대 · 연세대"],["24","전체 등재 튜터"],["1:1","전 세계 온라인 수업"]],
    registryBody:"모든 튜터는 이름 일부와 소속, 직접 받은 점수로 등재됩니다. 전체 성명과 상세 정보는 매칭 상담 시 공개됩니다.",
    premium:"프리미엄",standard:"스탠다드",search:"과목 검색",searchPlaceholder:"예: Physics, Economics…",listed:"등재 튜터",people:"명",
    verified:"✓ VERIFIED",credentials:"성적표 · 재학증명 · 면접",requestConsult:"상담하기 ↗",noResults:"검색 조건에 맞는 튜터가 없습니다.",
    verificationBody:"누구도 자기소개만으로 등재될 수 없습니다. 세 단계를 모두 통과해야 명부에 이름이 오릅니다.",verificationNote:"※ 세 단계를 모두 통과한 튜터에게만 붉은 검증인이 찍힙니다.",
    steps:[["I","조건 입력","커리큘럼, 과목, 현재 수준, 목표 시험과 지망 대학, 가능한 일정을 알려 주세요."],["II","선배 매칭","과목만 맞추지 않습니다. 같은 시험과 비슷한 진학 경로를 통과한 튜터를 연결합니다."],["III","학습 진단과 계획 수립","현재 수준과 취약점을 정리해 우선순위가 분명한 학습 계획을 세웁니다."],["IV","기록이 남는 수업","일정, 피드백, 진도, 숙제, 모의고사 결과를 기록해 학부모에게 전달합니다."]],
    includedBody:"별도의 옵션이 아닙니다. 선배의 모든 수업이 지키는 기본 약속입니다.",included:[["01","AI 준비 교재","최신 AI 도구로 학생 맞춤 교재와 진단을 준비합니다."],["02","개인별 학습 진단","현재 수준과 취약점을 파악해 학습 우선순위를 구체적으로 제안합니다."],["03","학부모 진도 리포트","진도·숙제·모의고사 결과를 정기 리포트로 전달합니다."],["04","기록되는 플랫폼","일정과 수업 기록이 남아 언제든 확인할 수 있습니다."]],includedLabel:"포함",
    storyP1:"선배는 같은 기숙사 방에서 시작됐습니다. 재외국민·국제학교 출신으로 IB와 SAT를 직접 치르고 SKY에 진학한 세 사람이 학생일 때 간절히 원했던 것을 만들기로 했습니다.",storyP2:"서울에서 시작하지만 수업은 전 세계 어디서나 열립니다. 홍콩과 미국의 한인 커뮤니티가 다음 목적지입니다.",networkLine:"네트워크 — SNU · KU · YU",foundersHeading:"창업팀도 같은 형식으로\n검증을 공개합니다.",mottoBody:"튜터는 정당하게 벌고, 학생은 제대로 배웁니다.\n하나의 신뢰할 수 있는 네트워크 안에서.",
    consultBody:"어느 방법이든 24시간 이내에 답변드립니다.",fastest:"가장 빠른 방법",kakao:"카카오톡으로 바로 상담 ↗",details:"자세한 문의",
    name:"성함",curriculum:"커리큘럼 / 시험",subject:"과목",subjectPlaceholder:"예: Mathematics AA HL",situation:"목표와 현재 상황",situationPlaceholder:"목표 점수, 지망 대학, 현재 수준 등을 자유롭게 적어 주세요.",apply:"상담 신청",emailNotice:"신청하면 이메일이 열립니다. 24시간 이내에 답변드립니다.",other:"기타 / 미정",internationalGrades:"국제학교 내신",
    site:"Site",contact:"Contact",company:"Company",team:"팀 소개",applyTutor:"튜터 지원하기 ↗",quickConsult:"빠른 상담 신청",
  },
  en:{
    announcement:"CONSULTATION REPLIES WITHIN 24 HOURS",network:"VERIFIED SNU · KOREA · YONSEI TUTOR NETWORK",
    nav:{home:"Home",tutors:"Find a Tutor",verification:"Verification",about:"About Seonbae",consult:"Consultation"},
    freeConsult:"Free consultation",heroKicker:"A VERIFIED SKY TUTOR NETWORK FOR GLOBAL KOREAN STUDENTS",
    heroBody:"An IB Physics HL 7 teaches IB Physics. An SAT 1580 teaches the SAT. Every tutor is directly verified through original score reports, enrollment documents, and a one-to-one interview.",
    findTutor:"Find your tutor",trial:"Request a consultation",
    manifestoBody:"Every tutor must pass our original-score-report review, enrollment verification, and one-to-one interview. A profile alone is not proof.",
    principles:[["證","PROOF","Scores you can verify"],["路","PATH","A mentor who walked your path"],["記","RECORD","Lessons with a record"]],
    stats:[["3","verification stages"],["SKY","SNU · Korea · Yonsei"],["24","verified tutors"],["1:1","online lessons worldwide"]],
    registryBody:"Every tutor is listed with a masked name, university, and a score they earned themselves. Full identities and details are shared during matching consultations.",
    premium:"Premium",standard:"Standard",search:"Search by subject",searchPlaceholder:"e.g. Physics, Economics…",listed:"Verified tutors",people:"",
    verified:"✓ VERIFIED",credentials:"Score · enrollment · interview",requestConsult:"Consult ↗",noResults:"No tutors match these search criteria.",
    verificationBody:"No one enters this registry through self-description alone. A tutor’s name appears only after all three stages are complete.",verificationNote:"※ The red verification seal is reserved for tutors who pass every stage.",
    steps:[["I","Tell us your goals","Share the curriculum, subject, current level, target exam or university, and available schedule."],["II","Seonbae matching","We match more than a subject. We connect students with tutors who passed the same exam and followed a similar admissions path."],["III","Diagnostic and study plan","We map the student’s current level and gaps into a study plan with clear priorities."],["IV","Lessons on record","Schedules, feedback, progress, homework, and mock-exam results are documented and shared with parents."]],
    includedBody:"These are not upgrades. They are the standard commitments included in every Seonbae lesson.",included:[["01","AI-prepared materials","Current AI tools help us prepare student-specific materials and diagnostics."],["02","Student-specific diagnostic","We identify the student’s current level and gaps, then recommend practical priorities."],["03","Parent progress reports","Progress, homework, and mock-exam results are delivered in regular reports."],["04","A documented platform","Schedules and lesson records remain accessible whenever you need them."]],includedLabel:"INCLUDED",
    storyP1:"Seonbae began in a shared dorm room. Three overseas-Korean and international-school graduates—each of whom sat the IB or SAT and entered a SKY university—decided to build what they had wanted most as students.",storyP2:"We began in Seoul, but lessons open from anywhere in the world. Korean communities in Hong Kong and the United States are next.",networkLine:"NETWORK — SNU · KU · YU",foundersHeading:"Our founders publish their own\ncredentials in the same format.",mottoBody:"Tutors earn fairly. Students learn properly.\nOne trusted network makes both possible.",
    consultBody:"Whichever route you choose, we respond within 24 hours.",fastest:"FASTEST ROUTE",kakao:"Consult on KakaoTalk ↗",details:"DETAILED ENQUIRIES",
    name:"Name",curriculum:"Curriculum / exam",subject:"Subject",subjectPlaceholder:"e.g. Mathematics AA HL",situation:"Goals and current level",situationPlaceholder:"Tell us the target score, preferred universities, current level, and anything else we should know.",apply:"Request a consultation",emailNotice:"Submitting opens your email client. We respond within 24 hours.",other:"Other / undecided",internationalGrades:"International-school grades",
    site:"Site",contact:"Contact",company:"Company",team:"Meet the team",applyTutor:"Apply as a tutor ↗",quickConsult:"Quick consultation",
  },
};

export default function Page() {
  const [view,setView] = useState<View>("home");
  const [language,setLanguage] = useState<Language>("ko");
  const [filter,setFilter] = useState("all");
  const [query,setQuery] = useState("");
  const [tutors,setTutors] = useState<Tutor[]>(initialTutors);
  const t = pageCopy[language];
  const localizedVerification = verificationByLanguage[language];
  const localizedFounders = foundersByLanguage[language];
  const isEnglish = language === "en";

  const tabHref = (next:View) => isEnglish ? `#/en/${next}` : `#/${next}`;
  const languageHref = isEnglish ? `#/${view}` : `#/en/${view}`;
  const displayTrack = (track:string) => isEnglish ? (filterLabels.en[track] || track) : track;
  const displayTutorName = (tutor:Tutor) => tutor.name;
  const displaySchool = (school:string) => isEnglish ? (schoolNames[school] || school) : school;
  const displayMajor = (major:string) => isEnglish ? (majorNames[major] || major) : major;

  const visibleTutors = useMemo(() => tutors.filter(tutor => {
    const matchesFilter = filter === "all" || tutor.track === filter;
    const localizedHaystack = `${tutor.subject} ${tutor.track} ${displayTrack(tutor.track)} ${tutor.school} ${displaySchool(tutor.school)} ${tutor.major} ${displayMajor(tutor.major)}`.toLowerCase();
    return matchesFilter && localizedHaystack.includes(query.toLowerCase());
  }),[filter,query,language]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tutors", { cache:"no-store", signal:controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Tutor directory unavailable");
        return response.json();
      })
      .then((rows:Array<{
        registry_id:string;
        name:string;
        exam:string;
        score:string;
      }>) => {
        const colors = ["yellow","coral","mint","violet"];
        setTutors(rows.map((row,index) => ({
          id:row.registry_id,
          name:row.name,
          school:"",
          major:"",
          track:row.exam,
          result:row.score,
          subject:row.exam,
          color:colors[index % colors.length],
        })));
      })
      .catch(error => {
        if (error instanceof Error && error.name !== "AbortError") setTutors([]);
      });
    return () => controller.abort();
  },[]);

  useEffect(() => {
    const syncRoute = () => {
      const route = routeFromHash();
      setView(route.view);
      setLanguage(route.language);
    };
    syncRoute();
    window.addEventListener("hashchange",syncRoute);
    return () => window.removeEventListener("hashchange",syncRoute);
  },[]);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    const resetScroll = () => {
      window.scrollTo({top:0,left:0,behavior:"auto"});
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(frame);
  },[view,language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = isEnglish ? "Seonbae | Verified SKY Tutors" : "선배 | 검증된 SKY 튜터";
  },[language,isEnglish]);

  function submitConsultation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = isEnglish
      ? `Name: ${data.get("name")}\nCurriculum: ${data.get("curriculum")}\nSubject: ${data.get("subject")}\nGoals and current level: ${data.get("message")}`
      : `성함: ${data.get("name")}\n커리큘럼: ${data.get("curriculum")}\n과목: ${data.get("subject")}\n목표와 현재 상황: ${data.get("message")}`;
    const subject = isEnglish ? "Consultation request" : "상담 신청";
    window.location.href = `mailto:admissions@seonbae.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const curriculumOptions = ["IB","AP","A-Level","IGCSE","SAT","ACT","TOEFL","IELTS","TOEIC",t.internationalGrades,t.other];

  return <main className={`page-${view} lang-${language}`}>
    <div className="announcement"><span>{t.announcement}</span><i />{t.network}</div>
    <header className="siteHeader">
      <a className="wordmark" href={tabHref("home")}><strong>선배</strong><span>SEONBAE<br/>EST. 2026</span></a>
      <nav aria-label={isEnglish ? "Main navigation" : "주요 메뉴"}>
        {views.map(item => <a className={view===item?"active":""} href={tabHref(item)} key={item}>{t.nav[item]}</a>)}
      </nav>
      <div className="headerActions"><a className="language" href={languageHref} aria-label={isEnglish ? "한국어로 보기" : "View in English"}>{isEnglish ? "KO" : "EN"}</a><a className="consult" href={tabHref("consult")}>{t.freeConsult} <span>↗</span></a></div>
    </header>

    <section className="hero" id="home">
      <div className="heroCopy"><p className="eyebrow light">{t.heroKicker}</p>
        <h1>{isEnglish ? <>The exam your child<br/>is preparing for—<br/><em>taught by someone</em><br/>who already won it.</> : <>당신의 자녀가<br/>준비하는 그 시험,<br/><em>이미 이긴 사람</em>이<br/>가르칩니다.</>}</h1>
        <p>{t.heroBody}</p><div className="heroActions"><a className="button yellowButton" href={tabHref("tutors")}>{t.findTutor} <span>↗</span></a><a className="outlineLink" href={tabHref("consult")}>{t.trial} <span>→</span></a></div>
      </div>
      <div className="heroScores"><div className="scoreBlock yellow"><span>P-001 · SEOUL NATIONAL UNIVERSITY</span><b>44<small>/45</small></b><p>IB DIPLOMA</p></div><div className="scoreBlock coral"><span>P-012 · VERIFIED</span><b>1580</b><p>DIGITAL SAT</p></div><div className="scoreBlock violet"><span>S-003 · VERIFIED</span><b>8.5</b><p>IELTS ACADEMIC</p></div></div>
    </section>
    <div className="ticker">{["IB 44 / 45","ECONOMICS HL 7","AP CALCULUS BC 5","SAT 1580","IELTS 8.5","TOEFL 118"].map(x=><span key={x}>{x}<i>✦</i></span>)}</div>

    <section className="manifesto section">
      <div className="sectionKicker"><span>01</span><p>WHY SEONBAE</p></div>
      <div className="giantHeading"><h2>{isEnglish ? <>No proof.<br/><em>No listing.</em></> : <>증명 없이는<br/><em>등재 없다.</em></>}</h2><p>{t.manifestoBody}</p></div>
      <div className="principles">{t.principles.map((item,index)=><article className={["yellow","coral","mint"][index]} key={item[1]}><b>{item[0]}</b><span>{item[1]}</span><h3>{item[2]}</h3></article>)}</div>
      <div className="stats">{t.stats.map(item=><div key={item[0]}><strong>{item[0]}</strong><span>{item[1]}</span></div>)}</div>
    </section>

    <section className="registry section" id="tutors">
      <div className="sectionKicker lightKicker"><span>02</span><p>FIND A TUTOR</p></div>
      <div className="registryIntro"><h2>{isEnglish ? <>The score report<br/><em>is the résumé.</em></> : <>성적표가 곧<br/><em>이력서입니다.</em></>}</h2><p>{t.registryBody}</p></div>
      <div className="directoryTools"><div className="filterChips">{filters.map(item=><button className={filter===item?"active":""} onClick={()=>setFilter(item)} key={item}>{filterLabels[language][item] || item}</button>)}</div><label><span>{t.search}</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={t.searchPlaceholder} /></label></div>
      <p className="resultCount">{t.listed} <b>{visibleTutors.length}</b>{t.people}</p>
      <div className="directoryGrid">{visibleTutors.map(tutor=><article className="directoryCard" key={tutor.id}><div className={`resultPanel ${tutor.color}`}><span>{tutor.id} · {displayTrack(tutor.track)}</span><b>{tutor.result}</b><p>{tutor.subject}</p></div><div className="person"><h3>{displayTutorName(tutor)}</h3><span>{t.verified}</span><b>{displaySchool(tutor.school)}</b><p>{displayMajor(tutor.major)} · {displayTrack(tutor.track)}</p></div><div className="cardActions"><span>{t.credentials}</span><a href={tabHref("consult")}>{t.requestConsult}</a></div></article>)}</div>
      {visibleTutors.length===0&&<p className="emptyState">{t.noResults}</p>}
    </section>

    <section className="verification section" id="verification">
      <div className="sectionKicker"><span>03</span><p>VERIFICATION</p></div>
      <div className="giantHeading"><h2>{isEnglish ? <>How a name<br/><em>enters the registry.</em></> : <>이 명부에<br/><em>오르는 법.</em></>}</h2><p>{t.verificationBody}</p></div>
      <div className="verificationRows">{localizedVerification.map((item,index)=><article key={item[0]}><div className="roman">0{index+1}</div><div><span>{item[0]}</span><h3>{item[1]}</h3></div><p>{item[2]}</p><b>{item[3]}</b></article>)}</div><p className="verificationNote">{t.verificationNote}</p>
    </section>

    <section className="howItWorks"><div className="howIntro"><div className="sectionKicker lightKicker"><span>04</span><p>HOW IT WORKS</p></div><h2>{isEnglish ? <>Meet a tutor<br/>who walked your path.</> : <>같은 길을 걸은<br/>튜터를 만나는 법.</>}</h2></div><div className="stepGrid">{t.steps.map(step=><article key={step[0]}><span>{step[0]}</span><h3>{step[1]}</h3><p>{step[2]}</p></article>)}</div></section>

    <section className="included section"><div className="sectionKicker"><span>05</span><p>EVERY LESSON</p></div><div className="giantHeading"><h2>{isEnglish ? <>Included in<br/><em>every lesson.</em></> : <>모든 수업에<br/><em>포함됩니다.</em></>}</h2><p>{t.includedBody}</p></div><div className="includedGrid">{t.included.map((item,index)=><article className={["yellow","coral","mint","violet"][index]} key={item[0]}><span>{t.includedLabel} · {item[0]}</span><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section>

    <section className="story section" id="about">
      <div className="sectionKicker lightKicker"><span>06</span><p>OUR STORY</p></div>
      <div className="storyLead"><h2>{isEnglish ? <>Seonbae was our<br/><em>first tutor and client.</em></> : <>선배가 곧<br/><em>첫 튜터이자 첫 고객.</em></>}</h2><div><p>{t.storyP1}</p><p>{t.storyP2}</p><b>{t.networkLine}</b></div></div>
      <div className="founders"><div className="founderHeading"><span>THE FOUNDERS</span><h3>{t.foundersHeading}</h3></div>{localizedFounders.map(founder=><article key={founder.role}><div className={`founderTop ${founder.color}`}><span>SEONBAE · FOUNDER</span><b>{founder.role}</b><h3>{founder.name}</h3><p>{founder.alternate}</p><small>{founder.school}</small></div><div className="founderRows">{founder.rows.map(row=><div key={row[0]}><span>{row[0]}</span><b>{row[1]}</b></div>)}</div><p className="founderCopy">{founder.copy}</p></article>)}</div>
      <div className="motto"><span>Two birds, one stone.</span><p>{t.mottoBody}</p></div>
    </section>

    <section className="consultation" id="consult"><div className="consultCopy"><div className="sectionKicker"><span>07</span><p>BEGIN HERE</p></div><h2>{isEnglish ? <>Consultation<br/>request.</> : <>상담<br/>신청.</>}</h2><p>{t.consultBody}</p><div className="directContact"><a href="https://pf.kakao.com/_seonbae"><span>{t.fastest}</span><b>{t.kakao}</b></a><a href="mailto:admissions@seonbae.com"><span>{t.details}</span><b>admissions@seonbae.com ↗</b></a></div></div><ConsultForm copy={t} onSubmit={submitConsultation} options={curriculumOptions} /></section>

    <footer><div className="footerBrand"><a href={tabHref("home")}>선배</a><p>Two birds,<br/>one stone.</p></div><div className="footerGrid"><div><b>{t.site}</b><a href={tabHref("tutors")}>{t.nav.tutors}</a><a href={tabHref("verification")}>{t.nav.verification}</a><a href={tabHref("about")}>{t.nav.about}</a></div><div><b>{t.contact}</b><a href="mailto:admissions@seonbae.com">admissions@seonbae.com</a><a href="https://pf.kakao.com/_seonbae">KakaoTalk Channel ↗</a></div><div><b>{t.company}</b><a href={`${tabHref("about")}/founders`}>{t.team}</a><a href="/tutor-apply">{t.applyTutor}</a></div></div><div className="footerBottom"><span>© 2026 SEONBAE · SEOUL, REPUBLIC OF KOREA</span><span><a href="/privacy">{isEnglish?"Privacy Policy":"개인정보 처리방침"}</a> · <a href="/terms">{isEnglish?"Terms of Service":"이용약관"}</a></span></div></footer>
    <ConsultForm compact copy={t} onSubmit={submitConsultation} options={curriculumOptions} />
  </main>;
}

type ConsultCopy = typeof pageCopy.ko | typeof pageCopy.en;

function ConsultForm({copy,onSubmit,options,compact=false}:{copy:ConsultCopy;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;options:string[];compact?:boolean}) {
  if (compact) return <form className="footerConsultForm" onSubmit={onSubmit} aria-label={copy.quickConsult}>
    <div className="footerFormHeading"><span>BEGIN HERE</span><b>{copy.quickConsult}</b></div>
    <label><span>{copy.name}</span><input name="name" required /></label>
    <label><span>{copy.curriculum}</span><select name="curriculum" defaultValue="IB">{options.map(option=><option key={option}>{option}</option>)}</select></label>
    <label><span>{copy.subject}</span><input name="subject" placeholder={copy.subjectPlaceholder} required /></label>
    <label className="footerMessage"><span>{copy.situation}</span><textarea name="message" rows={2} required /></label>
    <button type="submit">{copy.apply} <span>↗</span></button>
  </form>;

  return <form onSubmit={onSubmit}>
    <label>{copy.name}<input name="name" required /></label>
    <label>{copy.curriculum}<select name="curriculum" defaultValue="IB">{options.map(option=><option key={option}>{option}</option>)}</select></label>
    <label>{copy.subject}<input name="subject" placeholder={copy.subjectPlaceholder} required /></label>
    <label>{copy.situation}<textarea name="message" placeholder={copy.situationPlaceholder} rows={5} required /></label>
    <button type="submit">{copy.apply} <span>↗</span></button>
    <small>{copy.emailNotice}</small>
  </form>;
}
