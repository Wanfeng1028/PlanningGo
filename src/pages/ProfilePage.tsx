import { ShieldCheck, UserRound } from "lucide-react";
import { Button } from "../components/Button";
import { SectionHeader } from "../components/SectionHeader";
import { profileBlocks, scoreboard } from "../data/content";
import type { ModalKey } from "../types";
import { FlowPage } from "./FlowPage";
import styles from "./Pages.module.scss";

interface ProfilePageProps {
  onOpenModal: (key: ModalKey) => void;
}

export function ProfilePage({ onOpenModal }: ProfilePageProps) {
  return (
    <>
      <FlowPage
        blocks={profileBlocks}
        eyebrow="个人中心"
        title="把账号、偏好和隐私集中管理"
        intro="登录、注册、偏好设置、通知方式和隐私管理都放在这里，方便一次看清、一次改好。"
        onOpenModal={onOpenModal}
      />
      <section className={styles.section}>
        <SectionHeader
          eyebrow="我的偏好"
          title="下次规划会更懂你"
          intro="这里不是静态资料页，而是会持续记录你的出行习惯、预算偏好和常见选择。"
        />
        <div className={styles.twoGrid}>
          <article className={styles.card}>
            <span className={styles.cardIcon}>
              <UserRound size={22} />
            </span>
            <h3>家庭默认偏好</h3>
            <p>已记录亲子出行、轻松路线、适中预算和减少排队等常见需求，后续还可以继续补充。</p>
            <div className={styles.actions}>
              <Button onClick={() => onOpenModal("register")}>编辑偏好</Button>
              <Button variant="ghost" onClick={() => onOpenModal("privacy")}>
                查看隐私
              </Button>
            </div>
          </article>
          <article className={styles.card}>
            <span className={styles.cardIcon}>
              <ShieldCheck size={22} />
            </span>
            <h3>权限边界</h3>
            <p>定位、通知、日历和支付等能力都会按步骤征得确认，不会在你不知情的情况下直接执行。</p>
            <div className={styles.grid}>
              {scoreboard.map((item) => {
                const Icon = item.icon;
                return (
                  <span className={styles.stat} key={item.label}>
                    <Icon size={18} />
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </span>
                );
              })}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
