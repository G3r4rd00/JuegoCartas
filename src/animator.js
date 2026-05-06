/**
 * Animator — sistema de animaciones de cartas para "Casas en Guerra"
 *
 * Responsabilidades:
 *  - flyCard(fromEl, toEl, clone?)  → lanza un clon de carta volando entre dos elementos DOM
 *  - highlightUnit(unitId, type)    → aplica y elimina clase de highlight a un elemento de carta
 *  - combatFlash(attackerId, defenderId, attackerPIdx, defenderPIdx) → animación de choque
 *  - animateNewCard(el)             → animación de entrada de carta
 */
export class Animator {
    constructor(doc = document) {
        this.doc = doc;
        /** @type {Map<string, {rect: DOMRect, clone: HTMLElement}>} */
        this._cardNodes = new Map();
        this._overlay = this._createOverlay();
    }

    _createOverlay() {
        const div = this.doc.createElement("div");
        div.id = "anim-overlay";
        div.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden;";
        this.doc.body.appendChild(div);
        return div;
    }

    /**
     * Registra todos los elementos de carta actualmente en el DOM.
     * Guarda tanto el rect como un clon visual del elemento.
     * Llámalo ANTES del render destructivo.
     */
    snapshot() {
        this._cardNodes.clear();
        this.doc.querySelectorAll("[data-card-id]").forEach((el) => {
            const rect = el.getBoundingClientRect();
            // Solo guardar si el elemento es visible (rect no cero)
            if (rect.width > 0 && rect.height > 0) {
                const clone = el.cloneNode(true);
                // Limpiar clases de estado que pueden interferir visualmente
                clone.classList.remove("exhausted", "attacker-selected", "attack-target", "can-defend", "selected");
                this._cardNodes.set(el.dataset.cardId, { rect, clone });
            }
        });
    }

    /**
     * Devuelve el rect guardado en el snapshot.
     * @param {string} cardId
     * @returns {DOMRect|null}
     */
    getPreviousRect(cardId) {
        return this._cardNodes.get(cardId)?.rect || null;
    }

    /**
     * Devuelve el elemento clonado del snapshot (para usarlo como visual en flyCard).
     * @param {string} cardId
     * @returns {HTMLElement|null}
     */
    getSnapshotElement(cardId) {
        return this._cardNodes.get(cardId)?.clone || null;
    }

    /**
     * Lanza un elemento visual desde `fromRect` hasta `toRect`.
     * @param {DOMRect} fromRect  — posición de origen (viewport coords)
     * @param {DOMRect} toRect    — posición de destino (viewport coords)
     * @param {HTMLElement} cardEl — elemento a animar (clon del snapshot)
     * @param {number} [duration=420] — ms
     * @returns {Promise<void>}
     */
    flyCard(fromRect, toRect, cardEl, duration = 420) {
        return new Promise((resolve) => {
            cardEl.style.cssText = `
                position: fixed;
                left: ${fromRect.left}px;
                top: ${fromRect.top}px;
                width: ${fromRect.width}px;
                height: ${fromRect.height}px;
                margin: 0;
                pointer-events: none;
                z-index: 201;
                opacity: 1;
                transition: left ${duration}ms cubic-bezier(0.4,0,0.2,1),
                            top ${duration}ms cubic-bezier(0.4,0,0.2,1),
                            width ${duration}ms cubic-bezier(0.4,0,0.2,1),
                            height ${duration}ms cubic-bezier(0.4,0,0.2,1),
                            opacity ${duration * 0.4}ms ease ${duration * 0.6}ms;
                transform-origin: center center;
                border-radius: 10px;
                overflow: hidden;
            `;
            this._overlay.appendChild(cardEl);

            // Force reflow para que la posición inicial se aplique antes de la transición
            // eslint-disable-next-line no-unused-expressions
            cardEl.getBoundingClientRect();

            cardEl.style.left = `${toRect.left}px`;
            cardEl.style.top = `${toRect.top}px`;
            cardEl.style.width = `${toRect.width}px`;
            cardEl.style.height = `${toRect.height}px`;
            cardEl.style.opacity = "0";

            const onEnd = () => {
                cardEl.remove();
                resolve();
            };
            cardEl.addEventListener("transitionend", onEnd, { once: true });
            // Safety timeout
            window.setTimeout(onEnd, duration + 150);
        });
    }

    /**
     * Anima una carta que "entra" en su zona (escala + fade-in).
     * @param {HTMLElement} el
     */
    animateEnter(el) {
        el.classList.add("anim-enter");
        el.addEventListener("animationend", () => el.classList.remove("anim-enter"), { once: true });
    }

    /**
     * Aplica un highlight a la carta `cardId` durante `ms` milisegundos.
     * @param {string} cardId
     * @param {'attacker'|'defender'|'bought'|'deployed'|'machine-action'} type
     * @param {number} [ms=900]
     */
    highlightCard(cardId, type, ms = 900) {
        const el = this.doc.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
        if (!el) return;
        const cls = `anim-highlight-${type}`;
        el.classList.add(cls);
        window.setTimeout(() => el.classList.remove(cls), ms);
    }

    /**
     * Animación de choque entre atacante y defensor.
     * Las dos cartas se sacuden hacia el centro y vuelven.
     * @param {string} attackerCardId
     * @param {string} defenderCardId
     * @returns {Promise<void>}
     */
    async combatClash(attackerCardId, defenderCardId) {
        const attEl = this.doc.querySelector(`[data-card-id="${CSS.escape(attackerCardId)}"]`);
        const defEl = this.doc.querySelector(`[data-card-id="${CSS.escape(defenderCardId)}"]`);

        const promises = [];
        if (attEl) {
            attEl.classList.add("anim-clash-attacker");
            promises.push(new Promise((res) => {
                attEl.addEventListener("animationend", () => {
                    attEl.classList.remove("anim-clash-attacker");
                    res();
                }, { once: true });
            }));
        }
        if (defEl) {
            defEl.classList.add("anim-clash-defender");
            promises.push(new Promise((res) => {
                defEl.addEventListener("animationend", () => {
                    defEl.classList.remove("anim-clash-defender");
                    res();
                }, { once: true });
            }));
        }
        if (promises.length) await Promise.all(promises);
    }

    /**
     * Resalta brevemente el panel/zona del jugador que acaba de actuar.
     * @param {HTMLElement} panelEl
     */
    flashPanel(panelEl) {
        if (!panelEl) return;
        panelEl.classList.add("anim-panel-flash");
        window.setTimeout(() => panelEl.classList.remove("anim-panel-flash"), 700);
    }

    /**
     * Anima la barra de fortaleza cuando recibe daño.
     * @param {HTMLElement} barEl
     */
    flashFortDamage(barEl) {
        if (!barEl) return;
        barEl.classList.add("anim-fort-hit");
        window.setTimeout(() => barEl.classList.remove("anim-fort-hit"), 600);
    }

    /**
     * Muestra un "splash" de texto flotante sobre un elemento.
     * @param {HTMLElement} anchorEl — elemento sobre el que aparece
     * @param {string} text
     * @param {'damage'|'heal'|'gold'} type
     */
    floatText(anchorEl, text, type = "damage") {
        if (!anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const span = this.doc.createElement("span");
        span.className = `anim-float-text anim-float-${type}`;
        span.textContent = text;
        span.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height / 2}px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 210;
        `;
        this._overlay.appendChild(span);
        window.setTimeout(() => span.remove(), 900);
    }
}
