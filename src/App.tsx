import { useEffect, useMemo, useState } from 'react'
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react'
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  CircleHelp,
  Download,
  ChartNoAxesCombined,
  Gem,
  Grid2X2,
  Layers3,
  Pencil,
  Link2,
  LockKeyhole,
  RadioTower,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react'

type Kind = 'Personal' | 'Groups' | 'Channels'
type Username = {
  id?: string
  handle: string
  kind: Kind
  collectible: boolean
  assigned: boolean
  assignmentStatus: 'assigned' | 'unassigned' | 'unknown'
  verificationStatus: string
  note: string
  color: string
}

const filters = ['All names', 'Personal', 'Groups', 'Channels', 'Collectibles'] as const
type Filter = (typeof filters)[number]
type Page = 'collection' | 'market' | 'wallet' | 'settings'
function pageFromPath(path: string): Page {
  const last = path.replace(/\/+$/, '').split('/').pop()
  return last === 'market' || last === 'wallet' || last === 'settings' ? last : 'collection'
}

type InventoryRecord = { id: string; username: string; entity_type: 'personal' | 'group' | 'channel'; username_type: 'basic' | 'collectible'; assignment_status: 'assigned' | 'unassigned' | 'unknown'; title?: string | null; verification_status?: string }
type MarketSale = { username: string; sale_price_gram: number | string | null; sold_at: string; source_url?: string | null }
type MarketBoard = { available: boolean; soldCount: number; volumeGram: number | null; topSale: MarketSale | null; recentSales: MarketSale[]; updatedAt: string | null; reason?: string }

type VerifiedTelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date?: number
}

function App() {
  const [activePage, setActivePage] = useState<Page>(() => pageFromPath(window.location.pathname))
  const [verifiedUser, setVerifiedUser] = useState<VerifiedTelegramUser | null>(null)
  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '')
  const walletAddress = useTonAddress()
  const wallet = useTonWallet()
  const [authState, setAuthState] = useState<'preview' | 'checking' | 'verified' | 'failed'>('preview')
  const initData = window.Telegram?.WebApp?.initData ?? ''
  const authEndpoint = import.meta.env.VITE_TELEGRAM_AUTH_URL || '/api/auth'

  useEffect(() => {
    const handlePopState = () => setActivePage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (page: Page) => {
    const path = '/' + page
    if (window.location.pathname !== path) window.history.pushState({ page }, '', path)
    setActivePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    if (initData) return
    let active = true
    fetch('/api/telegram-session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Please sign in again.')
        return result as { authenticated: boolean; user?: VerifiedTelegramUser }
      })
      .then((result) => {
        if (!active) return
        if (result.authenticated && result.user) {
          setVerifiedUser(result.user)
          setAuthState('verified')
        }
      })
      .catch(() => { /* Keep preview mode available when session checks fail. */ })
    return () => { active = false }
  }, [initData])

  const signOut = async () => {
    await fetch('/api/telegram-session', { method: 'DELETE', credentials: 'same-origin' })
    setVerifiedUser(null)
    setAuthState('preview')
  }

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
        if (!response.ok) throw new Error(result.error || 'Please try signing in again.')
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


  useEffect(() => {
    if (initData || !botUsername) return
    const container = document.getElementById('telegram-login-container')
    if (!container) return
    window.onTelegramAuth = (user) => {
      setAuthState('checking')
      fetch('/api/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user }),
      })
        .then(async (response) => {
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Please try signing in again.')
          return result.user as VerifiedTelegramUser
        })
        .then((user) => {
          setVerifiedUser(user)
          setAuthState('verified')
        })
        .catch(() => {
          setVerifiedUser(null)
          setAuthState('failed')
        })
    }
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-request-access', 'read')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    container.replaceChildren(script)
    return () => {
      container.replaceChildren()
      delete window.onTelegramAuth
    }
  }, [botUsername, initData])

  const [filter, setFilter] = useState<Filter>('All names')
  const [query, setQuery] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const [showBotHelp, setShowBotHelp] = useState(false)
  const [sortNewest, setSortNewest] = useState(false)
  const [marketBoard, setMarketBoard] = useState<MarketBoard | null>(null)
  const [marketLoading, setMarketLoading] = useState(true)
  const [inventory, setInventory] = useState<Username[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryError, setInventoryError] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newKind, setNewKind] = useState<'personal' | 'group' | 'channel'>('personal')
  const [newUsernameType, setNewUsernameType] = useState<'basic' | 'collectible'>('basic')
  const [newAssignment, setNewAssignment] = useState<'assigned' | 'unassigned' | 'unknown'>('unknown')
  const [newTitle, setNewTitle] = useState('')
  const [savingInventory, setSavingInventory] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editHandle, setEditHandle] = useState('')
  const [editKind, setEditKind] = useState<'personal' | 'group' | 'channel'>('personal')
  const [editUsernameType, setEditUsernameType] = useState<'basic' | 'collectible'>('basic')
  const [editAssignment, setEditAssignment] = useState<'assigned' | 'unassigned' | 'unknown'>('unknown')
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/market-board', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok && !data) throw new Error('Sales information is not available right now.')
        return data as MarketBoard
      })
      .then((data) => { if (active) setMarketBoard(data) })
      .catch(() => { if (active) setMarketBoard(null) })
      .finally(() => { if (active) setMarketLoading(false) })
    return () => { active = false }
  }, [])


  useEffect(() => {
    if (!verifiedUser) { setInventory([]); return }
    let active = true
    setInventoryLoading(true)
    setInventoryError('')
    fetch('/api/inventory', { headers: initData ? { 'x-telegram-init-data': initData } : {}, credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'We couldn’t load your collection. Please try again shortly.')
        return result as { items: InventoryRecord[] }
      })
      .then((result) => {
        if (!active) return
        setInventory(result.items.map((item) => ({
          id: item.id, handle: '@' + item.username.replace(/^@/, ''),
          kind: item.entity_type === 'group' ? 'Groups' : item.entity_type === 'channel' ? 'Channels' : 'Personal',
          collectible: item.username_type === 'collectible', assigned: item.assignment_status === 'assigned', assignmentStatus: item.assignment_status, verificationStatus: item.verification_status || 'unverified',
          note: item.title || (item.verification_status === 'verified' ? 'Verified record' : 'Manually added · not ownership-verified'),
          color: item.entity_type === 'group' ? 'green' : item.entity_type === 'channel' ? 'orange' : 'blue',
        })))
      })
      .catch((error) => { if (active) setInventoryError(error instanceof Error ? error.message : 'Could not load your inventory.') })
      .finally(() => { if (active) setInventoryLoading(false) })
    return () => { active = false }
  }, [verifiedUser, initData])

  const saveInventoryItem = async () => {
    const cleanHandle = newHandle.trim().replace(/^@/, '')
    if (!/^[A-Za-z0-9_]{5,32}$/.test(cleanHandle)) {
      setInventoryError('Enter a valid Telegram username (5–32 letters, numbers or underscores).')
      return
    }
    setSavingInventory(true)
    setInventoryError('')
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(initData ? { 'x-telegram-init-data': initData } : {}) },
        credentials: 'same-origin',
        body: JSON.stringify({ username: cleanHandle, entity_type: newKind, username_type: newUsernameType, assignment_status: newAssignment, title: newTitle }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'We couldn’t save this username. Please try again.')
      const item = result.item as InventoryRecord
      setInventory((current) => [{
        id: item.id, handle: '@' + item.username,
        kind: item.entity_type === 'group' ? 'Groups' : item.entity_type === 'channel' ? 'Channels' : 'Personal',
        collectible: item.username_type === 'collectible', assigned: item.assignment_status === 'assigned', assignmentStatus: item.assignment_status, verificationStatus: item.verification_status || 'unverified',
        note: item.title || 'Manually added · not ownership-verified',
        color: item.entity_type === 'group' ? 'green' : item.entity_type === 'channel' ? 'orange' : 'blue',
      }, ...current])
      setNewHandle('')
      setNewTitle('')
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Could not save this username.')
    } finally { setSavingInventory(false) }
  }

  const beginEdit = (item: Username) => {
    if (!item.id) return
    setEditingId(item.id)
    setEditHandle(item.handle.replace(/^@/, ''))
    setEditKind(item.kind === 'Groups' ? 'group' : item.kind === 'Channels' ? 'channel' : 'personal')
    setEditUsernameType(item.collectible ? 'collectible' : 'basic')
    setEditAssignment(item.assignmentStatus)
    setEditTitle(item.note.startsWith('Manually added') ? '' : item.note)
    setInventoryError('')
  }

  const saveEditedItem = async () => {
    if (!editingId) return
    const cleanHandle = editHandle.trim().replace(/^@/, '')
    if (!/^[A-Za-z0-9_]{5,32}$/.test(cleanHandle)) { setInventoryError('Enter a valid Telegram username (5–32 letters, numbers or underscores).'); return }
    setSavingInventory(true); setInventoryError('')
    try {
      const response = await fetch('/api/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(initData ? { 'x-telegram-init-data': initData } : {}) }, credentials: 'same-origin', body: JSON.stringify({ id: editingId, username: cleanHandle, entity_type: editKind, username_type: editUsernameType, assignment_status: editAssignment, title: editTitle }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'We couldn’t update this username. Please try again.')
      const item = result.item as InventoryRecord
      setInventory((current) => current.map((entry) => entry.id !== editingId ? entry : ({ ...entry, handle: '@' + item.username, kind: item.entity_type === 'group' ? 'Groups' : item.entity_type === 'channel' ? 'Channels' : 'Personal', collectible: item.username_type === 'collectible', assigned: item.assignment_status === 'assigned', assignmentStatus: item.assignment_status, verificationStatus: item.verification_status || 'unverified', note: item.title || 'Manually added · not ownership-verified', color: item.entity_type === 'group' ? 'green' : item.entity_type === 'channel' ? 'orange' : 'blue' })))
      setEditingId(null)
    } catch (error) { setInventoryError(error instanceof Error ? error.message : 'Could not update this username.') }
    finally { setSavingInventory(false) }
  }
  const removeInventoryItem = async (item: Username) => {
    if (!item.id) return
    if (!window.confirm(`Remove ${item.handle} from your collection?`)) return
    setInventoryError('')
    try {
      const response = await fetch('/api/inventory?id=' + encodeURIComponent(item.id), {
        method: 'DELETE', headers: initData ? { 'x-telegram-init-data': initData } : {}, credentials: 'same-origin',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'We couldn’t remove this username. Please try again.')
      setInventory((current) => current.filter((entry) => entry.id !== item.id))
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Could not remove this username.')
    }
  }

  const exportInventoryCsv = () => {
    if (inventory.length === 0) return
    const escapeCell = (value: string) => {
      // Prevent spreadsheet formula execution when opening user-entered notes.
      const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value
      return '"' + safe.replace(/"/g, '""') + '"'
    }
    const rows = [
      ['username', 'entity_type', 'username_class', 'assignment_status', 'note', 'ownership_verification'],
      ...inventory.map((item) => [
        item.handle.replace(/^@/, ''),
        item.kind === 'Groups' ? 'group' : item.kind === 'Channels' ? 'channel' : 'personal',
        item.collectible ? 'collectible' : 'basic',
        item.assignmentStatus,
        item.note,
        item.verificationStatus || 'unverified',
      ]),
    ]
    const csv = '\uFEFF' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ttogrm-inventory.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const formatGram = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === '') return 'Price undisclosed'
    const number = Number(value)
    return Number.isFinite(number) ? `${number.toLocaleString(undefined, { maximumFractionDigits: 3 })} GRAM` : 'Price undisclosed'
  }
  const displayName = verifiedUser?.first_name || 'Your collection'
  const username = verifiedUser?.username ? `@${verifiedUser.username}` : 'Telegram account'

  const filtered = useMemo(() => {
    let list = inventory.filter((item) => {
      const matchesFilter =
        filter === 'All names' ||
        (filter === 'Collectibles' && item.collectible) ||
        item.kind === filter
      const matchesQuery = item.handle.toLowerCase().includes(query.toLowerCase())
      return matchesFilter && matchesQuery
    })
    if (sortNewest) list = [...list].reverse()
    return list
  }, [inventory, filter, query, sortNewest])

  const chooseFilter = (next: Filter) => {
    setFilter(next)
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/collection" onClick={(event) => { event.preventDefault(); navigateTo("collection") }} aria-label="TTOGRM home">
          <span className="brand-mark"><Link2 size={20} strokeWidth={2.5} /></span>
          <span>TTOGRM</span>
        </a>
        <div className="top-actions">
          <button className="icon-button subtle-button" aria-label="About TTOGRM" onClick={() => setShowAbout(true)}><CircleHelp size={19} /></button>
          {verifiedUser
            ? <button className="avatar-button" aria-label="Open profile settings" onClick={() => navigateTo('settings')}>
                {verifiedUser.photo_url ? <img src={verifiedUser.photo_url} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
              </button>
            : <button className="header-signin" onClick={() => navigateTo('collection')}>Sign in <ArrowUpRight size={14} /></button>}
        </div>
      </header>

      {activePage === 'collection' && <>
      <section className="welcome" id="home">
        {verifiedUser ? <>
          <div className="eyebrow"><span className="status-dot" /> PERSONAL DASHBOARD</div>
          <h1>Welcome back,<br /><span>{displayName}.</span></h1>
          <p className="welcome-copy">Your username workspace. Review your collection, track verified market activity, and manage your connected wallet.</p>
          <div className="profile-chip">
            <span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{displayName}</strong><small>{username}</small></span>
            <span className="connection-pill connected"><span />Identity verified</span>
          </div>
        </> : <>
          <div className="eyebrow"><span className="status-dot" /> TELEGRAM USERNAME WORKSPACE</div>
          <h1>Every name.<br /><span>One place.</span></h1>
          <p className="welcome-copy">A private workspace for your Telegram usernames — from personal profiles to groups, channels, and collectibles. Sign in to open your dashboard.</p>
          <div className="public-benefits">
            <span><ShieldCheck size={15} /> Private workspace</span>
            <span><Gem size={15} /> Collectibles &amp; basic names</span>
            <span><ChartNoAxesCombined size={15} /> Verified market signals</span>
          </div>
          {initData && authState === 'checking' && <p className="auth-pending">Verifying your Telegram identity…</p>}
          {authState === 'failed' && <p className="auth-error">Telegram verification failed. Please reopen the Mini App or try signing in again.</p>}
        </>}
      </section>

      {!verifiedUser && !initData && <section className="browser-auth-card" aria-label="Telegram browser sign in">
        <div className="browser-auth-copy">
          <span className="eyebrow">BROWSER SIGN-IN</span>
          <h2>{authState === 'verified' ? 'Telegram connected' : 'Continue with Telegram'}</h2>
          <p>{authState === 'verified' ? 'Your Telegram identity has been verified for this browser session.' : 'Open TTOGRM from any browser or desktop. Sign in with Telegram, then connect your TON wallet independently.'}</p>
        </div>
        {botUsername
          ? <div id="telegram-login-container" className="telegram-login-container" />
          : <p className="setup-hint">Browser sign-in is temporarily unavailable. Please open TTOGRM from Telegram to continue.</p>}
        {authState === 'verified' && <button className="sign-out-button" onClick={() => void signOut()}>Sign out</button>}
        {authState === 'failed' && <p className="auth-error">Telegram verification failed. Please try again.</p>}
      </section>}

      {verifiedUser && <section className="stats-grid" aria-label="Collection overview">
        <article className="stat-card stat-main">
          <div className="stat-label">Total usernames <Layers3 size={16} /></div>
          <div className="stat-value">{inventory.length.toString().padStart(2, '0')}</div>
          <div className="stat-foot">Saved to your private inventory</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Collectibles <Gem size={16} /></div>
          <div className="stat-value">{inventory.filter((item) => item.collectible).length.toString().padStart(2, '0')}</div>
          <div className="stat-foot">Collectible usernames</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Assigned <Check size={16} /></div>
          <div className="stat-value">{inventory.filter((item) => item.assigned).length.toString().padStart(2, '0')}</div>
          <div className="stat-foot">Marked as assigned</div>
        </article>
      </section>}

      </>}
      {activePage === 'market' && <section className="page-intro"><div className="eyebrow"><ChartNoAxesCombined size={13} /> MARKET OVERVIEW</div><h1>Signals, not<br /><span>speculation.</span></h1><p>Verified Telegram collectible username sales only. Figures remain blank until trusted sales data is available.</p></section>}
      {activePage === 'market' && <section className="market-board" aria-labelledby="market-board-title">
        <div className="section-heading">
          <div><div className="eyebrow"><ChartNoAxesCombined size={13} /> TELEGRAM USERNAME MARKET</div><h2 id="market-board-title">Market info board</h2></div>
          <span className={marketBoard?.available ? 'board-status live' : 'board-status'}><span />{marketLoading ? 'Loading' : marketBoard?.available ? (marketBoard.soldCount > 0 ? 'Sales available' : 'No confirmed sales yet') : 'No sales data yet'}</span>
        </div>
        <p className="board-intro">Recent public sales of Telegram collectible usernames over the last 24 hours. Only confirmed sales are included. {marketBoard?.available ? (marketBoard.soldCount > 0 ? 'Confirmed sales are available below.' : 'There are no confirmed sales to show yet.') : 'Sales information is not available yet.'}</p>
        <div className="market-metrics">
          <article className="market-metric"><span>Sold in 24h</span><strong>{marketBoard?.available ? marketBoard.soldCount.toLocaleString() : '—'}</strong><small>{marketBoard?.available ? (marketBoard.soldCount > 0 ? 'Verified sale records' : 'No verified records in the current window') : 'Sales data not available yet'}</small></article>
          <article className="market-metric"><span>24h sales volume</span><strong>{marketBoard?.available && marketBoard.volumeGram !== null ? formatGram(marketBoard.volumeGram) : '—'}</strong><small>{marketBoard?.available ? 'Known sale prices only' : 'Waiting for trusted feed'}</small></article>
          <article className="market-metric"><span>Top sale · 24h</span><strong>{marketBoard?.available && marketBoard.topSale ? `@${marketBoard.topSale.username}` : '—'}</strong><small>{marketBoard?.available && marketBoard.topSale ? formatGram(marketBoard.topSale.sale_price_gram) : 'No verified top sale yet'}</small></article>
        </div>
        <div className="market-board-bottom">
          <div><strong>Recent sales &amp; top usernames</strong><span>{marketBoard?.available ? `${marketBoard.recentSales.length} latest confirmed sales` : 'Confirmed sales will appear here when available.'}</span></div>
          <button className="board-refresh" onClick={() => setShowBotHelp(true)}>Telegram bot help <ArrowUpRight size={15} /></button>
        </div>
        {marketBoard?.available && marketBoard.recentSales.length > 0 && <div className="market-sales-list">
          {marketBoard.recentSales.map((sale, index) => <div className="market-sale-row" key={`${sale.username}-${sale.sold_at}-${index}`}>
            <div><strong>@{sale.username}</strong><span>{new Date(sale.sold_at).toLocaleString()}</span></div>
            <strong>{formatGram(sale.sale_price_gram)}</strong>
            {sale.source_url && <a href={sale.source_url} target="_blank" rel="noreferrer" aria-label={`Open sale source for ${sale.username}`}><ArrowUpRight size={14} /></a>}
          </div>)}
        </div>}
        <p className="demo-note"><ShieldCheck size={14} /> Only confirmed sales are shown. {marketBoard?.available ? 'Figures reflect the available confirmed sales.' : 'Market information is not available yet.'}</p>
      </section>}

      {activePage === 'collection' && verifiedUser && <><section className="collection-section">
        <div className="section-heading">
          <div><div className="eyebrow">YOUR INVENTORY</div><h2>Username collection</h2></div>
          <div className="collection-heading-actions">
            <button className="icon-button" aria-label="Download collection" title="Download collection" onClick={exportInventoryCsv} disabled={inventory.length === 0}><Download size={17} /></button>
            <button className="icon-button" aria-label="Sort usernames" title="Reverse sort order" onClick={() => setSortNewest((value) => !value)}><ArrowDownUp size={18} /></button>
          </div>
        </div>
        <form className="inventory-add-form" onSubmit={(event) => { event.preventDefault(); void saveInventoryItem() }}>
          <div className="inventory-form-heading"><strong>Add a username</strong><span>Manual records are not proof of ownership.</span></div>
          <label className="search-box"><Search size={18} /><input value={newHandle} onChange={(event) => setNewHandle(event.target.value)} placeholder="@username" aria-label="Username to add" maxLength={33} /></label>
          <div className="inventory-form-row">
            <label>Type<select value={newKind} onChange={(event) => setNewKind(event.target.value as typeof newKind)}><option value="personal">Personal</option><option value="group">Group</option><option value="channel">Channel</option></select></label>
            <label>Name type<select value={newUsernameType} onChange={(event) => setNewUsernameType(event.target.value as typeof newUsernameType)}><option value="basic">Basic</option><option value="collectible">Collectible</option></select></label>
            <label>Assignment<select value={newAssignment} onChange={(event) => setNewAssignment(event.target.value as typeof newAssignment)}><option value="unknown">Unknown</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
          </div>
          <input className="inventory-title-input" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Optional note (e.g. personal profile)" aria-label="Optional username note" maxLength={100} />
          <button className="primary-button inventory-save-button" type="submit" disabled={savingInventory}>{savingInventory ? 'Saving…' : 'Save to collection'} <ArrowUpRight size={15} /></button>
        </form>
        {inventoryError && <p className="auth-error inventory-error" role="alert">{inventoryError}</p>}
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search usernames" aria-label="Search usernames" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
        </label>
        <div className="filter-row" role="tablist" aria-label="Filter collection">
          {filters.map((item) => <button key={item} role="tab" aria-selected={filter === item} className={filter === item ? 'filter-chip active' : 'filter-chip'} onClick={() => chooseFilter(item)}>{item}</button>)}
        </div>

        {inventoryLoading && <p className="inventory-loading">Loading your saved usernames…</p>}
        <div className="username-list">
          {filtered.map((item) => (
            <article className="username-card" key={item.id || item.handle}>
              <span className={`handle-icon ${item.color}`}>
                {item.kind === 'Personal' ? <Grid2X2 size={20} /> : item.kind === 'Groups' ? <UsersRound size={20} /> : <RadioTower size={20} />}
              </span>
              <div className="handle-info">
                {editingId === item.id ? <div className="inventory-edit-form">
                  <input value={editHandle} onChange={(event) => setEditHandle(event.target.value)} aria-label="Edit username" maxLength={33} />
                  <div className="inventory-form-row">
                    <label>Type<select value={editKind} onChange={(event) => setEditKind(event.target.value as typeof editKind)}><option value="personal">Personal</option><option value="group">Group</option><option value="channel">Channel</option></select></label>
                    <label>Name type<select value={editUsernameType} onChange={(event) => setEditUsernameType(event.target.value as typeof editUsernameType)}><option value="basic">Basic</option><option value="collectible">Collectible</option></select></label>
                    <label>Assignment<select value={editAssignment} onChange={(event) => setEditAssignment(event.target.value as typeof editAssignment)}><option value="unknown">Unknown</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
                  </div>
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Optional note" aria-label="Edit note" maxLength={100} />
                  <div className="inventory-edit-actions"><button type="button" onClick={() => void saveEditedItem()} disabled={savingInventory}>{savingInventory ? "Saving…" : "Save changes"}</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
                </div> : <>
                  <div className="handle-title">{item.handle}{item.collectible && <span className="collectible-mark" title="Collectible username"><Gem size={12} /></span>}</div>
                  <div className="handle-subtitle">{item.note}</div>
                  <div className="handle-badges"><span className="type-badge">{item.kind}</span><span className={item.collectible ? "type-badge collectible" : "type-badge"}>{item.collectible ? "Collectible" : "Basic"}</span><span className={item.assignmentStatus === 'assigned' ? "assignment-badge assigned" : "assignment-badge"}>{item.assignmentStatus === 'assigned' ? "Assigned" : item.assignmentStatus === 'unassigned' ? "Unassigned" : "Assignment unknown"}</span></div>
                </>}
              </div>
              {editingId !== item.id && <div className="inventory-row-actions"><button className="row-arrow" aria-label={`Edit ${item.handle}`} onClick={() => beginEdit(item)} title="Edit username"><Pencil size={16} /></button><button className="row-arrow" aria-label={`Remove ${item.handle} from collection`} onClick={() => void removeInventoryItem(item)} title="Remove from collection"><X size={17} /></button></div>}
            </article>
          ))}
          {filtered.length === 0 && <div className="empty-state"><Search size={22} /><strong>No usernames found</strong><span>Try a different search or category.</span></div>}
        </div>
        <p className="demo-note"><ShieldCheck size={14} /> Your saved usernames are private. Adding a name does not confirm ownership. Automatic username discovery is not available yet.</p>
      </section>

      </>}
      {activePage === 'wallet' && <><section className="page-intro"><div className="eyebrow"><Wallet size={13} /> WALLET &amp; CURRENCY</div><h1>Your wallet.<br /><span>Your keys.</span></h1><p>Connect a TON-compatible wallet when you choose. TTOGRM never asks for your seed phrase or private keys.</p></section>
      <section className="wallet-card">
        <div className="wallet-icon"><Wallet size={22} /></div>
        <div className="wallet-copy">
          <h3>{wallet ? 'TON wallet connected' : 'Connect your TON wallet'}</h3>
          <p>{walletAddress ? `Connected address: ${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}. Gram (GRAM) is the native currency; TON is the blockchain.` : 'Connect from Telegram, a mobile browser, or desktop to use a TON wallet. TTOGRM never receives your private keys.'}</p>
        </div>
        <TonConnectButton />
      </section>

      <div className="wallet-details"><article><span className="wallet-detail-icon"><ShieldCheck size={18} /></span><div><strong>Wallet stays yours</strong><p>Connecting a wallet does not transfer ownership or give TTOGRM access to your keys.</p></div></article><article><span className="wallet-detail-icon"><Gem size={18} /></span><div><strong>Gram (GRAM)</strong><p>GRAM is the native currency. TON is the blockchain network.</p></div></article><article><span className="wallet-detail-icon"><LockKeyhole size={18} /></span><div><strong>No seed phrases</strong><p>Approve requests in your wallet app. Never enter recovery phrases into TTOGRM.</p></div></article></div>
      </>}
      {activePage === 'settings' && verifiedUser && <section className="settings-page"><div className="page-intro"><div className="eyebrow"><Settings2 size={13} /> PREFERENCES</div><h1>Account &amp;<br /><span>settings.</span></h1><p>Manage your access and review connected services.</p></div><article className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><UsersRound size={18} /></span><div><strong>Telegram identity</strong><p>{verifiedUser ? (verifiedUser.username ? '@' + verifiedUser.username : verifiedUser.first_name) : 'Not verified in this session'}</p></div></div>{verifiedUser ? <button className="secondary-action" onClick={() => void signOut()}>Sign out</button> : <p className="settings-hint">Sign in from the Collection page using Telegram.</p>}</article><article className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Wallet size={18} /></span><div><strong>TON wallet</strong><p>{walletAddress ? 'Connected: ' + walletAddress.slice(0, 8) + '…' + walletAddress.slice(-6) : 'No wallet connected'}</p></div></div><button className="secondary-action" onClick={() => navigateTo('wallet')}>{walletAddress ? 'View wallet' : 'Connect wallet'}</button></article><article className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={18} /></span><div><strong>Privacy &amp; data</strong><p>Your saved username records are private to your verified Telegram account. Manual entries are not ownership proof.</p></div></div><span className="settings-status">Private</span></article><article className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Link2 size={18} /></span><div><strong>About TTOGRM</strong><p>Every Telegram name. One place.</p></div></div><button className="secondary-action" onClick={() => setShowAbout(true)}>About the app</button></article></section>}

      {!verifiedUser && activePage === 'settings' && <section className="guest-settings"><div className="page-intro"><div className="eyebrow"><ShieldCheck size={13} /> YOUR PRIVACY</div><h1>Your account,<br /><span>your control.</span></h1><p>Sign in with Telegram to access your personal workspace and manage account preferences. Wallet connection is optional and independent.</p><button className="primary-button guest-settings-cta" onClick={() => navigateTo('collection')}>Continue to sign in <ArrowUpRight size={16} /></button></div><article className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><LockKeyhole size={18} /></span><div><strong>Private by design</strong><p>Sign-in identifies your Telegram account. Your saved usernames are only visible to you after you sign in with Telegram.</p></div></div></article></section>}

      <footer className="footer">
        <span><LockKeyhole size={13} /> {verifiedUser ? "Your workspace" : "Private by design"}</span>
        <button onClick={() => setShowAbout(true)}>About TTOGRM <ArrowUpRight size={13} /></button>
      </footer>

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className={activePage === 'collection' ? 'nav-item active' : 'nav-item'} aria-current={activePage === 'collection' ? 'page' : undefined} onClick={() => navigateTo('collection')}><Grid2X2 size={19} /><span>{verifiedUser ? "Collection" : "Home"}</span></button>
        <button className={activePage === 'market' ? 'nav-item active' : 'nav-item'} aria-current={activePage === 'market' ? 'page' : undefined} onClick={() => navigateTo('market')}><ChartNoAxesCombined size={19} /><span>Market</span></button>
        <button className={activePage === 'wallet' ? 'nav-item active' : 'nav-item'} aria-current={activePage === 'wallet' ? 'page' : undefined} onClick={() => navigateTo('wallet')}><Wallet size={19} /><span>Wallet</span></button>
        <button className={activePage === 'settings' ? 'nav-item active' : 'nav-item'} aria-current={activePage === 'settings' ? 'page' : undefined} onClick={() => navigateTo('settings')}><Settings2 size={19} /><span>Settings</span></button>
      </nav>

      {showBotHelp && <div className="modal-backdrop" role="presentation" onClick={() => setShowBotHelp(false)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="bot-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={() => setShowBotHelp(false)}><X size={18} /></button>
          <span className="modal-icon"><ChartNoAxesCombined size={24} /></span>
          <h2 id="bot-title">TTOGRM on Telegram</h2>
          <p>Open the TTOGRM bot in Telegram and send one of these messages to get started. Sales information will appear when confirmed sales are available.</p>
          <div className="command-list">
            <div><code>/start</code><span>Open TTOGRM and view the welcome menu</span></div>
            <div><code>/help</code><span>Get help and learn how TTOGRM works</span></div>
            <div><code>/board</code><span>Open the market information board</span></div>
            <div><code>/sales</code><span>Check the last 24 hours of username sales</span></div>
            <div><code>/top</code><span>View the highest-value reported username sale</span></div>
            <div><code>/stats</code><span>Get the current market-data status</span></div>
            <div><code>/currency</code><span>Explain Gram (GRAM) and the TON blockchain</span></div>
          </div>
          <div className="modal-footnote"><ShieldCheck size={16} /> Sales information will appear when confirmed sale records are available.</div>
          <button className="primary-button" onClick={() => setShowBotHelp(false)}>Back to TTOGRM</button>
        </section>
      </div>}

      {showAbout && <div className="modal-backdrop" role="presentation" onClick={() => setShowAbout(false)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={() => setShowAbout(false)}><X size={18} /></button>
          <span className="modal-icon"><Link2 size={24} /></span>
          <h2 id="about-title">TTOGRM</h2>
          <p>Every Telegram name. One place. A private collection for usernames on personal profiles, groups and channels — including basic and collectible usernames.</p>
          <div className="modal-footnote"><ShieldCheck size={16} /> You can add usernames manually. Automatic discovery is not available yet, and adding a name does not confirm ownership.</div>
          <button className="primary-button" onClick={() => setShowAbout(false)}>Back to collection</button>
        </section>
      </div>}
    </main>
  )
}

export default App
