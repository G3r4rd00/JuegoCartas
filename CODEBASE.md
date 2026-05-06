# Casas en Guerra - Documentación de Codebase

## Descripción General

Juego de cartas tácticas 1vs1 en navegador. Cada jugador controla una casa (Casa Alba vs Casa Bruma) y debe destruir la fortaleza rival. Sin dependencias externas de frontend: JavaScript puro con ES Modules. El backend es un servidor Node.js estático mínimo.

**Stack:**
- Frontend: HTML5 + CSS3 + JavaScript ES Modules (sin frameworks)
- Backend: Node.js `http` nativo (solo sirve archivos estáticos)
- Fuentes: Google Fonts (Cinzel + Manrope)
- Sin bundler, sin build step, sin dependencias npm de runtime

**Arrancar:**
```bash
npm start        # Servidor en http://localhost:3000
npm run generate:art   # Regenerar arte de cartas con IA (requiere OpenAI key en scripts/openai-key.txt)
```

---

## Estructura de Archivos

```
├── index.html                   # Estructura HTML de la UI
├── styles.css                  # Todos los estilos (CSS custom properties, responsive)
├── server.js                   # Servidor HTTP estático (Node.js)
├── package.json                # Scripts npm, sin dependencias de runtime
├── CODEBASE.md                 # Este archivo
├── README.md                   # Descripción breve
├── src/
│   ├── main.js                 # Punto de entrada: instancia engine, UI y máquina
│   ├── game-engine.js         # Motor del juego: estado, fases, acciones, combate
│   ├── machine-controller.js  # IA del jugador 2 (bot)
│   ├── ui-renderer.js         # Renderizado DOM reactivo
│   ├── utils.js               # Utilidades puras (shuffle, createCard, calculateGold)
│   └── constants.js           # Biblioteca de cartas, configuración global
├── assets/
│   └── cards/                 # Arte de cartas (.png + .svg)
└── scripts/
    └── generate-card-art.mjs  # Script para generar arte via OpenAI DALL-E
```

---

## Arquitectura

El juego sigue un patrón **Observer** simple:

```
GameEngine (estado + lógica)
    │
    ├── notify() → UIRenderer.render()     (actualiza el DOM)
    └── notify() → MachineController.queue()  (dispara acción de la IA)
```

- `GameEngine` es la única fuente de verdad. Contiene todo el estado.
- `UIRenderer` y `MachineController` se suscriben con `engine.subscribe(callback)`.
- Las acciones del usuario llaman a métodos del engine. El engine muta el estado y llama a `notify()`.
- La IA reacciona a cada `notify()` con un delay de 850ms para simular "pensar".

---

## GameEngine (`src/game-engine.js`)

### Estado principal (`this.state`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `players` | `Player[]` | Array de 2 jugadores |
| `playerTwoMode` | `"machine" \| "human"` | Modo del segundo jugador |
| `marketDeck` | `string[]` | Mazo del mercado (claves de carta) |
| `market` | `Card[]` | 4 cartas visibles en el mercado |
| `phase` | `"buy" \| "deploy" \| "attack"` | Fase actual de la ronda |
| `phaseStarter` | `number` | Índice del jugador que inicia la fase |
| `phasePlayer` | `number \| null` | Índice del jugador con turno activo (`null` en ataque) |
| `phasePasses` | `boolean[]` | Si cada jugador ha pasado en la fase actual |
| `roundNumber` | `number` | Número de ronda actual |
| `discardModalOpen` | `boolean` | Si el modal de descarte está abierto |
| `discardModalPlayerIndex` | `number \| null` | Jugador cuyo descarte se visualiza |
| `showOpponentPiles` | `boolean` | Si se muestran mazo/descarte del rival (modo máquina) |
| `isGameOver` | `boolean` | Si la partida ha terminado |
| `log` | `string[]` | Historial de acciones (máx. 12 entradas) |
| `message` | `string` | Mensaje de estado actual |

### Estructura de un `Player`

```js
{
    name: string,
    fort: number,          // Puntos de fortaleza (empieza en 20)
    deck: Card[],          // Mazo boca abajo
    hand: Card[],          // Mano (máx. 5 cartas)
    discard: Card[],       // Pila de descarte
    board: Card[],         // Frente de batalla (máx. 5 unidades)
    reserve: Card[],       // Cartas reservadas del mercado (máx. 3)
    gold: number,          // Oro disponible de la mano esta ronda
    bankGold: number       // Oro guardado en el banco (persiste entre rondas)
}
```

### Estructura de una `Card`

```js
{
    key: string,            // Identificador de plantilla (ej. "milicia")
    id: string,             // ID único de instancia (key + random)
    name: string,
    type: "troop" | "treasure",
    cost: number,           // Coste en oro para comprar
    attack: number,         // Daño que inflige por ronda
    health: number,         // Vida base
    currentHealth: number,  // Vida actual en combate
    guard: boolean,         // Si absorbe daño antes que otras unidades
    gold: number,           // Oro que aporta si es tesoro
    exhausted: boolean,     // Reservado para uso futuro
    spent: boolean          // Si el tesoro ya fue contabilizado
}
```

### Flujo de una ronda

```
startRound()
    │
    ├── Fase BUY (compra, turnos alternos)
    │       ├── buyFromMarket(cardId)
    │       ├── reserveFromMarket(cardId)    → carta apartada, coste 1 oro
    │       ├── buyFromReserve(cardId)
    │       ├── depositGoldToBank()          → guarda oro para rondas futuras
    │       └── passCurrentAction()
    │                   ↓ (ambos pasan)
    ├── Fase DEPLOY (despliegue, turnos alternos)
    │       ├── deployFromHand(cardId, ownerIndex)
    │       └── passCurrentAction()
    │                   ↓ (ambos pasan)
    └── Fase ATTACK (ataque simultáneo)
            └── resolveAttackPhase()
                        ↓
                finishRoundAndStartNext()  (o endGame / endGameDraw)
```

### Mecánica de ataque (`resolveAttackPhase`)

1. Se toma snapshot de ambos frentes.
2. `buildAttackPlan()` asigna atacantes a defensores:
   - Si hay unidades con **Guardia** → solo se puede atacar a esas primero.
   - Se distribuye el ataque por unidades intentando no repetir objetivos (menor vida primero).
   - Si no hay defensores → el daño va directo a la fortaleza.
3. `applyAttackPlan()` aplica el daño simultáneamente.
4. Las unidades con `currentHealth <= 0` van al descarte.
5. El daño sobrante tras matar unidades impacta la fortaleza.
6. Si ambas fortalezas caen a 0 → **Empate**.

### Métodos públicos clave

| Método | Descripción |
|--------|-------------|
| `startNewGame()` | Reinicia toda la partida |
| `buyFromMarket(cardId)` | Compra carta del mercado |
| `reserveFromMarket(cardId)` | Reserva carta por 1 oro |
| `buyFromReserve(cardId)` | Compra carta reservada |
| `deployFromHand(cardId, ownerIndex)` | Despliega tropa al frente |
| `passCurrentAction()` | Pasa el turno de la fase actual |
| `resolveAttackPhase()` | Resuelve el combate |
| `depositGoldToBank()` | Guarda oro de mano en banco |
| `setPlayerTwoMode(mode)` | Cambia modo rival y reinicia |
| `toggleOpponentPiles()` | Muestra/oculta mazo rival |
| `openDiscardModal(playerIndex)` | Abre modal de descarte |
| `subscribe(fn)` | Suscribirse a cambios de estado; retorna función de baja |

Todos los métodos de acción retornan `{ ok: boolean, error?: string }`.

---

## MachineController (`src/machine-controller.js`)

IA simple que actúa automáticamente cuando es el turno del jugador 2 en modo máquina.

**Lógica de compra (por prioridad):**
1. Comprar de reserva si hay carta asequible (mayor ataque+vida primero).
2. Comprar del mercado si hay carta asequible (mayor ataque+vida primero).
3. Reservar la mejor carta del mercado si no puede comprar directamente.
4. Guardar oro en banco si tiene oro sobrante.
5. Pasar.

**Lógica de despliegue:**
- Desplegar la tropa con mayor ataque+vida de la mano.
- Si el frente está lleno o no hay tropas → pasar.

La IA actúa con un **delay de 850ms** para que sea visible al usuario.

---

## UIRenderer (`src/ui-renderer.js`)

Se suscribe al engine y llama a `render()` en cada cambio de estado. Renderiza el DOM desde cero en cada actualización (no usa diff/virtual DOM).

**Zonas renderizadas:**
- `renderHand(playerIndex)` — Mano del jugador. Cartas ocultas para el rival en fase de ataque.
- `renderBoard(playerIndex)` — Frente de batalla.
- `renderMarket()` — Mercado con botones de compra y reserva.
- `renderReserve(playerIndex)` — Zona de reserva con botón de compra.
- `renderPiles(playerIndex)` — Mazo (boca abajo) y descarte (boca arriba, clicable).
- `renderDiscardModal()` — Modal con todas las cartas del descarte.
- `renderPhaseBanner()` — Indicador de fase activa en el header.

**Notificaciones:**
- `showToast(text, variant)` — Toast flotante en la parte inferior. Variantes: `"error"` (rojo) o `"info"` (teal). Se autodestruye en 2400ms.

**Visibilidad condicional:**
- Mano del rival se oculta en modo máquina.
- Mercado y reservas se colapsan fuera de la fase de compra.
- Mazo/descarte del rival se puede mostrar con el botón "Ver mazo y descarte rival".

---

## Constants (`src/constants.js`)

### Biblioteca de cartas

| key | Nombre | Tipo | Coste | Ataque | Vida | Guardia | Oro |
|-----|--------|------|-------|--------|------|---------|-----|
| `milicia` | Milicia | troop | 2 | 2 | 1 | No | - |
| `lanceros` | Lanceros | troop | 3 | 3 | 2 | No | - |
| `guardia` | Guardia | troop | 3 | 1 | 4 | **Sí** | - |
| `caballeria` | Caballería | troop | 4 | 4 | 2 | No | - |
| `ariete` | Ariete | troop | 5 | 5 | 2 | No | - |
| `veteranos` | Veteranos | troop | 4 | 2 | 4 | **Sí** | - |
| `tesoro-menor` | Tesoro Menor | treasure | 0 | - | - | No | 1 |
| `tesoro-mayor` | Tesoro Mayor | treasure | 0 | - | - | No | 2 |

### Configuración global

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `STARTING_FORT` | 20 | Vida inicial de la fortaleza |
| `MAX_BOARD_SIZE` | 5 | Máximo de unidades en el frente |
| `MAX_RESERVE_SIZE` | 3 | Máximo de cartas en reserva |
| `MARKET_SIZE` | 4 | Cartas visibles en el mercado |
| `HAND_SIZE` | 5 | Tamaño máximo de la mano |

**Mazo inicial:** 5× Tesoro Menor + 5× Milicia.

**Mazo de mercado:** 12 copias de cada tesoro + 8 copias de cada tropa, barajado.

---

## Utils (`src/utils.js`)

| Función | Descripción |
|---------|-------------|
| `shuffle(array)` | Fisher-Yates shuffle, no muta el original |
| `createCard(key)` | Crea instancia de carta desde la biblioteca con `id` único |
| `calculateGold(hand)` | Suma el oro de todos los tesoros en mano |
| `nextPlayerIndex(index)` | Alterna entre 0 y 1 |

---

## Servidor (`server.js`)

Servidor HTTP estático Node.js. Sin dependencias externas.

- Sirve archivos desde la raíz del proyecto.
- Soporta: `.html`, `.css`, `.js`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`.
- Ignora query strings (útil para cache-busting: `?v=10`).
- Protección básica contra path traversal (`../`).
- Puerto: `3000` (o `process.env.PORT`).

---

## Estilos (`styles.css`)

**CSS Custom Properties (variables globales):**

| Variable | Valor | Uso |
|----------|-------|-----|
| `--ink` | `#1f1c17` | Color de texto principal |
| `--muted` | `#72695e` | Texto secundario |
| `--panel` | `rgba(255,250,238,0.9)` | Fondo de paneles |
| `--gold` | `#be7c2f` | Acentos dorados |
| `--teal` | `#1c6f73` | Acentos reserva/acción |
| `--shadow` | — | Sombra global de paneles |
| `--card-width` | `138px` | Ancho base de cartas |

**Clases CSS notables:**

| Clase | Propósito |
|-------|-----------|
| `.card.guard` | Borde teal para unidades con Guardia |
| `.card.spent` | Opacidad + desaturación para tesoros usados |
| `.card.hidden` | Patrón de rayas, carta boca abajo |
| `.player-panel.active` | Outline dorado en el panel del jugador activo |
| `.phase-step.is-active` | Resalta la fase actual en el banner |
| `.toast.error / .info` | Notificaciones flotantes |
| `.is-collapsed` | Oculta el mercado fuera de fase de compra |

**Responsive:**
- `< 900px`: Mano/tablero a 4 columnas, mercado a 3.
- `< 700px`: Todo a 2 columnas, controles en fila, fase banner en columna.

---

## Flujo completo de partida

```
startNewGame()
│
├── Crear mazo de mercado (barajado)
├── Crear 2 jugadores con mazo inicial barajado
├── Rellenar mercado (4 cartas)
└── startRound(starter=0)
        │
        [Ronda N]
        ├── preparePlayersForRound()
        │       ├── Robar hasta 5 cartas
        │       ├── Resetear tesoros (spent=false)
        │       └── Calcular gold de mano
        │
        ├── FASE BUY (alternos desde phaseStarter)
        │       Cada acción → movePhaseForwardAfterAction()
        │       Cuando phasePasses=[true,true] → startDeployPhase()
        │
        ├── FASE DEPLOY (alternos desde phaseStarter)
        │       Cuando phasePasses=[true,true] → startAttackPhase()
        │
        └── FASE ATTACK
                resolveAttackPhase()
                ├── Calcular planes de ataque simultáneo
                ├── Aplicar daño
                ├── Eliminar unidades muertas
                ├── Actualizar fortalezas
                └── ¿Alguna fortaleza en 0?
                        ├── Sí → endGame() / endGameDraw()
                        └── No → finishRoundAndStartNext()
                                    └── Descartar manos
                                        roundNumber++
                                        startRound(phaseStarter alternado)
```

---

## Posibles Mejoras / TODOs

- Añadir más tipos de carta (hechizos, estructuras, héroes).
- Sistema de habilidades especiales por carta.
- Persistencia de partida (localStorage).
- IA mejorada con evaluación de amenazas del oponente.
- Animaciones de combate.
- Modo multijugador en red (WebSockets).
- Tests automatizados del engine.
- Soporte a más de 2 jugadores.
