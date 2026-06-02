import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ConfirmActions } from "../../components/FeatureModal";
import { WorkspaceModal } from "../../components/WorkspaceModal";
import type { NavKey, SessionUser } from "../../types";
import type { ChatSession, ModelMode } from "./types";
import { SIDEBAR_NAV, formatRelativeTime } from "./constants";
import styles from "../../pages/FeaturesPage.module.scss";

/* ── Sidebar ── */
export function FeaturesSidebar({
  user,
  city,
  open,
  onClose,
  onNewChat,
  onNavItemClick,
  chatSessions,
  currentSessionId,
  onSessionClick,
  searchQuery,
  onSearchChange,
  modelMode,
  onModelModeChange,
  onReturnHome,
  onNavigate,
}: {
  user?: SessionUser | null;
  city: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onNavItemClick: (id: string) => void;
  chatSessions: ChatSession[];
  currentSessionId?: string | null;
  onSessionClick: (sessionId: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  modelMode: ModelMode;
  onModelModeChange: (mode: ModelMode) => void;
  onReturnHome?: () => void;
  onNavigate?: (key: NavKey) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleNavClick = (id: string) => {
    if (id === "search") {
      setShowSearch(!showSearch);
    } else {
      onNavItemClick(id);
    }
    onClose();
  };

  const filteredSessions = searchQuery
    ? chatSessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : chatSessions;

  return (
    <>
      {open && <div className={styles.sidebarOverlay} onClick={onClose} />}
      <aside className={`${styles.featureSidebar} ${open ? styles.featureSidebarOpen : ""}`}>
        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogoRow}>
            <img className={styles.sidebarLogo} src="/avatar/planninggo-avatar-512.png" alt="周末去哪儿" />
            <span className={styles.sidebarBrand}>周末去哪儿</span>
          </div>
          {onReturnHome && (
            <button className={styles.returnHomeBtn} onClick={onReturnHome}>
              <ArrowLeft size={14} />
              返回官网
            </button>
          )}
        </div>

        <button className={styles.sidebarNewBtn} onClick={onNewChat}>
          ✨ 新建规划
        </button>

        {/* Nav */}
        <nav className={styles.sidebarNav}>
          <div className={styles.sidebarNavLabel}>功能</div>
          {SIDEBAR_NAV.map((item) => (
            <button key={item.id} className={styles.sidebarNavItem} onClick={() => handleNavClick(item.id)}>
              <span className={styles.sidebarNavIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Search */}
        {showSearch && (
          <div className={styles.sidebarSearchBox}>
            <input
              type="text"
              placeholder="搜索记录..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={styles.sidebarSearchInput}
            />
          </div>
        )}

        {/* Recent sessions */}
        <div className={styles.sidebarNavLabel}>最近规划</div>
        <div className={styles.sidebarRecent}>
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => (
              <button
                key={session.id}
                className={`${styles.sidebarRecentItem} ${session.id === currentSessionId ? styles.sidebarRecentItemActive : ""}`}
                onClick={() => onSessionClick(session.id)}
              >
                <span className={`${styles.recentDot} ${session.id === currentSessionId ? styles.recentDotActive : ""}`} />
                <span className={styles.recentItemContent}>
                  <span className={styles.recentItemTitle}>{session.title}</span>
                  <span className={styles.recentItemTime}>{formatRelativeTime(session.updatedAt)}</span>
                </span>
              </button>
            ))
          ) : (
            <div className={styles.sidebarEmpty}>{searchQuery ? "没有找到匹配记录" : "还没有对话记录"}</div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarAvatar}>
            {user?.name?.[0] || "游"}
          </div>
          <div className={styles.sidebarUserInfo}>
            <div className={styles.sidebarUserName}>{user?.name || "游客"}</div>
            <div className={styles.sidebarUserTag}>
              {user?.mode === "registered" ? "已注册" : "体验模式"}
            </div>
          </div>
          <button className={styles.sidebarSettingsBtn} title="设置" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      <WorkspaceModal
        open={showSettings}
        onClose={() => { setShowSettings(false); setShowClearConfirm(false); }}
        title="设置"
        subtitle="管理你的规划偏好"
      >
        <div className={styles.settingsList}>
          <button className={styles.settingsItem} onClick={() => {
            const next = modelMode === "Flash" ? "Pro" : "Flash";
            onModelModeChange(next);
          }}>
            <span className={styles.settingsItemIcon}>🤖</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>模型偏好</span>
              <span className={styles.settingsItemDesc}>
                当前：{modelMode === "Flash" ? "Flash · 快速规划" : "Pro · 深度推理"}
              </span>
            </span>
            <span className={styles.settingsItemValue}>{modelMode}</span>
          </button>

          <button className={styles.settingsItem} onClick={() => { onNavigate?.("profile"); onClose(); }}>
            <span className={styles.settingsItemIcon}>📍</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>位置偏好</span>
              <span className={styles.settingsItemDesc}>用于推荐附近目的地</span>
            </span>
            <span className={styles.settingsItemValue}>{city}</span>
          </button>

          <button className={styles.settingsItem} onClick={() => setShowClearConfirm(true)}>
            <span className={styles.settingsItemIcon}>🗑️</span>
            <span className={styles.settingsItemContent}>
              <span className={styles.settingsItemLabel}>清空本地记录</span>
              <span className={styles.settingsItemDesc}>删除草稿和收藏数据</span>
            </span>
          </button>
        </div>
      </WorkspaceModal>

      {/* Clear Confirm Modal */}
      <WorkspaceModal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="清空本地记录"
        width="sm"
        danger
      >
        <p className={styles.confirmText}>
          确定清空本地规划记录吗？清空后草稿和收藏数据将无法恢复。
        </p>
        <ConfirmActions
          confirmLabel="清空记录"
          danger
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            localStorage.removeItem("pg_drafts");
            localStorage.removeItem("pg_favorites");
            setShowClearConfirm(false);
            setShowSettings(false);
          }}
        />
      </WorkspaceModal>
    </>
  );
}
