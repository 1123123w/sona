import { useRef } from 'react'
import '@/styles/AboutPage.css'
import { InfoCard } from '@/components/ui/InfoCard'
import { ZapIcon, CodeIcon, BoxIcon, GitHubIcon } from '@/components/ui/icons'
import { store } from '@/lib/store'
import { useI18n } from '@/lib/i18n'

declare const __PLUGIN_VERSION__: string

export function AboutPage() {
  const { t } = useI18n()
  const versionClickRef = useRef({ count: 0, timer: 0 })

  const handleVersionClick = () => {
    const state = versionClickRef.current
    window.clearTimeout(state.timer)
    state.count += 1
    state.timer = window.setTimeout(() => {
      state.count = 0
    }, 900)

    if (state.count >= 3) {
      state.count = 0
      store.set('developerMode', !store.get('developerMode'))
    }
  }

  return (
    <div className="sonaenhance-about">
      <div className="sonaenhance-about-header">
        <h2 className="sonaenhance-about-title">Sona-E</h2>
        <button type="button" className="sonaenhance-about-version" onClick={handleVersionClick}>
          v{__PLUGIN_VERSION__}
        </button>
      </div>

      <p className="sonaenhance-about-desc">
        {t('about.desc')}
      </p>

      {/* Info cards and tech stack side by side */}
      <div className="sonaenhance-about-row">
        <div className="sonaenhance-about-cards">
          <InfoCard icon={<ZapIcon />} label={t('about.plugin')} value={`Sona-E v${__PLUGIN_VERSION__}`} />
          <InfoCard icon={<CodeIcon />} label={t('about.framework')} value="React + Vite" />
          <InfoCard
            icon={<BoxIcon />}
            label={t('about.loader')}
            value={`Pengu Loader ${typeof Pengu !== 'undefined' ? Pengu.version : '1.1.6'}`}
          />
        </div>

        <div className="sonaenhance-about-section sonaenhance-about-tech">
          <h3 className="sonaenhance-about-section-title">{t('about.stack')}</h3>
          <ul className="sonaenhance-about-list">
            <li>React 19 + TypeScript</li>
            <li>Vite 6</li>
            <li>Pengu Loader v1.1.0+</li>
            <li>LCU REST API + WebSocket</li>
          </ul>
          <a
            className="sonaenhance-hex-card sonaenhance-hex-card-link"
            href="https://github.com/1123123w/sona_enhance"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="sonaenhance-hex-card-icon"><GitHubIcon /></span>
            <div className="sonaenhance-hex-card-text">
              <span className="sonaenhance-hex-card-label">GitHub</span>
              <span className="sonaenhance-hex-card-value">1123123w/sona_enhance</span>
            </div>
          </a>
        </div>
      </div>

      <div className="sonaenhance-about-section">
        <h3 className="sonaenhance-about-section-title">{t('about.upstream')}</h3>
        <p className="sonaenhance-about-text">
          {t('about.upstreamThanks')}{' '}
          <a href="https://github.com/WJZ-P" target="_blank" rel="noopener noreferrer">WJZ-P</a>
          {' / '}
          <a href="https://github.com/WJZ-P/sona" target="_blank" rel="noopener noreferrer">Sona</a>
        </p>
      </div>

      <div className="sonaenhance-about-section">
        <h3 className="sonaenhance-about-section-title">{t('about.license')}</h3>
        <p className="sonaenhance-about-text">AGPL-3.0</p>
      </div>

      <div className="sonaenhance-about-quote">
        {t('about.quote')}
      </div>
    </div>
  )
}
