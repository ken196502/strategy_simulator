import { PieChart, ArrowLeftRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export default function Sidebar() {
  const { t, lang, setLang } = useTranslation()
  const toggle = () => setLang(lang === 'en' ? 'cn' : 'en')
  return (
    <aside className="w-16 border-r h-full p-2 flex flex-col items-center">
      <nav className="space-y-4">
        <a 
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors" 
          href="#portfolio"
          title={t('sidebar.portfolio')}
        >
          <PieChart className="w-5 h-5 text-gray-600" />
        </a>
        <a 
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors" 
          href="#trading"
          title={t('sidebar.trading')}
        >
          <ArrowLeftRight className="w-5 h-5 text-gray-600" />
        </a>
      </nav>
      <button onClick={toggle} className="mt-4 text-xs px-2 py-1 border rounded" title="Toggle Language">
        {lang === 'en' ? t('header.lang.cn') : t('header.lang.en')}
      </button>
    </aside>
  )
}
