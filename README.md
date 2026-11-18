# Moaclab CAD Viewer

Discourse 主题组件，在 moaclab.com 内查看 STEP、IGES、DXF、DWG、GLB、STL 与 OBJ 模型，并支持在帖子里用 `[moaclab-3d]` 短代码嵌入模型。

## 依赖

组件只负责前端界面，运行依赖服务端插件 `discourse-moaclab-tools`：

- 页面路由与持久化模型 ID（`/viewer`、`/moaclab-cad/models.json`）
- 查看器资源：`/plugins/discourse-moaclab-tools/viewer/v055/`（viewer bundle、OCCT 与 Draco 的 JS/WASM）

插件不在或版本不匹配时，组件无法加载模型。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `show_sidebar_link` | `false` | 自动在侧栏添加 3D Viewer。已在后台导航菜单维护链接时保持关闭。 |
| `embed_viewer_base` | `/viewer` | 渲染 `[moaclab-3d]` 短代码时使用的地址前缀。 |

## 生成文件

`javascripts/discourse/lib/cad-workbench-geometry.js`（打包后的 three.js 子集）和 `cad-workbench-icons.js`（Lucide 图标，MIT）由早期的 `scripts/build-workbench.cjs` 生成。该脚本不在线上导出中，目前按已生成文件维护；需要重新生成时先补回脚本。

## 开发验证

使用 Node.js 22，运行 `npm ci` 和 `npm test`：检查元数据、编译 SCSS、打包 JavaScript，并运行 `test/` 下的光照和深度单元测试。

改版本时同步更新 `about.json` 的 `theme_version` 和 `package.json` 的 `version`，检查会对比两者。

## 发布

走 PR 合并到 `main`，再按 Moaclab 维护仓库的 `ops/release.md` 更新到网站。

## 来源

2026-11-18 从生产站点组件 188（0.6.3，ZIP 安装）导出，整理为 Git 仓库。
