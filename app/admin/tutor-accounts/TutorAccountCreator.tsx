"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TutorCardChoiceFields,
  tutorCardChoiceIsReady,
  type AvailableTutorCard,
  type CardMode,
} from "./TutorCardChoiceFields";
import styles from "../applications/applications.module.css";

export type PendingTutorApplication = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  university: string | null;
  subjects: string | null;
  created_at: string;
};

type ProvisionResult = {
  registryId?: string;
  cardMode?: Exclude<CardMode, "">;
  warning?: string;
};

export default function TutorAccountCreator({
  applications,
  availableCards: initialAvailableCards,
}: {
  applications: PendingTutorApplication[];
  availableCards: AvailableTutorCard[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(applications);
  const [availableCards, setAvailableCards] = useState(initialAvailableCards);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [directMode, setDirectMode] = useState<CardMode>("");
  const [directRegistryId, setDirectRegistryId] = useState("");

  async function create(
    payload: Record<string, unknown>,
    key: string,
    onDone?: (result: ProvisionResult) => void,
  ) {
    setBusy(key);
    setMessage("계정을 만들고 비밀번호 설정 링크를 보내는 중입니다…");
    try {
      const response = await fetch("/api/admin/tutor-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as ProvisionResult & { error?: string };
      if (!response.ok) throw new Error(result.error || "계정을 만들지 못했습니다.");

      const linkedRegistryId = payload.cardMode === "link" && typeof payload.existingRegistryId === "string"
        ? payload.existingRegistryId
        : "";
      const linkedRosterNumber = linkedRegistryId
        ? availableCards.find((card) => card.registry_id === linkedRegistryId)?.roster_number
        : null;
      if (linkedRegistryId) {
        setAvailableCards((cards) => cards.filter((card) => card.registry_id !== linkedRegistryId));
      }
      setMessage(result.warning || (
        payload.cardMode === "link"
          ? `계정을 만들고 ${linkedRosterNumber || "명부 번호 준비 중"} 기존 카드에 연결했습니다.`
          : "계정과 새 비공개 카드를 만들고 일회용 비밀번호 설정 링크를 보냈습니다."
      ));
      onDone?.(result);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "네트워크 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  function createDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create(
      {
        fullName: data.get("fullName"),
        email: data.get("email"),
        phone: data.get("phone"),
        cardMode: directMode,
        existingRegistryId: directMode === "link" ? directRegistryId : null,
      },
      "direct",
      () => {
        form.reset();
        setDirectMode("");
        setDirectRegistryId("");
      },
    );
  }

  const directReady = tutorCardChoiceIsReady(directMode, directRegistryId, availableCards);
  const anyBusy = busy !== null;

  return (
    <div className={styles.reviewGrid}>
      {message && <p className={styles.message} aria-live="polite">{message}</p>}

      <section>
        <header>
          <div>
            <p>CREATE DIRECTLY</p>
            <h2>새 튜터 계정</h2>
          </div>
        </header>
        <article>
          <form onSubmit={createDirect} className={styles.createForm}>
            <label>
              <span>이름</span>
              <input name="fullName" minLength={2} maxLength={80} required disabled={anyBusy} />
            </label>
            <label>
              <span>학교 이메일</span>
              <input name="email" type="email" maxLength={254} required placeholder="tutor@snu.ac.kr" disabled={anyBusy} />
            </label>
            <label>
              <span>휴대전화번호</span>
              <input name="phone" type="tel" inputMode="tel" maxLength={24} placeholder="01012345678" required disabled={anyBusy} />
            </label>
            <TutorCardChoiceFields
              idPrefix="direct"
              mode={directMode}
              registryId={directRegistryId}
              availableCards={availableCards}
              disabled={anyBusy}
              onModeChange={(mode) => {
                setDirectMode(mode);
                if (mode !== "link") setDirectRegistryId("");
              }}
              onRegistryChange={setDirectRegistryId}
            />
            <div className={styles.actions}>
              <button type="submit" disabled={anyBusy || !directReady}>
                {submitLabel(busy === "direct", directMode)}
              </button>
            </div>
          </form>
        </article>
      </section>

      <section>
        <header>
          <div>
            <p>FROM APPLICATIONS</p>
            <h2>지원서에서 생성</h2>
          </div>
          <span>{pending.length}</span>
        </header>
        {pending.length ? pending.map((item) => (
          <ApplicationProvisionCard
            key={item.id}
            item={item}
            availableCards={availableCards}
            busy={busy}
            onCreate={create}
            onDone={() => setPending((items) => items.filter((row) => row.id !== item.id))}
          />
        )) : <div className={styles.empty}>계정을 기다리는 지원서가 없습니다.</div>}
      </section>
    </div>
  );
}

function ApplicationProvisionCard({
  item,
  availableCards,
  busy,
  onCreate,
  onDone,
}: {
  item: PendingTutorApplication;
  availableCards: AvailableTutorCard[];
  busy: string | null;
  onCreate: (
    payload: Record<string, unknown>,
    key: string,
    onDone?: (result: ProvisionResult) => void,
  ) => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<CardMode>("");
  const [registryId, setRegistryId] = useState("");
  const key = `request-${item.id}`;
  const ready = tutorCardChoiceIsReady(mode, registryId, availableCards);
  const anyBusy = busy !== null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    onCreate(
      {
        requestId: item.id,
        cardMode: mode,
        existingRegistryId: mode === "link" ? registryId : null,
      },
      key,
      onDone,
    );
  }

  return (
    <article>
      <form className={styles.provisionForm} onSubmit={submit}>
        <div className={styles.title}>
          <div>
            <small>#{item.id} · 튜터 지원</small>
            <h3>{item.full_name}</h3>
            <p>{item.email} · {item.phone}</p>
          </div>
          <time>{formatDate(item.created_at)}</time>
        </div>
        {(item.university || item.subjects) && (
          <span className={styles.sent}>
            {[item.university, item.subjects].filter(Boolean).join(" · ")}
          </span>
        )}
        <TutorCardChoiceFields
          idPrefix={`request-${item.id}`}
          mode={mode}
          registryId={registryId}
          availableCards={availableCards}
          disabled={anyBusy}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            if (nextMode !== "link") setRegistryId("");
          }}
          onRegistryChange={setRegistryId}
        />
        <div className={styles.actions}>
          <button type="submit" disabled={anyBusy || !ready}>
            {submitLabel(busy === key, mode)}
          </button>
        </div>
      </form>
    </article>
  );
}

function submitLabel(isBusy: boolean, mode: CardMode) {
  if (isBusy) return "생성 중…";
  if (mode === "create") return "계정 및 새 카드 생성";
  if (mode === "link") return "계정 생성 및 기존 카드 연결";
  return "카드 처리 방식 선택 필요";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
