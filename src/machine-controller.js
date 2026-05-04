import { PHASES, MAX_BOARD_SIZE, MAX_RESERVE_SIZE } from "./constants.js";

export class MachineController {
    constructor(engine) {
        this.engine = engine;
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
        if (!this.engine.isMachineActionTurn()) {
            return;
        }

        this.timeoutId = window.setTimeout(() => {
            this.timeoutId = null;
            this.runAction();
        }, 850);
    }

    runAction() {
        const state = this.engine.state;
        if (state.phase === PHASES.BUY) {
            this.runBuyAction();
            return;
        }
        if (state.phase === PHASES.DEPLOY) {
            this.runDeployAction();
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
}
