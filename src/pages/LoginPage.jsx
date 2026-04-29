import { useState } from 'react'
import './login.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || 'Request failed')
  return data
}

export default function LoginPage({ onLoginSuccess, allowRegister = true }) {
  const [mode, setMode] = useState('login') // login | register
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRequested, setOtpRequested] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const resetInfo = () => {
    setMessage('')
    setError('')
  }

  const onRequestOtp = async () => {
    resetInfo()
    setLoading(true)
    try {
      await postJson('/auth/register/request-otp', { name, email, password })
      setOtpRequested(true)
      setMessage('OTP sent to your email. Enter it below to complete registration.')
    } catch (e) {
      setError(e?.message || 'Could not send OTP')
    } finally {
      setLoading(false)
    }
  }

  const onVerifyOtp = async () => {
    resetInfo()
    setLoading(true)
    try {
      const data = await postJson('/auth/register/verify-otp', { email, otp })
      onLoginSuccess?.({
        ...data.user,
        token: data.token,
      })
    } catch (e) {
      setError(e?.message || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  const onLogin = async () => {
    resetInfo()
    setLoading(true)
    try {
      const data = await postJson('/auth/login', { email, password })
      onLoginSuccess?.({
        ...data.user,
        token: data.token,
      })
    } catch (e) {
      setError(e?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const effectiveMode = allowRegister ? mode : 'login'

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginTitle">Finance Buddy</div>
        <div className="loginSub">{allowRegister ? 'Register or login with your email' : 'Login to continue'}</div>

        {allowRegister ? (
          <div className="loginTabs">
            <button
              type="button"
              className={`loginTab ${mode === 'login' ? 'isActive' : ''}`}
              onClick={() => {
                setMode('login')
                setOtpRequested(false)
                resetInfo()
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`loginTab ${mode === 'register' ? 'isActive' : ''}`}
              onClick={() => {
                setMode('register')
                setOtpRequested(false)
                resetInfo()
              }}
            >
              Register
            </button>
          </div>
        ) : null}

        {effectiveMode === 'register' ? (
          <div className="loginForm">
            <label className="loginLabel">Name</label>
            <input className="loginInput" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="loginLabel">Email</label>
            <input className="loginInput" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="loginLabel">Password</label>
            <input
              type="password"
              className="loginInput"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!otpRequested ? (
              <button type="button" className="loginPrimaryBtn" disabled={loading} onClick={onRequestOtp}>
                {loading ? 'Sending OTP...' : 'Register & Send OTP'}
              </button>
            ) : (
              <>
                <label className="loginLabel">OTP</label>
                <input className="loginInput" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <button type="button" className="loginPrimaryBtn" disabled={loading} onClick={onVerifyOtp}>
                  {loading ? 'Verifying...' : 'Verify OTP & Create Account'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="loginForm">
            <label className="loginLabel">Email</label>
            <input className="loginInput" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="loginLabel">Password</label>
            <input
              type="password"
              className="loginInput"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="loginPrimaryBtn" disabled={loading} onClick={onLogin}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        )}

        {message ? <div className="loginInfo">{message}</div> : null}
        {error ? (
          <div className="loginWarn">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
