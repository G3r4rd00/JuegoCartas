export const CARD_LIBRARY = [
    { key: "milicia", name: "Milicia", type: "troop", cost: 2, attack: 2, health: 1, guard: false },
    { key: "lanceros", name: "Lanceros", type: "troop", cost: 3, attack: 3, health: 2, guard: false },
    { key: "guardia", name: "Guardia", type: "troop", cost: 3, attack: 1, health: 4, guard: true },
    { key: "caballeria", name: "Caballeria", type: "troop", cost: 4, attack: 4, health: 2, guard: false },
    { key: "ariete", name: "Ariete", type: "troop", cost: 5, attack: 5, health: 2, guard: false },
    { key: "veteranos", name: "Veteranos", type: "troop", cost: 4, attack: 2, health: 4, guard: true },
    { key: "tesoro-menor", name: "Tesoro Menor", type: "treasure", cost: 0, gold: 1, health: 0, attack: 0, guard: false },
    { key: "tesoro-mayor", name: "Tesoro Mayor", type: "treasure", cost: 0, gold: 2, health: 0, attack: 0, guard: false }
];

export const CARD_ART = {
    milicia: "assets/cards/milicia.png?v=10",
    lanceros: "assets/cards/lanceros.png?v=10",
    guardia: "assets/cards/guardia.png?v=10",
    caballeria: "assets/cards/caballeria.png?v=10",
    ariete: "assets/cards/ariete.png?v=10",
    veteranos: "assets/cards/veteranos.png?v=10",
    "tesoro-menor": "assets/cards/tesoro-menor.png?v=10",
    "tesoro-mayor": "assets/cards/tesoro-mayor.png?v=10"
};

export const STARTING_DECK_TEMPLATE = [
    "tesoro-menor", "tesoro-menor", "tesoro-menor", "tesoro-menor", "tesoro-menor",
    "milicia", "milicia", "milicia", "milicia", "milicia"
];

export const STARTING_FORT = 20;
export const MAX_BOARD_SIZE = 5;
export const MAX_RESERVE_SIZE = 3;
export const MARKET_SIZE = 4;
export const HAND_SIZE = 5;

export const PHASES = {
    BUY: "buy",
    DEPLOY: "deploy",
    ATTACK: "attack"
};
