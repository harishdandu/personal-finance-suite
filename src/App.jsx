import { useEffect, useMemo, useState } from 'react'
import './AppShell.css'
import SipCalculatorPage from './pages/SipCalculatorPage.jsx'
import TaxCalculatorPage from './pages/TaxCalculatorPage.jsx'
import TaxChatbotPage from './pages/TaxChatbotPage.jsx'
// import SmartProofCollectorPage from './pages/SmartProofCollectorPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CarAdvisorPage from './pages/CarAdvisorPage.jsx'
import FundAdvisorPage from './pages/FundAdvisorPage.jsx'

const USER_KEY = 'fb.authUser'

export default function App() {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const isEmbed = searchParams?.get('embed') === '1'
  const toolParam = searchParams?.get('tool')
  const isAllowedToolParam = isEmbed
    ? toolParam === 'tax' || toolParam === 'car' || toolParam === 'sip' || toolParam === 'fund'
    : toolParam === 'tax' || /* toolParam === 'proof' || */ toolParam === 'sip' || toolParam === 'car' || toolParam === 'fund'
  const defaultTool =
    isAllowedToolParam
      ? toolParam
      : isEmbed
        ? 'tax'
        : 'sip'
  const useTaxChat = searchParams?.get('chat') === '1' && toolParam === 'tax'

  const [activeTool, setActiveTool] = useState(defaultTool)
  const [sipPrefill, setSipPrefill] = useState(null)
  const [taxChatHandoff, setTaxChatHandoff] = useState(null)
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user) {
      window.localStorage.removeItem(USER_KEY)
      return
    }
    window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  }, [user])

  const openSipWithPlan = (plan) => {
    setSipPrefill(plan)
    setActiveTool('sip')
  }

  const onTaxChatHandoff = (values) => {
    setTaxChatHandoff(values)
    setActiveTool('tax')
  }

  // In widget, keep nav visible so user can switch to Proof Collector any time.
  const showNav = true
  // Ask auth only for Smart Proof Collector; other tools are guest-friendly.
  const requiresLogin = false // activeTool === 'proof'
  const showLogin = requiresLogin && !user

  const topLabel = useMemo(() => {
    if (!user?.name) return ''
    return `Hi, ${user.name.split(' ')[0]}`
  }, [user])

  return (
    <div className={`appShell ${isEmbed ? 'isEmbed' : ''}`}>
      {showNav ? (
      <div className="topNav">
        <div className="topNavInner">
          <div className="topNavBrand">Finance Buddy</div>
          <div className="topNavMeta">
            {!isEmbed ? (
              <button
                type="button"
                className={`topNavLink ${activeTool === 'sip' ? 'isActive' : ''}`}
                onClick={() => setActiveTool('sip')}
              >
                SIP Calculator
              </button>
            ) : null}
            <button
              type="button"
              className={`topNavLink ${activeTool === 'tax' ? 'isActive' : ''}`}
              onClick={() => setActiveTool('tax')}
            >
              Tax AI
            </button>
            {/* {!isEmbed ? (
              <button
                type="button"
                className={`topNavLink ${activeTool === 'proof' ? 'isActive' : ''}`}
                onClick={() => setActiveTool('proof')}
              >
                Smart Proof Collector
              </button>
            ) : null} */}
            <button
              type="button"
              className={`topNavLink ${activeTool === 'car' ? 'isActive' : ''}`}
              onClick={() => setActiveTool('car')}
            >
              Drive AI
            </button>
            <button
              type="button"
              className={`topNavLink ${activeTool === 'fund' ? 'isActive' : ''}`}
              onClick={() => setActiveTool('fund')}
            >
              Fund Advisor
            </button>
            {user ? (
              <>
                {topLabel ? <span className="topNavUser">{topLabel}</span> : null}
                <button
                  type="button"
                  className="topNavLink"
                  onClick={() => {
                    setUser(null)
                    setActiveTool(isEmbed ? 'tax' : 'sip')
                  }}
                >
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      {showLogin ? (
        <LoginPage
          onLoginSuccess={(u) => setUser(u)}
          allowRegister={!isEmbed}
        />
      ) : (
        <>
          {activeTool === 'tax' && useTaxChat && taxChatHandoff === null ? (
            <TaxChatbotPage onHandoff={onTaxChatHandoff} />
          ) : activeTool === 'sip' ? (
            <SipCalculatorPage prefillPlan={sipPrefill} />
          /* ) : activeTool === 'proof' ? (
            <SmartProofCollectorPage user={user} /> */
          ) : activeTool === 'car' ? (
            <CarAdvisorPage />
          ) : activeTool === 'fund' ? (
            <FundAdvisorPage />
          ) : (
            <TaxCalculatorPage
              onEditPlanInSip={openSipWithPlan}
              chatInitialValues={taxChatHandoff}
            />
          )}
        </>
      )}
    </div>
  )
}
