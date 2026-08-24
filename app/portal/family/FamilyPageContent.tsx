"use client";

import FamilyLinkClient, { type LinkedStudent } from "./FamilyLinkClient";
import ComplaintForm from "../ComplaintForm";
import { usePortalText } from "../PortalLocale";
import styles from "../parent.module.css";

export default function FamilyPageContent({ linkedStudents }: { linkedStudents: LinkedStudent[] }) {
  const { text: l } = usePortalText();
  return (
    <div className={styles.shell}>
      <header className={styles.pageHeading}>
        <p>FAMILY CONNECTION</p>
        <h1>{l("학생 계정 연결", "Link a student account")}</h1>
        <span>{l("학생에게 전송된 일회용 인증번호 또는 승인 링크로 가족 관계를 확인합니다.", "Confirm your family connection with the one-time code or approval link sent to the student.")}</span>
      </header>
      <FamilyLinkClient linkedStudents={linkedStudents} />
      <ComplaintForm />
    </div>
  );
}
