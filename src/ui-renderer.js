import { CARD_ART, HAND_SIZE, MAX_BOARD_SIZE, MAX_RESERVE_SIZE, PHASES } from "./constants.js";

export class UIRenderer {
    constructor(engine, doc = document) {
        this.engine = engine;
        this.doc = doc;
        this.ui = this.queryElements();
        this.bindEvents();
        this.engine.subscribe(() => this.render());
    }

    queryElements() {
        return {
            topBar: this.doc.querySelector("#topBar"),
            topBarMarket: this.doc.querySelector("#topBarMarket"),
            modeSelect: this.doc.querySelector("#playerTwoMode"),
            playerOneTurn: this.doc.querySelector("#player-0-turn"),
            playerTwoTurn: this.doc.querySelector("#player-1-turn"),
            playerOneFort: this.doc.querySelector("#player-0-fort"),
            playerTwoFort: this.doc.querySelector("#player-1-fort"),
            playerOneBank: this.doc.querySelector("#player-0-bank"),
            playerTwoBank: this.doc.querySelector("#player-1-bank"),
            playerTwoName: this.doc.querySelector("#player-1-name"),
            playerOneHand: this.doc.querySelector("#player-0-hand"),
            playerTwoHand: this.doc.querySelector("#player-1-hand"),
            playerTwoHandArea: this.doc.querySelector("#player-1-hand-area"),
            playerTwoPilesWrap: this.doc.querySelector("#player-1-piles-wrap"),
            toggleOpponentPilesButton: this.doc.querySelector("#toggleOpponentPilesButton"),
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
            playerTwoPanel: this.doc.querySelector("#player-1-panel"),
            player0Reserve: this.doc.querySelector("#player-0-reserve"),
            player0ReserveCount: this.doc.querySelector("#player-0-reserve-count"),
            player0ReserveArea: this.doc.querySelector("#player-0-reserve-area"),
            player1Reserve: this.doc.querySelector("#player-1-reserve"),
            player1ReserveCount: this.doc.querySelector("#player-1-reserve-count"),
            player1ReserveArea: this.doc.querySelector("#player-1-reserve-area"),
            phaseBanner: this.doc.querySelector("#phaseBanner")
        };
    }

    bindEvents() {
        this.ui.modeSelect.addEventListener("change", (event) => {
            this.engine.setPlayerTwoMode(event.target.value);
        });

        this.ui.attackButton.addEventListener("click", () => {
            const result = this.engine.resolveAttackPhase();
            if (!result.ok && result.error) {
                this.showToast(result.error);
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

        this.ui.toggleOpponentPilesButton.addEventListener("click", () => {
            this.engine.toggleOpponentPiles();
        });

        this.ui.closeDiscardButton.addEventListener("click", () => {
            this.engine.closeDiscardModal();
        });

        this.ui.discardModal.addEventListener("click", (event) => {
            if (event.target === this.ui.discardModal) {
                this.engine.closeDiscardModal();
            }
        });
    }

    showToast(text, variant = "error") {
        const toast = this.doc.createElement("div");
        toast.className = `toast ${variant}`;
        toast.textContent = text;
        this.ui.toastContainer.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2400);
    }

    createCardElement(card, options) {
        const button = this.doc.createElement("button");
        button.type = "button";
        button.className = "card";

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
                        <p class="card-rules">Se usa para comprar en el mercado o reservar cartas.</p>
                        <p class="card-rules">Mientras este en mano aporta +${card.gold} oro.</p>
                    </div>
                    <div class="card-gold-box">+${card.gold}</div>
                </div>
            `;
        } else {
            const effectiveLife = card.currentHealth ?? card.health;
            const troopType = card.guard ? "Tropa - Guardia" : "Tropa";
            const guardText = card.guard
                ? "Recibe dano antes que el resto de unidades aliadas."
                : "En ataque simultaneo aporta su fuerza al frente.";

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
                        <p class="card-rules">Coste de reclutamiento: ${card.cost} oro.</p>
                    </div>
                    <div class="card-power-box">${card.attack}/${effectiveLife}</div>
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
        const hideCards = !state.isGameOver && (state.phase === PHASES.ATTACK || playerIndex !== state.phasePlayer);
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
        const player = this.engine.state.players[playerIndex];
        container.innerHTML = "";

        player.board.forEach((card) => {
            const cardElement = this.createCardElement(card, { disabled: true });
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
                <rect width="80" height="112" rx="8" fill="#3d1019"/>
                <rect x="4" y="4" width="72" height="104" rx="6" fill="none" stroke="rgba(255,200,120,0.35)" stroke-width="1.5"/>
                <line x1="10" y1="10" x2="70" y2="102" stroke="rgba(255,200,120,0.18)" stroke-width="1"/>
                <line x1="70" y1="10" x2="10" y2="102" stroke="rgba(255,200,120,0.18)" stroke-width="1"/>
                <text x="40" y="64" font-size="26" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,200,120,0.65)">&#9876;</text>
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

        this.ui.playerOneFort.textContent = `${state.players[0].fort}`;
        this.ui.playerTwoFort.textContent = `${state.players[1].fort}`;
        this.ui.playerOneBank.textContent = `${state.players[0].bankGold}`;
        this.ui.playerTwoBank.textContent = `${state.players[1].bankGold}`;
        this.ui.playerTwoName.textContent = state.players[1].name;

        if (state.isGameOver) {
            this.ui.playerOneTurn.textContent = "Fin";
            this.ui.playerTwoTurn.textContent = "Fin";
        } else if (state.phase === PHASES.ATTACK) {
            this.ui.playerOneTurn.textContent = "Ataque";
            this.ui.playerTwoTurn.textContent = "Ataque";
        } else {
            this.ui.playerOneTurn.textContent = state.phasePlayer === 0 ? "Actua" : state.phasePasses[0] ? "Paso" : "Esperando";
            this.ui.playerTwoTurn.textContent = state.phasePlayer === 1
                ? this.engine.isMachineActionTurn() ? "Pensando" : "Actua"
                : state.phasePasses[1] ? "Paso" : "Esperando";
        }

        this.ui.playerOnePanel.classList.toggle("active", !state.isGameOver && (state.phase === PHASES.ATTACK || state.phasePlayer === 0));
        this.ui.playerTwoPanel.classList.toggle("active", !state.isGameOver && (state.phase === PHASES.ATTACK || (state.phasePlayer === 1 && !isMachineOpponent)));
        this.ui.playerTwoPanel.classList.toggle("player-opponent", true);
        this.ui.playerTwoHandArea.classList.toggle("is-hidden", isMachineOpponent);
        this.ui.playerTwoPilesWrap.classList.toggle("hidden", isMachineOpponent && !state.showOpponentPiles);
        this.ui.toggleOpponentPilesButton.classList.toggle("hidden", !isMachineOpponent);
        this.ui.toggleOpponentPilesButton.textContent = state.showOpponentPiles
            ? "Ocultar mazo y descarte rival"
            : "Ver mazo y descarte rival";

        this.ui.topBarMarket.classList.toggle("is-collapsed", hideMarket);
        this.ui.topBar.classList.toggle("market-collapsed", hideMarket);

        this.renderPhaseBanner();
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

        this.ui.attackButton.disabled = state.isGameOver || state.phase !== PHASES.ATTACK;
        this.ui.endTurnButton.disabled = state.isGameOver || state.phase === PHASES.ATTACK || this.engine.isMachineActionTurn();
        const canBank = !state.isGameOver
            && state.phase === PHASES.BUY
            && state.phasePlayer !== null
            && this.engine.isCurrentActionHuman()
            && state.players[state.phasePlayer].gold > 0;
        this.ui.bankButton.disabled = !canBank;
        const endTurnLabel = this.ui.endTurnButton.querySelector(".action-label");
        if (endTurnLabel) {
            endTurnLabel.textContent = state.phase === PHASES.ATTACK ? "Bloqueado" : "Pasar";
        }
    }
}
