(function () {
    "use strict";

    const STORAGE_KEY = "dynamicCalcDoublesPlannerV1";
    const MAX_TEAM = 6;
    const ACTIVE_SLOTS = ["player-left", "player-right", "enemy-left", "enemy-right"];
    const DEFAULT_STATE = {
        version: 1,
        game: { title: "", generation: null, rulesProfile: "auto" },
        team: [],
        battles: [],
        selectedBattleId: null,
        board: {
            turn: 1,
            trickRoomTurns: 0,
            weather: "None",
            terrain: "None",
            playerTailwindTurns: 0,
            enemyTailwindTurns: 0,
            playerWideGuard: false,
            enemyWideGuard: false,
            actions: { playerLeftMove: 0, playerRightMove: 0, target: "enemy-left" },
            slots: {}
        }
    };

    let state = loadState();
    let initialized = false;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function uid(prefix) {
        return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    function safeNumber(value, fallback, min, max) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
    }

    function loadState() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!parsed || parsed.version !== 1) return clone(DEFAULT_STATE);
            return Object.assign(clone(DEFAULT_STATE), parsed, {
                game: Object.assign({}, DEFAULT_STATE.game, parsed.game || {}),
                board: Object.assign(clone(DEFAULT_STATE.board), parsed.board || {}, {
                    slots: Object.assign({}, DEFAULT_STATE.board.slots, parsed.board && parsed.board.slots || {})
                })
            });
        } catch (_) {
            return clone(DEFAULT_STATE);
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        const stamp = document.querySelector("#doubles-planner-save-state");
        if (stamp) stamp.textContent = "Saved";
    }

    function currentGameTitle() {
        return typeof window.TITLE === "string" ? window.TITLE : document.title.replace(/ Calculator$/, "");
    }

    function currentGeneration() {
        if (typeof window.gameGen === "number") return window.gameGen;
        const checked = document.querySelector(".gen:checked");
        return checked ? Number(checked.value) : null;
    }

    function syncGameMetadata() {
        state.game.title = currentGameTitle();
        state.game.generation = currentGeneration();
    }

    function emptyVolatile() {
        return {
            status: "Healthy",
            hpPercent: 100,
            speed: 0,
            speedStage: 0,
            attackStage: 0,
            defenseStage: 0,
            spaStage: 0,
            spdStage: 0,
            tormented: false,
            lastMove: "",
            encoreMove: "",
            encoreTurns: 0,
            disabledMove: "",
            disableTurns: 0,
            protectChain: 0,
            choiceLockedMove: "",
            notes: ""
        };
    }

    function normalizeMon(mon) {
        return Object.assign({
            id: uid("mon"),
            name: "Pokemon",
            nickname: "",
            level: 50,
            item: "",
            ability: "",
            nature: "",
            moves: ["", "", "", ""],
            role: "",
            preserved: false,
            tags: [],
            calcData: null
        }, mon || {});
    }

    function getMon(id) {
        return state.team.find(mon => mon.id === id) || null;
    }

    function getEnemy(id) {
        const battle = getSelectedBattle();
        return battle && Array.isArray(battle.enemies) ? battle.enemies.find(mon => mon.id === id) || null : null;
    }

    function getCombatant(slotId, monId) {
        return slotId && slotId.startsWith("enemy") ? getEnemy(monId) : getMon(monId);
    }

    function render() {
        syncGameMetadata();
        const root = document.getElementById("doubles-planner-view");
        if (!root) return;

        root.innerHTML = [
            '<div class="dp-shell">',
            renderPlannerHeader(),
            '<div class="dp-layout">',
            '<section class="dp-panel dp-team-panel">' + renderTeamPlanner() + '</section>',
            '<section class="dp-panel dp-battle-panel">' + renderBattlePlanner() + '</section>',
            '</div>',
            '<section class="dp-panel dp-board-panel">' + renderBoard() + '</section>',
            '</div>'
        ].join("");

        wireEvents(root);
        saveState();
    }

    function renderPlannerHeader() {
        return '<div class="dp-header">' +
            '<div><h2>Team & Doubles Planner</h2>' +
            '<p>' + escapeHtml(state.game.title || "Current game") + ' · Gen ' + escapeHtml(state.game.generation || "?") +
            ' · portable planner state</p></div>' +
            '<div class="dp-header-actions">' +
            '<span id="doubles-planner-save-state" class="dp-muted">Saved</span>' +
            '<button type="button" data-dp-action="import-current">Import current player</button>' +
            '<button type="button" data-dp-action="export">Export plan</button>' +
            '<button type="button" data-dp-action="import">Import plan</button>' +
            '<button type="button" class="dp-danger" data-dp-action="reset">Reset</button>' +
            '<input type="file" id="doubles-planner-import-file" accept=".json,application/json" hidden>' +
            '</div></div>';
    }

    function renderTeamPlanner() {
        const cards = state.team.length ? state.team.map((mon, index) => {
            const moveText = (mon.moves || []).filter(Boolean).join(" / ") || "Moves not set";
            return '<article class="dp-mon-card" data-mon-id="' + mon.id + '">' +
                '<div class="dp-card-top"><strong>' + (index + 1) + '. ' + escapeHtml(mon.nickname || mon.name) + '</strong>' +
                '<span>Lv' + escapeHtml(mon.level) + '</span></div>' +
                '<div class="dp-mon-species">' + escapeHtml(mon.name) + '</div>' +
                '<div class="dp-mini">' + escapeHtml([mon.item, mon.ability].filter(Boolean).join(" · ") || "No item/ability set") + '</div>' +
                '<div class="dp-moves">' + escapeHtml(moveText) + '</div>' +
                '<div class="dp-role-row"><input aria-label="Role" data-field="role" data-mon-id="' + mon.id + '" value="' + attr(mon.role) + '" placeholder="Role: lead / pivot / cleaner...">' +
                '<label><input type="checkbox" data-field="preserved" data-mon-id="' + mon.id + '"' + (mon.preserved ? " checked" : "") + '> Preserve</label></div>' +
                '<div class="dp-card-actions"><button type="button" data-dp-action="edit-mon" data-mon-id="' + mon.id + '">Edit</button>' +
                '<button type="button" data-dp-action="remove-mon" data-mon-id="' + mon.id + '">Remove</button></div>' +
                '</article>';
        }).join("") : '<div class="dp-empty">Add up to six Pokémon. This team persists while you test multiple Elite Four fights.</div>';

        return '<div class="dp-section-head"><div><h3>Team of six</h3><p>One reusable roster across the E4 sequence.</p></div>' +
            '<button type="button" data-dp-action="add-mon"' + (state.team.length >= MAX_TEAM ? " disabled" : "") + '>+ Pokémon</button></div>' +
            '<div class="dp-team-grid">' + cards + '</div>';
    }

    function renderEnemyRoster(battle) {
        const enemies = Array.isArray(battle.enemies) ? battle.enemies : [];
        if (!enemies.length) {
            return '<div class="dp-enemy-empty">No opponent sets saved yet. Load an E4 Pokémon in the normal calculator and click “Import current opponent”.</div>';
        }
        return '<div class="dp-enemy-head"><strong>Opponent roster</strong><span>' + enemies.length + ' saved</span></div>' +
            '<div class="dp-enemy-grid">' + enemies.map(mon =>
                '<div class="dp-enemy-chip"><span><strong>' + escapeHtml(mon.nickname || mon.name) + '</strong><small>Lv' + escapeHtml(mon.level) + ' · ' +
                escapeHtml((mon.moves || []).filter(Boolean).join(' / ')) + '</small></span>' +
                '<button type="button" data-dp-action="remove-enemy" data-enemy-id="' + mon.id + '" aria-label="Remove opponent">×</button></div>'
            ).join('') + '</div>';
    }

    function renderBattlePlanner() {
        const selected = getSelectedBattle();
        const battleRows = state.battles.length ? state.battles.map((battle, index) =>
            '<button type="button" class="dp-battle-row' + (selected && selected.id === battle.id ? " active" : "") + '" data-dp-action="select-battle" data-battle-id="' + battle.id + '">' +
            '<span><strong>' + (index + 1) + '. ' + escapeHtml(battle.name || "Battle") + '</strong>' +
            '<small>' + escapeHtml(battle.format || "Doubles") + '</small></span>' +
            '<span class="dp-battle-status">' + escapeHtml(battle.status || "Unplanned") + '</span></button>'
        ).join("") : '<div class="dp-empty">Add E4 members, champion fights, rivals, or any future boss sequence.</div>';

        let editor = "";
        if (selected) {
            editor = '<div class="dp-battle-editor">' +
                '<label>Name<input data-battle-field="name" value="' + attr(selected.name) + '"></label>' +
                '<label>Format<select data-battle-field="format">' + options(["Singles","Doubles","Triples","Rotation","Multi"], selected.format || "Doubles") + '</select></label>' +
                '<label>Status<select data-battle-field="status">' + options(["Unplanned","Draft","Checked","Ready","Completed"], selected.status || "Unplanned") + '</select></label>' +
                '<label class="dp-span-2">Win condition<textarea data-battle-field="winCondition" placeholder="What board state are we trying to create?">' + escapeHtml(selected.winCondition || "") + '</textarea></label>' +
                '<label class="dp-span-2">Risks / resources<textarea data-battle-field="notes" placeholder="Crit ranges, speed ties, PP, held items, preservation constraints...">' + escapeHtml(selected.notes || "") + '</textarea></label>' +
                '<div class="dp-span-2 dp-enemy-roster">' + renderEnemyRoster(selected) + '</div>' +
                '<div class="dp-span-2 dp-card-actions"><button type="button" data-dp-action="import-opponent">Import current opponent</button>' +
                '<button type="button" data-dp-action="load-battle-board">Load into board</button>' +
                '<button type="button" class="dp-danger" data-dp-action="remove-battle">Remove battle</button></div>' +
                '</div>';
        }

        return '<div class="dp-section-head"><div><h3>Boss sequence</h3><p>E4-friendly, but not tied to Blaze Black.</p></div>' +
            '<button type="button" data-dp-action="add-battle">+ Battle</button></div>' +
            '<div class="dp-battle-list">' + battleRows + '</div>' + editor;
    }

    function renderBoard() {
        const b = state.board;
        const speedOrder = computeSpeedOrder();
        return '<div class="dp-section-head"><div><h3>Doubles state lab</h3><p>Track a board over several turns instead of doing isolated 1v1 calcs.</p></div>' +
            '<div class="dp-turn-controls"><button type="button" data-dp-action="prev-turn">−</button><strong>Turn ' + b.turn + '</strong><button type="button" data-dp-action="next-turn">+</button></div></div>' +
            '<div class="dp-field-controls">' +
            fieldSelect("weather", "Weather", ["None","Sun","Rain","Sand","Hail"], b.weather) +
            fieldSelect("terrain", "Terrain", ["None","Electric","Grassy","Misty","Psychic"], b.terrain) +
            numberField("trickRoomTurns", "Trick Room", b.trickRoomTurns, 0, 5) +
            numberField("playerTailwindTurns", "Your Tailwind", b.playerTailwindTurns, 0, 4) +
            numberField("enemyTailwindTurns", "Enemy Tailwind", b.enemyTailwindTurns, 0, 4) +
            '<label class="dp-check-field"><span>Your Wide Guard</span><input type="checkbox" data-board-field="playerWideGuard"' + (b.playerWideGuard ? ' checked' : '') + '></label>' +
            '<label class="dp-check-field"><span>Enemy Wide Guard</span><input type="checkbox" data-board-field="enemyWideGuard"' + (b.enemyWideGuard ? ' checked' : '') + '></label>' +
            '</div>' +
            '<div class="dp-speed-strip"><span class="dp-speed-label">Action speed</span>' +
            (speedOrder.length ? speedOrder.map((entry, i) => '<span class="dp-speed-chip">' + (i + 1) + ' · ' + escapeHtml(entry.label) + ' <strong>' + entry.speed + '</strong></span>').join("") : '<span class="dp-muted">Assign active Pokémon and speeds.</span>') +
            (b.trickRoomTurns > 0 ? '<span class="dp-warning">Trick Room active: slower acts first</span>' : '') +
            '</div>' +
            '<div class="dp-board-grid">' +
            renderSide("Your side", ["player-left","player-right"]) +
            renderSide("Opponent", ["enemy-left","enemy-right"]) +
            '</div>' +
            renderDamageLab() +
            '<div class="dp-turn-notes">' +
            '<label>Turn / line notes<textarea data-board-field="turnNotes" placeholder="Example: Protect left + double target Chandelure; next turn Torment prevents repeat Aura Sphere.">' + escapeHtml(b.turnNotes || "") + '</textarea></label>' +
            '<div class="dp-card-actions"><button type="button" data-dp-action="snapshot">Save turn snapshot</button>' +
            '<button type="button" data-dp-action="clear-board">Clear board</button></div>' +
            '</div>' + renderSnapshots();
    }

    function renderDamageLab() {
        const active = ACTIVE_SLOTS.map(slotId => {
            const slot = state.board.slots[slotId] || {};
            const mon = getCombatant(slotId, slot.monId);
            return mon ? { slotId, slot, mon } : null;
        }).filter(Boolean);
        if (!active.length) {
            return '<section class="dp-damage-lab"><div class="dp-section-head"><div><h3>Damage matrix</h3><p>Assign active Pokémon to calculate with Dynamic Calc.</p></div></div></section>';
        }

        const rows = active.map(attacker => {
            const targets = active.filter(defender => defender.slotId.startsWith("player") !== attacker.slotId.startsWith("player"));
            if (!targets.length) return '';
            return '<div class="dp-damage-attacker"><div class="dp-damage-attacker-head"><strong>' + escapeHtml(attacker.mon.nickname || attacker.mon.name) + '</strong>' +
                '<span>' + (attacker.slotId.startsWith("player") ? 'Your side' : 'Opponent') + '</span></div>' +
                '<div class="dp-damage-moves">' + (attacker.mon.moves || []).map((moveName, moveIndex) => {
                    if (!moveName) return '';
                    return '<div class="dp-damage-move"><span class="dp-damage-move-name">' + escapeHtml(moveName) + '</span>' +
                        targets.map(defender => '<span class="dp-damage-cell">' + escapeHtml(defender.mon.nickname || defender.mon.name) + ': <strong>' +
                        escapeHtml(formatDamageCell(calculatePlannerDamage(attacker, defender, moveIndex))) + '</strong></span>').join('') + '</div>';
                }).join('') + '</div></div>';
        }).join('');

        return '<section class="dp-damage-lab"><div class="dp-section-head"><div><h3>Damage matrix</h3><p>Uses the existing Dynamic Calc engine, including the current hack data and Doubles spread modifier.</p></div></div>' +
            '<div class="dp-damage-grid">' + rows + '</div>' + renderDoubleUp() + '</section>';
    }

    function renderDoubleUp() {
        const leftSlot = state.board.slots["player-left"] || {};
        const rightSlot = state.board.slots["player-right"] || {};
        const left = getMon(leftSlot.monId);
        const right = getMon(rightSlot.monId);
        const targetSlotId = state.board.actions && state.board.actions.target || "enemy-left";
        const targetSlot = state.board.slots[targetSlotId] || {};
        const target = getEnemy(targetSlot.monId);
        if (!left || !right || !target) return '';

        const actions = state.board.actions || (state.board.actions = { playerLeftMove: 0, playerRightMove: 0, target: "enemy-left" });
        const leftIdx = safeNumber(actions.playerLeftMove, 0, 0, 3);
        const rightIdx = safeNumber(actions.playerRightMove, 0, 0, 3);
        const d1 = calculatePlannerDamage({slotId:"player-left",slot:leftSlot,mon:left},{slotId:targetSlotId,slot:targetSlot,mon:target},leftIdx);
        const d2 = calculatePlannerDamage({slotId:"player-right",slot:rightSlot,mon:right},{slotId:targetSlotId,slot:targetSlot,mon:target},rightIdx);
        const combined = combineDamageRanges(d1, d2);
        const currentHp = combined && combined.defenderHp ? Math.ceil(combined.defenderHp * safeNumber(targetSlot.hpPercent,100,0,100) / 100) : 0;
        const verdict = combined && currentHp ? (combined.min >= currentHp ? 'Guaranteed KO from current HP' : combined.max >= currentHp ? 'Roll / conditional KO' : 'Does not KO from current HP') : 'Assign valid moves';

        return '<div class="dp-double-up"><div><strong>Double-up check</strong><span>' + escapeHtml(verdict) + '</span></div>' +
            '<label>' + escapeHtml(left.nickname || left.name) + '<select data-action-field="playerLeftMove">' + moveOptions(left.moves,leftIdx) + '</select></label>' +
            '<label>' + escapeHtml(right.nickname || right.name) + '<select data-action-field="playerRightMove">' + moveOptions(right.moves,rightIdx) + '</select></label>' +
            '<label>Target<select data-action-field="target">' + enemyTargetOptions(targetSlotId) + '</select></label>' +
            '<div class="dp-double-up-result">' + (combined ? escapeHtml(combined.min + '–' + combined.max + ' HP combined' + (currentHp ? ' vs ' + currentHp + ' current HP' : '')) : '—') + '</div></div>';
    }

    function moveOptions(moves, selected) {
        return (moves || []).map((name,index) => name ? '<option value="' + index + '"' + (index === Number(selected) ? ' selected' : '') + '>' + escapeHtml(name) + '</option>' : '').join('');
    }

    function enemyTargetOptions(selected) {
        return ["enemy-left","enemy-right"].map(slotId => {
            const slot = state.board.slots[slotId] || {};
            const mon = getEnemy(slot.monId);
            const label = mon ? (mon.nickname || mon.name) : (slotId.endsWith("left") ? "Enemy Left" : "Enemy Right");
            return '<option value="' + slotId + '"' + (slotId === selected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        }).join('');
    }

    function renderSide(title, slotIds) {
        return '<div class="dp-side"><h4>' + title + '</h4>' + slotIds.map(renderSlot).join("") + '</div>';
    }

    function renderSlot(slotId) {
        const slot = Object.assign({ monId: "", label: slotId }, emptyVolatile(), state.board.slots[slotId] || {});
        const sourceMons = slotId.startsWith("enemy") ? ((getSelectedBattle() && getSelectedBattle().enemies) || []) : state.team;
        const teamOptions = '<option value="">— Empty —</option>' + sourceMons.map(mon =>
            '<option value="' + mon.id + '"' + (slot.monId === mon.id ? " selected" : "") + '>' + escapeHtml(mon.nickname || mon.name) + '</option>'
        ).join("");
        return '<article class="dp-slot" data-slot-id="' + slotId + '">' +
            '<div class="dp-slot-head"><select data-slot-field="monId">' + teamOptions + '</select>' +
            '<span>' + escapeHtml(slotId.endsWith("left") ? "Left" : "Right") + '</span></div>' +
            '<div class="dp-slot-row"><label>HP %<input type="number" min="0" max="100" data-slot-field="hpPercent" value="' + slot.hpPercent + '"></label>' +
            '<label>Speed<input type="number" min="0" max="9999" data-slot-field="speed" value="' + slot.speed + '"></label>' +
            '<label>Spe stage<select data-slot-field="speedStage">' + stageOptions(slot.speedStage) + '</select></label>' +
            '<label>Status<select data-slot-field="status">' + options(["Healthy","Burned","Paralyzed","Poisoned","Badly Poisoned","Asleep","Frozen"], slot.status) + '</select></label></div>' +
            '<details><summary>Persistent state</summary><div class="dp-state-grid">' +
            '<label><input type="checkbox" data-slot-field="tormented"' + (slot.tormented ? " checked" : "") + '> Tormented</label>' +
            '<label>Last move<input data-slot-field="lastMove" value="' + attr(slot.lastMove) + '"></label>' +
            '<label>Encore<input data-slot-field="encoreMove" value="' + attr(slot.encoreMove) + '"></label>' +
            '<label>Encore turns<input type="number" min="0" max="8" data-slot-field="encoreTurns" value="' + slot.encoreTurns + '"></label>' +
            '<label>Disabled<input data-slot-field="disabledMove" value="' + attr(slot.disabledMove) + '"></label>' +
            '<label>Disable turns<input type="number" min="0" max="8" data-slot-field="disableTurns" value="' + slot.disableTurns + '"></label>' +
            '<label>Protect chain<input type="number" min="0" max="8" data-slot-field="protectChain" value="' + slot.protectChain + '"></label>' +
            '<label>Choice lock<input data-slot-field="choiceLockedMove" value="' + attr(slot.choiceLockedMove) + '"></label>' +
            '<label>Atk stage<select data-slot-field="attackStage">' + stageOptions(slot.attackStage) + '</select></label>' +
            '<label>Def stage<select data-slot-field="defenseStage">' + stageOptions(slot.defenseStage) + '</select></label>' +
            '<label>SpA stage<select data-slot-field="spaStage">' + stageOptions(slot.spaStage) + '</select></label>' +
            '<label>SpD stage<select data-slot-field="spdStage">' + stageOptions(slot.spdStage) + '</select></label>' +
            '<label class="dp-span-2">Notes<input data-slot-field="notes" value="' + attr(slot.notes) + '"></label>' +
            '</div></details>' + legalityWarnings(slot) + '</article>';
    }

    function legalityWarnings(slot) {
        const warnings = [];
        if (slot.tormented && slot.lastMove) warnings.push("Torment: cannot repeat " + slot.lastMove);
        if (slot.encoreTurns > 0 && slot.encoreMove) warnings.push("Encore " + slot.encoreMove + " · " + slot.encoreTurns + " turn(s)");
        if (slot.disableTurns > 0 && slot.disabledMove) warnings.push("Disabled " + slot.disabledMove + " · " + slot.disableTurns + " turn(s)");
        if (slot.choiceLockedMove) warnings.push("Choice locked: " + slot.choiceLockedMove);
        if (!warnings.length) return "";
        return '<div class="dp-warnings">' + warnings.map(w => '<span>' + escapeHtml(w) + '</span>').join("") + '</div>';
    }

    function renderSnapshots() {
        const snapshots = state.board.snapshots || [];
        if (!snapshots.length) return "";
        return '<div class="dp-snapshots"><h4>Saved states</h4>' + snapshots.slice().reverse().map((snap, index) =>
            '<button type="button" data-dp-action="restore-snapshot" data-snapshot-index="' + (snapshots.length - 1 - index) + '">' +
            'Turn ' + snap.turn + '<small>' + escapeHtml(snap.label || "") + '</small></button>'
        ).join("") + '</div>';
    }

    function fieldSelect(field, label, values, selected) {
        return '<label>' + label + '<select data-board-field="' + field + '">' + options(values, selected) + '</select></label>';
    }

    function numberField(field, label, value, min, max) {
        return '<label>' + label + '<input type="number" min="' + min + '" max="' + max + '" data-board-field="' + field + '" value="' + value + '"></label>';
    }

    function options(values, selected) {
        return values.map(value => '<option value="' + attr(value) + '"' + (String(value) === String(selected) ? " selected" : "") + '>' + escapeHtml(value) + '</option>').join("");
    }

    function stageOptions(selected) {
        const values = [6,5,4,3,2,1,0,-1,-2,-3,-4,-5,-6];
        return values.map(value => '<option value="' + value + '"' + (Number(selected) === value ? " selected" : "") + '>' + (value > 0 ? "+" + value : value) + '</option>').join("");
    }

    function effectiveSpeed(slotId, slot) {
        const mon = getCombatant(slotId, slot.monId);
        const importedSpeed = mon && mon.calcData ? safeNumber(mon.calcData.speed, 0, 0, 9999) : 0;
        let speed = safeNumber(slot.speed, importedSpeed, 0, 9999);
        if (speed === 0 && importedSpeed > 0) speed = importedSpeed;
        const stage = safeNumber(slot.speedStage, 0, -6, 6);
        speed = stage >= 0 ? Math.floor(speed * (2 + stage) / 2) : Math.floor(speed * 2 / (2 - stage));
        if (slot.status === "Paralyzed") {
            speed = Math.floor(speed * (state.game.generation && state.game.generation >= 7 ? 0.5 : 0.25));
        }
        const playerSide = slotId.startsWith("player");
        const tailwind = playerSide ? state.board.playerTailwindTurns : state.board.enemyTailwindTurns;
        if (tailwind > 0) speed *= 2;
        return speed;
    }

    function computeSpeedOrder() {
        const rows = ACTIVE_SLOTS.map(slotId => {
            const slot = state.board.slots[slotId];
            if (!slot || !slot.monId) return null;
            const mon = getCombatant(slotId, slot.monId);
            if (!mon) return null;
            return { slotId, label: mon.nickname || mon.name, speed: effectiveSpeed(slotId, slot) };
        }).filter(Boolean);
        rows.sort((a, b) => state.board.trickRoomTurns > 0 ? a.speed - b.speed : b.speed - a.speed);
        return rows;
    }

    function buildCalcPokemon(mon, slot) {
        if (!mon || typeof window.calc !== "object" || typeof window.calc.Pokemon !== "function") return null;
        const data = mon.calcData || {};
        const generation = typeof window.gen === "number" ? window.gen : (state.game.generation || 5);
        const moveData = Array.isArray(data.moves) && data.moves.length ? data.moves : (mon.moves || []).map(name => ({name:name}));
        const moves = moveData.slice(0,4).map(move => {
            const name = move && move.name || "(No Move)";
            const overrides = {};
            if (move && Number(move.basePower) > 0) overrides.basePower = Number(move.basePower);
            if (move && move.type) overrides.type = move.type;
            if (move && move.category) overrides.category = move.category;
            return new window.calc.Move(generation, name, {
                ability: mon.ability || data.ability || "",
                item: mon.item || data.item || "",
                species: mon.name,
                overrides: Object.keys(overrides).length ? overrides : undefined
            });
        });
        while (moves.length < 4) moves.push(new window.calc.Move(generation, "(No Move)"));

        const boosts = Object.assign({}, data.boosts || {});
        boosts.atk = safeNumber(slot && slot.attackStage, boosts.atk || 0, -6, 6);
        boosts.def = safeNumber(slot && slot.defenseStage, boosts.def || 0, -6, 6);
        boosts.spa = safeNumber(slot && slot.spaStage, boosts.spa || 0, -6, 6);
        boosts.spd = safeNumber(slot && slot.spdStage, boosts.spd || 0, -6, 6);
        boosts.spe = safeNumber(slot && slot.speedStage, boosts.spe || 0, -6, 6);

        const statusMap = { Burned:"brn", Paralyzed:"par", Poisoned:"psn", "Badly Poisoned":"tox", Asleep:"slp", Frozen:"frz", Healthy:"" };
        const overrides = {};
        if (data.baseStats) overrides.baseStats = Object.assign({}, data.baseStats);
        if (data.types && data.types.length) overrides.types = data.types.slice(0,2);

        return new window.calc.Pokemon(generation, data.name || mon.name, {
            level: mon.level || data.level || 50,
            ability: mon.ability || data.ability || "",
            abilityOn: true,
            item: mon.item || data.item || "",
            gender: data.gender || "N",
            nature: mon.nature || data.nature || undefined,
            ivs: Object.assign({}, data.ivs || {}),
            evs: Object.assign({}, data.evs || {}),
            boosts: boosts,
            status: statusMap[slot && slot.status || "Healthy"] || "",
            moves: moves,
            overrides: Object.keys(overrides).length ? overrides : undefined
        });
    }

    function plannerField(attackerSlotId) {
        if (typeof window.calc !== "object" || typeof window.calc.Field !== "function") return null;
        const playerAttacking = attackerSlotId.startsWith("player");
        const ownTailwind = playerAttacking ? state.board.playerTailwindTurns : state.board.enemyTailwindTurns;
        const foeTailwind = playerAttacking ? state.board.enemyTailwindTurns : state.board.playerTailwindTurns;
        const weather = state.board.weather && state.board.weather !== "None" ? state.board.weather : undefined;
        const terrain = state.board.terrain && state.board.terrain !== "None" ? state.board.terrain : undefined;
        return new window.calc.Field({
            gameType: "Doubles",
            weather: weather,
            terrain: terrain,
            attackerSide: { isTailwind: ownTailwind > 0 },
            defenderSide: { isTailwind: foeTailwind > 0 }
        });
    }

    function moveIsSpread(move) {
        if (!move) return false;
        const spreadTargets = ["allAdjacent","allAdjacentFoes","all"];
        if (spreadTargets.includes(move.target)) return true;
        const known = ["Surf","Earthquake","Rock Slide","Heat Wave","Discharge","Blizzard","Muddy Water","Sludge Wave","Lava Plume","Bulldoze","Razor Leaf","Air Cutter","Swift","Hyper Voice","Icy Wind"];
        return known.includes(move.originalName || move.name);
    }

    function calculatePlannerDamage(attackerEntry, defenderEntry, moveIndex) {
        try {
            if (!attackerEntry || !defenderEntry || !attackerEntry.mon || !defenderEntry.mon) return null;
            const attacker = buildCalcPokemon(attackerEntry.mon, attackerEntry.slot);
            const defender = buildCalcPokemon(defenderEntry.mon, defenderEntry.slot);
            if (!attacker || !defender) return null;
            const move = attacker.moves[moveIndex];
            if (!move || move.name === "(No Move)") return null;

            const defenderWideGuard = defenderEntry.slotId.startsWith("player") ? state.board.playerWideGuard : state.board.enemyWideGuard;
            if (defenderWideGuard && moveIsSpread(move)) {
                return { min:0, max:0, defenderHp:defender.maxHP(), blocked:"Wide Guard", move:move };
            }

            const damageGen = window.settings && Number(window.settings.damageGen) || state.game.generation || 5;
            const field = plannerField(attackerEntry.slotId);
            const result = window.calc.calculate(damageGen, attacker, defender, move, field);
            const range = result && typeof result.range === "function" ? result.range() : null;
            if (!range || !Number.isFinite(Number(range[0])) || !Number.isFinite(Number(range[1]))) return null;
            return {
                min: Number(range[0]),
                max: Number(range[1]),
                defenderHp: defender.maxHP(),
                move: move,
                spread: moveIsSpread(move)
            };
        } catch (error) {
            console.warn("Planner damage calculation failed", error);
            return null;
        }
    }

    function formatDamageCell(result) {
        if (!result) return "—";
        if (result.blocked) return result.blocked;
        const minPct = result.defenderHp ? (result.min * 100 / result.defenderHp) : 0;
        const maxPct = result.defenderHp ? (result.max * 100 / result.defenderHp) : 0;
        return result.min + "–" + result.max + " (" + minPct.toFixed(1) + "–" + maxPct.toFixed(1) + "%)" + (result.spread ? " spread" : "");
    }

    function combineDamageRanges(a, b) {
        if (!a || !b) return null;
        return {
            min: a.min + b.min,
            max: a.max + b.max,
            defenderHp: a.defenderHp || b.defenderHp
        };
    }

    function getSelectedBattle() {
        return state.battles.find(b => b.id === state.selectedBattleId) || null;
    }

    function addMon() {
        if (state.team.length >= MAX_TEAM) return;
        state.team.push(normalizeMon({ name: "Pokemon " + (state.team.length + 1) }));
        render();
    }

    function editMon(id) {
        const mon = getMon(id);
        if (!mon) return;
        const name = prompt("Species", mon.name);
        if (name === null) return;
        const nickname = prompt("Nickname (optional)", mon.nickname || "");
        if (nickname === null) return;
        const level = prompt("Level", mon.level);
        if (level === null) return;
        const item = prompt("Held item", mon.item || "");
        if (item === null) return;
        const ability = prompt("Ability", mon.ability || "");
        if (ability === null) return;
        const moves = prompt("Moves, comma separated", (mon.moves || []).filter(Boolean).join(", "));
        if (moves === null) return;
        mon.name = name.trim() || mon.name;
        mon.nickname = nickname.trim();
        mon.level = safeNumber(level, mon.level, 1, 100);
        mon.item = item.trim();
        mon.ability = ability.trim();
        mon.moves = moves.split(",").map(x => x.trim()).filter(Boolean).slice(0, 4);
        while (mon.moves.length < 4) mon.moves.push("");
        render();
    }

    function captureCalculatorPokemon(selector) {
        if (typeof window.createPokemon !== "function" || typeof window.$ !== "function") return null;
        try {
            const poke = window.createPokemon(window.$(selector));
            if (!poke) return null;
            const moves = (poke.moves || []).slice(0,4).map(move => ({
                name: move.originalName || move.name || "",
                basePower: Number(move.bp || move.basePower || 0),
                type: move.type || "",
                category: move.category || "",
                priority: Number(move.priority || 0),
                target: move.target || "",
                isCrit: !!move.isCrit
            }));
            return {
                name: poke.name,
                level: poke.level,
                item: poke.item || "",
                ability: poke.ability || "",
                nature: poke.nature || "",
                gender: poke.gender || "N",
                ivs: Object.assign({}, poke.ivs || {}),
                evs: Object.assign({}, poke.evs || {}),
                boosts: Object.assign({}, poke.boosts || {}),
                baseStats: poke.species && poke.species.baseStats ? Object.assign({}, poke.species.baseStats) : null,
                types: Array.isArray(poke.types) ? poke.types.slice(0,2) : [],
                speed: poke.stats && Number.isFinite(Number(poke.stats.spe)) ? Number(poke.stats.spe) : 0,
                moves: moves
            };
        } catch (error) {
            console.warn("Planner import failed", error);
            return null;
        }
    }

    function importedMonFromCalc(selector) {
        const data = captureCalculatorPokemon(selector);
        if (!data) return null;
        return normalizeMon({
            name: data.name || "Pokemon",
            level: data.level || 50,
            item: data.item,
            ability: data.ability,
            nature: data.nature,
            moves: data.moves.map(move => move.name),
            calcData: data
        });
    }

    function importCurrentCalcMon() {
        if (state.team.length >= MAX_TEAM) {
            alert("Your planner team already has six Pokémon.");
            return;
        }
        const mon = importedMonFromCalc("#p1");
        if (!mon) {
            alert("Could not read the current player Pokémon from Dynamic Calc.");
            return;
        }
        state.team.push(mon);
        render();
    }

    function importCurrentOpponent() {
        const battle = getSelectedBattle();
        if (!battle) {
            alert("Add or select a battle first.");
            return;
        }
        battle.enemies = Array.isArray(battle.enemies) ? battle.enemies : [];
        const mon = importedMonFromCalc("#p2");
        if (!mon) {
            alert("Could not read the current opponent from Dynamic Calc.");
            return;
        }
        battle.enemies.push(mon);
        render();
    }

    function addBattle() {
        const battle = {
            id: uid("battle"),
            name: "Elite Four " + (state.battles.length + 1),
            format: "Doubles",
            status: "Unplanned",
            winCondition: "",
            notes: "",
            enemies: [],
            board: null
        };
        state.battles.push(battle);
        state.selectedBattleId = battle.id;
        render();
    }

    function loadBattleBoard() {
        const battle = getSelectedBattle();
        if (!battle) return;
        if (battle.board) {
            state.board = clone(battle.board);
        }
        render();
    }

    function saveBattleBoard() {
        const battle = getSelectedBattle();
        if (battle) battle.board = clone(state.board);
    }

    function advanceTurn(delta) {
        state.board.turn = Math.max(1, state.board.turn + delta);
        if (delta > 0) {
            ["trickRoomTurns","playerTailwindTurns","enemyTailwindTurns"].forEach(key => {
                state.board[key] = Math.max(0, safeNumber(state.board[key], 0, 0, 99) - 1);
            });
            ACTIVE_SLOTS.forEach(slotId => {
                const slot = state.board.slots[slotId];
                if (!slot) return;
                slot.encoreTurns = Math.max(0, safeNumber(slot.encoreTurns, 0, 0, 99) - 1);
                slot.disableTurns = Math.max(0, safeNumber(slot.disableTurns, 0, 0, 99) - 1);
                if (!slot.encoreTurns) slot.encoreMove = "";
                if (!slot.disableTurns) slot.disabledMove = "";
            });
        }
        saveBattleBoard();
        render();
    }

    function snapshotBoard() {
        state.board.snapshots = state.board.snapshots || [];
        const copy = clone(state.board);
        delete copy.snapshots;
        copy.label = state.board.turnNotes || "";
        state.board.snapshots.push(copy);
        if (state.board.snapshots.length > 20) state.board.snapshots.shift();
        saveBattleBoard();
        render();
    }

    function exportPlan() {
        syncGameMetadata();
        const blob = new Blob([JSON.stringify(state, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (state.game.title || "pokemon").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + "-team-plan.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function importPlanFile(file) {
        const reader = new FileReader();
        reader.onload = function () {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.team) || !Array.isArray(parsed.battles)) {
                    throw new Error("Unsupported planner file.");
                }
                state = Object.assign(clone(DEFAULT_STATE), parsed);
                render();
            } catch (error) {
                alert("Could not import plan: " + error.message);
            }
        };
        reader.readAsText(file);
    }

    function wireEvents(root) {
        if (root.dataset.dpWired === "1") return;
        root.dataset.dpWired = "1";
        root.addEventListener("click", onClick);
        root.addEventListener("change", onChange);
        root.addEventListener("input", onInput);
    }

    function onClick(event) {
        const button = event.target.closest("[data-dp-action]");
        if (!button) return;
        const action = button.dataset.dpAction;
        if (action === "add-mon") addMon();
        else if (action === "edit-mon") editMon(button.dataset.monId);
        else if (action === "remove-mon") {
            state.team = state.team.filter(mon => mon.id !== button.dataset.monId);
            ACTIVE_SLOTS.forEach(slotId => {
                if (state.board.slots[slotId] && state.board.slots[slotId].monId === button.dataset.monId) state.board.slots[slotId].monId = "";
            });
            render();
        } else if (action === "import-current") importCurrentCalcMon();
        else if (action === "add-battle") addBattle();
        else if (action === "select-battle") { state.selectedBattleId = button.dataset.battleId; render(); }
        else if (action === "remove-battle") {
            state.battles = state.battles.filter(b => b.id !== state.selectedBattleId);
            state.selectedBattleId = state.battles[0] ? state.battles[0].id : null;
            render();
        } else if (action === "load-battle-board") loadBattleBoard();
        else if (action === "prev-turn") advanceTurn(-1);
        else if (action === "next-turn") advanceTurn(1);
        else if (action === "snapshot") snapshotBoard();
        else if (action === "restore-snapshot") {
            const snap = state.board.snapshots && state.board.snapshots[Number(button.dataset.snapshotIndex)];
            if (snap) {
                const snapshots = state.board.snapshots;
                state.board = clone(snap);
                state.board.snapshots = snapshots;
                render();
            }
        } else if (action === "clear-board") {
            const snapshots = state.board.snapshots || [];
            state.board = clone(DEFAULT_STATE.board);
            state.board.snapshots = snapshots;
            saveBattleBoard();
            render();
        } else if (action === "export") exportPlan();
        else if (action === "import") document.getElementById("doubles-planner-import-file").click();
        else if (action === "reset" && confirm("Reset the entire team and battle plan?")) {
            state = clone(DEFAULT_STATE);
            render();
        }
    }

    function onChange(event) {
        if (event.target.id === "doubles-planner-import-file" && event.target.files[0]) {
            importPlanFile(event.target.files[0]);
            return;
        }
        updateFromControl(event.target);
    }

    function onInput(event) {
        if (event.target.matches("textarea, input[type=text], input:not([type])")) updateFromControl(event.target);
    }

    function updateFromControl(control) {
        if (control.dataset.monId && control.dataset.field) {
            const mon = getMon(control.dataset.monId);
            if (!mon) return;
            mon[control.dataset.field] = control.type === "checkbox" ? control.checked : control.value;
            saveState();
            return;
        }
        if (control.dataset.battleField) {
            const battle = getSelectedBattle();
            if (!battle) return;
            battle[control.dataset.battleField] = control.value;
            saveState();
            return;
        }
        if (control.dataset.actionField) {
            state.board.actions = state.board.actions || { playerLeftMove: 0, playerRightMove: 0, target: "enemy-left" };
            state.board.actions[control.dataset.actionField] = control.dataset.actionField === "target" ? control.value : Number(control.value);
            saveBattleBoard();
            render();
            return;
        }
        if (control.dataset.boardField) {
            const field = control.dataset.boardField;
            state.board[field] = control.type === "checkbox" ? control.checked : control.type === "number" ? safeNumber(control.value, 0, 0, 9999) : control.value;
            saveBattleBoard();
            if (field !== "turnNotes") render();
            else saveState();
            return;
        }
        if (control.dataset.slotField) {
            const card = control.closest("[data-slot-id]");
            if (!card) return;
            const slotId = card.dataset.slotId;
            state.board.slots[slotId] = Object.assign(emptyVolatile(), state.board.slots[slotId] || {});
            const slot = state.board.slots[slotId];
            const field = control.dataset.slotField;
            if (control.type === "checkbox") slot[field] = control.checked;
            else if (control.type === "number" || ["speedStage","attackStage","defenseStage","spaStage","spdStage"].includes(field)) slot[field] = Number(control.value);
            else slot[field] = control.value;
            if (field === "monId") {
                const selected = getCombatant(slotId, slot.monId);
                const importedSpeed = selected && selected.calcData ? safeNumber(selected.calcData.speed, 0, 0, 9999) : 0;
                if (importedSpeed > 0) slot.speed = importedSpeed;
            }
            saveBattleBoard();
            if (["monId","speed","speedStage","status","tormented","lastMove","encoreMove","encoreTurns","disabledMove","disableTurns","choiceLockedMove"].includes(field)) render();
            else saveState();
        }
    }

    function ensureView() {
        if (document.getElementById("doubles-planner-view")) return;
        const view = document.createElement("div");
        view.id = "doubles-planner-view";
        view.className = "main-page-view";
        view.style.display = "none";
        const anchor = document.getElementById("box-view") || document.getElementById("fragsheet-shell");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(view, anchor);
        else document.body.appendChild(view);
    }

    function init() {
        if (initialized) return;
        initialized = true;
        ensureView();
        render();
        window.renderDoublesPlanner = render;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function attr(value) {
        return escapeHtml(value).replace(/'/g, "&#39;");
    }

    window.initializeDoublesPlanner = init;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
