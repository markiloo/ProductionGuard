

export function Brand() {
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="butt" strokeLinejoin="miter" aria-hidden="true" focusable="false">
        <path d="M24 6 8 12V30L24 42 40 30V12Z" />
        <g strokeWidth="1">
          <path d="M24 2V46 M4 24H44" />
          <path d="M21 2H27 M21 46H27 M4 21V27 M44 21V27" />
        </g>
      </svg>
      <div>
        <h1 className="brand-title">Prod. Guard</h1>
        <span className="brand-sub">Purchase order review</span>
      </div>
    </div>
  );
}
