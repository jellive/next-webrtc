import type { NextConfig } from 'next'
import { createServer } from 'https'
import { readFileSync } from 'fs'
import path from 'path'

const nextConfig: NextConfig = {
  /* config options here */
  server: {
    https: {
      key: readFileSync(
        path.join(process.cwd(), 'certificates', 'localhost-key.pem')
      ),
      cert: readFileSync(
        path.join(process.cwd(), 'certificates', 'localhost.pem')
      )
    }
  }
}

export default nextConfig
