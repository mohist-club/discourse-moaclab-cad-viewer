import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModels, filterResources, listsToResources, normalizeFormat, readState,
  resourceContributors, resourceKind, resourceStats, writeState,
} from "../javascripts/discourse/lib/cad-resources-data.js";

const models = new Map([
  [11, { format: "step", preview_url: "/viewer?id=aaaaaaaaaaaaaaaa&ext=step", image_url: "/m11.png" }],
  [12, { format: "DXF", preview_url: "/viewer?id=bbbbbbbbbbbbbbbb&ext=dxf" }],
]);
const page = (topics, more = false) => ({
  users: [{ id: 1, username: "alice", avatar_template: "/a/{size}/1.png" }, { id: 2, username: "bob" }],
  topic_list: { topics, more_topics_url: more ? "/next" : null },
});
const topic = (id, extra = {}) => ({ id, title: `T${id}`, slug: `t-${id}`, category_id: 9, posts_count: 3, like_count: id, views: 100 - id, posters: [{ user_id: 1 }], ...extra });
const pages = [
  page([topic(10), topic(11, { tags: ["外壳", { name: "60" }] }), topic(12, { posters: [{ user_id: 2 }] })], true),
  page([topic(11), topic(13, { category_id: 4 }), topic(14, { fancy_title: "A &amp; B", pinned: true }),
    topic(15, { image_url: "/p15.jpg" }), topic(16, { image_url: "/p16.jpg", tags: ["下载"] }), topic(17, { tags: [{ name: "分享" }] })]),
];
const items = listsToResources(pages, { aboutTopicId: 10, categoryId: 9, models });

test("merges pages, skips the about topic, other categories and repeats", () => {
  assert.deepEqual(items.map((item) => item.id), [11, 12, 14, 15, 16, 17]);
  assert.equal(items[0].format, "STEP");
  assert.equal(items[0].image, "/m11.png");
  assert.equal(items[0].avatar, "/a/48/1.png");
  assert.deepEqual(items[0].tags, ["外壳", "60"]);
  assert.equal(items[0].replies, 2);
  assert.equal(items[1].username, "bob");
  assert.equal(items[2].title, "A & B");
});

test("models arriving later fill in format, preview and image", () => {
  const early = listsToResources(pages, { aboutTopicId: 10, categoryId: 9, models: new Map() });
  assert.equal(early[0].format, "");
  const late = applyModels(early, models);
  assert.equal(late[0].format, "STEP");
  assert.equal(late[0].image, "/m11.png");
  assert.equal(late[1].previewUrl, "/viewer?id=bbbbbbbbbbbbbbbb&ext=dxf");
  assert.equal(applyModels(early, new Map()), early);
});

test("kinds: tags decide, otherwise files are downloads, pictures shares, the rest other", () => {
  const kind = (id) => resourceKind(items.find((item) => item.id === id));
  assert.equal(kind(11), "download"); // model
  assert.equal(kind(12), "download"); // drawing
  assert.equal(kind(14), "other"); // text only
  assert.equal(kind(15), "share"); // picture only
  assert.equal(kind(16), "download"); // picture, tagged 下载
  assert.equal(kind(17), "share"); // text, tagged 分享
});

test("tabs keep pinned topics first", () => {
  assert.deepEqual(filterResources(items).map((i) => i.id), [14, 11, 12, 15, 16, 17]);
  assert.deepEqual(filterResources(items, { tab: "download" }).map((i) => i.id), [11, 12, 16]);
  assert.deepEqual(filterResources(items, { tab: "share" }).map((i) => i.id), [15, 17]);
  assert.deepEqual(filterResources(items, { tab: "other" }).map((i) => i.id), [14]);
});

test("stats and contributors", () => {
  assert.deepEqual(resourceStats(items), { resources: 6, formats: 2, contributors: 2 });
  assert.deepEqual(resourceContributors(items).map((c) => [c.username, c.count]), [["alice", 5], ["bob", 1]]);
});

test("the tab round-trips through the URL and rejects unknown values", () => {
  assert.deepEqual(readState(writeState({ tab: "share" })), { tab: "share" });
  assert.equal(writeState({ tab: "all" }), "");
  assert.deepEqual(readState("?tab=saved"), { tab: "all" });
  assert.equal(normalizeFormat(".stp"), "STP");
  assert.equal(normalizeFormat("<b>"), "");
});

test("models inside a post: shortcodes, then CAD attachments", async () => {
  const { postModels, viewerUrlFor } = await import("../javascripts/discourse/lib/cad-resources-data.js");
  const cooked = '<p>[moaclab-3d id=&quot;0123456789abcdef&quot; ext=&quot;step&quot; title=&quot;BOT60 芯片版&quot;]</p>'
    + '<p>[moaclab-3d upload="upload://AbC123.stl" type="stl"]</p>'
    + '<p>[moaclab-3d id="bad" ext="step"]</p>';
  const models = postModels(cooked, [
    { name: "plate.dxf", href: "/uploads/short-url/xyz.dxf" },
    { name: "notes.pdf", href: "/uploads/short-url/n.pdf" },
    { name: "plate.dxf", href: "/uploads/short-url/xyz.dxf" },
  ]);
  assert.deepEqual(models.map((m) => [m.format, m.href]), [
    ["STEP", "/viewer?id=0123456789abcdef&ext=step&name=BOT60+%E8%8A%AF%E7%89%87%E7%89%88"],
    ["STL", "/viewer?upload=upload%3A%2F%2FAbC123.stl&ext=stl"],
    ["DXF", "/viewer?url=%2Fuploads%2Fshort-url%2Fxyz.dxf&ext=dxf&name=plate.dxf"],
  ]);
  assert.equal(viewerUrlFor({ url: "javascript:alert(1)", ext: "step" }), null);
  assert.equal(viewerUrlFor({ url: "//evil.example/x.step", ext: "step" }), null);
  assert.equal(viewerUrlFor({ id: "0123456789abcdef", ext: "exe" }), null);
});
