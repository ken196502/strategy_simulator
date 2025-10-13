import { useTranslation } from '@/lib/i18n'

export default function Header() {
  const { t } = useTranslation()
  return (
    <header className="w-full border-b bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto p-2 flex items-center justify-between">
        <h1 >{t('header.title')}</h1>
      </div>
    </header>
  )
}
