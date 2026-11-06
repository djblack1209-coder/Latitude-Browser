import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './shared/components/AppErrorBoundary'
import './index.css'
import { initializeLocale } from './shared/i18n'


void initializeLocale()
ReactDOM.createRoot(document.getElementById('root')!).render(<AppErrorBoundary><App /></AppErrorBoundary>)

