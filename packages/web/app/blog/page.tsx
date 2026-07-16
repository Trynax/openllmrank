import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts } from "../../lib/blog";

export const metadata: Metadata = {
  title: "Blog — AI search visibility & AEO",
  description:
    "Field notes on AI search visibility and answer engine optimization (AEO): how ChatGPT, Perplexity, and Gemini pick which brands to recommend — and how to become one of them.",
  alternates: { canonical: "/blog" },
};

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="blog-wrap">
      <header className="blog-head">
        <span className="kicker">The openllmrank blog</span>
        <h1 className="headline">Field notes on AI search visibility.</h1>
        <p className="sub">
          Search is moving from ten blue links to a single AI answer. These are
          working notes on answer engine optimization (AEO) — how ChatGPT,
          Perplexity, and Gemini decide which brands to recommend, and how to
          become one of them.
        </p>
      </header>

      <div className="post-list">
        {posts.map((post) => (
          <article key={post.slug} className="post-list-item">
            <div className="meta">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span aria-hidden>&middot;</span>
              <span>{post.readingTime}</span>
              {post.tags[0] && <span className="tag">{post.tags[0]}</span>}
            </div>
            <h2>
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <p>{post.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
