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
        title="所有账号和画像页面都归到这里"
        intro="43 页身份选择、游客画像、登录注册、画像设置，28 页差异登录稿和最终 100 页隐私记忆，都被归并为个人中心页面与弹窗流程。"
        onOpenModal={onOpenModal}
      />
      <section className={styles.section}>
        <SectionHeader
          eyebrow="小明画像"
          title="让下次规划少问一点"
          intro="画像卡不是静态展示，后续后端会用它驱动约束合并、地点召回和风险校验。"
        />
        <div className={styles.twoGrid}>
          <article className={styles.card}>
            <span className={styles.cardIcon}>
              <UserRound size={22} />
            </span>
            <h3>家庭默认画像</h3>
            <p>杭州，孩子 5 岁，周末下午偏好低负担路线；晚餐尽量照顾减脂习惯，避免长时间排队。</p>
            <div className={styles.actions}>
              <Button onClick={() => onOpenModal("register")}>编辑画像</Button>
              <Button variant="ghost" onClick={() => onOpenModal("privacy")}>
                导出记忆
              </Button>
            </div>
          </article>
          <article className={styles.card}>
            <span className={styles.cardIcon}>
              <ShieldCheck size={22} />
            </span>
            <h3>权限边界</h3>
            <p>定位、日历、分享、通知、记忆导出均可单独管理。支付只做交接，不让 Agent 自动付款。</p>
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
