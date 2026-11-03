/* RichTextEditor 2.0 — optional Marked, Mermaid, KaTeX, mhchem, ABCJS, Prism, DOMPurify. */
(() => {
    'use strict';

    const initialized = new WeakSet();
    let nextId = 0;

    class RichTextEditor {
        constructor(options = {}) {
            this.selector = options.selector ?? 'textarea.editor';
            this.editors = [];
            this.mermaidReady = false;
            this.init();
        }

        getLibrary(name) {
            return window[name];
        }

        init() {
            document.querySelectorAll(this.selector).forEach(textarea => {
                if (initialized.has(textarea)) return;
                initialized.add(textarea);
                this.createEditor(textarea);
            });
        }

        createEditor(original) {
            const id = `rte-${++nextId}`;
            const style = getComputedStyle(original);
            const rect = original.getBoundingClientRect();
            const parent = original.parentElement;
            const parentStyle = parent ? getComputedStyle(parent) : null;
            const parentWidth = parent ? parent.clientWidth - parseFloat(parentStyle.paddingLeft || 0) - parseFloat(parentStyle.paddingRight || 0) : 0;
            const declaredWidth = original.style.width.trim();
            const typedWidth = original.computedStyleMap?.().get('width');
            const isFluid = declaredWidth.includes('%') || declaredWidth.includes('calc(') || typedWidth?.unit === 'percent' || (!declaredWidth && parentWidth > 0 && Math.abs(rect.width - parentWidth) < 2);

            const wrapper = document.createElement('div');
            wrapper.className = 'rich-editor-wrapper';
            wrapper.style.cssText = 'display:flex;flex-direction:column;min-width:0;box-sizing:border-box;border:1px solid #ccc;background:#fff;';
            wrapper.style.width = declaredWidth && isFluid ? declaredWidth : isFluid ? '100%' : `${rect.width || original.offsetWidth || 300}px`;
            wrapper.style.height = `${rect.height || original.offsetHeight || 200}px`;
            wrapper.style.maxWidth = style.maxWidth;
            wrapper.style.minHeight = style.minHeight === 'auto' ? '0' : style.minHeight;
            wrapper.style.margin = style.margin;

            const tabs = document.createElement('div');
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', 'Editorweergave');
            tabs.style.cssText = 'display:flex;flex:none;border-bottom:1px solid #ccc;background:#f5f5f5;';

            const editTab = this.makeTab('Bewerken', `${id}-edit-tab`, `${id}-edit`, true);
            const previewTab = this.makeTab('Voorbeeld', `${id}-preview-tab`, `${id}-preview`, false);
            tabs.append(editTab, previewTab);

            const editPanel = document.createElement('div');
            editPanel.id = `${id}-edit`;
            editPanel.setAttribute('role', 'tabpanel');
            editPanel.setAttribute('aria-labelledby', editTab.id);
            editPanel.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0;';

            const input = document.createElement('textarea');
            input.value = original.value;
            input.setAttribute('aria-label', original.getAttribute('aria-label') || 'Tekst bewerken');
            input.style.cssText = 'display:block;flex:1;width:100%;min-width:0;min-height:0;box-sizing:border-box;border:0;padding:10px;resize:none;outline-offset:-2px;font:14px/1.5 monospace;background:transparent;';
            editPanel.append(input);

            const previewPanel = document.createElement('div');
            previewPanel.id = `${id}-preview`;
            previewPanel.className = 'preview-container';
            previewPanel.setAttribute('role', 'tabpanel');
            previewPanel.setAttribute('aria-labelledby', previewTab.id);
            previewPanel.style.cssText = 'display:none;flex:1;min-width:0;min-height:0;box-sizing:border-box;overflow:auto;padding:10px;';

            wrapper.append(tabs, editPanel, previewPanel);
            original.after(wrapper);
            original.hidden = true;
            original.style.display = 'none';

            const data = { id, original, input, wrapper, editTab, previewTab, editPanel, previewPanel, renderVersion: 0 };
            this.editors.push(data);

            input.addEventListener('input', () => {
                original.value = input.value;
                original.dispatchEvent(new Event('input', { bubbles: true }));
                original.dispatchEvent(new Event('change', { bubbles: true }));
            });
            original.form?.addEventListener('reset', () => {
                queueMicrotask(() => { input.value = original.value; });
            });

            editTab.addEventListener('click', () => this.activate(data, false));
            previewTab.addEventListener('click', () => this.activate(data, true));
            tabs.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const target = event.key === 'Home' ? editTab : event.key === 'End' ? previewTab : document.activeElement === editTab ? previewTab : editTab;
                target.click();
                target.focus();
            });
        }

        makeTab(label, id, controls, active) {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.id = id;
            tab.textContent = label;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', controls);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            tab.style.cssText = 'padding:8px 16px;border:0;border-bottom:2px solid transparent;background:transparent;cursor:pointer;font:inherit;';
            if (active) {
                tab.style.background = '#fff';
                tab.style.borderBottomColor = '#007bff';
            }
            return tab;
        }

        async activate(data, preview) {
            data.editPanel.style.display = preview ? 'none' : 'flex';
            data.previewPanel.style.display = preview ? 'block' : 'none';
            for (const [tab, active] of [[data.editTab, !preview], [data.previewTab, preview]]) {
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
                tab.style.background = active ? '#fff' : 'transparent';
                tab.style.borderBottomColor = active ? '#007bff' : 'transparent';
            }
            if (preview) await this.renderPreview(data);
        }

        async renderPreview(data) {
            const version = ++data.renderVersion;
            const source = data.input.value;
            const markedLib = this.getLibrary('marked');
            const purifier = this.getLibrary('DOMPurify');
            const MarkedClass = markedLib?.Marked;

            // Without a sanitizer, never insert generated or user-provided HTML.
            if (!MarkedClass || typeof purifier?.sanitize !== 'function') {
                data.previewPanel.replaceChildren(this.plainText(source));
                return;
            }

            const abcItems = new Map();
            const mermaidItems = new Map();
            const instance = new MarkedClass({ gfm: true, breaks: true });
            instance.use({
                extensions: [this.mathBlockExtension(), this.mathInlineExtension()],
                renderer: {
                    code: token => {
                        const code = token.text || '';
                        const language = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
                        return this.renderCode(code, language, data.id, abcItems, mermaidItems);
                    }
                }
            });

            let html;
            try {
                html = await instance.parse(source);
            } catch (error) {
                console.warn('RichTextEditor: Markdown rendering failed.', error);
                if (version === data.renderVersion) data.previewPanel.replaceChildren(this.plainText(source));
                return;
            }
            if (version !== data.renderVersion) return;

            // SVG is sanitized along with HTML. Do not use loose Mermaid security settings.
            data.previewPanel.innerHTML = purifier.sanitize(html);
            await this.renderMermaid(data.previewPanel, mermaidItems, version, data);
            if (version !== data.renderVersion) return;
            this.renderABC(data.previewPanel, abcItems);
            const prism = this.getLibrary('Prism');
            if (typeof prism?.highlightAllUnder === 'function') {
                try { prism.highlightAllUnder(data.previewPanel); }
                catch (error) { console.warn('RichTextEditor: Prism failed.', error); }
            }
        }

        mathBlockExtension() {
            return {
                name: 'rteMathBlock', level: 'block',
                start: source => source.indexOf('$$'),
                tokenizer: source => {
                    const match = /^\$\$[ \t]*\n?([\s\S]*?)\n?\$\$(?:\n|$)/.exec(source);
                    return match ? { type: 'rteMathBlock', raw: match[0], text: match[1] } : undefined;
                },
                renderer: token => this.renderMath(token.text, true)
            };
        }

        mathInlineExtension() {
            return {
                name: 'rteMathInline', level: 'inline',
                start: source => source.indexOf('$'),
                tokenizer: source => {
                    const match = /^\$(?!\$)([^\n$]+?)\$(?!\$)/.exec(source);
                    return match ? { type: 'rteMathInline', raw: match[0], text: match[1] } : undefined;
                },
                renderer: token => this.renderMath(token.text, false)
            };
        }

        renderMath(source, displayMode) {
            const katex = this.getLibrary('katex');
            if (typeof katex?.renderToString !== 'function') {
                return this.escapeHtml(displayMode ? `$$${source}$$` : `$${source}$`);
            }
            try {
                return katex.renderToString(source.trim(), { displayMode, throwOnError: false, trust: false });
            } catch (error) {
                console.warn('RichTextEditor: KaTeX failed.', error);
                return this.escapeHtml(source);
            }
        }

        renderCode(source, language, editorId, abcItems, mermaidItems) {
            if (language === 'mermaid') {
                if (typeof this.getLibrary('mermaid')?.render === 'function') {
                    const id = `${editorId}-mermaid-${++nextId}`;
                    mermaidItems.set(id, source);
                    return `<div class="mermaid-container" id="${id}"></div>`;
                }
            } else if (language === 'abc') {
                if (typeof this.getLibrary('ABCJS')?.renderAbc === 'function') {
                    const id = `${editorId}-abc-${++nextId}`;
                    abcItems.set(id, source);
                    return `<div class="abc-notation" id="${id}"></div>`;
                }
            } else if (language === 'chem') {
                const katex = this.getLibrary('katex');
                if (typeof katex?.renderToString === 'function') {
                    try {
                        return `<div class="chem-block">${katex.renderToString(`\\ce{${source.trim()}}`, { displayMode: true, throwOnError: false, trust: false })}</div>`;
                    } catch (error) {
                        console.warn('RichTextEditor: Chemical notation failed.', error);
                    }
                }
            }
            const lang = this.normalizeLanguage(language);
            return `<div class="code-block-wrap"><pre class="language-${lang}"><code class="language-${lang}">${this.escapeHtml(source.replace(/\n$/, ''))}</code></pre></div>`;
        }

        async renderMermaid(container, items, version, data) {
            const mermaid = this.getLibrary('mermaid');
            if (typeof mermaid?.render !== 'function') return;
            try {
                if (!this.mermaidReady) {
                    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
                    this.mermaidReady = true;
                }
            } catch (error) {
                console.warn('RichTextEditor: Mermaid initialization failed.', error);
                return;
            }
            const purifier = this.getLibrary('DOMPurify');
            for (const [id, source] of items) {
                if (version !== data.renderVersion) return;
                const element = Array.from(container.querySelectorAll('.mermaid-container')).find(el => el.id === id);
                if (!element) continue;
                try {
                    const result = await mermaid.render(id + '-svg', source);
                    if (version !== data.renderVersion) return;
                    element.innerHTML = purifier.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true } });
                } catch (error) {
                    console.warn('RichTextEditor: Mermaid failed.', error);
                    element.textContent = source;
                }
            }
        }

        renderABC(container, items) {
            const abcjs = this.getLibrary('ABCJS');
            if (typeof abcjs?.renderAbc !== 'function') return;
            for (const [id, source] of items) {
                const element = container.querySelector(`#${id}`);
                if (!element) continue;
                try { abcjs.renderAbc(element, source, { responsive: 'resize', staffwidth: 500 }); }
                catch (error) {
                    console.warn('RichTextEditor: ABC rendering failed.', error);
                    element.textContent = source;
                }
            }
        }

        normalizeLanguage(language) {
            const aliases = { html: 'markup', xml: 'markup', svg: 'markup', mathml: 'markup', js: 'javascript', mjs: 'javascript', cjs: 'javascript', shell: 'bash', sh: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown' };
            return aliases[language] || ( /^[a-z0-9_-]+$/i.test(language) ? language : 'none');
        }

        plainText(source) {
            const pre = document.createElement('pre');
            pre.style.whiteSpace = 'pre-wrap';
            pre.textContent = source;
            return pre;
        }

        escapeHtml(value) {
            return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
    }

    window.RichTextEditor = RichTextEditor;
    const boot = () => new RichTextEditor();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
