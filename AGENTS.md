# discourse-moaclab-cad-viewer

moaclab.com 的 CAD 模型查看主题组件：`/viewer` 页面，以及帖子里的 `[moaclab-3d]` 短代码嵌入。本组件只负责前端界面。

站点级的发布流程、线上组件 ID 和发布记录在私有维护仓库 `mohist-club/Moaclab`（`components/cad-viewer.md`、`ops/release.md`）。本文件只写这个仓库内的开发约定。

## 依赖服务端插件

运行依赖 `discourse-moaclab-tools`：

- `/viewer` 路由和模型接口（`/moaclab-cad/models`）
- 查看器运行时：`/plugins/discourse-moaclab-tools/viewer/vNNN/`

组件里引用的运行时版本必须是插件已经发布的版本。要换运行时版本，先让插件上线，再发组件。

## 目录

| 路径 | 内容 |
| --- | --- |
| `javascripts/discourse/api-initializers/moaclab-cad-viewer.gjs` | 组件主体 |
| `javascripts/discourse/lib/cad-*.js` | 预览、光照、深度、上传错误等模块 |
| `javascripts/discourse/lib/cad-workbench-geometry.js`、`cad-workbench-icons.js` | 生成文件 |
| `common/common.scss` | 样式 |
| `locales/` | `en` 与 `zh_CN` 文案 |
| `test/` | 光照和深度单元测试 |

## 约定

- **两个生成文件不手改**：`cad-workbench-geometry.js` 和 `cad-workbench-icons.js` 的生成脚本没有随线上导出保留下来。需要改它们时，先补回生成脚本并在 PR 里说明，不要直接编辑产物。
- **文案**：界面文字全部放在 `locales/`，`en` 与 `zh_CN` 同步更新。
- **样式**：颜色用 Discourse 的 CSS 变量，画布要跟随浅色和深色主题。
- **上传**：文件类型和大小限制由插件在服务端校验，前端的检查只用于提示，不能当作安全边界。
- 不新增依赖，确有需要先问。

## 检查

使用 Node.js 22：

```sh
npm ci
npm test
```

`npm test` 检查元数据（`about.json` 与 `package.json` 版本一致）、编译 SCSS、打包 JavaScript，并运行 `test/` 下的单元测试。它不能代替在真实 Discourse 上的验证，改动要按维护仓库的流程在站点上实测 `/viewer` 和一个含模型的帖子。

## 版本与发布

1. 从 `main` 开分支，一个分支只做一件事。
2. 同步更新 `about.json` 的 `theme_version` 和 `package.json`（及 `package-lock.json`）的 `version`。
3. 推分支，开指向 `main` 的 PR，等 Actions 通过。合并由仓库所有者完成，合并后删除分支。
4. 合并后打 `vX.Y.Z` tag。
5. 更新到网站按维护仓库的 `ops/release.md` 执行，并在 `components/cad-viewer.md` 的发布记录里追加一行。

## 不要做

- 不直接推 `main`，不强制推送。
- 不提交密钥、站点数据或用户上传的模型文件。
- 更新线上组件属于生产操作，需要仓库所有者在当前对话里明确批准。
- 不做任务范围以外的重构。
