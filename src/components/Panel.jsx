// A collapsible section built on native <details>/<summary>.
//
// Native rather than scripted, so keyboard operation, the accessibility tree
// and browser find-in-page work without any JavaScript of our own. The heading
// keeps its id, so aria-labelledby references and heading queries still resolve
// whether the panel is open or closed.
//
// Content is collapsed, never deleted: explanatory and caveat copy stays
// available to anyone who opens the panel, it just stops competing with the
// data for the first screen.
// `level` keeps the document outline correct: a panel nested under an existing
// h2 must announce as h3, not restart the hierarchy.
export function Panel({ id, title, note, defaultOpen = false, level = 2, children }) {
  const Heading = `h${level}`;
  return (
    <details className="panel-section" open={defaultOpen}>
      <summary className="panel-summary">
        <Heading id={id}>{title}</Heading>
        {note && <span className="panel-note">{note}</span>}
      </summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}
