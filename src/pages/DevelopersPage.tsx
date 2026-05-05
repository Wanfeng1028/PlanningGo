import { SectionHeader } from "../components/SectionHeader";
import { PageCoverage } from "../components/PageCoverage";
import { developerBlocks } from "../data/content";
import type { ModalKey } from "../types";
import { FlowPage } from "./FlowPage";
import styles from "./Pages.module.scss";

const logs = [
  ["09:03:12", "map.route.query", "success"],
  ["09:03:18", "weather.risk.check", "success"],
  ["09:03:27", "restaurant.availability", "retry"],
  ["09:04:02", "ticket.hold.preview", "mock"],
  ["09:04:18", "calendar.ics.generate", "success"],
];

interface DevelopersPageProps {
  onOpenModal: (key: ModalKey) => void;
}

export function DevelopersPage({ onOpenModal }: DevelopersPageProps) {
  return (
    <>
      <FlowPage
        blocks={developerBlocks}
        eyebrow="开发者"
        title="可观测的 Agent 后台"
        intro="API Key、工具调用日志、Webhook、质量看板和测试数据集都归入开发者，不和普通用户规划流程混杂。"
        onOpenModal={onOpenModal}
      />
      <section className={styles.section}>
        <SectionHeader
          eyebrow="工具调用日志"
          title="每一步都能审计"
          intro="用于后续接 Fastify、LangGraph/Vercel AI SDK、高德地图、天气和 Mock Booking Adapter。"
        />
        <div className={styles.console}>
          {logs.map(([time, action, status]) => (
            <div className={styles.log} key={action}>
              <span>{time}</span>
              <strong>{action}</strong>
              <em>{status}</em>
            </div>
          ))}
        </div>
      </section>
      <PageCoverage nav="developers" />
    </>
  );
}
