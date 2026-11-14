export function ViewPane({ active, children }) {
  return (
    <div className="dashboard-view" data-active={active ? 'true' : 'false'} inert={!active} aria-hidden={!active}>
      {children}
    </div>
  );
}
