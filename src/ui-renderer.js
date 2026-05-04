import { CARD_ART, HAND_SIZE, MAX_BOARD_SIZE, MAX_RESERVE_SIZE, PHASES, STARTING_FORT } from "./constants.js";
import { Animator } from "./animator.js";

export class UIRenderer {
    constructor(engine, doc = document) {
        this.engine = engine;
        this.doc = doc;
        this.ui = this.queryElements();
        this.animator = new Animator(doc);
        this.selectedAttackerUnitId = null;
        this._pendingAnimEvent = null;
        this._autoPassTimeout = null;
        // Promesa pública que se resuelve cuando la animación en curso termina.
        // El MachineController la consulta antes de actuar.
        this._animPromise = Promise.resolve();
        this.bindEvents();
        this.engine.subscribeToAnimEvents((evt) => this._onAnimEvent(evt));
        this.engine.subscribe(() => this._onStateChange());
    }

    /**
     * Devuelve una promesa que se resuelve cuando la animación actual termina.
     * Si no hay animación en curso, se resuelve inmediatamente.
     */
    waitForAnimation() {
        return this._animPromise;
    }

    // ── Integración de animaciones ────────────────────────────────────────

    /**
     * Llamado ANTES de notify() cuando el engine emite un evento de animación.
     * Guardamos el evento y hacemos snapshot de las posiciones actuales.
     */
    _onAnimEvent(evt) {
        this._pendingAnimEvent = evt;
        this.animator.snapshot();
    }

    /**
     * Llamado tras notify() (suscripción normal al estado).
     * Renderiza el nuevo estado y luego lanza la animación correspondiente.
     */
    _onStateChange() {
        const evt = this._pendingAnimEvent;
        this._pendingAnimEvent = null;
        this.render();
        if (evt) {
            this._animPromise = new Promise((resolve) => {
                window.requestAnimationFrame(() => {
                    const p = this._playAnimation(evt);
                    if (p && typeof p.then === "function") {
                        p.then(resolve);
                    } else {
                        // Animaciones sin promesa (highlights, toasts): resolver tras duración fija
                        window.setTimeout(resolve, 600);
                    }
                });
            });
        } else {
            this._animPromise = Promise.resolve();
        }
        this._scheduleAutoPass();
    }

    _scheduleAutoPass() {
        // Cancelar cualquier auto-pass pendiente
        if (this._autoPassTimeout) {
            window.clearTimeout(this._autoPassTimeout);
            this._autoPassTimeout = null;
        }

        const state = this.engine.state;
        if (state.isGameOver) return;
        if (!this.engine.isCurrentActionHuman()) return;
        if (state.phasePlayer !== 0) return;
        if (this.engine.humanHasActions()) return;

        // El humano no puede hacer nada → pasar automáticamente tras 900ms
        this._autoPassTimeout = window.setTimeout(() => {
            this._autoPassTimeout = null;
            const currentState = this.engine.state;
            if (currentState.isGameOver) return;
            if (currentState.phasePlayer !== 0) return;
            if (this.engine.humanHasActions()) return;

            if (currentState.phase === PHASES.ATTACK && currentState.attackSubPhase === "declaring") {
                this.showToast("Sin unidades disponibles — pasando ataque automáticamente", "info");
                this.engine.passAttack();
            } else if (currentState.phase === PHASES.BUY || currentState.phase === PHASES.DEPLOY) {
                const label = currentState.phase === PHASES.BUY ? "compra" : "despliegue";
                this.showToast(`Sin acciones en ${label} — pasando automáticamente`, "info");
                this.engine.passCurrentAction();
            }
        }, 900);
    }

    /**
     * Despacha la animación visual según el tipo de evento.
     * Devuelve una Promise que se resuelve cuando la animación principal termina.
     */
    _playAnimation(evt) {
        switch (evt.type) {
            case "buy":
                return this._animBuy(evt);
            case "buy-reserve":
                this.showToast(`${this.engine.state.players[evt.playerIndex].name} compra ${evt.cardName} de su reserva`, "info");
                return Promise.resolve();
            case "reserve":
                return this._animReserve(evt);
            case "deploy":
                return this._animDeploy(evt);
            case "duel":
                return this._animDuel(evt);
            case "assault-declared":
                return this._animAssaultDeclared(evt);
            case "assault-defended":
                return this._animAssaultDefended(evt);
            case "assault-undefended":
                return this._animAssaultUndefended(evt);
            case "bank-gold":
                return this._animBankGold(evt);
            case "machine-pass": {
                const phaseLabel = evt.phase === PHASES.BUY ? "compra" : "despliegue";
                this.showToast(`${evt.playerName} pasa en ${phaseLabel}`, "info");
                return Promise.resolve();
            }
            default:
                return Promise.resolve();
        }
    }

    /** Compra del mercado → carta vuela al descarte del comprador */
    _animBuy(evt) {
        const fromRect = this._findPrevCard(evt.marketCardId);
        const discardZone = evt.playerIndex === 0 ? this.ui.player0Piles : this.ui.player1Piles;
        const discardSlot = discardZone ? discardZone.querySelector(".pile-slot:nth-child(2)") : null;

        if (fromRect && discardSlot) {
            const toRect = discardSlot.getBoundingClientRect();
            const sourceEl = this.animator.getSnapshotElement(evt.marketCardId);
            if (sourceEl) {
                this.animator.flyCard(fromRect, toRect, sourceEl, 1500);
            }
        }

        if (discardSlot) {
            discardSlot.classList.add("anim-highlight-bought");
            window.setTimeout(() => discardSlot.classList.remove("anim-highlight-bought"), 1600);
        }

        if (evt.playerIndex === 1) {
            this.showToast(`${this.engine.state.players[1].name} compra ${evt.cardName}`, "enemy");
        }

        return new Promise((resolve) => window.setTimeout(resolve, 1600));
    }

    _findPrevCard(cardId) {
        // Recupera el rect guardado en el snapshot
        return this.animator.getPreviousRect(cardId);
    }

    /** Reserva del mercado → carta vuela a la reserva del jugador */
    _animReserve(evt) {
        const fromRect = this._findPrevCard(evt.marketCardId);
        const reserveZone = evt.playerIndex === 0 ? this.ui.player0Reserve : this.ui.player1Reserve;

        if (fromRect && reserveZone) {
            const toRect = reserveZone.getBoundingClientRect();
            const sourceEl = this.animator.getSnapshotElement(evt.marketCardId);
            if (sourceEl) {
                this.animator.flyCard(fromRect, toRect, sourceEl, 1500);
            }
        }

        window.setTimeout(() => {
            const reserveCards = reserveZone ? reserveZone.querySelectorAll(".card") : [];
            if (reserveCards.length) {
                this.animator.animateEnter(reserveCards[reserveCards.length - 1]);
            }
        }, 1380);

        if (evt.playerIndex === 1) {
            this.showToast(`${this.engine.state.players[1].name} reserva ${evt.cardName}`, "enemy");
        }

        return new Promise((resolve) => window.setTimeout(resolve, 1600));
    }

    /** Despliegue → carta vuela de la mano al tablero */
    _animDeploy(evt) {
        const fromRect = this._findPrevCard(evt.cardId);
        const boardZone = evt.playerIndex === 0 ? this.ui.playerOneBoard : this.ui.playerTwoBoard;
        const newCardEl = boardZone ? boardZone.querySelector(`[data-card-id="${CSS.escape(evt.cardId)}"]`) : null;

        if (fromRect && newCardEl) {
            const toRect = newCardEl.getBoundingClientRect();
            const sourceEl = this.animator.getSnapshotElement(evt.cardId);
            if (sourceEl) {
                this.animator.flyCard(fromRect, toRect, sourceEl, 1500);
            }
        }

        if (newCardEl) {
            window.setTimeout(() => this.animator.animateEnter(newCardEl), 1380);
        }

        if (evt.playerIndex === 1) {
            this.showToast(`${this.engine.state.players[1].name} despliega ${evt.cardName}`, "enemy");
        }

        return new Promise((resolve) => window.setTimeout(resolve, 1600));
    }

    /** Duelo → ambas cartas se sacuden */
    _animDuel(evt) {
        this.animator.combatClash(evt.attackerCardId, evt.defenderCardId);

        window.setTimeout(() => {
            const attackerEl = this.doc.querySelector(`[data-card-id="${CSS.escape(evt.attackerCardId)}"]`);
            const defenderEl = this.doc.querySelector(`[data-card-id="${CSS.escape(evt.defenderCardId)}"]`);
            if (!attackerEl && !defenderEl) {
                this.showToast(`Duelo: ${evt.attackerCardName} vs ${evt.defenderCardName} — ambas eliminadas`, "combat");
            } else if (!defenderEl) {
                this.showToast(`Duelo: ${evt.attackerCardName} derrota a ${evt.defenderCardName}`, "combat");
            } else if (!attackerEl) {
                this.showToast(`Duelo: ${evt.defenderCardName} rechaza a ${evt.attackerCardName}`, "combat");
            } else {
                this.showToast(`Duelo: ${evt.attackerCardName} ⚔ ${evt.defenderCardName}`, "combat");
            }
        }, 250);

        return new Promise((resolve) => window.setTimeout(resolve, 700));
    }

    /** Asalto declarado → carta atacante "avanza" hacia el centro */
    _animAssaultDeclared(evt) {
        this.animator.highlightCard(evt.attackerCardId, "attacker", 700);
        if (evt.attackerPlayerIndex === 1) {
            this.showToast(`${this.engine.state.players[1].name} asalta tu fortaleza con ${evt.attackerCardName}`, "enemy");
        }
        return new Promise((resolve) => window.setTimeout(resolve, 800));
    }

    /** Asalto con defensor → choque + daño a fortaleza si hay overkill */
    _animAssaultDefended(evt) {
        this.animator.combatClash(evt.attackerCardId, evt.defenderCardId);

        window.setTimeout(() => {
            this.showToast(`Asalto: ${evt.attackerCardName} vs ${evt.defenderCardName}`, "combat");
        }, 250);

        window.setTimeout(() => {
            const fortBar = evt.defenderPlayerIndex === 0
                ? this.ui.playerOneFortBar
                : this.ui.playerTwoFortBar;
            this.animator.flashFortDamage(fortBar);
        }, 400);

        return new Promise((resolve) => window.setTimeout(resolve, 700));
    }

    /** Asalto sin defensor → flash de daño directo a la fortaleza */
    _animAssaultUndefended(evt) {
        const fortBarEl = evt.defenderPlayerIndex === 0 ? this.ui.playerOneFortBar : this.ui.playerTwoFortBar;
        const fortValEl = evt.defenderPlayerIndex === 0 ? this.ui.playerOneFort : this.ui.playerTwoFort;

        this.animator.flashFortDamage(fortBarEl);
        this.animator.floatText(fortValEl, `-${evt.damage}`, "damage");

        if (evt.defenderPlayerIndex === 0) {
            this.showToast(`¡${evt.attackerCardName} inflige ${evt.damage} de daño directo a tu fortaleza!`, "enemy");
        } else {
            this.showToast(`¡${evt.attackerCardName} inflige ${evt.damage} de daño directo a la fortaleza enemiga!`, "combat");
        }

        return new Promise((resolve) => window.setTimeout(resolve, 700));
    }

    /** Guardar oro → cada tesoro vuela hacia el mazo del jugador */
    _animBankGold(evt) {
        const deckZone = evt.playerIndex === 0 ? this.ui.player0Piles : this.ui.player1Piles;
        const deckSlot = deckZone ? deckZone.querySelector(".pile-slot:nth-child(1)") : null;
        if (!deckSlot) return Promise.resolve();

        const toRect = deckSlot.getBoundingClientRect();

        evt.treasureIds.forEach((id, i) => {
            const fromRect = this.animator.getPreviousRect(id);
            const sourceEl = this.animator.getSnapshotElement(id);
            if (fromRect && sourceEl) {
                window.setTimeout(() => {
                    this.animator.flyCard(fromRect, toRect, sourceEl, 1500);
                }, i * 120);
            }
        });

        if (evt.treasureIds.length > 0) {
            this.showToast(`Tesoros guardados — volverán el próximo turno`, "info");
        }

        const totalDuration = 1500 + (evt.treasureIds.length - 1) * 120;
        return new Promise((resolve) => window.setTimeout(resolve, totalDuration));
    }

    queryElements() {
        return {
            topBar: null,                  // eliminado en nuevo layout
            topBarMarket: this.doc.querySelector("#topBarMarket"),
            modeSelect: this.doc.querySelector("#playerTwoMode"),
            playerOneTurn: this.doc.querySelector("#player-0-turn"),
            playerTwoTurn: this.doc.querySelector("#player-1-turn"),
            playerOneFort: this.doc.querySelector("#player-0-fort"),
            playerTwoFort: this.doc.querySelector("#player-1-fort"),
            playerOneFortBar: this.doc.querySelector("#player-0-fort-bar"),
            playerTwoFortBar: this.doc.querySelector("#player-1-fort-bar"),
            playerOneBank: this.doc.querySelector("#player-0-bank"),
            playerTwoBank: this.doc.querySelector("#player-1-bank"),
            playerTwoName: this.doc.querySelector("#player-1-name"),
            playerOneHand: this.doc.querySelector("#player-0-hand"),
            playerTwoHand: this.doc.querySelector("#player-1-hand"),
            playerTwoHandArea: this.doc.querySelector("#player-1-hand-area"),
            playerTwoPilesWrap: this.doc.querySelector("#player-1-piles-wrap"),
            toggleOpponentPilesButton: null, // eliminado: pilas rival siempre visibles
            playerOneBoard: this.doc.querySelector("#player-0-board"),
            playerTwoBoard: this.doc.querySelector("#player-1-board"),
            marketZone: this.doc.querySelector("#marketZone"),
            attackButton: this.doc.querySelector("#attackButton"),
            endTurnButton: this.doc.querySelector("#endTurnButton"),
            bankButton: this.doc.querySelector("#bankButton"),
            restartButton: this.doc.querySelector("#restartButton"),
            discardModal: this.doc.querySelector("#discardModal"),
            discardTitle: this.doc.querySelector("#discardTitle"),
            discardCards: this.doc.querySelector("#discardCards"),
            closeDiscardButton: this.doc.querySelector("#closeDiscardButton"),
            toastContainer: this.doc.querySelector("#toastContainer"),
            player0Piles: this.doc.querySelector("#player-0-piles"),
            player1Piles: this.doc.querySelector("#player-1-piles"),
            playerOnePanel: this.doc.querySelector("#player-0-panel"),
            playerTwoPanel: this.doc.querySelector("#enemyFortressWidget"),
            player0Reserve: this.doc.querySelector("#player-0-reserve"),
            player0ReserveCount: this.doc.querySelector("#player-0-reserve-count"),
            player0ReserveArea: this.doc.querySelector("#player-0-reserve-area"),
            player1Reserve: this.doc.querySelector("#player-1-reserve"),
            player1ReserveCount: this.doc.querySelector("#player-1-reserve-count"),
            player1ReserveArea: this.doc.querySelector("#player-1-reserve-area"),
            phaseBanner: this.doc.querySelector("#phaseBanner"),
            gameMessage: this.doc.querySelector("#gameMessage"),
            combatPanel: this.doc.querySelector("#combatPanel"),
            enemyFortressWidget: this.doc.querySelector("#enemyFortressWidget"),
            playerFortWidget: this.doc.querySelector("#player-0-fort-widget")
        };
    }

    bindEvents() {
        this.ui.modeSelect.addEventListener("change", (event) => {
            this.engine.setPlayerTwoMode(event.target.value);
        });

        this.ui.attackButton.addEventListener("click", () => {
            const state = this.engine.state;
            if (state.phase === PHASES.ATTACK && state.attackSubPhase === "declaring") {
                const result = this.engine.passAttack();
                if (!result.ok && result.error) {
                    this.showToast(result.error);
                }
            }
        });

        this.ui.endTurnButton.addEventListener("click", () => {
            const result = this.engine.passCurrentAction();
            if (!result.ok && result.error) {
                this.showToast(result.error);
            }
        });

        this.ui.bankButton.addEventListener("click", () => {
            const result = this.engine.depositGoldToBank();
            if (!result.ok && result.error) {
                this.showToast(result.error);
            }
        });

        this.ui.restartButton.addEventListener("click", () => {
            this.engine.startNewGame();
        });

        this.ui.closeDiscardButton.addEventListener("click", () => {
            this.engine.closeDiscardModal();
        });

        this.ui.discardModal.addEventListener("click", (event) => {
            if (event.target === this.ui.discardModal) {
                this.engine.closeDiscardModal();
            }
        });

        // Click en la fortaleza enemiga → asalto directo si hay atacante seleccionado
        if (this.ui.enemyFortressWidget) {
            this.ui.enemyFortressWidget.addEventListener("click", () => {
                if (this.selectedAttackerUnitId) {
                    const result = this.engine.declareAttack(0, this.selectedAttackerUnitId, "assault");
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    }
                }
            });
        }

        // Click en la fortaleza propia → sin defensor (daño directo) cuando el rival asalta
        if (this.ui.playerFortWidget) {
            this.ui.playerFortWidget.addEventListener("click", () => {
                const state = this.engine.state;
                if (
                    state.phase === PHASES.ATTACK
                    && state.attackSubPhase === "defending"
                    && state.phasePlayer === 0
                    && this.engine.isCurrentActionHuman()
                ) {
                    const result = this.engine.declareDefense(0, null);
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    }
                }
            });
        }
    }

    showToast(text, variant = "error") {
        const toast = this.doc.createElement("div");
        toast.className = `toast ${variant}`;
        toast.textContent = text;
        this.ui.toastContainer.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2400);
    }

    updateFortBar(barEl, fortValue) {
        const pct = Math.max(0, Math.min(100, (fortValue / STARTING_FORT) * 100));
        barEl.style.width = `${pct}%`;
        if (pct > 60) {
            barEl.dataset.level = "high";
        } else if (pct > 30) {
            barEl.dataset.level = "mid";
        } else {
            barEl.dataset.level = "low";
        }
    }

    createCardElement(card, options) {
        const button = this.doc.createElement("button");
        button.type = "button";
        button.className = "card";
        button.dataset.cardId = card.id;

        if (card.guard) {
            button.classList.add("guard");
        }
        if (card.type === "treasure") {
            button.classList.add("treasure");
        }
        if (card.spent) {
            button.classList.add("spent");
        }
        if (options.selected) {
            button.classList.add("selected");
        }

        if (options.hidden) {
            button.classList.add("hidden");
            button.innerHTML = '<p class="card-title">Carta oculta</p><p class="card-meta">?</p>';
            button.disabled = true;
            return button;
        }

        const artPath = CARD_ART[card.key] || "";
        if (card.type === "treasure") {
            button.innerHTML = `
                <div class="card-frame frame-treasure">
                    <div class="card-name-row">
                        <p class="card-name">${card.name}</p>
                        <span class="card-cost-orb">0</span>
                    </div>
                    <div class="card-art-wrap">
                        <img class="card-art" src="${artPath}" alt="Ilustracion de ${card.name}">
                    </div>
                    <div class="card-type-row">
                        <p class="card-type">Tesoro</p>
                    </div>
                    <div class="card-text-box">
                        <p class="card-rules">Aporta oro mientras esta en mano.</p>
                    </div>
                    <div class="card-stats">
                        <span class="stat-gold">+${card.gold}</span>
                    </div>
                </div>
            `;
        } else {
            const effectiveLife = card.currentHealth ?? card.health;
            const troopType = card.guard ? "Tropa · Guardia" : "Tropa";
            const guardText = card.guard
                ? "Recibe dano antes que el resto de unidades aliadas."
                : "Aporta su fuerza al frente en ataque simultaneo.";

            button.innerHTML = `
                <div class="card-frame frame-troop">
                    <div class="card-name-row">
                        <p class="card-name">${card.name}</p>
                        <span class="card-cost-orb">${card.cost}</span>
                    </div>
                    <div class="card-art-wrap">
                        <img class="card-art" src="${artPath}" alt="Ilustracion de ${card.name}">
                    </div>
                    <div class="card-type-row">
                        <p class="card-type">${troopType}</p>
                    </div>
                    <div class="card-text-box">
                        <p class="card-rules">${guardText}</p>
                    </div>
                    <div class="card-stats">
                        <span class="stat-atk">${card.attack}</span>
                        <span class="stat-hp">${effectiveLife}</span>
                    </div>
                </div>
            `;
        }

        button.disabled = Boolean(options.disabled);
        if (options.onClick) {
            button.addEventListener("click", options.onClick);
        }
        return button;
    }

    fillEmptySlots(container, amount, className = "empty-slot") {
        for (let i = 0; i < amount; i += 1) {
            const slot = this.doc.createElement("div");
            slot.className = className;
            container.appendChild(slot);
        }
    }

    renderReserve(playerIndex, container, countEl) {
        const state = this.engine.state;
        const player = state.players[playerIndex];
        container.innerHTML = "";
        countEl.textContent = player.reserve.length > 0 ? `(${player.reserve.length}/${MAX_RESERVE_SIZE})` : "";

        if (player.reserve.length === 0) {
            const emptyHint = this.doc.createElement("p");
            emptyHint.className = "reserve-empty-hint";
            emptyHint.textContent = "Sin cartas reservadas";
            container.appendChild(emptyHint);
            return;
        }

        for (const card of player.reserve) {
            const wrap = this.doc.createElement("div");
            wrap.className = "reserve-card-wrap";
            const canInteract = state.phase === PHASES.BUY
                && playerIndex === state.phasePlayer
                && this.engine.isCurrentActionHuman();

            wrap.appendChild(this.createCardElement(card, { disabled: !canInteract }));

            if (canInteract) {
                const buyBtn = this.doc.createElement("button");
                buyBtn.type = "button";
                buyBtn.className = "reserve-action-btn";
                buyBtn.textContent = `Comprar (${card.cost} oro)`;
                buyBtn.disabled = this.engine.getAvailableGold(state.players[state.phasePlayer]) < card.cost;
                buyBtn.addEventListener("click", () => {
                    const result = this.engine.buyFromReserve(card.id);
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    }
                });
                wrap.appendChild(buyBtn);
            }

            container.appendChild(wrap);
        }
    }

    renderHand(playerIndex, container) {
        const state = this.engine.state;
        const player = state.players[playerIndex];
        // Ocultar cartas solo para la mano del rival (player 1) en modo 2 jugadores,
        // nunca para el propio jugador (player 0), cuya mano debe ser siempre visible.
        const hideCards = playerIndex !== 0
            && !state.isGameOver
            && (state.phase === PHASES.ATTACK || playerIndex !== state.phasePlayer);
        const isOwnerTurn = !state.isGameOver
            && playerIndex === state.phasePlayer
            && this.engine.isCurrentActionHuman();
        const canDeploy = isOwnerTurn && state.phase === PHASES.DEPLOY;
        const canBuy = isOwnerTurn && state.phase === PHASES.BUY;

        container.innerHTML = "";
        player.hand.forEach((card) => {
            let disabled = true;
            let onClick = null;

            if (canDeploy) {
                if (card.type === "troop") {
                    disabled = false;
                    onClick = () => {
                        const result = this.engine.deployFromHand(card.id, playerIndex);
                        if (!result.ok && result.error) {
                            this.showToast(result.error);
                        }
                    };
                }
            } else if (canBuy) {
                if (card.type === "treasure") {
                    disabled = false;
                    onClick = () => {
                        const totalGold = this.engine.getAvailableGold(player);
                        this.showToast(`Oro disponible: ${totalGold} (mano: ${player.gold} · banco: ${player.bankGold}).`, "info");
                    };
                }
            }

            const cardElement = this.createCardElement(card, {
                hidden: hideCards,
                disabled,
                onClick
            });
            container.appendChild(cardElement);
        });

        this.fillEmptySlots(container, Math.max(0, HAND_SIZE - player.hand.length));
    }

    renderBoard(playerIndex, container) {
        const state = this.engine.state;
        const player = state.players[playerIndex];
        const isAttackPhase = state.phase === PHASES.ATTACK && !state.isGameOver;

        // ¿Es el turno de este jugador para declarar un ataque?
        const isMyDeclaringTurn = isAttackPhase
            && state.attackSubPhase === "declaring"
            && state.phasePlayer === playerIndex
            && this.engine.isCurrentActionHuman();

        // ¿Está esperando el turno de defender (para player-0 que defiende un asalto de la máquina)?
        const isMyDefendingTurn = isAttackPhase
            && state.attackSubPhase === "defending"
            && state.phasePlayer === playerIndex
            && this.engine.isCurrentActionHuman();

        // ¿El jugador ha seleccionado un atacante y ahora elige objetivo de duelo en el tablero rival?
        const isChoosingDuelTarget = isAttackPhase
            && state.attackSubPhase === "declaring"
            && this.selectedAttackerUnitId !== null
            && state.phasePlayer !== playerIndex; // este es el tablero rival

        container.innerHTML = "";

        player.board.forEach((card) => {
            let extraClass = null;
            let onClick = null;
            let disabled = true;

            if (card.exhausted) {
                extraClass = "exhausted";
            }

            if (isMyDeclaringTurn && !card.exhausted) {
                // Esta unidad puede ser seleccionada para atacar
                disabled = false;
                extraClass = this.selectedAttackerUnitId === card.id ? "attacker-selected" : null;
                onClick = () => {
                    this.selectedAttackerUnitId = this.selectedAttackerUnitId === card.id ? null : card.id;
                    this.render();
                };
            }

            if (isChoosingDuelTarget) {
                // Esta unidad rival puede ser objetivo de duelo
                disabled = false;
                extraClass = "attack-target";
                const attackerPlayerIndex = state.phasePlayer; // quien tiene el turno de declarar
                onClick = () => {
                    const result = this.engine.declareAttack(
                        attackerPlayerIndex,
                        this.selectedAttackerUnitId,
                        "duel",
                        card.id
                    );
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    } else {
                        this.selectedAttackerUnitId = null;
                    }
                };
            }

            if (isMyDefendingTurn) {
                // Esta unidad puede defender un asalto entrante
                disabled = false;
                extraClass = "can-defend";
                onClick = () => {
                    const result = this.engine.declareDefense(playerIndex, card.id);
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    }
                };
            }

            const cardElement = this.createCardElement(card, { disabled, onClick });
            if (extraClass) {
                cardElement.classList.add(extraClass);
            }
            container.appendChild(cardElement);
        });

        if (container.classList.contains("opponent-front-zone")) {
            if (player.board.length === 0) {
                const emptyState = this.doc.createElement("div");
                emptyState.className = "empty-slot opponent-empty-state";
                emptyState.textContent = "Sin unidades en el frente";
                container.appendChild(emptyState);
            }
            return;
        }

        this.fillEmptySlots(container, Math.max(0, MAX_BOARD_SIZE - player.board.length));
    }

    renderAttackPanel() {
        const state = this.engine.state;
        const isAttackPhase = state.phase === PHASES.ATTACK && !state.isGameOver;

        // Panel de texto: siempre oculto (las fortalezas actúan como indicadores visuales)
        this.ui.combatPanel.classList.add("hidden");
        this.ui.combatPanel.innerHTML = "";

        // Fortaleza ENEMIGA pulsa (crimson) cuando hay atacante seleccionado listo para asaltar
        if (this.ui.enemyFortressWidget) {
            const showFortTarget = isAttackPhase
                && state.attackSubPhase === "declaring"
                && state.phasePlayer === 0
                && this.selectedAttackerUnitId !== null;
            this.ui.enemyFortressWidget.classList.toggle("attack-target", showFortTarget);
        }

        // Fortaleza PROPIA pulsa (teal) cuando el rival ha declarado un asalto a defender
        if (this.ui.playerFortWidget) {
            const showDefendTarget = isAttackPhase
                && state.attackSubPhase === "defending"
                && state.phasePlayer === 0
                && this.engine.isCurrentActionHuman();
            this.ui.playerFortWidget.classList.toggle("defend-target", showDefendTarget);
        }
    }

    renderMarket() {
        const state = this.engine.state;
        this.ui.marketZone.innerHTML = "";
        const canBuy = state.phase === PHASES.BUY && this.engine.isCurrentActionHuman();
        const activePlayer = state.phasePlayer !== null ? state.players[state.phasePlayer] : null;

        state.market.forEach((card) => {
            const wrap = this.doc.createElement("div");
            wrap.className = "market-card-wrap";

            wrap.appendChild(this.createCardElement(card, {
                disabled: !canBuy,
                onClick: () => {
                    const result = this.engine.buyFromMarket(card.id);
                    if (!result.ok && result.error) {
                        this.showToast(result.error);
                    }
                }
            }));

            const reserveBtn = this.doc.createElement("button");
            reserveBtn.type = "button";
            reserveBtn.className = "reserve-action-btn";
            reserveBtn.textContent = "Reservar (1 oro)";
            reserveBtn.disabled = !canBuy
                || !activePlayer
                || activePlayer.reserve.length >= MAX_RESERVE_SIZE
                || this.engine.getAvailableGold(activePlayer) < 1;
            reserveBtn.addEventListener("click", () => {
                const result = this.engine.reserveFromMarket(card.id);
                if (!result.ok && result.error) {
                    this.showToast(result.error);
                }
            });
            wrap.appendChild(reserveBtn);

            this.ui.marketZone.appendChild(wrap);
        });
    }

    renderPiles(playerIndex, container) {
        const player = this.engine.state.players[playerIndex];
        container.innerHTML = "";

        const deckSlot = this.doc.createElement("div");
        deckSlot.className = "pile-slot";
        const deckBack = this.doc.createElement("div");
        deckBack.className = "deck-back";
        deckBack.innerHTML = `
            <svg class="deck-back-art" viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg">
                <rect width="80" height="112" rx="8" fill="#0a0c18"/>
                <rect x="4" y="4" width="72" height="104" rx="6" fill="none" stroke="rgba(201,162,39,0.4)" stroke-width="1.5"/>
                <line x1="10" y1="10" x2="70" y2="102" stroke="rgba(201,162,39,0.15)" stroke-width="1"/>
                <line x1="70" y1="10" x2="10" y2="102" stroke="rgba(201,162,39,0.15)" stroke-width="1"/>
                <text x="40" y="64" font-size="26" text-anchor="middle" dominant-baseline="middle" fill="rgba(201,162,39,0.6)">&#9876;</text>
            </svg>
            <span class="pile-count">${player.deck.length}</span>
            <p class="pile-label">Mazo</p>
        `;
        deckSlot.appendChild(deckBack);
        container.appendChild(deckSlot);

        const discardSlot = this.doc.createElement("div");
        discardSlot.className = "pile-slot";
        if (player.discard.length === 0) {
            const emptyEl = this.doc.createElement("div");
            emptyEl.className = "empty-slot discard-empty";
            const lbl = this.doc.createElement("p");
            lbl.className = "pile-label";
            lbl.textContent = "Descarte";
            emptyEl.appendChild(lbl);
            discardSlot.appendChild(emptyEl);
        } else {
            const topCard = player.discard[player.discard.length - 1];
            const cardEl = this.createCardElement(topCard, { disabled: false });
            cardEl.classList.add("discard-top-card");
            const countBadge = this.doc.createElement("span");
            countBadge.className = "pile-count";
            countBadge.textContent = player.discard.length;
            cardEl.appendChild(countBadge);
            cardEl.addEventListener("click", () => this.engine.openDiscardModal(playerIndex));
            discardSlot.appendChild(cardEl);
        }
        container.appendChild(discardSlot);
    }

    renderDiscardModal() {
        const state = this.engine.state;
        if (!state.discardModalOpen) {
            this.ui.discardModal.classList.add("hidden");
            this.ui.discardModal.setAttribute("aria-hidden", "true");
            return;
        }

        const targetPlayer = state.players[state.discardModalPlayerIndex];
        if (!targetPlayer) {
            this.engine.closeDiscardModal();
            return;
        }

        this.ui.discardModal.classList.remove("hidden");
        this.ui.discardModal.setAttribute("aria-hidden", "false");
        this.ui.discardTitle.textContent = `Descarte de ${targetPlayer.name} (${targetPlayer.discard.length})`;
        this.ui.discardCards.innerHTML = "";

        if (targetPlayer.discard.length === 0) {
            const emptyState = this.doc.createElement("p");
            emptyState.className = "market-help";
            emptyState.textContent = "No hay cartas en el descarte.";
            this.ui.discardCards.appendChild(emptyState);
            return;
        }

        targetPlayer.discard.forEach((card) => {
            this.ui.discardCards.appendChild(this.createCardElement(card, { disabled: true }));
        });
    }

    renderPhaseBanner() {
        const state = this.engine.state;
        const phaseSteps = this.ui.phaseBanner.querySelectorAll(".phase-step");
        phaseSteps.forEach((step) => {
            const stepPhase = step.getAttribute("data-phase");
            step.classList.toggle("is-active", stepPhase === state.phase);
        });
    }

    render() {
        const state = this.engine.state;
        const isMachineOpponent = state.playerTwoMode === "machine";
        const hideMarket = !state.isGameOver && state.phase !== PHASES.BUY;
        const hideReserves = state.phase !== PHASES.BUY;

        // Fort values & bars
        this.ui.playerOneFort.textContent = `${state.players[0].fort}`;
        this.ui.playerTwoFort.textContent = `${state.players[1].fort}`;
        this.updateFortBar(this.ui.playerOneFortBar, state.players[0].fort);
        this.updateFortBar(this.ui.playerTwoFortBar, state.players[1].fort);

        // Bank
        this.ui.playerOneBank.textContent = `${state.players[0].bankGold}`;
        this.ui.playerTwoBank.textContent = `${state.players[1].bankGold}`;

        // Player name
        this.ui.playerTwoName.textContent = state.players[1].name;

        // Game message
        if (this.ui.gameMessage) {
            this.ui.gameMessage.textContent = state.message || "";
        }

        // Turn indicators
        if (state.isGameOver) {
            this.ui.playerOneTurn.textContent = "Fin";
            this.ui.playerTwoTurn.textContent = "Fin";
        } else if (state.phase === PHASES.ATTACK) {
            const isP0Declaring = state.attackSubPhase === "declaring" && state.phasePlayer === 0;
            const isP0Defending = state.attackSubPhase === "defending" && state.phasePlayer === 0;
            const isP1Declaring = state.attackSubPhase === "declaring" && state.phasePlayer === 1;
            const isP1Defending = state.attackSubPhase === "defending" && state.phasePlayer === 1;
            this.ui.playerOneTurn.textContent = isP0Declaring ? "Atacar" : isP0Defending ? "Defender" : "Espera";
            this.ui.playerTwoTurn.textContent = isP1Declaring ? (this.engine.isMachineActionTurn() ? "Pensando..." : "Atacar") : isP1Defending ? "Defender" : "Espera";
        } else {
            this.ui.playerOneTurn.textContent = state.phasePlayer === 0 ? "Actua" : state.phasePasses[0] ? "Paso" : "Esperando";
            this.ui.playerTwoTurn.textContent = state.phasePlayer === 1
                ? this.engine.isMachineActionTurn() ? "Pensando..." : "Actua"
                : state.phasePasses[1] ? "Paso" : "Esperando";
        }

        // Panel active states
        this.ui.playerOnePanel.classList.toggle("active", !state.isGameOver && (state.phase === PHASES.ATTACK || state.phasePlayer === 0));
        // enemyFortressWidget: resaltar si es turno del rival (no máquina)
        if (this.ui.playerTwoPanel) {
            this.ui.playerTwoPanel.classList.toggle("active", !state.isGameOver && (state.phase === PHASES.ATTACK || (state.phasePlayer === 1 && !isMachineOpponent)));
        }
        this.ui.playerTwoHandArea.classList.toggle("is-hidden", isMachineOpponent);
        // Las pilas del rival son siempre visibles (no hay toggle)

        // En el nuevo layout el mercado es siempre visible — ignoramos is-collapsed

        this.renderPhaseBanner();
        this.renderAttackPanel();
        this.renderHand(0, this.ui.playerOneHand);
        if (isMachineOpponent) {
            this.ui.playerTwoHand.innerHTML = "";
        } else {
            this.renderHand(1, this.ui.playerTwoHand);
        }
        this.renderBoard(0, this.ui.playerOneBoard);
        this.renderBoard(1, this.ui.playerTwoBoard);
        this.renderMarket();
        this.renderPiles(0, this.ui.player0Piles);
        this.renderPiles(1, this.ui.player1Piles);
        this.renderReserve(0, this.ui.player0Reserve, this.ui.player0ReserveCount);
        this.renderReserve(1, this.ui.player1Reserve, this.ui.player1ReserveCount);
        this.ui.player0ReserveArea.classList.toggle("hidden", hideReserves);
        this.ui.player1ReserveArea.classList.toggle("hidden", hideReserves || (isMachineOpponent && state.players[1].reserve.length === 0));
        this.renderDiscardModal();

        // Reset selección de atacante si la unidad ya no está disponible
        if (this.selectedAttackerUnitId !== null) {
            const stillAvailable = state.players[0].board.find(
                (u) => u.id === this.selectedAttackerUnitId && !u.exhausted
            );
            if (!stillAvailable) {
                this.selectedAttackerUnitId = null;
            }
        }

        // Button states
        const isAttackDeclaring = state.phase === PHASES.ATTACK && state.attackSubPhase === "declaring";
        const canPassAttack = isAttackDeclaring && state.phasePlayer === 0 && !state.isGameOver;
        this.ui.attackButton.disabled = !canPassAttack;
        this.ui.endTurnButton.disabled = state.isGameOver || state.phase === PHASES.ATTACK || this.engine.isMachineActionTurn();
        const canBank = !state.isGameOver
            && state.phase === PHASES.BUY
            && state.phasePlayer !== null
            && this.engine.isCurrentActionHuman()
            && state.players[state.phasePlayer].gold > 0;
        this.ui.bankButton.disabled = !canBank;
        const attackLabel = this.ui.attackButton.querySelector(".action-label");
        if (attackLabel) {
            attackLabel.textContent = state.phase === PHASES.ATTACK ? "Pasar" : "Resolver";
        }
        const endTurnLabel = this.ui.endTurnButton.querySelector(".action-label");
        if (endTurnLabel) {
            endTurnLabel.textContent = "Pasar";
        }
    }
}
