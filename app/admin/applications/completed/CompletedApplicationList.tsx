"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./completed.module.css";

export type CompletedApplication = {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  role: "student" | "parent" | "tutor";
  university: string | null;
  subjects: string | null;
  curriculum: string | null;
  officialScore: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  registryId: string | null;
  createdAt: string;
};

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "approved", label: "승인" },
  { key: "rejected", label: "반려" },
] as const;

export default function CompletedApplicationList({
  applications,
}: {
  applications: CompletedApplication[];
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const visible = filter === "all"
    ? applications
    : applications.filter((item) => item.status === filter);

  return (
    <div className={styles.wrap}>
      <div className={styles.filters} role="tablist" aria-label="심사 결과 분류">
        {FILTERS.map((option) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === option.key}
            className={filter === option.key ? styles.activeFilter : undefined}
            onClick={() => setFilter(option.key)}
            key={option.key}
          >
            {option.label}
            <span>
              {option.key === "all"
                ? applications.length
                : applications.filter((item) => item.status === option.key).length}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>해당하는 신청 기록이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((item) => (
            <li key={item.id} data-status={item.status}>
              <header>
                <div>
                  <b>{item.fullName}</b>
                  <small>
                    {roleLabel(item.role)} · {item.email}
                    {item.phone ? ` · ${item.phone}` : ""}
                  </small>
                </div>
                <span className={item.status === "approved" ? styles.approved : styles.rejected}>
                  {item.status === "approved" ? "승인" : "반려"}
                </span>
              </header>

              {(item.university || item.curriculum || item.subjects) && (
                <dl className={styles.meta}>
                  {item.university && <div><dt>대학교</dt><dd>{item.university}</dd></div>}
                  {item.curriculum && (
                    <div>
                      <dt>커리큘럼</dt>
                      <dd>{item.curriculum}{item.officialScore ? ` · ${item.officialScore}` : ""}</dd>
                    </div>
                  )}
                  {item.subjects && <div><dt>과목</dt><dd>{item.subjects}</dd></div>}
                </dl>
              )}

              {item.reviewNote && <p className={styles.note}>{item.reviewNote}</p>}

              <footer>
                <span>
                  신청 {formatDate(item.createdAt)}
                  {item.reviewedAt ? ` · 처리 ${formatDate(item.reviewedAt)}` : ""}
                  {item.reviewerName ? ` · ${item.reviewerName}` : ""}
                </span>
                {item.registryId && (
                  <Link href="/admin">명부 {item.registryId} 보기 ↗</Link>
                )}
              </footer>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function roleLabel(role: CompletedApplication["role"]) {
  if (role === "tutor") return "튜터";
  if (role === "parent") return "보호자";
  return "학생";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
