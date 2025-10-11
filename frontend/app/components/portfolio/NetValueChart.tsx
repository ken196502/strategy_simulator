import React from 'react'

export default function NetValueChart() {
  // Placeholder demo chart
  const points = [0,20,10,30,25,40,35,50]
  const path = points.map((y,i)=> `${i===0 ? 'M' : 'L'} ${i*20} ${60 - y}`).join(' ')
  return (
    <svg viewBox="0 0 140 60" className="w-full h-16">
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
    </svg>
  )
}
