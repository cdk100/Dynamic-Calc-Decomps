describe('Team and doubles planner', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.viewport(1440, 1000)
    cy.visit('./index.html?data=9aa37533b7c000992d92&gen=5&types=5&view=planner')
  })

  it('loads as a first-class main view', () => {
    cy.get('.main-view-tab[data-view="planner"]').should('exist').and('have.class', 'active')
    cy.get('#doubles-planner-view').should('be.visible')
    cy.contains('Team & Doubles Planner').should('be.visible')
    cy.contains('Doubles state lab').should('be.visible')
  })

  it('persists a team and boss sequence', () => {
    cy.contains('button', '+ Pokémon').click()
    cy.get('.dp-mon-card').should('have.length', 1)

    cy.contains('button', '+ Battle').click()
    cy.get('.dp-battle-row').should('have.length', 1)
    cy.get('[data-battle-field="name"]').clear().type('Shauntal')
    cy.get('[data-battle-field="status"]').select('Draft')

    cy.reload()
    cy.get('.dp-mon-card').should('have.length', 1)
    cy.get('.dp-battle-row').should('contain.text', 'Shauntal').and('contain.text', 'Draft')
  })

  it('tracks doubles turn state and duration counters', () => {
    cy.contains('button', '+ Pokémon').click()
    cy.contains('button', '+ Pokémon').click()

    cy.get('[data-slot-id="player-left"] [data-slot-field="monId"]').select(1)
    cy.get('[data-slot-id="player-left"] [data-slot-field="speed"]').clear().type('120')
    cy.get('[data-slot-id="player-left"] [data-slot-field="tormented"]').check()
    cy.get('[data-slot-id="player-left"] [data-slot-field="lastMove"]').clear().type('Aura Sphere')
    cy.get('[data-slot-id="player-left"] [data-slot-field="encoreMove"]').clear().type('Protect')
    cy.get('[data-slot-id="player-left"] [data-slot-field="encoreTurns"]').clear().type('2')
    cy.get('[data-board-field="playerTailwindTurns"]').clear().type('2')

    cy.contains('Torment: cannot repeat Aura Sphere').should('be.visible')
    cy.contains('Encore Protect · 2 turn(s)').should('be.visible')
    cy.contains('button', '+').click()

    cy.contains('Turn 2').should('be.visible')
    cy.get('[data-board-field="playerTailwindTurns"]').should('have.value', '1')
    cy.get('[data-slot-id="player-left"] [data-slot-field="encoreTurns"]').should('have.value', '1')
  })

  it('imports calculator combatants and renders live damage ranges', () => {
    cy.get('#p1 .set-selector').should(($input) => {
      expect(String($input.val() || '').length).to.be.greaterThan(0)
    })
    cy.get('#p2 .set-selector').should(($input) => {
      expect(String($input.val() || '').length).to.be.greaterThan(0)
    })

    cy.get('.main-view-tab[data-view="planner"]').click()
    cy.contains('button', 'Import current player').click()
    cy.contains('button', '+ Battle').click()
    cy.contains('button', 'Import current opponent').click()

    cy.get('[data-slot-id="player-left"] [data-slot-field="monId"]').select(1)
    cy.get('[data-slot-id="enemy-left"] [data-slot-field="monId"]').select(1)

    cy.get('.dp-damage-lab').should('be.visible')
    cy.get('.dp-damage-cell strong').first().invoke('text').should('match', /\d+.*\d+.*%/)
  })

  it('projects a turn and can reset the turn state', () => {
    cy.contains('button', '+ Pokémon').click()
    cy.contains('button', '+ Battle').click()

    cy.get('[data-slot-id="player-left"] [data-slot-field="monId"]').select(1)
    cy.get('[data-action-slot="player-left"] [data-turn-action-field="action"]').select('Protect / Detect')
    cy.contains('button', 'Project turn').click()
    cy.contains('Projected Turn 1').should('be.visible')
    cy.contains('uses Protect / Detect').should('be.visible')

    cy.contains('button', 'Reset turn').first().click()
    cy.get('.dp-projection').should('not.exist')
    cy.get('[data-action-slot="player-left"] [data-turn-action-field="action"]').should('have.value', 'none')
  })

  it('reuses the normal calculator save and trainer data flows', () => {
    cy.get('[data-dp-action="read-save"]').should('contain.text', 'Read .sav')
    cy.get('[data-dp-action="sync-game"]').should('contain.text', 'Sync party + trainer')

    cy.window().then((win) => {
      win.currentParty = []
      win.localStorage.currentParty = ''
      expect(win.document.getElementById('read-save')).to.exist
      expect(
        win.document.getElementById('save-upload-g45') ||
        win.document.getElementById('save-upload')
      ).to.exist
    })
  })

  it('exports planner state as portable JSON', () => {
    cy.contains('button', '+ Pokémon').click()
    cy.window().then((win) => {
      cy.stub(win.URL, 'createObjectURL').returns('blob:test')
      cy.stub(win.URL, 'revokeObjectURL')
    })
    cy.get('[data-dp-action="export"]').click()
    cy.window().its('URL.createObjectURL').should('have.been.called')
  })
})
