from pathlib import Path

path = Path('client/src/main.jsx')
source = path.read_text(encoding='utf-8')
old = '<span className="count">{emails.total} messages</span></div>'
new = '''<div className="inbox-actions"><span className="count">{emails.total} messages</span><button className="clear-inbox" disabled={!status.totalCount || busy} onClick={() => { if (window.confirm('Clear all locally saved messages for this account? Gmail messages will not be changed.')) action(async () => { await api('/api/emails', { method: 'DELETE' }); setSelected(null); setOffset(0); }); }}>Clear saved inbox</button></div></div>'''
assert old in source
path.write_text(source.replace(old, new), encoding='utf-8')
