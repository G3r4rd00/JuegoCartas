import { PHASES, MAX_BOARD_SIZE, MAX_RESERVE_SIZE } from "./constants.js";

export class MachineController {
    constructor(engine, renderer = null) {
        this.engine = engine;
        this.renderer = renderer;
        this.timeoutId = null;
        this.engine.subscribe(() => {
            this.queue();
        });
    }

    clear() {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    queue() {
        this.clear();
        if (!this.engine.isMachineActionTurn() && !this.engine.isMachineDefendTurn()) {
            return;
        }

        // Esperar a que la animación en curso termine (si hay renderer) y luego actuar
        const animDone = this.renderer ? this.renderer.waitForAnimation() : Promise.resolve();
        animDone.then(() => {
            // Pausa adicional de 600ms tras la animación para que el jugador asimile lo ocurrido
            this.timeoutId = window.setTimeout(() => {
                this.timeoutId = null;
                this.runAction();
            }, 600);
        });
    }

    runAction() {
        const state = this.engine.state;
        if (state.phase === PHASES.BUY) {
            this.runBuyAction();
            return;
        }
        if (state.phase === PHASES.DEPLOY) {
            this.runDeployAction();
            return;
        }
        if (state.phase === PHASES.ATTACK) {
            if (state.attackSubPhase === "defending") {
                this.runDefendAction();
            } else {
                this.runAttackAction();
            }
        }
    }

    runBuyAction() {
        const state = this.engine.state;
        const machine = state.players[1];
        const availableGold = this.engine.getAvailableGold(machine);

        const affordableReserve = machine.reserve
            .filter((card) => card.cost <= availableGold)
            .sort((a, b) => (b.attack + b.health) - (a.attack + a.health));
        if (affordableReserve[0]) {
            this.engine.buyFromReserve(affordableReserve[0].id);
            return;
        }

        const affordableMarket = state.market
            .filter((card) => card.cost <= availableGold)
            .sort((a, b) => (b.attack + b.health) - (a.attack + a.health));
        if (affordableMarket[0]) {
            this.engine.buyFromMarket(affordableMarket[0].id);
            return;
        }

        const canReserve = machine.reserve.length < MAX_RESERVE_SIZE && availableGold >= 1;
        if (canReserve) {
            const reserveTarget = [...state.market]
                .sort((a, b) => (b.attack + b.health + (b.gold || 0)) - (a.attack + a.health + (a.gold || 0)))[0];
            if (reserveTarget) {
                this.engine.reserveFromMarket(reserveTarget.id);
                return;
            }
        }

        if (machine.gold > 0) {
            this.engine.depositGoldToBank();
            return;
        }

        this.engine.passCurrentAction();
    }

    runDeployAction() {
        const state = this.engine.state;
        const machine = state.players[1];

        const troop = machine.hand
            .filter((card) => card.type === "troop")
            .sort((a, b) => (b.attack + b.health) - (a.attack + a.health))[0];

        if (troop && machine.board.length < MAX_BOARD_SIZE) {
            this.engine.deployFromHand(troop.id, 1);
            return;
        }

        this.engine.passCurrentAction();
    }

    runAttackAction() {
        const state = this.engine.state;
        const machine = state.players[1];
        const player = state.players[0];

        const available = machine.board.filter((u) => !u.exhausted);
        if (available.length === 0) {
            this.engine.passAttack();
            return;
        }

        // Ordenar atacantes por ATK descendente
        const attacker = [...available].sort((a, b) => b.attack - a.attack)[0];

        // Si el rival no tiene unidades: asaltar fortaleza directamente
        if (player.board.length === 0) {
            this.engine.declareAttack(1, attacker.id, "assault");
            return;
        }

        // Encontrar la unidad rival con menor HP
        const weakest = [...player.board].sort((a, b) => a.currentHealth - b.currentHealth)[0];

        // Si podemos matar a la unidad más débil con overkill → asaltar fortaleza
        if (attacker.attack > weakest.currentHealth) {
            this.engine.declareAttack(1, attacker.id, "assault");
            return;
        }

        // Si podemos matar exactamente (sin overkill) o no podemos matar: duelo
        this.engine.declareAttack(1, attacker.id, "duel", weakest.id);
    }

    runDefendAction() {
        const state = this.engine.state;
        const machine = state.players[1];
        const pending = state.pendingAttack;
        const attackerUnit = state.players[pending.attackerPlayerIndex].board.find(
            (u) => u.id === pending.attackerUnitId
        );

        if (!attackerUnit || machine.board.length === 0) {
            this.engine.declareDefense(1, null);
            return;
        }

        // Elegir el defensor con mayor HP para minimizar el overkill a fortaleza
        const bestDefender = [...machine.board].sort((a, b) => b.currentHealth - a.currentHealth)[0];

        // Defender si salva daño a la fortaleza
        const overkillWithDefense = Math.max(0, attackerUnit.attack - bestDefender.currentHealth);
        const damageWithoutDefense = attackerUnit.attack;

        if (overkillWithDefense < damageWithoutDefense) {
            this.engine.declareDefense(1, bestDefender.id);
        } else {
            this.engine.declareDefense(1, null);
        }
    }
}
