import React from 'react'

export default function Header() {
  return (
    <header className="w-full border-b bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Simulated US/HK Trading</h1>
        <div className="text-sm text-muted-foreground">Demo</div>
      </div>
    </header>
  )
}
