import { motion } from "framer-motion";
import { useEffect, useState } from "react";
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

const routeOverviewStops = [
  { badge: "起", tone: "brand", title: "浙大紫金港", detail: "出发地", time: "09:00 出发" },
  { badge: "行", tone: "blue", title: "地铁 / 打车", detail: "约 40 分钟", time: "09:00-09:40" },
  { badge: "景", tone: "green", title: "小众景点", detail: "游玩 2.5 小时", time: "10:00-12:30" },
  { badge: "餐", tone: "purple", title: "本地餐厅", detail: "用餐 1 小时", time: "12:40-13:40" },
  { badge: "购", tone: "orange", title: "特色商圈", detail: "逛街 1.5 小时", time: "14:00-15:30" },
  { badge: "返", tone: "brand", title: "返回出发地", detail: "预计 16:30 到达", time: "16:30" },
];

const routeOverviewStats = [
  { value: "7.5", unit: "小时", label: "总时长" },
  { value: "约 48", unit: "km", label: "总距离" },
  { value: "￥420", unit: "起", label: "预算" },
];

const whyChooseCards = [
  {
    icon: "⚡",
    tone: "blue",
    title: "智能规划",
    desc: "基于时间、距离、交通等多维度智能生成最优路线",
  },
  {
    icon: "🗓",
    tone: "green",
    title: "帮你执行",
    desc: "精确到每个时间段，包含交通、游玩、用餐等安排",
  },
  {
    icon: "👥",
    tone: "orange",
    title: "社交分享",
    desc: "一键生成美食行程卡片，分享给朋友或家人",
  },
  {
    icon: "🛡",
    tone: "purple",
    title: "持续优化",
    desc: "基于用户反馈不断优化算法，提供更好的规划体验",
  },
];

export function HomePage({ onNavigate, onOpenModal }: HomePageProps) {
  const [activeSection, setActiveSection] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  useEffect(() => {
    if (isCarouselPaused) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveSection((current) => (current + 1) % homeSections.length);
    }, 5600);

    return () => window.clearInterval(timer);
  }, [isCarouselPaused]);

  const prevSection = () => {
    setActiveSection((current) => (current - 1 + homeSections.length) % homeSections.length);
  };

  const nextSection = () => {
    setActiveSection((current) => (current + 1) % homeSections.length);
  };

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
          <span className={styles.eyebrow}>周末有谱 · 本地生活规划</span>
          <h1>
            一款本地生活Agent!
            <br />
            把周末从“纠结”到彻底安排好
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
          <button className={styles.softCta} type="button" onClick={() => onNavigate("features")}>了解功能</button>
          <button className={styles.yellowCta} type="button" onClick={() => onNavigate("features")}>进入规划</button>
          <button className={styles.darkCta} type="button" onClick={() => onOpenModal("contact")}>联系我们</button>
        </div>
      </section>

      <section className={styles.designScreen}>
        <div
          className={styles.designCarouselFrame}
          onMouseEnter={() => setIsCarouselPaused(true)}
          onMouseLeave={() => setIsCarouselPaused(false)}
        >
          <div className={styles.designCarouselTopbar}>
            <div className={styles.designCarouselDots} aria-label="首页功能轮播分页">
              {homeSections.map((section, index) => (
                <button
                  key={section.title}
                  type="button"
                  className={index === activeSection ? styles.designCarouselDotActive : styles.designCarouselDot}
                  aria-label={`切换到第 ${index + 1} 屏`}
                  onClick={() => setActiveSection(index)}
                />
              ))}
            </div>
            <div className={styles.designCarouselArrows}>
              <button type="button" className={styles.designCarouselArrow} aria-label="上一屏" onClick={prevSection}>
                ←
              </button>
              <button type="button" className={styles.designCarouselArrow} aria-label="下一屏" onClick={nextSection}>
                →
              </button>
            </div>
          </div>

          <div className={styles.designCarouselViewport}>
            <motion.div
              className={styles.designCarouselTrack}
              animate={{ x: `-${activeSection * 100}%` }}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            >
              {homeSections.map((section, sectionIndex) => (
                <article className={styles.designCarouselSlide} key={section.title}>
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
                    {designCards.map((card) => (
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
                        <span className={styles.designCardTag}>{card.label}</span>
                        <h3 className={styles.designCardTitle}>{card.title}</h3>
                        <p className={styles.designCardDesc}>{card.desc}</p>
                      </motion.article>
                    ))}
                  </motion.div>
                </article>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section className={styles.whyChooseScreen}>
        <div className={styles.whyChooseIntro}>
          <span>WHY CHOOSE US</span>
          <h2>为什么选择我们</h2>
          <p>我们帮你把灵感变成计划，把计划变成美好的回忆。</p>
        </div>
        <div className={styles.whyChooseGrid}>
          {whyChooseCards.map((card) => (
            <article className={styles.whyChooseCard} key={card.title}>
              <span className={`${styles.whyChooseIcon} ${styles[`whyChooseIcon${card.tone}`]}`}>
                {card.icon}
              </span>
              <div className={styles.whyChooseCopy}>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.demoScreen}>
        <div className={styles.routeOverviewBoard}>
          <div className={styles.routeOverviewPanel}>
            <h3 className={styles.routeOverviewTitle}>行程概览</h3>
            <div className={styles.routeOverviewList}>
              {routeOverviewStops.map((stop) => (
                <article className={styles.routeOverviewItem} key={`${stop.title}-${stop.time}`}>
                  <span className={`${styles.routeOverviewBadge} ${styles[`routeOverviewBadge${stop.tone}`]}`}>
                    {stop.badge}
                  </span>
                  <div className={styles.routeOverviewCopy}>
                    <strong>{stop.title}</strong>
                    <span>{stop.detail}</span>
                  </div>
                  <time className={styles.routeOverviewTime}>{stop.time}</time>
                </article>
              ))}
            </div>
            <div className={styles.routeOverviewStats}>
              {routeOverviewStats.map((item) => (
                <article className={styles.routeOverviewStat} key={item.label}>
                  <span>{item.label}</span>
                  <strong>
                    {item.value}
                    <em>{item.unit}</em>
                  </strong>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.mapDemo}>
          <div className={styles.mapRoad}>
            <span className={`${styles.routeNode} ${styles.routeNodeStart}`} aria-hidden="true" />
            <span className={`${styles.routeNode} ${styles.routeNodeFood}`} aria-hidden="true" />
            <span className={`${styles.routeNode} ${styles.routeNodeShop}`} aria-hidden="true" />
            <span className={`${styles.routeNode} ${styles.routeNodeEnd}`} aria-hidden="true" />
            <span className={styles.routeCar} aria-hidden="true">🚗</span>
          </div>
          <span className={styles.routeCallout}>推荐路线</span>
          <article className={styles.routeSummary}>
            <h4>路线摘要</h4>
            <p>从浙大紫金港出发，优先 40 分钟内可达的晚餐地点。</p>
            <div>
              <span><strong>4.5h</strong>总时长</span>
              <span><strong>￥420</strong>预算</span>
            </div>
            <button
              className={`${styles.yellowCta} ${styles.routeSummaryAction}`}
              type="button"
              onClick={() => onNavigate("features")}
            >
              查看详情
            </button>
          </article>
          </div>
        </div>
      </section>
    </div>
  );
}
