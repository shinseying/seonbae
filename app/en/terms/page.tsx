import Link from "next/link";
import { TERMS_VERSION } from "../../../utils/auth/legal";
import styles from "../../legal/legal.module.css";
import { legalMetadata } from "../../legal/metadata";

export const metadata = legalMetadata({
  title: "Terms of Service | Seonbae",
  description: "Terms for the Seonbae website, accounts, learning portal, and tutor matching services.",
  canonical: "/en/terms",
  koPath: "/terms",
  enPath: "/en/terms",
  locale: "en",
});

const sections = [
  ["scope", "1. Purpose and scope"],
  ["service", "2. Services"],
  ["account", "3. Accounts and security"],
  ["children", "4. Minors"],
  ["lessons", "5. Consultations, matching, and lessons"],
  ["conduct", "6. User obligations"],
  ["ip", "7. Intellectual property"],
  ["availability", "8. Changes, suspension, and termination"],
  ["liability", "9. Liability and disputes"],
  ["changes", "10. Changes to these terms"],
];

export default function EnglishTermsPage() {
  return (
    <main className={styles.page} lang="en">
      <LegalHeader />
      <header className={styles.hero}>
        <p className={styles.eyebrow}>TERMS OF SERVICE · {TERMS_VERSION}</p>
        <h1>Terms of Service</h1>
        <p>
          These terms set the basic rules between Seonbae and users of the
          website, member accounts, learning portal, consultations, and tutor
          matching services.
        </p>
      </header>

      <div className={styles.content}>
        <nav className={styles.toc} aria-label="Terms of Service contents">
          <b>Contents</b>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <article className={styles.document}>
          <p className={styles.notice}>
            Effective September 7, 2026 · Service provider: Seonbae · Contact: {" "}
            <a href="mailto:admissions@seonbaetutor.com">admissions@seonbaetutor.com</a>
          </p>

          <section id="scope">
            <h2>1. Purpose and scope</h2>
            <p>
              These terms apply to Seonbae&apos;s public website, member accounts,
              learning portal, consultations, tutor discovery and matching, and
              related services. Separately confirmed terms for a lesson&apos;s subject,
              schedule, frequency, fees, cancellation, and refund take priority
              for that engagement.
            </p>
          </section>

          <section id="service">
            <h2>2. Services</h2>
            <ul>
              <li>A registry of verified tutors and educational information</li>
              <li>Consultations and tutor matching based on a student&apos;s subject and goals</li>
              <li>A member portal for lesson schedules, tutors, and notices</li>
              <li>Online lessons through Zoom within the portal</li>
              <li>Student and tutor lesson chat and private parent consultations with the founding team</li>
              <li>Lesson operations, enquiry handling, and related support</li>
            </ul>
            <p>
              Seonbae takes reasonable steps to verify displayed academic and score
              information, but does not guarantee a particular score, improvement,
              admission, or educational outcome.
            </p>
          </section>

          <section id="account">
            <h2>3. Accounts and security</h2>
            <p>
              You must provide accurate, current information and must not register
              using another person&apos;s information. Email sign up requires email
              verification, and Google sign up requires Google account authentication.
              A password must contain at least 12 characters, including lowercase and
              uppercase letters, a number, and an allowed symbol.
            </p>
            <p>
              You are responsible for protecting your account and credentials. If you
              suspect unauthorized use, change the password and notify Seonbae promptly.
              ID recovery and password reset use a secure link sent to the registered
              email after submitted account information matches. The screen does not
              disclose whether an account exists or reveal an email address.
            </p>
          </section>

          <section id="children">
            <h2>4. Minors</h2>
            <p>
              An account for a student under 14 must be created and managed by a legal
              guardian. A paid lesson contract for a minor may require guardian consent.
              Guardians must help keep the student&apos;s account and lesson information
              accurate and secure.
            </p>
          </section>

          <section id="lessons">
            <h2>5. Consultations, matching, and lessons</h2>
            <p>
              Consultations and recommendations use the goals, level, and schedule
              supplied by the user and the tutor&apos;s expertise and availability. The
              final tutor, format, schedule, and fees are confirmed separately.
              Schedule changes, absences, cancellations, and refunds follow the
              individual contract or confirmed notice.
            </p>
            <p>
              Users must provide information needed to conduct lessons and respect
              the safety and rights of tutors and other users. Lesson materials and
              feedback may be used only for the relevant student&apos;s learning.
            </p>
            <p>
              Online lessons are provided through Zoom Meeting SDK. Users choose
              browser camera and microphone permissions and must not share account or
              meeting access. Seonbae records online lessons by default for review and
              a safe learning environment. Students and guardians are informed of the
              purpose, use, and retention period before the first lesson, and we obtain
              any consent required by law. Recordings remain for one year after the
              lesson relationship ends and are used only for the stated review, quality,
              safety, and dispute handling purposes. Zoom outages or user network and
              device problems can interrupt a connection. Where possible, Seonbae will
              help reschedule or provide another way to connect.
            </p>
          </section>

          <section id="conduct">
            <h2>6. User obligations</h2>
            <ul>
              <li>Do not use, share, sell, or impersonate another person&apos;s account</li>
              <li>Do not attempt unauthorized access to services, databases, or accounts</li>
              <li>Do not harass, discriminate against, threaten, or harm tutors or students</li>
              <li>Do not reproduce, distribute, or commercially use materials, the registry, or software without permission</li>
              <li>Do not submit false information, send automated bulk requests, or disrupt the service</li>
            </ul>
            <p>
              We may restrict use or terminate an account after notice when a breach
              is confirmed. We may act first and notify afterward where an urgent
              security risk, unlawful conduct, or likely harm to another person exists.
            </p>
          </section>

          <section id="ip">
            <h2>7. Intellectual property</h2>
            <p>
              Rights in the website design, marks, database arrangement, educational
              content, and materials belong to Seonbae or their lawful owners. Users
              may use supplied materials only for personal learning and may not resell,
              publicly distribute, create derivative works, or use them as artificial
              intelligence training data without separate permission.
            </p>
          </section>

          <section id="availability">
            <h2>8. Changes, suspension, and termination</h2>
            <p>
              We may change or temporarily suspend part of the service for quality,
              security, maintenance, legal compliance, or events beyond reasonable
              control. We give advance notice of a significant foreseeable interruption.
              Standard members may delete an account from My Page or request deletion
              at any time. Information not subject to legal retention is deleted under
              the Privacy Policy.
            </p>
          </section>

          <section id="liability">
            <h2>9. Liability and disputes</h2>
            <p>
              Seonbae is responsible under applicable law for harm caused intentionally
              or negligently. Liability may be limited for harm caused by the user, a
              third party service outage, natural disaster, or another event outside
              reasonable control. These terms do not limit consumer rights that law
              does not permit us to exclude.
            </p>
            <p>
              Korean law governs these terms. We first try to resolve disputes through
              good faith discussion. Unresolved disputes are handled by the court with
              jurisdiction under applicable Korean civil procedure.
            </p>
          </section>

          <section id="changes">
            <h2>10. Changes to these terms</h2>
            <p>
              We announce the effective date and reason for a change at least seven
              days in advance. A material adverse change is announced at least 30 days
              in advance, and separate consent is obtained where required by law.
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
      <nav><Link href="/en/privacy">Privacy Policy</Link><Link href="/terms">KO</Link><Link href="/en/">Home ↗</Link></nav>
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
