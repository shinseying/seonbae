// Seonbae navigation, adapted from the template's generic tabs to fit the
// verified SKY-tutor network (Verification is Seonbae's distinctive trust page).
// Each item carries a Korean label so the header/footer flip with the language
// toggle (see components/T.astro and the html[data-lang] switch).

export interface NavItem { label: string; labelKo: string; href: string; }

// Six tabs, ordered the way a visitor decides: understand, browse, meet,
// assess, price, then learn about us. The wordmark goes home, and the
// company pages live under one "About" menu instead of competing for a tab.
export const mainNav: NavItem[] = [
  { label: 'How it works', labelKo: '이용 안내', href: '/how-it-works' },
  { label: 'Subjects', labelKo: '과목', href: '/subjects' },
  { label: 'Tutors', labelKo: '튜터', href: '/tutors' },
  { label: 'Mock exams', labelKo: '모의고사', href: '/mock-exams' },
  { label: 'Pricing', labelKo: '요금', href: '/pricing' },
  { label: 'About', labelKo: '소개', href: '/about' },
];

export const tutorNav: NavItem[] = [
  { label: 'Find a tutor', labelKo: '튜터 찾기', href: '/tutors' },
  { label: 'Tutor sign up', labelKo: '튜터 회원가입', href: '/login?mode=signup&role=tutor' },
];

// Shown inside the header "About" menu, the mobile drawer, and the footer.
export const exploreNav: NavItem[] = [
  { label: 'About Seonbae', labelKo: '선배 소개', href: '/about' },
  { label: 'Our standard', labelKo: '검증 기준', href: '/verification' },
  { label: 'Resources', labelKo: '학습 자료', href: '/resources' },
  { label: 'Contact', labelKo: '문의', href: '/contact' },
  { label: 'FAQ', labelKo: '자주 묻는 질문', href: '/pricing#faq' },
];

export const footerLearn: NavItem[] = [
  { label: 'Subjects', labelKo: '과목', href: '/subjects' },
  { label: 'Tutors', labelKo: '선배', href: '/tutors' },
  { label: 'How it works', labelKo: '이용 안내', href: '/how-it-works' },
  { label: 'Mock exams', labelKo: '모의고사', href: '/mock-exams' },
  { label: 'Pricing', labelKo: '요금', href: '/pricing' },
];

export const footerCompany: NavItem[] = [
  { label: 'About', labelKo: '소개', href: '/about' },
  { label: 'Verification', labelKo: '검증', href: '/verification' },
  { label: 'Resources', labelKo: '학습 자료', href: '/resources' },
  { label: 'Contact', labelKo: '문의', href: '/contact' },
];

// Korean titles for the six curriculum groups, keyed by content id, so the
// Subjects mega-menu reads fully in Korean under the toggle.
export const subjectTitleKo: Record<string, string> = {
  'ib-diploma': 'IB 디플로마',
  'advanced-placement': 'AP',
  'a-level': 'A레벨',
  'igcse': 'IGCSE',
  'standardized-tests': '시험 대비',
  'english-writing': '영어 · 글쓰기',
};
