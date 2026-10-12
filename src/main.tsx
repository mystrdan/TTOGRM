import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const webApp = window.Telegram?.WebApp
webApp?.ready()
webApp?.expand()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
