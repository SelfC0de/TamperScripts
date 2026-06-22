// ==UserScript==
// @name         VK Post to PDF
// @namespace    Powered by SelfCode
// @version      1.0.1
// @description  Скачивание поста VK в PDF (точный скриншот, многостраничный A4, светлая тема)
// @author       -
// @match        https://vk.com/*
// @match        https://vk.ru/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      userapi.com
// @connect      vkuserphoto.ru
// @connect      vkuser.net
// @connect      sun9-*.userapi.com
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
// @updateURL    https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/vk-post-to-pdf.user.js
// @downloadURL  https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/vk-post-to-pdf.user.js
// ==/UserScript==

(function () {
    'use strict';

    const POST_SELECTORS = [
        '._post', '.post', '[data-post-id]', '.wall_module ._post',
        '.PostWithCustomAvatarFooter', '.post_item', '.wall_post_text'
    ];
    const MENU_BTN_SELECTORS = [
        '._post_options', '.ui_actions_menu_wrap',
        '[aria-label*="ействи"]', '[aria-label*="ption"]',
        '.PostHeaderActionsMenu', '.post_actions_menu_btn'
    ];
    const SHOW_MORE_SELECTORS = [
        '.wall_post_more', '.PostText__more', '.show_full_btn',
        '[class*="ShowMore"]', '[class*="show_more"]'
    ];
    const DROPDOWN_SELECTORS = [
        '.ui_actions_menu', '[role="menu"]', '.MenuItemsDropdown',
        '.vkuiActionSheet', '.ui_menu'
    ];

    const MARK = 'vd-pdf-injected';
    const ITEM_CLASS = 'vd-pdf-menuitem';
    const TOAST_CLASS = 'vd-pdf-toast';

    function findPostRoot(el) {
        let cur = el;
        while (cur && cur !== document.body) {
            for (const sel of POST_SELECTORS) {
                if (cur.matches && cur.matches(sel)) return cur;
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function getPostId(post) {
        const id = post.getAttribute('data-post-id') || post.id || '';
        const m = id.match(/(-?\d+_\d+)/);
        return m ? m[1] : (id || 'post_' + Date.now());
    }

    function showToast(text, ok) {
        let t = document.querySelector('.' + TOAST_CLASS);
        if (!t) {
            t = document.createElement('div');
            t.className = TOAST_CLASS;
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.classList.toggle('vd-pdf-toast-err', ok === false);
        t.classList.add('vd-pdf-toast-show');
        clearTimeout(t.__h);
        t.__h = setTimeout(() => t.classList.remove('vd-pdf-toast-show'), 2600);
    }

    function expandPost(post) {
        return new Promise((resolve) => {
            let clicked = false;
            for (const sel of SHOW_MORE_SELECTORS) {
                const btn = post.querySelector(sel);
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    clicked = true;
                    break;
                }
            }
            setTimeout(resolve, clicked ? 400 : 50);
        });
    }

    function loadImageBase64(url) {
        return new Promise((resolve) => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onload: function (r) {
                        if (!r.response) return resolve(null);
                        const fr = new FileReader();
                        fr.onload = () => resolve(fr.result);
                        fr.onerror = () => resolve(null);
                        fr.readAsDataURL(r.response);
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } catch (e) { resolve(null); }
        });
    }

    function extractBgUrl(style) {
        if (!style) return null;
        const m = style.match(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/);
        return m ? m[2] : null;
    }

    async function inlineImages(clone) {
        const imgs = clone.querySelectorAll('img');
        const tasks = [];
        imgs.forEach((img) => {
            const src = img.currentSrc || img.src;
            if (!src || src.startsWith('data:')) return;
            tasks.push(loadImageBase64(src).then((b64) => {
                if (b64) {
                    img.src = b64;
                    img.removeAttribute('srcset');
                    img.removeAttribute('crossorigin');
                }
            }));
        });
        const bgs = clone.querySelectorAll('[style*="background"]');
        bgs.forEach((el) => {
            const url = extractBgUrl(el.getAttribute('style'));
            if (!url) return;
            tasks.push(loadImageBase64(url).then((b64) => {
                if (b64) {
                    el.style.backgroundImage = 'url(' + b64 + ')';
                }
            }));
        });
        await Promise.all(tasks);
    }

    function applyLightTheme(host) {
        host.classList.remove('scheme_space_gray', 'scheme_vkcom_dark', 'dark', 'vkuiTokensClassNamesDark');
        host.classList.add('scheme_bright_light', 'vkuiTokensClassNamesLight');
        host.style.background = '#ffffff';
        host.style.color = '#000000';
    }

    function buildOffscreenHost(clone, width) {
        const host = document.createElement('div');
        host.style.cssText = [
            'position:fixed', 'left:-99999px', 'top:0',
            'width:' + width + 'px',
            'background:#ffffff', 'color:#000000',
            'padding:16px', 'box-sizing:border-box',
            'z-index:-1', 'pointer-events:none'
        ].join(';');
        applyLightTheme(host);
        host.appendChild(clone);
        document.body.appendChild(host);
        return host;
    }

    async function captureToPdf(post, postId) {
        showToast('Готовлю PDF…');
        await expandPost(post);

        const width = Math.max(post.getBoundingClientRect().width, 600);
        const clone = post.cloneNode(true);

        clone.querySelectorAll('.' + ITEM_CLASS + ',.vd-pdf-btn-inline').forEach(n => n.remove());

        const host = buildOffscreenHost(clone, width);

        try {
            await inlineImages(clone);
            await new Promise(r => setTimeout(r, 150));

            const canvas = await html2canvas(clone, {
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: false,
                scale: 2,
                logging: false,
                width: width,
                windowWidth: width
            });

            const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });

            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const usableW = pageW - margin * 2;
            const usableH = pageH - margin * 2;

            const imgW = usableW;
            const imgH = canvas.height * imgW / canvas.width;

            if (imgH <= usableH) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, imgH);
            } else {
                // нарезаем canvas по страницам
                const pageCanvasH = Math.floor(canvas.width * usableH / usableW);
                let y = 0;
                let first = true;
                while (y < canvas.height) {
                    const sliceH = Math.min(pageCanvasH, canvas.height - y);
                    const slice = document.createElement('canvas');
                    slice.width = canvas.width;
                    slice.height = sliceH;
                    slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                    const sliceImgH = sliceH * imgW / canvas.width;
                    if (!first) pdf.addPage();
                    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceImgH);
                    first = false;
                    y += sliceH;
                }
            }

            pdf.save('vk_' + postId + '.pdf');
            showToast('Готово');
        } catch (e) {
            console.error('[VK→PDF]', e);
            showToast('Ошибка при создании PDF', false);
        } finally {
            host.remove();
        }
    }

    function makeMenuItem(label, onClick) {
        const div = document.createElement('div');
        div.className = ITEM_CLASS + ' ui_actions_menu_item';
        div.setAttribute('role', 'menuitem');
        div.textContent = label;
        div.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
            document.body.click();
        });
        return div;
    }

    function findActiveDropdown() {
        for (const sel of DROPDOWN_SELECTORS) {
            const nodes = document.querySelectorAll(sel);
            for (const n of nodes) {
                if (n.offsetParent !== null && !n.classList.contains(MARK)) return n;
            }
        }
        return null;
    }

    function findPostForDropdown(dropdown) {
        // ищем последний пост, у которого открыто меню (на странице может быть только одно открытое меню)
        const triggers = document.querySelectorAll('[aria-expanded="true"]');
        for (const t of triggers) {
            const p = findPostRoot(t);
            if (p) return p;
        }
        // fallback: пост, ближайший по координатам к dropdown
        const rect = dropdown.getBoundingClientRect();
        const posts = document.querySelectorAll(POST_SELECTORS.join(','));
        let best = null, bestDist = Infinity;
        posts.forEach((p) => {
            const r = p.getBoundingClientRect();
            const dist = Math.hypot(r.left - rect.left, r.top - rect.top);
            if (dist < bestDist) { bestDist = dist; best = p; }
        });
        return best;
    }

    function injectIntoDropdown(dropdown) {
        if (dropdown.classList.contains(MARK)) return;
        dropdown.classList.add(MARK);

        const post = findPostForDropdown(dropdown);
        if (!post) return;

        const item = makeMenuItem('Скачать в PDF', () => {
            captureToPdf(post, getPostId(post));
        });

        // пробуем встроить в стиль соседних пунктов
        const sibling = dropdown.querySelector('[role="menuitem"], .ui_actions_menu_item, [class*="MenuItem"]');
        if (sibling && sibling.className) {
            item.className = sibling.className + ' ' + ITEM_CLASS;
            item.style.cursor = 'pointer';
        }
        dropdown.appendChild(item);
    }

    function injectInlineButton(post) {
        if (post.dataset.vdPdfInjected === '1') return;
        if (post.querySelector(':scope > .vd-pdf-btn-inline, :scope .vd-pdf-btn-inline')) {
            post.dataset.vdPdfInjected = '1';
            return;
        }
        const target = post.querySelector('.post_header_info, .PostHeaderTitle, .post_header')
                    || post;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vd-pdf-btn-inline';
        btn.title = 'Скачать пост в PDF';
        btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1.5a.75.75 0 0 1 .75.75v6.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5z"/><path d="M2.75 11a.75.75 0 0 1 .75.75v1.25c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25v-1.25a.75.75 0 0 1 1.5 0v1.25A1.75 1.75 0 0 1 12.25 14.75h-8.5A1.75 1.75 0 0 1 2 13v-1.25a.75.75 0 0 1 .75-.75z"/></svg><span>PDF</span>';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            captureToPdf(post, getPostId(post));
        });
        target.appendChild(btn);
        post.dataset.vdPdfInjected = '1';
    }

    function injectStyle() {
        const css = `
.vd-pdf-btn-inline{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:3px 8px;border:none;border-radius:6px;background:rgba(94,124,255,.14);color:#5e7cff;font-size:11px;font-weight:600;cursor:pointer;opacity:.7;transition:opacity .15s,background .15s,color .15s,transform .1s;vertical-align:middle;}
.vd-pdf-btn-inline:hover{opacity:1;background:linear-gradient(135deg,#5e7cff,#a06eff);color:#fff;transform:translateY(-1px);}
.vd-pdf-btn-inline:active{transform:translateY(0);}
.${ITEM_CLASS}{padding:8px 14px;cursor:pointer;color:inherit;font:inherit;}
.${ITEM_CLASS}:hover{background:rgba(94,124,255,.12);}
.${TOAST_CLASS}{position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);background:rgba(30,30,40,.95);color:#fff;padding:10px 18px;border-radius:10px;font:14px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:2147483647;}
.${TOAST_CLASS}.vd-pdf-toast-show{opacity:1;transform:translateX(-50%) translateY(0);}
.${TOAST_CLASS}.vd-pdf-toast-err{background:#c0392b;}
`;
        const s = document.createElement('style');
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }

    function scanPosts(root) {
        const initial = (root.matches && POST_SELECTORS.some(s => root.matches(s)))
            ? [root]
            : (root.querySelectorAll ? Array.from(root.querySelectorAll(POST_SELECTORS.join(','))) : []);
        // отсеиваем вложенные (если один пост содержит другой по селектору — берём только внешний)
        const filtered = initial.filter((p) => {
            return !initial.some((other) => other !== p && other.contains(p));
        });
        filtered.forEach(injectInlineButton);
    }

    function startObserver() {
        scanPosts(document);
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    scanPosts(n);
                    // проверка появления меню (три точки)
                    const dropdown = findActiveDropdown();
                    if (dropdown) injectIntoDropdown(dropdown);
                }
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        // периодическая проверка дропдауна (он может появиться без новых нод)
        setInterval(() => {
            const dropdown = findActiveDropdown();
            if (dropdown) injectIntoDropdown(dropdown);
        }, 500);
    }

    function boot() {
        if (window.top !== window.self) return;
        injectStyle();
        startObserver();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        boot();
    } else {
        window.addEventListener('DOMContentLoaded', boot);
    }
})();
