"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPasswordChecks,
  getPasswordPolicyError,
  PASSWORD_ALLOWED_SYMBOLS,
} from "../../utils/auth/password";
import { normalizePhone, sanitizePhoneInput } from "../../utils/auth/phone";
import { isEmailAddress } from "../../utils/auth/school-email";
import {
  setSeonbaeLocale,
  useSeonbaeLocale,
  type SeonbaeLocale,
} from "../../utils/i18n/client";
import styles from "./login.module.css";

type AuthAction = "signin" | "signup" | "find-id" | "reset-password";

const actionCopy: Record<
  AuthAction,
  { title: string; description: string; submit: string }
> = {
  signin: {
    title: "로그인",
    description: "등록된 계정으로 선배 포털에 접속합니다.",
    submit: "로그인",
  },
  signup: {
    title: "회원가입",
    description: "",
    submit: "회원가입",
  },
  "find-id": {
    title: "아이디 찾기",
    description: "가입 정보가 일치하면 등록된 이메일로 안전한 계정 접속 링크를 보내드립니다.",
    submit: "계정 접속 메일 받기",
  },
  "reset-password": {
    title: "비밀번호 재설정",
    description: "가입 정보가 일치하면 이메일로 안전한 재설정 링크를 보내드립니다.",
    submit: "재설정 메일 받기",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const locale = useSeonbaeLocale();
  const [action, setAction] = useState<AuthAction>("signin");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accountRole, setAccountRole] = useState<"student" | "parent">("student");
  const [remember, setRemember] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const allRequiredAgreed = privacyAgreed && termsAgreed && ageConfirmed;

  useEffect(() => {
    try {
      setRemember(window.localStorage.getItem("seonbae-remember-login") === "1");
    } catch {
      setRemember(false);
    }
  }, []);

  function changeLocale(nextLocale: SeonbaeLocale) {
    setSeonbaeLocale(nextLocale);
  }

  const l = (ko: string, en: string) => locale === "ko" ? ko : en;
  const localizeApiMessage = (value: unknown, fallbackKo: string, fallbackEn: string) => {
    if (typeof value !== "string" || !value.trim()) return l(fallbackKo, fallbackEn);
    if (locale === "ko" || !/[가-힣]/.test(value)) return value;
    return fallbackEn;
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => response.ok ? response.json() : { authenticated: false })
      .then((session) => {
        if (cancelled) return;
        if (session.authenticated) {
          setRedirecting(true);
          router.replace(session.destination || "/portal");
          router.refresh();
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedAction = params.get("mode");
    const requestedRole = params.get("role");
    if (requestedAction === "signup") setAction("signup");
    if (requestedRole === "tutor") {
      // Tutor accounts are created by an admin after review, so a tutor link
      // belongs on the application page rather than the sign-up form.
      window.location.replace("/tutor-apply");
      return;
    }
    if (requestedRole === "student" || requestedRole === "parent") {
      setAccountRole(requestedRole);
    }
    const requestedName = params.get("name");
    const requestedEmail = params.get("email");
    const authError = params.get("error");
    if (requestedName) setFullName(requestedName.slice(0, 80));
    if (requestedEmail) setIdentifier(requestedEmail.slice(0, 254));
    if (authError === "google-account-not-found") {
      setMessage(l(
        "등록된 계정과 일치하는 Google 이메일이 없습니다. 먼저 이메일로 회원가입해 주세요.",
        "That Google email is not registered. Create an account with email first.",
      ));
    } else if (authError === "google-check-expired") {
      setMessage(l(
        "Google 로그인 시간이 만료되었습니다. 다시 시도해 주세요.",
        "Your Google sign-in attempt expired. Please try again.",
      ));
    } else if (authError === "google-check-unavailable") {
      setMessage(l(
        "Google 계정 등록 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        "We could not verify that Google account. Please try again shortly.",
      ));
    } else if (authError === "verification-email-unavailable") {
      setMessage(l(
        "로그인 인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
        "We could not send the login verification email. Please try again shortly.",
      ));
    }
  }, []);

  function updateRemember(checked: boolean) {
    setRemember(checked);
    try {
      window.localStorage.setItem("seonbae-remember-login", checked ? "1" : "0");
    } catch {
      // Login still works when browser storage is unavailable.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    if (action === "signup") {
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) {
        setMessage(locale === "ko" ? passwordError : "Use at least 12 characters with upper and lowercase letters, a number, and an allowed special character.");
        setBusy(false);
        return;
      }
      if (password !== confirmPassword) {
        setMessage(l("비밀번호가 서로 일치하지 않습니다.", "The passwords do not match."));
        setBusy(false);
        return;
      }
      if (!isEmailAddress(identifier)) {
        setMessage(l("올바른 이메일 주소를 입력해 주세요.", "Enter a valid email address."));
        setBusy(false);
        return;
      }
      if (!normalizePhone(phone)) {
        setMessage(l("휴대전화번호를 올바르게 입력해 주세요. 해외 번호는 국가번호를 포함해 주세요.", "Enter a valid mobile number, including the country code when outside Korea."));
        setBusy(false);
        return;
      }
      if (!privacyAgreed || !termsAgreed || !ageConfirmed) {
        setMessage(l("회원가입에 필요한 필수 항목을 모두 확인하고 동의해 주세요.", "Review and accept all required agreements to sign up."));
        setBusy(false);
        return;
      }
    }

    const endpoint =
      action === "signup"
        ? "/api/auth/signup"
        : action === "signin"
          ? "/api/auth/login"
          : "/api/auth/recovery";
    const body = action === "signin"
      ? { identifier, password, remember }
      : {
          action,
          fullName,
          phone,
          ...(action === "reset-password" ? { email: identifier } : {}),
        };

    try {
      const signupForm = new FormData();
      if (action === "signup") {
        signupForm.set("fullName", fullName);
        signupForm.set("email", identifier);
        signupForm.set("phone", phone);
        signupForm.set("password", password);
        signupForm.set("accountRole", accountRole);
        signupForm.set("privacyAgreed", String(privacyAgreed));
        signupForm.set("termsAgreed", String(termsAgreed));
        signupForm.set("ageConfirmed", String(ageConfirmed));
      }
      const response = await fetch(endpoint, action === "signup"
        ? { method: "POST", body: signupForm }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const result = await response.json();

      if (!response.ok) {
        setMessage(localizeApiMessage(result.error, "입력한 정보를 다시 확인해 주세요.", "Check the information you entered and try again."));
        setBusy(false);
        return;
      }

      if (result.destination) {
        setRedirecting(true);
        router.replace(result.destination);
        router.refresh();
        return;
      }

      setMessage(localizeApiMessage(result.message, "가입 확인 메일을 보냈습니다.", "We sent your confirmation email."));
    } catch {
      setMessage(l("요청을 처리하지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.", "We could not process the request. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleAuth() {
    setMessage("");

    if (action === "signup") return;

    setGoogleBusy(true);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "signin",
          next: new URLSearchParams(window.location.search).get("next") || "/portal",
        }),
      });
      const result = await response.json();

      if (!response.ok || typeof result.url !== "string") {
        setMessage(localizeApiMessage(result.error, "Google 인증을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", "Google sign-in could not start. Please try again shortly."));
        return;
      }

      setRedirecting(true);
      window.location.assign(result.url);
    } catch {
      setMessage(l("Google 인증 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.", "Could not connect to Google authentication. Check your connection."));
    } finally {
      setGoogleBusy(false);
    }
  }

  function switchAction(nextAction: AuthAction) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setAction(nextAction);
    setFullName("");
    setIdentifier("");
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAccountRole("student");
    setPrivacyAgreed(false);
    setTermsAgreed(false);
    setAgeConfirmed(false);
    setMessage("");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
      );
    });
  }

  const isSignup = action === "signup";
  const isRecovery = action === "find-id" || action === "reset-password";
  const activeCopy = locale === "ko" ? actionCopy[action] : {
        signin: { title: "Log in", description: "Access your Seonbae portal with your registered account.", submit: "Log in" },
        signup: { title: "Sign up", description: "", submit: "Create account" },
        "find-id": { title: "Find my account", description: "If your details match, we will email you a secure account access link.", submit: "Send account access email" },
        "reset-password": { title: "Reset password", description: "If your details match, we will email you a secure reset link.", submit: "Send reset email" },
      }[action];

  function setAllRequiredAgreements(checked: boolean) {
    setPrivacyAgreed(checked);
    setTermsAgreed(checked);
    setAgeConfirmed(checked);
  }

  if (checkingSession || redirecting) {
    return (
      <main className={styles.loadingScreen} aria-busy="true">
        <div className={styles.loadingMark} aria-hidden="true">
          <img src="/logo.png" alt="" width="92" height="72" />
          <span />
        </div>
        <p className={styles.loadingEyebrow}>SEONBAE PORTAL</p>
        <h1>{redirecting ? l("포털을 여는 중입니다.", "Opening your portal.") : l("계정을 확인하고 있습니다.", "Checking your account.")}</h1>
        <p>{l("잠시만 기다려 주세요.", "Just a moment.")}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Seonbae home">
          <img src="/logo.png" alt="" />
          <span className={styles.brandKo}>Seonbae</span>
        </Link>
        <div className={styles.headerTools}>
          <div className={styles.languageToggle} role="group" aria-label="Language">
            <button type="button" aria-pressed={locale === "ko"} onClick={() => changeLocale("ko")}>KO</button>
            <button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button>
          </div>
          <Link className={styles.back} href="/">
            {l("홈으로 돌아가기", "Back to home")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className={styles.authHero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>SEONBAE PORTAL</p>
          <h1>{l("수업과 일정을", "Lessons and schedules")}<br /><em>{l("한곳에서.", "in one place.")}</em></h1>
          <p className={styles.intro}>
            {l(
              "예정된 수업, 담당 튜터, 학습 자료와 전달 사항을 한눈에 확인하세요.",
              "See upcoming lessons, tutors, learning materials, and updates at a glance.",
            )}
          </p>
          <div className={styles.benefits}>
            <article>
              <span>01</span>
              <div>
                <b>{l("월간 수업 일정", "Monthly lesson calendar")}</b>
                <p>{l("한 달 전체 수업과 변경 사항을 달력에서 확인합니다.", "Review a full month of lessons and schedule changes.")}</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <b>{l("담당 튜터 정보", "Tutor information")}</b>
                <p>{l("수업별 담당 튜터와 과목을 바로 확인합니다.", "See the tutor and subject assigned to every lesson.")}</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <b>{l("중앙 관리", "One shared workspace")}</b>
                <p>{l("선배 팀이 업데이트한 일정이 포털에 반영됩니다.", "Updates from the Seonbae team appear directly in your portal.")}</p>
              </div>
            </article>
          </div>
        </div>

        <div className={styles.loginSurface}>
          <div className={styles.formHeading}>
            <div className={styles.formHeadingTop}>
              {action !== "signin" && (
                <button
                  type="button"
                  className={styles.formBack}
                  onClick={() => switchAction("signin")}
                  aria-label={l("로그인으로 돌아가기", "Back to login")}
                  title={l("로그인으로 돌아가기", "Back to login")}
                >
                  <span aria-hidden="true">←</span>
                </button>
              )}
              <h2>{activeCopy.title}</h2>
            </div>
            {activeCopy.description && <span>{activeCopy.description}</span>}
          </div>

          <form onSubmit={handleSubmit}>
            {action === "signin" && (
              <>
                <button
                  className={styles.googleButton}
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={busy || googleBusy}
                >
                  <GoogleIcon />
                  <span>{googleBusy ? l("Google 연결 중...", "Connecting to Google...") : l("Google로 로그인", "Continue with Google")}</span>
                </button>
                <div className={styles.authDivider}><span>{l("또는 이메일로", "or use email")}</span></div>
              </>
            )}

            {isSignup && (
              <>
                <fieldset className={styles.accountRole}>
                  <legend>{l("계정 유형", "Account type")}<RequiredMark /></legend>
                  <label data-selected={accountRole === "student"}>
                    <input
                      type="radio"
                      name="account-role"
                      value="student"
                      checked={accountRole === "student"}
                      onChange={() => setAccountRole("student")}
                    />
                    <span><b>{l("학생 계정", "Student")}</b><small>{l("수업 일정, Zoom, 튜터 채팅", "Lesson calendar, Zoom, and tutor chat")}</small></span>
                  </label>
                  <label data-selected={accountRole === "parent"}>
                    <input
                      type="radio"
                      name="account-role"
                      value="parent"
                      checked={accountRole === "parent"}
                      onChange={() => setAccountRole("parent")}
                    />
                    <span><b>{l("보호자 계정", "Parent")}</b><small>{l("자녀 리포트, 일정, 결제 관리", "Student reports, schedules, and billing")}</small></span>
                  </label>
                </fieldset>
              </>
            )}

            {(isSignup || isRecovery) && (
              <label>
                <span>{l("이름", "Full name")}{isSignup && <RequiredMark />}</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
            )}

            {(action === "signin" || isSignup || action === "reset-password") && (
              <label>
                <span>
                  {action === "signin" ? l("아이디 또는 이메일", "ID or email") : l("이메일", "Email")}
                  {isSignup && <RequiredMark />}
                </span>
                <input
                  type={action === "signin" ? "text" : "email"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete={action === "signin" ? "username" : "email"}
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                />
              </label>
            )}


            {(isSignup || isRecovery) && (
              <label>
                <span>{l("휴대전화번호", "Mobile number")}{isSignup && <RequiredMark />}</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="01012345678"
                  maxLength={24}
                  required
                />
                {action === "find-id" && (
                  <small className={styles.fieldNote}>
                    {l("가입 정보가 일치하면 등록된 이메일로 보안 로그인 링크를 보냅니다.", "If your details match, we will send a secure sign-in link to your registered email.")}
                  </small>
                )}
              </label>
            )}

            {(action === "signin" || isSignup) && (
              <div className={styles.passwordField}>
                <label htmlFor="account-password">
                  <span>{l("비밀번호", "Password")}{isSignup && <RequiredMark />}</span>
                </label>
                <div className={styles.passwordInput}>
                  <input
                    id="account-password"
                    type={isSignup && showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={action === "signin" ? "current-password" : "new-password"}
                    minLength={isSignup ? 12 : undefined}
                    maxLength={128}
                    required
                  />
                  {isSignup && (
                    <button
                      className={styles.passwordToggle}
                      type="button"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? l("비밀번호 숨기기", "Hide password") : l("비밀번호 보기", "Show password")}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? l("숨기기", "Hide") : l("보기", "Show")}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isSignup && (
              <>
                <div className={styles.passwordPolicy} aria-live="polite">
                  <p>{l("비밀번호 조건", "Password requirements")}</p>
                  <ul>
                    <li data-valid={passwordChecks.length}>{l("12자 이상", "At least 12 characters")}</li>
                    <li data-valid={passwordChecks.lower && passwordChecks.upper}>
                      {l("영문 소문자와 대문자", "Uppercase and lowercase letters")}
                    </li>
                    <li data-valid={passwordChecks.number}>{l("숫자", "A number")}</li>
                    <li data-valid={passwordChecks.symbol}>{l("특수문자", "A special character")}</li>
                    <li data-valid={passwordChecks.allowed}>{l("공백 없이 허용된 문자만 사용", "Allowed characters only, with no spaces")}</li>
                  </ul>
                  <div className={styles.allowedSymbols}>
                    <span>{l("허용 특수문자", "Allowed special characters")}</span>
                    <code>{PASSWORD_ALLOWED_SYMBOLS}</code>
                  </div>
                </div>
                <div className={styles.passwordField}>
                  <label htmlFor="confirm-password">
                    <span>{l("비밀번호 확인", "Confirm password")}<RequiredMark /></span>
                  </label>
                  <div className={styles.passwordInput}>
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                    <button
                      className={styles.passwordToggle}
                      type="button"
                      aria-pressed={showConfirmPassword}
                      aria-label={showConfirmPassword ? l("비밀번호 확인 숨기기", "Hide password confirmation") : l("비밀번호 확인 보기", "Show password confirmation")}
                      onClick={() => setShowConfirmPassword((visible) => !visible)}
                    >
                      {showConfirmPassword ? l("숨기기", "Hide") : l("보기", "Show")}
                    </button>
                  </div>
                </div>
                <div className={styles.consentSummary}>
                  <b>{l("필수 개인정보 수집·이용 안내", "Required personal information notice")}</b>
                  <dl>
                    <div>
                      <dt>{l("수집 항목", "Information collected")}</dt>
                      <dd>
                        {l("이름, 이메일, 휴대전화번호, 인증·동의 기록", "Name, email, mobile number, and authentication and consent records")}
                      </dd>
                    </div>
                    <div>
                      <dt>{l("이용 목적", "Purpose")}</dt>
                      <dd>
                        {l("회원 관리, 포털 제공, 계정 복구, 비밀번호 재설정", "Account management, portal access, account recovery, and password resets")}
                      </dd>
                    </div>
                    <div>
                      <dt>{l("보유 기간", "Retention")}</dt>
                      <dd>{l("회원 탈퇴 시까지. 법령상 보존 의무가 있으면 해당 기간까지", "Until account deletion, or longer where retention is required by law")}</dd>
                    </div>
                  </dl>
                  <p>
                    {l("동의를 거부할 수 있으나, 필수 정보이므로 동의하지 않으면 회원가입이 어렵습니다.", "You may decline, but this information is required to create an account.")}
                  </p>
                </div>
                <div className={styles.consentList}>
                  <div className={styles.consentAll}>
                    <input
                      id="all-required-consent"
                      type="checkbox"
                      checked={allRequiredAgreed}
                      onChange={(event) => setAllRequiredAgreements(event.target.checked)}
                      aria-controls="privacy-consent terms-consent age-confirmation"
                    />
                    <label htmlFor="all-required-consent">
                      <b>{l("전체 동의", "Agree to all")}</b>
                      <span>{l("필수 약관과 개인정보 수집·이용에 모두 동의합니다.", "I agree to all required terms and personal information collection.")}</span>
                    </label>
                  </div>
                  <div className={styles.consentRow}>
                    <input
                      id="privacy-consent"
                      type="checkbox"
                      checked={privacyAgreed}
                      onChange={(event) => setPrivacyAgreed(event.target.checked)}
                      required
                    />
                    <label htmlFor="privacy-consent">
                      <b>{l("[필수]", "[Required]")}</b> {l("개인정보 수집·이용에 동의합니다.", "I agree to the collection and use of personal information.")} {" "}
                      <Link href="/privacy" target="_blank">{l("전문 보기", "Read policy")}</Link>
                    </label>
                  </div>
                  <div className={styles.consentRow}>
                    <input
                      id="terms-consent"
                      type="checkbox"
                      checked={termsAgreed}
                      onChange={(event) => setTermsAgreed(event.target.checked)}
                      required
                    />
                    <label htmlFor="terms-consent">
                      <b>{l("[필수]", "[Required]")}</b> {l("이용약관에 동의합니다.", "I agree to the Terms of Use.")} {" "}
                      <Link href="/terms" target="_blank">{l("전문 보기", "Read terms")}</Link>
                    </label>
                  </div>
                  <div className={styles.consentRow}>
                    <input
                      id="age-confirmation"
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(event) => setAgeConfirmed(event.target.checked)}
                      required
                    />
                    <label htmlFor="age-confirmation">
                      <b>{l("[필수]", "[Required]")}</b> {l("만 14세 이상이거나, 만 14세 미만 학생을 위한 법정대리인으로 가입합니다.", "I am at least 14, or I am registering as the legal guardian of a student under 14.")}
                    </label>
                  </div>
                </div>
              </>
            )}

            {action === "signin" && (
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => updateRemember(event.target.checked)}
                />
                <span>{l("로그인 상태 유지", "Keep me logged in")}</span>
              </label>
            )}

            {message && (
              <p className={styles.formMessage} role="status">
                {message}
              </p>
            )}
            <button className={styles.submit} type="submit" disabled={busy}>
              <span>{busy ? l("확인 중...", "Working...") : activeCopy.submit}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          {action === "signin" && (
            <div className={styles.recoveryLinks} aria-label={l("계정 찾기", "Account recovery")}>
              <button type="button" onClick={() => switchAction("find-id")}>
                {l("아이디 찾기", "Find account")}
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={() => switchAction("reset-password")}>
                {l("비밀번호 재설정", "Reset password")}
              </button>
            </div>
          )}

          <div className={styles.authFooter}>
            <span>
              {action === "signin"
                ? l("아직 계정이 없으신가요?", "New to Seonbae?")
                : isSignup
                  ? l("이미 계정이 있으신가요?", "Already have an account?")
                  : l("계정이 기억나셨나요?", "Remembered your account?")}
            </span>
            <button
              type="button"
              onClick={() => switchAction(action === "signin" ? "signup" : "signin")}
            >
              {action === "signin" ? l("회원가입", "Sign up") : l("로그인", "Log in")}
            </button>
          </div>
          <div className={styles.legalLinks}>
            <Link href="/privacy">{l("개인정보 처리방침", "Privacy policy")}</Link>
            <Link href="/terms">{l("이용약관", "Terms")}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function RequiredMark() {
  return <i className={styles.requiredMark} aria-hidden="true">*</i>;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.86a6 6 0 0 1 0-3.72V7.52H3.04a10 10 0 0 0 0 8.96l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
      />
    </svg>
  );
}
