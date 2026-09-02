import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "../../utils/auth/legal";
import styles from "../legal/legal.module.css";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — 선배",
  description: "선배가 개인정보를 수집·이용·보관하고 보호하는 방법을 안내합니다.",
};

const sections = [
  ["purpose", "1. 처리 목적·항목·보유 기간"],
  ["consent", "2. 수집·이용 동의"],
  ["sharing", "3. 제3자 제공"],
  ["processors", "4. 처리위탁 및 국외 이전"],
  ["destruction", "5. 파기"],
  ["rights", "6. 정보주체의 권리"],
  ["cookies", "7. 쿠키와 자동 수집"],
  ["security", "8. 안전성 확보조치"],
  ["children", "9. 만 14세 미만 이용자"],
  ["contact", "10. 보호 담당 및 권리구제"],
  ["changes", "11. 방침 변경"],
];

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <LegalHeader />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>PRIVACY POLICY · {PRIVACY_POLICY_VERSION}</p>
        <h1>개인정보 처리방침</h1>
        <p>
          선배는 필요한 정보만 수집하고, 계정·수업·상담 제공에 필요한 범위에서
          사용합니다. 이 방침은 회원과 방문자가 자신의 정보가 어떻게 처리되는지
          쉽게 확인할 수 있도록 작성했습니다.
        </p>
      </header>

      <div className={styles.content}>
        <nav className={styles.toc} aria-label="개인정보 처리방침 목차">
          <b>목차</b>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          <a href="#english">English version</a>
        </nav>

        <article className={styles.document}>
          <p className={styles.notice}>
            시행일: 2026년 7월 30일 · 처리자: 선배(Seonbae) · 문의:{" "}
            <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
          </p>

          <section id="purpose">
            <h2>1. 개인정보의 처리 목적, 항목 및 보유 기간</h2>
            <p>
              선배는 아래 목적에 필요한 최소한의 개인정보를 처리합니다. 비밀번호
              원문은 선배의 프로필 데이터베이스에 저장하지 않으며, 인증 제공자인
              Supabase Auth가 솔트가 적용된 해시 형태로 관리합니다.
            </p>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>구분</th><th>처리 항목</th><th>목적</th><th>보유 기간</th></tr></thead>
                <tbody>
                  <tr><td>회원가입·계정</td><td>이름, 이메일, 휴대전화번호, 계정 유형(학생·보호자·튜터), 비밀번호 해시 또는 Google 인증 식별정보, 이메일 인증 상태, 가입·동의 일시와 정책 버전</td><td>회원 식별, 이메일 또는 Google 로그인, 역할별 포털 제공, 등록 이메일을 통한 안전한 계정 복구, 비밀번호 재설정, 부정 이용 방지</td><td>회원 탈퇴 또는 계정 삭제 완료 시까지. 법령상 보존 의무가 있으면 해당 기간까지</td></tr>
                  <tr><td>학습 포털·온라인 수업·상담</td><td>회원 역할(학생·보호자·튜터), 가족 계정 연결, 수업·상담 일정, 과목, 담당 튜터, 전달 사항, Zoom 회의 번호·상태, 참가자 이름·이메일·입퇴장 시각, 실제 진행 시간과 완료 횟수</td><td>역할별 포털 제공, 수업·보호자 상담 운영, 본인과 권한 확인, 일정 안내, 출결·이용 현황·장애 대응</td><td>서비스 이용 기간 및 수업·상담 관계 종료 후 1년. 분쟁이 진행 중이면 해결 시까지</td></tr>
                  <tr><td>학생–튜터 채팅</td><td>발신자, 수신 대화방, 메시지 내용, 발송·열람 시각</td><td>수업 준비와 학습 관련 의사소통, 분쟁·오남용 대응</td><td>수업 관계 종료 후 1년. 분쟁이 진행 중이면 해결 시까지</td></tr>
                  <tr><td>상담·문의</td><td>문의자가 제공한 이름, 이메일 또는 메신저 계정, 커리큘럼·과목, 목표와 상담 내용</td><td>상담 응대, 튜터 매칭, 민원 처리</td><td>상담 종료 후 1년. 계약으로 이어지는 경우 계약 관계 및 법정 보존기간까지</td></tr>
                  <tr><td>자동 생성 정보</td><td>필수 인증 쿠키, 접속 시각, IP 주소 또는 단방향 해시 식별값, 브라우저·기기 정보, 오류·보안 로그</td><td>로그인 유지, 인증 요청 횟수 제한, 서비스 보안, 장애 대응</td><td>요청 제한용 해시 식별값은 마지막 요청 후 2일 이내, 인증 쿠키는 세션 또는 로그인 유지기간까지. 보안 로그는 원칙적으로 90일 이내 또는 제공자 설정·법령상 기간까지</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령이 적용되는
              거래가 발생하면 계약·결제 기록은 5년, 소비자 불만·분쟁 처리 기록은
              3년, 표시·광고 기록은 6개월간 보존될 수 있습니다.
            </p>
          </section>

          <section id="consent">
            <h2>2. 개인정보 수집·이용 동의</h2>
            <p>
              회원가입 시 이름, 이메일, 휴대전화번호, 인증·동의 기록의 수집 목적,
              항목, 보유 기간과 동의 거부권을 별도로 안내하고 명시적인 동의를
              받습니다. 필수 정보의 수집을 거부할 수 있으나, 계정 식별과 복구에
              필요한 정보이므로 회원가입이 제한될 수 있습니다.
            </p>
            <p>
              마케팅 수신 동의는 현재 받지 않으며, 향후 도입하는 경우 서비스 이용에
              필요한 동의와 분리해 선택 사항으로 받습니다.
            </p>
          </section>

          <section id="sharing">
            <h2>3. 개인정보의 제3자 제공</h2>
            <p>
              선배는 개인정보를 판매하지 않으며, 원칙적으로 제3자에게 제공하지
              않습니다. 정보주체가 사전에 동의했거나 법령에 특별한 규정이 있는 경우,
              또는 급박한 생명·신체·재산의 이익을 보호하기 위해 필요한 경우에만
              관계 법령에 따라 제공할 수 있습니다.
            </p>
          </section>

          <section id="processors">
            <h2>4. 개인정보 처리위탁 및 국외 이전</h2>
            <p>
              선배는 계약의 체결·이행과 안정적인 서비스 제공을 위해 아래 업체에
              처리를 위탁합니다. 국외 이전은 암호화된 네트워크를 통해 서비스 이용
              시점에 이루어지며, 개인정보 보호법 제28조의8 제1항 제3호에 따라 아래
              사항을 공개합니다.
            </p>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>수탁자·이전받는 자</th><th>국가</th><th>항목·목적</th><th>시기·방법</th><th>보유 기간</th></tr></thead>
                <tbody>
                  <tr><td>Supabase, Inc. 및 공개된 하위처리자</td><td>인도(뭄바이, ap-south-1) 및 지원·하위처리를 위한 미국·싱가포르 등</td><td>계정·프로필·수업 정보, 인증 쿠키와 로그 / 데이터베이스, 인증, 보안 운영</td><td>가입·로그인·포털 이용 시 TLS 암호화 전송</td><td>계정 삭제 또는 위탁계약 종료 시까지. 백업은 제공자 정책에 따른 제한 기간 후 삭제</td></tr>
                  <tr><td>Vercel Inc. 및 하위처리자</td><td>미국 및 글로벌 엣지 인프라 소재국</td><td>IP, 요청 정보, 오류·보안 로그 / 웹 호스팅, 전송, 장애 대응</td><td>웹사이트 접속 시 TLS 암호화 전송</td><td>서비스 운영 및 보안에 필요한 기간 또는 위탁계약 종료 시까지</td></tr>
                  <tr><td>Google LLC</td><td>미국 및 Google이 서버를 운영하는 국가</td><td>Google 계정 이름·이메일·인증 식별정보, 인증·재설정 메일 내용과 전송 기록 / Google 계정 인증, SMTP 메일 전송, 웹폰트 제공</td><td>Google 가입·로그인, 인증 메일 발송 또는 폰트 요청 시 암호화 전송</td><td>계정 삭제, Google 연결 해제 또는 서비스 제공자 정책에 따른 기간</td></tr>
                  <tr><td>Zoom Communications, Inc. 및 공개된 하위처리자</td><td>미국 및 Zoom이 서비스를 운영하는 국가</td><td>표시 이름, 회의 번호·상태, 참가자 식별값, 이메일, 입퇴장 시각, 카메라·마이크로 전달되는 음성·영상 / 웹 기반 온라인 수업, 회의 보안, 출결·장애 대응</td><td>이용자가 포털에서 Zoom 수업에 입장하거나 회의 이벤트가 발생할 때 암호화 전송</td><td>음성·영상은 기본적으로 선배가 녹화·저장하지 않습니다. 회의·출결 정보는 수업 관계 종료 후 1년 또는 Zoom의 계약·법정 보존기간까지</td></tr>
                  <tr><td>jsDelivr 운영자 및 CDN 제공자</td><td>글로벌 CDN 노드 소재국</td><td>IP, 브라우저 요청 정보 / Pretendard 웹폰트 제공</td><td>페이지 접속 시 암호화 전송</td><td>CDN 보안·운영 정책에 따른 제한 기간</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              이용자는 국외 이전을 거부할 수 있습니다. 다만 인증·호스팅은 서비스
              제공에 필수적이므로 거부 시 계정 및 포털 이용이 어려울 수 있습니다.
              거부나 관련 문의는 개인정보 보호 담당 연락처로 요청해 주세요.
            </p>
            <p>
              Zoom 수업에서는 브라우저가 카메라와 마이크 사용 권한을 요청할 수
              있으며, 이용자가 허용한 경우에만 작동합니다. 선배는 수업을 기본
              설정상 녹화하지 않습니다. 녹화가 필요한 경우 시작 전에 목적과
              보유기간을 별도로 알리고 필요한 동의를 받습니다.
            </p>
          </section>

          <section id="destruction">
            <h2>5. 개인정보의 파기 절차 및 방법</h2>
            <p>
              보유 기간이 끝나거나 처리 목적이 달성되면 복구·재생이 어렵도록
              지체 없이 파기합니다. 전자 파일은 논리 삭제 후 백업 보존 주기가
              끝나면 영구 삭제하고, 출력물이 있는 경우 분쇄 또는 소각합니다.
              법령에 따라 분리 보관하는 정보는 해당 목적 외로 이용하지 않습니다.
            </p>
          </section>

          <section id="rights">
            <h2>6. 정보주체와 법정대리인의 권리</h2>
            <p>
              본인 또는 적법한 법정대리인은 개인정보의 열람, 정정·삭제, 처리정지,
              동의 철회와 계정 삭제를 요청할 수 있습니다. 일반 회원은 마이페이지
              설정에서 본인 인증 후 계정을 직접 삭제할 수 있고, 이메일로 요청하면
              본인 확인 후 지체 없이 처리하고 결과를 안내합니다. 법령상 보존 의무가
              있는 정보는 삭제 요청이 제한될 수 있으며 그 사유를 알려드립니다.
            </p>
          </section>

          <section id="cookies">
            <h2>7. 쿠키 및 자동 수집 장치</h2>
            <p>
              선배는 로그인 세션과 “로그인 상태 유지” 기능에 필요한 필수 쿠키를
              사용합니다. 현재 광고 추적 또는 행동 맞춤형 마케팅 쿠키를 사용하지
              않습니다. 브라우저 설정에서 쿠키를 차단할 수 있으나 로그인과 포털
              기능이 정상 작동하지 않을 수 있습니다.
            </p>
          </section>

          <section id="security">
            <h2>8. 개인정보의 안전성 확보조치</h2>
            <ul>
              <li>비밀번호 해시 처리와 TLS 암호화 전송</li>
              <li>역할 기반 접근통제 및 데이터베이스 행 단위 보안 정책</li>
              <li>관리자 권한과 개인정보 접근 범위의 최소화</li>
              <li>인증·보안 로그 점검, 백업 및 취약점 대응</li>
              <li>수탁자 보호조치와 서비스 설정의 정기적인 검토</li>
            </ul>
          </section>

          <section id="children">
            <h2>9. 만 14세 미만 이용자</h2>
            <p>
              만 14세 미만 학생을 위한 계정은 법정대리인이 직접 생성하고 관리해야
              합니다. 선배가 만 14세 미만 아동의 개인정보를 별도로 수집해야 하는
              경우 법정대리인에게 필요한 사항을 알리고 확인 가능한 방법으로 동의를
              받은 뒤 처리합니다.
            </p>
          </section>

          <section id="contact">
            <h2>10. 개인정보 보호 담당 및 권리구제</h2>
            <p>
              개인정보 보호 담당부서: 선배 운영팀<br />
              이메일: <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
            </p>
            <p>
              개인정보 침해에 대한 상담이나 신고가 필요한 경우 개인정보침해신고센터
              (국번 없이 118), 개인정보분쟁조정위원회(1833-6972) 등 관계 기관에
              문의할 수 있습니다.
            </p>
          </section>

          <section id="changes">
            <h2>11. 처리방침의 변경</h2>
            <p>
              이 방침을 변경하면 시행일 최소 7일 전에 웹사이트에 공지합니다.
              이용자 권리에 중대한 불리한 변경은 최소 30일 전에 알리고 필요한 경우
              다시 동의를 받습니다. 이전 버전과 변경 이력은 요청 시 제공합니다.
            </p>
          </section>

          <div className={styles.english} id="english">
            <span className={styles.englishBadge}>ENGLISH VERSION</span>
            <section>
              <h2>Privacy Policy</h2>
              <p>
                Effective July 30, 2026. Seonbae processes only the personal
                data needed to create accounts, operate the learning portal,
                support account recovery, arrange lessons, and answer
                enquiries. Contact:{" "}
                <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>.
              </p>
              <h3>Data we process</h3>
              <p>
                Account data includes name, email, mobile number, account role,
                a password hash or Google authentication identifier,
                email-verification status, and consent records. Portal data may
                include lesson schedules, subjects, tutors, delivery method,
                location, notes, Zoom meeting status, participant identifiers,
                display name, email, and join and leave times. Essential cookies, IP address, device and
                hashed network identifiers used for request throttling, and
                security logs may be generated automatically. Raw passwords are
                not stored in Seonbae’s profile database.
              </p>
              <h3>Purposes and retention</h3>
              <p>
                We use data for authentication, account and portal delivery,
                secure email-based ID recovery and password reset, lesson
                administration, security, and customer support. Account data is retained until
                account deletion, subject to legal retention duties. Lesson
                data is normally retained for the service period and one year
                afterward; security logs are normally retained for no more than
                90 days unless provider settings or law require otherwise.
              </p>
              <h3>Sharing, processors and overseas transfers</h3>
              <p>
                We do not sell personal data and do not ordinarily disclose it
                to third parties. Supabase provides authentication and database
                services; Vercel provides hosting; Google provides social
                authentication, SMTP email and web fonts; jsDelivr provides a
                font CDN. Data may be
                processed in India (Mumbai, ap-south-1), the United States,
                Singapore, and countries where these providers operate
                infrastructure. Transfers occur through encrypted connections
                when the relevant service is used and continue only for the
                service or legally required retention period.
              </p>
              <p>
                Zoom provides the embedded online classroom and may process
                display names, meeting and participant identifiers, email,
                attendance events, and audio or video that a participant chooses
                to transmit. Camera and microphone access is controlled by the
                browser. Seonbae disables cloud and local recording by default;
                any recording requires advance notice and any consent required
                by law.
              </p>
              <h3>Your rights, cookies and children</h3>
              <p>
                You may request access, correction, deletion, restriction, or
                withdrawal of consent by email. Standard members may also delete
                their account directly from My Page after re-authentication. We
                use essential authentication cookies, not advertising cookies.
                An account for a child under 14 must be created and managed by a
                legal guardian; any separate collection from a child requires
                verifiable guardian consent.
              </p>
              <h3>Security and updates</h3>
              <p>
                We use encrypted transport, password hashing, role-based access,
                row-level database controls, limited administrator access, and
                security logging. Materially adverse changes will be announced
                in advance and renewed consent will be obtained when required.
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
      <nav><Link href="/terms">이용약관</Link><Link href="/">홈으로 ↗</Link></nav>
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
