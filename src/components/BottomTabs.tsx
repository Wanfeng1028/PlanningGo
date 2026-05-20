import { mobileTabs } from "../data/content";
import type { ModalKey, NavKey, SessionUser } from "../types";
import styles from "./BottomTabs.module.scss";

const tabToNav: NavKey[] = ["home", "features", "features", "features", "profile"];

interface BottomTabsProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  user: SessionUser | null;
  onOpenModal: (key: ModalKey) => void;
}

export function BottomTabs({ active, onNavigate, user, onOpenModal }: BottomTabsProps) {
  const handleTabClick = (index: number) => {
    const nav = tabToNav[index];
    // 未登录时，除首页外的 tab 需要登录
    if (!user && nav !== "home") {
      onOpenModal("login");
      return;
    }
    onNavigate(nav);
  };

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
            onClick={() => handleTabClick(index)}
          >
            <Icon aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
