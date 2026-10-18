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
            tags: []
        }, mon || {});
    }

    function getMon(id) {
        return state.team.find(mon => mon.id === id) || null;
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
            '<button type="button" data-dp-action="import-current">Import current calc mon</button>' +
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
                '<div class="dp-span-2 dp-card-actions"><button type="button" data-dp-action="load-battle-board">Load into board</button>' +
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
            '</div>' +
            '<div class="dp-speed-strip"><span class="dp-speed-label">Action speed</span>' +
            (speedOrder.length ? speedOrder.map((entry, i) => '<span class="dp-speed-chip">' + (i + 1) + ' · ' + escapeHtml(entry.label) + ' <strong>' + entry.speed + '</strong></span>').join("") : '<span class="dp-muted">Assign active Pokémon and speeds.</span>') +
            (b.trickRoomTurns > 0 ? '<span class="dp-warning">Trick Room active: slower acts first</span>' : '') +
            '</div>' +
            '<div class="dp-board-grid">' +
            renderSide("Your side", ["player-left","player-right"]) +
            renderSide("Opponent", ["enemy-left","enemy-right"]) +
            '</div>' +
            '<div class="dp-turn-notes">' +
            '<label>Turn / line notes<textarea data-board-field="turnNotes" placeholder="Example: Protect left + double target Chandelure; next turn Torment prevents repeat Aura Sphere.">' + escapeHtml(b.turnNotes || "") + '</textarea></label>' +
            '<div class="dp-card-actions"><button type="button" data-dp-action="snapshot">Save turn snapshot</button>' +
            '<button type="button" data-dp-action="clear-board">Clear board</button></div>' +
            '</div>' + renderSnapshots();
    }

    function renderSide(title, slotIds) {
        return '<div class="dp-side"><h4>' + title + '</h4>' + slotIds.map(renderSlot).join("") + '</div>';
    }

    function renderSlot(slotId) {
        const slot = Object.assign({ monId: "", label: slotId }, emptyVolatile(), state.board.slots[slotId] || {});
        const teamOptions = '<option value="">— Empty —</option>' + state.team.map(mon =>
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
        let speed = safeNumber(slot.speed, 0, 0, 9999);
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
            const mon = getMon(slot.monId);
            if (!mon) return null;
            return { slotId, label: mon.nickname || mon.name, speed: effectiveSpeed(slotId, slot) };
        }).filter(Boolean);
        rows.sort((a, b) => state.board.trickRoomTurns > 0 ? a.speed - b.speed : b.speed - a.speed);
        return rows;
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

    function importCurrentCalcMon() {
        const left = document.querySelector("#p1");
        if (!left) {
            alert("Calculator Pokémon panel was not found.");
            return;
        }
        const speciesSelect = left.querySelector(".set-selector");
        const levelInput = left.querySelector(".level");
        const itemSelect = left.querySelector(".item");
        const abilitySelect = left.querySelector(".ability");
        const moveSelects = Array.from(left.querySelectorAll(".move-selector")).slice(0, 4);
        const rawName = speciesSelect ? String(speciesSelect.value || "") : "";
        const species = rawName.split(" (")[0] || rawName || "Pokemon";
        if (state.team.length >= MAX_TEAM) {
            alert("Your planner team already has six Pokémon.");
            return;
        }
        state.team.push(normalizeMon({
            name: species,
            level: safeNumber(levelInput && levelInput.value, 50, 1, 100),
            item: itemSelect ? itemSelect.value : "",
            ability: abilitySelect ? abilitySelect.value : "",
            moves: moveSelects.map(el => el.value || "")
        }));
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
        if (control.dataset.boardField) {
            const field = control.dataset.boardField;
            state.board[field] = control.type === "number" ? safeNumber(control.value, 0, 0, 9999) : control.value;
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
