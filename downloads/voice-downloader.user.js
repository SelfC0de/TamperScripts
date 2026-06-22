// ==UserScript==
// @name         Voice Downloader
// @namespace    Powered by SelfCode
// @version      2.1.0
// @description  Кнопка скачивания голосовых сообщений VK (.ogg) прямо в плеере
// @author       -
// @match        https://vk.com/*
// @match        https://vk.ru/*
// @run-at       document-start
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/voice-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/voice-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        urlPrefixes: [
            'https://psv4.userapi.com/s/v1/',
            'https://psv4.vkuserphoto.ru/s/v1/'
        ],
        playerSelector: '.AttachVoice',
        playerInner: '.AttachVoice__player',
        playBtnSelector: '.AttachVoice__play',
        btnClass: 'vd-inline-btn'
    };

    let pendingBtn = null;

    function isVoiceUrl(url) {
        if (typeof url !== 'string') return false;
        if (url.indexOf('.ogg') === -1) return false;
        for (let i = 0; i < CONFIG.urlPrefixes.length; i++) {
            if (url.indexOf(CONFIG.urlPrefixes[i]) === 0) return true;
        }
        return false;
    }

    function extractId(url) {
        const clean = url.split('?')[0];
        const m = clean.match(/\/([^/]+)\.ogg$/);
        return m ? m[1] : 'voice';
    }

    function attachUrlToPending(url) {
        if (!pendingBtn) return;
        const clean = url.split('?')[0];
        pendingBtn.dataset.url = clean;
        pendingBtn.classList.remove('vd-waiting');
        pendingBtn.classList.add('vd-ready');
        pendingBtn.title = 'Скачать голосовое';
        pendingBtn = null;
    }

    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function (method, url) {
        this.__vd_url = url;
        return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function () {
        const url = this.__vd_url;
        if (isVoiceUrl(url)) attachUrlToPending(url);
        return origSend.apply(this, arguments);
    };

    const origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function (input) {
            let url = null;
            try { url = (typeof input === 'string') ? input : (input && input.url); } catch (e) {}
            if (isVoiceUrl(url)) attachUrlToPending(url);
            return origFetch.apply(this, arguments);
        };
    }

    try {
        const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
        if (desc && desc.set) {
            Object.defineProperty(HTMLMediaElement.prototype, 'src', {
                configurable: true,
                enumerable: desc.enumerable,
                get: desc.get,
                set: function (val) {
                    if (isVoiceUrl(val)) attachUrlToPending(val);
                    return desc.set.call(this, val);
                }
            });
        }
    } catch (e) {}

    const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 1.5a.75.75 0 0 1 .75.75v6.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.22 2.22V2.25A.75.75 0 0 1 8 1.5z"/><path d="M2.75 11a.75.75 0 0 1 .75.75v1.25c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25v-1.25a.75.75 0 0 1 1.5 0v1.25A1.75 1.75 0 0 1 12.25 14.75h-8.5A1.75 1.75 0 0 1 2 13v-1.25a.75.75 0 0 1 .75-.75z"/></svg>';

    function injectButton(player) {
        if (player.querySelector('.' + CONFIG.btnClass)) return;
        const inner = player.querySelector(CONFIG.playerInner);
        if (!inner) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = CONFIG.btnClass + ' vd-waiting';
        btn.title = 'Прослушайте, чтобы скачать';
        btn.innerHTML = ICON;
        inner.appendChild(btn);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const url = btn.dataset.url;
            if (!url) return;
            download(url, btn);
        });

        const playBtn = player.querySelector(CONFIG.playBtnSelector);
        if (playBtn) {
            playBtn.addEventListener('click', function () {
                if (!btn.dataset.url) pendingBtn = btn;
            }, true);
        }
    }

    function download(url, btn) {
        const name = extractId(url) + '.ogg';
        btn.classList.add('vd-loading');
        try {
            GM_download({
                url: url,
                name: name,
                saveAs: false,
                onload: function () { btn.classList.remove('vd-loading'); flash(btn, true); },
                onerror: function () { btn.classList.remove('vd-loading'); flash(btn, false); }
            });
        } catch (e) {
            btn.classList.remove('vd-loading');
            flash(btn, false);
        }
    }

    function flash(btn, ok) {
        btn.classList.add(ok ? 'vd-ok' : 'vd-err');
        setTimeout(function () { btn.classList.remove('vd-ok', 'vd-err'); }, 1200);
    }

    function scan(root) {
        const players = (root.matches && root.matches(CONFIG.playerSelector))
            ? [root]
            : (root.querySelectorAll ? root.querySelectorAll(CONFIG.playerSelector) : []);
        players.forEach(injectButton);
    }

    function startObserver() {
        scan(document);
        const obs = new MutationObserver(function (muts) {
            for (let i = 0; i < muts.length; i++) {
                const added = muts[i].addedNodes;
                for (let j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) scan(added[j]);
                }
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    function injectStyle() {
        const css = ''
        + '.' + CONFIG.btnClass + '{flex:none;width:26px;height:26px;margin-left:6px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;cursor:pointer;background:rgba(94,124,255,.14);color:#5e7cff;transition:background .15s,color .15s,transform .1s,opacity .15s;opacity:.55;}'
        + '.' + CONFIG.btnClass + '.vd-waiting{cursor:default;opacity:.35;color:#8a93b2;background:rgba(120,130,160,.12);}'
        + '.' + CONFIG.btnClass + '.vd-ready{opacity:1;}'
        + '.' + CONFIG.btnClass + '.vd-ready:hover{background:linear-gradient(135deg,#5e7cff,#a06eff);color:#fff;transform:translateY(-1px);}'
        + '.' + CONFIG.btnClass + '.vd-ready:active{transform:translateY(0);}'
        + '.' + CONFIG.btnClass + '.vd-loading{opacity:1;animation:vd-pulse .8s infinite;}'
        + '.' + CONFIG.btnClass + '.vd-ok{background:#2ecc71;color:#fff;opacity:1;}'
        + '.' + CONFIG.btnClass + '.vd-err{background:#e74c3c;color:#fff;opacity:1;}'
        + '@keyframes vd-pulse{0%,100%{opacity:1}50%{opacity:.45}}';
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
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