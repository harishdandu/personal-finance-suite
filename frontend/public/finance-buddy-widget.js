(function () {
  if (window.FinanceBuddyWidget) return

  function parseNum(v, fallback) {
    var n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  function normalizePosition(pos) {
    var p = String(pos || 'bottom-right').toLowerCase()
    if (p === 'bottom-left' || p === 'top-right' || p === 'top-left') return p
    return 'bottom-right'
  }

  function placeByPosition(el, position, offsetX, offsetY) {
    el.style.left = ''
    el.style.right = ''
    el.style.top = ''
    el.style.bottom = ''

    if (position.indexOf('left') >= 0) el.style.left = offsetX + 'px'
    else el.style.right = offsetX + 'px'

    if (position.indexOf('top') >= 0) el.style.top = offsetY + 'px'
    else el.style.bottom = offsetY + 'px'
  }

  function appendQueryParam(url, key, value) {
    if (!url || String(url).indexOf(key + '=') >= 0) return url
    var sep = String(url).indexOf('?') >= 0 ? '&' : '?'
    return url + sep + key + '=' + value
  }

  function init(options) {
    var appUrl = options.appUrl || 'http://localhost:5173/?embed=1&tool=tax'
    var chatMode =
      options.chatMode === true ||
      options.chat === true ||
      String(options.chat || options.chatMode || '') === '1'
    if (chatMode) appUrl = appendQueryParam(appUrl, 'chat', '1')
    /** Base URL for the iframe (reload with a cache-bust param after each hide → show). */
    var frameUrlBase = String(appUrl)
    var buttonLabel = options.buttonLabel || 'Finance Buddy'
    var zIndex = Number(options.zIndex || 2147483000)
    var position = normalizePosition(options.position)
    var offsetX = parseNum(options.offsetX, 20)
    var offsetY = parseNum(options.offsetY, 20)
    var panelWidth = parseNum(options.panelWidth, 380)
    var panelHeight = parseNum(options.panelHeight, 680)
    var gap = parseNum(options.gap, 58)

    var launcher = document.createElement('button')
    launcher.type = 'button'
    launcher.setAttribute('aria-label', 'Open Finance Buddy')
    launcher.textContent = buttonLabel
    launcher.style.position = 'fixed'
    launcher.style.border = 'none'
    launcher.style.borderRadius = '999px'
    launcher.style.padding = '12px 16px'
    launcher.style.background = '#d11f2f'
    launcher.style.color = '#fff'
    launcher.style.fontWeight = '700'
    launcher.style.cursor = 'pointer'
    launcher.style.boxShadow = '0 10px 24px rgba(0,0,0,0.2)'
    launcher.style.zIndex = String(zIndex)
    placeByPosition(launcher, position, offsetX, offsetY)

    var panel = document.createElement('div')
    panel.style.position = 'fixed'
    panel.style.width = panelWidth + 'px'
    panel.style.height = panelHeight + 'px'
    panel.style.maxWidth = 'calc(100vw - 24px)'
    panel.style.maxHeight = 'calc(100vh - 96px)'
    panel.style.borderRadius = '14px'
    panel.style.overflow = 'hidden'
    panel.style.boxShadow = '0 20px 40px rgba(0,0,0,0.24)'
    panel.style.border = '1px solid #e5e7eb'
    panel.style.background = '#fff'
    panel.style.display = 'none'
    panel.style.zIndex = String(zIndex)
    placeByPosition(panel, position, offsetX, offsetY + gap)

    var closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.textContent = 'x'
    closeBtn.style.position = 'absolute'
    closeBtn.style.top = '8px'
    closeBtn.style.right = '8px'
    closeBtn.style.border = '1px solid #ddd'
    closeBtn.style.borderRadius = '8px'
    closeBtn.style.width = '30px'
    closeBtn.style.height = '30px'
    closeBtn.style.cursor = 'pointer'
    closeBtn.style.zIndex = '2'
    closeBtn.style.background = '#fff'

    var frame = document.createElement('iframe')
    frame.src = frameUrlBase
    frame.title = 'Finance Buddy'
    frame.style.width = '100%'
    frame.style.height = '100%'
    frame.style.border = 'none'

    /**
     * After the panel is hidden, next open loads a fresh app URL so chat/tax state starts over.
     * Unload to about:blank on hide so the browser cannot restore a cached document.
     */
    var needsReloadOnOpen = false

    function hidePanel() {
      panel.style.display = 'none'
      needsReloadOnOpen = true
      try {
        frame.src = 'about:blank'
      } catch (e) {}
    }

    function showPanel() {
      if (needsReloadOnOpen) {
        var base = frameUrlBase.replace(/([?&])_fbReset=[^&]*&?/g, '$1').replace(/[?&]$/, '')
        var sep = base.indexOf('?') >= 0 ? '&' : '?'
        frame.removeAttribute('src')
        frame.src = base + sep + '_fbReset=' + Date.now()
        needsReloadOnOpen = false
      }
      panel.style.display = 'block'
    }

    closeBtn.addEventListener('click', hidePanel)

    launcher.addEventListener('click', function () {
      if (panel.style.display === 'none') {
        showPanel()
      } else {
        hidePanel()
      }
    })

    panel.appendChild(closeBtn)
    panel.appendChild(frame)
    document.body.appendChild(panel)
    document.body.appendChild(launcher)
  }

  window.FinanceBuddyWidget = { init: init }

  var script = document.currentScript
  if (script && script.hasAttribute('data-auto-init')) {
    init({
      appUrl: script.getAttribute('data-app-url') || undefined,
      chatMode: script.getAttribute('data-chat') === '1' || script.getAttribute('data-chat-mode') === '1',
      buttonLabel: script.getAttribute('data-button-label') || undefined,
      position: script.getAttribute('data-position') || undefined,
      offsetX: script.getAttribute('data-offset-x') || undefined,
      offsetY: script.getAttribute('data-offset-y') || undefined,
      panelWidth: script.getAttribute('data-panel-width') || undefined,
      panelHeight: script.getAttribute('data-panel-height') || undefined,
      gap: script.getAttribute('data-gap') || undefined,
      zIndex: script.getAttribute('data-z-index') || undefined,
    })
  }
})()
