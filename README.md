# Moaclab CAD Viewer

Discourse 主题组件，在 moaclab.com 内查看 STEP、IGES、DXF、DWG、GLB、STL 与 OBJ 模型，并支持在帖子里用 `[moaclab-3d]` 短代码嵌入模型。

## 依赖

组件只负责前端界面，运行依赖服务端插件 `discourse-moaclab-tools`：

- 页面路由与持久化模型 ID（`/viewer`、`/moaclab-cad/models.json`）
- 查看器资源：`/plugins/discourse-moaclab-tools/viewer/v055/`（viewer bundle、OCCT 与 Draco 的 JS/WASM）

插件不在或版本不匹配时，组件无法加载模型。

嵌入模式（`embed=1`，帖子里的模型和资源详情弹窗）下只显示查看器本身：`body` 下其他元素（Discourse 页面、主题的底部导航或顶栏）全部隐藏。

`/viewer` 不带参数时的图纸列表由插件渲染，组件只改它的外观和入口：

- 数据来源：设置 `library_category_id` 不为 0 时，组件用 `api.modifyClass("component:moaclab-cad-library")` 改写列表的 `load()`，改为取该栏目的全部话题（排除栏目说明帖），搜索走 `/search.json` 并限定栏目；带模型的话题仍从 `/moaclab-cad/drawings.json` 取格式标签（`cad-library-source.js`）。
- 样式按 Instagram 主题的发现页网格重排，颜色用该主题的 `--ig-*` 变量，其他主题下退回 Discourse 颜色。
- 隐藏格式筛选和插件的两个头部链接，换成一个「图纸预览」按钮：选择本地文件后直接在查看器里打开（`cad-library-actions.js`）。
- 查看器里打开本地文件后显示「上传分享」。**源文件不离开浏览器**：3D 模型用 `cad-glb-export.js` 把当前显示的网格写成 GLB（只有三角面、法线和颜色，没有 B-rep 和原始字节），作为普通附件上传，帖子里是 `[moaclab-3d upload="upload://…" type="glb"]` 加预览图；2D 图纸（DXF / DWG）只上传 2560×1440 的预览图。需要站点设置 `authorized_extensions` 包含 `glb`。
- 可选私存原件（0.9.0，设置 `private_source_upload`，默认关闭，需要插件 `discourse-moaclab-tools` 1.7.0）：打开后，「上传分享」旁边会出现「同时私存源文件」，作者自己决定勾不勾。勾选后原件上传到插件的 `POST /moaclab-cad/sources`，存在 `public/` 以外，帖子末尾附一条 `[moaclab-cad-private:文件名](/moaclab-cad/sources/<id>)`。只有插件设置 `moaclab_cad_source_download_groups`（默认管理员）里的人能看到「下载源文件」，其他人看不到这条链接，直接访问也会被服务端拒绝（403）。
- 本地「预览」不向服务器发送任何内容；只有点「上传分享」才上传上面的网格和图片。
- 旧版本（≤ 0.7.5）「上传分享」把源文件存到插件的 `/moaclab-cad/models/<id>`，任何人可下载；组件不再使用这个上传接口，读取旧帖子时仍会用到。

设置 `resources_page` 打开（默认）时，`/viewer` 改为「资源」主页（`cad-resources.js`、`cad-resources-data.js`），插件的列表若有则仍在页面里但被隐藏；插件没有渲染列表时，资源主页直接显示在 `#main-outlet` 里（列表之后出现会移到它前面），`/viewer` 不再依赖插件列表才能显示：

- 版式按 instagram.com 2026 年的桌面主页：头像右边是栏目名、资源 / 格式 / 贡献者数、简介、栏目说明链接和「贡献者包括 …」；下面一整行两个按钮：「发布」（`/new-topic?category_id=<栏目>`）、「预览」（选本地文件后在查看器里打开）。
- 只有图标的标签页：全部、分享、下载、其他。话题带「分享」「下载」一类标签时按标签归类；否则有模型或图纸文件的算下载，只有图片的算分享，其余算其他（`resourceKind`）。
- 4 列（窄屏 3 列）3:4 网格：有图的话题显示首图，没有图的显示为彩色文字卡片；置顶话题排在前面并带图钉；右上角格式标签；悬停显示点赞、回复、浏览和作者，带模型的话题另有「3D 预览」。
- 头像：Instagram 彩虹圈缓慢旋转，中间立方体带渐变描边并轻微转动；系统开启「减少动态效果」时静止。
- 详情弹窗（`cad-resources-detail.js`，桌面点卡片打开；手机和带修饰键的点击仍打开话题）：左边优先是图纸 3D 预览（`/viewer?…&embed=1`；模型来自插件的模型列表，没有时取首帖里的 `[moaclab-3d]` 短代码和 STEP / DXF 等 CAD 附件，多个模型可在左上角切换），没有模型才显示首图或文字底色，右边是作者、标题、正文、标签、文件（模型 + 附件）、前 6 条回复，底部点赞 / 回复 / 收藏跳到话题里用 Discourse 原生功能，分享为复制链接。正文、文件、回复来自 `/t/<id>.json`，帖子 HTML 只用 DOMParser 读取文字和链接，不插入页面。一次只看一个资源（没有上一个 / 下一个），Esc 或点遮罩关闭。
- 「预览」按钮是包住文件输入框的 `<label>`；选好文件后若路由没有切到 `/viewer?mode=preview`，`cad-library-actions.js` 直接改地址并触发 popstate，文件不会丢。
- 加载：骨架（页头、按钮、标签页、灰色占位）立即画出；上次的结果存在 localStorage（24 小时），再次打开时直接显示再后台刷新；栏目信息、第一页话题和模型列表同时请求，第一页一到就显示，后面的页和格式标签随后补上。
- 数据只用 Discourse 公开 JSON（`/c/<id>/show.json`、`/c/<slug>/<id>/l/latest.json` 全部页、`/moaclab-cad/drawings.json`），当前标签页写在网址参数 `tab` 里。

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
