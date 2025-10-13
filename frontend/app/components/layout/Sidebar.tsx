import { useState, type RefObject } from 'react'
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

interface SidebarProps {
  wsRef?: RefObject<WebSocket | null>
}

export default function Sidebar({ wsRef }: SidebarProps) {
  const { t, lang, setLang } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cookieString, setCookieString] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (open: boolean) => {
    setSettingsOpen(open)
    if (!open) {
      setCookieString('')
      setError(null)
    }
  }

  const handleSaveCookie = () => {
    if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket connection is not available. Please reconnect and try again.')
      return
    }

    wsRef.current.send(
      JSON.stringify({ type: 'set_xueqiu_cookie', cookie_string: cookieString.trim() })
    )

    setCookieString('')
    setError(null)
    setSettingsOpen(false)
  }

  const toggle = () => setLang(lang === 'en' ? 'cn' : 'en')
  const navClass = ({ isActive }: { isActive: boolean }) => (
    `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
      isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`
  )

  return (
    <aside className="w-16 border-r h-full p-2 flex flex-col items-center">
      <nav className="space-y-4">
        <NavLink
          to="/documentation"
          className={navClass}
          title={t('sidebar.documentation') || 'Documentation'}
          end
        >
          <BookOpen className="w-5 h-5" />
        </NavLink>
        <NavLink
          to="/trading"
          className={navClass}
          title={t('sidebar.trading')}
        >
          <ArrowLeftRight className="w-5 h-5" />
        </NavLink>
        <NavLink
          to="/asset-trend"
          className={navClass}
          title={t('sidebar.assetTrend')}
        >
          <PieChart className="w-5 h-5" />
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
            <DialogTitle>Snowball Cookie</DialogTitle>
            <DialogDescription>
              Paste the exported cookie string from Snowball. Leave empty to clear the current value.
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSaveCookie}>
              Save
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
