import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { api } from '../lib/api'

interface Hit {
  title: string
  subtitle?: string | null
  meta?: string | null
  to: string
}
interface Group {
  key: string
  label: string
  items: Hit[]
}

/** Typing rukne ke baad hi server ko bhejte hain, har harf par nahi. */
function useDebounced(value: string, ms: number) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return out
}

/**
 * Poore system ka aik search box.
 *
 * Customer, bill, supplier, driver, kharcha, maal: naam ya number kuch bhi
 * likhein, nateeja seedha us ke page par le jata hai. Jo cheez user ko nazar
 * nahi aani chahiye wo yahan bhi nahi aati, kyunki har group ka apna permission
 * server par check hota hai.
 */
export default function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const term = useDebounced(q, 250)

  const { data, isFetching } = useQuery({
    queryKey: ['search', term],
    queryFn: async () => (await api.get<{ groups: Group[]; total: number }>('/search', { params: { q: term } })).data,
    enabled: term.trim().length >= 2,
  })

  const groups = term.trim().length >= 2 ? (data?.groups ?? []) : []
  const flat = groups.flatMap((g) => g.items)

  // Bahar click karne par band, aur Ctrl/Cmd+K se khulta hai.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => setActive(0), [term])

  const go = (hit: Hit) => {
    setOpen(false)
    setQ('')
    navigate(hit.to)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return }
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % flat.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length) }
    if (e.key === 'Enter') { e.preventDefault(); go(flat[active]) }
  }

  let runningIndex = -1

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Kuch bhi dhoondein: naam, bill no, phone…"
        className="w-full rounded-lg border py-2 pl-9 pr-9 text-sm outline-none focus:ring-2"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)', ['--tw-ring-color' as string]: 'var(--ring)' }}
      />
      {q && (
        <button
          onClick={() => { setQ(''); inputRef.current?.focus() }}
          aria-label="Saaf karein"
          className="absolute right-2.5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--muted)' }}
        >
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
        </button>
      )}

      {open && q.trim().length >= 2 && (
        <div
          className="bf-fade absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-auto rounded-xl border shadow-lg"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
              {isFetching ? 'Dhoond rahe hain…' : 'Kuch nahi mila.'}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div
                  className="sticky top-0 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: 'var(--surface-2)', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
                >
                  {g.label}
                </div>
                {g.items.map((hit) => {
                  runningIndex += 1
                  const i = runningIndex
                  return (
                    <button
                      key={`${g.key}-${i}`}
                      onClick={() => go(hit)}
                      onMouseEnter={() => setActive(i)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition"
                      style={{ background: i === active ? 'var(--surface-hover)' : 'transparent' }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{hit.title}</span>
                        {hit.subtitle && <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{hit.subtitle}</span>}
                      </span>
                      {hit.meta && <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--muted)' }}>{hit.meta}</span>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
