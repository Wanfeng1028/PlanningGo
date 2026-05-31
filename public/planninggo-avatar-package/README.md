# PlanningGo Avatar Package

原创头像方案：地图定位 + 智能路线 + PG 字母标识。

适用场景：
- GitHub 仓库头像 / README 顶部 Logo
- Web 站点 favicon、移动端图标、PWA 图标
- 项目介绍页、登录页、启动页、分享卡片

文件说明：
- `planninggo-avatar.svg`：主矢量头像，推荐用于网页和 README。
- `planninggo-avatar-1024.png` / `512` / `256` / `128` / `64`：常用 PNG 尺寸。
- `planninggo-avatar-transparent-*.png`：透明圆形版本，适合叠在不同背景上。
- `favicon.svg`、`favicon-16.png`、`favicon-32.png`：浏览器标签页图标。
- `apple-touch-icon.png`：iOS 添加到主屏幕图标。
- `android-chrome-192.png`、`android-chrome-512.png`、`maskable-icon-512.png`：PWA / Android 图标。

建议放置位置：
```text
public/
  avatar/planninggo-avatar.svg
  avatar/planninggo-avatar-512.png
  favicon.svg
  favicon-32.png
  favicon-16.png
  apple-touch-icon.png
  android-chrome-192.png
  android-chrome-512.png
  maskable-icon-512.png
```

HTML 示例：
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

PWA manifest 示例：
```json
{
  "icons": [
    { "src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/maskable-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
