"use client";

import styles from "../applications/applications.module.css";

export type AvailableTutorCard = {
  registry_id: string;
  name: string;
  university: string | null;
  exam: string;
  active: boolean;
  display_order: number;
};

export type CardMode = "" | "create" | "link";

export function TutorCardChoiceFields({
  idPrefix,
  mode,
  registryId,
  availableCards,
  disabled,
  onModeChange,
  onRegistryChange,
}: {
  idPrefix: string;
  mode: CardMode;
  registryId: string;
  availableCards: AvailableTutorCard[];
  disabled: boolean;
  onModeChange: (mode: Exclude<CardMode, "">) => void;
  onRegistryChange: (registryId: string) => void;
}) {
  const helpId = `${idPrefix}-card-help`;
  const hasAvailableCards = availableCards.length > 0;

  return (
    <fieldset className={styles.cardChoice} aria-describedby={helpId}>
      <legend>튜터 카드 처리 방식 <b>필수</b></legend>
      <p id={helpId}>중복 방지를 위해 새 카드를 만들지, 미사용 카드에 연결할지 확인해 주세요.</p>
      <div className={styles.cardChoiceGrid}>
        <label data-selected={mode === "create"}>
          <input
            type="radio"
            name={`${idPrefix}-card-mode`}
            checked={mode === "create"}
            disabled={disabled}
            onChange={() => onModeChange("create")}
          />
          <span>
            <b>새 카드 생성</b>
            <small>지원 정보로 비공개 초안 카드를 만듭니다.</small>
          </span>
        </label>
        <label data-selected={mode === "link"} data-disabled={!hasAvailableCards}>
          <input
            type="radio"
            name={`${idPrefix}-card-mode`}
            checked={mode === "link"}
            disabled={disabled || !hasAvailableCards}
            onChange={() => onModeChange("link")}
          />
          <span>
            <b>기존 카드 연결</b>
            <small>미리 만든 카드의 내용은 바꾸지 않고 계정만 연결합니다.</small>
          </span>
        </label>
      </div>
      {mode === "link" && (
        <label className={styles.cardSelect}>
          <span>연결할 미사용 카드</span>
          <select
            value={registryId}
            onChange={(event) => onRegistryChange(event.target.value)}
            required
            disabled={disabled}
          >
            <option value="">카드를 선택해 주세요</option>
            {availableCards.map((card) => (
              <option key={card.registry_id} value={card.registry_id}>
                {card.registry_id} · {card.name} · {card.university || card.exam || "정보 없음"} · {card.active ? "공개" : "비공개"}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hasAvailableCards && (
        <small className={styles.cardChoiceEmpty}>현재 연결 가능한 기존 카드가 없습니다.</small>
      )}
    </fieldset>
  );
}

export function tutorCardChoiceIsReady(
  mode: CardMode,
  registryId: string,
  availableCards: AvailableTutorCard[],
) {
  return mode === "create" || (
    mode === "link"
    && availableCards.some((card) => card.registry_id === registryId)
  );
}
