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
