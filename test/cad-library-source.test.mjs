import assert from "node:assert/strict";
import { test } from "node:test";
import { topicListToDrawings } from "../javascripts/discourse/lib/cad-library-source.js";

function topicList() {
  return {
    users: [{ id: 1, username: "Wayne" }, { id: 2, username: "dony945" }],
    topic_list: {
      topics: [
        { id: 2665, slug: "topic", title: "独角兽 图纸", category_id: 9, posts_count: 1, image_url: "https://example.test/a.png", posters: [{ user_id: 1 }] },
        { id: 2605, slug: "topic", title: "键盘代理商目录", category_id: 9, posts_count: 3, image_url: null, posters: [{ user_id: 2 }, { user_id: 1 }] },
        { id: 2532, slug: "topic", title: "关于“资源”类别", category_id: 9, posts_count: 1, posters: [{ user_id: 1 }] },
        { id: 1000, slug: "other", title: "其他栏目", category_id: 13, posts_count: 1, posters: [{ user_id: 1 }] },
      ],
    },
  };
}

const models = new Map([[2665, { id: 2665, format: "STEP", preview_url: "/viewer?id=86ba", image_url: "https://example.test/model.png" }]]);

test("lists the category's topics without the category description topic", () => {
  const drawings = topicListToDrawings(topicList(), { categoryId: 9, aboutTopicId: 2532, models });
  assert.deepEqual(drawings.map((d) => d.id), [2665, 2605]);
});

test("maps topics to the fields the plugin template renders", () => {
  const [model, text] = topicListToDrawings(topicList(), { categoryId: 9, aboutTopicId: 2532, models });
  assert.deepEqual(model, {
    id: 2665,
    title: "独角兽 图纸",
    topic_url: "/t/topic/2665",
    image_url: "https://example.test/a.png",
    username: "Wayne",
    replies: 0,
    format: "STEP",
    preview_url: "/viewer?id=86ba",
  });
  assert.equal(text.username, "dony945", "the first poster is the author");
  assert.equal(text.replies, 2);
  assert.equal(text.format, null, "topics without a model get no format badge");
  assert.equal(text.image_url, null);
});

test("keeps search relevance order and drops topics the search did not return", () => {
  const drawings = topicListToDrawings(topicList(), { categoryId: 9, aboutTopicId: 2532, models, order: [2605, 2665] });
  assert.deepEqual(drawings.map((d) => d.id), [2605, 2665]);
  const one = topicListToDrawings(topicList(), { categoryId: 9, aboutTopicId: 2532, models, order: [2605] });
  assert.deepEqual(one.map((d) => d.id), [2605]);
});
