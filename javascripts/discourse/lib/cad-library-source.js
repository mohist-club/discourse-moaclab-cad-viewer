// The drawing library (/viewer without parameters) is the plugin component
// `moaclab-cad-library`, which by default lists only topics that contain a
// CAD model (/moaclab-cad/drawings.json). When the `library_category_id`
// setting is not 0, its load() is replaced so that the library lists every
// topic in that category instead; a search is limited to the same category.
// The plugin template is unchanged: it renders `drawings`, shows "more" while
// `nextBefore` is set and uses `loading` / `failed` for the status line.
const DRAWING_PAGES = 10;

async function getJSON(url) {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) { throw new Error(`${url}: HTTP ${response.status}`); }
  return response.json();
}

// Topics that contain a model, by topic id, for the format badge.
async function loadModelTopics() {
  const byTopic = new Map();
  let before = null;
  for (let page = 0; page < DRAWING_PAGES; page++) {
    const query = before ? `?${new URLSearchParams({ before })}` : "";
    const data = await getJSON(`/moaclab-cad/drawings.json${query}`);
    for (const drawing of data.drawings || []) { byTopic.set(drawing.id, drawing); }
    before = data.next_before;
    if (!before) { break; }
  }
  return byTopic;
}

export function topicToDrawing(topic, usernames, models) {
  const model = models.get(topic.id);
  return {
    id: topic.id,
    title: topic.title,
    topic_url: `/t/${topic.slug || "topic"}/${topic.id}`,
    image_url: topic.image_url || model?.image_url || null,
    username: usernames.get(topic.posters?.[0]?.user_id) || "",
    replies: Math.max(0, (topic.posts_count || 1) - 1),
    format: model?.format || null,
    preview_url: model?.preview_url || null,
  };
}

export function topicListToDrawings(data, { categoryId, aboutTopicId, models, order }) {
  const usernames = new Map((data.users || []).map((user) => [user.id, user.username]));
  let topics = (data.topic_list?.topics || []).filter(
    (topic) => topic.category_id === categoryId && topic.id !== aboutTopicId
  );
  if (order) {
    const rank = new Map(order.map((id, index) => [id, index]));
    topics = topics.filter((topic) => rank.has(topic.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }
  return topics.map((topic) => topicToDrawing(topic, usernames, models));
}

export default function installLibrarySource(api, categoryId) {
  if (!categoryId) { return; }

  let context = null;
  const loadContext = () => {
    context ||= Promise.all([
      getJSON(`/c/${categoryId}/show.json`),
      loadModelTopics().catch(() => new Map()),
    ]).then(([show, models]) => ({
      slug: show.category?.slug || "c",
      aboutTopicId: Number(String(show.category?.topic_url || "").split("/").pop()) || null,
      models,
    })).catch((error) => { context = null; throw error; });
    return context;
  };

  async function fetchPage(query, page) {
    const { slug, aboutTopicId, models } = await loadContext();
    const options = { categoryId, aboutTopicId, models };
    if (!query) {
      const data = await getJSON(`/c/${slug}/${categoryId}/l/latest.json?page=${page}`);
      return { drawings: topicListToDrawings(data, options), more: Boolean(data.topic_list?.more_topics_url) };
    }
    const search = await getJSON(`/search.json?${new URLSearchParams({ q: `${query} category:${categoryId}`, page: page + 1 })}`);
    const ids = [...new Set((search.topics || []).map((topic) => topic.id))];
    const more = Boolean(search.grouped_search_result?.more_full_page_results);
    if (!ids.length) { return { drawings: [], more }; }
    // Search results carry no thumbnails, so fetch the same topics as a topic list.
    const data = await getJSON(`/latest.json?${new URLSearchParams({ topic_ids: ids.join(",") })}`);
    return { drawings: topicListToDrawings(data, { ...options, order: ids }), more };
  }

  api.modifyClass("component:moaclab-cad-library", (Superclass) => class extends Superclass {
    async load(more = false) {
      const token = ++this.requestId;
      const page = more ? (this._mlcvPage || 0) + 1 : 0;
      const current = () => !this.isDestroying && !this.isDestroyed && token === this.requestId;
      this.loading = true;
      this.failed = false;
      try {
        const result = await fetchPage((this.query || "").trim(), page);
        if (!current()) { return; }
        this.drawings = more ? [...this.drawings, ...result.drawings] : result.drawings;
        this._mlcvPage = page;
        this.nextBefore = result.more ? page + 1 : null;
      } catch (error) {
        if (current()) {
          console.error("Moaclab CAD library failed to load the category", error);
          this.failed = true;
        }
      } finally {
        if (current()) { this.loading = false; }
      }
    }
  });
}
