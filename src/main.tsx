import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TonConnectUIProvider } from '@tonconnect/ui-react'
import './styles.css'

const webApp = window.Telegram?.WebApp
webApp?.ready()
webApp?.expand()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl="https://ttogrm-capsicom.vercel.app/tonconnect-manifest.json">
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>,
)
