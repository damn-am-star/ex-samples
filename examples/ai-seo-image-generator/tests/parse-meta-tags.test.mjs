import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPostMetadata } from "../netlify/functions/utils/parse-meta-tags.ts";

const origin = "https://example.com";
const slug = "sample-post";

const metadataCases = [
  {
    name: "prefers Open Graph metadata over standard metadata",
    html: `
      <title>Fallback title</title>
      <meta name="description" content="Fallback description">
      <meta property="og:title" content="Open Graph title">
      <meta property="og:description" content="Open Graph description">
    `,
    expected: {
      title: "Open Graph title",
      description: "Open Graph description",
    },
  },
  {
    name: "accepts reversed attributes, single quotes, and uppercase tags",
    html: `
      <META CONTENT='Reversed title' NAME='OG:TITLE'>
      <META CONTENT='Reversed description' PROPERTY='OG:DESCRIPTION'>
    `,
    expected: {
      title: "Reversed title",
      description: "Reversed description",
    },
  },
  {
    name: "falls back to standard metadata and decodes HTML entities",
    html: `
      <title>A &amp; B &lt;C&gt;</title>
      <meta content="&quot;Hello&quot; &#39;world&#39; &#x27;again&#x27; &#x2F; &amp; &amp;" name="description">
    `,
    expected: {
      title: "A & B <C>",
      description: "\"Hello\" 'world' 'again' / & &",
    },
  },
  {
    name: "falls back independently when Open Graph description is missing",
    html: `
      <title>Fallback title</title>
      <meta property="og:title" content="Open Graph title">
      <meta name="description" content="Standard description">
    `,
    expected: {
      title: "Open Graph title",
      description: "Standard description",
    },
  },
  {
    name: "falls back independently when Open Graph title is missing",
    html: `
      <title>Standard title</title>
      <meta property="og:description" content="Open Graph description">
    `,
    expected: {
      title: "Standard title",
      description: "Open Graph description",
    },
  },
];

for (const { name, html, expected } of metadataCases) {
  test(name, async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      new Response(html)
    );

    assert.deepEqual(await fetchPostMetadata(origin, slug), expected);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.deepEqual(fetchMock.mock.calls[0].arguments, [
      `${origin}/blog/${slug}/`,
    ]);
  });
}

for (const { name, html } of [
  {
    name: "returns null when the title is missing",
    html: '<meta name="description" content="Description only">',
  },
  {
    name: "returns null when the description is missing",
    html: "<title>Title only</title>",
  },
  {
    name: "returns null when metadata is empty",
    html: '<title></title><meta name="description" content="">',
  },
]) {
  test(name, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(html));
    t.mock.method(console, "error", () => {});

    assert.equal(await fetchPostMetadata(origin, slug), null);
  });
}

test("returns null for an HTTP error without reading the response body", async (t) => {
  const response = new Response("Not found", { status: 404 });
  const textMock = t.mock.method(response, "text", async () => {
    throw new Error("Error response bodies should not be read");
  });
  t.mock.method(globalThis, "fetch", async () => response);
  t.mock.method(console, "error", () => {});

  assert.equal(await fetchPostMetadata(origin, slug), null);
  assert.equal(textMock.mock.callCount(), 0);
});

test("returns null rather than rejecting when fetching fails", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Network unavailable");
  });
  t.mock.method(console, "error", () => {});

  assert.equal(await fetchPostMetadata(origin, slug), null);
});

test("returns null rather than rejecting when reading the body fails", async (t) => {
  const response = new Response();
  t.mock.method(response, "text", async () => {
    throw new Error("Body stream interrupted");
  });
  t.mock.method(globalThis, "fetch", async () => response);
  t.mock.method(console, "error", () => {});

  assert.equal(await fetchPostMetadata(origin, slug), null);
});
