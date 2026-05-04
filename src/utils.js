import { CARD_LIBRARY } from "./constants.js";

export function shuffle(cards) {
    const copy = [...cards];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function createCard(key) {
    const template = CARD_LIBRARY.find((card) => card.key === key);
    return {
        ...template,
        id: `${template.key}-${Math.random().toString(36).slice(2, 9)}`,
        currentHealth: template.health,
        exhausted: false,
        spent: false
    };
}

export function calculateGold(hand) {
    return hand
        .filter((card) => card.type === "treasure")
        .reduce((total, card) => total + card.gold, 0);
}

export function nextPlayerIndex(index) {
    return index === 0 ? 1 : 0;
}
