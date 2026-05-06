import { describe, expect, test } from "bun:test";
import { extract } from "../src/core/scraper";

describe("extract", () => {
  test("returns title from <title>", () => {
    const html = "<html><head><title>Acme Inc</title></head><body><p>Hello</p></body></html>";
    expect(extract(html).title).toBe("Acme Inc");
  });

  test("falls back to h1 when title is empty", () => {
    const html = "<html><head><title></title></head><body><h1>Acme</h1></body></html>";
    expect(extract(html).title).toBe("Acme");
  });

  test("strips script and style content", () => {
    const html =
      "<html><body><p>Real content here.</p><script>console.log('secret')</script><style>.x{}</style></body></html>";
    const { content } = extract(html);
    expect(content).toContain("Real content here.");
    expect(content).not.toContain("secret");
    expect(content).not.toContain(".x{}");
  });

  test("strips nav, footer, aside, header", () => {
    const html = `
      <html><body>
        <header>Top nav</header>
        <nav>Site nav</nav>
        <main><h1>Office step challenges</h1><p>Compete with coworkers.</p></main>
        <aside>Sidebar ads</aside>
        <footer>Privacy policy</footer>
      </body></html>`;
    const { content } = extract(html);
    expect(content).toContain("Compete with coworkers");
    expect(content).not.toContain("Top nav");
    expect(content).not.toContain("Site nav");
    expect(content).not.toContain("Sidebar ads");
    expect(content).not.toContain("Privacy policy");
  });

  test("prefers <main> content over body fallback", () => {
    const html = `
      <html><body>
        <main><p>Main content for office step challenges.</p></main>
        <div>Other content</div>
      </body></html>`;
    const { content } = extract(html);
    expect(content).toContain("Main content for office step challenges");
  });

  test("falls back to body when no main/article exists", () => {
    const html = "<html><body><p>Just a body paragraph.</p></body></html>";
    expect(extract(html).content).toContain("Just a body paragraph");
  });

  test("collapses whitespace", () => {
    const html = "<html><body><main>line\n\n\n\n\none\n\n   line   two</main></body></html>";
    const { content } = extract(html);
    expect(content).not.toMatch(/\n{4,}/);
    expect(content).not.toContain("   line");
  });

  test("truncates content over MAX_CONTENT_CHARS", () => {
    const big = "a".repeat(20_000);
    const html = `<html><body><main>${big}</main></body></html>`;
    const { content } = extract(html);
    expect(content.length).toBeLessThanOrEqual(8100);
    expect(content).toContain("[...truncated]");
  });

  test("empty body returns empty content", () => {
    const html = "<html><body></body></html>";
    expect(extract(html).content).toBe("");
  });

  test("extracts content from <article> when no main", () => {
    const html =
      "<html><body><article><h2>Title</h2><p>Article paragraph one.</p></article></body></html>";
    expect(extract(html).content).toContain("Article paragraph one");
  });
});
