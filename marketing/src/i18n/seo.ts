import type { SiteLocale } from './locale';

type MetaPair = { enTitle: string; koTitle: string; enDescription: string; koDescription: string };

const defaultMeta: MetaPair = {
  enTitle: "Verified tutors from Korea's top universities | Seonbae",
  koTitle: '대한민국 최상위 대학 출신 검증 튜터 | 선배',
  enDescription: 'Live online tutoring from verified Seoul National University, Korea University, and Yonsei University students.',
  koDescription: '서울대학교, 고려대학교, 연세대학교 재학생에게 배우는 검증된 온라인 일대일 과외입니다.',
};

const pages: Record<string, MetaPair> = {
  '/': defaultMeta,
  '/about': { enTitle: 'About | Seonbae', koTitle: '선배 소개 | 선배', enDescription: 'Meet the founders and learn why Seonbae makes private tutoring clearer for students, families, and tutors.', koDescription: '학생, 가족, 튜터 모두에게 더 투명한 과외를 만드는 선배와 창업팀을 소개합니다.' },
  '/become-a-tutor': { enTitle: 'Become a tutor | Seonbae', koTitle: '튜터 지원하기 | 선배', enDescription: 'Teach with Seonbae and receive fair, transparent pay for every lesson.', koDescription: '선배와 함께 가르치고 모든 수업에 대해 투명하고 정당한 보수를 받으세요.' },
  '/become-a-tutor/thank-you': { enTitle: 'Application received | Seonbae', koTitle: '지원 완료 | 선배', enDescription: 'Your Seonbae tutor application has been received.', koDescription: '선배 튜터 지원서가 접수되었습니다.' },
  '/contact': { enTitle: 'Contact | Seonbae', koTitle: '문의 | 선배', enDescription: 'Contact Seonbae about tutoring, matching, accounts, or the learning portal.', koDescription: '과외, 매칭, 계정 또는 학습 포털에 관해 선배에 문의하세요.' },
  '/get-matched': { enTitle: 'Get matched | Seonbae', koTitle: '상담 신청 | 선배', enDescription: 'Tell us your goals and schedule so the Seonbae team can match you with the right verified tutor.', koDescription: '목표와 일정을 알려주시면 선배 팀이 가장 잘 맞는 검증된 튜터를 찾아드립니다.' },
  '/how-it-works': { enTitle: 'How it works | Seonbae', koTitle: '이용 안내 | 선배', enDescription: 'See how tutor matching, one-to-one lessons, feedback, homework, and the Seonbae portal work together.', koDescription: '튜터 매칭부터 일대일 수업, 피드백, 과제와 선배 포털까지 이용 과정을 확인하세요.' },
  '/mock-exams': { enTitle: 'Mock exams | Seonbae', koTitle: '모의고사 | 선배', enDescription: 'Take full mock papers and level tests, then receive detailed marking and useful feedback.', koDescription: '실전 모의고사와 레벨 테스트에 응시하고 상세한 채점과 피드백을 받아보세요.' },
  '/pricing': { enTitle: 'Pricing | Seonbae', koTitle: '요금 | 선배', enDescription: 'See transparent hourly tutoring rates by curriculum and subject.', koDescription: '커리큘럼과 과목별 시간당 과외 요금을 투명하게 확인하세요.' },
  '/resources': { enTitle: 'Resources | Seonbae', koTitle: '학습 자료 | 선배', enDescription: 'Practical study, subject, test, and parent guides from the Seonbae research team.', koDescription: '선배 연구팀이 만든 공부, 과목, 시험 및 학부모 안내 자료를 만나보세요.' },
  '/subjects': { enTitle: 'Subjects | Seonbae', koTitle: '과목 | 선배', enDescription: 'Explore IB, AP, A Level, IGCSE, test preparation, English, and writing tutoring.', koDescription: 'IB, AP, A레벨, IGCSE, 시험 대비, 영어와 글쓰기 과외를 살펴보세요.' },
  '/tutors': { enTitle: 'Tutors | Seonbae', koTitle: '튜터 찾기 | 선배', enDescription: 'Browse verified tutors from Seoul National University, Korea University, and Yonsei University.', koDescription: '서울대학교, 고려대학교, 연세대학교 출신의 검증된 튜터를 찾아보세요.' },
  '/verification': { enTitle: 'Verification | Seonbae', koTitle: '검증 기준 | 선배', enDescription: 'See how Seonbae verifies tutor scores, university enrolment, identity, and teaching readiness.', koDescription: '선배가 튜터의 성적, 재학 여부, 신원과 수업 역량을 확인하는 기준을 알아보세요.' },
  '/404': { enTitle: 'Page not found | Seonbae', koTitle: '페이지를 찾을 수 없습니다 | 선배', enDescription: 'The page you requested could not be found.', koDescription: '요청하신 페이지를 찾을 수 없습니다.' },
};

export function pageMeta(pathname: string, locale: SiteLocale, overrides: { title?: string; titleKo?: string; description?: string; descriptionKo?: string } = {}) {
  const preset = pages[pathname];
  if (preset) {
    return locale === 'en'
      ? { title: preset.enTitle, description: preset.enDescription }
      : { title: preset.koTitle, description: preset.koDescription };
  }
  return locale === 'en'
    ? { title: overrides.title ?? defaultMeta.enTitle, description: overrides.description ?? defaultMeta.enDescription }
    : { title: overrides.titleKo ?? defaultMeta.koTitle, description: overrides.descriptionKo ?? defaultMeta.koDescription };
}
