"use client";

import Link from "next/link";
import styles from "./meeting.module.css";

// Meetings open in the desktop Zoom Workspace app. The stored join_url carries
// the encrypted passcode, so clicking it hands off to the installed client.
export default function ZoomMeetingRoom({
  joinUrl,
  passcode,
  meetingReady,
  meetingStatus,
}: {
  joinUrl: string | null;
  passcode: string | null;
  meetingReady: boolean;
  meetingStatus: string;
}) {
  const unavailable =
    !meetingReady
    || meetingStatus === "cancelled"
    || meetingStatus === "ended"
    || !joinUrl;

  return (
    <section className={styles.roomShell}>
      <div className={styles.prejoin}>
        <div className={styles.prejoinMark}>
          <img src="/logo.png" alt="" width="38" height="38" />
        </div>
        <p>SEONBAE SECURE CLASSROOM</p>
        <h2>
          {unavailable
            ? meetingStatus === "ended"
              ? "종료된 수업입니다."
              : meetingStatus === "cancelled"
                ? "취소된 수업입니다."
                : "Zoom 수업을 준비하고 있습니다."
            : "데스크탑 Zoom 앱에서 수업이 열립니다."}
        </h2>
        <span>
          입장을 누르면 데스크탑 Zoom Workspace 앱이 실행됩니다. 앱이 없으면
          설치 안내가 표시되며, 브라우저에서 이어서 참여할 수도 있습니다.
        </span>
        <button
          type="button"
          onClick={() => joinUrl && window.open(joinUrl, "_blank", "noopener,noreferrer")}
          disabled={unavailable}
        >
          Zoom 수업 입장
          <i>↗</i>
        </button>
        {!unavailable && passcode && (
          <p className={styles.status}>
            앱에서 암호를 물으면 입력하세요: <b>{passcode}</b>
          </p>
        )}
        <small>
          입장 시 <Link href="/privacy">개인정보 처리방침</Link>과 Zoom의
          회의 처리 절차가 적용됩니다. 녹화가 시작될 경우 별도 안내가 표시됩니다.
        </small>
      </div>
    </section>
  );
}
