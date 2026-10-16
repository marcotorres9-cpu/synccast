'use client'

import dynamic from 'next/dynamic'

const UpdateManager = dynamic(() => import('./update-manager').then(m => ({ default: m.UpdateManager })), {
  ssr: false,
})

export function UpdateManagerClient() {
  return <UpdateManager />
}
