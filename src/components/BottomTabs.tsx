import { mobileTabs } from "../data/content";
import type { ModalKey, NavKey, SessionUser } from "../types";
import styles from "./BottomTabs.module.scss";

const tabToNav: NavKey[] = ["home", "features", "features", "features", "profile"];

interface BottomTabsProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  user: SessionUser | null;
  onOpenModal: (key: ModalKey) => void;
  onMapTabClick?: () => void;
  featureViewMode?: "chat" | "map";
}

export function BottomTabs({ active, onNavigate, user, onOpenModal, onMapTabClick, featureViewMode = "chat" }: BottomTabsProps) {
  const handleTabClick = (index: number) => {
    const nav = tabToNav[index];
    // 地图 tab（index 2）点击时触发地图视图
    if (index === 2) {
      onMapTabClick?.();
      return;
    }
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
        const isActive =
          (index === 1 && active === "features" && featureViewMode === "chat") ||
          (index === 2 && active === "features" && featureViewMode === "map") ||
          (index !== 1 && index !== 2 && active === nav);
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
