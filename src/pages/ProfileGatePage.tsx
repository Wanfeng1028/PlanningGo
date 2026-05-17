import { useState } from "react";
import { Button } from "../components/Button";
import type { ModalKey, NavKey } from "../types";
import styles from "./Pages.module.scss";

type AuthMode = Extract<ModalKey, "guest" | "login" | "register">;

interface ProfileGatePageProps {
  onNavigate: (key: NavKey) => void;
  onOpenModal: (key: AuthMode) => void;
}

const accessOptions: Array<{
  key: AuthMode;
  title: string;
  desc: string;
  button: string;
  variant: "primary" | "dark";
}> = [
  {
    key: "guest",
    title: "游客体验",
    desc: "使用默认画像，完整体验规划流程，记忆仅临时保存。",
    button: "进入游客模式",
    variant: "primary",
  },
  {
    key: "login",
    title: "登录账号",
    desc: "读取城市、家庭、饮食、预算和历史偏好。",
    button: "去登录",
    variant: "dark",
  },
  {
    key: "register",
    title: "免费注册",
    desc: "30 秒建立个人偏好档案，可跳过画像。",
    button: "去注册",
    variant: "primary",
  },
];

export function ProfileGatePage({ onNavigate, onOpenModal }: ProfileGatePageProps) {
  const [selectedMode, setSelectedMode] = useState<AuthMode>("guest");

  return (
    <section className={styles.profileGate}>
      <div className={styles.profileGateHero}>
        <h1>先选择你的使用方式</h1>
        <p>建议登录或注册。使用登录和注册能够更精准的完成任务规划！</p>
      </div>

      <div className={styles.profileGateGrid}>
        {accessOptions.map((option) => (
          <article
            className={`${styles.profileGateCard} ${
              selectedMode === option.key ? styles.profileGateCardActive : ""
            }`}
            key={option.key}
            role="button"
            tabIndex={0}
            aria-pressed={selectedMode === option.key}
            onClick={() => setSelectedMode(option.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedMode(option.key);
              }
            }}
          >
            <h2>{option.title}</h2>
            <p>{option.desc}</p>

            <Button
              variant={option.variant}
              onClick={(event) => {
                event.stopPropagation();
                onOpenModal(option.key);
              }}
            >
              {option.button}
            </Button>
          </article>
        ))}
      </div>

      <p className={styles.profileGateHint}>
        
      </p>

      <div className={styles.profileGateBottomActions}>
        <Button variant="ghost" onClick={() => onNavigate("home")}>
          返回首页
        </Button>
        <Button onClick={() => onOpenModal(selectedMode)}>选择并继续</Button>
      </div>
    </section>
  );
}
