import { motion } from "framer-motion";
import type { ModalKey, NavKey } from "../types";
import styles from "./Pages.module.scss";

interface HomePageProps {
  onNavigate: (key: NavKey) => void;
  onOpenModal: (key: ModalKey) => void;
}

const routeStops = ["浙大紫金港", "地铁/打车", "断桥", "白堤散步", "湖滨休息"];

const designCards = [
  {
    label: "定位",
    title: "先确定用户在哪里",
    desc: "别离家太远必须依赖定位或手动起点，本次示例为浙大紫金港。",
  },
  {
    label: "规划",
    title: "生成 3 套下午方案",
    desc: "亲子低负担、朋友轻社交、雨天室内，各自有时间线和风险。",
  },
  {
    label: "执行",
    title: "预约/锁单/分享",
    desc: "确认后 Agent 安排餐厅、票务、日历、导航，支付由用户本人完成。",
  },
  {
    label: "协作",
    title: "递给老婆 / 发给朋友",
    desc: "家人确认、朋友投票，反馈会触发方案微调。",
  },
  {
    label: "记忆",
    title: "把偏好沉淀下来",
    desc: "下次少问，自动避开排队和高负担路线。",
  },
  {
    label: "兜底",
    title: "失败也能继续走",
    desc: "天气、排队、预算冲突、工具失败都有替代方案。",
  },
];

const homeSections = [
  {
    title: "这不是搜索推荐，是帮你把事做完",
    intro: "从一句话到可执行安排：路线、餐厅、票务、日历、分享与记忆。",
  },
  {
    title: "家庭 / 朋友双场景入口",
    intro: "家庭：孩子 5 岁、老婆减脂；朋友：4 人，2 男 2 女。",
  },
  {
    title: "核心能力总览",
    intro: "定位、画像、Planning、地图、餐厅库存、授权执行、协作反馈。",
  },
];

export function HomePage({ onNavigate, onOpenModal }: HomePageProps) {
  return (
    <div className={styles.homeLongPage}>
      <section className={`${styles.homeStage} ${styles.homeStageLanding}`}>
        <div className={styles.stageHalo} aria-hidden="true" />
        <motion.div
          className={styles.heroCopy}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className={styles.eyebrow}>Meituan Hackathon Demo · 方案</span>
          <h1>
            一款本地生活Agent!
            <br />
            把周末从 "纠结" 到帮你彻底安排好!
          </h1>
          <p className={styles.lead}>
            输入一句话，系统自动理解同行人、预算、天气、距离、餐饮偏好和备选预案，
            <br />
            给出可解释、可预订、可分享的本地生活周末方案。
          </p>
          <div className={styles.actions}>
            <button className={styles.darkCta} type="button" onClick={() => onNavigate("features")}>开始试用</button>
            <button className={styles.yellowCta} type="button" onClick={() => onOpenModal("guest")}>游客体验</button>
          </div>
          <div className={styles.stats}>
            {[
              ["平均决策时间", "3 分钟", "从想法到路线"],
              ["约束检查", "12 项", "天气/距离/预算/排队"],
              ["备选方案", "3 套", "临时变化不慌"],
            ].map(([label, value, desc]) => (
              <span className={styles.stat} key={label as string}>
                <span>{label}</span>
                <strong>{value}</strong>
                <em>{desc}</em>
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          className={styles.demoBoard}
          initial={{ opacity: 0, x: 34, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.66, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        >
          <div className={styles.demoInput}>
            <strong>今天想怎么过？</strong>
            <span>亲子 / 约会 / 朋友聚会 / 雨天室内</span>
          </div>
          <motion.div
            className={styles.planCard}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className={styles.promptBubble}>周六下午，想带爸妈在上海轻松逛逛，预算人均 200。<br />不要太累，晚饭要靠谱。</p>
            <h2>首选方案：慢逛武康路 + 衡山坊晚餐</h2>
            <div className={styles.planMeta}>
              {["可信度 92", "步行少", "晚餐可订", "雨天可切换"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className={styles.routeList}>
              {[
                ["14:00", "咖啡集合", "yellow"],
                ["15:10", "街区漫步", "blue"],
                ["17:30", "预约晚餐", "green"],
                ["19:30", "打车回家", "pink"],
              ].map(([time, stop, tone], index) => (
                <motion.div
                  className={`${styles.routeStop} ${styles[`routeStop${tone as string}`]}`}
                  key={time as string}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                >
                  <span />
                  <strong>{time}</strong>
                  <em>{stop}</em>
                </motion.div>
              ))}
            </div>
            <button className={styles.saveButton} type="button" onClick={() => onOpenModal("vote")}>
              保存并发给家人
            </button>
          </motion.div>
        </motion.div>
        <div className={styles.landingBottomActions}>
          <button type="button" onClick={() => onNavigate("features")}>了解功能</button>
          <button type="button" onClick={() => onNavigate("features")}>进入规划</button>
        </div>
      </section>

      {homeSections.map((section, sectionIndex) => (
        <section className={styles.designScreen} key={section.title}>
          <div className={styles.sectionIntro}>
            <h2>{section.title}</h2>
            <p>{section.intro}</p>
          </div>
          <motion.div
            className={styles.designGrid}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-120px" }}
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: 0.14,
                },
              },
            }}
          >
            {designCards.map((card, index) => (
              <motion.article
                className={styles.designCard}
                variants={{
                  hidden: { opacity: 0, y: 28, scale: 0.96 },
                  show: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { duration: 0.44, ease: [0.16, 1, 0.3, 1] },
                  },
                }}
                key={`${sectionIndex}-${card.title}`}
              >
                <span>{card.label}</span>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>
      ))}
      <section className={styles.demoScreen}>
        <div className={styles.demoScreenCopy}>
          <span className={styles.eyebrow}>进入演示：小明已登录</span>
          <h2>一句话，把周末安排到可执行</h2>
          <p>围绕杭州西湖示例：从浙大紫金港出发，自动判断距离、天气、排队、餐厅库存，并把计划发给老婆/朋友确认。</p>
          <div className={styles.actions}>
            <button className={styles.yellowCta} type="button" onClick={() => onNavigate("features")}>开始演示</button>
            <button className={styles.darkCta} type="button" onClick={() => onNavigate("features")}>查看流程</button>
          </div>
        </div>
        <div className={styles.mapDemo}>
          <h3>首页演示地图</h3>
          <div className={styles.mapRoad} />
          <span className={styles.mapPinOne}>浙大紫金港</span>
          <span className={styles.mapPinTwo}>地铁/打车</span>
          <span className={styles.mapPinThree}>断桥</span>
          <article className={styles.routeSummary}>
            <h4>路线摘要</h4>
            <p>从浙大紫金港出发，优先 40 分钟内可达提前晚餐点。</p>
            <div>
              <span><strong>4.5h</strong>总时长</span>
              <span><strong>￥420</strong>预算</span>
            </div>
            <button type="button">查看导航</button>
          </article>
        </div>
      </section>
    </div>
  );
}
