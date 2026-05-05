import { SectionHeader } from "../components/SectionHeader";
import { PageCoverage } from "../components/PageCoverage";
import { caseCards } from "../data/content";
import styles from "./Pages.module.scss";

export function CasesPage() {
  return (
    <>
      <SectionHeader
        eyebrow="场景案例"
        title="每个案例都能回到同一条执行流"
        intro="场景案例不再散落成单页，而是围绕家庭、朋友、情侣、雨天和迟到压缩等任务模式组织。"
      />
      <section className={styles.grid}>
        {caseCards.map((card) => (
          <article className={styles.card} key={card.title}>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <div className={styles.caseTags}>
              {card.tags.map((tag) => (
                <span className={styles.tag} key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <strong className={styles.metric}>{card.metric}</strong>
          </article>
        ))}
      </section>
      <PageCoverage nav="cases" />
    </>
  );
}
