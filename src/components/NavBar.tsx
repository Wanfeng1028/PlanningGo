import { Menu, X } from "lucide-react";
import { useState } from "react";
import { navItems } from "../data/navigation";
import type { ModalKey, NavKey, SessionUser } from "../types";
import { Button } from "./Button";
import styles from "./NavBar.module.scss";

interface NavBarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  onOpenModal: (key: ModalKey) => void;
  user: SessionUser | null;
  onLogout: () => void;
}

export function NavBar({ active, onNavigate, onOpenModal, user, onLogout }: NavBarProps) {
  const [open, setOpen] = useState(false);

  const handleNavigate = (key: NavKey) => {
    onNavigate(key);
    setOpen(false);
  };

  return (
    <>
      <nav className={styles.nav} aria-label="主导航">
        <button className={styles.brand} type="button" onClick={() => handleNavigate("home")}>
          <span className={styles.brandDot} aria-hidden="true" />
          <span>周末有谱</span>
        </button>
        <div className={styles.links}>
          {navItems.map((item) => (
            <button
              className={`${styles.link} ${active === item.key ? styles.active : ""}`}
              type="button"
              key={item.key}
              aria-current={active === item.key ? "page" : undefined}
              onClick={() => handleNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          {user ? (
            <>
              <button className={styles.userBadge} type="button" onClick={() => handleNavigate("profile")}>
                {user.mode === "guest" ? "游客" : user.name}
              </button>
              <Button variant="dark" size="small" onClick={onLogout}>退出</Button>
            </>
          ) : (
            <>
              <button className={styles.loginLink} type="button" onClick={() => onOpenModal("login")}>登录</button>
              <Button size="small" onClick={() => onOpenModal("register")}>免费注册</Button>
            </>
          )}
        </div>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={open ? "关闭菜单" : "打开菜单"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      <div className={styles.mobilePanel} hidden={!open}>
        {navItems.map((item) => (
          <button
            className={`${styles.link} ${active === item.key ? styles.active : ""}`}
            type="button"
            key={item.key}
            onClick={() => handleNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
        <div className={styles.mobileActions}>
          {user ? (
            <>
              <Button variant="ghost" size="small" onClick={() => handleNavigate("profile")}>{user.mode === "guest" ? "游客" : user.name}</Button>
              <Button variant="dark" size="small" onClick={onLogout}>退出</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="small" onClick={() => onOpenModal("login")}>登录</Button>
              <Button size="small" onClick={() => onOpenModal("register")}>免费注册</Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
