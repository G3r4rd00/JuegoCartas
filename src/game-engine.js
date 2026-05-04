import {
    CARD_LIBRARY,
    STARTING_DECK_TEMPLATE,
    STARTING_FORT,
    MARKET_SIZE,
    HAND_SIZE,
    MAX_BOARD_SIZE,
    MAX_RESERVE_SIZE,
    PHASES
} from "./constants.js";
import { createCard, shuffle, calculateGold, nextPlayerIndex } from "./utils.js";

export class GameEngine {
    constructor() {
        this.listeners = [];
        this.animListeners = [];
        this.state = this.createInitialState();
    }

    createInitialState() {
        return {
            players: [],
            playerTwoMode: "machine",
            marketDeck: [],
            market: [],
            phase: PHASES.BUY,
            phaseStarter: 0,
            phasePlayer: 0,
            phasePasses: [false, false],
            roundNumber: 1,
            attackSubPhase: "declaring",  // "declaring" | "defending"
            pendingAttack: null,          // { attackerPlayerIndex, attackerUnitId, mode: "assault" }
            discardModalOpen: false,
            discardModalPlayerIndex: null,
            showOpponentPiles: false,
            isGameOver: false,
            log: [],
            message: ""
        };
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((entry) => entry !== listener);
        };
    }

    subscribeToAnimEvents(listener) {
        this.animListeners.push(listener);
        return () => {
            this.animListeners = this.animListeners.filter((e) => e !== listener);
        };
    }

    emitAnim(event) {
        this.animListeners.forEach((l) => l(event));
    }

    notify() {
        this.listeners.forEach((listener) => listener(this.state));
    }

    addLog(text) {
        this.state.log.unshift(text);
        if (this.state.log.length > 12) {
            this.state.log = this.state.log.slice(0, 12);
        }
    }

    setupPlayers() {
        const createPlayer = (name) => ({
            name,
            fort: STARTING_FORT,
            deck: shuffle(STARTING_DECK_TEMPLATE.map((key) => createCard(key))),
            hand: [],
            discard: [],
            board: [],
            reserve: [],
            gold: 0,
            bankGold: 0
        });

        this.state.players = [
            createPlayer("Casa Alba"),
            createPlayer(this.state.playerTwoMode === "machine" ? "Casa Bruma (Maquina)" : "Casa Bruma")
        ];
    }

    drawCard(player) {
        if (player.deck.length === 0) {
            if (player.discard.length === 0) {
                return;
            }
            player.deck = shuffle(player.discard);
            player.discard = [];
            this.addLog(`${player.name} mezcla su descarte para formar un nuevo mazo.`);
        }
        const drawn = player.deck.pop();
        if (drawn) {
            player.hand.push(drawn);
        }
    }

    drawUpTo(player, handSize) {
        while (player.hand.length < handSize) {
            const before = player.hand.length;
            this.drawCard(player);
            if (player.hand.length === before) {
                break;
            }
        }
    }

    createMarketDeck() {
        const pool = [];
        CARD_LIBRARY.forEach((template) => {
            const copies = template.type === "treasure" ? 12 : 8;
            for (let amount = 0; amount < copies; amount += 1) {
                pool.push(template.key);
            }
        });
        return shuffle(pool);
    }

    refillMarket() {
        while (this.state.market.length < MARKET_SIZE && this.state.marketDeck.length > 0) {
            const key = this.state.marketDeck.pop();
            this.state.market.push(createCard(key));
        }
    }

    preparePlayersForRound() {
        this.state.players.forEach((player) => {
            this.drawUpTo(player, HAND_SIZE);
            player.hand.forEach((card) => {
                if (card.type === "treasure") {
                    card.spent = false;
                }
            });
            player.gold = calculateGold(player.hand);
            player.board.forEach((unit) => {
                unit.exhausted = false;
            });
        });
    }

    setPhase(phase, starterIndex) {
        this.state.phase = phase;
        this.state.attackSubPhase = "declaring";
        this.state.pendingAttack = null;
        if (phase === PHASES.ATTACK) {
            this.state.phasePlayer = starterIndex;
            this.state.phasePasses = [false, false];
            return;
        }
        this.state.phasePlayer = starterIndex;
        this.state.phasePasses = [false, false];
    }

    startRound(starterIndex) {
        this.state.phaseStarter = starterIndex;
        this.setPhase(PHASES.BUY, starterIndex);
        this.preparePlayersForRound();
        this.state.message = `Ronda ${this.state.roundNumber}: fase de compra. ${this.state.players[this.state.phasePlayer].name} actua primero.`;
        this.addLog(`Ronda ${this.state.roundNumber}: inicia fase de compra.`);
    }

    startDeployPhase() {
        this.setPhase(PHASES.DEPLOY, this.state.phaseStarter);
        this.state.message = `Fase de despliegue: ${this.state.players[this.state.phasePlayer].name} coloca primero.`;
        this.addLog("Empieza fase de despliegue.");
        this.notify();
    }

    startAttackPhase() {
        this.setPhase(PHASES.ATTACK, this.state.phaseStarter);
        const starter = this.state.players[this.state.phaseStarter];
        this.state.message = `Fase de ataque: ${starter.name} declara el primer ataque.`;
        this.addLog("Empieza fase de ataque.");
        this.notify();
    }

    finishRoundAndStartNext() {
        this.state.players.forEach((player) => {
            player.discard.push(...player.hand);
            player.hand = [];
        });
        this.state.roundNumber += 1;
        this.startRound(nextPlayerIndex(this.state.phaseStarter));
        this.notify();
    }

    markSpentTreasures(player, cost) {
        if (cost <= 0) {
            return;
        }
        let toMark = cost;
        const sortedTreasures = player.hand
            .filter((card) => card.type === "treasure" && !card.spent)
            .sort((a, b) => a.gold - b.gold);

        for (const treasure of sortedTreasures) {
            if (toMark <= 0) {
                break;
            }
            treasure.spent = true;
            toMark -= treasure.gold;
        }
    }

    getAvailableGold(player) {
        return player.gold + player.bankGold;
    }

    spendGold(player, cost) {
        const fromHand = Math.min(player.gold, cost);
        if (fromHand > 0) {
            player.gold -= fromHand;
            this.markSpentTreasures(player, fromHand);
        }

        const remaining = cost - fromHand;
        if (remaining > 0) {
            player.bankGold -= remaining;
        }
    }

    depositGoldToBank() {
        if (this.state.phase !== PHASES.BUY || this.state.phasePlayer === null || this.state.isGameOver) {
            return { ok: false, error: "Solo puedes guardar oro durante la fase de compra." };
        }

        const player = this.state.players[this.state.phasePlayer];
        if (player.gold <= 0) {
            return { ok: false, error: "No tienes oro en mano para guardar en el banco." };
        }

        const amount = player.gold;
        const treasuresToSave = player.hand.filter((card) => card.type === "treasure" && !card.spent);
        player.hand = player.hand.filter((card) => !(card.type === "treasure" && !card.spent));
        player.deck.push(...treasuresToSave);

        player.gold = 0;

        this.addLog(`${player.name} guarda ${treasuresToSave.length} tesoro(s) para el siguiente turno.`);
        this.state.message = `${player.name} aparta ${treasuresToSave.length} tesoro(s) al tope del mazo — volverán el próximo turno.`;
        this.emitAnim({ type: "bank-gold", playerIndex: this.state.phasePlayer, treasureIds: treasuresToSave.map((c) => c.id) });
        this.notify();
        return { ok: true };
    }

    isMachineActionTurn() {
        return !this.state.isGameOver
            && this.state.playerTwoMode === "machine"
            && this.state.phasePlayer === 1
            && (
                this.state.phase === PHASES.BUY
                || this.state.phase === PHASES.DEPLOY
                || (this.state.phase === PHASES.ATTACK && this.state.attackSubPhase === "declaring")
            );
    }

    isMachineDefendTurn() {
        return !this.state.isGameOver
            && this.state.playerTwoMode === "machine"
            && this.state.phase === PHASES.ATTACK
            && this.state.attackSubPhase === "defending"
            && this.state.pendingAttack !== null
            && this.state.pendingAttack.attackerPlayerIndex === 0;
    }

    isCurrentActionHuman() {
        return !this.state.isGameOver
            && (this.state.playerTwoMode === "human" || this.state.phasePlayer === 0);
    }

    /**
     * Devuelve true si el jugador humano (player 0) tiene al menos una acción
     * útil disponible en la fase actual y es su turno.
     */
    humanHasActions() {
        if (this.state.isGameOver) return false;
        if (this.state.phasePlayer !== 0) return false;
        if (!this.isCurrentActionHuman()) return false;

        const player = this.state.players[0];

        if (this.state.phase === PHASES.BUY) {
            const gold = this.getAvailableGold(player);
            // ¿Puede comprar algo del mercado?
            const canBuyMarket = this.state.market.some((c) => c.cost <= gold);
            // ¿Puede comprar de su reserva?
            const canBuyReserve = player.reserve.some((c) => c.cost <= gold);
            // ¿Puede reservar algo (necesita ≥1 oro y hueco)?
            const canReserve = gold >= 1 && player.reserve.length < MAX_RESERVE_SIZE && this.state.market.length > 0;
            // ¿Puede guardar oro (tiene tesoros sin gastar)?
            const canBank = player.gold > 0;
            return canBuyMarket || canBuyReserve || canReserve || canBank;
        }

        if (this.state.phase === PHASES.DEPLOY) {
            // ¿Tiene tropas en mano y hueco en el tablero?
            return player.board.length < MAX_BOARD_SIZE
                && player.hand.some((c) => c.type === "troop");
        }

        if (this.state.phase === PHASES.ATTACK && this.state.attackSubPhase === "declaring") {
            // ¿Tiene unidades disponibles para atacar?
            return player.board.some((u) => !u.exhausted);
        }

        if (this.state.phase === PHASES.ATTACK && this.state.attackSubPhase === "defending") {
            // Siempre puede elegir (defender o no defender), así que sí tiene acción
            return this.state.phasePlayer === 0;
        }

        return false;
    }

    movePhaseForwardAfterAction(currentPlayerIndex) {
        const otherIndex = nextPlayerIndex(currentPlayerIndex);
        this.state.phasePlayer = this.state.phasePasses[otherIndex] ? currentPlayerIndex : otherIndex;
    }

    maybeAdvanceFromPasses() {
        if (!this.state.phasePasses[0] || !this.state.phasePasses[1]) {
            return false;
        }
        if (this.state.phase === PHASES.BUY) {
            this.startDeployPhase();
            return true;
        }
        if (this.state.phase === PHASES.DEPLOY) {
            this.startAttackPhase();
            return true;
        }
        return false;
    }

    passCurrentAction() {
        if (this.state.isGameOver || (this.state.phase !== PHASES.BUY && this.state.phase !== PHASES.DEPLOY) || this.state.phasePlayer === null) {
            return { ok: false, error: "No puedes pasar en este momento." };
        }

        const passingIndex = this.state.phasePlayer;
        this.state.phasePasses[passingIndex] = true;
        this.addLog(`${this.state.players[passingIndex].name} pasa en fase de ${this.state.phase === PHASES.BUY ? "compra" : "despliegue"}.`);
        if (passingIndex === 1) {
            this.emitAnim({ type: "machine-pass", phase: this.state.phase, playerName: this.state.players[1].name });
        }

        if (!this.maybeAdvanceFromPasses()) {
            const otherIndex = nextPlayerIndex(passingIndex);
            this.state.phasePlayer = this.state.phasePasses[otherIndex] ? passingIndex : otherIndex;
            this.state.message = `${this.state.players[this.state.phasePlayer].name} decide su accion.`;
            this.notify();
        }

        return { ok: true };
    }

    buyFromMarket(cardId) {
        if (this.state.phase !== PHASES.BUY || this.state.phasePlayer === null || this.state.isGameOver) {
            return { ok: false, error: "Solo puedes comprar durante la fase de compra." };
        }

        const player = this.state.players[this.state.phasePlayer];
        const marketCard = this.state.market.find((card) => card.id === cardId);
        if (!marketCard) {
            return { ok: false, error: "Carta no encontrada en el mercado." };
        }
        if (this.getAvailableGold(player) < marketCard.cost) {
            return { ok: false, error: "No tienes oro suficiente para comprar esa carta." };
        }

        this.spendGold(player, marketCard.cost);
        player.discard.push(createCard(marketCard.key));
        this.state.market = this.state.market.filter((card) => card.id !== cardId);
        this.refillMarket();

        this.addLog(`${player.name} compra ${marketCard.name} del mercado.`);
        this.state.message = `${player.name} compra ${marketCard.name}.`;
        this.emitAnim({ type: "buy", playerIndex: this.state.phasePlayer, cardKey: marketCard.key, cardName: marketCard.name, marketCardId: cardId });
        this.movePhaseForwardAfterAction(this.state.phasePlayer);
        this.notify();
        return { ok: true };
    }

    reserveFromMarket(cardId) {
        if (this.state.phase !== PHASES.BUY || this.state.phasePlayer === null || this.state.isGameOver) {
            return { ok: false, error: "Solo puedes reservar durante la fase de compra." };
        }

        const player = this.state.players[this.state.phasePlayer];
        if (player.reserve.length >= MAX_RESERVE_SIZE) {
            return { ok: false, error: "Tu zona de reserva esta llena (max. 3 cartas)." };
        }
        if (this.getAvailableGold(player) < 1) {
            return { ok: false, error: "Necesitas 1 de oro para reservar una carta." };
        }

        const marketCard = this.state.market.find((card) => card.id === cardId);
        if (!marketCard) {
            return { ok: false, error: "Carta no encontrada en el mercado." };
        }

        this.spendGold(player, 1);
        player.reserve.push(marketCard);
        this.state.market = this.state.market.filter((card) => card.id !== cardId);
        this.refillMarket();

        this.addLog(`${player.name} reserva ${marketCard.name} por 1 oro.`);
        this.state.message = `${player.name} aparta ${marketCard.name} en su reserva.`;
        this.emitAnim({ type: "reserve", playerIndex: this.state.phasePlayer, cardKey: marketCard.key, cardName: marketCard.name, marketCardId: cardId });
        this.movePhaseForwardAfterAction(this.state.phasePlayer);
        this.notify();
        return { ok: true };
    }

    buyFromReserve(cardId) {
        if (this.state.phase !== PHASES.BUY || this.state.phasePlayer === null || this.state.isGameOver) {
            return { ok: false, error: "Solo puedes comprar en reserva durante la fase de compra." };
        }

        const player = this.state.players[this.state.phasePlayer];
        const reservedCard = player.reserve.find((card) => card.id === cardId);
        if (!reservedCard) {
            return { ok: false, error: "Carta no encontrada en la reserva." };
        }
        if (this.getAvailableGold(player) < reservedCard.cost) {
            return { ok: false, error: "No tienes oro suficiente para comprar esa carta." };
        }

        this.spendGold(player, reservedCard.cost);
        player.reserve = player.reserve.filter((card) => card.id !== cardId);
        player.discard.push(createCard(reservedCard.key));

        this.addLog(`${player.name} compra ${reservedCard.name} de su reserva.`);
        this.state.message = `${player.name} compra ${reservedCard.name} de la reserva.`;
        this.emitAnim({ type: "buy-reserve", playerIndex: this.state.phasePlayer, cardName: reservedCard.name });
        this.movePhaseForwardAfterAction(this.state.phasePlayer);
        this.notify();
        return { ok: true };
    }

    deployFromHand(cardId, ownerIndex) {
        if (this.state.phase !== PHASES.DEPLOY || this.state.phasePlayer === null || this.state.isGameOver) {
            return { ok: false, error: "Solo puedes desplegar durante la fase de despliegue." };
        }
        if (ownerIndex !== this.state.phasePlayer) {
            return { ok: false, error: "No es el turno de despliegue de ese jugador." };
        }

        const player = this.state.players[ownerIndex];
        if (player.board.length >= MAX_BOARD_SIZE) {
            return { ok: false, error: "Tu frente de batalla esta lleno." };
        }

        const card = player.hand.find((item) => item.id === cardId);
        if (!card) {
            return { ok: false, error: "Carta no encontrada en mano." };
        }
        if (card.type !== "troop") {
            return { ok: false, error: "Solo puedes desplegar tropas en esta fase." };
        }

        player.hand = player.hand.filter((item) => item.id !== card.id);
        card.currentHealth = card.health;
        card.exhausted = false;
        player.board.push(card);

        this.addLog(`${player.name} despliega ${card.name}.`);
        this.state.message = `${player.name} coloca ${card.name} en el frente.`;
        this.emitAnim({ type: "deploy", playerIndex: ownerIndex, cardId: card.id, cardName: card.name });
        this.movePhaseForwardAfterAction(ownerIndex);
        this.notify();
        return { ok: true };
    }

    resolveUnitDeaths(playerIndex) {
        const player = this.state.players[playerIndex];
        const deadUnits = player.board.filter((unit) => unit.currentHealth <= 0);
        player.board = player.board.filter((unit) => unit.currentHealth > 0);
        deadUnits.forEach((unit) => {
            player.discard.push(unit);
        });
    }

    endGame(winnerIndex) {
        this.state.isGameOver = true;
        const winner = this.state.players[winnerIndex];
        this.state.message = `${winner.name} gana la guerra.`;
        this.addLog(`Partida terminada: ${winner.name} destruye la fortaleza rival.`);
    }

    endGameDraw() {
        this.state.isGameOver = true;
        this.state.message = "Ambas fortalezas caen a la vez. Empate.";
        this.addLog("Partida terminada en empate por destruccion simultanea.");
    }

    // ── Nuevos métodos de combate por ataque dirigido ────────────────────

    checkGameOver() {
        this.state.players[0].fort = Math.max(0, this.state.players[0].fort);
        this.state.players[1].fort = Math.max(0, this.state.players[1].fort);
        const p0Dead = this.state.players[0].fort <= 0;
        const p1Dead = this.state.players[1].fort <= 0;
        if (p0Dead && p1Dead) { this.endGameDraw(); return true; }
        if (p1Dead) { this.endGame(0); return true; }
        if (p0Dead) { this.endGame(1); return true; }
        return false;
    }

    resolveCombat(attackerPlayerIndex, attackerUnit, defenderPlayerIndex, defenderUnit, overkillToFortress) {
        const atkSnap = attackerUnit.attack;
        const defSnap = defenderUnit.attack;
        const defHPSnap = defenderUnit.currentHealth;

        // Daño simultáneo
        attackerUnit.currentHealth -= defSnap;
        defenderUnit.currentHealth -= atkSnap;

        // Overkill del atacante va a la fortaleza solo en modo asalto
        if (overkillToFortress) {
            const overkill = Math.max(0, atkSnap - defHPSnap);
            if (overkill > 0) {
                this.state.players[defenderPlayerIndex].fort -= overkill;
                this.addLog(`Overkill: ${overkill} de daño traspasa a la fortaleza.`);
            }
        }

        this.resolveUnitDeaths(attackerPlayerIndex);
        this.resolveUnitDeaths(defenderPlayerIndex);
    }

    declareAttack(attackerPlayerIndex, attackerUnitId, mode, targetUnitId = null) {
        if (this.state.isGameOver
            || this.state.phase !== PHASES.ATTACK
            || this.state.attackSubPhase !== "declaring"
            || this.state.phasePlayer !== attackerPlayerIndex) {
            return { ok: false, error: "No puedes atacar en este momento." };
        }

        const attacker = this.state.players[attackerPlayerIndex];
        const attackerUnit = attacker.board.find((u) => u.id === attackerUnitId);
        if (!attackerUnit) {
            return { ok: false, error: "Unidad no encontrada." };
        }
        if (attackerUnit.exhausted) {
            return { ok: false, error: "Esta unidad ya atacó este turno." };
        }

        const defenderPlayerIndex = nextPlayerIndex(attackerPlayerIndex);

        if (mode === "duel") {
            if (!targetUnitId) {
                return { ok: false, error: "Debes elegir una unidad objetivo para el duelo." };
            }
            const defender = this.state.players[defenderPlayerIndex];
            const targetUnit = defender.board.find((u) => u.id === targetUnitId);
            if (!targetUnit) {
                return { ok: false, error: "Unidad objetivo no encontrada." };
            }

            attackerUnit.exhausted = true;
            this.resolveCombat(attackerPlayerIndex, attackerUnit, defenderPlayerIndex, targetUnit, false);
            this.addLog(`${attacker.name}: duelo ${attackerUnit.name} vs ${targetUnit.name}.`);
            this.state.message = `Duelo resuelto. Turno de ${this.state.players[defenderPlayerIndex].name}.`;
            this.emitAnim({ type: "duel", attackerPlayerIndex, attackerCardId: attackerUnitId, attackerCardName: attackerUnit.name, defenderPlayerIndex, defenderCardId: targetUnitId, defenderCardName: targetUnit.name });

            if (this.checkGameOver()) { this.notify(); return { ok: true }; }

            // Resetear pases y pasar el turno al rival
            this.state.phasePasses = [false, false];
            this.state.phasePlayer = defenderPlayerIndex;
            this.notify();
            return { ok: true };
        }

        if (mode === "assault") {
            // Guardar ataque pendiente y esperar respuesta del defensor
            attackerUnit.exhausted = true;
            this.state.pendingAttack = { attackerPlayerIndex, attackerUnitId, mode: "assault" };
            this.state.attackSubPhase = "defending";
            this.state.phasePlayer = defenderPlayerIndex;
            const defenderName = this.state.players[defenderPlayerIndex].name;
            this.state.message = `${attacker.name} asalta la fortaleza con ${attackerUnit.name} (ATK ${attackerUnit.attack}). ${defenderName}: elige quién defiende.`;
            this.addLog(`${attacker.name} declara asalto con ${attackerUnit.name}.`);
            this.emitAnim({ type: "assault-declared", attackerPlayerIndex, attackerCardId: attackerUnitId, attackerCardName: attackerUnit.name, defenderPlayerIndex });
            this.notify();
            return { ok: true };
        }

        return { ok: false, error: "Modo de ataque desconocido." };
    }

    declareDefense(defenderPlayerIndex, defenderUnitId) {
        if (this.state.isGameOver
            || this.state.phase !== PHASES.ATTACK
            || this.state.attackSubPhase !== "defending"
            || this.state.phasePlayer !== defenderPlayerIndex) {
            return { ok: false, error: "No puedes defender en este momento." };
        }

        const pending = this.state.pendingAttack;
        const attackerPlayerIndex = pending.attackerPlayerIndex;
        const attacker = this.state.players[attackerPlayerIndex];
        const attackerUnit = attacker.board.find((u) => u.id === pending.attackerUnitId);
        const defender = this.state.players[defenderPlayerIndex];

        if (defenderUnitId) {
            const defenderUnit = defender.board.find((u) => u.id === defenderUnitId);
            if (!defenderUnit) {
                return { ok: false, error: "Unidad defensora no encontrada." };
            }
            // Asalto con overkill a fortaleza
            // attackerUnit puede estar muerto si hubo algún error, pero lo protegemos
            if (attackerUnit) {
                this.emitAnim({ type: "assault-defended", attackerPlayerIndex, attackerCardId: pending.attackerUnitId, attackerCardName: attackerUnit.name, defenderPlayerIndex, defenderCardId: defenderUnitId, defenderCardName: defenderUnit.name });
                this.resolveCombat(attackerPlayerIndex, attackerUnit, defenderPlayerIndex, defenderUnit, true);
                this.addLog(`${defender.name} defiende con ${defenderUnit.name}. Asalto resuelto.`);
            }
            this.state.message = `Asalto resuelto. Turno de ${defender.name}.`;
        } else {
            // Sin defensor: todo el ATK del atacante va a la fortaleza
            if (attackerUnit) {
                this.emitAnim({ type: "assault-undefended", attackerPlayerIndex, attackerCardId: pending.attackerUnitId, attackerCardName: attackerUnit.name, defenderPlayerIndex, damage: attackerUnit.attack });
                defender.fort -= attackerUnit.attack;
                this.addLog(`${defender.name} no defiende. ${attackerUnit.attack} de daño directo a la fortaleza.`);
            }
            this.state.message = `Asalto sin defensa. ${attacker.name} inflige daño directo. Turno de ${defender.name}.`;
        }

        this.state.pendingAttack = null;
        this.state.attackSubPhase = "declaring";

        if (this.checkGameOver()) { this.notify(); return { ok: true }; }

        // Tras el asalto, el turno pasa al defensor (ahora puede atacar)
        this.state.phasePasses = [false, false];
        this.state.phasePlayer = defenderPlayerIndex;
        this.notify();
        return { ok: true };
    }

    passAttack() {
        if (this.state.isGameOver
            || this.state.phase !== PHASES.ATTACK
            || this.state.attackSubPhase !== "declaring") {
            return { ok: false, error: "No puedes pasar en este momento." };
        }

        const passingIndex = this.state.phasePlayer;
        this.state.phasePasses[passingIndex] = true;
        this.addLog(`${this.state.players[passingIndex].name} pasa en fase de ataque.`);

        if (this.state.phasePasses[0] && this.state.phasePasses[1]) {
            this.finishRoundAndStartNext();
            return { ok: true };
        }

        const otherIndex = nextPlayerIndex(passingIndex);
        this.state.phasePlayer = otherIndex;
        this.state.message = `${this.state.players[otherIndex].name} decide si atacar.`;
        this.notify();
        return { ok: true };
    }

    setPlayerTwoMode(mode) {
        this.state.playerTwoMode = mode;
        this.startNewGame();
    }

    toggleOpponentPiles() {
        this.state.showOpponentPiles = !this.state.showOpponentPiles;
        this.notify();
    }

    openDiscardModal(playerIndex) {
        if (this.state.isGameOver) {
            return;
        }
        this.state.discardModalPlayerIndex = playerIndex;
        this.state.discardModalOpen = true;
        this.notify();
    }

    closeDiscardModal() {
        this.state.discardModalOpen = false;
        this.state.discardModalPlayerIndex = null;
        this.notify();
    }

    startNewGame() {
        const previousMode = this.state.playerTwoMode;
        this.state = this.createInitialState();
        this.state.playerTwoMode = previousMode || "machine";
        this.state.marketDeck = this.createMarketDeck();
        this.setupPlayers();
        this.refillMarket();
        this.addLog("Nueva partida iniciada.");
        this.startRound(0);
        this.notify();
    }
}
