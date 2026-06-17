import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'ur'
const KEY = 'bf_lang'

interface LangContextValue {
  lang: Lang
  toggle: () => void
  setLang: (l: Lang) => void
}

const LangContext = createContext<LangContextValue>(null!)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(KEY) as Lang) ?? 'en')

  useEffect(() => {
    localStorage.setItem(KEY, lang)
  }, [lang])

  const toggle = () => setLang((l) => (l === 'en' ? 'ur' : 'en'))

  return <LangContext.Provider value={{ lang, toggle, setLang }}>{children}</LangContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  return useContext(LangContext)
}
