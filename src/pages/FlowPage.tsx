import { useState } from "react";
import { RevealGroup } from "../components/RevealGroup";
import { Button } from "../components/Button";
import type { ModalKey, NavKey } from "../types";
import styles from "./FlowPage.module.scss";

/* ── props ────────────────────────────────────────────────────────── */

interface FlowPageProps {
  onOpenModal: (key: ModalKey) => void;
  onNavigate: (key: NavKey) => void;
}

/* ── 数据 ─────────────────────────────────────────────────────────── */

const LAYERS = [
  {
    key: "intent",
    icon: "💬",
    title: "理解意图",
    desc: "一句话里的地点、时间、人数和偏好",
    input: "周六下午带孩子出去玩，别太累",
    parsed: ["周六", "亲子", "轻松", "下午"],
    color: "#8b5cf6",
  },
  {
    key: "reason",
    icon: "🧠",
    title: "推荐理由",
    desc: "每个推荐为什么适合你",
    reasons: [
      { name: "亲子展览", score: 94 },
      { name: "公园散步", score: 88 },
      { name: "室内乐园", score: 82 },
    ],
    color: "#2196f3",
  },
  {
    key: "timeline",
    icon: "🕐",
    title: "时间线",
    desc: "按时间排序，标注可预约和可替代",
    stops: [
      { time: "14:00", label: "咖啡", tag: "可预约" },
      { time: "15:10", label: "展览", tag: "可替代" },
      { time: "17:30", label: "晚餐", tag: "已确认" },
    ],
    color: "#16a34a",
  },
  {
    key: "action",
    icon: "✅",
    title: "可执行动作",
    desc: "预约、导航、投票，直接执行",
    actions: ["一键预约", "发送路线", "确认时间", "查看备选"],
    color: "#f59e0b",
  },
];

const BENTO = [
  {
    key: "reason",
    span: "7",
    title: "推荐会说明为什么",
    desc: "每个推荐不是只给一个名字",
    reasons: [
      { name: "亲子展览", active: true },
      { name: "公园散步", active: false },
      { name: "室内乐园", active: false },
    ],
  },
  {
    key: "timeline",
    span: "5",
    title: "行程按时间排好",
    desc: "预约、距离和替代都清楚",
    timeline: ["14:00 咖啡", "15:10 展览", "17:30 晚餐"],
  },
  {
    key: "backup",
    span: "5",
    title: "变化来了不重来",
    desc: "下雨和排队都有备用路径",
    paths: [
      { from: "下雨", to: "室内方案" },
      { from: "排队", to: "换餐厅" },
    ],
  },
  {
    key: "action",
    span: "7",
    title: "结果可以直接执行",
    desc: "不用再切应用",
    actions: ["一键预约", "发送路线", "确认时间", "查看备选"],
  },
];

const STATES = [
  { key: "input", label: "输入", icon: "💬", active: true },
  { key: "parse", label: "解析", icon: "🔍", active: true },
  { key: "reason", label: "推荐", icon: "🧠", active: true },
  { key: "plan", label: "路线", icon: "🗺", active: true },
  { key: "confirm", label: "确认", icon: "✅", active: true },
];

/* ── component ────────────────────────────────────────────────────── */

export function FlowPage({ onOpenModal, onNavigate }: FlowPageProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      {/* ═══════ Hero — 四层剖面 ═══════ */}
      <section className={`${styles.section} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <RevealGroup>
            <span className={styles.eyebrow}>产品逻辑</span>
            <h1 className={styles.heroTitle}>每一层都在做一件事</h1>
            <p className={styles.heroSubtitle}>
              从理解意图到生成可执行动作，四层各司其职。
            </p>
            <div className={styles.heroActions}>
              <Button onClick={() => onOpenModal("guest")}>体验完整流程</Button>
              <Button variant="ghost" onClick={() => onNavigate("features")}>回到总览</Button>
            </div>
          </RevealGroup>
        </div>

        <div className={styles.heroLayers}>
          {LAYERS.map((layer, i) => (
            <div
              key={layer.key}
              className={expandedLayer === layer.key ? styles.layerExpanded : styles.layerCard}
              style={{ "--layer-i": i, "--layer-color": layer.color } as React.CSSProperties}
              onMouseEnter={() => setExpandedLayer(layer.key)}
              onMouseLeave={() => setExpandedLayer(null)}
            >
              <div className={styles.layerHeader}>
                <span className={styles.layerIcon}>{layer.icon}</span>
                <div className={styles.layerInfo}>
                  <span className={styles.layerTitle}>{layer.title}</span>
                  <span className={styles.layerDesc}>{layer.desc}</span>
                </div>
              </div>

              {/* 展开时显示的详情 */}
              {expandedLayer === layer.key && (
                <div className={styles.layerDetail}>
                  {layer.key === "intent" && (
                    <div className={styles.intentPreview}>
                      <span className={styles.intentInputLabel}>输入</span>
                      <strong className={styles.intentInputText}>「{layer.input}」</strong>
                      <div className={styles.intentParsed}>
                        {layer.parsed!.map((p, j) => (
                          <span key={j} className={styles.intentChip}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {layer.key === "reason" && (
                    <div className={styles.reasonPreview}>
                      {layer.reasons!.map((r, j) => (
                        <div key={j} className={styles.reasonItem}>
                          <span className={styles.reasonName}>{r.name}</span>
                          <div className={styles.reasonBar}>
                            <div className={styles.reasonBarFill} style={{ width: `${r.score}%` } as React.CSSProperties} />
                          </div>
                          <span className={styles.reasonScore}>{r.score}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {layer.key === "timeline" && (
                    <div className={styles.timelinePreview}>
                      {layer.stops!.map((s, j) => (
                        <div key={j} className={styles.timelineItem}>
                          <span className={styles.timelineTime}>{s.time}</span>
                          <span className={styles.timelineDot} />
                          <span className={styles.timelineLabel}>{s.label}</span>
                          <span className={styles.timelineTag}>{s.tag}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {layer.key === "action" && (
                    <div className={styles.actionPreview}>
                      {layer.actions!.map((a, j) => (
                        <button key={j} className={styles.actionBtn} type="button">{a}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 层间连接线 */}
              {i < LAYERS.length - 1 && (
                <svg className={styles.layerBeam} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <line x1="10" y1="10" x2="10" y2="20" stroke="var(--color-brand)" strokeWidth="2" strokeDasharray="4 3" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ Bento Grid ═══════ */}
      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionTitle}>四个设计原则</h2>
        </div>

        <div className={styles.bentoGrid}>
          {BENTO.map((item) => (
            <div
              key={item.key}
              className={styles.bentoItem}
              style={{ "--span": item.span } as React.CSSProperties}
            >
              <h3 className={styles.bentoTitle}>{item.title}</h3>
              <p className={styles.bentoDesc}>{item.desc}</p>

              <div className={styles.bentoMockup}>
                {item.key === "reason" && (
                  <div className={styles.bentoReasonMock}>
                    {item.reasons!.map((r, i) => (
                      <div key={i} className={r.active ? styles.bentoChipActive : styles.bentoChip}>
                        {r.name}
                      </div>
                    ))}
                  </div>
                )}

                {item.key === "timeline" && (
                  <div className={styles.bentoTimelineMock}>
                    {item.timeline!.map((t, i) => (
                      <div key={i} className={styles.bentoTimelineItem}>
                        <span className={styles.bentoTimelineDot} />
                        <span className={styles.bentoTimelineText}>{t}</span>
                      </div>
                    ))}
                  </div>
                )}

                {item.key === "backup" && (
                  <div className={styles.bentoBackupMock}>
                    {item.paths!.map((p, i) => (
                      <div key={i} className={styles.bentoBackupPath}>
                        <span className={styles.bentoBackupCondition}>{p.from}</span>
                        <span className={styles.bentoBackupArrow}>→</span>
                        <span className={styles.bentoBackupAction}>{p.to}</span>
                      </div>
                    ))}
                  </div>
                )}

                {item.key === "action" && (
                  <div className={styles.bentoActionMock}>
                    {item.actions!.map((a, i) => (
                      <button key={i} className={styles.bentoActionBtn} type="button">{a}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ 状态轨道 ═══════ */}
      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionTitle}>状态轨道</h2>
        </div>

        <div className={styles.stateTrack}>
          {STATES.map((state, i) => (
            <div key={state.key} className={styles.stateGroup}>
              <div className={state.active ? styles.statePillActive : styles.statePill}>
                <span className={styles.stateIcon}>{state.icon}</span>
                <span className={styles.stateLabel}>{state.label}</span>
              </div>
              {i < STATES.length - 1 && (
                <svg className={styles.stateArrow} viewBox="0 0 40 20" fill="none" aria-hidden="true">
                  <line x1="0" y1="10" x2="30" y2="10" stroke="var(--color-brand)" strokeWidth="2" strokeDasharray="4 3" />
                  <polygon points="30,5 40,10 30,15" fill="var(--color-brand)" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className={`${styles.section} ${styles.cta}`}>
        <RevealGroup>
          <h2 className={styles.ctaTitle}>每个推荐都说明为什么</h2>
          <p className={styles.ctaSubtitle}>不是黑盒推荐，而是透明可解释的推荐。</p>
          <div className={styles.ctaActions}>
            <Button onClick={() => onOpenModal("guest")}>游客体验</Button>
            <Button variant="ghost" onClick={() => onNavigate("features")}>回到总览</Button>
          </div>
        </RevealGroup>
      </section>
    </div>
  );
}
