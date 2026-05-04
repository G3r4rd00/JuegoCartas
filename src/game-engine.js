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
        if (phase === PHASES.ATTACK) {
            this.state.phasePlayer = null;
            this.state.phasePasses = [true, true];
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
        this.state.message = "Fase de ataque simultaneo: resuelve el combate.";
        this.addLog("Empieza fase de ataque simultaneo.");
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
        player.bankGold += amount;
        this.markSpentTreasures(player, amount);
        player.gold = 0;

        this.addLog(`${player.name} guarda ${amount} de oro en su banco.`);
        this.state.message = `${player.name} almacena ${amount} de oro para turnos futuros.`;
        this.notify();
        return { ok: true };
    }

    isMachineActionTurn() {
        return !this.state.isGameOver
            && this.state.playerTwoMode === "machine"
            && this.state.phasePlayer === 1
            && (this.state.phase === PHASES.BUY || this.state.phase === PHASES.DEPLOY);
    }

    isCurrentActionHuman() {
        return !this.state.isGameOver
            && (this.state.playerTwoMode === "human" || this.state.phasePlayer === 0);
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

    applyDamageByPriority(playerIndex, damage) {
        if (damage <= 0) {
            return { unitDamage: 0, fortressDamage: 0 };
        }

        const player = this.state.players[playerIndex];
        let pending = damage;
        const guards = player.board.filter((unit) => unit.guard).sort((a, b) => a.currentHealth - b.currentHealth);
        const nonGuards = player.board.filter((unit) => !unit.guard).sort((a, b) => a.currentHealth - b.currentHealth);

        [...guards, ...nonGuards].forEach((unit) => {
            if (pending <= 0) {
                return;
            }
            const dealt = Math.min(unit.currentHealth, pending);
            unit.currentHealth -= dealt;
            pending -= dealt;
        });

        this.resolveUnitDeaths(playerIndex);

        const fortressDamage = Math.max(0, pending);
        if (fortressDamage > 0) {
            player.fort -= fortressDamage;
        }

        return {
            unitDamage: damage - pending,
            fortressDamage
        };
    }

    buildAttackPlan(attackers, defenders) {
        const damageByUnit = new Map();
        let fortressDamage = 0;

        if (defenders.length === 0) {
            attackers.forEach((attacker) => {
                fortressDamage += attacker.attack;
            });
            return { damageByUnit, fortressDamage };
        }

        const hasGuards = defenders.some((unit) => unit.guard);
        const preferredDefenders = hasGuards
            ? defenders.filter((unit) => unit.guard)
            : defenders;
        const chosenTargets = new Set();

        attackers.forEach((attacker) => {
            const untargeted = preferredDefenders
                .filter((unit) => !chosenTargets.has(unit.id))
                .sort((a, b) => a.currentHealth - b.currentHealth);

            const target = (untargeted[0] || [...preferredDefenders].sort((a, b) => a.currentHealth - b.currentHealth)[0]);
            if (!target) {
                fortressDamage += attacker.attack;
                return;
            }

            chosenTargets.add(target.id);
            const previous = damageByUnit.get(target.id) || 0;
            damageByUnit.set(target.id, previous + attacker.attack);
        });

        return { damageByUnit, fortressDamage };
    }

    applyAttackPlan(playerIndex, plan) {
        const player = this.state.players[playerIndex];
        let unitDamage = 0;

        player.board.forEach((unit) => {
            const damage = plan.damageByUnit.get(unit.id) || 0;
            if (damage <= 0) {
                return;
            }
            const dealt = Math.min(unit.currentHealth, damage);
            unit.currentHealth -= damage;
            unitDamage += dealt;
        });

        this.resolveUnitDeaths(playerIndex);

        if (plan.fortressDamage > 0) {
            player.fort -= plan.fortressDamage;
        }

        return {
            unitDamage,
            fortressDamage: plan.fortressDamage
        };
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

    resolveAttackPhase() {
        if (this.state.isGameOver || this.state.phase !== PHASES.ATTACK) {
            return { ok: false, error: "No puedes resolver ataque fuera de su fase." };
        }

        const board0Snapshot = [...this.state.players[0].board];
        const board1Snapshot = [...this.state.players[1].board];
        const attack0 = board0Snapshot.reduce((sum, unit) => sum + unit.attack, 0);
        const attack1 = board1Snapshot.reduce((sum, unit) => sum + unit.attack, 0);

        const planOnP1 = this.buildAttackPlan(board0Snapshot, board1Snapshot);
        const planOnP0 = this.buildAttackPlan(board1Snapshot, board0Snapshot);

        const resultOnP1 = this.applyAttackPlan(1, planOnP1);
        const resultOnP0 = this.applyAttackPlan(0, planOnP0);

        if (this.state.players[0].fort <= 0) {
            this.state.players[0].fort = 0;
        }
        if (this.state.players[1].fort <= 0) {
            this.state.players[1].fort = 0;
        }

        this.addLog(`Ataque simultaneo: Alba ${attack0} vs Bruma ${attack1}.`);
        this.state.message = `Alba inflige ${resultOnP1.unitDamage} a unidades y ${resultOnP1.fortressDamage} a fortaleza. Bruma inflige ${resultOnP0.unitDamage} a unidades y ${resultOnP0.fortressDamage} a fortaleza.`;

        const p0Dead = this.state.players[0].fort <= 0;
        const p1Dead = this.state.players[1].fort <= 0;
        if (p0Dead && p1Dead) {
            this.endGameDraw();
            this.notify();
            return { ok: true };
        }
        if (p1Dead) {
            this.endGame(0);
            this.notify();
            return { ok: true };
        }
        if (p0Dead) {
            this.endGame(1);
            this.notify();
            return { ok: true };
        }

        this.finishRoundAndStartNext();
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
