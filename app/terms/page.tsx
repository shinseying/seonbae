import type { Metadata } from "next";
import Link from "next/link";
import { TERMS_VERSION } from "../../utils/auth/legal";
import styles from "../legal/legal.module.css";

export const metadata: Metadata = {
  title: "이용약관 — 선배",
  description: "선배 웹사이트, 계정, 학습 포털과 튜터 연결 서비스의 이용 조건입니다.",
};

const sections = [
  ["scope", "1. 목적과 적용"],
  ["service", "2. 서비스"],
  ["account", "3. 계정과 보안"],
  ["children", "4. 미성년자"],
  ["lessons", "5. 상담·매칭·수업"],
  ["conduct", "6. 이용자 의무"],
  ["ip", "7. 지식재산권"],
  ["availability", "8. 변경·중단·해지"],
  ["liability", "9. 책임과 분쟁"],
  ["changes", "10. 약관 변경"],
];

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <LegalHeader />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>TERMS OF SERVICE · {TERMS_VERSION}</p>
        <h1>이용약관</h1>
        <p>
          이 약관은 선배 웹사이트, 회원 계정, 학습 포털, 상담과 튜터 연결 서비스를
          이용할 때 선배와 이용자 사이에 적용되는 기본 원칙을 정합니다.
        </p>
      </header>
      <div className={styles.content}>
        <nav className={styles.toc} aria-label="이용약관 목차">
          <b>목차</b>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          <a href="#english">English version</a>
        </nav>
        <article className={styles.document}>
          <p className={styles.notice}>
            시행일: 2026년 7월 29일 · 서비스 제공자: 선배(Seonbae) · 문의:{" "}
            <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
          </p>

          <section id="scope">
            <h2>1. 목적과 적용</h2>
            <p>
              이 약관은 선배가 제공하는 공개 웹사이트, 회원 계정, 학습 포털,
              상담, 튜터 탐색·연결 및 이에 부수하는 서비스에 적용됩니다. 개별 수업의
              과목, 일정, 횟수, 비용, 취소·환불 조건은 상담 후 별도 안내 또는 계약이
              있는 경우 그 내용이 우선합니다.
            </p>
          </section>

          <section id="service">
            <h2>2. 서비스의 내용</h2>
            <ul>
              <li>검증된 튜터 명부와 교육 관련 정보 제공</li>
              <li>학생의 목표와 과목에 맞춘 상담 및 튜터 연결</li>
              <li>회원별 수업 일정, 담당 튜터와 전달 사항을 확인하는 포털</li>
              <li>포털 안에서 이용하는 Zoom 온라인 수업 교실</li>
              <li>학생–튜터 수업 채팅 및 보호자–창업팀 전용 상담</li>
              <li>수업 운영, 문의 응대 및 관련 지원</li>
            </ul>
            <p>
              선배는 튜터의 학력·성적 등 표시 정보를 합리적인 절차로 확인하지만,
              특정 시험 점수, 성적 향상, 합격 또는 진학 결과를 보장하지 않습니다.
            </p>
          </section>

          <section id="account">
            <h2>3. 회원가입, 계정과 보안</h2>
            <p>
              이용자는 정확하고 최신인 정보를 제공해야 하며 타인의 정보로 가입해서는
              안 됩니다. 이메일 가입은 이메일 인증을, Google 가입은 Google 계정
              인증을 마쳐야 계정을 정상적으로 사용할 수 있습니다.
              비밀번호는 12자 이상이며 영문 소문자·대문자·숫자·허용 특수문자를
              각각 포함해야 합니다.
            </p>
            <p>
              계정과 비밀번호 관리 책임은 이용자에게 있습니다. 무단 사용이 의심되면
              즉시 비밀번호를 변경하고 선배에 알려야 합니다. 아이디 찾기와 비밀번호
              재설정은 등록 정보가 일치할 때 가입 이메일로 보안 링크를 보내는
              방식으로 진행하며, 화면에는 계정 존재 여부나 이메일 주소를 노출하지
              않습니다.
            </p>
          </section>

          <section id="children">
            <h2>4. 미성년자 이용</h2>
            <p>
              만 14세 미만 학생을 위한 계정은 법정대리인이 직접 만들고 관리해야
              합니다. 미성년자의 유료 수업 계약에는 법정대리인의 동의가 필요할 수
              있습니다. 법정대리인은 학생의 계정과 수업 정보가 정확하고 안전하게
              관리되도록 협조해야 합니다.
            </p>
          </section>

          <section id="lessons">
            <h2>5. 상담, 튜터 매칭과 수업</h2>
            <p>
              상담과 튜터 추천은 이용자가 제공한 목표, 수준, 일정과 튜터의 전문
              영역·가능 시간을 바탕으로 이루어집니다. 최종 튜터, 수업 방식, 일정과
              비용은 별도 확인 후 확정됩니다. 일정 변경, 결석, 취소와 환불은 개별
              계약 또는 확정 안내에 따릅니다.
            </p>
            <p>
              이용자는 수업 진행에 필요한 정보를 정확히 제공하고, 튜터와 다른
              이용자의 안전과 권리를 존중해야 합니다. 수업 자료와 피드백은 해당
              학생의 학습 목적으로만 이용해야 합니다.
            </p>
            <p>
              온라인 수업은 Zoom Meeting SDK를 통해 제공됩니다. 이용자는
              브라우저의 카메라·마이크 권한을 직접 선택하며, 계정과 수업 링크를
              제3자와 공유해서는 안 됩니다. 선배는 기본적으로 수업을 녹화하지
              않습니다. 녹화가 필요한 경우 시작 전에 목적, 이용 범위와 보유기간을
              알리고 관계 법령상 필요한 동의를 받습니다. Zoom의 장애나 이용자의
              네트워크·기기 문제로 연결이 중단될 수 있으며, 가능한 경우 선배가
              일정 조정 또는 대체 접속을 안내합니다.
            </p>
          </section>

          <section id="conduct">
            <h2>6. 금지행위와 이용자 의무</h2>
            <ul>
              <li>타인의 계정·개인정보를 사용하거나 계정을 공유·판매하는 행위</li>
              <li>서비스, 데이터베이스 또는 다른 계정에 무단 접근을 시도하는 행위</li>
              <li>튜터·학생에 대한 괴롭힘, 차별, 위협 또는 불법행위</li>
              <li>수업 자료, 명부, 소프트웨어를 허가 없이 복제·배포·상업 이용하는 행위</li>
              <li>허위 정보 제출, 자동화된 대량 요청 또는 서비스 운영 방해</li>
            </ul>
            <p>
              위반이 확인되면 사전 안내 후 이용을 제한하거나 계정을 해지할 수
              있습니다. 긴급한 보안 위험, 불법행위 또는 타인 피해가 우려되는 경우
              선조치 후 안내할 수 있습니다.
            </p>
          </section>

          <section id="ip">
            <h2>7. 지식재산권</h2>
            <p>
              웹사이트 디자인, 상표, 데이터베이스 구성, 교육 콘텐츠와 자료의 권리는
              선배 또는 적법한 권리자에게 있습니다. 이용자는 개인적인 학습 목적의
              범위에서만 제공 자료를 사용할 수 있으며, 별도 허락 없이 재판매,
              공개 배포, 2차 저작물 제작 또는 AI 학습용 데이터로 사용할 수 없습니다.
            </p>
          </section>

          <section id="availability">
            <h2>8. 서비스 변경·중단과 계정 해지</h2>
            <p>
              품질 개선, 보안, 점검, 법령 준수 또는 불가항력으로 서비스의 일부를
              변경하거나 일시 중단할 수 있습니다. 예상 가능한 중대한 중단은 미리
              알립니다. 일반 회원은 마이페이지에서 직접 계정을 삭제하거나 언제든
              계정 삭제를 요청할 수 있으며, 선배는 법령상 보존할 정보 외의
              개인정보를 처리방침에 따라 파기합니다.
            </p>
          </section>

          <section id="liability">
            <h2>9. 책임, 준거법과 분쟁</h2>
            <p>
              선배는 고의 또는 과실로 이용자에게 손해를 발생시킨 경우 관계 법령에
              따라 책임을 부담합니다. 이용자의 귀책사유, 제3자 서비스 장애,
              천재지변 등 합리적으로 통제하기 어려운 사유로 발생한 손해에는 선배의
              책임이 제한될 수 있습니다. 법령상 배제할 수 없는 소비자 권리는 이
              약관으로 제한되지 않습니다.
            </p>
            <p>
              이 약관은 대한민국 법률을 준거법으로 합니다. 분쟁이 생기면 상호
              협의해 해결하도록 노력하며, 해결되지 않는 경우 민사소송법 등 관계
              법령이 정하는 관할 법원에 따릅니다.
            </p>
          </section>

          <section id="changes">
            <h2>10. 약관의 변경</h2>
            <p>
              약관을 변경하면 시행일과 변경 이유를 시행 7일 전부터 공지합니다.
              이용자에게 불리한 중대한 변경은 30일 전에 알리고 법령상 필요한 경우
              별도 동의를 받습니다.
            </p>
          </section>

          <div className={styles.english} id="english">
            <span className={styles.englishBadge}>ENGLISH VERSION</span>
            <section>
              <h2>Terms of Service</h2>
              <p>
                Effective July 29, 2026. These terms apply to Seonbae’s public
                website, member accounts, learning portal, consultations, tutor
                discovery and matching, and related services. Separate confirmed
                terms for lesson subject, schedule, fees, cancellation and
                refunds take priority for that engagement.
              </p>
              <h3>Accounts and security</h3>
              <p>
                You must provide accurate information, verify your email, keep
                your credentials secure, and promptly report suspected misuse.
                New passwords must be at least 12 characters and include
                lowercase and uppercase letters, a number, and an allowed
                symbol. ID recovery and password-reset links are sent to the
                registered email after the submitted account details match.
                The recovery screen does not disclose whether an account exists
                or reveal its email address.
              </p>
              <h3>Minors, lessons and outcomes</h3>
              <p>
                An account for a student under 14 must be created and managed by
                a legal guardian. Tutor recommendations depend on the
                information and availability provided. Seonbae verifies displayed
                tutor credentials through reasonable procedures but does not
                guarantee a score increase, admission, or other academic result.
              </p>
              <h3>Acceptable use and intellectual property</h3>
              <p>
                Do not misuse another person’s account, attempt unauthorized
                access, harass users, submit false information, disrupt the
                service, or reproduce and commercially exploit the registry,
                learning materials, brand, design or software without
                permission. Embedded lessons use Zoom Meeting SDK. Participants
                control browser camera and microphone permissions and must not
                share account access or meeting credentials. Recording is off
                by default; any recording requires advance notice and any
                consent required by law.
              </p>
              <h3>Availability, liability and law</h3>
              <p>
                Services may change or pause for maintenance, security, legal
                compliance or events beyond reasonable control. Nothing in
                these terms excludes non-waivable consumer rights. Korean law
                governs, and disputes are handled by the court with jurisdiction
                under applicable Korean procedure after good-faith discussion.
              </p>
            </section>
          </div>
        </article>
      </div>
      <LegalFooter />
    </main>
  );
}

function LegalHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        <img src="/logo.png" alt="" width="40" height="40" />
        <strong>선배</strong><span>SEONBAE · EST. 2026</span>
      </Link>
      <nav><Link href="/privacy">개인정보 처리방침</Link><Link href="/">홈으로 ↗</Link></nav>
    </header>
  );
}

function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <span>© 2026 선배 · 서울, 대한민국</span>
      <div><Link href="/privacy">개인정보 처리방침</Link><Link href="/terms">이용약관</Link></div>
    </footer>
  );
}
