import { PieChart, ArrowLeftRight } from 'lucide-react'

export default function Sidebar() {
  return (
    <aside className="w-16 border-r h-full p-2 flex flex-col items-center">
      <nav className="space-y-4">
        <a 
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors" 
          href="#portfolio"
          title="Portfolio"
        >
          <PieChart className="w-5 h-5 text-gray-600" />
        </a>
        <a 
          className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors" 
          href="#trading"
          title="Trading"
        >
          <ArrowLeftRight className="w-5 h-5 text-gray-600" />
        </a>
      </nav>
    </aside>
  )
}
