import { mobileTabs } from "../data/content";
import type { NavKey } from "../types";
import styles from "./BottomTabs.module.scss";

const tabToNav: NavKey[] = ["home", "features", "features", "features", "profile"];

interface BottomTabsProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
}

export function BottomTabs({ active, onNavigate }: BottomTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="移动端底部导航">
      {mobileTabs.map((tab, index) => {
        const Icon = tab.icon;
        const nav = tabToNav[index];
        const isActive = active === nav || (index === 2 && active === "features") || (index === 3 && active === "features");
        return (
          <button
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
            type="button"
            key={tab.label}
            onClick={() => onNavigate(nav)}
          >
            <Icon aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
