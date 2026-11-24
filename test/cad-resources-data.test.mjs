import assert from "node:assert/strict";
import test from "node:test";
import {
  filterResources, listsToResources, normalizeFormat, readState,
  resourceContributors, resourceHighlights, resourceStats, writeState,
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

const items = listsToResources(
  [page([topic(10), topic(11, { tags: ["外壳", { name: "60" }] }), topic(12, { posters: [{ user_id: 2 }] })], true),
   page([topic(11), topic(13, { category_id: 4 }), topic(14, { fancy_title: "A &amp; B", pinned: true })])],
  { aboutTopicId: 10, categoryId: 9, models },
);

test("merges pages, skips the about topic, other categories and repeats", () => {
  assert.deepEqual(items.map((item) => item.id), [11, 12, 14]);
  assert.equal(items[0].format, "STEP");
  assert.equal(items[0].image, "/m11.png");
  assert.deepEqual(items[0].tags, ["外壳", "60"]);
  assert.equal(items[0].replies, 2);
  assert.equal(items[1].username, "bob");
  assert.equal(items[2].title, "A & B");
});

test("stats and highlights", () => {
  assert.deepEqual(resourceStats(items), { resources: 3, formats: 2, contributors: 2 });
  assert.deepEqual(resourceHighlights(items).map((h) => h.key), ["fmt:DXF", "fmt:STEP", "tag:60", "tag:外壳"]);
});

test("tabs, filters, search order and sorting", () => {
  assert.deepEqual(filterResources(items, { tab: "model" }).map((i) => i.id), [11]);
  assert.deepEqual(filterResources(items, { tab: "drawing" }).map((i) => i.id), [12]);
  assert.deepEqual(filterResources(items, { tab: "saved" }).map((i) => i.id), []);
  assert.deepEqual(filterResources(items, { tab: "saved", savedIds: new Set([14]) }).map((i) => i.id), [14]);
  assert.deepEqual(filterResources(items, { filter: "tag:外壳" }).map((i) => i.id), [11]);
  assert.deepEqual(filterResources(items, { searchIds: [14, 11] }).map((i) => i.id), [14, 11]);
  assert.deepEqual(filterResources(items, { sort: "likes" }).map((i) => i.id), [14, 12, 11]);
  assert.deepEqual(filterResources(items, { sort: "views" }).map((i) => i.id), [11, 12, 14]);
});

test("URL state round-trips and rejects unknown values", () => {
  const state = { tab: "model", filter: "fmt:STEP", query: "plate", sort: "likes" };
  assert.deepEqual(readState(writeState(state)), state);
  assert.equal(writeState({ tab: "all", filter: "", query: "", sort: "latest" }), "");
  assert.deepEqual(readState("?tab=x&sort=y&f=bad"), { tab: "all", sort: "latest", filter: "", query: "" });
  assert.equal(normalizeFormat(".stp"), "STP");
  assert.equal(normalizeFormat("<b>"), "");
});

test("pinned topics lead the default order, contributors by count", () => {
  assert.deepEqual(filterResources(items, {}).map((i) => i.id), [14, 11, 12]);
  assert.deepEqual(filterResources(items, { sort: "views" }).map((i) => i.id), [11, 12, 14]);
  assert.equal(items[0].avatar, "/a/48/1.png");
  assert.deepEqual(resourceContributors(items).map((c) => [c.username, c.count]), [["alice", 2], ["bob", 1]]);
});
