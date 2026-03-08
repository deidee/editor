(function () {
    'use strict';

    class RichTextEditor {
        constructor(options = {}) {
            this.editors = [];
            this.specialFenceLanguages = new Set(['mermaid', 'abc', 'chem']);
            this.selector = options.selector || 'textarea.editor';

            this.initMermaid();
            this.initMarked();
            this.init();
        }

        initMermaid() {
            if (typeof mermaid === 'undefined') {
                return;
            }

            try {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose'
                });
            } catch (e) {
                // Disable Mermaid silently.
            }
        }

        initMarked() {
            if (typeof marked === 'undefined') {
                return;
            }

            try {
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });
            } catch (e) {
                // Disable Marked config silently.
            }
        }

        init() {
            const textareas = document.querySelectorAll(this.selector);
            textareas.forEach((textarea, index) => this.createEditor(textarea, index));
        }

        createEditor(textarea, index) {
            const sizing = this.getTextareaSizing(textarea);

            const wrapper = document.createElement('div');
            wrapper.className = 'rich-editor-wrapper';
            wrapper.style.cssText = `
                border: 1px solid #ccc;
                position: relative;
                background: white;
                box-sizing: border-box;
                min-width: 0;
            `;

            wrapper.style.width = sizing.width;
            wrapper.style.height = sizing.height;

            const tabContainer = document.createElement('div');
            tabContainer.style.cssText = `
                display: flex;
                border-bottom: 1px solid #ccc;
                background: #f5f5f5;
                box-sizing: border-box;
            `;

            const editTab = this.createTab('Edit', true);
            const previewTab = this.createTab('Preview', false);

            const editContainer = document.createElement('div');
            editContainer.style.cssText = `
                width: 100%;
                height: calc(100% - 40px);
                display: block;
                position: relative;
                box-sizing: border-box;
                min-width: 0;
            `;

            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
            previewContainer.style.cssText = `
                width: 100%;
                height: calc(100% - 40px);
                display: none;
                overflow: auto;
                padding: 10px;
                box-sizing: border-box;
                min-width: 0;
            `;

            const newTextarea = document.createElement('textarea');
            newTextarea.value = textarea.value;
            newTextarea.style.cssText = `
                width: 100%;
                height: 100%;
                border: none;
                padding: 10px;
                resize: none;
                outline: none;
                font-family: monospace;
                font-size: 14px;
                box-sizing: border-box;
                background: transparent;
            `;

            const editorData = {
                textarea: newTextarea,
                preview: previewContainer,
                editTab,
                previewTab,
                editContainer,
                originalTextarea: textarea,
                wrapper,
                index
            };

            this.editors.push(editorData);

            tabContainer.appendChild(editTab);
            tabContainer.appendChild(previewTab);

            editTab.addEventListener('click', () => this.switchToEdit(editorData));
            previewTab.addEventListener('click', () => this.switchToPreview(editorData));

            newTextarea.addEventListener('input', () => {
                textarea.value = newTextarea.value;
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            });

            editContainer.appendChild(newTextarea);
            wrapper.appendChild(tabContainer);
            wrapper.appendChild(editContainer);
            wrapper.appendChild(previewContainer);

            textarea.style.display = 'none';
            textarea.parentNode.insertBefore(wrapper, textarea.nextSibling);

            this.bindResizeSync(editorData);
        }

        getTextareaSizing(textarea) {
            const computedStyle = window.getComputedStyle(textarea);
            const inlineWidth = (textarea.style.width || '').trim();
            const inlineHeight = (textarea.style.height || '').trim();
            const parent = textarea.parentElement;

            const width = this.resolveDimension({
                element: textarea,
                parent,
                inlineValue: inlineWidth,
                computedValue: computedStyle.width,
                dimension: 'width',
                fallback: '100%'
            });

            const height = this.resolveDimension({
                element: textarea,
                parent,
                inlineValue: inlineHeight,
                computedValue: computedStyle.height,
                dimension: 'height',
                fallback: '400px'
            });

            return { width, height };
        }

        resolveDimension({ element, parent, inlineValue, computedValue, dimension, fallback }) {
            const value = inlineValue.toLowerCase();

            // Preserve fluid sizing rules.
            if (value.endsWith('%') || value === 'auto' || value === 'calc(100% - 0px)') {
                return inlineValue;
            }

            if (dimension === 'width' && !inlineValue) {
                const rect = element.getBoundingClientRect();
                const offset = element.offsetWidth;
                const client = element.clientWidth;

                let measured = Math.max(rect.width || 0, offset || 0, client || 0);

                // If the element is width:100%, the real intended width is the parent content width.
                const computedWidthStyle = (window.getComputedStyle(element).width || '').trim();
                if (
                    (!measured || measured <= 120) &&
                    parent &&
                    (
                        computedWidthStyle.endsWith('%') ||
                        element.style.width === '100%' ||
                        computedWidthStyle === 'auto'
                    )
                ) {
                    const parentStyle = window.getComputedStyle(parent);
                    const parentWidth = parent.clientWidth
                        - parseFloat(parentStyle.paddingLeft || 0)
                        - parseFloat(parentStyle.paddingRight || 0);

                    if (parentWidth > 0) {
                        measured = parentWidth;
                    }
                }

                if (measured > 0) {
                    return `${Math.round(measured)}px`;
                }

                if (computedValue && computedValue !== 'auto') {
                    return computedValue;
                }

                return fallback;
            }

            if (dimension === 'height' && !inlineValue) {
                const rect = element.getBoundingClientRect();
                const offset = element.offsetHeight;
                const client = element.clientHeight;
                const measured = Math.max(rect.height || 0, offset || 0, client || 0);

                if (measured > 0) {
                    return `${Math.round(measured)}px`;
                }

                if (computedValue && computedValue !== 'auto') {
                    return computedValue;
                }

                return fallback;
            }

            if (inlineValue) {
                return inlineValue;
            }

            if (computedValue && computedValue !== 'auto') {
                return computedValue;
            }

            return fallback;
        }

        bindResizeSync(editorData) {
            const syncSize = () => {
                const sizing = this.getTextareaSizing(editorData.originalTextarea);
                editorData.wrapper.style.width = sizing.width;
                editorData.wrapper.style.height = sizing.height;
            };

            if (typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(syncSize);
                observer.observe(editorData.originalTextarea);
                if (editorData.originalTextarea.parentElement) {
                    observer.observe(editorData.originalTextarea.parentElement);
                }
                editorData.resizeObserver = observer;
            } else {
                const onResize = () => syncSize();
                window.addEventListener('resize', onResize);
                editorData.windowResizeHandler = onResize;
            }
        }

        createTab(text, active) {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.textContent = text;
            tab.style.cssText = `
                padding: 8px 16px;
                border: none;
                background: ${active ? 'white' : 'transparent'};
                cursor: pointer;
                font-size: 14px;
                outline: none;
                border-bottom: ${active ? '2px solid #007bff' : 'none'};
            `;
            return tab;
        }

        switchToEdit(editorData) {
            editorData.editContainer.style.display = 'block';
            editorData.preview.style.display = 'none';
            editorData.editTab.style.background = 'white';
            editorData.editTab.style.borderBottom = '2px solid #007bff';
            editorData.previewTab.style.background = 'transparent';
            editorData.previewTab.style.borderBottom = 'none';
        }

        async switchToPreview(editorData) {
            editorData.editContainer.style.display = 'none';
            editorData.preview.style.display = 'block';
            editorData.editTab.style.background = 'transparent';
            editorData.editTab.style.borderBottom = 'none';
            editorData.previewTab.style.background = 'white';
            editorData.previewTab.style.borderBottom = '2px solid #007bff';

            await this.renderPreview(editorData);
        }

        async renderPreview(editorData) {
            let text = editorData.textarea.value;

            text = await this.processABC(text, editorData.index);
            text = await this.processMermaid(text, editorData.index);
            text = this.processChemBlocks(text);
            text = this.processCodeBlocks(text);
            text = this.processMath(text);

            const html = this.parseMarkdown(text);
            editorData.preview.innerHTML = html;

            this.renderABCElements(editorData.preview);

            if (typeof Prism !== 'undefined' && typeof Prism.highlightAllUnder === 'function') {
                try {
                    Prism.highlightAllUnder(editorData.preview);
                } catch (e) {}
            }
        }

        parseMarkdown(text) {
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                try {
                    return marked.parse(text);
                } catch (e) {}
            }

            return `<pre>${this.escapeHtml(text)}</pre>`;
        }

        processMath(text) {
            if (typeof katex === 'undefined' || typeof katex.renderToString !== 'function') {
                return text;
            }

            text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
                try {
                    return katex.renderToString(math.trim(), {
                        displayMode: true,
                        throwOnError: false
                    });
                } catch (e) {
                    return `<div class="rte-error">Math Error: ${this.escapeHtml(e.message)}</div>`;
                }
            });

            text = text.replace(/\$([^\$\n]+)\$/g, (match, math) => {
                try {
                    return katex.renderToString(math.trim(), {
                        displayMode: false,
                        throwOnError: false
                    });
                } catch (e) {
                    return `<span class="rte-error">Math Error: ${this.escapeHtml(e.message)}</span>`;
                }
            });

            return text;
        }

        processChemBlocks(text) {
            if (typeof katex === 'undefined' || typeof katex.renderToString !== 'function') {
                return text;
            }

            const chemRegex = /```chem[ \t]*\n([\s\S]*?)```/g;
            const matches = [...text.matchAll(chemRegex)];

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const chemCode = match[1].trim();

                try {
                    const rendered = katex.renderToString(`\\ce{${chemCode}}`, {
                        displayMode: true,
                        throwOnError: false
                    });

                    text = text.replace(
                        match[0],
                        `<div class="chem-block">${rendered}</div>`
                    );
                } catch (e) {
                    text = text.replace(
                        match[0],
                        `<div class="rte-error">Chem Error: ${this.escapeHtml(e.message)}</div>`
                    );
                }
            }

            return text;
        }

        async processMermaid(text, editorIndex) {
            if (typeof mermaid === 'undefined' || typeof mermaid.render !== 'function') {
                return text;
            }

            const mermaidRegex = /```mermaid[ \t]*\n([\s\S]*?)```/g;
            const matches = [...text.matchAll(mermaidRegex)];

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const mermaidCode = match[1];
                const id = `mermaid-${editorIndex}-${i}-${Date.now()}`;

                try {
                    const result = await mermaid.render(id, mermaidCode);
                    const svg = result && result.svg ? result.svg : '';

                    if (!svg) {
                        continue;
                    }

                    text = text.replace(
                        match[0],
                        `<div class="mermaid-container">${svg}</div>`
                    );
                } catch (e) {
                    text = text.replace(
                        match[0],
                        `<div class="rte-error">Mermaid Error: ${this.escapeHtml(e.message)}</div>`
                    );
                }
            }

            return text;
        }

        async processABC(text, editorIndex) {
            if (typeof ABCJS === 'undefined' || typeof ABCJS.renderAbc !== 'function') {
                return text;
            }

            const abcRegex = /```abc[ \t]*\n([\s\S]*?)```/g;
            const matches = [...text.matchAll(abcRegex)];

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const abcCode = match[1];
                const id = `abc-${editorIndex}-${i}-${Date.now()}`;
                const encoded = this.encodeBase64Unicode(abcCode);

                text = text.replace(
                    match[0],
                    `<div class="abc-notation" id="${id}" data-abc="${encoded}"></div>`
                );
            }

            return text;
        }

        processCodeBlocks(text) {
            const codeRegex = /```([a-zA-Z0-9_-]+)[ \t]*\n([\s\S]*?)```/g;
            const matches = [...text.matchAll(codeRegex)];

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const rawLanguage = (match[1] || '').trim();
                const code = match[2] || '';
                const language = rawLanguage.toLowerCase();

                if (this.specialFenceLanguages.has(language)) {
                    continue;
                }

                const prismLanguage = this.normalizePrismLanguage(language);
                const safeCode = this.escapeHtml(code.replace(/\n$/, ''));

                text = text.replace(
                    match[0],
                    `<div class="code-block-wrap"><pre class="language-${prismLanguage}"><code class="language-${prismLanguage}">${safeCode}</code></pre></div>`
                );
            }

            return text;
        }

        renderABCElements(container) {
            if (typeof ABCJS === 'undefined' || typeof ABCJS.renderAbc !== 'function') {
                return;
            }

            const abcElements = container.querySelectorAll('.abc-notation');

            abcElements.forEach((element) => {
                try {
                    const abcCode = this.decodeBase64Unicode(element.getAttribute('data-abc'));
                    ABCJS.renderAbc(element.id, abcCode, {
                        responsive: 'resize',
                        staffwidth: 500
                    });
                } catch (e) {
                    element.innerHTML = `<span class="rte-error">ABC Error: ${this.escapeHtml(e.message)}</span>`;
                }
            });
        }

        normalizePrismLanguage(language) {
            const map = {
                html: 'markup',
                xml: 'markup',
                svg: 'markup',
                mathml: 'markup',
                js: 'javascript',
                mjs: 'javascript',
                cjs: 'javascript',
                shell: 'bash',
                sh: 'bash',
                zsh: 'bash',
                yml: 'yaml',
                md: 'markdown'
            };

            return map[language] || language || 'none';
        }

        encodeBase64Unicode(str) {
            return btoa(unescape(encodeURIComponent(str)));
        }

        decodeBase64Unicode(str) {
            return decodeURIComponent(escape(atob(str)));
        }

        escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    window.RichTextEditor = RichTextEditor;

    function bootRichTextEditor() {
        new RichTextEditor();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootRichTextEditor);
    } else {
        bootRichTextEditor();
    }
})();