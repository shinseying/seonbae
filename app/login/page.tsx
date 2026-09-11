"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPasswordChecks,
  getPasswordPolicyError,
  PASSWORD_ALLOWED_SYMBOLS,
} from "../../utils/auth/password";
import { normalizePhone, sanitizePhoneInput } from "../../utils/auth/phone";
import { isEmailAddress, isKoreanSchoolEmail } from "../../utils/auth/school-email";
import {
  MAX_TUTOR_CREDENTIAL_FILES,
  MAX_TUTOR_SUBJECTS,
  TUTOR_CURRICULA,
  TUTOR_LESSON_FORMATS,
  TUTOR_UNIVERSITIES,
  tutorSignupErrorKo,
  validateTutorCredentialCount,
  validateTutorSignupDetails,
  type TutorSubjectScore,
  type TutorSignupErrorCode,
} from "../../utils/auth/tutor-signup";
import {
  setSeonbaeLocale,
  useSeonbaeLocale,
  type SeonbaeLocale,
} from "../../utils/i18n/client";
import { isDocumentMimeType, MAX_DOCUMENT_BYTES } from "../../utils/files/document-rules";
import { createClient as createBrowserSupabaseClient } from "../../utils/supabase/client";
import styles from "./login.module.css";

type AuthAction = "signin" | "signup" | "find-id" | "reset-password";

type EditableSubjectScore = TutorSubjectScore & { id: number };

async function discardTutorUpload(ticket: string) {
  try {
    await fetch("/api/auth/signup/uploads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      keepalive: true,
    });
  } catch {
    // Best effort: the signed ticket expires shortly and cannot expose files.
  }
}

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
  const [accountRole, setAccountRole] = useState<"student" | "parent" | "tutor">("student");
  const [tutorUniversity, setTutorUniversity] = useState("");
  const [tutorMajorYear, setTutorMajorYear] = useState("");
  const [tutorCurriculum, setTutorCurriculum] = useState("");
  const [tutorLanguages, setTutorLanguages] = useState("");
  const [tutorLessonFormat, setTutorLessonFormat] = useState("");
  const [tutorSubjectScores, setTutorSubjectScores] = useState<EditableSubjectScore[]>([
    { id: 1, subject: "", score: "" },
  ]);
  const [nextSubjectId, setNextSubjectId] = useState(2);
  const [tutorIntroduction, setTutorIntroduction] = useState("");
  const [acceptanceLetter, setAcceptanceLetter] = useState<File | null>(null);
  const [credentialDocuments, setCredentialDocuments] = useState<File[]>([]);
  const [remember, setRemember] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const activeTutorUpload = useRef<{ ticket: string; finalizing: boolean } | null>(null);

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const allRequiredAgreed = privacyAgreed && termsAgreed && ageConfirmed;

  useEffect(() => {
    try {
      setRemember(window.localStorage.getItem("seonbae-remember-login") === "1");
    } catch {
      setRemember(false);
    }
  }, []);

  useEffect(() => {
    const cleanupCancelledUpload = () => {
      const active = activeTutorUpload.current;
      if (!active || active.finalizing) return;
      activeTutorUpload.current = null;
      void discardTutorUpload(active.ticket);
    };
    window.addEventListener("pagehide", cleanupCancelledUpload);
    return () => {
      window.removeEventListener("pagehide", cleanupCancelledUpload);
      cleanupCancelledUpload();
    };
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
  const tutorSignupMessage = (code: TutorSignupErrorCode) => {
    const english: Record<TutorSignupErrorCode, string> = {
      university: "Select your current or accepted university.",
      majorYear: "Enter your course and year in 120 characters or fewer.",
      curriculum: "Select the curriculum you want to teach.",
      languages: "Enter the languages you can teach in, using 80 characters or fewer.",
      lessonFormat: "Select your preferred lesson format.",
      subjectCount: `Add between 1 and ${MAX_TUTOR_SUBJECTS} subjects.`,
      subjectRows: "Enter both the subject and result for every row.",
      introduction: "Describe your teaching experience in 2,000 characters or fewer.",
      credentialCount: `Attach between 1 and ${MAX_TUTOR_CREDENTIAL_FILES} score reports or credentials.`,
    };
    return locale === "ko" ? tutorSignupErrorKo(code) : english[code];
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLanguage = params.get("lang");
    if (requestedLanguage === "en" || requestedLanguage === "ko") {
      setSeonbaeLocale(requestedLanguage);
    }
    const requestedAction = params.get("mode");
    const requestedRole = params.get("role");
    if (requestedAction === "signup") setAction("signup");
    if (requestedRole === "tutor") {
      setAccountRole("tutor");
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

  function selectAccountRole(role: "student" | "parent" | "tutor") {
    setAccountRole(role);
    if (role !== "tutor") {
      setAcceptanceLetter(null);
      setCredentialDocuments([]);
    }
  }

  function updateSubjectScore(id: number, key: keyof TutorSubjectScore, value: string) {
    setTutorSubjectScores((rows) => rows.map((row) => (
      row.id === id ? { ...row, [key]: value } : row
    )));
  }

  function addSubjectScore() {
    if (tutorSubjectScores.length >= MAX_TUTOR_SUBJECTS) return;
    setTutorSubjectScores((rows) => [...rows, { id: nextSubjectId, subject: "", score: "" }]);
    setNextSubjectId((value) => value + 1);
  }

  function removeSubjectScore(id: number) {
    setTutorSubjectScores((rows) => rows.length === 1 ? rows : rows.filter((row) => row.id !== id));
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
      if (accountRole === "tutor" && !isKoreanSchoolEmail(identifier)) {
        setMessage(l("튜터는 .ac.kr로 끝나는 학교 이메일을 사용해 주세요.", "Tutors must use a school email ending in .ac.kr."));
        setBusy(false);
        return;
      }
      if (accountRole === "tutor") {
        const detailError = validateTutorSignupDetails({
          university: tutorUniversity.trim(),
          majorYear: tutorMajorYear.trim(),
          curriculum: tutorCurriculum.trim(),
          languages: tutorLanguages.trim(),
          lessonFormat: tutorLessonFormat.trim(),
          subjectScores: tutorSubjectScores.map(({ subject, score }) => ({
            subject: subject.trim(),
            score: score.trim(),
          })),
          introduction: tutorIntroduction.trim(),
        });
        if (detailError) {
          setMessage(tutorSignupMessage(detailError));
          setBusy(false);
          return;
        }
      }
      if (accountRole === "tutor" && !acceptanceLetter) {
        setMessage(l("재학 또는 입학 증명서를 첨부해 주세요.", "Attach your proof of enrolment or admission."));
        setBusy(false);
        return;
      }
      if (accountRole === "tutor") {
        const credentialError = validateTutorCredentialCount(credentialDocuments.length);
        if (credentialError) {
          setMessage(tutorSignupMessage(credentialError));
          setBusy(false);
          return;
        }
        const documents = [acceptanceLetter!, ...credentialDocuments];
        if (documents.some((document) => !isDocumentMimeType(document.type))) {
          setMessage(l(
            "첨부 파일은 PDF, JPG 또는 PNG 형식만 사용할 수 있습니다.",
            "Attachments must be PDF, JPG, or PNG files.",
          ));
          setBusy(false);
          return;
        }
        if (documents.some((document) => document.size < 1 || document.size > MAX_DOCUMENT_BYTES)) {
          setMessage(l(
            "각 첨부 파일은 10MB 이하여야 합니다.",
            "Each attachment must be no larger than 10MB.",
          ));
          setBusy(false);
          return;
        }
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

    let uploadTicket: string | null = null;
    let finalSignupStarted = false;

    try {
      const signupForm = new FormData();
      if (action === "signup") {
        signupForm.set("fullName", fullName);
        signupForm.set("email", identifier);
        signupForm.set("phone", phone);
        signupForm.set("password", password);
        signupForm.set("accountRole", accountRole);
        if (accountRole === "tutor" && acceptanceLetter) {
          signupForm.set("university", tutorUniversity);
          signupForm.set("majorYear", tutorMajorYear);
          signupForm.set("curriculum", tutorCurriculum);
          signupForm.set("languages", tutorLanguages);
          signupForm.set("lessonFormat", tutorLessonFormat);
          signupForm.set("introduction", tutorIntroduction);
          for (const row of tutorSubjectScores) {
            signupForm.append("subjectName", row.subject);
            signupForm.append("subjectScore", row.score);
          }

          const documents = [
            { kind: "school_proof" as const, file: acceptanceLetter },
            ...credentialDocuments.map((file) => ({ kind: "credential" as const, file })),
          ];
          setMessage(l("서류 업로드를 준비하고 있습니다...", "Preparing your document upload..."));
          const preparationResponse = await fetch("/api/auth/signup/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: identifier,
              phone,
              documents: documents.map(({ kind, file }) => ({
                kind,
                originalName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
              })),
            }),
          });
          const preparation = await preparationResponse.json().catch(() => ({}));
          if (!preparationResponse.ok) {
            setMessage(localizeApiMessage(
              preparation.error,
              "튜터 서류 업로드를 준비하지 못했습니다. 다시 시도해 주세요.",
              "We could not prepare the tutor document upload. Please try again.",
            ));
            return;
          }

          const uploads = preparation.uploads;
          if (
            typeof preparation.ticket !== "string"
            || !Array.isArray(uploads)
            || uploads.length !== documents.length
            || uploads.some((upload) => (
              !upload
              || typeof upload.path !== "string"
              || typeof upload.token !== "string"
            ))
          ) {
            setMessage(l(
              "튜터 서류 업로드 정보를 확인하지 못했습니다. 다시 시도해 주세요.",
              "We could not verify the tutor upload details. Please try again.",
            ));
            return;
          }

          uploadTicket = preparation.ticket;
          activeTutorUpload.current = { ticket: uploadTicket, finalizing: false };
          const storage = createBrowserSupabaseClient().storage.from("account-documents");
          for (let index = 0; index < documents.length; index += 1) {
            setMessage(l(
              `서류를 업로드하고 있습니다 (${index + 1}/${documents.length})...`,
              `Uploading documents (${index + 1}/${documents.length})...`,
            ));
            const { error: uploadError } = await storage.uploadToSignedUrl(
              uploads[index].path,
              uploads[index].token,
              documents[index].file,
              {
                cacheControl: "0",
                contentType: documents[index].file.type,
                upsert: false,
              },
            );
            if (uploadError) {
              await discardTutorUpload(uploadTicket);
              activeTutorUpload.current = null;
              uploadTicket = null;
              setMessage(l(
                "튜터 서류를 업로드하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.",
                "We could not upload the tutor documents. Check your connection and try again.",
              ));
              return;
            }
          }
          signupForm.set("uploadTicket", uploadTicket);
        }
        signupForm.set("privacyAgreed", String(privacyAgreed));
        signupForm.set("termsAgreed", String(termsAgreed));
        signupForm.set("ageConfirmed", String(ageConfirmed));
      }

      if (uploadTicket) {
        setMessage(l("가입 요청을 안전하게 저장하고 있습니다...", "Securely saving your application..."));
        activeTutorUpload.current = { ticket: uploadTicket, finalizing: true };
      }
      finalSignupStarted = action === "signup";
      const response = await fetch(endpoint, action === "signup"
        ? { method: "POST", body: signupForm }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (uploadTicket) {
          await discardTutorUpload(uploadTicket);
          activeTutorUpload.current = null;
          uploadTicket = null;
        }
        const fallbackKo = action === "signin"
          ? "이메일 또는 비밀번호가 일치하지 않습니다."
          : "입력한 정보를 다시 확인해 주세요.";
        const fallbackEn = action === "signin"
          ? "The email or password is incorrect."
          : "Check the information you entered and try again.";
        setMessage(localizeApiMessage(result.error, fallbackKo, fallbackEn));
        setBusy(false);
        return;
      }

      activeTutorUpload.current = null;

      if (result.destination) {
        setRedirecting(true);
        router.replace(result.destination);
        router.refresh();
        return;
      }

      setMessage(localizeApiMessage(result.message, "가입 확인 메일을 보냈습니다.", "We sent your confirmation email."));
    } catch {
      // A failed direct upload is safe to remove. Once final account creation
      // has started, its outcome can be ambiguous after a network interruption,
      // so the server remains responsible for retaining or rolling it back.
      if (uploadTicket && !finalSignupStarted) {
        await discardTutorUpload(uploadTicket);
        activeTutorUpload.current = null;
      }
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
    setTutorUniversity("");
    setTutorMajorYear("");
    setTutorCurriculum("");
    setTutorLanguages("");
    setTutorLessonFormat("");
    setTutorSubjectScores([{ id: 1, subject: "", score: "" }]);
    setNextSubjectId(2);
    setTutorIntroduction("");
    setAcceptanceLetter(null);
    setCredentialDocuments([]);
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

  if (redirecting) {
    return (
      <main className={styles.loadingScreen} aria-busy="true">
        <div className={styles.loadingMark} aria-hidden="true">
          <img src="/logo.png" alt="" width="92" height="72" />
          <span />
        </div>
        <p className={styles.loadingEyebrow}>SEONBAE PORTAL</p>
        <h1>{l("포털을 여는 중입니다.", "Opening your portal.")}</h1>
        <p>{l("잠시만 기다려 주세요.", "Just a moment.")}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href={locale === "en" ? "/en/" : "/"} aria-label="Seonbae home">
          <img src="/logo.png" alt="" />
          <span className={styles.brandKo}>Seonbae</span>
        </Link>
        <div className={styles.headerTools}>
          <div className={styles.languageToggle} role="group" aria-label="Language">
            <button type="button" aria-pressed={locale === "ko"} onClick={() => changeLocale("ko")}>KO</button>
            <button type="button" aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button>
          </div>
          <Link className={styles.back} href={locale === "en" ? "/en/" : "/"}>
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
                      onChange={() => selectAccountRole("student")}
                    />
                    <span><b>{l("학생 계정", "Student")}</b><small>{l("수업 일정, Zoom, 튜터 채팅", "Lesson calendar, Zoom, and tutor chat")}</small></span>
                  </label>
                  <label data-selected={accountRole === "parent"}>
                    <input
                      type="radio"
                      name="account-role"
                      value="parent"
                      checked={accountRole === "parent"}
                      onChange={() => selectAccountRole("parent")}
                    />
                    <span><b>{l("보호자 계정", "Parent")}</b><small>{l("자녀 리포트, 일정, 결제 관리", "Student reports, schedules, and billing")}</small></span>
                  </label>
                  <label data-selected={accountRole === "tutor"}>
                    <input
                      type="radio"
                      name="account-role"
                      value="tutor"
                      checked={accountRole === "tutor"}
                      onChange={() => selectAccountRole("tutor")}
                    />
                    <span><b>{l("튜터 계정", "Tutor")}</b></span>
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
                  {l("이메일", "Email")}
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
                  aria-describedby={isSignup && accountRole === "tutor" ? "tutor-email-help" : undefined}
                  required
                />
                {isSignup && accountRole === "tutor" && (
                  <small className={styles.fieldNote} id="tutor-email-help">
                    {l("현재 학교에서 사용하는 .ac.kr 이메일을 입력해 주세요.", "Use your current university email ending in .ac.kr.")}
                  </small>
                )}
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

            {isSignup && accountRole === "tutor" && (
              <section className={styles.tutorDetails} aria-labelledby="tutor-details-title">
                <header>
                  <p>TUTOR APPLICATION</p>
                  <h3 id="tutor-details-title">{l("튜터 지원 정보", "Tutor application details")}</h3>
                  <span>
                    {l(
                      "가르칠 분야와 이를 확인할 자료를 입력해 주세요. 아래 정보는 튜터 심사에 사용됩니다.",
                      "Tell us what you can teach and provide the documents used for tutor review.",
                    )}
                  </span>
                </header>

                <div className={styles.tutorFieldGrid}>
                  <label>
                    <span>{l("대학교", "University")}<RequiredMark /></span>
                    <select value={tutorUniversity} onChange={(event) => setTutorUniversity(event.target.value)} required>
                      <option value="" disabled>{l("학교 선택", "Select university")}</option>
                      {TUTOR_UNIVERSITIES.map((university) => (
                        <option value={university} key={university}>{universityLabel(university, locale)}</option>
                      ))}
                    </select>
                    <small className={styles.fieldNote}>
                      {l("현재 재학 중이거나 입학 허가를 받은 학교를 선택해 주세요.", "Select the university where you are enrolled or have accepted admission.")}
                    </small>
                  </label>
                  <label>
                    <span>{l("전공과 학년", "Course and year")}<RequiredMark /></span>
                    <input
                      value={tutorMajorYear}
                      onChange={(event) => setTutorMajorYear(event.target.value)}
                      maxLength={120}
                      placeholder={l("예: 경제학부 2학년 또는 입학 예정", "e.g. Economics, 2nd year or incoming")}
                      required
                    />
                  </label>
                  <label>
                    <span>{l("지원 커리큘럼", "Curriculum")}<RequiredMark /></span>
                    <select value={tutorCurriculum} onChange={(event) => setTutorCurriculum(event.target.value)} required>
                      <option value="" disabled>{l("커리큘럼 선택", "Select curriculum")}</option>
                      {TUTOR_CURRICULA.map((curriculum) => <option value={curriculum} key={curriculum}>{curriculum}</option>)}
                    </select>
                    <small className={styles.fieldNote}>
                      {l("가장 자신 있게 가르칠 수 있는 커리큘럼을 선택해 주세요.", "Choose the curriculum you are best prepared to teach.")}
                    </small>
                  </label>
                  <label>
                    <span>{l("수업 가능 언어", "Teaching languages")}<RequiredMark /></span>
                    <input
                      value={tutorLanguages}
                      onChange={(event) => setTutorLanguages(event.target.value)}
                      maxLength={80}
                      placeholder={l("예: 한국어, 영어", "e.g. Korean, English")}
                      required
                    />
                  </label>
                  <label className={styles.fullField}>
                    <span>{l("선호 수업 형식", "Preferred lesson format")}<RequiredMark /></span>
                    <select value={tutorLessonFormat} onChange={(event) => setTutorLessonFormat(event.target.value)} required>
                      <option value="" disabled>{l("수업 형식 선택", "Select lesson format")}</option>
                      {TUTOR_LESSON_FORMATS.map((format) => (
                        <option value={format} key={format}>{lessonFormatLabel(format, locale)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset className={styles.subjectScores}>
                  <legend>{l("가르칠 과목의 과목별 성적", "Results for subjects you want to teach")}<RequiredMark /></legend>
                  <p className={styles.fieldNote}>
                    {l("가르칠 과목마다 한 줄씩 입력해 주세요. 이 내용은 승인 후 튜터 카드 초안에 사용됩니다.", "Add one row per subject. These results are used for your tutor-card draft after approval.")}
                  </p>
                  <div className={styles.subjectRows}>
                    {tutorSubjectScores.map((row, index) => (
                      <div className={styles.subjectRow} key={row.id}>
                        <label>
                          <span>{l(`과목 ${index + 1}`, `Subject ${index + 1}`)}</span>
                          <input
                            value={row.subject}
                            onChange={(event) => updateSubjectScore(row.id, "subject", event.target.value)}
                            maxLength={80}
                            placeholder={l("예: IB Physics HL", "e.g. IB Physics HL")}
                            required
                          />
                        </label>
                        <label>
                          <span>{l("성적", "Result")}</span>
                          <input
                            value={row.score}
                            onChange={(event) => updateSubjectScore(row.id, "score", event.target.value)}
                            maxLength={24}
                            placeholder={l("예: 7", "e.g. 7")}
                            required
                          />
                        </label>
                        <button
                          type="button"
                          className={styles.removeSubject}
                          disabled={tutorSubjectScores.length === 1}
                          onClick={() => removeSubjectScore(row.id)}
                          aria-label={l(`${index + 1}번째 과목 삭제`, `Remove subject ${index + 1}`)}
                        >
                          {l("삭제", "Remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.addSubject}
                    disabled={tutorSubjectScores.length >= MAX_TUTOR_SUBJECTS}
                    onClick={addSubjectScore}
                  >
                    <span aria-hidden="true">+</span> {l("과목 추가", "Add subject")}
                  </button>
                </fieldset>

                <label>
                  <span>{l("소개 및 수업 경험", "Teaching experience")}<RequiredMark /></span>
                  <textarea
                    value={tutorIntroduction}
                    onChange={(event) => setTutorIntroduction(event.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder={l("지원 동기, 수업 경험과 가르칠 때 중요하게 생각하는 점을 적어 주세요.", "Describe why you are applying, your teaching experience, and your approach to lessons.")}
                    required
                  />
                  <small className={styles.fieldNote}>{tutorIntroduction.length.toLocaleString()} / 2,000</small>
                </label>

                <div className={styles.documentFields}>
                  <div className={styles.documentHeading}>
                    <h4>{l("심사 서류", "Review documents")}</h4>
                    <p>{l("학적 증명과 성적·자격 증빙을 구분해서 첨부해 주세요.", "Upload school proof and score or qualification evidence separately.")}</p>
                  </div>
                  <label className={styles.fileField}>
                    <span>{l("재학·입학 증명", "Proof of enrolment or admission")}<RequiredMark /></span>
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      aria-describedby="school-proof-help"
                      onChange={(event) => setAcceptanceLetter(event.target.files?.[0] ?? null)}
                      required
                    />
                    <small className={styles.fieldNote} id="school-proof-help">
                      {l("재학증명서, 합격통지서 또는 입학허가서 1개. 성적표와 자격증은 아래에 첨부해 주세요. PDF, JPG 또는 PNG, 최대 10MB.", "One enrolment certificate, acceptance notice, or admission letter. Upload score reports and certificates below. PDF, JPG, or PNG, up to 10MB.")}
                    </small>
                    {acceptanceLetter && <FileSelection files={[acceptanceLetter]} label={l("선택된 학적 증명", "Selected school proof")} />}
                  </label>
                  <label className={styles.fileField}>
                    <span>{l("성적·자격 증빙", "Score and qualification evidence")}<RequiredMark /></span>
                    <input
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      aria-describedby="credential-documents-help"
                      aria-invalid={credentialDocuments.length > MAX_TUTOR_CREDENTIAL_FILES}
                      onChange={(event) => setCredentialDocuments(Array.from(event.target.files ?? []))}
                      required
                    />
                    <small className={styles.fieldNote} id="credential-documents-help">
                      {l(`위 과목 성적을 확인할 성적표, 시험 결과 또는 자격증을 1~${MAX_TUTOR_CREDENTIAL_FILES}개 첨부할 수 있습니다. 파일당 PDF, JPG 또는 PNG, 최대 10MB.`, `Attach 1–${MAX_TUTOR_CREDENTIAL_FILES} score reports, test results, or certificates covering the subjects above. PDF, JPG, or PNG, up to 10MB per file.`)}
                    </small>
                    {credentialDocuments.length > 0 && <FileSelection files={credentialDocuments} label={l("선택된 성적·자격 증빙", "Selected score and qualification evidence")} />}
                    {credentialDocuments.length > MAX_TUTOR_CREDENTIAL_FILES && (
                      <small className={styles.fieldError} role="alert">{tutorSignupMessage("credentialCount")}</small>
                    )}
                  </label>
                </div>
              </section>
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
                        {accountRole === "tutor"
                          ? l(
                              "이름, 학교 이메일, 휴대전화번호, 대학·전공·학년, 수업 가능 정보, 과목별 성적, 소개, 제출 서류, 인증·동의 기록",
                              "Name, university email, mobile number, university, course and year, teaching details, subject results, introduction, submitted documents, and authentication and consent records",
                            )
                          : l("이름, 이메일, 휴대전화번호, 인증·동의 기록", "Name, email, mobile number, and authentication and consent records")}
                      </dd>
                    </div>
                    <div>
                      <dt>{l("이용 목적", "Purpose")}</dt>
                      <dd>
                        {accountRole === "tutor"
                          ? l(
                              "회원 관리, 튜터 자격 심사, 계약 및 튜터 카드 초안 생성, 포털 제공, 계정 복구",
                              "Account management, tutor eligibility review, contracting and tutor-card drafting, portal access, and account recovery",
                            )
                          : l("회원 관리, 포털 제공, 계정 복구, 비밀번호 재설정", "Account management, portal access, account recovery, and password resets")}
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

function FileSelection({ files, label }: { files: File[]; label: string }) {
  return (
    <ul className={styles.fileSelection} aria-label={label}>
      {files.map((file, index) => (
        <li key={`${file.name}-${file.size}-${index}`}>
          <span>{file.name}</span>
          <small>{formatFileSize(file.size)}</small>
        </li>
      ))}
    </ul>
  );
}

function universityLabel(university: (typeof TUTOR_UNIVERSITIES)[number], locale: SeonbaeLocale) {
  if (locale === "ko") return university;
  if (university === "서울대학교") return "Seoul National University";
  if (university === "고려대학교") return "Korea University";
  return "Yonsei University";
}

function lessonFormatLabel(format: (typeof TUTOR_LESSON_FORMATS)[number], locale: SeonbaeLocale) {
  if (locale === "ko") return format;
  if (format === "온라인 1:1") return "Online 1:1";
  if (format === "온라인 소그룹") return "Online small group";
  if (format === "대면 1:1") return "In person 1:1";
  return "Online or in person";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
