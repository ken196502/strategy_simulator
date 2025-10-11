import React from 'react'

export default function Sidebar() {
  return (
    <aside className="w-64 border-r h-full p-4">
      <nav className="space-y-2 text-sm">
        <div className="text-muted-foreground">Navigation</div>
        <a className="block hover:underline" href="#portfolio">Portfolio</a>
        <a className="block hover:underline" href="#trading">Trading</a>
      </nav>
    </aside>
  )
}
