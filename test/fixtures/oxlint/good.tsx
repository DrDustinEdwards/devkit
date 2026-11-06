// Markup the shared react config allows: a keyboard-scrollable region and a list that keeps its role in Safari.
export function Panel() {
  return (
    <div role="region" aria-label="Results" tabIndex={0}>
      <ul role="list">
        <li>one</li>
      </ul>
    </div>
  );
}
