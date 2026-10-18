(function () {
    "use strict";

    const STORAGE_KEY = "dynamicCalcDoublesWorkspaceV1";
    let initialized = false;
    let state = loadState();

    function loadState() {
        try {
            return Object.assign({ player2: "", enemy2: "", doubleTarget: "enemy1" }, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
        } catch (_) {
            return { player2: "", enemy2: "", doubleTarget: "enemy1" };
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function cleanSetId(value) {
        return String(value || "").replace(/\[\d+\]$/, "");
    }

    function currentPrimarySet(side) {
        const selector = document.querySelector(side === "player" ? "#p1 .set-selector" : "#p2 .set-selector");
        return selector ? cleanSetId(selector.value) : "";
    }

    function partySetIds() {
        const ids = [];
        document.querySelectorAll(".player-party .trainer-pok[data-id]").forEach(node => {
            const id = cleanSetId(node.getAttribute("data-id"));
            if (id && !ids.includes(id)) ids.push(id);
        });
        if (!ids.length && Array.isArray(window.currentParty)) {
            window.currentParty.slice(0, 6).forEach(species => {
                const id = cleanSetId(species + " (My Box)");
                if (!ids.includes(id)) ids.push(id);
            });
        }
        return ids;
    }

    function enemySetIds() {
        const ids = [];
        if (Array.isArray(window.CURRENT_TRAINER_POKS)) {
            window.CURRENT_TRAINER_POKS.forEach(raw => {
                const id = cleanSetId(raw);
                if (id && !ids.includes(id)) ids.push(id);
            });
        }
        if (!ids.length) {
            document.querySelectorAll(".opposing.trainer-pok-list .trainer-pok[data-id]").forEach(node => {
                const id = cleanSetId(node.getAttribute("data-id"));
                if (id && !ids.includes(id)) ids.push(id);
            });
        }
        return ids;
    }

    function chooseDefaultSecondary(options, primary, saved) {
        if (saved && options.includes(saved) && saved !== primary) return saved;
        return options.find(id => id !== primary) || options[0] || "";
    }

    function createSetPokemon(setId) {
        if (!setId || typeof window.createPokemon !== "function") return null;
        try {
            return window.createPokemon(cleanSetId(setId));
        } catch (error) {
            console.warn("[Doubles] Could not create set", setId, error);
            return null;
        }
    }

    function primaryPokemon(side) {
        if (typeof window.createPokemon !== "function" || typeof window.$ !== "function") return null;
        try {
            return window.createPokemon(window.$(side === "player" ? "#p1" : "#p2"));
        } catch (_) {
            return null;
        }
    }

    function getFieldFor(attackerSide) {
        if (typeof window.createField !== "function") return null;
        const base = window.createField();
        base.gameType = "Doubles";
        return attackerSide === "player" ? base : base.clone().swap();
    }

    function calculateMoves(attacker, defender, field) {
        if (!attacker || !defender || !field || !window.calc || typeof window.calc.calculate !== "function") return [];
        const damageGen = window.settings && Number(window.settings.damageGen) || window.gameGen || 5;
        return (attacker.moves || []).slice(0, 4).map(move => {
            if (!move || move.name === "(No Move)") return null;
            try {
                const result = window.calc.calculate(damageGen, attacker.clone(), defender.clone(), move.clone ? move.clone() : move, field.clone ? field.clone() : field);
                return result;
            } catch (error) {
                console.warn("[Doubles] Calc failed", error);
                return null;
            }
        });
    }

    function resultText(result) {
        if (!result) return "—";
        try {
            if (typeof result.moveDesc === "function") {
                return result.moveDesc(typeof window.notation !== "undefined" ? window.notation : "%");
            }
        } catch (_) {}
        try {
            const range = result.range();
            const hp = result.defender.maxHP();
            return range[0] + " - " + range[1] + " (" + (range[0] * 100 / hp).toFixed(1) + " - " + (range[1] * 100 / hp).toFixed(1) + "%)";
        } catch (_) {
            return "—";
        }
    }

    function bestDamage(result) {
        if (!result) return 0;
        try {
            const range = result.range();
            return Number(range[1]) || 0;
        } catch (_) {
            return 0;
        }
    }

    function getSpeed(mon, resultMon, fieldSide) {
        if (!mon) return 0;
        if (typeof window.getBoxMatchupSpeed === "function") {
            return window.getBoxMatchupSpeed(mon, resultMon || mon, fieldSide);
        }
        return Number(mon.stats && mon.stats.spe) || Number(mon.rawStats && mon.rawStats.spe) || 0;
    }

    function formatName(mon, fallback) {
        return mon && mon.name ? mon.name : fallback;
    }

    function optionHtml(values, selected) {
        if (!values.length) return '<option value="">No available Pokémon</option>';
        return values.map(id => '<option value="' + escapeAttr(id) + '"' + (id === selected ? ' selected' : '') + '>' + escapeHtml(id) + '</option>').join("");
    }

    function render() {
        const root = document.getElementById("doubles-workspace");
        if (!root) return;
        const isDoubles = !!document.getElementById("doubles-format")?.checked;
        root.hidden = !isDoubles;
        if (!isDoubles) return;

        const player1Id = currentPrimarySet("player");
        const enemy1Id = currentPrimarySet("enemy");
        const playerOptions = partySetIds();
        const enemyOptions = enemySetIds();

        state.player2 = chooseDefaultSecondary(playerOptions, player1Id, state.player2);
        state.enemy2 = chooseDefaultSecondary(enemyOptions, enemy1Id, state.enemy2);
        saveState();

        const p1 = primaryPokemon("player");
        const e1 = primaryPokemon("enemy");
        const p2 = createSetPokemon(state.player2);
        const e2 = createSetPokemon(state.enemy2);

        const playerField = getFieldFor("player");
        const enemyField = getFieldFor("enemy");

        const pairs = [
            { key: "p1e1", a: p1, d: e1, field: playerField, label: "P1 → E1" },
            { key: "p1e2", a: p1, d: e2, field: playerField, label: "P1 → E2" },
            { key: "p2e1", a: p2, d: e1, field: playerField, label: "P2 → E1" },
            { key: "p2e2", a: p2, d: e2, field: playerField, label: "P2 → E2" },
            { key: "e1p1", a: e1, d: p1, field: enemyField, label: "E1 → P1" },
            { key: "e1p2", a: e1, d: p2, field: enemyField, label: "E1 → P2" },
            { key: "e2p1", a: e2, d: p1, field: enemyField, label: "E2 → P1" },
            { key: "e2p2", a: e2, d: p2, field: enemyField, label: "E2 → P2" }
        ];

        const results = {};
        pairs.forEach(pair => { results[pair.key] = calculateMoves(pair.a, pair.d, pair.field); });

        const speedEntries = [
            { label: "P1 " + formatName(p1, "—"), speed: getSpeed(p1, results.p1e1[0] && results.p1e1[0].attacker, playerField && playerField.attackerSide) },
            { label: "P2 " + formatName(p2, "—"), speed: getSpeed(p2, results.p2e1[0] && results.p2e1[0].attacker, playerField && playerField.attackerSide) },
            { label: "E1 " + formatName(e1, "—"), speed: getSpeed(e1, results.e1p1[0] && results.e1p1[0].attacker, enemyField && enemyField.attackerSide) },
            { label: "E2 " + formatName(e2, "—"), speed: getSpeed(e2, results.e2p1[0] && results.e2p1[0].attacker, enemyField && enemyField.attackerSide) }
        ].filter(x => x.speed > 0);

        const trickRoom = !!document.getElementById("trickroom")?.checked;
        speedEntries.sort((a,b) => trickRoom ? a.speed - b.speed : b.speed - a.speed);

        root.innerHTML =
            '<div class="dw-head">' +
                '<div><strong>Doubles workspace</strong><span>Same calculator, second active slot added to each side.</span></div>' +
                '<button type="button" id="dw-reset">Reset doubles slots</button>' +
            '</div>' +
            '<div class="dw-slots">' +
                slotCard("Player 1", player1Id || formatName(p1, "Current left"), true, "") +
                slotCard("Player 2", state.player2, false, '<select id="dw-player2">' + optionHtml(playerOptions, state.player2) + '</select>') +
                slotCard("Enemy 1", enemy1Id || formatName(e1, "Current right"), true, "") +
                slotCard("Enemy 2", state.enemy2, false, '<select id="dw-enemy2">' + optionHtml(enemyOptions, state.enemy2) + '</select>') +
            '</div>' +
            '<div class="dw-speed"><span>Speed order</span>' + speedEntries.map((x,i) => '<b>' + (i+1) + '. ' + escapeHtml(x.label) + ' · ' + x.speed + '</b>').join('') + (trickRoom ? '<em>Trick Room</em>' : '') + '</div>' +
            '<div class="dw-matchups">' +
                matchupCard("Your attacks", [
                    matchupRow("P1 → E1", p1, results.p1e1),
                    matchupRow("P1 → E2", p1, results.p1e2),
                    matchupRow("P2 → E1", p2, results.p2e1),
                    matchupRow("P2 → E2", p2, results.p2e2)
                ]) +
                matchupCard("Enemy attacks", [
                    matchupRow("E1 → P1", e1, results.e1p1),
                    matchupRow("E1 → P2", e1, results.e1p2),
                    matchupRow("E2 → P1", e2, results.e2p1),
                    matchupRow("E2 → P2", e2, results.e2p2)
                ]) +
            '</div>' +
            renderDoubleUp(p1, p2, e1, e2, results);

        wireRenderedControls();
    }

    function slotCard(label, value, primary, control) {
        return '<div class="dw-slot' + (primary ? ' primary' : '') + '"><span>' + label + '</span><strong>' + escapeHtml(value || "—") + '</strong>' + control + '</div>';
    }

    function matchupCard(title, rows) {
        return '<section class="dw-matchup-card"><h4>' + escapeHtml(title) + '</h4>' + rows.join("") + '</section>';
    }

    function matchupRow(label, attacker, results) {
        if (!attacker) return '<div class="dw-matchup-row empty"><strong>' + escapeHtml(label) + '</strong><span>Choose a Pokémon</span></div>';
        const moves = (attacker.moves || []).slice(0,4);
        return '<div class="dw-matchup-row"><strong>' + escapeHtml(label) + '</strong><div>' +
            moves.map((move,i) => {
                const moveName = move && (move.originalName || move.name) || "—";
                return '<span><i>' + escapeHtml(moveName) + '</i><b>' + escapeHtml(resultText(results[i])) + '</b></span>';
            }).join("") +
            '</div></div>';
    }

    function renderDoubleUp(p1, p2, e1, e2, results) {
        if (!p1 || !p2 || (!e1 && !e2)) return "";
        const target = state.doubleTarget === "enemy2" ? e2 : e1;
        if (!target) return "";
        const leftResults = state.doubleTarget === "enemy2" ? results.p1e2 : results.p1e1;
        const rightResults = state.doubleTarget === "enemy2" ? results.p2e2 : results.p2e1;
        const p1Best = bestMoveIndex(leftResults);
        const p2Best = bestMoveIndex(rightResults);
        const r1 = leftResults[p1Best];
        const r2 = rightResults[p2Best];
        let combined = "—";
        if (r1 && r2) {
            try {
                const a = r1.range(), b = r2.range();
                const hp = r1.defender.maxHP();
                combined = (a[0] + b[0]) + " - " + (a[1] + b[1]) + " (" + ((a[0] + b[0]) * 100 / hp).toFixed(1) + " - " + ((a[1] + b[1]) * 100 / hp).toFixed(1) + "%)";
            } catch (_) {}
        }
        return '<div class="dw-double-up"><div><strong>Quick double-up</strong><span>Uses each active player Pokémon\'s strongest displayed move.</span></div>' +
            '<label>Target<select id="dw-double-target"><option value="enemy1"' + (state.doubleTarget === "enemy1" ? ' selected' : '') + '>Enemy 1</option><option value="enemy2"' + (state.doubleTarget === "enemy2" ? ' selected' : '') + '>Enemy 2</option></select></label>' +
            '<b>' + escapeHtml(combined) + '</b></div>';
    }

    function bestMoveIndex(results) {
        let best = 0, max = -1;
        (results || []).forEach((result,i) => {
            const dmg = bestDamage(result);
            if (dmg > max) { max = dmg; best = i; }
        });
        return best;
    }

    function wireRenderedControls() {
        const p2 = document.getElementById("dw-player2");
        if (p2) p2.addEventListener("change", () => { state.player2 = cleanSetId(p2.value); saveState(); render(); });
        const e2 = document.getElementById("dw-enemy2");
        if (e2) e2.addEventListener("change", () => { state.enemy2 = cleanSetId(e2.value); saveState(); render(); });
        const target = document.getElementById("dw-double-target");
        if (target) target.addEventListener("change", () => { state.doubleTarget = target.value; saveState(); render(); });
        const reset = document.getElementById("dw-reset");
        if (reset) reset.addEventListener("click", () => {
            state = { player2:"", enemy2:"", doubleTarget:"enemy1" };
            saveState();
            render();
        });
    }

    function install() {
        if (initialized) return;
        initialized = true;
        const resultGroup = document.querySelector(".move-result-group");
        if (!resultGroup) return;
        const root = document.createElement("section");
        root.id = "doubles-workspace";
        root.hidden = true;
        resultGroup.parentNode.insertBefore(root, resultGroup);

        document.addEventListener("change", event => {
            if (
                event.target.matches("#singles-format,#doubles-format,#p1 .set-selector,#p2 .set-selector,.field-info input,.field-info select,.calc-trigger")
            ) {
                window.setTimeout(render, 0);
            }
        });

        document.addEventListener("click", event => {
            if (event.target.closest(".player-party .trainer-pok,.opposing.trainer-pok-list .trainer-pok")) {
                window.setTimeout(render, 20);
            }
        });

        const observer = new MutationObserver(() => {
            if (document.getElementById("doubles-format")?.checked) window.setTimeout(render, 0);
        });
        const watch = document.querySelector(".player-party") || document.querySelector(".opposing.trainer-pok-list");
        if (watch) observer.observe(watch, {childList:true, subtree:true, attributes:true, attributeFilter:["data-id"]});

        render();
        window.refreshDoublesWorkspace = render;
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g,"&#39;");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
})();