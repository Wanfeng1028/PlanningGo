import { SectionHeader } from "../components/SectionHeader";
import { developerBlocks } from "../data/content";
import type { ModalKey } from "../types";
import { FlowPage } from "./FlowPage";
import styles from "./Pages.module.scss";

const logs = [
  ["09:03:12", "map.route.query", "success"],
  ["09:03:18", "weather.risk.check", "success"],
  ["09:03:27", "restaurant.availability", "retry"],
  ["09:04:02", "ticket.hold.preview", "preview"],
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
        title="查看运行记录与接口状态"
        intro="把接口凭证、运行日志、回调结果和测试数据集中展示，方便核对每一步执行情况。"
        onOpenModal={onOpenModal}
      />
      <section className={styles.section}>
        <SectionHeader
          eyebrow="运行日志"
          title="每一步都能看清楚"
          intro="从路线查询、天气判断到餐厅可约情况与日历写入，都会按时间顺序记录下来。"
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
    </>
  );
}
