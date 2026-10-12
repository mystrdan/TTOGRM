interface TelegramWebApp {
  ready: () => void
  expand: () => void
  initData: string
  initDataUnsafe?: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      photo_url?: string
    }
  }
  colorScheme?: 'light' | 'dark'
  themeParams?: Record<string, string>
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    selectionChanged: () => void
  }
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp
  }
}


type TelegramLoginUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginUser) => void
  }
}
