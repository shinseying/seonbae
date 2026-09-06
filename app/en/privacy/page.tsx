import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "../../../utils/auth/legal";
import styles from "../../legal/legal.module.css";
import { legalMetadata } from "../../legal/metadata";

export const metadata = legalMetadata({
  title: "Privacy Policy | Seonbae",
  description: "How Seonbae collects, uses, retains, and protects personal information.",
  canonical: "/en/privacy",
  koPath: "/privacy",
  enPath: "/en/privacy",
  locale: "en",
});

const sections = [
  ["purpose", "1. Purposes, data, and retention"],
  ["consent", "2. Consent"],
  ["sharing", "3. Third party disclosure"],
  ["processors", "4. Processors and overseas transfers"],
  ["destruction", "5. Deletion"],
  ["rights", "6. Your rights"],
  ["cookies", "7. Cookies and automatic collection"],
  ["security", "8. Security measures"],
  ["children", "9. Children under 14"],
  ["contact", "10. Privacy contact and remedies"],
  ["changes", "11. Policy changes"],
];

export default function EnglishPrivacyPage() {
  return (
    <main className={styles.page} lang="en">
      <LegalHeader />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>PRIVACY POLICY · {PRIVACY_POLICY_VERSION}</p>
        <h1>Privacy Policy</h1>
        <p>
          Seonbae collects only the information needed to provide accounts,
          lessons, and consultations. This policy explains in plain language
          how we use and protect information belonging to members and visitors.
        </p>
      </header>

      <div className={styles.content}>
        <nav className={styles.toc} aria-label="Privacy Policy contents">
          <b>Contents</b>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <article className={styles.document}>
          <p className={styles.notice}>
            Effective September 7, 2026 · Controller: Seonbae · Contact: {" "}
            <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
          </p>

          <section id="purpose">
            <h2>1. Purposes, data, and retention</h2>
            <p>
              Seonbae processes the minimum personal information needed for the
              purposes below. Raw passwords are not stored in Seonbae&apos;s profile
              database. Supabase Auth manages salted password hashes.
            </p>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Area</th><th>Information</th><th>Purpose</th><th>Retention</th></tr></thead>
                <tbody>
                  <tr><td>Membership and account</td><td>Name, email, mobile number, account type, password hash or Google authentication identifier, verification status, consent time, and policy version</td><td>Identification, authentication, role based portal access, secure account recovery, password reset, and misuse prevention</td><td>Until membership withdrawal or account deletion, unless law requires longer retention</td></tr>
                  <tr><td>Portal, lessons, and consultations</td><td>Member role, linked family accounts, schedules, subjects, tutor, notes, Zoom meeting identifiers and status, participant name and email, join and leave times, session duration, completion count, and lesson recordings</td><td>Portal and consultation delivery, authorization, scheduling, review, lesson quality and safety, attendance, usage records, technical support, and dispute handling</td><td>For the service period and one year after the lesson or consultation relationship ends, or until an active dispute is resolved</td></tr>
                  <tr><td>Student and tutor chat</td><td>Sender, conversation, message, sent time, and read time</td><td>Lesson preparation, learning communication, and handling disputes or misuse</td><td>One year after the lesson relationship ends, or until an active dispute is resolved</td></tr>
                  <tr><td>Enquiries</td><td>Name, email or messenger account, curriculum, subject, goals, and enquiry details supplied by the sender</td><td>Answering enquiries, tutor matching, and complaint handling</td><td>One year after the enquiry ends, or through the contract and applicable statutory retention period if it leads to a contract</td></tr>
                  <tr><td>Automatically generated data</td><td>Essential authentication cookies, access time, IP address or one way hashed identifier, browser and device data, error logs, and security logs</td><td>Session continuity, request limits, security, and incident response</td><td>Rate limit hashes within two days of the final request, cookies through the session or persistent login period, and security logs normally within 90 days unless provider settings or law require longer</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              Where Korean consumer protection law applies, contract and payment
              records may be retained for five years, complaint and dispute records
              for three years, and display or advertising records for six months.
            </p>
          </section>

          <section id="consent">
            <h2>2. Consent</h2>
            <p>
              At sign up we separately explain the purpose, information, retention
              period, and right to refuse before obtaining express consent for the
              name, email, mobile number, and verification and consent records.
              You may refuse, but account creation can be unavailable because this
              information is required for identification and recovery.
            </p>
            <p>We do not currently request marketing consent. Any future marketing consent will be separate and optional.</p>
          </section>

          <section id="sharing">
            <h2>3. Third party disclosure</h2>
            <p>
              We do not sell personal information and do not ordinarily disclose
              it to third parties. We may disclose it with prior consent, where
              law specifically permits or requires disclosure, or where necessary
              to protect urgent life, bodily, or property interests under law.
            </p>
          </section>

          <section id="processors">
            <h2>4. Processors and overseas transfers</h2>
            <p>
              We use service providers to perform contracts and operate the service
              securely. Transfers occur through encrypted connections when the
              relevant service is used.
            </p>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Provider</th><th>Location</th><th>Information and purpose</th><th>Timing and method</th><th>Retention</th></tr></thead>
                <tbody>
                  <tr><td>Supabase, Inc. and disclosed subprocessors</td><td>India, Mumbai region, and the United States, Singapore, or other support locations</td><td>Account, profile, lesson data, authentication cookies, and logs for database, authentication, and security operations</td><td>Encrypted transfer during sign up, login, and portal use</td><td>Until account deletion or the processing contract ends, with backups removed on the provider&apos;s limited schedule</td></tr>
                  <tr><td>Vercel Inc. and subprocessors</td><td>United States and countries containing global edge infrastructure</td><td>IP address, request data, error logs, and security logs for hosting, delivery, and incident response</td><td>Encrypted transfer when the website is accessed</td><td>As needed for service operation and security, or until the processing contract ends</td></tr>
                  <tr><td>Google LLC</td><td>United States and countries where Google operates servers</td><td>Google account name, email, authentication identifier, authentication and reset email content, and delivery records for Google authentication, SMTP email, and web fonts</td><td>Encrypted transfer during Google authentication, email delivery, or a font request</td><td>Until account deletion, disconnection, or the provider&apos;s applicable retention period</td></tr>
                  <tr><td>Zoom Communications, Inc. and disclosed subprocessors</td><td>United States and countries where Zoom operates services</td><td>Display name, meeting and participant identifiers, email, attendance times, transmitted audio and video, and lesson recordings for online lessons, review, meeting security, lesson quality and safety, attendance, support, and dispute handling</td><td>Encrypted transfer when a user enters a Zoom lesson or a meeting event occurs</td><td>Lesson recordings, meeting details, and attendance information remain for one year after lessons end, or for Zoom&apos;s contractual or statutory period. An active dispute may extend retention until it is resolved</td></tr>
                  <tr><td>jsDelivr operators and CDN providers</td><td>Countries containing global CDN nodes</td><td>IP address and browser request data for Pretendard web font delivery</td><td>Encrypted transfer when a page loads</td><td>The limited period set by CDN security and operation policies</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              You may object to an overseas transfer, but authentication and hosting
              are necessary to provide accounts and the portal. Contact our privacy
              team to object or ask a question.
            </p>
            <p>
              The browser may request camera and microphone permission for a Zoom
              lesson, and these devices work only when the user allows access.
              Seonbae records online lessons by default for review and a safe learning
              environment. Students and guardians are informed of the purpose, use,
              and retention period before the first lesson, and we obtain any consent
              required by law. Recordings are retained for one year after the lesson
              relationship ends, or until an active dispute is resolved.
            </p>
          </section>

          <section id="destruction">
            <h2>5. Deletion</h2>
            <p>
              When a purpose is fulfilled or retention expires, we delete data
              promptly in a way that makes restoration impracticable. Electronic
              data is logically deleted and permanently removed after the backup
              cycle. Paper records, if any, are shredded or incinerated.
            </p>
          </section>

          <section id="rights">
            <h2>6. Your rights</h2>
            <p>
              You or a lawful representative may request access, correction,
              deletion, restriction, withdrawal of consent, or account deletion.
              Standard members can delete an account from My Page after confirming
              their identity, or may email us. Statutory retention can limit a
              deletion request, in which case we explain why.
            </p>
          </section>

          <section id="cookies">
            <h2>7. Cookies and automatic collection</h2>
            <p>
              We use essential cookies for sessions and the stay signed in feature.
              We do not currently use advertising or behavioral marketing cookies.
              Blocking cookies can prevent login and portal functions from working.
            </p>
          </section>

          <section id="security">
            <h2>8. Security measures</h2>
            <ul>
              <li>Password hashing and encrypted transport</li>
              <li>Role based access control and database row level security</li>
              <li>Minimal administrator privileges and access scope</li>
              <li>Authentication and security log review, backups, and vulnerability response</li>
              <li>Regular review of processor safeguards and service settings</li>
            </ul>
          </section>

          <section id="children">
            <h2>9. Children under 14</h2>
            <p>
              An account for a student under 14 must be created and managed by a
              legal guardian. If we need to collect information directly from a
              child under 14, we notify the guardian and obtain verifiable consent.
            </p>
          </section>

          <section id="contact">
            <h2>10. Privacy contact and remedies</h2>
            <p>
              Privacy team: Seonbae Operations<br />
              Email: <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
            </p>
            <p>
              For privacy complaints in Korea, you may also contact the Personal
              Information Infringement Report Center at 118 or the Personal
              Information Dispute Mediation Committee at 1833 6972.
            </p>
          </section>

          <section id="changes">
            <h2>11. Policy changes</h2>
            <p>
              We announce changes at least seven days before they take effect.
              Materially adverse changes are announced at least 30 days in advance,
              and renewed consent is obtained where required.
            </p>
          </section>
        </article>
      </div>
      <LegalFooter />
    </main>
  );
}

function LegalHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/en/">
        <img src="/logo.png" alt="" width="40" height="40" />
        <strong>Seonbae</strong><span>EST. 2026</span>
      </Link>
      <nav><Link href="/en/terms">Terms</Link><Link href="/privacy">KO</Link><Link href="/en/">Home ↗</Link></nav>
    </header>
  );
}

function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <span>© 2026 Seonbae · Seoul, South Korea</span>
      <div><Link href="/en/privacy">Privacy Policy</Link><Link href="/en/terms">Terms</Link></div>
    </footer>
  );
}
