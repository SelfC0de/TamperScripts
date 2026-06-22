// ==UserScript==
// @name         Select-Place TXT Viewer
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Просмотр содержимого 
// @author       SelfCode
// @match        https://select-place.ru/purchase/*
// @match        https://select-place.ru/purchase/
// @match        https://select-place.ru/purchases/*
// @grant        unsafeWindow
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/select-place-txt-viewer.user.js
// @downloadURL  https://raw.githubusercontent.com/SelfC0de/TamperScripts/main/downloads/select-place-txt-viewer.user.js
// ==/UserScript==

(function() {
    'use strict';

    function initScript() {
        // 1. Стили для модального окна
        const styles = `
            .txt-view-btn {
                background: #28a745;
                color: #fff;
                border: none;
                padding: 4px 10px;
                margin-left: 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                display: inline-block;
                vertical-align: middle;
                font-weight: bold;
            }
            .txt-view-btn:hover { background: #218838; }
            .txt-view-btn:disabled { background: #6c757d; cursor: wait; }

            .txt-modal-overlay {
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .txt-modal-content {
                background: #fff;
                padding: 20px;
                border-radius: 8px;
                max-width: 85%;
                max-height: 85%;
                width: 650px;
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                position: relative;
            }
            .txt-modal-close {
                position: absolute;
                top: 10px; right: 15px;
                font-size: 24px;
                cursor: pointer;
                color: #aaa;
                line-height: 1;
            }
            .txt-modal-close:hover { color: #000; }
            .txt-modal-body {
                overflow-y: auto;
                white-space: pre-wrap;
                background: #f8f9fa;
                padding: 15px;
                border: 1px solid #ced4da;
                border-radius: 4px;
                font-family: monospace;
                margin-top: 15px;
                max-height: 450px;
                text-align: left;
                color: #212529;
                font-size: 13px;
            }
        `;

        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        // 2. Функция показа модального окна
        function showModal(title, text) {
            const oldModal = document.querySelector('.txt-modal-overlay');
            if (oldModal) oldModal.remove();

            const overlay = document.createElement('div');
            overlay.className = 'txt-modal-overlay';

            overlay.innerHTML = `
                <div class="txt-modal-content">
                    <span class="txt-modal-close">&times;</span>
                    <h3 style="margin: 0; font-size: 16px; color: #333;">Содержимое: ${title}</h3>
                    <div class="txt-modal-body"></div>
                </div>
            `;

            overlay.querySelector('.txt-modal-body').innerText = text;

            overlay.querySelector('.txt-modal-close').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });

            document.body.appendChild(overlay);
        }

        // 3. Функция поиска динамических ссылок на скачивание
        function addViewButtons() {
            const links = document.querySelectorAll('a[href*="/purchases/"][href$="/download"]:not(.txt-processed)');

            links.forEach(link => {
                link.classList.add('txt-processed');

                const btn = document.createElement('button');
                btn.className = 'txt-view-btn';
                btn.innerText = '👁 Посмотреть';

                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const fileUrl = link.href;
                    const match = fileUrl.match(/purchases\/(\d+)/);
                    const orderId = match ? `Заказ #${match[1]}` : 'Товар';

                    btn.innerText = 'Загрузка...';
                    btn.disabled = true;

                    // Отключаем confirm страницы
                    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                    const oldConfirm = win.confirm;
                    win.confirm = () => true;

                    // Используем оконный fetch (со всеми куками сайта) вместо GM_xmlhttpRequest
                    win.fetch(fileUrl, { method: 'GET' })
                        .then(response => {
                            win.confirm = oldConfirm; // Возвращаем confirm обратно
                            if (!response.ok) {
                                throw new Error('Код ответа: ' + response.status);
                            }
                            return response.text();
                        })
                        .then(text => {
                            btn.innerText = '👁 Посмотреть';
                            btn.disabled = false;
                            showModal(orderId, text);
                        })
                        .catch(error => {
                            win.confirm = oldConfirm;
                            btn.innerText = '👁 Посмотреть';
                            btn.disabled = false;
                            alert('Ошибка при загрузке: ' + error.message);
                        });
                }, true);

                link.parentNode.insertBefore(btn, link.nextSibling);
            });
        }

        addViewButtons();
        setInterval(addViewButtons, 1500);
    }

    if (document.readyState === 'complete') {
        initScript();
    } else {
        window.addEventListener('load', initScript);
    }

})();