export function PlaceholderPage({
  title,
  slug,
}: {
  title: string;
  slug: string;
}) {
  return (
    <article className="stack">
      <header>
        <p className="muted">Teacher OS · DEV placeholder</p>
        <h1>{title}</h1>
      </header>
      <section className="panel" aria-labelledby={`${slug}-placeholder-heading`}>
        <h2 id={`${slug}-placeholder-heading`}>Not implemented yet</h2>
        <p className="muted">
          This surface is labelled as a development placeholder. No fake class,
          attendance, assessment, or other business data is shown here.
        </p>
      </section>
    </article>
  );
}
