import { motion } from "framer-motion";
import { ArrowRight, Play, Route } from "lucide-react";
import { Button } from "../components/Button";
import { PageCoverage } from "../components/PageCoverage";
import { RouteMap } from "../components/RouteMap";
import { SectionHeader } from "../components/SectionHeader";
import { capabilityCards, demoTimeline, heroStats } from "../data/content";
import type { ModalKey, NavKey } from "../types";
import styles from "./Pages.module.scss";

interface HomePageProps {
  onNavigate: (key: NavKey) => void;
  onOpenModal: (key: ModalKey) => void;
}

export function HomePage({ onNavigate, onOpenModal }: HomePageProps) {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>周末生活本地规划 Agent</span>
          <h1>
            一句话，把周末安排到
            <span className={styles.highlight}>可执行</span>
          </h1>
          <p className={styles.lead}>
            围绕杭州西湖示例：从浙大紫金港出发，自动判断距离、天气、排队、餐厅库存，并把计划发给老婆或朋友确认。
          </p>
          <div className={styles.actions}>
            <Button onClick={() => onNavigate("features")}>
              开始演示 <Play size={18} />
            </Button>
            <Button variant="dark" onClick={() => onOpenModal("location")}>
              查看授权边界 <ArrowRight size={18} />
            </Button>
          </div>
          <div className={styles.stats}>
            {heroStats.map((stat) => (
              <span className={styles.stat} key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </span>
            ))}
          </div>
        </div>
        <RouteMap />
      </section>

      <section className={styles.section}>
        <SectionHeader
          eyebrow="这不是搜索推荐"
          title="它要把事做完"
          intro="设计稿里的 43 页核心流、28 页差异版本和最终 100 页都被归并成一个连续产品故事。用户看到的是六个清楚入口，背后是完整执行闭环。"
        />
        <div className={styles.grid}>
          {capabilityCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.article
                className={styles.card}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: index * 0.04 }}
                key={card.title}
              >
                <span className={styles.cardIcon}>
                  <Icon size={22} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeader
          eyebrow="小明的周六上午 9 点"
          title="从一句话到授权执行"
          intro="首页不做空营销，直接展示可讲、可点、可继续开发的 Demo 主线。"
        />
        <div className={styles.twoGrid}>
          <div className={styles.timeline}>
            {demoTimeline.map((item) => (
              <article className={styles.timelineItem} key={item.time}>
                <span className={styles.time}>{item.time}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
          <article className={styles.card}>
            <span className={styles.cardIcon}>
              <Route size={22} />
            </span>
            <h3>按照六大导航顺下来</h3>
            <p>
              首页、功能、场景案例、设计亮点、开发者、个人中心。原稿里适合弹窗的身份选择、定位、预约、票务、支付、投票和隐私流程，都变成对应流程里的可触达弹窗。
            </p>
            <span className={styles.source}>D43 + I28 + V2-100 + Mobile-60</span>
          </article>
        </div>
      </section>
      <PageCoverage nav="home" />
    </>
  );
}
