;(function installHengzhunAttachmentBridge() {
    'use strict'

    const marker = 'I10_FLOWISE_ATTACHMENT_BRIDGE_V2'
    const maxFilesPerTurn = 16
    const handledPasteEvents = new WeakSet()

    function accepted(input, file) {
        const rules = String(input.accept || '')
            .split(',')
            .map((rule) => rule.trim().toLowerCase())
            .filter(Boolean)
        if (!rules.length || rules.includes('*') || rules.includes('*/*')) return true
        const mime = String(file.type || '').toLowerCase()
        const name = String(file.name || '').toLowerCase()
        return rules.some((rule) => {
            if (rule.startsWith('.')) return name.endsWith(rule)
            if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1))
            return mime === rule
        })
    }

    function notify(root, message, isError) {
        let status = root.querySelector('[data-hengzhun-attachment-status]')
        if (!status) {
            status = document.createElement('div')
            status.setAttribute('data-hengzhun-attachment-status', marker)
            status.setAttribute('role', 'status')
            status.setAttribute('aria-live', 'polite')
            Object.assign(status.style, {
                position: 'fixed',
                left: '50%',
                bottom: '92px',
                transform: 'translateX(-50%)',
                zIndex: '2147483647',
                maxWidth: 'min(560px, calc(100vw - 32px))',
                padding: '8px 14px',
                borderRadius: '8px',
                color: '#fff',
                font: '14px/1.4 system-ui, sans-serif',
                boxShadow: '0 4px 16px rgba(0,0,0,.18)'
            })
            root.appendChild(status)
        }
        status.style.background = isError ? '#b42318' : '#176b3a'
        status.textContent = message
        clearTimeout(status.__hengzhunTimer)
        status.__hengzhunTimer = setTimeout(() => status.remove(), 3500)
    }

    function findNativeFileInput(root) {
        return Array.from(root.querySelectorAll('input[type="file"]')).find((input) => !input.disabled)
    }

    function handOffFiles(root, input, files, source) {
        const list = Array.from(files || [])
        if (!list.length) return false
        if (list.length > maxFilesPerTurn) {
            notify(root, `一次最多添加 ${maxFilesPerTurn} 个附件。`, true)
            return true
        }
        const rejected = list.filter((file) => !accepted(input, file))
        if (rejected.length) {
            notify(root, '存在不受支持的附件类型，请使用回形针提示中允许的格式。', true)
            return true
        }
        const transfer = new DataTransfer()
        for (const file of list) transfer.items.add(file)
        input.files = transfer.files
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
        notify(root, source === 'paste' ? '已从剪贴板添加图片附件。' : '已添加拖拽附件。', false)
        return true
    }

    function clipboardFiles(event) {
        const collected = []
        for (const file of Array.from(event.clipboardData?.files || [])) {
            if (file) collected.push(file)
        }
        for (const item of Array.from(event.clipboardData?.items || [])) {
            if (item.kind !== 'file' || !String(item.type || '').toLowerCase().startsWith('image/')) continue
            const file = item.getAsFile?.()
            if (file) collected.push(file)
        }
        const seen = new Set()
        return collected.filter((file) => {
            const key = `${file.name}\u0000${file.type}\u0000${file.size}\u0000${file.lastModified}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    function flowiseRootForEvent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : []
        const host = path.find((item) => item?.tagName === 'FLOWISE-FULLCHATBOT')
            || (document.activeElement?.tagName === 'FLOWISE-FULLCHATBOT' ? document.activeElement : null)
            || document.querySelector('flowise-fullchatbot')
        return host?.shadowRoot || null
    }

    function handlePaste(event, preferredRoot) {
        if (handledPasteEvents.has(event)) return
        const files = clipboardFiles(event)
        if (!files.length) return
        const root = preferredRoot || flowiseRootForEvent(event)
        if (!root) return
        const input = findNativeFileInput(root)
        if (!input) {
            notify(root, '当前流程未启用附件上传。', true)
            return
        }
        if (handOffFiles(root, input, files, 'paste')) {
            handledPasteEvents.add(event)
            event.preventDefault()
            event.stopPropagation()
        }
    }

    function installCompactionStyle(root) {
        if (root.querySelector('[data-hengzhun-compaction-style]')) return
        const style = document.createElement('style')
        style.setAttribute('data-hengzhun-compaction-style', marker)
        style.textContent = `
            [data-testid="host-bubble"] > .hengzhun-previous-output {
                display: none !important;
            }
            [data-testid="host-bubble"].hengzhun-show-previous > .hengzhun-previous-output {
                display: revert !important;
            }
            .hengzhun-output-toggle {
                display: block;
                margin: 0 0 10px;
                padding: 5px 10px;
                border: 1px solid #d0d5dd;
                border-radius: 6px;
                background: #fff;
                color: #475467;
                cursor: pointer;
                font: 13px/1.4 system-ui, sans-serif;
            }
        `
        root.appendChild(style)
    }

    function compactAssistantBubble(bubble) {
        const children = Array.from(bubble.children)
        const headings = children
            .map((child, index) => ({ child, index }))
            .filter((item) => item.child.tagName === 'H2')
        if (headings.length < 2) return
        const latestIndex = headings.at(-1).index
        for (const child of children.slice(0, latestIndex)) {
            if (!child.classList.contains('hengzhun-output-toggle')) {
                child.classList.add('hengzhun-previous-output')
            }
        }
        let toggle = bubble.querySelector(':scope > .hengzhun-output-toggle')
        if (!toggle) {
            toggle = document.createElement('button')
            toggle.type = 'button'
            toggle.className = 'hengzhun-output-toggle'
            toggle.textContent = '查看本轮较早输出'
            toggle.addEventListener('click', () => {
                const expanded = bubble.classList.toggle('hengzhun-show-previous')
                toggle.textContent = expanded ? '收起本轮较早输出' : '查看本轮较早输出'
            })
            bubble.insertBefore(toggle, children[latestIndex])
        }
    }

    function compactAssistantReplies(root) {
        installCompactionStyle(root)
        for (const bubble of root.querySelectorAll('[data-testid="host-bubble"]')) {
            compactAssistantBubble(bubble)
        }
    }

    function bindHost(host) {
        const root = host.shadowRoot
        if (!root || root.__hengzhunAttachmentBridge === marker) return
        root.__hengzhunAttachmentBridge = marker

        root.addEventListener(
            'paste',
            (event) => handlePaste(event, root),
            true
        )

        root.addEventListener(
            'dragover',
            (event) => {
                if (!event.dataTransfer?.types?.includes('Files')) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'copy'
            },
            true
        )

        root.addEventListener(
            'drop',
            (event) => {
                const files = Array.from(event.dataTransfer?.files || [])
                if (!files.length) return
                const input = findNativeFileInput(root)
                if (!input) {
                    notify(root, '当前流程未启用附件上传。', true)
                    return
                }
                event.preventDefault()
                handOffFiles(root, input, files, 'drop')
            },
            true
        )

        compactAssistantReplies(root)
        const rootObserver = new MutationObserver(() => compactAssistantReplies(root))
        rootObserver.observe(root, { childList: true, subtree: true })
    }

    function scan() {
        for (const host of document.querySelectorAll('flowise-fullchatbot')) bindHost(host)
    }

    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('paste', (event) => handlePaste(event), true)
})()
