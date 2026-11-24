# Moaclab CAD Viewer

Discourse 主题组件，在 moaclab.com 内查看 STEP、IGES、DXF、DWG、GLB、STL 与 OBJ 模型，并支持在帖子里用 `[moaclab-3d]` 短代码嵌入模型。

## 依赖

组件只负责前端界面，运行依赖服务端插件 `discourse-moaclab-tools`：

- 页面路由与持久化模型 ID（`/viewer`、`/moaclab-cad/models.json`）
- 查看器资源：`/plugins/discourse-moaclab-tools/viewer/v055/`（viewer bundle、OCCT 与 Draco 的 JS/WASM）

插件不在或版本不匹配时，组件无法加载模型。

`/viewer` 不带参数时的图纸列表由插件渲染，组件只改它的外观和入口：

- 数据来源：设置 `library_category_id` 不为 0 时，组件用 `api.modifyClass("component:moaclab-cad-library")` 改写列表的 `load()`，改为取该栏目的全部话题（排除栏目说明帖），搜索走 `/search.json` 并限定栏目；带模型的话题仍从 `/moaclab-cad/drawings.json` 取格式标签（`cad-library-source.js`）。
- 样式按 Instagram 主题的发现页网格重排，颜色用该主题的 `--ig-*` 变量，其他主题下退回 Discourse 颜色。
- 隐藏格式筛选和插件的两个头部链接，换成一个「图纸预览」按钮：选择本地文件后直接在查看器里打开（`cad-library-actions.js`）。
- 查看器里打开本地文件后显示「上传分享」，上传模型并打开带短代码的发帖框。

设置 `resources_page` 打开（默认）时，`/viewer` 改为「资源」主页（`cad-resources.js`、`cad-resources-data.js`），插件的列表仍在页面里但被隐藏：

- 页头：栏目名、简介、栏目说明链接，「发布资源」（`/new-topic?category_id=<栏目>`）和「预览本地文件」，资源数 / 格式数 / 贡献者数。
- 精选圆圈：出现过的模型格式和最常用的标签，点击筛选。标签页：全部、3D 模型、2D 图纸、已收藏（登录用户的书签）。搜索（`/search.json`，限定栏目）和排序（最近活动、最多点赞、最多回复、最多浏览）。
- 3 列 4:5 网格：有图的话题显示首图，没有图的显示为彩色文字卡片；右上角格式标签；悬停显示点赞、回复、浏览和作者，带模型的话题另有「3D 预览」。
- 数据只用 Discourse 公开 JSON（`/c/<id>/show.json`、`/c/<slug>/<id>/l/latest.json` 全部页、`/moaclab-cad/drawings.json`、`/u/<me>/bookmarks.json`），页面状态写在网址参数 `tab`、`f`、`q`、`sort` 里。

这些规则依赖插件的组件名 `moaclab-cad-library`、它的 `load()` / `drawings` / `nextBefore` 等字段和类名（`moaclab-cad-library__*`、`#cad-library-format`）。插件改动图纸列表的结构时，要同步检查本组件。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `show_sidebar_link` | `false` | 自动在侧栏添加 3D Viewer。已在后台导航菜单维护链接时保持关闭。 |
| `embed_viewer_base` | `/viewer` | 渲染 `[moaclab-3d]` 短代码时使用的地址前缀。 |
| `library_category_id` | `9` | 图纸列表显示这个栏目的全部话题（9 = 资源），搜索也限定在这个栏目。设为 `0` 时恢复插件默认：只显示带模型的话题。 |
| `resources_page` | `true` | `/viewer` 显示为 Instagram 风格的资源主页（需要 `library_category_id` 不为 0）。关闭则为插件的图纸列表。 |

## 生成文件

`javascripts/discourse/lib/cad-workbench-geometry.js`（打包后的 three.js 子集）和 `cad-workbench-icons.js`（Lucide 图标，ISC）由早期的 `scripts/build-workbench.cjs` 生成。该脚本不在线上导出中，目前按已生成文件维护；需要重新生成时先补回脚本。

## 开发验证

使用 Node.js 22，运行 `npm ci` 和 `npm test`：检查元数据、编译 SCSS、打包 JavaScript，并运行 `test/` 下的光照、深度和资源页数据单元测试。

改版本时同步更新 `about.json` 的 `theme_version` 和 `package.json` 的 `version`，检查会对比两者。

## 发布

走 PR 合并到 `main`，再按 Moaclab 维护仓库的 `ops/release.md` 更新到网站。

## 许可

本仓库代码以 MIT 许可发布，见 `LICENSE`。打包进来的第三方内容见 `THIRD_PARTY_NOTICES.md`。

## 来源

2026-11-18 从生产站点组件 188（0.6.3，ZIP 安装）导出，整理为 Git 仓库。
