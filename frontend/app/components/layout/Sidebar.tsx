import { useState, useEffect } from 'react'
import { PieChart, ArrowLeftRight, Settings, BookOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import tradingApi from '@/lib/api'
// Constants for localStorage keys
const XUEQIU_COOKIE_KEY = 'xueqiu_cookie_string'

export default function Sidebar() {
  const { t, lang, setLang } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cookieString, setCookieString] = useState('')
  const [savedCookieString, setSavedCookieString] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load saved cookie string from localStorage on component mount
  useEffect(() => {
    const savedCookie = localStorage.getItem(XUEQIU_COOKIE_KEY)
    if (savedCookie) {
      setSavedCookieString(savedCookie)
      // Automatically send saved cookie to backend on app start
      if (tradingApi.isSocketOpen()) {
        tradingApi.setXueqiuCookie(savedCookie)
      } else {
        // If socket is not open yet, set it when it opens
        const unsubscribe = tradingApi.onOpen(() => {
          tradingApi.setXueqiuCookie(savedCookie)
          unsubscribe()
        })
      }
    }
  }, [])

  // Load saved cookie into form when opening settings dialog
  useEffect(() => {
    if (settingsOpen && savedCookieString) {
      setCookieString(savedCookieString)
    }
  }, [settingsOpen, savedCookieString])

  const handleOpenChange = (open: boolean) => {
    setSettingsOpen(open)
    if (!open) {
      setCookieString('')
      setError(null)
    }
  }

  const handleSaveCookie = () => {
    const trimmedCookie = cookieString.trim()
    
    if (!tradingApi.isSocketOpen()) {
      setError('交易连接未就绪')
      return
    }

    // Save to localStorage (even if empty to clear)
    if (trimmedCookie) {
      localStorage.setItem(XUEQIU_COOKIE_KEY, trimmedCookie)
      setSavedCookieString(trimmedCookie)
    } else {
      localStorage.removeItem(XUEQIU_COOKIE_KEY)
      setSavedCookieString('')
    }

    // Send to backend
    tradingApi.setXueqiuCookie(trimmedCookie)
    setCookieString('')
    setError(null)
    setSettingsOpen(false)
  }

  const handleClearCookie = () => {
    setCookieString('')
    localStorage.removeItem(XUEQIU_COOKIE_KEY)
    setSavedCookieString('')
    
    if (tradingApi.isSocketOpen()) {
      tradingApi.setXueqiuCookie('')
    }
    
    setError(null)
    setSettingsOpen(false)
  }

  const toggle = () => setLang(lang === 'en' ? 'cn' : 'en')
  const navClass = ({ isActive }: { isActive: boolean }) => (
    `flex flex-col items-center justify-center w-16 p-2 rounded-lg transition-colors ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`
  )

  return (
    <aside className="w-20 border-r h-full p-2 flex flex-col items-center">
      <nav className="space-y-4">
        <NavLink
          to="/documentation"
          className={navClass}
          title={t('sidebar.documentation')}
          end
        >
          <BookOpen className="w-5 h-5 mb-1" />
          <span className="text-xs mt-1">{t('sidebar.documentation')}</span>
        </NavLink>
        <NavLink
          to="/trading"
          className={navClass}
          title={t('sidebar.placeOrder')}
        >
          <ArrowLeftRight className="w-5 h-5 mb-1" />
          <span className="text-xs mt-1">{t('sidebar.placeOrder')}</span>
        </NavLink>
        <NavLink
          to="/asset-trend"
          className={navClass}
          title={t('sidebar.assetTrend')}
        >
          <PieChart className="w-5 h-5 mb-1" />
          <span className="text-xs mt-1">{t('sidebar.trend')}</span>
        </NavLink>
      </nav>
      <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <button
            className="mt-4 flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors"
            title="Settings"
            type="button"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snowball Cookie Settings</DialogTitle>
            <DialogDescription>
              Configure your Snowball cookie string for market data access. The cookie will be saved in your browser and automatically restored on app startup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {savedCookieString && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800 font-medium">✓ Cookie Configured</p>
                <p className="text-xs text-green-600 mt-1">
                  Cookie saved: {savedCookieString.substring(0, 50)}...
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cookie String
              </label>
              <textarea
                className="h-32 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={cookieString}
                onChange={(e) => setCookieString(e.target.value)}
                placeholder="acw_tc=...; xq_a_token=..."
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            {savedCookieString && (
              <Button 
                variant="destructive" 
                type="button" 
                onClick={handleClearCookie}
              >
                Clear Cookie
              </Button>
            )}
            <Button type="button" onClick={handleSaveCookie}>
              Save Cookie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <button onClick={toggle} className="mt-4 text-xs px-2 py-1 border rounded" title="Toggle Language">
        {lang === 'en' ? t('header.lang.cn') : t('header.lang.en')}
      </button>
    </aside>
  )
}
