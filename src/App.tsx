import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  CircleHelp,
  Gem,
  Grid2X2,
  Layers3,
  Link2,
  LockKeyhole,
  RadioTower,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'

type Kind = 'Personal' | 'Groups' | 'Channels'
type Username = {
  handle: string
  kind: Kind
  collectible: boolean
  assigned: boolean
  note: string
  color: string
}

const demoUsernames: Username[] = [
  { handle: '@mystrdan', kind: 'Personal', collectible: false, assigned: true, note: 'Personal profile', color: 'blue' },
  { handle: '@kilogger', kind: 'Personal', collectible: true, assigned: true, note: 'Collectible username', color: 'violet' },
  { handle: '@vaagmer', kind: 'Channels', collectible: true, assigned: false, note: 'Not assigned in this demo', color: 'orange' },
  { handle: '@opntalk', kind: 'Groups', collectible: false, assigned: true, note: 'Community group', color: 'green' },
  { handle: '@grffik', kind: 'Channels', collectible: false, assigned: true, note: 'Project channel', color: 'pink' },
]

const filters = ['All names', 'Personal', 'Groups', 'Channels', 'Collectibles'] as const
type Filter = (typeof filters)[number]

type VerifiedTelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

function App() {
  const [verifiedUser, setVerifiedUser] = useState<VerifiedTelegramUser | null>(null)
  const [authState, setAuthState] = useState<'preview' | 'checking' | 'verified' | 'failed'>('preview')
  const initData = window.Telegram?.WebApp?.initData ?? ''
  const authEndpoint = import.meta.env.VITE_TELEGRAM_AUTH_URL || '/api/auth'

  useEffect(() => {
    if (!initData) return
    let active = true
    setAuthState('checking')
    fetch(authEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Telegram verification failed')
        return result.user as VerifiedTelegramUser
      })
      .then((user) => {
        if (!active) return
        setVerifiedUser(user)
        setAuthState('verified')
      })
      .catch(() => {
        if (!active) return
        setVerifiedUser(null)
        setAuthState('failed')
      })
    return () => { active = false }
  }, [initData])

  const [filter, setFilter] = useState<Filter>('All names')
  const [query, setQuery] = useState('')
  const [showWalletInfo, setShowWalletInfo] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [sortNewest, setSortNewest] = useState(false)
  const displayName = verifiedUser?.first_name || 'Your collection'
  const username = verifiedUser?.username ? `@${verifiedUser.username}` : '@telegram_user'

  const filtered = useMemo(() => {
    let list = demoUsernames.filter((item) => {
      const matchesFilter =
        filter === 'All names' ||
        (filter === 'Collectibles' && item.collectible) ||
        item.kind === filter
      const matchesQuery = item.handle.toLowerCase().includes(query.toLowerCase())
      return matchesFilter && matchesQuery
    })
    if (sortNewest) list = [...list].reverse()
    return list
  }, [filter, query, sortNewest])

  const chooseFilter = (next: Filter) => {
    setFilter(next)
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="TTOGRM home">
          <span className="brand-mark"><Link2 size={20} strokeWidth={2.5} /></span>
          <span>TTOGRM</span>
        </a>
        <div className="top-actions">
          <button className="icon-button subtle-button" aria-label="About TTOGRM" onClick={() => setShowAbout(true)}><CircleHelp size={19} /></button>
          <button className="avatar-button" aria-label="Open profile" onClick={() => setShowAbout(true)}>
            {verifiedUser?.photo_url ? <img src={verifiedUser.photo_url} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
          </button>
        </div>
      </header>

      <section className="welcome" id="home">
        <div className="eyebrow"><span className="status-dot" /> YOUR TELEGRAM COLLECTION</div>
        <h1>Every name.<br /><span>One place.</span></h1>
        <p className="welcome-copy">Your usernames across profiles, groups and channels — gathered into one private collection.</p>
        <div className="profile-chip">
          <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><strong>{displayName}</strong><small>{username}</small></span>
          <span className={authState === 'verified' ? 'connection-pill connected' : 'connection-pill'}><span />{authState === 'verified' ? 'Identity verified' : authState === 'checking' ? 'Verifying Telegram' : authState === 'failed' ? 'Verification failed' : 'Preview mode'}</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Collection overview">
        <article className="stat-card stat-main">
          <div className="stat-label">Total usernames <Layers3 size={16} /></div>
          <div className="stat-value">05</div>
          <div className="stat-foot">Demo inventory <span>·</span> not synced yet</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Collectibles <Gem size={16} /></div>
          <div className="stat-value">02</div>
          <div className="stat-foot">NFT usernames</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Assigned <Check size={16} /></div>
          <div className="stat-value">04</div>
          <div className="stat-foot">On profiles or chats</div>
        </article>
      </section>

      <section className="collection-section">
        <div className="section-heading">
          <div><div className="eyebrow">YOUR INVENTORY</div><h2>Username collection</h2></div>
          <button className="icon-button" aria-label="Sort usernames" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={18} /></button>
        </div>
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search usernames" aria-label="Search usernames" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
        </label>
        <div className="filter-row" role="tablist" aria-label="Filter collection">
          {filters.map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'filter-chip active' : 'filter-chip'} onClick={() => chooseFilter(item)}>{item}</button>)}
        </div>

        <div className="username-list">
          {filtered.map((item) => (
            <article className="username-card" key={item.handle}>
              <span className={`handle-icon ${item.color}`}>
                {item.kind === 'Personal' ? <Grid2X2 size={20} /> : item.kind === 'Groups' ? <UsersRound size={20} /> : <RadioTower size={20} />}
              </span>
              <div className="handle-info">
                <div className="handle-title">{item.handle}{item.collectible && <span className="collectible-mark" title="Collectible username"><Gem size={12} /></span>}</div>
                <div className="handle-subtitle">{item.note}</div>
                <div className="handle-badges">
                  <span className="type-badge">{item.kind}</span>
                  <span className={item.collectible ? 'type-badge collectible' : 'type-badge'}>{item.collectible ? 'Collectible' : 'Basic'}</span>
                  <span className={item.assigned ? 'assignment-badge assigned' : 'assignment-badge'}>{item.assigned ? 'Assigned' : 'Unassigned'}</span>
                </div>
              </div>
              <button className="row-arrow" aria-label={`View ${item.handle}`} onClick={() => setShowAbout(true)}><ArrowUpRight size={18} /></button>
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state"><Search size={22} /><strong>No usernames found</strong><span>Try a different search or category.</span></div>}
        </div>
        <p className="demo-note"><Sparkles size={14} /> Sample usernames shown for interface preview. Live discovery is not connected yet.</p>
      </section>

      <section className="wallet-card">
        <div className="wallet-icon"><Wallet size={22} /></div>
        <div className="wallet-copy"><h3>Connect your TON wallet</h3><p>Match collectible usernames held in your wallet with your Telegram inventory.</p></div>
        <button className="wallet-action" onClick={() => setShowWalletInfo(true)} aria-label="Learn about wallet connection"><ArrowUpRight size={18} /></button>
      </section>

      <footer className="footer">
        <span><LockKeyhole size={13} /> Private by default</span>
        <button onClick={() => setShowAbout(true)}>About TTOGRM <ArrowUpRight size={13} /></button>
      </footer>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className="nav-item active"><Grid2X2 size={19} /><span>Collection</span></button>
        <button className="nav-item" onClick={() => setShowWalletInfo(true)}><Wallet size={19} /><span>Wallet</span></button>
        <button className="nav-item" onClick={() => setShowAbout(true)}><Settings2 size={19} /><span>Settings</span></button>
      </nav>

      {showWalletInfo && <div className="modal-backdrop" role="presentation" onClick={() => setShowWalletInfo(false)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={() => setShowWalletInfo(false)}><X size={18} /></button>
          <span className="modal-icon"><Wallet size={24} /></span>
          <h2 id="wallet-title">TON wallet connection</h2>
          <p>Wallet linking is planned. It will help identify collectible username NFTs held at a connected TON address. It won't, by itself, prove ownership of every Telegram profile, group or channel.</p>
          <div className="modal-footnote"><ShieldCheck size={16} /> TTOGRM will never ask for your wallet seed phrase.</div>
          <button className="primary-button" onClick={() => setShowWalletInfo(false)}>Got it</button>
        </section>
      </div>}

      {showAbout && <div className="modal-backdrop" role="presentation" onClick={() => setShowAbout(false)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={() => setShowAbout(false)}><X size={18} /></button>
          <span className="modal-icon"><Link2 size={24} /></span>
          <h2 id="about-title">TTOGRM</h2>
          <p>Every Telegram name. One place. A private collection for usernames on personal profiles, groups and channels — including basic and collectible usernames.</p>
          <div className="modal-footnote"><ShieldCheck size={16} /> Inventory discovery is not connected in this preview.</div>
          <button className="primary-button" onClick={() => setShowAbout(false)}>Back to collection</button>
        </section>
      </div>}
    </main>
  )
}

export default App
