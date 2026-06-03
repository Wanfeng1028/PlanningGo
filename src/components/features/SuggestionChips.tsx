import type { ToastType } from "../GlassToast";
import styles from "../../pages/FeaturesPage.module.scss";

interface SuggestionItem {
  id: string;
  category: string;
  label: string;
  description: string;
  action: {
    type: string;
    label: string;
    payload: Record<string, string>;
  };
}

type OnToast = (text: string, type?: ToastType) => void;

export function SuggestionChips({
  suggestions,
  onAction,
  onToast,
}: {
  suggestions: SuggestionItem[];
  onAction?: (suggestion: SuggestionItem) => void;
  onToast?: OnToast;
}) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className={styles.suggestionStrip}>
      {suggestions.map((item) => (
        <button
          key={item.id}
          className={styles.suggestionChipBtn}
          onClick={() => {
            if (onAction) {
              onAction(item);
            } else {
              onToast?.(`${item.label}：${item.description}`, "info");
            }
          }}
          title={item.description}
        >
          <span className={styles.suggestionChipIcon}>
            {item.category === "饮品" ? "🧋" :
             item.category === "甜品" ? "🍰" :
             item.category === "散步" ? "🚶" :
             item.category === "拍照" ? "📸" :
             item.category === "休息" ? "☕" :
             item.category === "冰淇淋" ? "🍦" :
             item.category === "桌游" ? "🎲" :
             item.category === "密室" ? "🔐" :
             item.category === "夜市" ? "🏮" :
             item.category === "咖啡" ? "☕" :
             item.category === "便利店" ? "🏪" : "💡"}
          </span>
          <span className={styles.suggestionChipLabel}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
